'use strict'

// Crear, actualizar y destruir una instancia por el CLI: `init`, `upgrade`, `destroy`, y el `scan` y el
// `onboard` que la reconocen antes de existir. Es la familia de comandos de `engine/cli/instance.js`.
//
// Lo que se prueba acá es qué queda escrito en el disco de una empresa y qué se niega a pisarse. La
// unidad que decide eso —ownership, manifiesto— se prueba directo en `core.test.js`.

const { MIN_ROLES, filesBelow, tempRoot, CLI, run, linkEngine } = require('./environment')
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
    const rendered = require('../engine/automation').render(sourceWorkflow, 'demo-ops/', automation)
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
  assert.ok(require('../engine/agents/catalog').list(target).length >= MIN_ROLES, 'y aun así se resuelve')
  // La taxonomía es extensible por convención, no por directorios vacíos: un tipo nuevo se
  // reconoce el día que tiene contenido.
  const catalog = require('../engine/agents/catalog')
  assert.ok(catalog.list(target).length >= MIN_ROLES, 'el catálogo llega completo')
  const extra = path.join(target, 'agents', 'specialists', 'probe')
  fs.mkdirSync(extra, { recursive: true })
  fs.writeFileSync(path.join(extra, 'SKILL.md'), '---\nname: probe\ndescription: x\n---\n')
  assert.ok(catalog.list(target).some((role) => role.type === 'specialists'), 'un tipo nuevo se reconoce solo')
  fs.rmSync(path.join(target, 'agents', 'specialists'), { recursive: true, force: true })
  // Los equipos, como los cargos, son definiciones que consume el motor: viajan con el paquete.
  assert.equal(fs.existsSync(path.join(target, 'flows', 'system')), false)
  assert.ok(require('../engine/flows/registry').list(target).length >= 2, 'y aun así se resuelven')
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

// La validación vive en el motor, pero el CLI tiene que traerla hasta la línea de comandos: un runner
// mal escrito no puede terminar en una instancia a medio configurar.
// La promesa del comando único, de punta a punta: materializar, instalar la dependencia, dejar el
// runner puesto y validar. El npm de esta prueba hace lo único que a `init` le importa de npm —dejar el
// motor resoluble desde la instancia—, para no depender de la red ni de la versión publicada.
// Parado dentro de una carpeta que ya nombra al toolkit, la instancia es esa carpeta: la alternativa
// —`acme-ops/ops/`— anida una raíz ops dentro de otra y le pone al proyecto el nombre del toolkit.
// Las preguntas salen de código y cuestan cero: la versión anterior gastaba un subagente de un minuto
// para terminar diciendo «volvé a correrlo con contexto», que a quien recién instaló no le dice nada.
// La basura de un proyecto la declara el propio proyecto, y mantener una lista de la ajena es perder.
// Lo que el arranque necesita saber es qué es esto, no qué generó el último build.
test('scan respeta lo que el proyecto declaró basura', () => {
  const repo = tempRoot('cauce-basura-')
  const put = (relative) => {
    fs.mkdirSync(path.join(repo, relative), { recursive: true })
    fs.writeFileSync(path.join(repo, relative, 'package.json'), '{"name":"x"}')
  }
  put('apps/api')
  put('generado/paquete')
  put('legacy-dump')
  put('node_modules/dependencia')
  fs.writeFileSync(path.join(repo, '.gitignore'), 'generado/\nlegacy-dump\n*.log\n')

  const result = JSON.parse(run(['scan', repo, '--json']).stdout)
  assert.deepEqual(result.services.map((service) => service.path), ['apps/api'])
  // Y con una ruta explícita se ve lo mismo que desde la instancia, incluido el proyecto de la raíz:
  // un monolito declara sus comandos arriba, y dejarlo afuera desaparecía al proyecto principal.
  fs.writeFileSync(path.join(repo, 'package.json'), '{"scripts":{"test":"jest"}}')
  const withRoot = JSON.parse(run(['scan', repo, '--json']).stdout)
  assert.deepEqual(withRoot.services.map((service) => service.path), ['.', 'apps/api'])
})

// Tres raíces declaradas, que es el mínimo para que el candidato principal de cada una colisione en
// `.`. Con una sola raíz el caso pasa sin prefijo ninguno.
test('con varias raíces cada servicio se puede nombrar', () => {
  const base = tempRoot('cauce-multi-')
  const workspace = path.join(base, 'tienda')
  for (const repo of ['api', 'web']) {
    fs.mkdirSync(path.join(workspace, repo), { recursive: true })
    fs.writeFileSync(path.join(workspace, repo, 'package.json'), '{"scripts":{"test":"x"}}')
    fs.writeFileSync(path.join(workspace, repo, '.env.example'), `${repo.toUpperCase()}_URL=\n`)
  }
  const target = path.join(workspace, 'ops')
  assert.equal(run(['init', target, '--name', 'T', '--mode', 'sidecar', '--no-install']).status, 0)
  const config = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8'))
  config.workspaceRoots = [
    { name: 'api', path: '../api' },
    { name: 'web', path: '../web' },
  ]
  fs.writeFileSync(path.join(target, 'ops.config.json'), JSON.stringify(config, null, 2))

  const guide = JSON.parse(run(['onboard', target, '--json']).stdout)
  assert.deepEqual(guide.servicios.map((service) => service.path), ['api', 'web'])
  assert.deepEqual(guide.servicios.map((service) => service.env.names), [['API_URL'], ['WEB_URL']])
})

// Un corte que no se anuncia hace pasar lo listado por todo lo que hay.
test('scan recorta la lista en pantalla y dice cuánto', () => {
  const repo = tempRoot('cauce-grande-')
  for (let index = 0; index < 25; index += 1) {
    const dir = path.join(repo, 'packages', `p${index}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"p"}')
  }
  const human = run(['scan', repo])
  assert.match(human.stdout, /… y 5 más, todos en --json/)
  assert.match(human.stdout, /25 candidato\(s\)/)
  assert.equal(JSON.parse(run(['scan', repo, '--json']).stdout).services.length, 25, 'el JSON los trae todos')
})

test('onboard guía con preguntas y no pisa lo que ya está escrito', () => {
  const base = tempRoot('cauce-guia-')
  const repo = path.join(base, 'mono')
  fs.mkdirSync(path.join(repo, 'apps', 'api'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'apps', 'api', 'package.json'), '{"scripts":{"test":"jest"}}')
  const target = path.join(repo, 'ops')
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)

  const guide = run(['onboard', target])
  assert.equal(guide.status, 0, guide.stderr)
  assert.match(guide.stdout, /^¿De qué trata este proyecto\?/, 'abre con la pregunta, no con el hallazgo')
  assert.match(guide.stdout, /Mientras tanto, esto es lo que hay: apps\/api/, 'y después, lo deducido')
  // Una sola pregunta escrita: las que siguen dependen de la respuesta, y darlas hechas es asumir que
  // el proyecto vende algo. Lo que el motor fija son las dimensiones a cubrir.
  assert.doesNotMatch(guide.stdout, /¿Qué vende/, 'nada de dar por sentado que hay negocio')
  assert.match(guide.stdout, /cómo se sostiene: venta, suscripción, donación/)
  assert.match(guide.stdout, /qué servicios o carpetas están muertos/, 'con código, el alcance importa')
  assert.doesNotMatch(guide.stdout, /dónde está el código/, 'y no se pregunta lo que está a la vista')

  const json = JSON.parse(run(['onboard', target, '--json']).stdout)
  assert.equal(json.fresh, true)
  assert.equal(json.followUps, 3, 'tres seguidas son conversación; más, formulario')
  assert.equal(json.dimensions.length, 5)

  // Con contexto escrito, la guía deja de ofrecer un arranque que pisaría trabajo ajeno.
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Organización\n\nUn proyecto libre.\n')
  const after = run(['onboard', target])
  assert.match(after.stdout, /ya tiene organization\/ escrito/)
  assert.doesNotMatch(after.stdout, /¿De qué trata/, 'no vuelve a preguntar lo contestado')
})

// El inventario es determinista a propósito: pedirle a un modelo que recorriera el árbol costó doce
// minutos en una carpeta vacía. Acá se comprueba lo que ese recorrido tiene que saber sin ayuda —dónde
// mirar, qué saltear y qué comandos declara cada servicio— y que no corra ninguno.
test('scan inventaría el workspace y saltea lo que nunca es un servicio', () => {
  const base = tempRoot('cauce-scan-')
  const repo = path.join(base, 'mono')
  const writeIt = (relative, content) => {
    fs.mkdirSync(path.join(repo, path.dirname(relative)), { recursive: true })
    fs.writeFileSync(path.join(repo, relative), content)
  }
  writeIt('apps/api/package.json', JSON.stringify({ scripts: { test: 'jest', build: 'tsc' } }))
  writeIt('apps/web/go.mod', 'module acme/web\n')
  writeIt('apps/web/Makefile', 'test:\n\tgo test ./...\n')
  // Los dos que hacen la diferencia entre milisegundos y minutos, y entre inventario y ruido.
  writeIt('node_modules/pkg/package.json', '{"name":"pkg"}')
  writeIt('.cauce-eval/caso/package.json', '{"name":"caso"}')

  const target = path.join(repo, 'ops')
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)

  // Desde la instancia y sin argumentos: el workspace de un sidecar es su carpeta madre.
  const json = run(['scan', '--json'], target)
  assert.equal(json.status, 0, json.stderr)
  const result = JSON.parse(json.stdout)
  assert.deepEqual(result.services.map((service) => service.path).sort(), ['apps/api', 'apps/web'])
  const api = result.services.find((service) => service.path === 'apps/api')
  assert.deepEqual(api.commands.test, { command: 'npm run test', source: 'package.json' })
  assert.equal(api.commands.lint, undefined, 'lo que el proyecto no declara no se inventa')
  const web = result.services.find((service) => service.path === 'apps/web')
  assert.equal(web.commands.test.source, 'Makefile', 'el Makefile gana sobre los scripts')

  // Cada servicio trae las credenciales que espera, por nombre. En un multirepo el ejemplo vive dentro
  // de cada repositorio: leyendo sólo la raíz, las de tres repos no existían para el arranque.
  fs.writeFileSync(path.join(repo, 'apps', 'api', '.env.example'), '# base\nDATABASE_URL=\nexport JWT=secreto\n')
  const withEnv = JSON.parse(run(['scan', repo, '--json']).stdout)
  const withCreds = withEnv.services.find((service) => service.path === 'apps/api')
  assert.deepEqual(withCreds.env, { file: '.env.example', names: ['DATABASE_URL', 'JWT'], truncated: 0 })
  assert.doesNotMatch(JSON.stringify(withEnv), /secreto/, 'el nombre, nunca el valor')

  const human = run(['scan'], target)
  assert.match(human.stdout, /apps\/api \[node\]/)
  assert.match(human.stdout, /2 candidato\(s\)/)
  assert.doesNotMatch(human.stdout, /node_modules|cauce-eval/, 'ni de nombre')
})

// La guía es lo único que le dice a alguien qué hacer con lo que acaba de crear, así que no puede
// depender de que la instalación haya corrido: la resuelve el mismo motor que está corriendo init.
// El motor viene fijado en una versión exacta, así que no se mueve solo: sin decirlo, «al día» se lee
// como «no hay nada nuevo» durante todas las versiones siguientes, y el usuario se queda atrás en
// silencio. La instrucción concreta vale más que la advertencia.
test('upgrade --check dice contra qué compara y cómo traer lo nuevo', () => {
  const base = tempRoot('cauce-aldia-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const check = run(['upgrade', target, '--check'])
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stdout, /al día con el motor instalado/)
  assert.match(check.stdout, /npm install --save-dev @ingeniomaps\/cauce@latest/)

  // Y el atajo de la instancia hace los dos pasos, porque `npm update` no mueve una versión exacta.
  const makefile = fs.readFileSync(path.join(target, 'Makefile'), 'utf8')
  const upgrade = makefile.split('\nupgrade:')[1].split('\n\n')[0]
  assert.match(upgrade, /npm install --save-dev @ingeniomaps\/cauce@latest/)
  assert.match(upgrade, /tools\/ops\.js upgrade \./)
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

test('init deja la instancia funcionando en una sola corrida', () => {
  const base = tempRoot('cauce-uno-')
  const repo = path.join(base, 'mono')
  const bin = path.join(base, 'bin')
  fs.mkdirSync(repo)
  fs.mkdirSync(bin)
  const engine = path.resolve(__dirname, '..')
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

test('destroy avisa qué se pierde y no borra hasta que se lo pidan dos veces', () => {
  const base = tempRoot('cauce-destroy-')
  const workspace = path.join(base, 'mono')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  fs.writeFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), '// mío\n')

  // Una instancia recién creada no perdió nada todavía, y decir lo contrario es exagerar: los moldes
  // traen ejemplos comentados que una cuenta a mano lee como trabajo real.
  const warning = run(['destroy', target])
  assert.equal(warning.status, 1, 'sin --force no borra')
  assert.match(warning.stdout, /nada escrito todavía/)
  assert.match(warning.stdout, /saca el wiring de: claude/)
  assert.equal(fs.existsSync(path.join(target, 'planning')), true)

  // Con trabajo escrito, lo enumera antes de tocar nada.
  fs.appendFileSync(path.join(target, 'planning', 'HUMAN_ACTIONS.md'), '| algo | pendiente | onboard | x |\n')
  assert.match(run(['destroy', target]).stdout, /1 acción\(es\) humana\(s\)/)

  const done = run(['destroy', target, '--force'])
  assert.equal(done.status, 0, done.stderr)
  assert.equal(fs.existsSync(target), false, 'la instancia se fue')
  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'workflows', 'autobuild.js')), false, 'y su wiring')
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), 'utf8'), '// mío\n')

  // Y no se lo puede apuntar a cualquier cosa.
  const foreign = run(['destroy', workspace])
  assert.equal(foreign.status, 2)
  assert.match(foreign.stderr, /no es una instancia de Cauce/)
})

// En modo embebido la instancia **es** el repositorio, así que borrar la carpeta se lleva el código del
// producto. Pasó de verdad sobre un caso de prueba: `destroy --force` dejó el directorio vacío.
test('destroy no se lleva el repositorio en modo embebido', () => {
  const base = tempRoot('cauce-emb-destroy-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src', 'main.rs'), 'fn main() {}\n')
  fs.writeFileSync(path.join(repo, 'Cargo.toml'), '[package]\nname = "app"\n')
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)

  const warning = run(['destroy', repo])
  assert.equal(warning.status, 1)
  assert.match(warning.stdout, /Sacar Cauce de/)
  assert.match(warning.stdout, /el código del repositorio no se toca/)

  assert.equal(run(['destroy', repo, '--force']).status, 0)
  assert.equal(fs.existsSync(path.join(repo, 'src', 'main.rs')), true, 'el código sigue')
  assert.equal(fs.readFileSync(path.join(repo, 'Cargo.toml'), 'utf8').includes('app'), true)
  assert.equal(fs.existsSync(path.join(repo, 'planning')), false, 'y lo de Cauce se fue')
  assert.equal(fs.existsSync(path.join(repo, 'ops.config.json')), false)

  // Lo que `init` escribió en npm también es de Cauce. Sobre un repo Rust dejaba un `package.json`
  // cuya única dependencia era el motor, y la salida decía «tu repositorio queda donde está» sin
  // nombrarlo: basura conspicua que nadie avisaba. Lo encontró el banco de pruebas, rehaciendo el caso.
  assert.equal(fs.existsSync(path.join(repo, 'package.json')), false,
    'el manifiesto que creó init se va con él')
})

// La inversa de `declareEngine` saca su clave y nada más: el manifiesto del repo anfitrión es suyo
// aunque hoy tenga poco, y borrarlo por venir vacío se lleva los scripts de alguien.
test('destroy respeta el package.json del repositorio y sólo saca su dependencia', () => {
  const base = tempRoot('cauce-emb-pkg-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo, { recursive: true })
  fs.writeFileSync(path.join(repo, 'package.json'), `${JSON.stringify({
    name: 'app', version: '1.4.0', scripts: { build: 'tsc' }, devDependencies: { typescript: '^5' },
  }, null, 2)}\n`)
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  assert.match(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), /@ingeniomaps\/cauce/)

  const done = run(['destroy', repo, '--force'])
  assert.equal(done.status, 0, done.stderr)
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
  assert.equal('@ingeniomaps/cauce' in (pkg.devDependencies || {}), false, 'la dependencia del motor se va')
  assert.deepEqual(pkg.devDependencies, { typescript: '^5' }, 'y las del proyecto quedan')
  assert.deepEqual(pkg.scripts, { build: 'tsc' })
  assert.equal(pkg.version, '1.4.0')
})

// Un manifiesto que no parsea no frena el destroy: quitar Cauce es lo que se pidió, y negarse por un
// archivo roto —que además puede haberlo roto otra cosa— deja la instancia a medio sacar.
test('destroy sigue aunque el package.json esté roto', () => {
  const base = tempRoot('cauce-emb-pkg-roto-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo, { recursive: true })
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  fs.writeFileSync(path.join(repo, 'package.json'), '{ esto no es json\n')

  const done = run(['destroy', repo, '--force'])
  assert.equal(done.status, 0, done.stderr)
  assert.equal(fs.existsSync(path.join(repo, 'planning')), false, 'lo de Cauce se fue igual')
  assert.equal(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), '{ esto no es json\n',
    'y el archivo roto se deja como estaba, sin adivinar qué quiso decir')
})

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

test('upgrade reemplaza lo del sistema y no toca nada del proyecto', () => {
  const base = tempRoot('cauce-upgrade-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const version = () => JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).cauceVersion
  assert.ok(version(), 'init registra de qué versión salió la instancia')

  // El proyecto trabaja: agrega lo suyo, sobrescribe una regla y suma un guard propio.
  const rules = path.join(target, 'planning', 'rules')
  fs.writeFileSync(path.join(rules, 'acme-naming.md'), '# convención propia\n')
  fs.writeFileSync(path.join(rules, 'commits.md'), '# el override de acme\n')
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Acme S.A.\n')
  const ownGuard = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(ownGuard, '#!/usr/bin/env bash\necho propio\n')

  // Nada que actualizar mientras la versión coincida.
  const current = run(['upgrade', target, '--check'])
  assert.equal(current.status, 0)
  assert.match(current.stdout, /está al día/)

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.match(upgraded.stdout, /conservado planning\/rules\/commits\.md/, 'el override se reporta')

  assert.equal(fs.readFileSync(path.join(rules, 'acme-naming.md'), 'utf8'), '# convención propia\n')
  assert.equal(fs.readFileSync(path.join(rules, 'commits.md'), 'utf8'), '# el override de acme\n')
  assert.equal(fs.readFileSync(path.join(target, 'organization', 'company.md'), 'utf8'), '# Acme S.A.\n')
  assert.equal(fs.existsSync(ownGuard), true, 'un guard propio no se borra al refrescar el runtime')
  assert.ok(fs.existsSync(path.join(rules, 'system', 'commits.md')), 'system/ sigue completo')
  assert.equal(run(['check', path.join(target, 'planning')]).status, 0)
})

test('upgrade se niega a pisar una edición del runtime sin --force', () => {
  const base = tempRoot('cauce-upgrade-edit-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# lo edité a mano\n')

  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0, 'no puede perder el cambio en silencio')
  assert.match(refused.stderr, /guard-verify\.sh/)
  assert.match(refused.stderr, /--force/)
  assert.match(fs.readFileSync(guard, 'utf8'), /lo edité a mano/, 'el archivo sigue intacto')

  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(/lo edité a mano/.test(fs.readFileSync(guard, 'utf8')), false, '--force sí lo reemplaza')
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

test('upgrade explica cómo personalizar el runtime sin editarlo, y deja rastro al descartar', () => {
  const base = tempRoot('cauce-runtime-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  // Un guard propio no necesita ningún mecanismo extra: el toolkit no lo conoce y no lo toca.
  const own = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\necho propio\n')
  assert.equal(run(['upgrade', target]).status, 0)
  assert.equal(fs.existsSync(own), true)

  // Editar uno del toolkit sí se detiene, y la salida tiene que decir algo que realmente funcione.
  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# editado\n')
  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /agregá lo tuyo al lado con otro nombre/)
  assert.equal(/junto a system\//.test(refused.stderr), false, 'hooks no tiene system/: no puede sugerirlo')

  // Descartar es legítimo; hacerlo en silencio no.
  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(forced.stdout, /descartado tu cambio en automatization\/hooks\/guard-verify\.sh/)
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

test('el catálogo llega con la dependencia y el proyecto sólo lleva lo suyo', () => {
  const catalog = require('../engine/agents/catalog')
  const base = tempRoot('cauce-catalogo-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const total = catalog.list(target).length
  assert.ok(total >= MIN_ROLES)

  // El catálogo se resuelve desde la dependencia: el proyecto no lleva una copia.
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'system')), false)

  // Un cargo propio convive y gana sobre el del sistema con el mismo slug.
  const own = path.join(target, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(own, { recursive: true })
  fs.writeFileSync(path.join(own, 'SKILL.md'), '---\nname: product-manager\ndescription: PM propio.\n---\n')
  assert.equal(catalog.list(target).length, total, 'sobrescribir no duplica el slug')
  assert.equal(catalog.resolve(target, 'product-manager'), own)

  // Y actualizar no toca lo del proyecto: el catálogo del sistema ni siquiera está acá para tocarlo.
  assert.equal(run(['upgrade', target]).status, 0)
  assert.equal(catalog.list(target).length, total)
  assert.match(fs.readFileSync(path.join(own, 'SKILL.md'), 'utf8'), /PM propio/)
})

test('nada se vendoriza, ni al crear ni al actualizar', () => {
  const base = tempRoot('cauce-vendor-')
  const target = path.join(base, 'acme')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'acme', version: '1.0.0' }))
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar', '--force']).status, 0)
  assert.equal(fs.existsSync(path.join(target, '.ops')), false, 'init no copia nada a .ops')
  assert.equal(run(['upgrade', target]).status, 0)
  // Duplicar el paquete adentro del repo de la empresa sería versionar dos veces lo mismo, y la copia
  // quedaría vieja sin que nadie se entere.
  assert.equal(fs.existsSync(path.join(target, '.ops')), false, 'upgrade tampoco lo crea')

  // Una instancia que arrastra la copia de una versión anterior no se rompe en silencio: se le dice.
  fs.mkdirSync(path.join(target, '.ops', 'engine'), { recursive: true })
  const warned = run(['upgrade', target])
  assert.equal(warned.status, 0)
  assert.match(warned.stdout, /\.ops\/, que Cauce ya no distribuye/)
  assert.equal(fs.existsSync(path.join(target, '.ops')), true, 'y no se lo borra por su cuenta')
})

test('upgrade distingue una edición local de una mejora del toolkit', () => {
  const M = require('../engine/core/manifest')
  const base = tempRoot('cauce-manifiesto-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar']).status, 0)

  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  const rule = path.join(target, 'planning', 'business-rules', 'system', 'BR-OPS-001-una-sola-tarea-activa.md')
  const record = M.read(target)
  assert.ok(Object.keys(record).length > 10, 'init deja constancia de lo entregado')
  assert.ok(record['automatization/hooks/guard-verify.sh'], 'incluye el runtime')
  assert.ok(record['planning/business-rules/system/BR-OPS-001-una-sola-tarea-activa.md'], 'y las reglas')

  // Nada editado: el upgrade pasa aunque el paquete traiga cambios.
  assert.equal(run(['upgrade', target]).status, 0)

  // Editado por la empresa: se detiene, y distingue de qué naturaleza es cada cosa.
  fs.appendFileSync(guard, '# mío\n')
  fs.appendFileSync(rule, '\nmía\n')
  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /guard-verify\.sh/)
  assert.match(refused.stderr, /BR-OPS-001/)
  assert.match(refused.stderr, /mismo ID/, 'la guía para una regla es el override')
  assert.match(refused.stderr, /guard propio sobrevive/, 'y para el runtime, agregar al lado')

  // Con --force se reemplazan y el registro vuelve a reflejar lo entregado.
  assert.equal(run(['upgrade', target, '--force']).status, 0)
  assert.equal(/# mío/.test(fs.readFileSync(guard, 'utf8')), false)
  assert.deepEqual(require('../engine/core/ownership').localChanges(target), [], 'sin ediciones pendientes')

  // `AGENTS.md` es de los que el toolkit posee de a uno y no de una colección: la clase que quedaba
  // afuera del registro. Por qué entra por la misma puerta, en `localChanges`.
  const contract = path.join(target, 'AGENTS.md')
  assert.ok(M.read(target)['AGENTS.md'], 'el archivo suelto queda registrado')
  fs.appendFileSync(contract, '\nlínea de la empresa\n')
  const stopped = run(['upgrade', target])
  assert.notEqual(stopped.status, 0, 'editar un archivo del sistema detiene la actualización')
  assert.match(stopped.stderr, /AGENTS\.md/)
  assert.equal(run(['upgrade', target, '--force']).status, 0)
  assert.equal(/línea de la empresa/.test(fs.readFileSync(contract, 'utf8')), false)
})

// El README de ADR pedía actualizar un índice del proyecto dentro de un archivo que Cauce mantiene:
// seguir el paso garantizaba perder la fila, y con el registro nuevo además dejaría la instancia sin
// poder actualizarse. Las decisiones del proyecto son los archivos del directorio.
test('ningún archivo del sistema pide que el proyecto lo edite', () => {
  const adr = fs.readFileSync(path.resolve(__dirname, '..', 'template', 'planning', 'adr', 'README.md'), 'utf8')
  assert.equal(/Decisiones del proyecto/.test(adr), false, 'sin tabla que el proyecto deba mantener')
  assert.equal(/Actualizar el índice/.test(adr), false, 'ni paso que lo mande a editar')
  assert.match(adr, /No hay índice que mantener/, 'y dice por qué no lo hay')
})

test('la instancia recibe cómo escribir lo que sí es suyo', () => {
  const base = tempRoot('cauce-plantillas-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar']).status, 0)

  // Mover una colección al paquete no puede llevarse la documentación que le habla a la empresa:
  // sin ella no tiene cómo saber qué escribir ni con qué contrato.
  for (const guide of [
    ['flows', '000-template.md'],
    ['flows', 'README.md'],
    ['organization', 'roles', 'README.md'],
    ['planning', 'business-rules', '000-template.md'],
    ['planning', 'adr', '000-template.md'],
    ['planning', 'roadmap', 'epic-000-template.md'],
  ]) {
    assert.equal(fs.existsSync(path.join(target, ...guide)), true, `falta ${guide.join('/')}`)
  }
  // Y las definiciones que consume el motor siguen sin copiarse.
  assert.equal(fs.existsSync(path.join(target, 'flows', 'system')), false)
  assert.equal(fs.existsSync(path.join(target, 'agents')), false)
})

// Los dos archivos de `delivery/` en la misma instancia: el que el toolkit reemplaza y el que es de la
// empresa. Separados no se distingue una declaración correcta de la que se olvidó del segundo.
test('la guía de entrega llega a una instancia y su project.md no', () => {
  const O = require('../engine/core/ownership')
  for (const guia of ['README.md', 'branches.md', 'release.md', 'environments.md', 'flags.md',
    'multi-repo.md']) {
    assert.ok(O.SYSTEM_FILES.includes(`planning/delivery/${guia}`), `${guia} es del toolkit`)
  }
  assert.equal(O.SYSTEM_FILES.includes('planning/delivery/project.md'), false,
    'lo que el proyecto declara sobre su entrega es suyo')

  // Y cada clase de archivo editado recibe su salida, no la de otra: antes, todo lo que no vivía bajo
  // `system/` respondía con cómo desactivar un guard, incluido el protocolo.
  const fuente = fs.readFileSync(path.resolve(__dirname, '..', 'engine', 'cli', 'instance.js'), 'utf8')
  for (const clase of ['const ruleFiles = changed.filter', 'const runtime = changed.filter',
    'const docs = changed.filter']) {
    assert.ok(fuente.includes(clase), `upgrade distingue ${clase}`)
  }
})

// El `AGENTS.md` de una instancia describe qué se puede editar y qué no, y envejecido miente: decía que
// todo `planning/` salvo cinco directorios era del proyecto justo cuando la guía de entrega pasó a ser
// del toolkit. Se contrasta contra la lista que manda de verdad.
test('el AGENTS.md de una instancia dice la propiedad que el motor aplica', () => {
  const O = require('../engine/core/ownership')
  const agents = fs.readFileSync(path.resolve(__dirname, '..', 'template', 'AGENTS.md'), 'utf8')
  const delivery = O.SYSTEM_FILES.filter((file) => file.startsWith('planning/delivery/'))

  assert.ok(delivery.length, 'el motor declara guías de entrega como suyas')
  assert.ok(agents.includes('planning/delivery/'), 'y el AGENTS.md las nombra')
  assert.ok(agents.includes('delivery/project.md'), 'junto a lo que sigue siendo del proyecto')

  // El README del paquete es lo primero que alguien lee antes de instalar, y decía que `upgrade`
  // reemplaza `system/` «y nada más se toca» — falso para veintiocho archivos del toolkit que no viven
  // bajo ningún `system/`.
  const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8')
  assert.ok(readme.includes('planning/delivery/'), 'el README nombra la guía que también se reemplaza')
  assert.equal(readme.includes('se reemplaza `system/` entero y nada más se toca'), false,
    'y no promete que sólo se toque system/')
  assert.equal(O.SYSTEM_FILES.includes('planning/delivery/project.md'), false)
})

// `teams/` pasó a llamarse `flows/`, y una empresa instalada tiene ahí sus recorridos propios. Sin
// migración `upgrade` copiaría `flows/` nuevo y dejaría `teams/<slug>/` en una ruta que el motor ya no
// mira: presente en disco e invisible para el catálogo, que es la peor de las dos pérdidas posibles
// —no avisa—. Y no alcanza con mover la carpeta: adentro los archivos también cambiaron de nombre.
test('upgrade mueve los recorridos propios de teams/ a flows/', () => {
  const base = tempRoot('cauce-rename-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)

  // La instancia como la dejó una versión anterior: la carpeta vieja, con un recorrido propio adentro.
  fs.rmSync(path.join(target, 'flows'), { recursive: true, force: true })
  const mio = path.join(target, 'teams', 'mi-recorrido')
  fs.mkdirSync(mio, { recursive: true })
  fs.writeFileSync(path.join(mio, 'team.json'), '{"slug":"mi-recorrido"}')
  fs.writeFileSync(path.join(mio, 'WORKFLOW.md'), '# Mío\n')
  fs.writeFileSync(path.join(target, 'teams', 'README.md'), 'viejo\n')

  const salida = run(['upgrade', target, '--force'])
  assert.equal(salida.status, 0, salida.stderr)

  assert.equal(fs.existsSync(path.join(target, 'teams')), false, 'la carpeta vieja no queda al lado')
  assert.equal(fs.readFileSync(path.join(target, 'flows', 'mi-recorrido', 'flow.json'), 'utf8'),
    '{"slug":"mi-recorrido"}', 'el recorrido propio llega entero y con el nombre nuevo')
  assert.ok(fs.existsSync(path.join(target, 'flows', 'mi-recorrido', 'FLOW.md')))
  assert.equal(fs.existsSync(path.join(target, 'flows', 'mi-recorrido', 'team.json')), false)
  // Y el README del molde se reemplaza por el nuevo, como cualquier archivo del toolkit.
  assert.match(fs.readFileSync(path.join(target, 'flows', 'README.md'), 'utf8'), /^# Recorridos/)
  assert.match(salida.stdout, /teams\/ → flows\//, 'y la migración se dice, no ocurre en silencio')
})
