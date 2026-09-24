'use strict'

// Publicar: qué lo autoriza, qué no lo autoriza nunca, y quién puede escribir las llaves.

const { tempRoot, outsideTempRoot } = require('../support/environment')
const { blocked, git, chatSession, messageOf, pushRoot, WORK, LIVE } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute, executeAll } = require('../../engine/hooks/run')

test('un push que la persona ordena con su remoto y su rama pasa, y ningún otro', () => {
  const root = pushRoot('ops-hook-push-orden-')
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    const pidio = chat.says('Subí la rama: git push origin feat/x')
    assert.doesNotThrow(() => execute('destructive', push(pidio, 'git push origin feat/x')))
    blocked('destructive', push(pidio, 'git push origin feat/y'), WORK)
    blocked('destructive', push(pidio, 'git push upstream feat/x'), WORK)
    blocked('destructive', push(pidio, 'git push origin feat/x feat/y'), WORK)
    const conBandera = push(chat.says('subí feat/x a origin'), 'git push -u origin feat/x')
    assert.doesNotThrow(() => execute('destructive', conBandera))
    // Nombrar no es ordenar: sin verbo de publicar, con otro verbo, negado, o un nombre dentro de otro. Y el
    // basename no cuenta, que es por lo que esto no pasa por `mentions`.
    for (const [mensaje, command] of [
      ['Arreglá el login y no subas nada', 'git push origin feat/login'],
      ['revisá feat/x en origin', 'git push origin feat/x'],
      ['no subas feat/x a origin', 'git push origin feat/x'],
      // Con el verbo presente, lo único que frena es la negación.
      ['no hay que subir feat/x a origin', 'git push origin feat/x'],
      ["don't push feat/x to origin", 'git push origin feat/x'],
      ['¿qué tiene origin feat/x?', 'git push origin feat/x'],
      ['subí feat/xy a origin2', 'git push origin feat/x'],
    ]) {
      // Cada frase en su sesión: lo que se mide es si la frase ordena, y con una sesión compartida el bloqueo
      // de la anterior queda pendiente y ésta lo confirmaría (caso 184) — otra pregunta, que es del chat.
      const sola = chatSession()
      try { blocked('destructive', push(sola.says(mensaje), command), WORK) } finally { sola.close() }
    }
    // Sin persona no hay orden: un subagente, CI o el registro de otro mensaje.
    const orden = chat.says('subí feat/x a origin')
    blocked('destructive', push((extra) => orden({ ...extra, agent_id: 'sub' }), 'git push origin feat/x'),
      /desde un subagente/)
    blocked('destructive', push((extra) => orden({ ...extra, prompt_id: 'otro' }), 'git push origin feat/x'), WORK)
    process.env.CI = '1'
    try { blocked('destructive', push(orden, 'git push origin feat/x'), WORK) } finally { delete process.env.CI }
    // La orden no habilita el force, ni un push sin destino que comparar.
    blocked('destructive', push(chat.says('git push --force origin feat/x'), 'git push --force origin feat/x'),
      /R8 lo prohíbe/)
    blocked('destructive', push(chat.says('pusheá'), 'git push'), /nombralos/)
  } finally { chat.close() }
})

test('un «dale» a un push frenado aprueba ese push y ningún otro', () => {
  const root = pushRoot('ops-hook-push-dale-')
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    const frenado = messageOf('destructive', push(chat.says('subí la rama'), 'git push origin feat/x'))
    assert.match(frenado, /si lo que contesta es un sí, reintentá el mismo push/)
    // Frenado mientras ella decía que no, no se ofrece confirmar: un sí no lo aprobaría (caso 188).
    const negado = chatSession()
    try {
      const noQuedo = messageOf('destructive', push(negado.says('no, esperá'), 'git push origin feat/x'))
      assert.match(noQuedo, /no quedó esperando su confirmación/)
      assert.doesNotMatch(noQuedo, /reintentá el mismo push/)
    } finally { negado.close() }
    assert.match(frenado, /\n {2}push origin feat\/x\n/)
    const dale = chat.says('dale')
    assert.doesNotThrow(() => execute('destructive', push(dale, 'git push origin feat/x')))
    blocked('destructive', push(dale, 'git push origin feat/y'), WORK)
    // Un push sin destino que resolver también queda pendiente: no hay línea que aprobar, pero sí «dale».
    messageOf('destructive', push(chat.says('pusheá'), 'git push'))
    assert.doesNotThrow(() => execute('destructive', push(chat.says('dale'), 'git push')))
  } finally { chat.close() }
})

test('.ops-approval aprueba un push por su línea exacta, sin patrones', () => {
  const root = pushRoot('ops-hook-push-archivo-')
  const push = (command) => ({ cwd: root, tool_input: { command } })
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'),
    'push origin feat/x\npush origin main\npush origin feat/*\ngit push\n')
  assert.doesNotThrow(() => execute('destructive', push('git push origin feat/x')))
  blocked('destructive', push('git push origin feat/y'), WORK)
  // La línea exacta alcanza la rama viva: la escribe una persona a mano, y el agente no puede.
  assert.doesNotThrow(() => execute('destructive', push('git push origin main')))
  blocked('destructive', push('git push origin master'), LIVE)
  // Una línea sin destino sería un permiso para cualquier rama.
  blocked('destructive', push('git push'), /nombralos/)
})

// Por qué la publicación es la salvedad de lo que se concede está en `publish`, sobre la llamada que lo
// decide.
test('la orden de publicar vale para esa operación y no para el mensaje siguiente', () => {
  const root = pushRoot('ops-hook-push-no-concede-')
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive',
      push(chat.says('subí feat/x a origin'), 'git push origin feat/x')))
    blocked('destructive', push(chat.says('gracias, seguí'), 'git push origin feat/x'), WORK)
  } finally { chat.close() }
})

// Una aprobación se consume sin dejar nada: el «dale» publicaba y un mensaje después no quedaba quién lo
// había autorizado, ni en el registro del chat ni en la instancia (caso 112).
test('un push que pasa por una aprobación deja su línea en el rastro de la instancia', () => {
  const root = pushRoot('ops-hook-push-rastro-')
  const log = path.join(root, 'planning', '.push-log')
  const rastro = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((one) => JSON.parse(one))
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    // Lo que no publica no se anota: hasta que un push pasa, el archivo no existe.
    blocked('destructive', push(chat.says('revisá el repositorio'), 'git push origin feat/x'), WORK)
    assert.equal(fs.existsSync(log), false, 'un push frenado no dejó rastro de haberse autorizado')
    assert.doesNotThrow(() => execute('destructive',
      push(chat.says('subí feat/x a origin'), 'git push origin feat/x')))
    const [primera] = rastro()
    assert.deepEqual(Object.keys(primera), ['authorizedAt', 'remote', 'branch', 'via', 'session'])
    // La fecha es la de la autorización y el nombre lo dice: el hook corre antes del comando.
    assert.match(primera.authorizedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(primera.remote, 'origin')
    assert.equal(primera.branch, 'feat/x')
    assert.ok(primera.session, 'sin la sesión no se puede volver a la conversación que lo autorizó')
    // Las tres vías se distinguen, y el rastro sólo agrega.
    messageOf('destructive', push(chat.says('subí la rama'), 'git push origin feat/y'))
    assert.doesNotThrow(() => execute('destructive', push(chat.says('dale'), 'git push origin feat/y')))
    fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'push origin feat/z\n')
    assert.doesNotThrow(() => execute('destructive', push(chat.says('seguí'), 'git push origin feat/z')))
    assert.deepEqual(rastro().map((one) => [one.branch, one.via]),
      [['feat/x', 'orden'], ['feat/y', 'dale'], ['feat/z', '.ops-approval']])
    // El texto de la persona no sale del temporal.
    assert.equal(/subí feat\/x a origin/.test(fs.readFileSync(log, 'utf8')), false)
  } finally { chat.close() }
})

test('un push por allowPush no escribe el rastro: esa autorización ya está en la configuración', () => {
  const root = pushRoot('ops-hook-push-rastro-llave-', { allowPush: true })
  assert.doesNotThrow(() => execute('destructive',
    { cwd: root, tool_input: { command: 'git push origin feat/x' } }))
  assert.equal(fs.existsSync(path.join(root, 'planning', '.push-log')), false)
})

// Un repositorio sin Cauce no tiene dónde anotar, y eso no cambia lo que se decide.
test('un push ordenado fuera de una instancia pasa sin rastro que escribir', () => {
  const fuera = outsideTempRoot('ops-hook-push-sin-raiz-')
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive',
      chat.says('subí feat/x a origin')({ cwd: fuera, tool_input: { command: 'git push origin feat/x' } })))
    assert.deepEqual(fs.readdirSync(fuera), [], 'sin raíz no se escribió nada en ningún lado')
  } finally { chat.close() }
})

// La garantía de anotar desde un hook que corre antes del comando: cuando el rastro se escribe, el push ya
// estaba autorizado, así que no poder escribirlo no puede frenarlo.
test('un rastro que no se puede escribir no frena el push que ya estaba autorizado', () => {
  const root = tempRoot('ops-hook-push-rastro-roto-')
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush: false } }))
  // `planning` como archivo y no como directorio: la raíz sigue resolviendo —lo que se pregunta es si
  // existe— y escribir adentro falla, que es lo único que hacía falta montar.
  fs.writeFileSync(path.join(root, 'planning'), '')
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive',
      chat.says('subí feat/x a origin')({ cwd: root, tool_input: { command: 'git push origin feat/x' } })))
    assert.equal(fs.statSync(path.join(root, 'planning')).isFile(), true)
  } finally { chat.close() }
})

test('allowPush no alcanza la rama viva sin su permiso, ni a un subagente con ningún permiso', () => {
  const root = pushRoot('ops-hook-push-viva-', { allowPush: true })
  const push = (command, extra = {}) => ({ cwd: root, tool_input: { command }, ...extra })
  const declara = (runner) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner }))
  assert.doesNotThrow(() => execute('destructive', push('git push origin feat/x')))
  for (const command of ['git push origin main', 'git push origin master', 'git push origin HEAD:main',
    'git push origin :main', 'git push origin --delete main', 'git push --all origin',
    'git push origin feat/x refs/heads/main']) {
    blocked('destructive', push(command), LIVE)
  }
  const frenado = messageOf('destructive', push('git push origin main'))
  assert.match(frenado, /runner\.pushToLiveBranches/)
  assert.match(frenado, /\n {2}push origin main\n/)
  blocked('destructive', push('git push origin feat/x', { agent_id: 'sub' }), /desde un subagente/)

  // Nombrada, la rama viva queda como una de trabajo: la alcanza la llave, y la otra sigue afuera.
  declara({ allowPush: true, pushToLiveBranches: ['main'] })
  assert.doesNotThrow(() => execute('destructive', push('git push origin main')))
  blocked('destructive', push('git push origin master'), LIVE)
  blocked('destructive', push('git push origin main', { agent_id: 'sub' }), /desde un subagente/)
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'push origin feat/x\n')
  blocked('destructive', push('git push origin feat/x', { agent_id: 'sub' }), /desde un subagente/)
  fs.rmSync(path.join(root, 'planning', '.ops-approval'))

  // La orden del chat sola tampoco la alcanza; con la rama nombrada, sí.
  const chat = chatSession()
  try {
    declara({ allowPush: false })
    blocked('destructive', chat.says('subí main a origin')(push('git push origin main')), LIVE)
    declara({ allowPush: false, pushToLiveBranches: ['main'] })
    assert.doesNotThrow(() => execute('destructive', chat.says('subí main a origin')(push('git push origin main'))))
  } finally { chat.close() }
})

test('la rama por defecto del remoto es viva, y un push sin argumentos se resuelve por su upstream', () => {
  const base = tempRoot('ops-hook-push-git-')
  git(['init', '-q', '--bare', '-b', 'develop', 'remote.git'], base)
  const root = path.join(base, 'work')
  git(['clone', '-q', 'remote.git', 'work'], base)
  git(['config', 'user.email', 'prueba@ejemplo'], root)
  git(['config', 'user.name', 'Prueba'], root)
  git(['commit', '-q', '--allow-empty', '-m', 'x'], root)
  // Publicar de verdad, contra un remoto que es un directorio del banco: es lo que deja el upstream puesto.
  git(['push', '-q', '-u', 'origin', 'HEAD:develop'], root)
  git(['remote', 'set-head', 'origin', 'develop'], root)
  git(['switch', '-q', '-c', 'feat/x'], root)
  git(['push', '-q', '-u', 'origin', 'feat/x'], root)
  fs.mkdirSync(path.join(root, 'planning'))
  const declara = (allowPush) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush } }))
  declara(true)
  const push = (command, call = (one) => one) => call({ cwd: root, tool_input: { command } })

  blocked('destructive', push('git push origin develop'), /develop, la rama viva/)
  assert.doesNotThrow(() => execute('destructive', push('git push')), 'en feat/x publica en origin feat/x')
  assert.doesNotThrow(() => execute('destructive', push('git push origin')))
  git(['switch', '-q', 'develop'], root)
  blocked('destructive', push('git push'), /develop, la rama viva/)
  blocked('destructive', push('git push origin HEAD'), /develop, la rama viva/)

  git(['switch', '-q', 'feat/x'], root)
  declara(false)
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive', push('git push', chat.says('subí feat/x a origin'))))
    blocked('destructive', push('git push', chat.says('subí feat/y a origin')), WORK)
  } finally { chat.close() }
})

// El permiso de push dentro de `ops.config.json` (caso 114). Qué protege y qué deja pasar a propósito lo
// explica su módulo.
const CONFIG_BASE = {
  mode: 'embedded',
  workspaceRoots: [{ name: 'app', path: '.' }],
  runner: { maxTaskHours: 4, allowPush: false },
}
const LLAVES = /runner\.allowPush y runner\.pushToLiveBranches/

function configRoot(prefijo, runner = {}) {
  const root = tempRoot(prefijo)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  const config = { ...CONFIG_BASE, runner: { ...CONFIG_BASE.runner, ...runner } }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config, null, 2))
  return { root, file: path.join(root, 'ops.config.json'), config }
}

test('las dos llaves del push no se escriben desde una herramienta, y el resto del archivo sí', () => {
  const { root, file, config } = configRoot('ops-hook-config-escritura-')
  const write = (content, target = file) => ({
    cwd: root, tool_input: { file_path: target, content: JSON.stringify(content, null, 2) },
  })
  // Lo que proteger sólo los dos campos conserva: el archivo sigue siendo la salida que el límite de
  // raíces recomienda, y frenarlo entero repondría el candado que el 090 sacó.
  const raices = { ...config, workspaceRoots: [{ name: 'app', path: '../app' }] }
  const afuera = { ...config, writableOutsideRoots: ['../notas'] }
  assert.doesNotThrow(() => execute('ops-config', write(config)))
  assert.doesNotThrow(() => execute('ops-config', write(raices)))
  assert.doesNotThrow(() => execute('ops-config', write(afuera)))
  assert.doesNotThrow(() => execute('ops-config', write({ x: 1 }, path.join(root, 'package.json'))))

  // Las tres formas de tocarlas: prender la llave, nombrar la rama viva, y sacar lo que estaba puesto.
  const conLlave = { ...config, runner: { ...config.runner, allowPush: true } }
  const conRamaViva = { ...config, runner: { ...config.runner, pushToLiveBranches: ['main'] } }
  blocked('ops-config', write(conLlave), LLAVES)
  blocked('ops-config', write(conRamaViva), LLAVES)
  const previo = configRoot('ops-hook-config-quita-', { pushToLiveBranches: ['main'] })
  blocked('ops-config', {
    cwd: previo.root,
    tool_input: { file_path: previo.file, content: JSON.stringify(CONFIG_BASE, null, 2) },
  }, LLAVES)

  // El mensaje deja el permiso como cosa de la persona y dice qué **no** frena, que es la mitad que
  // evita que el guard se lea como el candado del 090.
  const frenado = messageOf('ops-config', write(conLlave))
  assert.match(frenado, /Lo decide una persona/)
  assert.match(frenado, /El resto del archivo no lo frena este guard/)

  // Un fragmento no es el archivo, así que no hay dos contenidos que comparar.
  blocked('ops-config', { cwd: root, tool_input: { file_path: file, new_string: '"allowPush": true' } },
    /no puede verificar no autoriza/)
})

test('por shell se frena toda escritura sobre ops.config.json, que es lo único decidible ahí', () => {
  const { root, file } = configRoot('ops-hook-config-shell-')
  const sh = (command) => ({ cwd: root, tool_input: { command } })
  blocked('ops-config-shell', sh(`sed -i 's/"allowPush": false/"allowPush": true/' ${file}`), LLAVES)
  blocked('ops-config-shell', sh(`echo '{}' > ${file}`), LLAVES)
  blocked('ops-config-shell', sh(`cp /tmp/otra.json ${file}`), LLAVES)
  // La ruta relativa se resuelve contra el cwd, igual que en el límite de raíces.
  blocked('ops-config-shell', sh('sed -i s/false/true/ ops.config.json'), LLAVES)
  const frenado = messageOf('ops-config-shell', sh(`sed -i s/false/true/ ${file}`))
  assert.match(frenado, /no dice con qué va a quedar el archivo/)

  // Leerlo, nombrarlo o escribir al lado no es escribirlo: el guard no se come el trabajo corriente.
  assert.doesNotThrow(() => execute('ops-config-shell', sh(`cat ${file}`)))
  assert.doesNotThrow(() => execute('ops-config-shell', sh(`grep allowPush ${file}`)))
  assert.doesNotThrow(() => execute('ops-config-shell', sh(`sed -i s/a/b/ ${path.join(root, 'otro.json')}`)))
  assert.doesNotThrow(() => execute('ops-config-shell', sh('echo hola')))
})

test('lo que la persona pide nombrando ops.config.json pasa por las dos vías', () => {
  const { root, file, config } = configRoot('ops-hook-config-chat-')
  const conLlave = JSON.stringify({ ...config, runner: { ...config.runner, allowPush: true } }, null, 2)
  const chat = chatSession()
  try {
    const pidio = chat.says('cambiá ops.config.json para habilitar el push')
    assert.doesNotThrow(() => execute('ops-config',
      pidio({ cwd: root, tool_input: { file_path: file, content: conLlave } })))
    assert.doesNotThrow(() => execute('ops-config-shell',
      pidio({ cwd: root, tool_input: { command: `sed -i s/false/true/ ${file}` } })))
    // En el mensaje siguiente vuelve a preguntar: lo que se escribe acá es el permiso de push, así que
    // vale lo que ella pidió en el mensaje en curso y no lo que la sesión venía concediendo (caso 119).
    // Esta prueba afirmó lo contrario dos veces —primero porque el permiso moría con el mensaje, después
    // porque el 116 lo hizo durar la sesión—: lo que decide no es cuánto dura sino qué se escribe.
    const otro = chat.says('seguí con la tarea')
    blocked('ops-config', otro({ cwd: root, tool_input: { file_path: file, content: conLlave } }), LLAVES)
    // Lo que sí frena: que ella lo niegue, y que otra sesión no haya pedido nada. Las dos mitades son las
    // que este guard existe para sostener —sin pedido de una persona, las llaves no se escriben—.
    const nego = chat.says('no toques ops.config.json')
    blocked('ops-config', nego({ cwd: root, tool_input: { file_path: file, content: conLlave } }), LLAVES)
  } finally { chat.close() }
  const ajena = chatSession()
  try {
    const nadaPidio = ajena.says('seguí con la tarea')
    blocked('ops-config', nadaPidio({ cwd: root, tool_input: { file_path: file, content: conLlave } }), LLAVES)
  } finally { ajena.close() }
})

test('el guard de ops.config.json corre en los dos grupos, que es por donde llegan las dos vías', () => {
  const { root, file, config } = configRoot('ops-hook-config-grupos-')
  const conLlave = JSON.stringify({ ...config, runner: { ...config.runner, allowPush: true } }, null, 2)
  const porGrupo = (group, toolInput) => assert.throws(
    () => executeAll([group], { cwd: root, tool_input: toolInput }),
    (error) => {
      assert.equal(error.blocked, true, `${group} lanzó algo que no es un bloqueo: ${error.message}`)
      assert.match(error.message, LLAVES, `${group} bloqueó por otro motivo`)
      return true
    },
  )
  porGrupo('pre-files', { file_path: file, content: conLlave })
  porGrupo('pre-shell', { command: `sed -i s/false/true/ ${file}` })
})

