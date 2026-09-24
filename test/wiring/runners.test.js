'use strict'

// Los adaptadores —claude, codex, gemini, antigravity— de a uno: qué instala cada uno y en qué formato
// ofrece lo que ofrece.
//
// Lo que vale para los cuatro a la vez es de `runners-contract.test.js`. Dos vecinos se le parecen y no
// lo son: `test/hooks/` prueba qué decide un guard, no dónde aterriza su wiring; `test/workflows/` prueba
// el recorrido, no el formato en que cada runner lo ofrece.

const { MIN_ROLES, tempRoot, linkEngine, installedProject } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..', '..', 'automatization', 'runners')

test('las capacidades declaradas coinciden con los artefactos reales', () => {
  const claude = JSON.parse(fs.readFileSync(path.join(root, 'claude', 'manifest.json'), 'utf8'))
  const codex = JSON.parse(fs.readFileSync(path.join(root, 'codex', 'manifest.json'), 'utf8'))
  const gemini = JSON.parse(fs.readFileSync(path.join(root, 'gemini', 'manifest.json'), 'utf8'))
  const antigravity = JSON.parse(fs.readFileSync(path.join(root, 'antigravity', 'manifest.json'), 'utf8'))
  assert.equal(claude.capabilities.nativeHooks, true)
  assert.equal(claude.capabilities.nativeWorkflows, true)
  assert.equal(codex.capabilities.nativeHooks, true)
  // Gemini CLI ganó hooks y skills nativas; el adaptador dejó de tratarlo como si no los tuviera.
  assert.equal(gemini.capabilities.nativeHooks, true)
  assert.equal(gemini.capabilities.checkpointing, true)
  assert.equal(gemini.roleSkills, '.gemini/skills')
  assert.equal(antigravity.command, 'agy')
  assert.equal(antigravity.capabilities.nativeHooks, true)
  assert.equal(antigravity.capabilities.nativeWorkflows, true)
  const geminiSettings = JSON.parse(fs.readFileSync(path.join(root, 'gemini', 'settings.json'), 'utf8'))
  assert.equal(geminiSettings.general.checkpointing.enabled, true)
  // Sus eventos y su variable de entorno son propios: reusar los de Claude no engancharía nada.
  assert.ok(geminiSettings.hooks.BeforeTool.length)
  assert.ok(geminiSettings.hooks.AfterAgent.length)
  assert.match(JSON.stringify(geminiSettings.hooks), /\$GEMINI_PROJECT_DIR/)

  // A qué herramienta de lectura engancha cada runner el guard de credenciales, y a ninguna otra (caso 092).
  const claudeSettings = JSON.parse(fs.readFileSync(path.join(root, 'claude', 'settings.json'), 'utf8'))
  const readers = (events) => events.filter((group) => /guard-secrets-read\.sh/.test(JSON.stringify(group.hooks)))
    .map((group) => group.matcher)
  // Y a la de búsqueda, que nombra por comodín lo que lee (caso 104).
  assert.deepEqual(readers(claudeSettings.hooks.PreToolUse), ['Read|Grep'])
  assert.deepEqual(readers(geminiSettings.hooks.BeforeTool), ['read_file|grep_search'])
  // Claude ya no trae reglas nativas de lectura: frenaban también lo que la persona pedía, y el shell lo cubre
  // `secrets-shell` en los cuatro runners (caso 104). Las que entregó antes quedan declaradas como retiradas.
  assert.equal(claudeSettings.permissions, undefined, 'sin permissions.deny propias')
  const retiradas = claude.config.retired.permissions.deny
  for (const rule of ['Read(.env)', 'Read(.env.local)', 'Read(id_ed25519)']) assert.ok(retiradas.includes(rule), rule)

  // El hook de mensaje, en el evento propio de cada runner que tiene uno (caso 098).
  const codexHooks = JSON.parse(fs.readFileSync(path.join(root, 'codex', 'hooks.json'), 'utf8')).hooks
  const chats = (events) => (events || []).filter((group) => /guard-chat\.sh/.test(JSON.stringify(group.hooks)))
  assert.equal(chats(claudeSettings.hooks.UserPromptSubmit).length, 1)
  assert.equal(chats(codexHooks.UserPromptSubmit).length, 1)
  assert.equal(chats(geminiSettings.hooks.BeforeAgent).length, 1)
})

test('el bridge de Antigravity traduce decisiones al protocolo nativo', () => {
  const bridge = path.join(root, 'antigravity', 'hook.js')
  const { evaluate } = require(bridge)
  const payload = (command) => ({
    workspacePaths: [path.resolve(root, '..', '..')],
    toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: path.resolve(root, '..', '..') } },
  })
  assert.equal(evaluate('pre-shell', payload('git status')).decision, 'allow')
  assert.equal(evaluate('pre-shell', payload('git push')).decision, 'deny')

  // Un evento que `hookGroups` no conoce niega, y lo dice nombrándolo. Falla cerrado como todo el
  // puente, y es la única forma de enterarse: un manifiesto que registre un evento mal escrito deja al
  // agente sin herramientas, que es el modo de fallo que este archivo ya vivió dos veces.
  const raro = evaluate('evento-que-no-existe', payload('git status'))
  assert.equal(raro.decision, 'deny')
  assert.match(raro.reason, /Evento Antigravity desconocido: evento-que-no-existe/)

  // Una llamada que el puente no sabe describir no se autoriza: con otro nombre de campo el mismo push
  // forzado llegaba vacío a los guards y pasaba (caso 200). El motivo nombra lo que sí llegó.
  const cwd = path.resolve(root, '..', '..')
  const renamed = evaluate('pre-shell',
    { workspacePaths: [cwd], toolCall: { args: { Command: 'git push --force', Cwd: cwd } } })
  assert.equal(renamed.decision, 'deny')
  assert.match(renamed.reason, /no trae CommandLine/)
  assert.match(renamed.reason, /Command, Cwd/)
  const noFile = evaluate('pre-files', { workspacePaths: [cwd], toolCall: { args: { Path: '.env', Cwd: cwd } } })
  assert.equal(noFile.decision, 'deny')
  assert.match(noFile.reason, /no trae TargetFile ni AbsolutePath/)
  // Con el archivo pero sin el contenido, los guards que juzgan contenido verían un texto vacío.
  const renamedContent = { TargetFile: 'db/migrations/1.sql', Content: 'DROP TABLE x;', Cwd: cwd }
  const noContent = evaluate('pre-files', { workspacePaths: [cwd], toolCall: { args: renamedContent } })
  assert.equal(noContent.decision, 'deny')
  assert.match(noContent.reason, /no trae CodeContent, ReplacementContent ni ReplacementChunks/)
  // Sin entrada no hay llamada descrita: se invoca así a mano, con OPS_HOOK_*, y sigue como antes (caso 198).
  assert.equal(evaluate('pre-shell', {}).decision, 'allow')
})

// Los dos errores en el mismo evento `stop`, porque separados los dos dan `continue` y cualquiera de
// las dos mitades pasa sola. Qué distingue a uno del otro, en el `catch` del puente.
test('el puente de Antigravity separa el guard que bloquea del puente que no arrancó', () => {
  const { base, workspace, target, runCli, env } = installedProject('cauce-stop-', 'antigravity')

  // Desde el workspace, como lo lanza Antigravity: `findRoot` cae a `process.cwd()` si la raíz
  // declarada no resuelve, y correrlo desde otro lado lo ataría a la instancia equivocada.
  const bridge = path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js')
  const answers = (event, session) => {
    const script = `const b=require(${JSON.stringify(bridge)});`
      + `console.log(JSON.stringify(b.evaluate(${JSON.stringify(event)},`
      + `{conversationId:${JSON.stringify(session)},toolCall:{args:{Cwd:${JSON.stringify(workspace)}}}})))`
    const result = spawnSync(process.execPath, ['-e', script], { cwd: workspace, encoding: 'utf8', env })
    return JSON.parse(result.stdout.trim())
  }

  // `planning-drift` deja en el tmp del sistema un marcador de la sesión que ya bloqueó, y sólo bloquea
  // la primera vez: la sesión tiene que ser nueva en cada corrida o la segunda pasa de largo y el test
  // miente. Ese marcador no cuelga de la raíz temporal de la suite —es de la sesión, no de la prueba—,
  // así que se limpia acá; el nombre sale de `engine/hooks/run.js`.
  const session = `drift-${process.pid}-${Date.now()}`
  const marker = path.join(require('node:os').tmpdir(), `cauce-drift-${session}`)
  try {
    fs.rmSync(path.join(target, 'planning', 'PROTOCOL.md'))
    const blocked = answers('stop', session)
    assert.equal(blocked.decision, 'continue', 'el drift retiene al agente: eso es el guard funcionando')
    assert.match(blocked.reason, /PROTOCOL\.md/)
  } finally {
    fs.rmSync(marker, { force: true })
  }

  fs.rmSync(path.join(target, 'ops.config.json'))
  const broken = answers('stop', 'sin-raiz')
  assert.equal(broken.decision, 'stop', 'sin raíz no hay nada que el agente pueda arreglar: dejalo cerrar')
  assert.match(broken.reason, /raíz Cauce/)
  // Y el resto de los eventos sigue fallando cerrado, que es lo que no se toca.
  assert.equal(answers('pre-shell', 'sin-raiz').decision, 'deny')
})

// Antigravity no deja de dónde deducir la raíz: su payload manda `workspacePaths` vacío y un `Cwd` que
// apunta al scratch del CLI o al home, y `agy plugin install` registra una copia del plugin en
// `~/.gemini/config/plugins/`, que es la que ejecuta. Desde ahí ni el cwd ni `__dirname` llevan al
// proyecto, así que el puente no encontraba la raíz y, como falla cerrado, negaba cada herramienta.
//
// Y su `hooks.json` existe sólo porque Cauce lo creó: fusionarlo dejaba viva la entrada anterior cuando
// la ruta del puente cambiaba, y esa entrada muerta rompía la sesión entera.
test('install deja el puente de Antigravity resoluble desde la copia que agy registra', () => {
  const os = require('node:os')
  const { base, workspace, target, runCli, env } = installedProject('cauce-agy-', 'antigravity')

  const plugin = path.join(workspace, '.agents', 'plugins', 'cauce')
  const bridge = fs.readFileSync(path.join(plugin, 'hook.js'), 'utf8')
  assert.match(bridge, new RegExp(`const OPS_ROOT = '${target}'`), 'la raíz absoluta quedó escrita')

  // Como lo ejecuta `agy`: desde otra carpeta y sin una sola pista del workspace en el payload.
  const copy = path.join(base, 'global', 'hook.js')
  fs.mkdirSync(path.dirname(copy), { recursive: true })
  fs.writeFileSync(copy, bridge)
  const answer = spawnSync(process.execPath, [copy, 'pre-shell'], {
    cwd: path.dirname(copy),
    input: JSON.stringify({ workspacePaths: [], toolCall: { args: { CommandLine: 'git push', Cwd: os.homedir() } } }),
    encoding: 'utf8',
    env,
  })
  const decision = JSON.parse(answer.stdout.trim())
  assert.equal(decision.decision, 'deny')
  assert.match(decision.reason, /git push/, 'denegó por el guard, no porque no encontró la raíz')

  // Una entrada vieja no sobrevive a la reinstalación: el archivo es nuestro y se escribe entero.
  const hooks = path.join(plugin, 'hooks.json')
  const config = JSON.parse(fs.readFileSync(hooks, 'utf8'))
  config.cauce.PreToolUse[0].hooks.push({ type: 'command', command: 'node viejo/hook.js pre-shell' })
  fs.writeFileSync(hooks, JSON.stringify(config, null, 2))
  assert.equal(runCli(['automation', 'install', target, 'antigravity', '--force']).status, 0)
  assert.equal(fs.readFileSync(hooks, 'utf8').includes('viejo/hook.js'), false, 'la entrada muerta se fue')

  // Y los guards reciben una carpeta del proyecto contra la cual resolver. Con el `Cwd` que manda
  // Antigravity, `ops/planning/nota.md` se resolvía en `$HOME/ops/planning/nota.md`: un archivo que no
  // existe, bloqueado por caer fuera de las raíces, mientras el que el agente iba a tocar no se miraba.
  const previous = process.env.OPS_ROOT
  try {
    const bridgeInstalled = require(path.join(plugin, 'hook.js'))
    const write = (file) => ({
      conversationId: 'cwd',
      toolCall: { args: { TargetFile: file, CodeContent: 'x', Cwd: os.homedir() } },
    })
    assert.equal(bridgeInstalled.normalize(write('x'), target).cwd, workspace, 'el cwd es el workspace')
    assert.equal(bridgeInstalled.evaluate('pre-files', write('ops/planning/nota.md')).decision, 'allow')
    const outside = bridgeInstalled.evaluate('pre-files', write('../fuera/x.md'))
    assert.equal(outside.decision, 'deny')
    assert.ok(outside.reason.includes(path.join(base, 'fuera')), 'juzga la ruta que el agente quiso escribir')
  } finally {
    if (previous === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = previous
  }
})

// El puente tal como corre instalado, con los marcadores puestos. Se lo hace resolver desde una carpeta
// que no lleva a ningún proyecto, que es la situación real: `agy` ejecuta la copia registrada en
// `~/.gemini/`, donde ni el `__dirname` ni el cwd llegan al repositorio del usuario.
test('el puente de Antigravity resuelve la raíz como corre instalado', () => {
  const os = require('node:os')
  const bridge = require(path.join(root, 'antigravity', 'hook.js'))
  const base = tempRoot('cauce-puente-unidad-')
  const workspace = path.join(base, 'repo')
  const opsRoot = path.join(workspace, 'ops')
  fs.mkdirSync(path.join(opsRoot, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(opsRoot, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const faraway = path.join(base, 'global')
  fs.mkdirSync(faraway)

  // Sidecar: la raíz declarada apunta a otro proyecto y desde el workspace sólo se llega hacia abajo.
  const marks = { dir: 'ops/', root: path.join(base, 'no-existe'), plugin: faraway }
  assert.equal(bridge.findRoot({ toolCall: { args: { Cwd: workspace } } }, marks), opsRoot)
  assert.equal(bridge.findRoot({ toolCall: { args: { Cwd: opsRoot } } }, marks), opsRoot)
  assert.equal(bridge.normalize({ toolCall: { args: { Cwd: os.homedir() } } }, opsRoot, marks).cwd, workspace)

  // La raíz absoluta que `install` escribe manda sobre la búsqueda.
  const writtenAt = { dir: 'ops/', root: opsRoot, plugin: faraway }
  assert.equal(bridge.findRoot({ toolCall: { args: { Cwd: os.homedir() } } }, writtenAt), opsRoot)

  // Y dos candidatas hermanas son una ambigüedad que el puente no resuelve solo.
  const twin = path.join(workspace, 'otra-ops')
  fs.mkdirSync(path.join(twin, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(twin, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const previous = process.cwd()
  try {
    process.chdir(faraway)
    assert.throws(() => bridge.findRoot({ toolCall: { args: { Cwd: workspace } } }, marks), /raíz Cauce/)
  } finally {
    process.chdir(previous)
  }
})

// Se rompe el puente y se espera que `doctor` lo diga: con los archivos en su lugar, mirar que existan
// da verde igual. Una corrida real terminó con el agente narrando trabajo que no pudo hacer.
test('doctor ejecuta el puente del runner, no sólo lo busca', () => {
  const A = require('../../engine/automation')
  const base = tempRoot('cauce-puente-')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  const cli = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.OPS_ROOT
  delete env.CLAUDE_PROJECT_DIR
  const runCli = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(runCli(['automation', 'install', target, 'antigravity']).status, 0)
  // Un home propio: por qué, en el encabezado de test/wiring/registration.test.js.
  const home = path.join(base, 'home')
  fs.mkdirSync(home)
  const doctor = () => {
    const before = process.env.HOME
    process.env.HOME = home
    try { return A.doctor(target, 'antigravity', { warn() {}, error() {} }) } finally { process.env.HOME = before }
  }
  assert.equal(doctor().errors.length, 0)

  const bridge = path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js')
  fs.appendFileSync(bridge, '\nesto no es javascript (\n')
  const broken = doctor()
  assert.ok(broken.errors.some((error) => /hook\.js pre-shell/.test(error)), 'un puente que no arranca es error')
})

test('doctor advierte cuando sobrevive el wiring por guard suelto', () => {
  const A = require('../../engine/automation')
  const legacy = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
    { type: 'command', command: 'automatization/hooks/guard-destructive.sh' },
    { type: 'command', command: 'automatization/hooks/guard-verify.sh' },
    { type: 'command', command: 'automatization/hooks/guard-shell.sh' },
  ] }] } }
  assert.deepEqual(A.legacyGuardWiring(legacy), ['destructive', 'verify'])
  const grouped = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
    { type: 'command', command: 'automatization/hooks/guard-shell.sh' },
  ] }], Stop: [{ hooks: [{ type: 'command', command: 'automatization/hooks/guard-planning-drift.sh' }] }] } }
  assert.deepEqual(A.legacyGuardWiring(grouped), [], 'el guard suelto de Stop no es wiring heredado')
})

// Codex descubre hooks en `.codex/hooks.json`, `.codex/config.toml` y sus dos equivalentes bajo
// `~/.codex/`; `hooks/hooks.json` es la forma que empaqueta un plugin. Y el `matcher` filtra el nombre
// de la herramienta —`Bash` para el shell, `apply_patch`/`Edit`/`Write` para las ediciones—, no los
// nombres del protocolo interno. Con la ruta o el matcher equivocados no falla nada: Codex no encuentra
// el archivo, o lo encuentra y ningún matcher engancha, y los guards no corren sin decir una palabra.
// Fuente: https://learn.chatgpt.com/docs/hooks, comprobado contra codex-cli 0.148.0.
test('el adaptador de Codex usa la ruta y los nombres de herramienta que Codex lee', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'codex', 'manifest.json'), 'utf8'))
  assert.equal(manifest.config.target, '.codex/hooks.json')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'codex', manifest.config.source), 'utf8'))
  const matchers = config.hooks.PreToolUse.map((group) => group.matcher)
  assert.deepEqual(matchers, ['Bash', 'apply_patch|Edit|Write'])
  assert.ok(config.hooks.SessionEnd, 'el drift se comprueba al cerrar la sesión')
  // Y el comando va anclado: Codex corre el hook con el cwd de la sesión, así que una ruta relativa
  // sólo resuelve si abriste el CLI justo en la raíz. Desde un subdirectorio no encuentra el script y
  // el guard no corre —sin ruido, como todo lo demás de esta familia—. Codex no expone una variable de
  // proyecto como `$CLAUDE_PROJECT_DIR`, así que la absoluta se escribe al instalar.
  for (const group of [...config.hooks.PreToolUse, ...config.hooks.SessionEnd]) {
    for (const hook of group.hooks) {
      assert.match(hook.command, /^\{\{OPS_ROOT\}\}\//, `${hook.command} no está anclado`)
    }
  }
})

// Un cargo y un recorrido con el mismo nombre comparten archivo en el espacio de skills del runner.
// Hoy ninguno choca; lo que se sostiene es que un cargo propio de una empresa —`agents/roles/` es suyo—
// pueda llamarse `flow` y hacer desaparecer `/cauce:flow` sin que falle nada.
test('un cargo que se llama como un recorrido detiene la instalación', () => {
  const A = require('../../engine/automation')
  const { base, workspace, target, runCli } = installedProject('cauce-choque-', null)

  const own = path.join(target, 'agents', 'roles', 'flow')
  fs.mkdirSync(own, { recursive: true })
  const contract = '---\nname: flow\ndescription: Un cargo de la empresa.\n---\n\nCuerpo.\n'
  fs.writeFileSync(path.join(own, 'SKILL.md'), contract)

  const result = runCli(['automation', 'install', target, 'antigravity'])
  assert.notEqual(result.status, 0, 'no se instala pisando un recorrido')
  assert.match(`${result.stdout}${result.stderr}`, /a la vez un cargo y un recorrido/)
})

test('el puntero de un cargo conserva su frontmatter y no duplica el contrato', () => {
  const A = require('../../engine/automation')
  const repoRoot = path.resolve(__dirname, '..', '..')
  const roles = A.roleCatalog(repoRoot)
  assert.ok(roles.length >= MIN_ROLES)

  const pm = roles.find((role) => role.slug === 'product-manager')
  assert.ok(pm, 'el catálogo resuelve por slug sin exigir el tipo')
  const generated = A.roleSkill(pm)

  // El runner elige por nombre y descripción: los dos tienen que sobrevivir intactos.
  assert.match(generated, /^---\nname: product-manager\n/)
  assert.ok(generated.includes(pm.description), 'la descripción llega verbatim')
  // Y el cuerpo remite, no copia.
  assert.match(generated, /agents\/roles\/system\/product-manager\/SKILL\.md/, 'apunta a donde el cargo vive de verdad')
  const contract = path.join(repoRoot, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const original = fs.readFileSync(contract, 'utf8')
  assert.ok(generated.length < original.length / 2, 'un puntero pesa mucho menos que el contrato')

  // La ruta es relativa y no decía a qué se ancla. Dos agentes que resolvieron un cargo parados en el
  // repo ops la construyeron doblada —`<empresa>-ops/<empresa>-ops/...`— y tuvieron que deducir la
  // raíz. En sidecar el wiring vive en la carpeta de la compañía y el repo ops es uno de sus hijos.
  assert.match(generated, /se resuelven desde este directorio raíz/, 'el puntero declara su ancla')
})

// En sidecar `install` escribe en la carpeta de la compañía, que no es desde donde se corrió el comando, y
// después nombra cada archivo por su ruta relativa —`.claude/workflows/autobuild.js`—, que leída desde la
// instancia apunta a una carpeta vacía. La configuración ya avisaba dónde aterrizó; los workflows no, y son
// los que se invocan **por nombre**: una sesión abierta en otra carpeta no encuentra ninguno, y el install
// que acaba de decir «al día» es lo único que esa persona tiene para saber si se equivocó ella o el toolkit.
test('en sidecar el install dice dónde quedaron los workflows, no sólo dónde la configuración', () => {
  const { workspace, target, runCli } = installedProject('cauce-sidecar-workflows-')
  const hecho = runCli(['automation', 'install', target, 'claude'])
  assert.equal(hecho.status, 0)
  const landed = path.join(workspace, '.claude', 'workflows')
  assert.ok(fs.existsSync(path.join(landed, 'autobuild.js')), 'quedaron en la carpeta de la compañía')
  assert.ok(hecho.stdout.includes(landed),
    'y la salida los nombra desde la raíz en la que el runner tiene que estar parado para verlos')
})
