'use strict'

// El canal por el que una persona dice «sí» no lo puede escribir el agente: si pudiera, cada bloqueo que
// ofrece aprobarse se aprobaría solo. Pasaba —ningún guard miraba `planning/.ops-approval`— y en la prueba
// en vivo del 092 el agente, frenado, intentó escribírsela (caso 098).
//
// Lo preguntan los dos guards de límites —el que mira un `Write` y el que mira el destino de un comando—,
// que ya son los que deciden dónde puede caer una escritura. La persona edita el archivo a mano, que ningún
// hook ve, o se lo pide al agente en el chat: nombrándolo, o confirmando el bloqueo que le mostró qué iba a
// escribir. El registro del chat no lo escribe nunca una herramienta.
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
  + 'persona quiere autorizar algo, que lo diga en el chat —nombrándolo, o confirmando el bloqueo— o '
  + 'que edite el archivo ella.'

// Las líneas van en el mensaje porque son lo que el «dale» va a aprobar: una confirmación que no muestra
// qué autoriza es la que firma lo que nadie leyó.
const UNASKED = (file, missing) => `${file} es la aprobación de una persona y estas líneas no las pidió:\n`
  + missing.map((line) => `  ${line}\n`).join('')
  + 'Escribí sólo lo que ella nombró en su mensaje. Si hacen falta las otras, decile cuáles y por qué, y '
  + 'pedile que lo confirme con sus palabras: si lo que contesta es un sí, reintentá la misma escritura y pasa.'

// Lo mismo que `UNASKED`, para cuando además el archivo no se nombró: ninguna de las líneas está pedida.
const UNNAMED = (file, lines) => `${file} es la aprobación de una persona, y escribírsela es aprobarse solo. `
  + 'Esta escritura agrega:\n' + lines.map((line) => `  ${line}\n`).join('')
  + 'Decile qué querés dejar aprobado y por qué, y pedile que lo confirme con sus palabras: si lo que contesta '
  + 'es un sí, reintentá la misma escritura y pasa. Si no, que lo edite ella.'

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
// persona la nombró en su mensaje o confirmó el bloqueo que la frenaba.
//
// Se pregunta sin conceder: una concesión que sobreviviera al mensaje convertiría «agregá src/x.js a
// .ops-approval» en permiso para escribirle después cualquier otra línea, que es aprobarse solo por la
// puerta de al lado.
const named = (input, file) => CHAT.authorized(input, [file]).length > 0
const chatRecord = (file) => file === CHAT.DIR || file.startsWith(`${CHAT.DIR}${path.sep}`)

// Lo que esta escritura agrega al archivo. **Lo que ya estaba en disco no se vuelve a nombrar**: esta
// escritura no lo agrega, y exigirlo obligaría a repetir el archivo entero para sumar una línea. Quitar
// tampoco se pregunta: una aprobación más corta autoriza menos.
function added(input, root) {
  const filed = new Set(AP.read(root))
  return AP.lines(contentOf(input)).filter((line) => !filed.has(line))
}

// El archivo sin nombrar frenaba sin anotar nada, así que la salida que el propio mensaje ofrecía
// —confirmar el bloqueo— no aprobaba nada: el «dale» siguiente volvía a frenar igual, y la persona sólo
// podía destrabarlo con la frase exacta que nombra el archivo con un verbo (caso 202). Se anota el archivo
// con las líneas que trae, que es lo que la confirmación va a aprobar y lo que el mensaje le muestra.
function unnamed(input, root, file) {
  const lines = added(input, root)
  const held = lines.length ? CHAT.hold(input, [file, ...lines]) : false
  if (!held || held.dropped.length) return SELF(file)
  return UNNAMED(file, lines)
}

// Una línea de push no se pregunta como una ruta: `mentions` compara también el basename, así que para
// `push origin feat/login` alcanzaría con que el mensaje pidiera algo del login (caso 103). Es la misma
// partición que hace `push.js` cuando pregunta por un destino.
const isPush = (line) => /^push\s+\S+\s+\S+$/.test(line)

// Por qué no se puede escribir este contenido, o vacío.
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
  const lines = added(input, root)
  const pushes = CHAT.authorized(input, lines.filter(isPush), { asked: CHAT.ordersPush, inherit: false })
  const paths = CHAT.authorized(input, lines.filter((line) => !isPush(line)), { inherit: false })
  const cleared = new Set([...pushes, ...paths].map((one) => one.item))
  const missing = lines.filter((line) => !cleared.has(line))
  if (!missing.length) return ''
  // El archivo se anota junto con las líneas: sin él, el «dale» aprobaría las líneas y el guard volvería a
  // frenar por el archivo, que en ese mensaje ya nadie nombra.
  CHAT.hold(input, [file, ...missing])
  return UNASKED(file, missing)
}

// Por qué el agente no puede escribir en `file` con la herramienta de edición, o vacío.
function selfApproval(input, file) {
  if (chatRecord(file)) return CHAT_RECORD(file)
  const root = approvalRoot(input, file)
  if (!root) return ''
  return named(input, file) ? unasked(input, root, file) : unnamed(input, root, file)
}

// Lo mismo para el destino de un comando, o vacío.
function selfApprovalShell(input, file) {
  if (chatRecord(file)) return CHAT_RECORD(file)
  if (!approvalRoot(input, file)) return ''
  return named(input, file) ? BY_COMMAND(file) : SELF(file)
}

module.exports = { selfApproval, selfApprovalShell }
