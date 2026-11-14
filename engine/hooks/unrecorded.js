'use strict'

// La línea que explica un freno de `plan-first` o de la gobernanza cuando la sesión no tiene ningún mensaje
// registrado. Lo pedido antes de que existiera el hook de mensaje —Cauce instalado con la sesión ya abierta— no pasó
// por él, así que no cuenta como pedido de la persona, y el freno no decía por qué (caso 503). Sólo explica, no exime.
// Supone que el runner registra mensajes: Antigravity no, y no llega acá porque su puente no manda `session_id`.

const fs = require('node:fs')
const CHAT = require('./chat')

function unrecordedNote(input) {
  if (process.env.CI || CHAT.delegated() || input.agent_id || !input.session_id) return ''
  if (fs.existsSync(CHAT.recordPath(input.session_id))) return ''
  return '\nNo hay ningún mensaje de la persona registrado en esta sesión: si Cauce se instaló con la sesión abierta, '
    + 'lo que pidió antes no cuenta para este guard. Pedile que abra una sesión nueva y lo repita ahí.'
}

module.exports = { unrecordedNote }
