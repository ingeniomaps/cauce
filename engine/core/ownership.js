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
  'organization/roles/README.md',
  'teams/000-template.md',
  'teams/README.md',
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
  '.ops/engine',
  '.ops/agents',
  '.ops/teams',
  'automatization/hooks',
  'automatization/runners',
  'automatization/workflows',
]

// Rutas que el paquete tiene por duplicado: una versión para el proyecto en `template/` y otra
// interna del toolkit. Gana la del template, que es la que le habla a quien usa la instancia.
const TEMPLATE_OWNED = ['automatization/runners/README.md']

// Dentro del paquete, lo que una instancia recibe en su raíz vive bajo `template/`; el catálogo,
// los equipos y la automatización están en la raíz del paquete, y el motor en `engine/`.
const TEMPLATE_PREFIXES = ['planning/', 'organization/', 'integrations/', 'teams/']

function sourceOf(relative) {
  if (relative === '.ops/engine') return 'engine'
  if (relative === '.ops/agents') return 'agents'
  if (relative === '.ops/teams') return 'teams'
  if (TEMPLATE_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
    return path.join('template', relative)
  }
  return relative
}

// Dónde puede estar el motor, en orden de preferencia. Lo mismo que resuelven `tools/ops.js`,
// el wrapper de hooks y el bridge de Antigravity: declararlo una vez evita que un consumidor
// quede afuera cuando aparece una forma nueva de instalarlo.
function engineCandidates(root) {
  return [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine'),
    path.join(root, '.ops', 'engine'),
    path.join(root, 'engine'),
  ]
}

function engineAt(root, relative = '') {
  return engineCandidates(root)
    .map((dir) => (relative ? path.join(dir, relative) : dir))
    .find((candidate) => fs.existsSync(candidate)) || ''
}

// Definiciones que consume el motor —cargos y equipos— y que por eso viajan con el paquete en vez
// de copiarse. Se reconocen por contener `system/`, que es el espacio del toolkit y no algo que un
// proyecto deba crear. Una sola implementación para las dos, o divergen.
function packageDir(root, name) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', name),
    path.join(root, '.ops', name),
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

// Entradas del proyecto que reemplazan a una del sistema con la misma identidad.
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

// Archivos de un árbol, relativos a él, para comparar instancia contra paquete.
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

// Rutas que Cauce mantiene y que por eso conviene registrar y vigilar.
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
  return changed
}

module.exports = {
  RETIRED,
  trackedPaths,
  packageDir,
  RUNTIME_PATHS,
  retiredWithLearning,
  engineAt,
  engineCandidates,
  TEMPLATE_OWNED,
  SYSTEM_COLLECTIONS,
  SYSTEM_FILES,
  identity,
  localChanges,
  overrides,
  sourceOf,
  systemPaths,
  treeFiles,
}
