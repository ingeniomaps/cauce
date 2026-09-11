'use strict'

// Cómo llegan a un runner las reglas que rigen la instancia (casos 099 y 105). Su archivo de instrucciones las
// nombraba fijas —las cuatro de `system/`—, así que la sesión cargaba la que la empresa había sobrescrito y
// ninguna de las propias. El adaptador trae un marcador y el motor lo resuelve contra `effectiveRules` al
// instalar. Y como `upgrade` no reinstala, `check` y `doctor` comparan lo instalado con lo vigente.

const fs = require('node:fs')
const F = require('../core/files')
const O = require('../core/ownership')

// `imports` para el runner que carga archivos con `@ruta`; `list` para el que sólo lee prosa, donde un `@` no
// significa nada.
const MARKER = /\{\{RULES:(imports|list)\}\}/g
const START = '<!-- cauce:reglas inicio — lo reescribe "automation install" con las reglas vigentes -->'
const END = '<!-- cauce:reglas fin -->'
// Se reconoce por el arranque y no por la línea entera: quien quiera el bloque en un archivo propio escribe las
// dos marcas a mano, y pedirle el texto exacto de la primera es pedirle que acierte un guion largo.
const START_AT = '<!-- cauce:reglas inicio'
// Lo que un `CLAUDE.md` o un `GEMINI.md` instalado antes de 0.82.0 trae en el lugar del bloque.
const LEGACY_IMPORT = /^@\S*planning\/rules\/\S+\.md\s*$/

// Sin raíz el marcador queda como está —así lo leen las pruebas que revisan el texto de un adaptador—: un
// bloque vacío se leería igual que un proyecto sin reglas, y un marcador sin resolver se ve.
function fill(text, root) {
  if (!root || !text.includes('{{RULES:')) return text
  const rules = O.effectiveRules(root)
  return text.replace(MARKER, (_, format) => [START, ...rules.map((file) => (format === 'imports'
    ? `@{{OPS_DIR}}${file}`
    : `- \`{{OPS_DIR}}${file}\``)), END].join('\n'))
}

function blockOf(text) {
  const start = text.indexOf(START_AT)
  if (start === -1) return null
  const end = text.indexOf(END, start)
  if (end === -1) return null
  return { start, end: end + END.length, body: text.slice(start, end + END.length) }
}

// Las reglas que nombra un archivo instalado, relativas a la raíz ops: las del bloque o, si es anterior al
// bloque, sus imports sueltos.
function listed(text) {
  const found = blockOf(text)
  const lines = found ? found.body.split('\n') : text.split('\n').filter((line) => LEGACY_IMPORT.test(line))
  return lines.map((line) => (line.match(/planning\/rules\/[^\s`]+\.md/) || [])[0]).filter(Boolean)
}

// Un archivo de instrucciones con cambios de la empresa se conserva, y hasta acá eso lo dejaba sin reglas
// nuevas para siempre. Recibe el bloque donde estaba el suyo, o donde estaban los imports fijos de antes, y el
// resto queda como lo dejó quien lo editó. Devuelve null si el archivo no tiene dónde recibirlo: uno propio,
// sin marcas ni imports de Cauce, no se toca.
function withBlock(text, rendered) {
  const fresh = blockOf(rendered)
  if (!fresh) return null
  const current = blockOf(text)
  if (current) return `${text.slice(0, current.start)}${fresh.body}${text.slice(current.end)}`
  const lines = text.split('\n')
  const first = lines.findIndex((line) => LEGACY_IMPORT.test(line))
  if (first === -1) return null
  const kept = lines.filter((line, index) => index === first || !LEGACY_IMPORT.test(line))
  kept[first] = fresh.body
  return kept.join('\n')
}

// Qué archivos de un runner nombran otras reglas que las vigentes: sólo los que su adaptador entrega con el
// marcador y que están en disco. Se carga tarde porque `runners` usa `fill` para renderizar.
function drift(root, name) {
  const { runnerManifest, runnerPaths, resolveItem } = require('./runners')
  const runner = runnerManifest(root, name)
  const paths = runnerPaths(root, name, runner)
  const expected = O.effectiveRules(root)
  const found = []
  for (const item of [...(runner.instructions || []), ...(runner.artifacts || [])]) {
    const { source, target } = resolveItem(paths, root, name, item)
    if (!fs.existsSync(target) || !fs.readFileSync(source, 'utf8').includes('{{RULES:')) continue
    const text = fs.readFileSync(target, 'utf8')
    const have = listed(text)
    const missing = expected.filter((file) => !have.includes(file))
    const extra = have.filter((file) => !expected.includes(file))
    if (!blockOf(text) && !have.length) found.push({ target: item.target, bare: true, missing, extra })
    else if (missing.length || extra.length) found.push({ target: item.target, bare: false, missing, extra })
  }
  return found
}

// Escribe el bloque nuevo dentro de un archivo con cambios propios; dice si hubo algo que escribir.
function refresh(file, rendered) {
  const current = fs.readFileSync(file, 'utf8')
  const updated = withBlock(current, rendered)
  if (updated === null || updated === current) return false
  F.atomicWrite(file, updated)
  return true
}

function driftLine(name, one) {
  if (one.bare) {
    return `${one.target} no carga las reglas vigentes; reinstalá el adaptador (make install-${name}), `
      + `y si ese archivo es tuyo, marcá dónde va el bloque con ${START_AT} --> y ${END}`
  }
  const parts = [
    one.missing.length ? `no carga ${one.missing.join(', ')}` : '',
    one.extra.length ? `carga ${one.extra.join(', ')}, que ya no rige` : '',
  ].filter(Boolean)
  return `${one.target} ${parts.join(' y ')}; reinstalá el adaptador (make install-${name})`
}

// Lo mismo para cada runner que esta instancia instaló, que es lo que `check` mira en cada corrida: una regla
// escrita después de instalar, o traída por un `upgrade`, no llega a ninguna sesión hasta reinstalar.
function staleLines(root) {
  const { RUNNER_NAMES } = require('./runners')
  const recorded = Object.keys(require('../core/manifest').readRunners(root))
  const lines = []
  for (const name of RUNNER_NAMES) {
    if (!recorded.some((key) => key.startsWith(`${name}/`))) continue
    // Sin el paquete no hay adaptador contra el cual comparar, y eso ya lo dice `automation doctor`.
    try { for (const one of drift(root, name)) lines.push(`${name}: ${driftLine(name, one)}`) } catch { continue }
  }
  return lines
}

module.exports = { fill, refresh, drift, driftLine, staleLines }
