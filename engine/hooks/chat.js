'use strict'

// Lo que la persona dijo en el chat, capturado por el runner y no contado por el modelo. Existe porque un
// guard sólo ve la llamada a la herramienta: frenaba igual lo que la persona pidió con todas las letras y
// lo que el agente decidió solo, y la única forma de decir «sí» era un archivo que el agente también
// podía escribirse (caso 098).
//
// El hook de mensaje del runner —`UserPromptSubmit` en Claude y Codex, `BeforeAgent` en Gemini— corre
// cuando la persona manda algo, y Claude y Codex le pasan a cada llamada el identificador del mensaje que
// la originó. Lo que llega por otro lado —un README, un ticket, el resultado de una herramienta— nunca
// pasa por acá, y ésa es toda la diferencia entre una orden y una sugerencia.
//
// No es un límite de seguridad, como ningún guard: un agente decidido a escribir este registro lo escribe
// con un script. Lo que se frena es la forma habitual, y la frenan los guards de límites.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// El temporal y no la instancia: el texto de la persona no tiene por qué terminar en un commit, y una
// orden dura lo que dura la sesión.
const DIR = path.join(os.tmpdir(), 'cauce-chat')

// Los recorridos de Cauce, donde el que piensa es el agente y los guards contienen como siempre. Salen de
// los workflows que el paquete entrega, así que uno nuevo queda cubierto sin tocar esto; los de
// `integrations/` se invocan con ese prefijo. Claude y Gemini los llaman con `/`, Codex con `$`.
const WORKFLOWS = path.join(__dirname, '..', '..', 'automatization', 'workflows')
const scripts = (dir, prefix) => fs.readdirSync(dir).filter((one) => one.endsWith('.js'))
  .map((one) => `${prefix}${one.slice(0, -3)}`)
function flowCommand(text) {
  let names = []
  try { names = [...scripts(WORKFLOWS, ''), ...scripts(path.join(WORKFLOWS, 'integrations'), 'integration-')] }
  catch { return false }
  return names.length > 0 && new RegExp(`^\\s*[/$](?:cauce:)?(?:${names.join('|')})(?![\\w-])`).test(text)
}

// Claude lo llama `prompt_id` y Codex `turn_id`; Gemini no manda ninguno y ahí vale el último mensaje.
const idOf = (input) => String(input.prompt_id || input.turn_id || '')
const recordPath = (session) => path.join(DIR, `${String(session).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)

function load(session) {
  try { return JSON.parse(fs.readFileSync(recordPath(session), 'utf8')) } catch { return null }
}

// Nombrar no es pedir: «no toques el .env» nombra el .env. Cuenta la negación que está en la misma frase y
// antes del nombre; la coma corta, porque «leé el config, no el .env» son dos pedidos.
const NEGATION = /(?:^|[^\p{L}])(?:no|nunca|jam[aá]s|ni|sin|not|never|don'?t)(?![\p{L}])/iu
// Un punto corta sólo si cierra la oración: el de `x.js` es parte del nombre, y cortar ahí dejaba el verbo de
// «agregá src/x.js a .ops-approval» en otra frase que la del archivo.
const CLAUSE = /[,;:!?\n]|\.(?=\s|$)/

// Y no negarlo tampoco alcanza: «¿para qué sirven las credentials?» o «el .env tiene algo raro» nombran el
// archivo sin pedir nada (caso 109). La frase del nombre tiene que traer un verbo que pida una acción, en
// español o en inglés; se compara sin tildes y sin el pronombre pegado —«leelo», «abrime»—. La lista va a
// quedar corta, y lo que no reconoce no se pierde: se frena, y un «dale» lo aprueba.
const ASKS = new Set(('lee leer abri abre abrir mostra muestra mostrar ensena edita editar cambia cambiar borra '
  + 'borrar elimina eliminar escribi escribe escribir corre correr ejecuta ejecutar desactiva desactivar apaga '
  + 'apagar reescribi reescribe reescribir agrega agregar anadi anade anadir saca sacar quita quitar actualiza '
  + 'actualizar modifica modificar revisa revisar mira mirar fijate chequea verifica verificar instala instalar '
  + 'subi sube subir pushea pushear commitea commitear usa usar crea crear arregla arreglar carga cargar copia '
  + 'copiar toca tocar aproba aprueba aprobar habilita habilitar reemplaza reemplazar renombra renombrar mueve '
  + 'mover restaura restaurar imprimi imprime imprimir deci dime proba probar '
  + 'read open show print display edit change delete remove write run execute disable rewrite add update modify '
  + 'check review inspect look cat commit push install use create fix load copy touch approve enable replace '
  + 'rename move restore skip').split(' '))
const ENCLITIC = /(?:selo|sela|melo|mela|telo|tela|los|las|lo|la|le|me)$/

function asks(clause) {
  const words = clause.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+/g) || []
  return words.some((word) => ASKS.has(word) || ASKS.has(word.replace(ENCLITIC, '')))
}

// Cada aparición del nombre en el texto: si va negada y si su frase pide algo. Un nombre tiene que estar
// entero: `.env` no aparece en «el .env.example», y un punto sólo lo cierra si termina la frase.
function mentions(text, item) {
  const lower = String(text).toLowerCase()
  const found = []
  for (const name of new Set([item, path.basename(item)].map((one) => one.toLowerCase()))) {
    if (name.length < 3) continue
    for (let at = lower.indexOf(name); at !== -1; at = lower.indexOf(name, at + 1)) {
      const before = lower[at - 1]
      const rest = lower.slice(at + name.length)
      if (before && !/[\s'"`(/]/.test(before)) continue
      if (rest && !/^(?:[\s'"`),;:!?]|\.(?:\s|$)|$)/.test(rest)) continue
      const clause = lower.slice(0, at).split(CLAUSE).pop()
      found.push({ denied: NEGATION.test(clause), asked: asks(`${clause} ${rest.split(CLAUSE)[0]}`) })
    }
  }
  return { named: found.some((one) => one.asked && !one.denied), denied: found.some((one) => one.denied) }
}

// Una orden de publicar se lee aparte, porque `mentions` compara también el basename: para el ítem
// `push origin feat/login` eso es `login`, y «arreglá el login y no subas nada» publicaba (caso 103). Acá
// el remoto y la rama tienen que aparecer tal cual, como palabras enteras, en una frase que pida publicar
// —un verbo de publicar, no cualquiera: «revisá feat/x en origin» no pide un push— y sin una negación
// antes del último de los dos.
const PUSHES = new Set('subi sube subir pushea pushear push publica publicar publish empuja empujar'.split(' '))
function ordersPush(text, item) {
  const [verb, remote, branch] = item.split(' ')
  if (verb !== 'push' || !remote || !branch) return false
  return String(text).split(CLAUSE).some((clause) => {
    // La comilla simple se saca de los bordes y no se corta en ella: partida, «don't» dejaba de ser una
    // negación.
    const words = clause.split(/[\s"`()]+/)
      .map((word) => word.replace(/^'+/, '').replace(/\.$/, '').replace(/'+$/, ''))
    const last = Math.max(words.indexOf(remote), words.indexOf(branch))
    if (words.indexOf(remote) < 0 || words.indexOf(branch) < 0) return false
    const plain = clause.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z]+/g) || []
    return plain.some((word) => PUSHES.has(word) || PUSHES.has(word.replace(ENCLITIC, '')))
      && !NEGATION.test(words.slice(0, last + 1).join(' '))
  })
}

// Quien contesta a un bloqueo que quedó pendiente. Sólo el principio del mensaje: «dale» es la respuesta
// entera o su primera palabra, no algo que aparece en medio de otra frase.
const YES = new RegExp(String.raw`^\s*(?:s[ií]|dale|ok(?:ay)?|hac[eé]lo|hazlo|adelante|aprobado|apruebo`
  + String.raw`|aprob[aá]lo|de acuerdo|yes)(?![\p{L}])`, 'iu')

// El hook de mensaje. Nunca frena: un mensaje de la persona no se bloquea, y sin registro los guards
// deciden como antes. Un texto que empieza con una etiqueta no lo escribió una persona —Claude avisa así
// que terminó un subagente, con `<task-notification>`—, y en CI no hay persona.
//
// Lo concedido es lo único que cruza de un mensaje al siguiente, y se hereda aunque este mensaje no lo
// haya escrito una persona: un aviso del runner en el medio no le quita a nadie lo que ya autorizó. La
// negación se aplica venga de donde venga, porque revocar es la dirección segura.
function record(input) {
  try {
    if (!input.session_id) return
    const text = String(input.prompt || '')
    const human = !process.env.CI && !/^\s*</.test(text)
    const previous = load(input.session_id)
    const approved = human && previous && YES.test(text)
      ? previous.pending.filter((item) => !mentions(text, item).denied)
      : []
    const granted = previous ? (previous.granted || []).filter((one) => !mentions(text, one).denied) : []
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(recordPath(input.session_id), JSON.stringify(
      { id: idOf(input), text, human, flow: flowCommand(text), approved, granted, pending: [] }))
  } catch { /* registrar es un extra: si falla, los guards siguen frenando lo que frenaban */ }
}

// El mensaje de la persona que originó esta llamada, o nada. Nada cuando no hay persona, cuando lo que
// pidió es un recorrido de Cauce, cuando la llamada la hace un subagente —trabajo que el agente delegó,
// y Claude lo marca con `agent_id`— o cuando el registro es de otro mensaje.
function said(input) {
  if (process.env.CI || input.agent_id || !input.session_id) return null
  const saved = load(input.session_id)
  if (!saved || !saved.human || saved.flow) return null
  const current = idOf(input)
  return current && saved.id && current !== saved.id ? null : saved
}

// Con qué autorización pasa un ítem, o vacío si no pasa: lo pidió este mensaje, un «dale» aprobó lo que
// había quedado frenado, o se lo concedieron antes en esta sesión. Qué cuenta como pedirlo depende de qué
// se frena: un archivo se nombra, un push se ordena con su remoto y su rama.
const named = (text, item) => mentions(text, item).named
function why(saved, item, asked, inherit) {
  if (asked(saved.text, item)) return 'orden'
  if (saved.approved.includes(item)) return 'dale'
  if (!inherit) return ''
  return (saved.granted || []).includes(item) ? 'concedido' : ''
}

// Lo que un guard dejó pasar queda anotado, que es la contracara de `hold`: hasta 0.82.0 sólo se anotaba
// lo frenado, así que una autorización usada moría con el mensaje y lo mismo se frenaba una y otra vez.
// Ahí la salida barata era apagar el guard para toda la sesión con una variable, o sea el permiso más
// ancho de los dos (caso 116).
//
// Se anota el ítem **como el guard lo nombró** —la ruta en la forma que ese guard tiene a mano— y no el
// archivo que hay detrás: es el mismo alcance que tiene una línea de `.ops-approval`, angosto de más
// antes que de menos.
function grant(input, saved, items) {
  const before = saved.granted || []
  const granted = [...new Set([...before, ...items])]
  if (granted.length === before.length) return
  try {
    saved.granted = granted
    fs.writeFileSync(recordPath(input.session_id), JSON.stringify(saved))
  } catch { /* sin anotarlo, se vuelve a pedir */ }
}

// Con qué autorización pasa cada uno de los que pasan. Lo pregunta quien necesita el porqué y no sólo el
// qué —el rastro de un push lo anota (caso 112)—, y no concede nada: preguntar no cambia qué va a valer
// en el mensaje siguiente.
//
// Conceder y heredar son dos cosas distintas y hasta 0.83.0 se movían juntas: conceder es escribir en el
// registro, heredar es leer lo que escribió un mensaje anterior. Quien decide algo que vuelve a tener
// consecuencia cada vez que ocurre apaga lo segundo con `inherit: false`, y ahí vale lo que la persona pidió
// en el mensaje en curso o aprobó con un «dale» (caso 119).
function authorized(input, items, { asked = named, inherit = true } = {}) {
  const saved = said(input)
  if (!saved) return []
  return items.map((item) => ({ item, via: why(saved, item, asked, inherit) })).filter((one) => one.via)
}

// Lo que la persona no autorizó de lo que un guard está por frenar; lo que sí, queda concedido.
function unauthorized(input, items) {
  const saved = said(input)
  if (!saved) return items
  const passed = items.filter((item) => why(saved, item, named, true))
  grant(input, saved, passed)
  return items.filter((item) => !passed.includes(item))
}

// Lo mismo sin conceder y sin heredar: lo que no está en el mensaje en curso queda pendiente aunque la
// sesión lo haya dejado pasar antes.
function unauthorizedNow(input, items) {
  const cleared = new Set(authorized(input, items, { inherit: false }).map((one) => one.item))
  return items.filter((item) => !cleared.has(item))
}

// Lo que quedó frenado, para que un «dale» en el mensaje siguiente apruebe exactamente eso y nada más.
// Devuelve si hay una persona a quien preguntarle.
function hold(input, items) {
  const saved = said(input)
  if (!saved) return false
  try {
    saved.pending = [...new Set([...saved.pending, ...items])]
    fs.writeFileSync(recordPath(input.session_id), JSON.stringify(saved))
    return true
  } catch { return false }
}

module.exports = { DIR, record, said, authorized, unauthorized, unauthorizedNow, hold, ordersPush }
