'use strict'

// Lo que la persona concede hablando: qué nombró, qué negó y hasta cuándo vale.

const { blocked, chatSession, messageOf, planFirstRoot, WIP_IDLE, WIP_CON_PLAN } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { execute, executeAll, guards } = require('../../engine/hooks/run')

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
    assert.match(frenado, /si contesta «dale», reintentá el mismo cambio/)
    assert.doesNotMatch(frenado, /Aprobalo pegando/)
    // Y el espejo, que es la mitad que no se escribe sola: sin persona en el chat no se ofrece contestar,
    // porque no hay a quién (caso 118). La rama existe en `HOW` y hasta acá nadie la fijaba por este lado,
    // así que invertir el ternario no rompía ninguna prueba.
    const sinChat = messageOf('secrets-read', lee((one) => one))
    assert.doesNotMatch(sinChat, /«dale»/, 'sin sesión de chat no se ofrece la salida por chat')
    assert.match(sinChat, /Aprobalo pegando/, 'y queda la que sí está disponible')
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
