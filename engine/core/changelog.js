'use strict'

// `upgrade` reemplaza `system/` sin pedir confirmación. Mostrar qué cambió entre la versión
// instalada y la nueva es lo que separa "actualizarse rápido" de "actualizarse a ciegas".

const fs = require('node:fs')
const path = require('node:path')

const HEADING = /^##\s*\[([^\]]+)\]/

// Lo no numérico ordena antes que la release.
function compare(left, right) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => Number(part) || 0)
  const [a, b] = [parse(left), parse(right)]
  for (let index = 0; index < 3; index++) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0)
  }
  return 0
}

function entries(text) {
  const found = []
  let current = null
  for (const line of text.split('\n')) {
    const heading = line.match(HEADING)
    if (heading) {
      current = { version: heading[1], lines: [] }
      found.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }
  return found.map((entry) => ({ version: entry.version, body: entry.lines.join('\n').trim() }))
}

// Entradas estrictamente posteriores a `from` y hasta `to`. Una versión no publicada se incluye
// siempre: es justamente la que el usuario está por recibir desde el paquete.
function between(text, from, to) {
  return entries(text).filter((entry) => {
    if (!/^\d/.test(entry.version)) return true
    if (from && compare(entry.version, from) <= 0) return false
    return !to || compare(entry.version, to) <= 0
  })
}

function read(packageRoot) {
  try { return fs.readFileSync(path.join(packageRoot, 'CHANGELOG.md'), 'utf8') } catch { return '' }
}

module.exports = { between, compare, entries, read }
