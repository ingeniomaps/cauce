'use strict'

// Resolución única del catálogo de cargos. La usan el ciclo de aprendizaje, la validación de
// equipos y la instalación en runners.
//
// El catálogo se reparte en dos lugares según de quién es cada cosa:
//
//   <paquete>/agents/<tipo>/system/<slug>/   viene con Cauce, se actualiza con la dependencia
//   <proyecto>/agents/<tipo>/<slug>/         es de la empresa y manda sobre el anterior
//
// Un cargo del sistema no baja solo: evoluciona como profesión y esa evolución es la misma para
// todos. Adoptarlo es una decisión explícita (`agents fork`), y el contexto propio de cada empresa
// vive aparte, en `organization/roles/`.
//
// Un slug repetido entre tipos distintos es ambiguo y falla: no hay regla que diga cuál gana, y
// elegir en silencio sería peor.

const fs = require('node:fs')
const path = require('node:path')

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function directories(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch { return [] }
}

// La línea con la que se elige un cargo sin abrirlo.
//
// `description` ya dice para qué sirve cada cargo, pero ronda el medio millar de caracteres porque su
// lector es el runner al seleccionar: el catálogo entero leído de corrido no entra en una decisión.
// Quien tiene una tarea y quiere saber a quién asignarla necesita una línea por cargo, y sobre todo
// necesita distinguir vecinos —qué separa a `data-analyst` de `analytics-engineer`, o a
// `project-manager` de `release-manager`—.
//
// Vive en el frontmatter del propio cargo y no en un índice aparte: un índice se desincroniza en
// silencio, y una línea que miente al elegir es peor que no tenerla. Como el cargo la carga consigo,
// un fork se la lleva y una empresa que escribe su cargo escribe la suya.
function summary(dir) {
  try {
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    const front = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1] || ''
    return ((front.match(/^summary:\s*(.+)$/m) || [])[1] || '').trim()
  } catch { return '' }
}

// Dónde está el catálogo que trae Cauce. Se reconoce por tener `roles/system/`, que es el espacio
// del sistema y no algo que un proyecto deba crear.
function systemCatalog(root) {
  return require('../core/ownership').packageDir(root, 'agents')
}

function projectCatalog(root) {
  return path.join(root, 'agents')
}

function types(root) {
  const own = directories(projectCatalog(root))
  const system = directories(systemCatalog(root) || path.join(root, '\0'))
  return [...new Set([...own, ...system])]
}

function list(root) {
  const system = systemCatalog(root)
  const found = new Map()
  for (const type of types(root)) {
    // El sistema primero, para que el proyecto lo sobrescriba al pasar por encima.
    const sources = [
      system ? [path.join(system, type, 'system'), true] : null,
      [path.join(projectCatalog(root), type), false],
    ].filter(Boolean)
    for (const [source, fromSystem] of sources) {
      for (const slug of directories(source)) {
        if (slug === 'system' || !SLUG.test(slug)) continue
        const dir = path.join(source, slug)
        if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue
        found.set(slug, { slug, type, dir, system: fromSystem, summary: summary(dir) })
      }
    }
  }
  return [...found.values()].sort((left, right) => left.slug.localeCompare(right.slug))
}

function find(root, slug) {
  if (!SLUG.test(slug || '')) throw new Error(`agente inválido: ${slug || '(vacío)'}`)
  const system = systemCatalog(root)
  const matches = []
  for (const type of types(root)) {
    const own = path.join(projectCatalog(root), type, slug)
    const shipped = system ? path.join(system, type, 'system', slug) : ''
    // Dentro de un tipo la precedencia está definida; entre tipos no, y por eso se acumulan.
    if (fs.existsSync(path.join(own, 'SKILL.md'))) matches.push({ dir: own, system: false })
    else if (shipped && fs.existsSync(path.join(shipped, 'SKILL.md'))) {
      matches.push({ dir: shipped, system: true })
    }
  }
  if (!matches.length) throw new Error(`no existe agents/<tipo>/${slug}/SKILL.md`)
  if (matches.length > 1) {
    throw new Error(`agente ambiguo ${slug}: ${matches.map((entry) => entry.dir).join(', ')}`)
  }
  return matches[0]
}

function resolve(root, slug) {
  return find(root, slug).dir
}

module.exports = { find, list, projectCatalog, resolve, summary, systemCatalog, types }
