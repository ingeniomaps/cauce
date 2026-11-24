'use strict'

// Un rojo que ya estaba —un lint heredado, una suite rota en otro módulo— declarado por raíz y gate (caso 241).
// Sin esto cada commit de ese repositorio se frenaba y pedía aprobación, y eso empujaba a apagar `verify`
// entero. Declarado, el gate puede fallar y el commit pasa; uno que no está declarado sigue frenando, y `check`
// lista cada declaración mientras exista, como toda exención.
//
// Se declara el gate entero y no la línea de error: comparar la salida se rompe en cuanto la herramienta cambia
// el orden o el texto. El costo es que un rojo nuevo dentro de un gate ya declarado no frena.
//
// Y por eso vence (caso 560): `· vence AAAA-MM-DD` al final de la línea. Una exención que no vence se pudre, y cuanto
// más vive, más rojo nuevo esconde. Vencida no cuenta y `verify` la nombra al frenar: renovarla es volver a decidirla.
// Sin fecha todavía cuenta, y `check` lo avisa: es la forma vieja, que deja de contar en la minor siguiente a 0.125.0.

const fs = require('node:fs')
const path = require('node:path')

const FILE = 'gate-known-red'
// Los nombres con que `verify` anota cada gate, que son los únicos que puede encontrar; `verify` es el que declara la
// raíz (caso 547).
const GATES = ['verify', 'test', 'lint', 'typecheck', 'build', 'go test', 'go build', 'make ci', 'make test']
const LINE = /^([^:#\s][^:]*?)\s*:\s*(.+?)\s+—\s+(\S.*?)(?:\s+·\s+vence\s+(\S+))?$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (text) => {
  const day = new Date(`${text}T00:00:00Z`)
  return DATE.test(text) && !Number.isNaN(day.getTime()) && day.toISOString().startsWith(text)
}

// Lee `planning/gate-known-red`: una declaración por línea, `<raíz>: <gate> — <motivo> · vence AAAA-MM-DD`; `#`
// comenta. `today` es el día contra el que vence, en la misma forma, y lo pasa quien llama (`TODAY` de
// `cli/io.js`): `core` no depende de las capas de arriba. El mismo día del vencimiento todavía cuenta.
function readKnownRed(planning, roots = null, today = '') {
  let text = ''
  const empty = { entries: [], errors: [], expired: [] }
  try { text = fs.readFileSync(path.join(planning, FILE), 'utf8') } catch { return empty }
  const entries = []
  const errors = []
  const expired = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const at = `planning/${FILE}:${index + 1}`
    const match = line.match(LINE)
    if (!match) {
      errors.push(`${at}: se escribe «<raíz>: <gate> — <motivo> · vence AAAA-MM-DD», y sin esa forma no declara nada`)
      return
    }
    const [, root, gate, reason, expires = ''] = match
    if (!GATES.includes(gate)) errors.push(`${at}: el gate «${gate}» no existe; son ${GATES.join(', ')}`)
    else if (roots && !roots.includes(root)) errors.push(`${at}: la raíz «${root}» no está en workspaceRoots`)
    // Mal escrita cuenta como sin fecha: una errata no apaga la exención en silencio. `check` la nombra.
    // Un vencimiento con texto detrás no cierra la línea y quedaba adentro del motivo: se dice, como una fecha mal
    // escrita.
    else if (/·\s*vence\b/i.test(reason)) {
      errors.push(`${at}: el vencimiento va al final de la línea, «· vence AAAA-MM-DD» y nada después`)
      entries.push({ root, gate, reason, expires: '' })
    } else if (expires && !isDate(expires)) {
      errors.push(`${at}: «vence ${expires}» no es una fecha`)
      entries.push({ root, gate, reason, expires: '' })
    }
    else (expires && today && expires < today ? expired : entries).push({ root, gate, reason, expires })
  })
  return { entries, errors, expired }
}

function isKnownRed(entries, root, gate) {
  return entries.some((one) => one.root === root && one.gate === gate)
}

module.exports = { FILE, GATES, readKnownRed, isKnownRed }
