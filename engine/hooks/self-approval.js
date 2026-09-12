'use strict'

// El canal por el que una persona dice «sí» no lo puede escribir el agente: si pudiera, cada bloqueo que
// ofrece aprobarse se aprobaría solo. Pasaba —ningún guard miraba `planning/.ops-approval`— y en la prueba
// en vivo del 092 el agente, frenado, intentó escribírsela (caso 098).
//
// Lo preguntan los dos guards de límites —el que mira un `Write` y el que mira el destino de un comando—,
// que ya son los que deciden dónde puede caer una escritura. La persona edita el archivo a mano, que ningún
// hook ve, o se lo pide al agente nombrándolo en el chat. El registro del chat no lo escribe nunca una
// herramienta.
//
// **Nombrar el archivo autoriza el archivo, no lo que se escribe adentro**, y hasta 0.83.0 eso era todo lo
// que se comprobaba: la persona pedía agregar una ruta inocua, el agente escribía `push origin main`, y esa
// línea después publicaba en la rama viva —el alcance que el 108 le dio a propósito, apoyado en que sólo
// una persona podía escribirla—. Medido punta a punta (caso 119). Por eso lo que llega se compara línea por
// línea contra lo que la persona pidió, y son dos entradas porque cada vía tiene con qué distinto.

const path = require('node:path')
const { contentOf, opsRoot } = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')

const CHAT_RECORD = (file) => `${file} es el registro de lo que la persona dijo en el chat: lo escribe el `
  + 'runner, nunca una herramienta.'

const SELF = (file) => `${file} es la aprobación de una persona, y escribírsela es aprobarse solo. Si la `
  + 'persona quiere autorizar algo, que lo diga en el chat —nombrándolo, o contestando «dale» al bloqueo— o '
  + 'que edite el archivo ella.'

// Las líneas van en el mensaje porque son lo que el «dale» va a aprobar: una confirmación que no muestra
// qué autoriza es la que firma lo que nadie leyó.
const UNASKED = (file, missing) => `${file} es la aprobación de una persona y estas líneas no las pidió:\n`
  + missing.map((line) => `  ${line}\n`).join('')
  + 'Escribí sólo lo que ella nombró en su mensaje. Si hacen falta las otras, decile cuáles y por qué, y '
  + 'esperá: si contesta «dale», reintentá la misma escritura y pasa.'

// **Por shell se frena toda escritura.** Es la misma decisión que toma `ops-config`, y por qué un comando
// no se puede comparar está escrito allá. Lo que la trae hasta acá es que el contenido es lo único que
// separa la línea que la persona pidió de la que el agente se escribe solo.
const BY_COMMAND = (file) => `el comando escribe en ${file}, la aprobación de una persona, y no dice con `
  + 'qué va a quedar el archivo: sin eso no hay cómo saber si lo que se agrega es lo que ella pidió. '
  + 'Mandalo con la herramienta de edición, que trae el contenido y se compara línea por línea, o que lo '
  + 'pegue ella.'

// La raíz de la instancia si `file` es su aprobación, o `null`.
function approvalRoot(input, file) {
  const root = opsRoot(input)
  return root && file === path.join(root, 'planning', AP.APPROVAL) ? root : null
}

// Lo que las dos vías deciden igual: el registro del chat no se escribe nunca, y la aprobación sólo si la
// persona la nombró en su mensaje.
//
// Se pregunta sin conceder: una concesión que sobreviviera al mensaje convertiría «agregá src/x.js a
// .ops-approval» en permiso para escribirle después cualquier otra línea, que es aprobarse solo por la
// puerta de al lado.
function common(input, file) {
  if (file === CHAT.DIR || file.startsWith(`${CHAT.DIR}${path.sep}`)) return CHAT_RECORD(file)
  if (!approvalRoot(input, file)) return ''
  return CHAT.authorized(input, [file]).length ? '' : SELF(file)
}

// Una línea de push no se pregunta como una ruta: `mentions` compara también el basename, así que para
// `push origin feat/login` alcanzaría con que el mensaje pidiera algo del login (caso 103). Es la misma
// partición que hace `push.js` cuando pregunta por un destino.
const isPush = (line) => /^push\s+\S+\s+\S+$/.test(line)

// Por qué no se puede escribir este contenido, o vacío.
//
// **Lo que ya estaba en disco no se vuelve a nombrar**: esta escritura no lo agrega, y exigirlo obligaría a
// repetir el archivo entero para sumar una línea. Quitar tampoco se pregunta: una aprobación más corta
// autoriza menos.
//
// **Un fragmento sí se juzga, al revés que en `ops.config.json`.** Allá el archivo entrante se compara
// entero porque una llave cambia de sentido según lo que la rodea, y un `Edit` manda un pedazo; acá cada
// línea vale por sí sola, así que el pedazo que llega es exactamente lo que se agrega. Lo que no se puede
// leer como líneas —un parche con sus encabezados— no coincide con nada pedido y se frena, que es el lado
// correcto para equivocarse.
//
// Y se pregunta sin heredar lo que la sesión concedió antes: una línea acá la leen todos los guards y llega
// hasta la rama viva, así que tiene que ser la que la persona dijo en el mensaje en curso.
function unasked(input, root, file) {
  const filed = new Set(AP.read(root))
  const added = AP.lines(contentOf(input)).filter((line) => !filed.has(line))
  const pushes = CHAT.authorized(input, added.filter(isPush), { asked: CHAT.ordersPush, inherit: false })
  const paths = CHAT.authorized(input, added.filter((line) => !isPush(line)), { inherit: false })
  const cleared = new Set([...pushes, ...paths].map((one) => one.item))
  const missing = added.filter((line) => !cleared.has(line))
  if (!missing.length) return ''
  // El archivo se anota junto con las líneas: sin él, el «dale» aprobaría las líneas y el guard volvería a
  // frenar por el archivo, que en ese mensaje ya nadie nombra.
  CHAT.hold(input, [file, ...missing])
  return UNASKED(file, missing)
}

// Por qué el agente no puede escribir en `file` con la herramienta de edición, o vacío.
function selfApproval(input, file) {
  const stop = common(input, file)
  if (stop) return stop
  const root = approvalRoot(input, file)
  return root ? unasked(input, root, file) : ''
}

// Lo mismo para el destino de un comando, o vacío.
function selfApprovalShell(input, file) {
  const stop = common(input, file)
  if (stop) return stop
  return approvalRoot(input, file) ? BY_COMMAND(file) : ''
}

module.exports = { selfApproval, selfApprovalShell }
