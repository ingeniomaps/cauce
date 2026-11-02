'use strict'

// El archivo con que un recorrido frenado en un gate se retoma sin volver a pagar las etapas que ya cerraron (caso
// 458). Por qué en disco, en `automatization/shared/flow-resume.js`.
//
// El script de un workflow no toca el disco, así que el JSON lo copia un agente, al guardar y al leer. La suma de
// control es lo que hace que esa copia no pueda cambiar un resumen sin que se note: la calcula el recorrido sobre lo
// que quiere guardar, este módulo la recalcula sobre lo que quedó escrito, y lo mismo a la vuelta. Tiene que dar
// igual que `resumeHash` de `automatization/shared/flow-resume.js`, y una prueba compara las dos.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')

// JSON con las claves ordenadas: el agente devuelve los campos en el orden que quiere, y el contenido es lo único
// que tiene que coincidir.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

// FNV-1a de 32 bits: detecta una copia que no salió igual, que es todo lo que se le pide. No es una firma.
function resumeHash(value) {
  let hash = 0x811c9dc5
  for (const char of canonical(value)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const FIELDS = ['flow', 'intent', 'today', 'stages', 'stoppedAt', 'handoffs']
const HANDOFF = ['id', 'agent', 'gate', 'summary', 'analysis', 'evidence', 'assumptions', 'missing', 'humanAction',
  'openQuestions']

function problems(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['no es un objeto']
  const out = FIELDS.filter((key) => !(key in payload)).map((key) => `falta ${key}`)
  if (!Array.isArray(payload.stages)) out.push('stages no es una lista')
  if (!Array.isArray(payload.handoffs)) return [...out, 'handoffs no es una lista']
  payload.handoffs.forEach((one, index) => {
    if (!one || typeof one !== 'object' || Array.isArray(one)) return out.push(`handoffs[${index}]: no es un objeto`)
    for (const key of HANDOFF) if (!(key in one)) out.push(`handoffs[${index}]: falta ${key}`)
  })
  return out
}

// Sólo dentro de `planning/reports/` de la instancia: es donde el recorrido ya deja lo que produce, y un destino
// que vino de la copia de un agente no se escribe en cualquier lado.
function reportsDir(root) {
  return path.join(root, 'planning', 'reports')
}

// Sella la retoma que un agente escribió en `file`: comprueba que diga lo que el recorrido armó y le agrega la suma.
// Se sella en el lugar porque el JSON no puede viajar por la línea de comandos: Claude Code rechaza un heredoc con
// llaves y comillas («expansion obfuscation») antes de ejecutarlo, medido en la prueba real del caso 458. Si no
// coincide, el archivo queda sin sellar, y `show` no lo acepta.
function save(root, file, expected) {
  const target = F.assertWithin(reportsDir(root), path.resolve(root, file), 'retoma')
  if (!target.endsWith('.json')) throw new Error(`la retoma va en un .json: ${target}`)
  let payload
  try { payload = JSON.parse(fs.readFileSync(target, 'utf8')) } catch (error) {
    throw new Error(`no se pudo leer la retoma ${target}: ${error.message}`)
  }
  const wrong = problems(payload)
  if (wrong.length) throw new Error(`la retoma no tiene la forma esperada: ${wrong.join('; ')}`)
  const hash = resumeHash(payload)
  if (hash !== expected) {
    throw new Error(`la suma de control no coincide: se esperaba ${expected || '(ninguna)'} y el archivo da ${hash}. `
      + 'El JSON no quedó igual a como lo armó el recorrido: no se sella.')
  }
  F.atomicWrite(target, `${JSON.stringify({ ...payload, hash }, null, 2)}\n`)
  return target
}

// Lee una retoma y comprueba que siga diciendo lo que se guardó. Devuelve el contenido con su suma.
function show(root, file) {
  const target = F.assertWithin(reportsDir(root), path.resolve(root, file), 'retoma')
  let stored
  try { stored = JSON.parse(fs.readFileSync(target, 'utf8')) } catch (error) {
    throw new Error(`no se pudo leer la retoma ${target}: ${error.message}`)
  }
  const { hash, ...payload } = stored || {}
  const wrong = problems(payload)
  if (wrong.length) throw new Error(`la retoma no tiene la forma esperada: ${wrong.join('; ')}`)
  if (resumeHash(payload) !== hash) {
    throw new Error(`la retoma ${target} se editó después de guardarse: su suma no coincide`)
  }
  return { ...payload, hash }
}

module.exports = { canonical, resumeHash, save, show }
