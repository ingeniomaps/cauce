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

const fs = require('node:fs')
const path = require('node:path')
const { contentOf, carriesContent, opsRoot, configOf } = require('./input')
const { withTaskTrees } = require('../core/task-trees')
const AP = require('./approval')
const CHAT = require('./chat')
const CF = require('./confirm')

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

// Con diálogo, lo que la persona aprueba es esta escritura con estas líneas, y el diálogo se las muestra en
// el motivo: es la misma regla de arriba —no firmar lo que nadie leyó— sin pedirle que conteste por chat.
function ASKED(input, file, lines) {
  CF.askPerson(input)
  return `el agente quiere agregar a ${file}, la aprobación de una persona, estas líneas:\n`
    + lines.map((line) => `  ${line}\n`).join('') + CF.LEAD
}

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
//
// Un `Edit` se juzga por el archivo que queda y no por el fragmento que entra: borrar un `#` activa la línea
// que comentaba, y el fragmento nuevo —vacío— no la nombra. Se simula el reemplazo sobre lo que hay en disco
// y se comparan las líneas resultantes; lo que `Write` o un parche traen entero se lee como siempre.
function resulting(input, root) {
  // El archivo puede haber llegado sin `tool_input` —de primer nivel, en un parche suelto o por `OPS_HOOK_FILE`—, y
  // sin `old_string` se lee entero como siempre (caso 427).
  const fields = input.tool_input || {}
  if (typeof fields.old_string !== 'string') return contentOf(input)
  let disk = ''
  try { disk = fs.readFileSync(path.join(root, 'planning', AP.APPROVAL), 'utf8') } catch { disk = '' }
  // Sin `new_string` el reemplazo es un borrado, que es lo que esta función existe para ver.
  const next = typeof fields.new_string === 'string' ? fields.new_string : ''
  if (!fields.old_string) return disk + next
  return fields.replace_all === true ? disk.split(fields.old_string).join(next) : disk.replace(fields.old_string, next)
}

function added(input, root) {
  const filed = new Set(AP.read(root))
  return AP.lines(resulting(input, root)).filter((line) => !filed.has(line))
}

// El archivo sin nombrar frenaba sin anotar nada, así que la salida que el propio mensaje ofrecía
// —confirmar el bloqueo— no aprobaba nada: el «dale» siguiente volvía a frenar igual, y la persona sólo
// podía destrabarlo con la frase exacta que nombra el archivo con un verbo (caso 202). Se anota el archivo
// con las líneas que trae, que es lo que la confirmación va a aprobar y lo que el mensaje le muestra.
function unnamed(input, root, file) {
  const lines = added(input, root)
  // Con cuerpo y sin ninguna línea nueva —comentarios, o quitar— no hay aprobación que darse: frenar acá
  // dejaba el único bloqueo sin salida, con un mensaje que ofrecía confirmar un bloqueo que no existía (caso
  // 374). La otra vía, con el archivo nombrado, ya lo dejaba pasar.
  // Sin cuerpo no hay nada que juzgar, y se frena: es el lado correcto para equivocarse.
  if (!lines.length && carriesContent(input)) return ''
  if (lines.length && CF.native(input)) return ASKED(input, file, lines)
  const held = lines.length ? CHAT.hold(input, [file, ...lines]) : false
  if (!held || held.dropped.length) return SELF(file)
  return UNNAMED(file, lines)
}

// Una línea de push no se pregunta como una ruta: `mentions` compara también el basename, así que para
// `push origin feat/login` alcanzaría con que el mensaje pidiera algo del login (caso 103). Es la misma
// partición que hace `push.js` cuando pregunta por un destino.
const { isPush } = AP

// Lo que la persona nombra por su nombre —`package.json`, `git clean -fd`— no dice de qué repositorio, y desde el 445
// y el 446 cada línea es de uno: dejar pasar todas las que se llaman igual era aprobar en todos lo que ella nombró una
// vez (caso 447). Una línea pedida así pasa sola si nada más se llama igual, o si el mensaje nombra un tramo de su
// lugar que lo demás no tiene. Lo demás es lo que el archivo ya aprueba —si no, partir la escritura en dos pasaba cada
// mitad— y lo mismo en los otros checkouts: con una sola línea el agente elegía por ella, y en la prueba real eligió
// el árbol de una línea entre cinco `package.json` sin que nada preguntara.
const BOUND_BEFORE = /[\s'"`(/]/
const BOUND_AFTER = /^(?:[\s'"`),;:!?]|\.(?:\s|$)|$)/

// Con qué nombre la menciona la persona y dónde vale, o `null` si la línea no es de un lugar.
function placeOf(line) {
  const spoken = CHAT.spokenOf(line)
  if (spoken !== line) return { name: `${spoken} @`, where: line.slice(spoken.length + 3), least: 1 }
  return path.isAbsolute(line) ? { name: path.basename(line), where: line, least: 2 } : null
}

const real = (one) => { try { return fs.realpathSync(one) } catch { return path.resolve(one) } }

// El mismo lugar en los otros checkouts de la instancia —raíces, árboles de tarea y de línea—, si existe.
function siblings(root, where) {
  const declared = (configOf(root).workspaceRoots || []).filter((one) => one && one.path)
    .map((one) => path.resolve(root, one.path))
  const checkouts = [...new Set(withTaskTrees(root, declared).map(real))]
  const at = real(where)
  const own = checkouts.filter((one) => at === one || at.startsWith(`${one}${path.sep}`))
    .sort((one, other) => other.length - one.length)[0]
  if (!own) return []
  const relative = path.relative(own, at)
  return checkouts.filter((one) => one !== own).map((one) => path.join(one, relative))
    .filter((one) => fs.existsSync(one))
}

function says(text, piece) {
  for (let at = text.indexOf(piece); at !== -1; at = text.indexOf(piece, at + 1)) {
    const before = text[at - 1]
    if ((!before || BOUND_BEFORE.test(before)) && BOUND_AFTER.test(text.slice(at + piece.length))) return true
  }
  return false
}

function distinguished(text, own, others) {
  const parts = own.where.split('/').filter(Boolean)
  for (let count = own.least; count <= parts.length; count += 1) {
    const piece = parts.slice(-count).join('/').toLowerCase()
    const shared = others.some((one) => one.toLowerCase() === piece || one.toLowerCase().endsWith(`/${piece}`))
    if (!shared && says(text, piece)) return true
  }
  return false
}

// De las líneas que el mensaje pidió por su nombre, las que no distingue de otra del archivo que se llama igual.
function blurred(input, root, lines, byName) {
  const saved = CHAT.said(input)
  if (!saved || !byName.length) return []
  const text = String(CHAT.wordsOf(saved)).toLowerCase()
  const kept = [...new Set([...AP.read(root), ...lines])].map((line) => ({ line, at: placeOf(line) }))
    .filter((one) => one.at)
  return byName.filter((line) => {
    const own = placeOf(line)
    if (!own) return false
    const others = [...kept.filter((one) => one.line !== line && one.at.name === own.name).map((one) => one.at.where),
      ...siblings(root, own.where)]
    return others.length > 0 && !distinguished(text, own, others)
  })
}

const AMBIGUOUS = (file, lines) => `${file} es la aprobación de una persona, y lo que nombró coincide con más de un `
  + 'lugar:\n' + lines.map((line) => `  ${line}\n`).join('')
  + 'Preguntale cuáles quiere aprobar. Si contesta que sí, reintentá la misma escritura y pasa; si nombra uno, '
  + 'escribí sólo ése.'

// Por qué no se puede escribir este contenido, o vacío.
//
// Cada línea vale por sí sola, al revés que en `ops.config.json`, donde una llave cambia de sentido según lo
// que la rodea: acá alcanza con las líneas que el archivo gana (`resulting`). Lo que no se puede leer como
// líneas —un parche con sus encabezados— no coincide con nada pedido y se frena, que es el lado correcto para
// equivocarse.
//
// Y se pregunta sin heredar lo que la sesión concedió antes: una línea acá la leen todos los guards y llega
// hasta la rama viva, así que tiene que ser la que la persona dijo en el mensaje en curso.
function unasked(input, root, file) {
  const lines = added(input, root)
  const pushes = CHAT.authorized(input, lines.filter(isPush), { asked: CHAT.ordersPush, inherit: false })
  const paths = CHAT.authorized(input, lines.filter((line) => !isPush(line)), { inherit: false })
  const byName = paths.filter((one) => one.via === 'orden').map((one) => one.item)
  const vague = new Set(blurred(input, root, lines, byName))
  const cleared = new Set([...pushes, ...paths].map((one) => one.item).filter((item) => !vague.has(item)))
  const missing = lines.filter((line) => !cleared.has(line))
  if (!missing.length) return ''
  if (CF.native(input)) return ASKED(input, file, missing)
  if (missing.every((line) => vague.has(line))) {
    CHAT.hold(input, [file, ...missing])
    return AMBIGUOUS(file, missing)
  }
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
