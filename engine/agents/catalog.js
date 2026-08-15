'use strict'

// Resolución única del catálogo de cargos. La usan el ciclo de aprendizaje, la validación de
// equipos y la instalación en runners: tres lugares que antes resolvían por su cuenta.
//
// Cada tipo separa lo del toolkit de lo del proyecto igual que el resto de las colecciones:
//
//   agents/<tipo>/system/<slug>/SKILL.md   viene con Cauce y se reemplaza al actualizar
//   agents/<tipo>/<slug>/SKILL.md          es del proyecto y manda sobre el anterior
//
// Un slug repetido entre tipos distintos sigue siendo ambiguo: ahí no hay ninguna regla que
// diga cuál gana, y elegir en silencio sería peor que fallar.

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

function types(root) {
  return directories(path.join(root, 'agents'))
}

// Todos los cargos visibles: los del proyecto ocultan a los del sistema con el mismo slug.
function list(root) {
  const catalog = path.join(root, 'agents')
  const found = new Map()
  for (const type of types(root)) {
    const base = path.join(catalog, type)
    // El sistema primero para que el proyecto lo sobrescriba al pasar por encima.
    for (const [source, system] of [[path.join(base, 'system'), true], [base, false]]) {
      for (const slug of directories(source)) {
        if (slug === 'system' || !SLUG.test(slug)) continue
        const dir = path.join(source, slug)
        if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue
        found.set(slug, { slug, type, dir, system })
      }
    }
  }
  return [...found.values()].sort((left, right) => left.slug.localeCompare(right.slug))
}

function resolve(root, slug) {
  if (!SLUG.test(slug || '')) throw new Error(`agente inválido: ${slug || '(vacío)'}`)
  const matches = []
  for (const type of types(root)) {
    const own = path.join(root, 'agents', type, slug)
    const system = path.join(root, 'agents', type, 'system', slug)
    // Dentro de un tipo la precedencia está definida; entre tipos no, y por eso se acumulan.
    if (fs.existsSync(path.join(own, 'SKILL.md'))) matches.push(own)
    else if (fs.existsSync(path.join(system, 'SKILL.md'))) matches.push(system)
  }
  if (!matches.length) throw new Error(`no existe agents/<tipo>/${slug}/SKILL.md`)
  if (matches.length > 1) {
    throw new Error(`agente ambiguo ${slug}: ${matches.map((dir) => path.relative(root, dir)).join(', ')}`)
  }
  return matches[0]
}

module.exports = { list, resolve, types }
