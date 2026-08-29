'use strict'

// Los adaptadores —claude, codex, gemini, antigravity—: qué instala cada uno, que exista lo que su
// manifiesto anuncia, y que ninguna ruta dé por sentado dónde quedó instalada.
//
// Dos vecinos se le parecen y no lo son: `hooks.test.js` prueba qué decide un guard, no dónde aterriza
// su wiring; `workflows.test.js` prueba el recorrido, no el formato en que cada runner lo ofrece.

const { MIN_ROLES, tempRoot, linkEngine } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..', 'automatization', 'runners')

// Una instancia sidecar con el motor enganchado y el adaptador puesto: es el montaje de casi todo lo
// que se prueba acá, y estaba copiado en cuatro tests. Devuelve también `runCli`, porque el entorno
// limpio es parte del montaje: heredar `OPS_ROOT` o `CLAUDE_PROJECT_DIR` hace que el CLI mida este
// repositorio en vez de la instancia recién creada.
function installedProject(name, runner) {
  const base = tempRoot(name)
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  const cli = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
  const env = { ...process.env }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  if (runner) assert.equal(runCli(['automation', 'install', target, runner]).status, 0)
  return { base, workspace, target, runCli, env }
}

test('cada runner declara un manifest instalable y fuentes existentes', () => {
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const dir = path.join(root, name)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.name, name)
    assert.equal(typeof manifest.capabilities.nativeHooks, 'boolean')
    assert.equal(fs.existsSync(path.resolve(dir, manifest.config.source)), true)
    for (const item of [...manifest.instructions, ...manifest.artifacts]) {
      assert.equal(fs.existsSync(path.resolve(dir, item.source)), true, `${name}: ${item.source}`)
    }
  }
})

// El nombre del recorrido es el mismo en todos los runners; el prefijo lo pone cada uno. Lo que no puede
// pasar es que un runner anuncie un recorrido que no instala: Gemini documentaba `/ops:onboard` y no
// existía ningún archivo detrás, así que el usuario lo buscaba en su lista y no estaba.
test('cada recorrido anunciado tiene un archivo que lo instala', () => {
  const expected = ['onboard', 'flow', 'autobuild', 'integration-sync', 'integration-promote']
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const commands = manifest.commands || { invocation: '', names: [] }
    if (!commands.invocation) {
      assert.deepEqual(commands.names, [], `${name}: anuncia nombres sin saber cómo se los invoca`)
      continue
    }
    assert.match(commands.invocation, /\{name\}/, `${name}: la invocación no dice dónde va el nombre`)
    // Y empieza por lo que la vuelve una invocación. Antigravity declaraba `cauce:{name}`, así que el
    // instalador imprimía `cauce:onboard` mientras la sesión real sólo respondía a `/cauce:onboard`:
    // un nombre pelado se lee como invocación y no lo es.
    assert.match(commands.invocation, /^[^a-z0-9]/, `${name}: ${commands.invocation} es un nombre, no una invocación`)
    assert.deepEqual(commands.names, expected, `${name}: no ofrece los mismos recorridos que el resto`)
    for (const command of commands.names) {
      const installed = manifest.artifacts.some((item) => item.target.includes(command))
      assert.equal(installed, true, `${name}: anuncia ${command} y no instala nada que lo provea`)
    }
  }
})

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

test('los runners con hooks nativos registran el grupo, no un hook por guard', () => {
  const { hookGroups } = require('../engine/hooks/run')
  for (const name of ['claude', 'codex']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const config = fs.readFileSync(path.resolve(root, name, manifest.config.source), 'utf8')
    assert.match(config, /guard-shell\.sh/, `${name}: falta el grupo de shell`)
    assert.match(config, /guard-files\.sh/, `${name}: falta el grupo de archivos`)
    for (const group of ['pre-shell', 'pre-files']) {
      for (const guard of hookGroups[group]) {
        assert.equal(config.includes(`guard-${guard}.sh`), false, `${name}: ${guard} quedó registrado suelto`)
      }
    }
  }
})

// Se rompe el puente y se espera que `doctor` lo diga: con los archivos en su lugar, mirar que existan
// da verde igual. Una corrida real terminó con el agente narrando trabajo que no pudo hacer.
test('doctor ejecuta el puente del runner, no sólo lo busca', () => {
  const A = require('../engine/automation')
  const base = tempRoot('cauce-puente-')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  const cli = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.OPS_ROOT
  delete env.CLAUDE_PROJECT_DIR
  const runCli = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(runCli(['automation', 'install', target, 'antigravity']).status, 0)
  assert.equal(A.doctor(target, 'antigravity', { warn() {}, error() {} }).errors.length, 0)

  const bridge = path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js')
  fs.appendFileSync(bridge, '\nesto no es javascript (\n')
  const broken = A.doctor(target, 'antigravity', { warn() {}, error() {} })
  assert.ok(broken.errors.some((error) => /hook\.js pre-shell/.test(error)), 'un puente que no arranca es error')
})

test('doctor advierte cuando sobrevive el wiring por guard suelto', () => {
  const A = require('../engine/automation')
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

test('los runners con skills nativas exponen el catálogo completo de cargos', () => {
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
  const slugs = require('../engine/agents/catalog').list(repoRoot).map((role) => role.slug)
  assert.ok(slugs.length >= MIN_ROLES, 'el catálogo debería tener decenas de cargos')

  // Los cuatro tienen skills. Codex se sumó último: su adaptador lo daba por incapaz desde 0.39.0 y el
  // CLI ya las descubría en `.agents/skills/`, así que operaba el protocolo a mano sin necesidad.
  for (const name of A.RUNNER_NAMES) {
    const manifest = A.runnerManifest(path.resolve(__dirname, '..'), name)
    assert.equal(manifest.capabilities.nativeSkills, true, `${name}: declara skills nativas`)
    assert.ok(manifest.roleSkills, `${name}: declara dónde instalarlas`)
  }
})

// Un cargo y un recorrido con el mismo nombre comparten archivo en el espacio de skills del runner.
// Hoy ninguno choca; lo que se sostiene es que un cargo propio de una empresa —`agents/roles/` es suyo—
// pueda llamarse `flow` y hacer desaparecer `/cauce:flow` sin que falle nada.
test('un cargo que se llama como un recorrido detiene la instalación', () => {
  const A = require('../engine/automation')
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
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
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

// El nombre del recorrido es el mismo en los cuatro y el prefijo lo pone cada uno, así que un archivo
// puede nombrar una invocación que en su runner no existe y nada falla: el usuario la escribe, no pasa
// nada, y no tiene cómo saber si se equivocó él o el toolkit. Pasó dos veces. `GEMINI.md` siguió
// diciendo `/ops:autobuild` después de que los comandos se mudaran a `/cauce:`, y el manifest de
// Antigravity anunciaba `cauce:onboard` sin la barra mientras la sesión real usaba `/cauce:onboard`.
// Un comando de hook se ejecuta con el cwd que el runner elija, y ninguno promete cuál. Codex usa el
// de la sesión y su propia guía pide resolver desde la raíz del git; Antigravity lo resuelve contra la
// carpeta del plugin, que ni siquiera está en el proyecto. Una ruta relativa al workspace sólo funciona
// si el CLI se abrió exactamente ahí: desde un subdirectorio el script no existe, el guard no corre, y
// como no hay error visible la instalación sigue diciendo que está operativa. Cada runner ancla como
// puede —`$CLAUDE_PROJECT_DIR`, `$GEMINI_PROJECT_DIR`, `{{OPS_ROOT}}` o una ruta propia del plugin—,
// pero ninguno puede no anclar.
test('ningún comando de hook queda relativo al workspace', () => {
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
  const automation = path.join(REPO, 'automatization')
  const loose = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(automation, 'runners', name)
    // Con los marcadores puestos: lo que se comprueba es que el comando declare su ancla, no el
    // valor que toma en una instalación concreta.
    const sourceFile = path.resolve(dir, runner.config.source)
    const config = A.render(sourceFile, '{{OPS_DIR}}', automation, '{{OPS_ROOT}}')
    for (const hit of config.matchAll(/"command":\s*"([^"]+)"/g)) {
      const command = hit[1]
      const anchored = /^\$[A-Z_]+\//.test(command)          // variable de proyecto del runner
        || /\{\{OPS_ROOT\}\}/.test(command)                  // ruta absoluta escrita al instalar
        || /^\S+ [^/]*$/.test(command)                       // relativo a la carpeta del propio plugin
      if (!anchored) loose.push(`${name}: ${command}`)
    }
  }
  assert.deepEqual(loose, [])
})

test('ningún archivo instalable nombra una invocación que su runner no tiene', () => {
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
  const automation = path.join(REPO, 'automatization')
  const FLOWS = ['onboard', 'flow', 'autobuild', 'integration-sync', 'integration-promote']
  // Precedido por `/` o `$` y no por parte de una ruta: `.claude/workflows/autobuild.js` no es una
  // invocación, y `integration-sync jira` sin prefijo tampoco.
  const invoked = new RegExp(
    String.raw`(?<![\w./-])([/$][a-z]*:?)(${FLOWS.join('|')})(?![\w./-])`, 'g',
  )
  const foreign = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const ownFiles = new Set(FLOWS.map(
      (pase) => ((runner.commands && runner.commands.invocation) || '').replace('{name}', pase),
    ))
    const dir = path.join(automation, 'runners', name)
    const copied = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copied) {
      const file = path.resolve(dir, relative)
      if (!fs.existsSync(file)) continue
      for (const hit of A.render(file, '', automation).matchAll(invoked)) {
        if (!ownFiles.has(hit[0])) foreign.push(`${name}:${relative} → ${hit[0]}`)
      }
    }
  }
  assert.deepEqual(foreign, [])
})

// Cada archivo que un adaptador copia se lee desde donde se abre la herramienta, que en modo sidecar
// no es la raíz ops. Una ruta sin `{{OPS_DIR}}` apunta a un lugar que no existe, y el modelo que la
// sigue no encuentra el protocolo ni el catálogo. Se escapó tres veces revisando de a un archivo:
// esto lo declara de una vez para todo lo instalable, incluido lo que se agregue después.
test('ninguna ruta de un adaptador da por sentado dónde se instala', () => {
  const REPO = path.resolve(__dirname, '..')
  const A = require('../engine/automation')
  const root = new RegExp(
    String.raw`(?<!\{\{OPS_DIR\}\}|\.|\/)\b(planning\/|organization\/|integrations\/`
    + String.raw`|flows\/|automatization\/|tools\/ops\.js|ops\.config\.json)`,
    'g',
  )
  const looseOnes = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(REPO, 'automatization', 'runners', name)
    const copied = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copied) {
      const file = path.resolve(dir, relative)
      if (!fs.existsSync(file) || file.endsWith('.js')) continue
      // Renderizado con el marcador por prefijo: resuelve los `INCLUDE` sin tocar los `{{OPS_DIR}}`,
      // así lo compartido se revisa una vez por cada adaptador que lo enmarca y no queda afuera.
      const text = A.render(file, '{{OPS_DIR}}', path.join(REPO, 'automatization'))
      for (const hit of text.matchAll(root)) {
        looseOnes.push(`${name}:${relative} → ${hit[1]}`)
      }
    }
  }
  assert.deepEqual(looseOnes, [])
})
