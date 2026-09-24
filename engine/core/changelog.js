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

// La línea que `agent-promote` deja al aplicar un cargo, en la versión que todavía no salió. Sin ella el
// cambio quedaba en `main` sin versión que lo llevara: `release-pr.yml` sólo abre el PR cuando el
// CHANGELOG declara un número nuevo, y escribirlo era un paso que nadie tenía asignado.
//
// Abierta es la entrada más nueva si va por delante de `package.json`; si no, ya salió y se abre la
// minor siguiente. Minor porque cambia lo que recibe quien hace `upgrade`, que es la regla de este
// archivo. Varios cargos del mismo mes caen así en una sola versión.
function noteAgentChange(root, { agent, proposal, summary, today }) {
  const file = path.join(root, 'CHANGELOG.md')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const released = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const first = lines.findIndex((line) => /^##\s*\[\d/.test(line))
  if (first < 0) throw new Error('CHANGELOG.md no tiene ninguna entrada con versión.')
  const bullet = wrap(`- **\`${agent}\`**: ${summary} (propuesta \`${proposal}\`).`)
  const top = lines[first].match(HEADING)[1]
  if (compare(top, released) <= 0) {
    const [major, minor] = released.split('.').map(Number)
    const version = `${major}.${minor + 1}.0`
    lines.splice(first, 0, `## [${version}] - ${today}`, '', '### Cargos', '', ...bullet, '')
    fs.writeFileSync(file, lines.join('\n'))
    return { version, already: false }
  }
  let end = lines.findIndex((line, index) => index > first && HEADING.test(line))
  if (end < 0) end = lines.length
  // Una propuesta ya anotada no se anota dos veces: `seal` puede volver a correr sobre un cuerpo sin sellar.
  // Con los espacios normalizados porque la viñeta se envuelve, y el corte puede caer entre las dos mitades.
  const entry = lines.slice(first, end).join(' ').replace(/\s+/g, ' ')
  if (entry.includes(`- **\`${agent}\`**`) && entry.includes(`(propuesta \`${proposal}\`)`)) {
    return { version: top, already: true }
  }
  const section = lines.findIndex((line, index) => index > first && index < end && /^###\s+Cargos\s*$/.test(line))
  let at = end
  if (section >= 0) {
    at = lines.findIndex((line, index) => index > section && index < end && /^#{2,3}\s/.test(line))
    if (at < 0) at = end
  }
  while (at > first + 1 && lines[at - 1].trim() === '') at--
  lines.splice(at, 0, ...(section >= 0 ? bullet : ['', '### Cargos', '', ...bullet]))
  fs.writeFileSync(file, lines.join('\n'))
  return { version: top, already: false }
}

// Al ancho del resto del archivo, con la sangría de continuación que ya usan sus viñetas.
function wrap(text, width = 110) {
  const out = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length > width && line) {
      out.push(line)
      line = `  ${word}`
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

module.exports = { between, compare, entries, read, noteAgentChange }
