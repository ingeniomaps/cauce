'use strict'

// El rastro local de una autorización: una línea JSON por cosa que pasó porque alguien la autorizó.
//
// **Sólo agrega**, a diferencia de un registro rodante como el de gates: lo que una auditoría pregunta es
// justamente la entrada vieja.
//
// **No frena nada si no se puede escribir.** Lo que se anota ya fue autorizado antes de llegar acá, así
// que un registro que falla no puede convertirse en un bloqueo: sería negar por no haber podido contar.
//
// **El texto de la persona no entra**, y eso lo decide quien arma las entradas: la vía y la sesión
// alcanzan para reconstruir qué pasó, y el texto se queda en el temporal, que es donde el 098 lo dejó.
//
// Vive en su propio módulo y no dentro del guard que lo usa porque lo escriben dos —el push que se
// autorizó (caso 112) y la concesión del chat (caso 127)— y `chat.js` **no puede importar a `push.js`**:
// `push.js` ya lo importa a él, así que el require sería circular. Escrito dos veces, una de las dos
// copias se pudre sin que nada falle.
//
// Las entradas llegan armadas y no se tocan acá: cada rastro nombra sus campos como corresponde a lo que
// anota —`authorizedAt` no es `grantedAt`— y el orden de las claves es parte de lo que sus pruebas fijan.

const fs = require('node:fs')
const path = require('node:path')

function append(root, relative, entries) {
  if (!root || !entries.length) return
  try {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${entries.map((one) => JSON.stringify(one)).join('\n')}\n`)
  } catch { /* lo anotado ya estaba autorizado: no lo frena un registro que no se pudo escribir */ }
}

module.exports = { append }
