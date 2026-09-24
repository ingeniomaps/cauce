'use strict'

// Qué hace el resto del motor con lo que la persona concedió: qué guard lo hereda, qué gate no lo
// acepta, y cómo se lo nombra en el bloqueo.

const { tempRoot } = require('../support/environment')
const {
  blocked, git, initRepo, chatSession,
  messageOf, planFirstRoot, pasteApproval, WIP_CON_PLAN,
} = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, executeAll } = require('../../engine/hooks/run')

// Qué líneas entran en la aprobación cuando la persona la nombró: el contenido, que hasta 0.83.0 no se
// miraba (caso 119). Por qué se compara y contra qué, en `self-approval`.
// Cada `chat.says` invalida al anterior —la llamada trae el id del mensaje que la originó—, así que el
// orden de acá no es cosmético: lo que se afirma sobre un mensaje se afirma mientras sea el último.
test('la aprobación sólo recibe las líneas que la persona nombró en su mensaje', () => {
  const root = planFirstRoot('ops-hook-aprobacion-contenido-', WIP_CON_PLAN)
  const approval = path.join(root, 'planning', '.ops-approval')
  const writes = (content) => ({ cwd: root, tool_input: { file_path: approval, content } })
  const chat = chatSession()
  try {
    const asked = chat.says('agregá src/login.js a .ops-approval')
    assert.doesNotThrow(() => execute('workspace-boundary', asked(writes('src/login.js\n'))))
    // La línea que ella no pidió frena la escritura, vaya sola o acompañada de la que sí.
    blocked('workspace-boundary', asked(writes('push origin main\n')), /no las pidió/)
    blocked('workspace-boundary', asked(writes('src/login.js\npush origin main\n')), /push origin main/)
    blocked('workspace-boundary', asked(writes('src/otro.js\n')), /src\/otro\.js/)
    // Un comentario no autoriza nada y no hay que pedirlo; quitar líneas autoriza menos, tampoco.
    assert.doesNotThrow(() => execute('workspace-boundary',
      asked(writes('# aprobado por mí\nsrc/login.js\n'))))
    assert.doesNotThrow(() => execute('workspace-boundary', asked(writes(''))))
    // Lo que ya estaba en disco no se vuelve a nombrar: sumar una línea no es reescribir el archivo.
    fs.writeFileSync(approval, 'src/otro.js\n')
    assert.doesNotThrow(() => execute('workspace-boundary', asked(writes('src/otro.js\nsrc/login.js\n'))))
    fs.rmSync(approval, { force: true })
    // Por shell no hay contenido que comparar, así que ahí se frena aunque ella lo haya pedido.
    blocked('shell-boundary', asked({ cwd: root,
      tool_input: { command: 'echo src/login.js >> planning/.ops-approval' } }),
    /no dice con qué va a quedar/)

    // Una línea de push se pregunta como un push y no como una ruta; el porqué está en `isPush`.
    const orders = chat.says('agregá push origin main a .ops-approval')
    assert.doesNotThrow(() => execute('workspace-boundary', orders(writes('push origin main\n'))))
    const loginOnly = chat.says('agregá src/login.js a .ops-approval y arreglá el login')
    blocked('workspace-boundary', loginOnly(writes('push origin feat/login\n')), /no las pidió/)

    // El «dale» aprueba exactamente lo que el bloqueo mostró, que por eso lleva las líneas adentro.
    const again = chat.says('agregá src/login.js a .ops-approval')
    assert.match(messageOf('workspace-boundary', again(writes('push origin main\n'))),
      /\n {2}push origin main\n/)
    const goAhead = chat.says('dale')
    assert.doesNotThrow(() => execute('workspace-boundary', goAhead(writes('push origin main\n'))))

    // Lo que la sesión concedió por otra vía tampoco entra solo: una ruta que ella autorizó a borrar en
    // otro mensaje sigue siendo, acá, una línea que nadie pidió. No conceder —lo que este guard ya hacía—
    // y no heredar son dos cosas distintas, y sin esta mitad la segunda no la ve ninguna prueba.
    const deletes = chat.says('borrá la prueba test/pagos.test.js')
    assert.doesNotThrow(() => execute('test-evidence', deletes({ cwd: root,
      tool_input: { patch: '*** Begin Patch\n*** Delete File: test/pagos.test.js\n*** End Patch' } })))
    const otherRequest = chat.says('agregá src/login.js a .ops-approval')
    blocked('workspace-boundary', otherRequest(writes('test/pagos.test.js\n')), /test\/pagos\.test\.js/)
  } finally { chat.close() }
})

// Lo que un guard deja pasar porque la persona lo pidió queda concedido y vale mientras dure la sesión
// (caso 116). Eso alcanzaba también a los gates de commit y nadie lo había decidido: ahí se pregunta cada
// vez, como en la publicación (caso 119).
//
// Eran tres. `governance` salió de esa regla con el 126: frena por política sobre qué archivos toca un
// commit, y eso no se le pregunta a quien está dando instrucciones. Los dos que quedan se prueban juntos
// porque comparten el motivo de seguir preguntando —frenan por un defecto de hecho— y cada uno es un sitio
// que se puede olvidar.
test('lo concedido no abre un gate de commit, y gobernanza no interroga a la persona', () => {
  const bench = (prefix, files, add) => {
    const root = tempRoot(prefix)
    initRepo(root)
    fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
    fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
    for (const [name, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      fs.writeFileSync(path.join(root, name), body)
    }
    git(['add', ...add], root)
    return root
  }
  // El lockfile de `dependencies` está en disco y sin stagear a propósito: es lo que hace que el
  // manifiesto staged cuente como uno que va sin su lock.
  // `governance` sale de esta lista: frena por **política** sobre qué archivos toca un commit, y eso a una
  // persona que está dando instrucciones no se le pregunta (caso 126). Los dos que quedan frenan por un
  // **defecto de hecho** —un manifiesto sin su lockfile, una verificación que falla—, y silenciarlos porque
  // hay alguien hablando sería tapar un rojo. La diferencia es qué frena cada uno, no quién lo pidió.
  const cases = [
    ['dependencies', bench('ops-hook-gate-deps-', { 'package.json': '{}\n', 'package-lock.json': '{}\n' },
      ['package.json']), 'commiteá package.json', /lockfile/i],
    ['verify', bench('ops-hook-gate-verify-', { 'openapi/api.yaml': 'openapi: 3.0.0\n' },
      ['openapi/api.yaml']), 'commiteá openapi/api.yaml', /OpenAPI\/Swagger/],
  ]
  const commit = (root) => ({ cwd: root, tool_input: { command: 'git commit -m x' } })
  const chat = chatSession()
  try {
    for (const [guard, root, request, reason] of cases) {
      assert.doesNotThrow(() => execute(guard, chat.says(request)(commit(root))), guard)
      // Acá pasaba con lo concedido, que es el defecto: un commit salía en verde con cualquier otro
      // mensaje en curso.
      blocked(guard, chat.says('seguí con la tarea')(commit(root)), reason)
      // Y el «dale» que contesta a ese bloqueo sigue siendo la salida corta que el bloqueo ofrece.
      assert.doesNotThrow(() => execute(guard, chat.says('dale')(commit(root))), `${guard} con un dale`)
    }
    // Gobernanza con una persona conduciendo: pase lo que pase el mensaje, no se frena ni se le pide que
    // pegue nada. Lo que la contiene es que el agente trabaje solo, no que la persona nombre el archivo.
    const governed = bench('ops-hook-gate-gob-', { 'planning/rules/process.md': '# regla\n' },
      ['planning/rules/process.md'])
    for (const said of ['commiteá planning/rules/process.md', 'seguí con la tarea', 'dale', 'gracias']) {
      assert.doesNotThrow(() => execute('governance', chat.says(said)(commit(governed))), `governance: ${said}`)
    }
    // Y sin persona —un subagente, un recorrido, CI— sigue frenando igual que antes.
    blocked('governance', commit(governed), /gobernanza protegida/)
    const sub = chat.says('commiteá planning/rules/process.md')
    blocked('governance', ((extra) => sub({ agent_id: 'a1', ...extra }))(commit(governed)), /gobernanza protegida/)
    // Lo que no es un gate de commit sigue valiendo mientras la sesión siga: eso no se tocó (caso 116).
    const reader = planFirstRoot('ops-hook-gate-contraste-', WIP_CON_PLAN)
    const reads = (call) => call({ cwd: reader, tool_input: { file_path: path.join(reader, '.env') } })
    assert.doesNotThrow(() => execute('secrets-read', reads(chat.says('leé el .env'))))
    assert.doesNotThrow(() => execute('secrets-read', reads(chat.says('seguí con lo tuyo'))))
  } finally { chat.close() }
})

test('en sidecar el bloqueo nombra el archivo que el guard lee, y pegar ahí destraba (caso 097)', () => {
  const workspace = tempRoot('ops-hook-sidecar-aprueba-')
  const root = path.join(workspace, 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }] }))
  const before = { OPS_ROOT: process.env.OPS_ROOT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
    GEMINI_PROJECT_DIR: process.env.GEMINI_PROJECT_DIR }
  const restore = () => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  const read = (cwd, file) => ({ cwd, tool_input: { file_path: path.join(cwd, file) } })
  const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Como lo lanza el runner: la sesión en el workspace y la raíz de ops la que exporta `run-hook.sh`.
  process.env.OPS_ROOT = root
  process.env.CLAUDE_PROJECT_DIR = workspace
  delete process.env.GEMINI_PROJECT_DIR
  try {
    const reads = read(workspace, '.env')
    const message = messageOf('secrets-read', reads)
    assert.match(message, /que pegue ella tal cual en acme-ops\/planning\/\.ops-approval estas líneas/)
    // Donde decía antes —el `planning/` de la carpeta de la sesión— no destraba: ése era el defecto.
    fs.mkdirSync(path.join(workspace, 'planning'))
    fs.writeFileSync(path.join(workspace, 'planning', '.ops-approval'), `${path.join(workspace, '.env')}\n`)
    blocked('secrets-read', reads, /leerla/)
    pasteApproval(root, message)
    assert.doesNotThrow(() => execute('secrets-read', reads))

    // Gemini nombra la carpeta de la sesión con su propia variable.
    delete process.env.CLAUDE_PROJECT_DIR
    process.env.GEMINI_PROJECT_DIR = workspace
    assert.match(messageOf('secrets-read', read(workspace, 'id_ed25519')),
      /que pegue ella tal cual en acme-ops\/planning\/\.ops-approval estas líneas/)
    // Una sesión abierta en un proyecto hermano no tiene la instancia adentro: ahí va la ruta entera.
    delete process.env.GEMINI_PROJECT_DIR
    const api = path.join(workspace, 'api')
    fs.mkdirSync(api)
    assert.match(messageOf('secrets-read', read(api, '.env')),
      new RegExp(`que pegue ella tal cual en ${literal(path.join(root, 'planning', '.ops-approval'))} estas líneas`))
  } finally { restore() }

  // En embedded la sesión y la instancia son la misma carpeta, y el mensaje no cambia. Sin instancia no
  // hay aprobación que leer, y el mensaje dice la forma de siempre.
  delete process.env.OPS_ROOT
  delete process.env.CLAUDE_PROJECT_DIR
  delete process.env.GEMINI_PROJECT_DIR
  try {
    const embedded = planFirstRoot('ops-hook-embedded-aprueba-', WIP_CON_PLAN)
    assert.match(messageOf('secrets-read', read(embedded, '.env')),
      /que pegue ella tal cual en planning\/\.ops-approval estas líneas/)
    const loose = tempRoot('ops-hook-sin-raiz-')
    assert.match(messageOf('secrets-read', read(loose, '.env')),
      /que pegue ella tal cual en planning\/\.ops-approval estas/)
  } finally { restore() }
})

test('el hook de mensaje nunca frena ni imprime, reciba lo que reciba', () => {
  const { DIR } = require('../../engine/hooks/chat')
  const shim = path.resolve(__dirname, '..', '..', 'automatization', 'hooks', 'guard-chat.sh')
  const session = `prueba-${process.pid}-shim`
  for (const stdin of [JSON.stringify({ session_id: session, prompt_id: 'm1', prompt: 'hola' }), '{roto', '']) {
    const result = spawnSync('bash', [shim], { input: stdin, encoding: 'utf8' })
    assert.equal(result.status, 0, `con ${JSON.stringify(stdin)}: ${result.stderr}`)
    assert.equal(result.stdout, '', 'lo que imprime el hook de mensaje le llega al modelo como contexto')
  }
  assert.ok(fs.existsSync(path.join(DIR, `${session}.json`)), 'y con una entrada válida registra el mensaje')
  fs.rmSync(path.join(DIR, `${session}.json`), { force: true })
})

// Leer una credencial por shell, en cualquier runner (caso 104): lo que la muestra se frena, lo que sólo la
// nombra pasa, y lo que la persona pidió en el chat también.
test('secrets-shell frena leer una credencial por shell y deja pasar lo demás', () => {
  const root = planFirstRoot('ops-hook-lee-shell-', WIP_CON_PLAN)
  const runs = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of ['cat .env', 'head -3 ./.env', 'grep TOKEN .env', 'sed -n 1p .env', 'source .env',
    '. .env', 'wc -l < .env', 'cat id_ed25519 | base64', 'X=1 cat .env', 'echo $(cat .npmrc)',
    `node -e "console.log(require('node:fs').readFileSync('.env','utf8'))"`,
    `python3 -c "print(open('.env').read())"`,
    // Las dos formas con que un agente lo leyó en una sesión real, cuando el guard no las veía.
    'nl -ba .env', "rg -n KEY -g '.env*'", "grep -rn KEY --include='*.env' .",
    // El verbo se busca detrás de prefijos con sus banderas, con ruta, dentro de un subshell y entre tramos vacíos.
    'xargs -0 cat .env', '/bin/cat .env', '(cat .env)', 'true; ; cat .env']) {
    blocked('secrets-shell', runs(command), /lee .*credencial/)
  }
  for (const command of ['cat .env.example', 'ls -la .env', 'test -f .env', 'rm .env', 'cp .env.example .env',
    'git add .env.example', 'git commit -m "no leer el .env; cat .env"', 'grep -r TOKEN src', 'ls .env*',
    'cat *.md']) {
    assert.doesNotThrow(() => execute('secrets-shell', runs(command)), command)
  }
  assert.throws(() => executeAll(['pre-shell'], runs('cat .env')), /lee .*credencial/)
  // Sin chat queda la aprobación por archivo; con chat, pasa lo que la persona nombró.
  pasteApproval(root, messageOf('secrets-shell', runs('cat .env')))
  assert.doesNotThrow(() => execute('secrets-shell', runs('cat .env')))
  const chat = chatSession()
  try {
    const asked = chat.says('mostrame qué hay en el .npmrc')
    assert.doesNotThrow(() => execute('secrets-shell', asked(runs('cat .npmrc'))))
    blocked('secrets-shell', runs('cat .npmrc'), /lee .*credencial/)
    // Nombrar sin pedir tampoco autoriza por esta vía (caso 109). El 109 lo dio por cubierto porque este
    // guard coteja por el mismo `unauthorized` que el de lectura, y eso es un argumento: la vía que el
    // propio caso señaló con nombre y línea no tenía ninguna aserción. Va con un archivo que esta prueba
    // no aprobó antes —`.env` y `.npmrc` ya están concedidos acá—, porque si no lo dejaría pasar el 116.
    blocked('secrets-shell', chat.says('¿para qué sirve el id_ed25519?')(runs('cat id_ed25519')),
      /lee .*credencial/)
  } finally { chat.close() }
})

// El vocabulario de `chat.js` del lado de quien autoriza (caso 118). Qué palabra entra y por qué se decide
// ahí; acá se mide el borde contra el 109.
test('una autorización dicha con el verbo de autorizar pasa; el sustantivo solo no', () => {
  const root = planFirstRoot('ops-hook-chat-autoriza-', WIP_CON_PLAN)
  const opened = []
  // Cada mensaje en su propia sesión: lo que uno autoriza sigue valiendo en los que siguen (caso 116), así
  // que con una sola sesión el primero que pasa deja pasar a todos y la prueba queda verde diga lo que diga
  // la lista de verbos.
  const saying = (message) => {
    const chat = chatSession()
    opened.push(chat)
    return chat.says(message)({ cwd: root, tool_input: { file_path: path.join(root, '.env') } })
  }
  try {
    for (const message of [
      'autorizo la lectura del .env para que llenes todos los campos',
      'autorizá la lectura del .env',
      'te autorizo a que uses el .env',
      'permito que se lea el .env',
      'apruebo el acceso al .env',
      'habilito el .env para esta tarea',
      'I authorize reading the .env',
      'you are allowed the .env',
      'access to the .env is granted',
    ]) assert.doesNotThrow(() => execute('secrets-read', saying(message)), message)
    // Nombrar el acto no es concederlo: sin un verbo de conceder, esto se sigue frenando.
    for (const message of [
      'la lectura del .env es lo que falla',
      '¿hace falta autorizacion para el .env?',
      'no tengo permiso para el .env',
    ]) blocked('secrets-read', saying(message), /leerla/)
    // Y negar sigue negando, también con las palabras nuevas.
    for (const message of [
      'no autorizo la lectura del .env',
      'nunca permito que se lea el .env',
      'I do not authorize the .env',
    ]) blocked('secrets-read', saying(message), /leerla/)
  } finally { for (const chat of opened) chat.close() }
})

// Lo que un bloqueo ofrece pegar tiene que ser la línea que después funciona (casos 089 y 118). El porqué
// vive en `secrets-shell.js`; acá se mide.
test('un bloqueo no ofrece pegar una ruta que el shell no expandió, y sigue habiendo salida', () => {
  const root = planFirstRoot('ops-hook-lee-shell-variable-', WIP_CON_PLAN)
  const runs = (command) => ({ cwd: root, tool_input: { command } })

  const message = messageOf('secrets-shell', runs('cat ops/$O/.env.infisical'))
  assert.match(message, /Por archivo no hay línea que pegar/)
  // La aserción de ausencia: ninguna línea ofrecida para pegar, y menos una con la variable adentro.
  assert.doesNotMatch(message, /estas líneas/)
  assert.doesNotMatch(message, /^ {2}\S*\$O/m)

  // La forma con llaves, que es la que se partía en dos.
  const braces = messageOf('secrets-shell', runs('cat ops/${O}/.env.infisical'))
  assert.doesNotMatch(braces, /lee \/\.env\.infisical,/)
  assert.ok(braces.includes(`lee ${path.join(root, 'ops', '$O', '.env.infisical')},`), braces)

  // Con la ruta escrita sí hay línea, y es la que destraba: la propiedad del 089 se mantiene.
  const written = runs(`cat ${path.join(root, 'ops', 'dev', '.env.infisical')}`)
  pasteApproval(root, messageOf('secrets-shell', written))
  assert.doesNotThrow(() => execute('secrets-shell', written))

  // Y la salida por chat sigue existiendo para lo que no se puede pegar: se anota igual y un «dale» lo
  // aprueba. Sin esto, quitar la línea habría dejado el bloqueo sin ninguna salida.
  const chat = chatSession()
  try {
    const variable = runs('cat ops/$O/.env.infisical')
    const request = chat.says('cargá los valores en Infisical')
    blocked('secrets-shell', request(variable), /lee .*credencial/)
    assert.doesNotThrow(() => execute('secrets-shell', chat.says('dale')(variable)))
  } finally { chat.close() }
})

