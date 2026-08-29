'use strict'

// Crear una instancia por el CLI: qué queda escrito en el disco de una empresa, qué se niega a
// pisarse y cómo llega el motor. `upgrade.test.js` sigue desde la versión siguiente y
// `destroy.test.js` desde el final; la unidad que decide la propiedad se prueba en `core.test.js`.

const { MIN_ROLES, filesBelow, tempRoot, CLI, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('init produce una instancia autocontenida y no sobrescribe', () => {
  const base = tempRoot('cauce-')
  const target = path.join(base, 'demo-ops')
  const created = run(['init', target, '--name', 'Demo', '--mode', 'sidecar'])
  assert.equal(created.status, 0, created.stderr)
  linkEngine(target)
  assert.equal(fs.existsSync(path.join(target, '.ops')), false, 'nada se vendoriza')
  assert.equal(fs.existsSync(path.join(target, 'planning', 'PROTOCOL.md')), true)
  const systemAdr = path.join(
    target,
    'planning',
    'adr',
    'system',
    'OPS-003-integraciones-seguras-por-staging.md',
  )
  assert.equal(fs.existsSync(systemAdr), true)
  const systemRule = path.join(
    target,
    'planning',
    'business-rules',
    'system',
    'BR-OPS-004-done-requiere-evidencia.md',
  )
  assert.equal(fs.existsSync(systemRule), true)
  const deliveryProfile = path.join(target, 'planning', 'delivery', 'project.md')
  assert.equal(fs.existsSync(deliveryProfile), true)
  assert.match(fs.readFileSync(deliveryProfile, 'utf8'), /Demo/)
  assert.equal(fs.existsSync(path.join(target, 'Makefile')), true)
  // El andamiaje de automatización son los guards, no un archivo de configuración: el que existía
  // decía qué gates estaban activos sin que nadie lo leyera, y `install` nunca lo actualizaba.
  assert.equal(fs.existsSync(path.join(target, 'automatization', 'config.json')), false)
  assert.equal(run(['automation', 'check', target]).status, 0)
  // El andamiaje de un proveedor no viene puesto: se trae al habilitarlo.
  assert.equal(fs.existsSync(path.join(target, 'integrations', 'jira')), false)
  assert.equal(run(['integration', 'enable', target, 'jira']).status, 0)
  assert.equal(run(['integration', 'check', target, 'jira']).status, 0)
  const templateToken = /\{\{(?:PROJECT_NAME|MODE|PLANNING_DIR|WORKSPACE_PATH)\}\}/
  const unresolved = filesBelow(target)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`))
    .filter((file) => templateToken.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(unresolved, [])

  // En sidecar el runner se instala en la carpeta de la compañía, no en el repo ops. Por qué, en
  // `installRoot`.
  const workspace = base
  fs.mkdirSync(path.join(workspace, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(workspace, '.claude', 'settings.json'), '{"custom":true}\n')
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  const claude = JSON.parse(fs.readFileSync(path.join(workspace, '.claude', 'settings.json'), 'utf8'))
  assert.equal(claude.custom, true)
  assert.ok(claude.hooks.PreToolUse.length)
  assert.equal(fs.existsSync(path.join(workspace, 'CLAUDE.md')), true)
  assert.equal(run(['automation', 'doctor', target, 'claude']).status, 0)
  for (const workflow of [
    { source: 'autobuild.js', target: 'autobuild.js' },
    { source: path.join('integrations', 'sync.js'), target: 'integration-sync.js' },
    { source: path.join('integrations', 'promote.js'), target: 'integration-promote.js' },
  ]) {
    const installedWorkflow = path.join(workspace, '.claude', 'workflows', workflow.target)
    // Sin npm los workflows viajan con el motor; con npm salen de la dependencia. Nunca del proyecto.
    const sourceWorkflow = path.join(
      target, 'node_modules', '@ingeniomaps', 'cauce', 'automatization', 'workflows', workflow.source,
    )
    assert.equal(fs.existsSync(installedWorkflow), true)
    // El instalado no es una copia literal: lleva resuelto dónde quedó la raíz ops y los fragmentos
    // que comparte con los demás workflows, así que se compara contra el mismo render que lo escribió.
    const automation = path.join(target, 'node_modules', '@ingeniomaps', 'cauce', 'automatization')
    const rendered = require('../../engine/automation').render(sourceWorkflow, 'demo-ops/', automation)
    assert.equal(fs.readFileSync(installedWorkflow, 'utf8'), rendered)
  }
  assert.equal(fs.existsSync(path.join(target, 'automatization', 'workflows')), false)
  assert.equal(fs.existsSync(path.join(target, 'automatization', 'runners')), false)
  // Los hooks sí: la configuración del runner los nombra por ruta literal del proyecto.
  assert.equal(fs.existsSync(path.join(target, 'automatization', 'hooks', 'guard-shell.sh')), true)
  assert.equal(run(['automation', 'install', target, 'codex']).status, 0)
  const codexHooks = JSON.parse(fs.readFileSync(path.join(workspace, '.codex', 'hooks.json'), 'utf8'))
  assert.ok(codexHooks.hooks.PreToolUse.length)
  assert.equal(run(['automation', 'doctor', target, 'codex']).status, 0)
  assert.equal(run(['automation', 'install', target, 'gemini']).status, 0)
  const gemini = JSON.parse(fs.readFileSync(path.join(workspace, '.gemini', 'settings.json'), 'utf8'))
  assert.equal(gemini.general.checkpointing.enabled, true)
  assert.equal(fs.existsSync(path.join(workspace, 'GEMINI.md')), true)
  assert.equal(fs.existsSync(path.join(workspace, '.gemini', 'commands', 'cauce', 'onboard.toml')), true)
  assert.equal(run(['automation', 'doctor', target, 'gemini']).status, 0)
  assert.equal(run(['automation', 'install', target, 'antigravity']).status, 0)
  assert.equal(fs.existsSync(path.join(workspace, '.agents', 'plugins', 'cauce', 'plugin.json')), true)
  assert.equal(run(['automation', 'doctor', target, 'antigravity']).status, 0)
  assert.equal(fs.existsSync(path.join(target, 'organization', 'company.md')), true)
  // El catálogo del sistema no se copia: se resuelve desde el paquete o desde .ops en modo copia.
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'system')), false)
  assert.ok(require('../../engine/agents/catalog').list(target).length >= MIN_ROLES, 'y aun así se resuelve')
  // La taxonomía es extensible por convención, no por directorios vacíos: un tipo nuevo se
  // reconoce el día que tiene contenido.
  const catalog = require('../../engine/agents/catalog')
  assert.ok(catalog.list(target).length >= MIN_ROLES, 'el catálogo llega completo')
  const extra = path.join(target, 'agents', 'specialists', 'probe')
  fs.mkdirSync(extra, { recursive: true })
  fs.writeFileSync(path.join(extra, 'SKILL.md'), '---\nname: probe\ndescription: x\n---\n')
  assert.ok(catalog.list(target).some((role) => role.type === 'specialists'), 'un tipo nuevo se reconoce solo')
  fs.rmSync(path.join(target, 'agents', 'specialists'), { recursive: true, force: true })
  // Los equipos, como los cargos, son definiciones que consume el motor: viajan con el paquete.
  assert.equal(fs.existsSync(path.join(target, 'flows', 'system')), false)
  assert.ok(require('../../engine/flows/registry').list(target).length >= 2, 'y aun así se resuelven')
  // Ningún workflow del toolkit se distribuye. El CI valida el toolkit, y el ciclo de aprendizaje
  // investiga la profesión: repetirlo en cada empresa produciría la misma investigación N veces.
  const workflows = path.join(target, '.github', 'workflows')
  for (const own of ['ci.yml', 'agent-learning.yml']) {
    assert.equal(fs.existsSync(path.join(workflows, own)), false, `${own} no se distribuye`)
  }

  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const localArgs = [path.join(target, 'tools', 'ops.js'), 'check', path.join(target, 'planning')]
  const local = spawnSync(process.execPath, localArgs, {
    cwd: target, encoding: 'utf8', env,
  })
  assert.equal(local.status, 0, local.stderr)

  fs.writeFileSync(path.join(target, 'README.md'), 'propiedad del usuario\n')
  fs.mkdirSync(path.join(target, 'agents', 'roles', 'product-manager'), { recursive: true })
  fs.writeFileSync(path.join(target, 'agents', 'roles', 'product-manager', 'SKILL.md'), 'personalizado\n')
  const ownGuard = path.join(target, 'automatization', 'hooks', 'guard-demo.sh')
  fs.writeFileSync(ownGuard, 'guard propio de la empresa\n')
  const forced = run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'propiedad del usuario\n')
  const own = path.join(target, 'agents', 'roles', 'product-manager', 'SKILL.md')
  assert.equal(fs.readFileSync(own, 'utf8'), 'personalizado\n')
  assert.equal(fs.readFileSync(ownGuard, 'utf8'), 'guard propio de la empresa\n')
})

// El shim se instala dentro del proyecto y hereda el `type` de su `package.json`. En un repo que
// declara `"type": "module"` —Next, Vite, cualquier cosa moderna— un archivo `.js` se carga como ESM,
// donde `require` no existe: el shim reventaba en su primera línea y con él toda fase de `autobuild`,
// que lo invoca para leer planning. El caso CommonJS va en el mismo bucle porque la corrección tiene
// que servir a los dos y arreglar uno rompiendo el otro no se vería con una sola mitad.
test('el shim corre igual en un proyecto ESM que en uno CommonJS', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  for (const type of ['module', 'commonjs']) {
    const target = tempRoot(`shim-${type}-`)
    fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify({ name: 'demo', type })}\n`)
    const created = run(['init', target, '--name', 'Demo', '--mode', 'embedded', '--force', '--no-install'])
    assert.equal(created.status, 0, created.stderr)
    linkEngine(target)
    const shim = spawnSync(process.execPath, [
      path.join(target, 'tools', 'ops.js'), 'check', path.join(target, 'planning'),
    ], { cwd: target, encoding: 'utf8', env })
    assert.equal(shim.status, 0, `type=${type}: ${shim.stderr}`)
  }
})

// Las tres cosas que decide un `init` sin argumentos —dónde cae, cómo se llama y en qué modo— en una
// sola prueba: por separado, un default correcto tapa a los otros dos.
test('init sin destino aparta la instancia en ops/', () => {
  const repo = tempRoot('cauce-mono-')
  fs.mkdirSync(path.join(repo, 'apps'))
  const created = run(['init'], repo)
  assert.equal(created.status, 0, created.stderr)
  assert.deepEqual(fs.readdirSync(repo).sort(), ['apps', 'ops'])
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'ops', 'ops.config.json'), 'utf8'))
  assert.equal(config.mode, 'sidecar')
  assert.equal(config.project, path.basename(repo))
  assert.equal(config.workspaceRoots[0].path, '..')
})

test('init imprime la guía aunque no instale la dependencia', () => {
  const base = tempRoot('cauce-guia-init-')
  const repo = path.join(base, 'mono')
  fs.mkdirSync(path.join(repo, 'apps'), { recursive: true })
  const created = run(['init', '--no-install'], repo)
  assert.equal(created.status, 0, created.stderr)
  assert.match(created.stdout, /¿De qué trata este proyecto\?/)
  assert.match(created.stdout, /siguiente: cd ops && npm install/, 'y lo pendiente sigue dicho')
})

// Parado dentro de una carpeta que ya nombra al toolkit, la instancia es esa carpeta: la alternativa
// —`acme-ops/ops/`— anida una raíz ops dentro de otra y le pone al proyecto el nombre del toolkit.
test('init no crea una carpeta ops dentro de otra', () => {
  const base = tempRoot('cauce-anidada-')
  const repo = path.join(base, 'acme-ops')
  fs.mkdirSync(repo)
  // Sólo `.git`: es lo que hay en la carpeta que alguien acaba de crear y versionar para la instancia.
  fs.mkdirSync(path.join(repo, '.git'))
  const created = run(['init', '--no-install'], repo)
  assert.equal(created.status, 0, created.stderr)
  assert.equal(fs.existsSync(path.join(repo, 'ops')), false, 'nada anidado')
  assert.equal(fs.existsSync(path.join(repo, 'planning', 'PROTOCOL.md')), true, 'la instancia es esta carpeta')
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'ops.config.json'), 'utf8'))
  assert.equal(config.project, 'acme', 'y el proyecto no se llama como el toolkit')
  assert.equal(config.mode, 'sidecar')
})

// La promesa del comando único, de punta a punta: materializar, instalar la dependencia, dejar el
// runner puesto y validar. El npm de esta prueba hace lo único que a `init` le importa de npm —dejar el
// motor resoluble desde la instancia—, para no depender de la red ni de la versión publicada.
test('init deja la instancia funcionando en una sola corrida', () => {
  const base = tempRoot('cauce-uno-')
  const repo = path.join(base, 'mono')
  const bin = path.join(base, 'bin')
  fs.mkdirSync(repo)
  fs.mkdirSync(bin)
  const engine = path.resolve(__dirname, '..', '..')
  fs.writeFileSync(
    path.join(bin, 'npm'),
    `#!/usr/bin/env bash\nmkdir -p node_modules/@ingeniomaps\nln -sfn ${engine} node_modules/@ingeniomaps/cauce\n`,
    { mode: 0o755 },
  )
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(
    process.execPath,
    [CLI, 'init', '--runner', 'claude', '--integration', 'jira', '--install'],
    { cwd: repo, encoding: 'utf8', env },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /modo sidecar/)
  assert.match(result.stdout, /planning válido/, 'y valida sin que nadie se lo pida')
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'settings.json')), true, 'el wiring va al repo')
  assert.equal(fs.existsSync(path.join(repo, 'ops', 'integrations', 'jira')), true)
  assert.doesNotMatch(result.stdout, /siguiente: cd|siguiente: npm install/, 'sin pasos que ya se hicieron')
  // Y lo que sí queda es la guía: las preguntas que nadie más puede contestar, impresas donde el que
  // recién instaló las va a ver.
  assert.match(result.stdout, /¿De qué trata este proyecto\?/)
  assert.match(result.stdout, /→ Abrí claude acá y contestale esa pregunta/, 'un solo cierre, con la acción')
})

// Y cuando npm falla, la instancia queda creada pero no funciona: decirlo es la diferencia entre
// arrancar de nuevo y perseguir un error del runner tres pasos después.
test('init no disimula un npm install que falló', () => {
  const base = tempRoot('cauce-sinred-')
  const repo = path.join(base, 'mono')
  const bin = path.join(base, 'bin')
  fs.mkdirSync(repo)
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'npm'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, [CLI, 'init', '--runner', 'claude', '--install'], {
    cwd: repo, encoding: 'utf8', env,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /todavía no funciona/)
  assert.match(result.stdout, /siguiente: cd ops && npm install/, 'y queda dicho por dónde seguir')
  assert.match(result.stdout, /automation install \. claude/, 'incluido el runner que eligió')
  assert.equal(fs.existsSync(path.join(repo, '.claude')), false, 'sin motor no se instala nada')
})

// La validación vive en el motor, pero el CLI tiene que traerla hasta la línea de comandos: un runner
// mal escrito no puede terminar en una instancia a medio configurar.
test('init rechaza un runner que no existe', () => {
  const base = tempRoot('cauce-runner-')
  const target = path.join(base, 'demo-ops')
  const result = run(['init', target, '--mode', 'sidecar', '--runner', 'emacs'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /--runner debe ser/)
})

test('init rechaza destinos atravesados por symlinks', () => {
  const base = tempRoot('cauce-symlink-')
  const target = path.join(base, 'project')
  const outside = path.join(base, 'outside')
  fs.mkdirSync(target)
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(target, 'automatization'))
  const result = run(['init', target, '--name', 'Unsafe', '--mode', 'embedded', '--force'])
  assert.notEqual(result.status, 0)
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('el motor llega siempre como dependencia, haya o no package.json', () => {
  const base = tempRoot('cauce-engine-')

  // Un repo sin package.json recibe uno mínimo: el repo ops es un sidecar, así que declarar npm acá
  // no le impone un stack al servicio que está al lado.
  const plain = path.join(base, 'sin-npm')
  assert.equal(run(['init', plain, '--name', 'Plain', '--mode', 'sidecar']).status, 0)
  assert.equal(fs.existsSync(path.join(plain, '.ops')), false, 'nada se vendoriza')
  assert.ok(JSON.parse(fs.readFileSync(path.join(plain, 'package.json'), 'utf8')).devDependencies)

  // Y uno que ya lo tiene conserva su manifiesto.
  const npm = path.join(base, 'con-npm')
  fs.mkdirSync(npm, { recursive: true })
  fs.writeFileSync(path.join(npm, 'package.json'), JSON.stringify({ name: 'host', version: '1.0.0' }))
  assert.equal(run(['init', npm, '--name', 'Npm', '--mode', 'embedded', '--force']).status, 0)
  const manifest = JSON.parse(fs.readFileSync(path.join(npm, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'host', 'el manifiesto del repo anfitrión se conserva')
  assert.ok(manifest.devDependencies['@ingeniomaps/cauce'], 'la versión queda fijada por el lockfile')
  assert.equal(run(['upgrade', npm]).status, 0)
  assert.equal(fs.existsSync(path.join(npm, '.ops')), false)
})

test('el shim falla con instrucciones cuando no encuentra el motor', () => {
  const base = tempRoot('cauce-shim-')
  const target = path.join(base, 'huerfano')
  assert.equal(run(['init', target, '--name', 'H', '--mode', 'sidecar']).status, 0)
  fs.rmSync(path.join(target, '.ops'), { recursive: true, force: true })

  const orphan = spawnSync(process.execPath, [path.join(target, 'tools', 'ops.js'), 'check'], {
    cwd: target, encoding: 'utf8',
  })
  assert.equal(orphan.status, 2, 'no puede continuar sin motor')
  assert.match(orphan.stderr, /No se encontró el motor/)
  assert.match(orphan.stderr, /npm install/)
})

test('el $schema de la instancia apunta al motor de la dependencia', () => {
  const base = tempRoot('cauce-schema-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'D', '--mode', 'sidecar']).status, 0)
  const schema = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).$schema
  assert.match(schema, /node_modules\/@ingeniomaps\/cauce/)
  linkEngine(target)
  assert.equal(fs.existsSync(path.join(target, schema)), true, 'la ruta resuelve de verdad')
})
