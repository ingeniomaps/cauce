'use strict'

// Resolución única del catálogo de cargos. La usan el ciclo de aprendizaje, la validación de
// equipos y la instalación en runners.
//
// El catálogo se reparte en dos lugares según de quién es cada cosa:
//
//   <paquete>/agents/<tipo>/system/<slug>/   viene con Cauce, se actualiza con la dependencia
//   <proyecto>/agents/<tipo>/<slug>/         es de la empresa y manda sobre el anterior
//
// Los cargos del sistema no se copian al proyecto: evolucionan como profesión y esa evolución es
// la misma para todos. Lo que sí es de cada empresa —su contexto— vive en `organization/roles/`.
//
// Un slug repetido entre tipos distintos sigue siendo ambiguo: ahí no hay ninguna regla que diga
// cuál gana, y elegir en silencio sería peor que fallar.

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

// Dónde está el catálogo que trae Cauce. Se reconoce por tener `roles/system/`, que es el espacio
// del sistema y no algo que un proyecto deba crear.
function systemCatalog(root) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'agents'),
    path.join(root, '.ops', 'agents'),
    path.join(root, 'agents'),
  ]
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'roles', 'system'))) || ''
}

function projectCatalog(root) {
  return path.join(root, 'agents')
}

function types(root) {
  const own = directories(projectCatalog(root))
  const system = directories(systemCatalog(root) || path.join(root, '\0'))
  return [...new Set([...own, ...system])]
}

// Todos los cargos visibles: los de la empresa ocultan a los del sistema con el mismo slug.
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
        found.set(slug, { slug, type, dir, system: fromSystem })
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

module.exports = { find, list, projectCatalog, resolve, systemCatalog, types }
