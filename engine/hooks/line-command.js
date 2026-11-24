'use strict'

// Armar, sumar un repositorio a o retirar una línea de trabajo lo decide la persona (caso 551). `ops line` declara la
// línea en `ops.config.json`, crea su rama y sus árboles, y `ops lines join|migrate --apply` borra o junta esos
// árboles: una sesión abrió una línea que nadie pidió. Declararla a mano ya frenaba en `ops-config`, porque cada
// repositorio de una línea es una raíz escribible (`config-keys.js`); por la CLI no la miraba nadie.
//
// Decide por estado y no por palabras: frena la línea que no está declarada, el repositorio que no tiene y el
// `--apply` de `join` y `migrate`. Lo que sólo lee, lo que reusa una línea ya declarada, `ops worktree --line` y
// `lines env` —que trabaja dentro de una línea ya decidida y respalda lo que reemplaza— pasan. Se aprueba nombrando
// «la línea <nombre>» en el chat, o confirmando después del bloqueo, y no se hereda: vale para ese turno.

const path = require('node:path')
const LT = require('../core/line-trees')
const { opsRoot, findOpsRoot, rawCommandOf, cwdOf, block } = require('./input')
const { steps } = require('./shell-changes')
const { opsCall } = require('./line-scope')
const AP = require('./approval')

const positional = (args) => args.filter((one) => !one.startsWith('-'))

// Lo que un tramo hace sobre las líneas, o null: `{ line, why }`.
function lineAct(step) {
  const args = opsCall(step)
  if (!args) return null
  const words = positional(args)
  const at = (dir) => findOpsRoot(path.resolve(step.base || '/', dir || '.'))
  if (words[0] === 'line' && words[2]) {
    const root = at(words[1])
    const declared = root ? LT.declared(root) : {}
    // Como los escribe `ops line` (`cli/lines.js`), de los dos lados: «app/» declarado es «app» en el comando.
    const norm = (one) => path.normalize(one).replace(/\/+$/, '')
    if (!declared[words[2]]) return { line: words[2], why: 'la declara y le arma su rama' }
    const had = declared[words[2]].map(norm)
    const added = words.slice(3).map(norm).filter((one) => !had.includes(one))
    return added.length ? { line: words[2], why: `le suma ${added.join(', ')}` } : null
  }
  if (words[0] === 'lines' && ['join', 'migrate'].includes(words[1]) && words[3] && args.includes('--apply')) {
    return { line: words[3], why: words[1] === 'join' ? 'la retira o la junta' : 'la migra' }
  }
  return null
}

function lineCommand(input) {
  const acts = steps(rawCommandOf(input), cwdOf(input)).map(lineAct).filter(Boolean)
  if (!acts.length) return
  const held = AP.pendingNow(opsRoot(input), [...new Set(acts.map((one) => `línea ${one.line}`))], input)
  if (!held.length) return
  const what = acts.filter((one) => held.includes(`línea ${one.line}`)).map((one) => `${one.why} la línea ${one.line}`)
  block(`Este comando ${what.join('; ')}, y una línea —su rama, sus árboles, lo que escribe en ops.config.json— la `
    + 'decide la persona. Si la pidió, que la nombre en el chat («la línea <nombre>»).\n'
    + AP.HOW(null, held, input, held, { turn: true }))
}

module.exports = { lineCommand }
