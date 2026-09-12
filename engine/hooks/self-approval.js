'use strict'

// El canal por el que una persona dice «sí» no lo puede escribir el agente: si pudiera, cada bloqueo que
// ofrece aprobarse se aprobaría solo. Pasaba —ningún guard miraba `planning/.ops-approval`— y en la prueba
// en vivo del 092 el agente, frenado, intentó escribírsela (caso 098).
//
// Lo preguntan los dos guards de límites —el que mira un `Write` y el que mira el destino de un comando—,
// que ya son los que deciden dónde puede caer una escritura. La persona edita el archivo a mano, que ningún
// hook ve, o se lo pide al agente nombrándolo en el chat. El registro del chat no lo escribe nunca una
// herramienta.

const path = require('node:path')
const { opsRoot } = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')

// Por qué el agente no puede escribir en `file`, o vacío.
function selfApproval(input, file) {
  if (file === CHAT.DIR || file.startsWith(`${CHAT.DIR}${path.sep}`)) {
    return `${file} es el registro de lo que la persona dijo en el chat: lo escribe el runner, nunca una `
      + 'herramienta.'
  }
  const root = opsRoot(input)
  if (!root || file !== path.join(root, 'planning', AP.APPROVAL)) return ''
  // Se pregunta sin conceder: una concesión que sobreviviera al mensaje convertiría «agregá src/x.js a
  // .ops-approval» en permiso para escribirle después cualquier otra línea, que es aprobarse solo por la
  // puerta de al lado.
  if (CHAT.authorized(input, [file]).length) return ''
  return `${file} es la aprobación de una persona, y escribírsela es aprobarse solo. Si la persona quiere `
    + 'autorizar algo, que lo diga en el chat —nombrándolo, o contestando «dale» al bloqueo— o que edite el '
    + 'archivo ella.'
}

module.exports = { selfApproval }
