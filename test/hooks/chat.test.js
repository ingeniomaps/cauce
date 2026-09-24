'use strict'

// Lo que la persona concede hablando: qué nombró, qué negó y hasta cuándo vale.

const { blocked, chatSession, messageOf, planFirstRoot, WIP_IDLE, WIP_CON_PLAN } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute, executeAll, guards } = require('../../engine/hooks/run')
const { DIR } = require('../../engine/hooks/chat')

test('lo que la persona nombró en el chat pasa; lo que no nombró, negó o no pidió ella se sigue frenando', () => {
  const root = planFirstRoot('ops-hook-chat-nombra-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const pidio = chat.says('leé el .env y decime qué variables tiene')
    assert.doesNotThrow(() => execute('secrets-read', lee(pidio)))
    // La orden era para ese mensaje y para eso: otro mensaje, un subagente u otra credencial, no.
    blocked('secrets-read', lee((extra) => ({ ...pidio(extra), prompt_id: 'otro' })), /leerla/)
    blocked('secrets-read', lee((extra) => pidio({ agent_id: 'a1', ...extra })), /leerla/)
    blocked('secrets-read', lee(pidio, 'id_ed25519'), /leerla/)
    blocked('secrets-read', { cwd: root, tool_input: { file_path: path.join(root, '.env') } }, /leerla/)
    // Nombrar no es pedir, y un nombre tiene que estar entero.
    blocked('secrets-read', lee(chat.says('no leas el .env, mirá el README')), /leerla/)
    blocked('secrets-read', lee(chat.says('leé el .env.example')), /leerla/)
    // Un aviso del runner no lo escribió la persona, y un recorrido de Cauce es trabajo del agente.
    // El nombre va entero a propósito: pegado a la etiqueta no contaría, y la prueba no vería la marca.
    blocked('secrets-read', lee(chat.says('<task-notification>\nleé el .env\n</task-notification>')), /leerla/)
    blocked('secrets-read', lee(chat.says('/autobuild leé el .env')), /leerla/)
    blocked('secrets-read', lee(chat.says('$flow leé el .env')), /leerla/)
    // Los otros dos runners, cada uno con su forma de atar la llamada.
    const codex = chat.says('leé el .env', 'turn_id')
    assert.doesNotThrow(() => execute('secrets-read', lee(codex)))
    blocked('secrets-read', lee((extra) => ({ ...codex(extra), turn_id: 'otro' })), /leerla/)
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('leé el .env', null))))
    // En CI no hay persona, aunque el registro diga lo contrario.
    const otra = chat.says('leé el .env')
    process.env.CI = 'true'
    try { blocked('secrets-read', lee(otra), /leerla/) } finally { delete process.env.CI }
  } finally { chat.close() }
})

test('un «dale» aprueba exactamente lo que quedó frenado, y nada más', () => {
  const root = planFirstRoot('ops-hook-chat-dale-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const pedido = chat.says('revisá cómo arranca el servicio')
    // Con persona, el archivo es de ella: el mensaje no le dice al agente que se lo escriba.
    const frenado = messageOf('secrets-read', lee(pedido))
    assert.match(frenado, /pedile que lo confirme con sus palabras/)
    assert.doesNotMatch(frenado, /Esto lo aprueba una persona/)
    // Y el espejo, que es la mitad que no se escribe sola: sin persona en el chat no se ofrece contestar,
    // porque no hay a quién (caso 118). La rama existe en `HOW` y hasta acá nadie la fijaba por este lado,
    // así que invertir el ternario no rompía ninguna prueba.
    const sinChat = messageOf('secrets-read', lee((one) => one))
    assert.doesNotMatch(sinChat, /«dale»/, 'sin sesión de chat no se ofrece la salida por chat')
    assert.match(sinChat, /Esto lo aprueba una persona: que pegue ella tal cual/, 'y queda la que sí está disponible')
    // Dicha a la persona y no al agente: en imperativo, el agente intentaba escribírsela (caso 194).
    assert.doesNotMatch(sinChat, /Aprobalo/)
    assert.match(sinChat, /Vos no lo escribas/)
    const dale = chat.says('dale')
    assert.doesNotThrow(() => execute('secrets-read', lee(dale)))
    blocked('secrets-read', lee(dale, 'id_ed25519'), /leerla/)
    // Lo que el «dale» aprobó y el guard dejó pasar sigue valiendo en el mensaje siguiente (caso 116); lo
    // que esa respuesta no cubrió, no.
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('ahora otra cosa'))))
    blocked('secrets-read', lee(chat.says('ahora otra cosa'), 'id_ed25519'), /leerla/)
    // Y lo que la respuesta niega no se aprueba, ni sigue valiendo lo que ya se había concedido.
    blocked('secrets-read', lee(chat.says('no toques el .env por ahora')), /leerla/)
    messageOf('secrets-read', lee(chat.says('revisá todo')))
    blocked('secrets-read', lee(chat.says('sí, pero no el .env')), /leerla/)
  } finally { chat.close() }
})

// Un pedido de una persona ocupa varios mensajes, y hasta 0.82.0 su autorización moría en el primero: lo
// que ella acababa de autorizar se volvía a frenar apenas escribía cualquier otra cosa (caso 116).
test('lo que la persona autorizó sigue valiendo en los mensajes siguientes, hasta que ella lo niegue', () => {
  const root = planFirstRoot('ops-hook-chat-concede-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('leé el .env y decime qué variables tiene'))))
    // Los dos mensajes siguientes no repiten el pedido: acá es donde volvía a frenarse.
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('gracias, seguí con eso'))))
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('ahora contame qué encontraste'))))
    // Lo concedido es ese ítem y ninguno más, y no alcanza a un subagente.
    blocked('secrets-read', lee(chat.says('seguí'), 'id_ed25519'), /leerla/)
    const ahora = chat.says('seguí')
    blocked('secrets-read', lee((extra) => ahora({ agent_id: 'a1', ...extra })), /leerla/)
    // La negación revoca, y lo revocado no vuelve solo con el mensaje que sigue.
    blocked('secrets-read', lee(chat.says('no toques el .env, mirá el README')), /leerla/)
    blocked('secrets-read', lee(chat.says('seguí con lo tuyo')), /leerla/)
  } finally { chat.close() }
})

// El registro es por sesión, que es lo que hace que cerrarla alcance para que nada siga concedido.
test('lo que se concedió en una sesión no vale en otra', () => {
  const root = planFirstRoot('ops-hook-chat-concede-sesion-', WIP_CON_PLAN)
  const lee = (call) => call({ cwd: root, tool_input: { file_path: path.join(root, '.env') } })
  const una = chatSession()
  const otra = chatSession()
  try {
    assert.doesNotThrow(() => execute('secrets-read', lee(una.says('leé el .env'))))
    blocked('secrets-read', lee(otra.says('seguí con eso')), /leerla/)
  } finally {
    una.close()
    otra.close()
  }
})

// Nombrar no es pedir (caso 109): la frase del nombre tiene que pedir algo. Una pregunta o un comentario al
// pasar no autorizan; un pedido con verbo sí, también con el pronombre pegado o en inglés.
test('mencionar algo en el chat no lo autoriza: la frase tiene que pedirlo', () => {
  const root = planFirstRoot('ops-hook-chat-pide-', WIP_CON_PLAN)
  const lee = (call, file) => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    for (const [mensaje, archivo] of [
      ['el deploy falla por las credentials de AWS, revisá el pipeline', 'credentials'],
      ['¿para qué sirven las credentials?', 'credentials'],
      ['el .env tiene algo raro? no sé', '.env'],
    ]) blocked('secrets-read', lee(chat.says(mensaje), archivo), /leerla/)
    for (const [mensaje, archivo] of [
      ['leé el archivo credentials', 'credentials'], ['abrime el .env', '.env'],
      ['mostrame el .npmrc', '.npmrc'], ['please read the .env', '.env'], ['¿el .env lo podés abrir?', '.env'],
    ]) assert.doesNotThrow(() => execute('secrets-read', lee(chat.says(mensaje), archivo)), mensaje)
  } finally { chat.close() }
})

// Caso 120. En inglés la negación se escribe contraída, y `NEGATION` sólo conocía `don't`: «the tool
// doesn't read the .env» nombra el archivo, trae un verbo de la lista y ninguna negación reconocida, así
// que una frase que **prohíbe** pasaba a autorizar. Es el error en la dirección peligrosa, al revés que el
// 109: ahí lo que sobraba era permiso por nombrar; acá, permiso por no entender que se estaba negando.
test('una negación contraída en inglés revoca igual que la escrita entera', () => {
  const root = planFirstRoot('ops-hook-chat-negacion-en-', WIP_CON_PLAN)
  const lee = (call, file) => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    for (const mensaje of [
      "the tool doesn't read the .env",
      "the tool doesn't allow the .env",
      "we can't read the .env",
      "it isn't allowed to touch the .env",
      "we won't open the .env",
      // El control: la forma sin contraer ya frenaba. Está acá para que lo que mida esta prueba sea la
      // contracción y no la negación en general — sin él, un `NEGATION` roto entero daría el mismo verde.
      'the tool does not read the .env',
    ]) blocked('secrets-read', lee(chat.says(mensaje), '.env'), /leerla/)
    // Y lo que sí pide sigue pasando: reconocer más negaciones no puede volverse un freno general.
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('please read the .env'), '.env')))
  } finally { chat.close() }
})

test('plan-first no frena lo que la persona pidió en el chat, y sí el trabajo del agente', () => {
  const root = planFirstRoot('ops-hook-chat-plan-', WIP_IDLE)
  const escribe = (call) => call({ cwd: root, tool_input: { file_path: path.join(root, 'src', 'altas.js') } })
  const chat = chatSession()
  try {
    const pedido = chat.says('arreglá el typo del mensaje de altas')
    assert.doesNotThrow(() => execute('plan-first', escribe(pedido)))
    blocked('plan-first', escribe((extra) => pedido({ agent_id: 'a1', ...extra })), /sin plan/)
    blocked('plan-first', escribe(chat.says('/autobuild alta-de-cliente')), /sin plan/)
    blocked('plan-first', escribe((extra) => extra), /sin plan/)
  } finally { chat.close() }
})

test('los guards de límites no dejan al agente escribirse la aprobación ni el registro del chat', () => {
  const { DIR } = require('../../engine/hooks/chat')
  const root = planFirstRoot('ops-hook-autoaprueba-', WIP_CON_PLAN)
  const approval = path.join(root, 'planning', '.ops-approval')
  const escribe = (file) => ({ cwd: root, tool_input: { file_path: file, content: 'src/x.js\n' } })
  const corre = (command) => ({ cwd: root, tool_input: { command } })

  blocked('workspace-boundary', escribe(approval), /aprobarse solo/)
  blocked('shell-boundary', corre('echo src/x.js >> planning/.ops-approval'), /aprobarse solo/)
  blocked('workspace-boundary', escribe(path.join(DIR, 'x.json')), /registro de lo que la persona dijo/)
  // El temporal es un destino neutro para `shell-boundary`, y el registro vive ahí: se juzga igual.
  blocked('shell-boundary', corre(`echo {} > ${path.join(DIR, 'x.json')}`), /registro de lo que la persona dijo/)
  // Los dos grupos de escritura lo corren.
  assert.throws(() => executeAll(['pre-files'], escribe(approval)), /aprobarse solo/)
  assert.throws(() => executeAll(['pre-shell'], corre('echo src/x.js >> planning/.ops-approval')), /aprobarse solo/)
  // Lo corriente pasa: otra ruta, o leer el archivo.
  assert.doesNotThrow(() => execute('workspace-boundary', escribe(path.join(root, 'src', 'x.js'))))
  assert.doesNotThrow(() => execute('shell-boundary', corre('cat planning/.ops-approval')))
  // Si la persona se lo pide nombrándolo, la que aprueba es ella.
  const chat = chatSession()
  try {
    const pidio = chat.says('agregá src/x.js a .ops-approval')
    assert.doesNotThrow(() => execute('workspace-boundary', pidio(escribe(approval))))
  } finally { chat.close() }
})

// Por qué una notificación no puede borrar a la persona está junto a `askable` (engine/hooks/chat.js). Lo
// que el caso agrega es el texto: sale de un registro real de `/tmp/cauce-chat/` y no de una suposición
// sobre el formato, que es lo que separa medir de adivinar acá. Y llega hasta el «dale» del mensaje
// siguiente, porque ofrecer la salida sin anotar lo frenado no serviría de nada.
test('una notificación de tarea de fondo no se lleva puesta a la persona del chat', () => {
  const root = planFirstRoot('ops-hook-chat-despertado-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const pedido = chat.says('revisá cómo arranca el servicio')
    assert.match(messageOf('secrets-read', lee(pedido)), /pedile que lo confirme/, 'con la persona hablando')

    const despertado = chat.says('<task-notification>\n<task-id>abc</task-id>\n</task-notification>')
    const frenado = messageOf('secrets-read', lee(despertado))
    assert.match(frenado, /pedile que lo confirme con sus palabras/,
      'y sigue ofreciéndose después de la notificación, que es cuando la persona está leyendo')
    assert.doesNotMatch(frenado, /Esto lo aprueba una persona/, 'sin mandarla a copiar y pegar')

    // Y el «dale» del mensaje siguiente aprueba lo que se frenó en el turno despertado: anotar lo pendiente
    // es la mitad que hace que ofrecerlo sirva de algo.
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('dale'))))
  } finally { chat.close() }
})

// La contracara, que es la que no se escribe sola: ofrecer el «dale» no concede nada. Una notificación
// entre medio no puede hacer que el mensaje viejo de la persona autorice algo que se frenó después.
test('una notificación no hereda la autorización del mensaje anterior', () => {
  const root = planFirstRoot('ops-hook-chat-no-hereda-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    chat.says('leé el .env y decime qué variables tiene')
    const despertado = chat.says('<task-notification>\n<task-id>abc</task-id>\n</task-notification>')
    blocked('secrets-read', lee(despertado), /leerla/)
  } finally { chat.close() }
})

// Lo que dijo la persona sobrevive al aviso en las dos direcciones: su «no» y lo que quedó esperando su
// respuesta. Por qué, junto a `spoken` en engine/hooks/chat.js.
test('un aviso en el medio no borra lo que dijo la persona', () => {
  const root = planFirstRoot('ops-hook-chat-aviso-medio-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const aviso = '<task-notification>\n<task-id>abc</task-id>\n</task-notification>'
  const niega = chatSession()
  try {
    niega.says('no toques el .env')
    blocked('secrets-read', lee(niega.says(aviso)), /leerla/)
    blocked('secrets-read', lee(niega.says('seguí con lo tuyo')), /leerla/)
  } finally { niega.close() }

  const espera = chatSession()
  try {
    blocked('secrets-read', lee(espera.says('revisá cómo arranca el servicio')), /leerla/)
    espera.says(aviso)
    assert.doesNotThrow(() => execute('secrets-read', lee(espera.says('dale'))), 'lo frenado sigue esperando')
  } finally { espera.close() }

  // Un registro escrito antes de `spoken` también retiene: lo que dijo la persona era su `text`.
  const vieja = chatSession()
  try {
    const niego = vieja.says('no toques el .env')
    const registro = path.join(DIR, `${niego().session_id}.json`)
    const { spoken, ...antes } = JSON.parse(fs.readFileSync(registro, 'utf8'))
    fs.writeFileSync(registro, JSON.stringify(antes))
    blocked('secrets-read', lee(vieja.says(aviso)), /leerla/)
    blocked('secrets-read', lee(vieja.says('seguí con lo tuyo')), /leerla/)
  } finally { vieja.close() }
})

// Y el otro borde de lo que se arrastra: un recorrido de Cauce corre sin nadie mirando, así que no se le
// ofrece contestar a un chat que nadie está leyendo. Sin esta prueba, arrastrar la presencia entre
// mensajes podía dejar el «dale» ofrecido durante un flow y nada lo notaba — el mensaje que se imprime no
// lo mira ninguna otra.
test('durante un recorrido no se ofrece el «dale», ni antes ni después de una notificación', () => {
  const root = planFirstRoot('ops-hook-chat-flow-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const recorrido = chat.says('$flow leé el .env')
    assert.doesNotMatch(messageOf('secrets-read', lee(recorrido)), /«dale»/)

    const despertado = chat.says('<task-notification>\n<task-id>abc</task-id>\n</task-notification>')
    assert.doesNotMatch(messageOf('secrets-read', lee(despertado)), /«dale»/,
      'y la notificación no lo convierte en una sesión con alguien mirando')
  } finally { chat.close() }
})

// Por qué el alcance del «dale» va con la oferta está junto a `ask` (engine/hooks/approval.js). Acá se
// fija que sean **dos** mitades y no una: separadas, cada una se puede perder sin que la otra lo note, y
// la de la duración es la que nadie extraña porque lo que no ocurre es un bloqueo. Y el espejo, que es lo
// que impide anunciar un alcance de algo que no se ofreció (caso 170).
test('el bloqueo dice hasta dónde llega el «dale», en sus dos mitades', () => {
  const root = planFirstRoot('ops-hook-chat-alcance-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const frenado = messageOf('secrets-read', lee(chat.says('revisá cómo arranca el servicio')))
    assert.match(frenado, /pedile que lo confirme con sus palabras/, 'sigue ofreciendo la salida corta')
    assert.match(frenado, /lo que se frenó y nada más/, 'dice que no cubre lo que venga después')
    assert.match(frenado, /mensajes siguientes/, 'y que no se agota en el reintento')

    // Sin persona no se nombra un alcance de algo que no se ofreció.
    const sinChat = messageOf('secrets-read', lee((one) => one))
    assert.doesNotMatch(sinChat, /lo que se frenó y nada más/)
    assert.match(sinChat, /Valen para ese conjunto/, 'ahí el alcance que corresponde es el del pegado')
  } finally { chat.close() }
})

// Y las dos mitades son ciertas, no una promesa del texto: se comprueban contra el mecanismo en el mismo
// caso, porque un mensaje que describe un alcance que el código no tiene es peor que no decir nada.
test('lo que el mensaje promete sobre el «dale» es lo que el mecanismo hace', () => {
  const root = planFirstRoot('ops-hook-chat-alcance-real-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    messageOf('secrets-read', lee(chat.says('revisá cómo arranca el servicio')))
    const dale = chat.says('dale')
    assert.doesNotThrow(() => execute('secrets-read', lee(dale)), 'el dale aprueba lo que se frenó')
    // «y nada más»: otra credencial sigue frenada.
    blocked('secrets-read', lee(dale, 'id_ed25519'), /leerla/)
    // «sigue valiendo en los mensajes siguientes»: sin repetir el pedido.
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('seguí con eso'))))
  } finally { chat.close() }
})

// Caso 184. Confirmar un bloqueo no exige ninguna palabra: el guard aprobaba sólo si el mensaje empezaba
// con una de once formas, y «listo», «claro» o «bueno dale» volvían a frenar lo que la persona aprobó. Lo
// que el guard sigue decidiendo es la dirección segura: negar, frenar o preguntar no aprueban, y lo que se
// frena mientras ella dice que no, no queda esperando una confirmación.
test('un bloqueo se confirma con cualquier palabra, y negar, frenar o preguntar no lo aprueba', () => {
  const root = planFirstRoot('ops-hook-chat-confirma-', WIP_CON_PLAN)
  const lee = (call) => call({ cwd: root, tool_input: { file_path: path.join(root, '.env') } })
  // Una sesión por respuesta, para que ninguna confirme el bloqueo de otra.
  const sesiones = []
  const tras = (respuesta, pedido = 'revisá cómo arranca el servicio') => {
    const chat = chatSession()
    sesiones.push(chat)
    messageOf('secrets-read', lee(chat.says(pedido)))
    return () => execute('secrets-read', lee(chat.says(respuesta)))
  }
  try {
    for (const si of ['dale', 'listo', 'claro', 'confirmo', 'bueno dale', 'procede', 'perfecto, seguí', 'está bien']) {
      assert.doesNotThrow(tras(si), `«${si}» confirma`)
    }
    for (const no of ['no', 'mejor no', 'pará', 'esperá un momento', 'cancelá eso', '¿para qué sirve?', 'stop']) {
      assert.throws(tras(no), (error) => error.blocked === true, `«${no}» no confirma`)
    }
    // Frenado mientras ella decía que no: el mensaje siguiente, aunque sea un sí, no lo reabre.
    assert.throws(tras('listo', 'no toques el .env'), (error) => error.blocked === true,
      'lo que ella acababa de negar no queda esperando')
  } finally { for (const chat of sesiones) chat.close() }
})

// Caso 188: dónde se lee la negación, junto a `hold` en engine/hooks/chat.js. Las dos direcciones, y el
// bloqueo diciendo lo que no quedó anotado.
test('una negación sobre otra cosa no borra el bloqueo, y la que nombra lo frenado sí', () => {
  const root = planFirstRoot('ops-hook-chat-negacion-', WIP_CON_PLAN)
  const lee = (call) => call({ cwd: root, tool_input: { file_path: path.join(root, '.env') } })
  const sesiones = []
  const tras = (pedido) => {
    const chat = chatSession()
    sesiones.push(chat)
    const frenado = messageOf('secrets-read', lee(chat.says(pedido)))
    return { frenado, confirma: () => execute('secrets-read', lee(chat.says('confirmo'))) }
  }
  try {
    for (const pedido of ['dale, fijate si esto no es un defecto', 'dale, sin apuro', 'seguí; no hay prisa']) {
      const { frenado, confirma } = tras(pedido)
      assert.match(frenado, /pedile que lo confirme/, `«${pedido}» ofrece confirmar`)
      assert.doesNotThrow(confirma, `tras «${pedido}», confirmar aprueba`)
    }
    for (const pedido of ['dale, pero no el .env', 'seguí, no toques el .env', 'no, dale', 'pará, después vemos']) {
      const { frenado, confirma } = tras(pedido)
      assert.throws(confirma, (error) => error.blocked === true, `tras «${pedido}», confirmar no lo aprueba`)
      assert.match(frenado, /no quedó esperando/, `«${pedido}» dice que no quedó anotado`)
      assert.doesNotMatch(frenado, /pedile que lo confirme/, `«${pedido}» no ofrece una confirmación inútil`)
    }
  } finally { for (const chat of sesiones) chat.close() }
})
