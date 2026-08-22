'use strict'

// Frontera entre lo que actualiza el toolkit y lo que pertenece al proyecto.
// Es la fuente única: `check` reporta overrides contra esto y `upgrade` decide qué reemplaza.
//
// La regla es una carpeta, no un diff: nada fuera de esta declaración se toca jamás.

const fs = require('node:fs')
const path = require('node:path')

// Archivos de los que el toolkit es único autor. Un proyecto que necesite cambiarlos no los
// edita: agrega una regla propia junto a las de `system/`, que sí sobrevive al upgrade.
const SYSTEM_FILES = [
  'planning/PROTOCOL.md',
  'planning/FLOW.md',
  'planning/METHODOLOGY.md',
  'planning/README.md',
  'planning/adr/000-template.md',
  'planning/adr/README.md',
  'planning/business-rules/000-template.md',
  'planning/business-rules/README.md',
  'planning/rules/README.md',
  'planning/roadmap/README.md',
  'planning/roadmap/epic-000-template.md',
  // La guía de entrega no tiene una línea de la empresa: describe el camino que Cauce recomienda, y lo
  // que el proyecto declara vive en `delivery/project.md`, que sí es suyo. Sin declararla, cada mejora
  // de la guía se quedaba en el molde: una instancia conservaba para siempre la versión del día que se
  // creó, y `upgrade` informaba «todo lo propio quedó intacto» sobre algo que nunca fue propio.
  'planning/delivery/README.md',
  'planning/delivery/branches.md',
  'planning/delivery/release.md',
  'planning/delivery/environments.md',
  'planning/delivery/flags.md',
  'planning/delivery/multi-repo.md',
  'organization/roles/README.md',
  'teams/000-template.md',
  'teams/README.md',
  'automatization/README.md',
  'automatization/AGENTS.md',
  'integrations/README.md',
  'integrations/AGENTS.md',
  'organization/README.md',
  // Las reglas que un agente obedece y los atajos que envuelven al CLI. Ninguno tiene una línea de la
  // empresa, y envejecidos mienten: el `AGENTS.md` de una instancia seguía describiendo carpetas que
  // `upgrade` había retirado, y el Makefile envuelve comandos que cambian.
  'AGENTS.md',
  'Makefile',
  // El shim no tiene una línea de la empresa —dice él mismo que no se edita— y es por donde entra
  // cada comando. Sin declararlo, envejecía para siempre en la instancia.
  'tools/ops.js',
]

// Colecciones mixtas: el toolkit posee `<dir>/system/`, el proyecto todo lo demás del directorio.
const SYSTEM_COLLECTIONS = [
  'planning/adr',
  'planning/business-rules',
  'planning/rules',
]

// Copias del runtime: el proyecto las recibe para poder ejecutar sin red, pero no las escribe.
// Se reemplazan enteras. Mientras no tengan su propio `system/`, una edición local se detecta y
// se reporta antes de pisarla, nunca después.
const RUNTIME_PATHS = [
  'automatization/hooks',
]

// Dentro del paquete, lo que una instancia recibe en su raíz vive bajo `template/`; el catálogo,
// los equipos y la automatización están en la raíz del paquete, y el motor en `engine/`.
const TEMPLATE_PREFIXES = [
  'planning/',
  'organization/',
  'integrations/',
  'teams/',
  'automatization/',
  'tools/',
]

// Archivos que la instancia recibe en su raíz y que el paquete tiene por duplicado: el propio del
// toolkit y el de la plantilla. Gana el de la plantilla, que es el que le habla a la instancia.
const TEMPLATE_FILES = new Set(['AGENTS.md', 'Makefile'])

function sourceOf(relative) {
  if (TEMPLATE_FILES.has(relative)) return path.join('template', relative)
  // El runtime sale de la raíz del paquete aunque su prefijo sea de plantilla: `automatization/`
  // le entrega documentos a la instancia, pero los guards que ejecuta son los del toolkit.
  if (RUNTIME_PATHS.includes(relative)) return relative
  if (TEMPLATE_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
    return path.join('template', relative)
  }
  return relative
}

// Una ruta cualquiera del paquete: primero la dependencia npm, después el propio repositorio del
// toolkit corriendo sobre sí mismo. La usan los adaptadores de runner, los workflows y el motor
// mismo: el motor los consume, el proyecto no los materializa.
//
// Dos caminos, no tres. La copia vendorizada en `.ops/` se retiró en 0.10.0 — ahorraba un
// `package.json` a cambio de 5 MB en la historia de la empresa y de no poder enterarse de una versión
// nueva, y Node hace falta igual en los dos casos.
function packagePath(root, relative) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', relative),
    path.join(root, relative),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

// El modo declarado, o '' si no hay configuración. `toolkit` es este repositorio: acá se fabrica
// Cauce, así que los comandos que actualizan o instalan una instancia sólo pueden romper. Ausente e
// ilegible no son lo mismo —devolver '' ante un archivo roto dejaba correr contra el toolkit justo
// lo que reconocerlo impide—, así que lo segundo se levanta como error.
function mode(root) {
  const file = path.join(root, 'ops.config.json')
  if (!fs.existsSync(file)) return ''
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).mode || '' } catch (error) {
    throw new Error(`ops.config.json no se puede leer (${error.message}).`)
  }
}

// Dónde quedó el motor. El bridge de Antigravity repite esta cascada a mano porque corre antes de
// poder cargar este módulo: si cambia acá, cambia allá.
function engineAt(root, relative = '') {
  return packagePath(root, relative ? path.join('engine', relative) : 'engine')
}

// Definiciones que consume el motor —cargos y equipos— y que por eso viajan con el paquete en vez
// de copiarse. Se reconocen por contener `system/`, que es el espacio del toolkit y no algo que un
// proyecto deba crear. Una sola implementación para las dos, o divergen.
function packageDir(root, name) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', name),
    path.join(root, name),
  ]
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'system'))
    || fs.existsSync(path.join(dir, 'roles', 'system'))) || ''
}

// Identidad de una entrada dentro de una colección, para detectar que el proyecto sobrescribe
// algo del sistema. Las reglas y decisiones se identifican por su ID; el resto, por su nombre.
const ID_PATTERN = /^(?:BR-)?[A-Z][A-Z0-9]*-\d{3}/

function identity(name) {
  const base = name.replace(/\.md$/, '')
  const id = base.match(ID_PATTERN)
  return id ? id[0] : base
}

function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.name !== 'README.md' && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch { return [] }
}

function overrides(root) {
  const found = []
  for (const collection of SYSTEM_COLLECTIONS) {
    const dir = path.join(root, collection)
    const system = new Map()
    for (const name of entries(path.join(dir, 'system'))) system.set(identity(name), name)
    if (!system.size) continue
    for (const name of entries(dir)) {
      if (name === 'system' || name === '000-template.md') continue
      const key = identity(name)
      if (system.has(key)) found.push({ collection, id: key, project: name, system: system.get(key) })
    }
  }
  return found
}

// Rutas que el toolkit dejó de materializar. Sin esto una instancia arrastra para siempre lo que
// alguna versión suya copió: `upgrade` agrega y reemplaza, pero nunca quitaba nada.
const RETIRED = [
  'agents/roles/system',
  'teams/system',
  '.github/workflows/agent-learning.yml',
  'automatization/runners',
  'automatization/workflows',
  // Prometía ser el interruptor de los guards —«runner activo y gates requeridos», decía su README—
  // y no lo leía nadie. Quien corría `install claude` seguía viendo `"runner": "manual"`, y un cargo
  // que lo leyó dio por configurados unos gates que en realidad decide la configuración del runner.
  'automatization/config.json',
]

// Aprendizaje que quedó dentro de una ruta retirada. Es lo único ahí que no se puede reponer, así
// que se detecta antes de borrar nada: perderlo en silencio sería peor que dejar el directorio.
function retiredWithLearning(root) {
  const found = []
  for (const relative of RETIRED) {
    const dir = path.join(root, relative)
    if (!fs.existsSync(dir)) continue
    for (const file of treeFiles(dir)) {
      if (!/(^|\/)learning\/(reports|proposals)\//.test(file)) continue
      if (path.basename(file).startsWith('_')) continue
      found.push(`${relative}/${file}`)
    }
  }
  return found
}

// Rutas que `upgrade` reemplaza. Todo lo que no aparezca acá pertenece al proyecto.
// Se listan aunque todavía no existan en la instancia: así un archivo nuevo del sistema llega en
// vez de esperar a que alguien lo cree a mano.
function systemPaths(root) {
  const paths = [...SYSTEM_FILES]
  for (const collection of SYSTEM_COLLECTIONS) {
    const dir = path.join(root, collection, 'system')
    if (fs.existsSync(dir)) paths.push(`${collection}/system`)
  }
  return paths
}

function treeFiles(dir, prefix = '') {
  const found = []
  let list = []
  try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const entry of list) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...treeFiles(path.join(dir, entry.name), relative))
    else found.push(relative)
  }
  return found.sort()
}

function trackedPaths() {
  return [...RUNTIME_PATHS, ...SYSTEM_COLLECTIONS.map((collection) => `${collection}/system`)]
}

// Archivos que la empresa editó después de recibirlos. Se compara contra lo que Cauce entregó,
// no contra el paquete: si se comparara contra el paquete, cualquier mejora del toolkit se vería
// idéntica a una edición local y bloquearía la actualización.
function localChanges(root) {
  const manifest = require('./manifest')
  const changed = []
  for (const target of trackedPaths()) {
    const dir = path.join(root, target)
    if (!fs.existsSync(dir)) continue
    for (const file of manifest.edited(root, target, treeFiles(dir))) changed.push(`${target}/${file}`)
  }
  // Los archivos sueltos del sistema entran por la misma puerta. Quedaban afuera, así que `upgrade`
  // los reemplazaba en silencio: un cargo escribió el índice de ADR que el propio README le pedía
  // actualizar, comprobó que se perdería, y prefirió no dejar una entrada condenada a desaparecer.
  changed.push(...manifest.editedPaths(root, SYSTEM_FILES))
  return changed
}

module.exports = {
  RETIRED,
  trackedPaths,
  packageDir,
  RUNTIME_PATHS,
  retiredWithLearning,
  engineAt,
  packagePath,
  SYSTEM_COLLECTIONS,
  SYSTEM_FILES,
  localChanges,
  mode,
  overrides,
  sourceOf,
  systemPaths,
  treeFiles,
}
