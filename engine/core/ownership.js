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
]

// Colecciones mixtas: el toolkit posee `<dir>/system/`, el proyecto todo lo demás del directorio.
const SYSTEM_COLLECTIONS = [
  'planning/adr',
  'planning/business-rules',
  'planning/rules',
  'teams',
]

// Copias del runtime: el proyecto las recibe para poder ejecutar sin red, pero no las escribe.
// Se reemplazan enteras. Mientras no tengan su propio `system/`, una edición local se detecta y
// se reporta antes de pisarla, nunca después.
const RUNTIME_PATHS = [
  '.ops/engine',
  '.ops/agents',
  'automatization/hooks',
  'automatization/runners',
  'automatization/workflows',
]

// Rutas que el paquete tiene por duplicado: una versión para el proyecto en `template/` y otra
// interna del toolkit. Gana la del template, que es la que le habla a quien usa la instancia.
const TEMPLATE_OWNED = ['automatization/runners/README.md']

// Dentro del paquete, lo que una instancia recibe en su raíz vive bajo `template/`; el catálogo,
// los equipos y la automatización están en la raíz del paquete, y el motor en `engine/`.
function sourceOf(relative) {
  if (relative === '.ops/engine') return 'engine'
  if (relative === '.ops/agents') return 'agents'
  if (relative.startsWith('planning/')) return path.join('template', relative)
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

// Rutas que `upgrade` reemplaza. Todo lo que no aparezca acá pertenece al proyecto.
function systemPaths(root) {
  const paths = []
  for (const file of SYSTEM_FILES) {
    if (fs.existsSync(path.join(root, file))) paths.push(file)
  }
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

// Archivos del runtime que el proyecto editó: existen en las dos partes y difieren. Un archivo
// que sólo existe en la instancia es un agregado propio, no una edición, y sobrevive intacto.
function localChanges(root, packageRoot) {
  const changed = []
  for (const target of RUNTIME_PATHS) {
    const from = path.join(packageRoot, sourceOf(target))
    const to = path.join(root, target)
    if (!fs.existsSync(to) || !fs.existsSync(from)) continue
    for (const file of treeFiles(from)) {
      if (TEMPLATE_OWNED.includes(`${target}/${file}`)) continue
      const mine = path.join(to, file)
      if (!fs.existsSync(mine)) continue
      if (fs.readFileSync(mine, 'utf8') !== fs.readFileSync(path.join(from, file), 'utf8')) {
        changed.push(`${target}/${file}`)
      }
    }
  }
  return changed
}

module.exports = {
  RUNTIME_PATHS,
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
