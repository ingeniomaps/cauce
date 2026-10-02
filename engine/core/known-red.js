'use strict'

// Un rojo que ya estaba —un lint heredado, una suite rota en otro módulo— declarado por raíz y gate (caso 241).
// Sin esto cada commit de ese repositorio se frenaba y pedía aprobación, y eso empujaba a apagar `verify`
// entero. Declarado, el gate puede fallar y el commit pasa; uno que no está declarado sigue frenando, y `check`
// lista cada declaración mientras exista, como toda exención.
//
// Se declara el gate entero y no la línea de error: comparar la salida se rompe en cuanto la herramienta cambia
// el orden o el texto. El costo es que un rojo nuevo dentro de un gate ya declarado no frena.

const fs = require('node:fs')
const path = require('node:path')

const FILE = 'gate-known-red'
// Los nombres con que `verify` anota cada gate, que son los únicos que puede encontrar.
const GATES = ['test', 'lint', 'typecheck', 'build', 'go test', 'go build', 'make ci', 'make test']
const LINE = /^([^:#\s][^:]*?)\s*:\s*(.+?)\s+—\s+(\S.*)$/

// Lee `planning/gate-known-red`: una declaración por línea, `<raíz>: <gate> — <motivo>`; `#` comenta.
function readKnownRed(planning, roots = null) {
  let text = ''
  try { text = fs.readFileSync(path.join(planning, FILE), 'utf8') } catch { return { entries: [], errors: [] } }
  const entries = []
  const errors = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const at = `planning/${FILE}:${index + 1}`
    const match = line.match(LINE)
    if (!match) {
      errors.push(`${at}: se escribe «<raíz>: <gate> — <motivo>», y sin esa forma no declara nada`)
      return
    }
    const [, root, gate, reason] = match
    if (!GATES.includes(gate)) errors.push(`${at}: el gate «${gate}» no existe; son ${GATES.join(', ')}`)
    else if (roots && !roots.includes(root)) errors.push(`${at}: la raíz «${root}» no está en workspaceRoots`)
    else entries.push({ root, gate, reason })
  })
  return { entries, errors }
}

function isKnownRed(entries, root, gate) {
  return entries.some((one) => one.root === root && one.gate === gate)
}

module.exports = { FILE, GATES, readKnownRed, isKnownRed }
