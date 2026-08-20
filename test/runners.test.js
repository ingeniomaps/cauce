'use strict'

require('./entorno')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', 'automatization', 'runners')

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
  const esperados = ['onboard', 'team', 'autobuild', 'integration-sync', 'integration-promote']
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const commands = manifest.commands || { invocation: '', names: [] }
    if (!commands.invocation) {
      assert.deepEqual(commands.names, [], `${name}: anuncia nombres sin saber cómo se los invoca`)
      continue
    }
    assert.match(commands.invocation, /\{name\}/, `${name}: la invocación no dice dónde va el nombre`)
    assert.deepEqual(commands.names, esperados, `${name}: no ofrece los mismos recorridos que el resto`)
    for (const comando of commands.names) {
      const instalado = manifest.artifacts.some((item) => item.target.includes(comando))
      assert.equal(instalado, true, `${name}: anuncia ${comando} y no instala nada que lo provea`)
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
  assert.equal(antigravity.lifecycle.recommendedForNewProjects, true)
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

// Un guard que bloquea y un puente que no arrancó devolvían los dos `continue` en `stop`, y son cosas
// distintas. El bloqueo es el mecanismo funcionando: hay drift, seguí trabajando. La raíz que no
// resuelve no se arregla trabajando, así que cada intento de cerrar repetía el mismo error y el agente
// quedaba sin poder terminar la sesión. `engine/hooks/run.js` marca el bloqueo con `error.blocked`.
test('el puente de Antigravity separa el guard que bloquea del puente que no arrancó', () => {
  const os = require('node:os')
  const { spawnSync } = require('node:child_process')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-stop-'))
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  const cli = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
  const env = { ...process.env }
  for (const clave of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[clave]
  const corre = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env })
  assert.equal(corre(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.mkdirSync(path.join(target, 'node_modules', '@ingeniomaps'), { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(target, 'node_modules', '@ingeniomaps', 'cauce'), 'dir')
  assert.equal(corre(['automation', 'install', target, 'antigravity']).status, 0)

  // Desde el workspace, como lo lanza Antigravity: `findRoot` cae a `process.cwd()` si la raíz
  // declarada no resuelve, y correrlo desde otro lado lo ataría a la instancia equivocada.
  const puente = path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js')
  const responde = (evento, sesion) => {
    const script = `const b=require(${JSON.stringify(puente)});`
      + `console.log(JSON.stringify(b.evaluate(${JSON.stringify(evento)},`
      + `{conversationId:${JSON.stringify(sesion)},toolCall:{args:{Cwd:${JSON.stringify(workspace)}}}})))`
    const result = spawnSync(process.execPath, ['-e', script], { cwd: workspace, encoding: 'utf8', env })
    return JSON.parse(result.stdout.trim())
  }

  // `planning-drift` deja un marcador por sesión en el tmp y sólo bloquea la primera vez, así que la
  // sesión tiene que ser nueva en cada corrida o la segunda pasa de largo y el test miente.
  fs.rmSync(path.join(target, 'planning', 'PROTOCOL.md'))
  const bloqueado = responde('stop', `drift-${process.pid}-${Date.now()}`)
  assert.equal(bloqueado.decision, 'continue', 'el drift retiene al agente: eso es el guard funcionando')
  assert.match(bloqueado.reason, /PROTOCOL\.md/)

  fs.rmSync(path.join(target, 'ops.config.json'))
  const roto = responde('stop', 'sin-raiz')
  assert.equal(roto.decision, 'stop', 'sin raíz no hay nada que el agente pueda arreglar: dejalo cerrar')
  assert.match(roto.reason, /raíz Cauce/)
  // Y el resto de los eventos sigue fallando cerrado, que es lo que no se toca.
  assert.equal(responde('pre-shell', 'sin-raiz').decision, 'deny')
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

// Instalado no es operativo: un puente que el runner no puede lanzar falla cerrado y niega cada llamada
// a herramienta. `doctor` veía los archivos en su lugar y decía «operativo» mientras nada respondía, y
// una corrida real terminó con el agente narrando trabajo que no pudo hacer.
test('doctor ejecuta el puente del runner, no sólo lo busca', () => {
  const A = require('../engine/automation')
  const base = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'cauce-puente-'))
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  const cli = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.OPS_ROOT
  delete env.CLAUDE_PROJECT_DIR
  const corre = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env })
  assert.equal(corre(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.mkdirSync(path.join(target, 'node_modules', '@ingeniomaps'), { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(target, 'node_modules', '@ingeniomaps', 'cauce'), 'dir')
  assert.equal(corre(['automation', 'install', target, 'antigravity']).status, 0)
  assert.equal(A.doctor(target, 'antigravity', { warn() {}, error() {} }).errors.length, 0)

  const puente = path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js')
  fs.appendFileSync(puente, '\nesto no es javascript (\n')
  const roto = A.doctor(target, 'antigravity', { warn() {}, error() {} })
  assert.ok(roto.errors.some((error) => /hook\.js pre-shell/.test(error)), 'un puente que no arranca es error')
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

test('los runners con skills nativas exponen el catálogo completo de cargos', () => {
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
  const slugs = require('../engine/agents/catalog').list(repoRoot).map((role) => role.slug)
  assert.ok(slugs.length >= 40, 'el catálogo debería tener decenas de cargos')

  for (const name of ['claude', 'antigravity', 'gemini']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    assert.equal(manifest.capabilities.nativeSkills, true, `${name}: declara skills nativas`)
    assert.ok(manifest.roleSkills, `${name}: declara dónde instalarlas`)
  }
  for (const name of ['codex']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    assert.equal(manifest.capabilities.nativeSkills, false, `${name}: no tiene mecanismo de skills`)
  }
})

test('el puntero de un cargo conserva su frontmatter y no duplica el contrato', () => {
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
  const roles = A.roleCatalog(repoRoot)
  assert.ok(roles.length >= 40)

  const pm = roles.find((role) => role.slug === 'product-manager')
  assert.ok(pm, 'el catálogo resuelve por slug sin exigir el tipo')
  const generated = A.roleSkill(pm)

  // El runner elige por nombre y descripción: los dos tienen que sobrevivir intactos.
  assert.match(generated, /^---\nname: product-manager\n/)
  assert.ok(generated.includes(pm.description), 'la descripción llega verbatim')
  // Y el cuerpo remite, no copia.
  assert.match(generated, /agents\/roles\/system\/product-manager\/SKILL\.md/, 'apunta a donde el cargo vive de verdad')
  const contrato = path.join(repoRoot, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const original = fs.readFileSync(contrato, 'utf8')
  assert.ok(generated.length < original.length / 2, 'un puntero pesa mucho menos que el contrato')

  // La ruta es relativa y no decía a qué se ancla. Dos agentes que resolvieron un cargo parados en el
  // repo ops la construyeron doblada —`<empresa>-ops/<empresa>-ops/...`— y tuvieron que deducir la
  // raíz. En sidecar el wiring vive en la carpeta de la compañía y el repo ops es uno de sus hijos.
  assert.match(generated, /se resuelven desde este directorio raíz/, 'el puntero declara su ancla')
})

// Cada archivo que un adaptador copia se lee desde donde se abre la herramienta, que en modo sidecar
// no es la raíz ops. Una ruta sin `{{OPS_DIR}}` apunta a un lugar que no existe, y el modelo que la
// sigue no encuentra el protocolo ni el catálogo. Se escapó tres veces revisando de a un archivo:
// esto lo declara de una vez para todo lo instalable, incluido lo que se agregue después.
test('ninguna ruta de un adaptador da por sentado dónde se instala', () => {
  const REPO = path.resolve(__dirname, '..')
  const A = require('../engine/automation')
  const raiz = new RegExp(
    String.raw`(?<!\{\{OPS_DIR\}\}|\.|\/)\b(planning\/|organization\/|integrations\/`
    + String.raw`|teams\/|automatization\/|tools\/ops\.js|ops\.config\.json)`,
    'g',
  )
  const sueltas = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(REPO, 'automatization', 'runners', name)
    const copiados = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copiados) {
      const file = path.resolve(dir, relative)
      if (!fs.existsSync(file) || file.endsWith('.js')) continue
      for (const hit of fs.readFileSync(file, 'utf8').matchAll(raiz)) {
        sueltas.push(`${name}:${relative} → ${hit[1]}`)
      }
    }
  }
  assert.deepEqual(sueltas, [])
})
