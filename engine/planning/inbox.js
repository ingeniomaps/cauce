'use strict'

// Lo que `check` dice sobre el INBOX. Son advertencias y nunca errores: el INBOX es de la persona, y un
// `check` rojo por lo que tiene adentro la frenaría a ella por lo que escribió un recorrido (caso 101).

const path = require('node:path')
const P = require('./parser')

const FILE = 'INBOX.md'
// Un archivo que todavía se recorre de una sentada; el molde vacío ocupa menos de treinta. La instancia
// lo cambia en `inbox.warnLines`.
const WARN_LINES = 300

function warnings(root, done, config) {
  const text = P.read(path.join(root, FILE))
  if (!text.trim()) return []
  const found = []
  const declared = config && config.inbox && config.inbox.warnLines
  const limit = Number.isInteger(declared) && declared > 0 ? declared : WARN_LINES
  const count = text.replace(/\n$/, '').split('\n').length
  if (count > limit) {
    found.push(`${FILE}: ${count} líneas, más que el umbral de ${limit} (inbox.warnLines en ops.config.json); `
      + 'recorrelo y borrá lo que ya se decidió')
  }
  // Una entrada que se llama como una tarea cerrada probablemente se promovió y nadie la borró. Es un
  // indicio y no una prueba —el molde no obliga a que la tarea conserve el nombre del ítem—, y por eso
  // avisa en vez de fallar (caso 106).
  for (const name of Object.values(P.inboxHeads(root)).flat()) {
    if (done.set.has(name)) {
      found.push(`${FILE}: **${name}** se llama como done/${name}.md; si ya se promovió, borrala`)
    }
  }
  return found
}

module.exports = { warnings }
