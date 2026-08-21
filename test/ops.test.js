'use strict'

const { tempRoot, CLI, run, linkEngine } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { hookMetadata } = require('../engine/hooks/run')

function filesBelow(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(root, entry.name)
    return entry.isDirectory() ? filesBelow(current) : [current]
  })
}

test('la plantilla canónica pasa el validador', () => {
  const result = run(['check', path.resolve(__dirname, '..', 'template', 'planning')])
  assert.equal(result.status, 0, result.stderr)
})

test('automation list-hooks explica los guards disponibles', () => {
  const result = run(['automation', 'list-hooks', path.resolve(__dirname, '..')])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(hookMetadata.some((hook) => hook.name === 'workspace-boundary'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'migrations'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'planning-drift'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'engine'))

  // Cuántos guards hay se deriva del registro, no se escribe a mano. Estuvo hardcodeado como `11` en
  // el mensaje de `automation check` y quedó viejo al agregar uno: informaba once mientras el motor
  // registraba doce. Un número de auditoría que no sale de lo que describe envejece sin avisar, y
  // quien lo compare contra `list-hooks` no sabe cuál de los dos miente.
  const { guards } = require('../engine/hooks/run')
  const A = require('../engine/automation')
  assert.equal(A.GUARD_NAMES.length, Object.keys(guards).length, 'el conteo sale del registro')
  assert.equal(hookMetadata.length, Object.keys(guards).length, 'y cada guard está documentado')
  assert.deepEqual(
    hookMetadata.map((hook) => hook.name).sort(),
    Object.keys(guards).sort(),
    'sin guards sin documentar ni documentación de guards que no existen',
  )
  const report = run(['automation', 'check', path.resolve(__dirname, '..')])
  assert.match(report.stdout, new RegExp(`${Object.keys(guards).length} guards`), 'y es lo que informa')
})

// La lista de scripts que `check` exige se deriva del registro de guards, no se copia a mano: una
// copia comprueba lo que nombra y un guard nuevo del motor no entra en la cuenta. Y se mira en una
// sola dirección a propósito — un `.sh` de más es cómo una empresa agrega el suyo, que es justo lo
// que `upgrade` le recomienda hacer.
test('automation check exige los guards del motor y respeta los de la empresa', () => {
  const base = tempRoot('cauce-hooks-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'check', target]).status, 0)

  const own = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  assert.equal(run(['automation', 'check', target]).status, 0, 'un guard de la empresa no es un error')

  const verify = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.rmSync(verify)
  const missing = run(['automation', 'check', target])
  assert.notEqual(missing.status, 0, 'uno del motor que falta sí lo es')
  assert.match(missing.stderr, /falta automatization\/hooks\/guard-verify\.sh/)

  // Y la lista sale del registro: cada guard del motor tiene su script exigido, sin repetir.
  const A = require('../engine/automation')
  const { guards, hookGroups } = require('../engine/hooks/run')
  const groups = Object.values(hookGroups).filter((names) => names.length > 1).length
  assert.equal(A.GUARD_NAMES.length + groups + 1, fs.readdirSync(
    path.resolve(__dirname, '..', 'automatization', 'hooks'),
  ).filter((name) => name.endsWith('.sh')).length, 'guards + wrappers de grupo + run-hook.sh')
  assert.equal(A.GUARD_NAMES.length, Object.keys(guards).length)
})

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

  // En sidecar el runner se instala donde el dev abre la herramienta: la carpeta de la compañía,
  // que es la que además contiene los repos de producto. El repo ops es sólo uno de sus hijos.
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
  assert.ok(require('../engine/agents/catalog').list(target).length >= 40, 'y aun así se resuelve')
  // La taxonomía es extensible por convención, no por directorios vacíos: un tipo nuevo se
  // reconoce el día que tiene contenido.
  const catalog = require('../engine/agents/catalog')
  assert.ok(catalog.list(target).length >= 40, 'el catálogo llega completo')
  const extra = path.join(target, 'agents', 'specialists', 'probe')
  fs.mkdirSync(extra, { recursive: true })
  fs.writeFileSync(path.join(extra, 'SKILL.md'), '---\nname: probe\ndescription: x\n---\n')
  assert.ok(catalog.list(target).some((role) => role.type === 'specialists'), 'un tipo nuevo se reconoce solo')
  fs.rmSync(path.join(target, 'agents', 'specialists'), { recursive: true, force: true })
  // Los equipos, como los cargos, son definiciones que consume el motor: viajan con el paquete.
  assert.equal(fs.existsSync(path.join(target, 'teams', 'system')), false)
  assert.ok(require('../engine/teams/registry').list(target).length >= 2, 'y aun así se resuelven')
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

// Sin destino la instancia se aparta a `ops/` en vez de volcarse donde se corrió el comando: un
// monorepo que recibe `planning/`, `teams/` y `AGENTS.md` en su primer nivel deja de distinguir qué es
// suyo. El nombre sale de la carpeta del proyecto —`ops` nombra al toolkit, no al negocio— y el modo
// es sidecar, el único que deja el wiring del runner donde el dev abre la herramienta.
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

// Con varias raíces declaradas, el candidato principal de cada una se llama `.`: tres servicios con el
// mismo nombre y nada que los distinga, que es como una credencial deja de poder atribuirse a un servicio.
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
  // La pregunta primero: es la misma esté el workspace vacío, sea un monorepo o sean diez repos, y
  // empezar por el inventario invierte de qué se trata esto.
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

// Desinstalar a mano es borrar `ops/` y descubrir después que cada llamada de herramienta ejecuta un
// guard que ya no está; la otra salida —borrar `.claude/` entero— se lleva puesto lo del usuario. Se
// quita lo que Cauce entregó y sigue igual que como lo entregó, y nada más.
// Borrar una instancia era una lista de pasos a mano, y una lista se ejecuta a medias: si la carpeta se
// va antes que el wiring, cada llamada de herramienta del runner queda ejecutando un guard que no está.
// Una corrida real reescribió `organization/` entero: buen contenido, otras secciones. El archivo se lee
// completo y perdió cuatro dimensiones, y nadie las va a pedir después porque nada indica que faltaban.
test('check avisa cuando una dimensión del molde desapareció', () => {
  const base = tempRoot('cauce-molde-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /sin ##/, 'el molde intacto no avisa')

  const company = path.join(target, 'organization', 'company.md')
  fs.writeFileSync(company, '# Organización\n\n## Propósito\n\nGenerar catálogos.\n')
  const warned = run(['check', path.join(target, 'planning')])
  assert.equal(warned.status, 0, 'es advertencia, no error: los archivos son de la empresa')
  assert.match(warned.stderr + warned.stdout, /company\.md: sin ## De qué se trata.*y \d+ más/)

  // Agregar secciones propias no molesta: lo que se avisa es lo que se fue.
  const mold = fs.readFileSync(path.join(target, 'organization', 'product.md'), 'utf8')
  fs.writeFileSync(path.join(target, 'organization', 'product.md'), `${mold}\n## Nuestra sección\n\nAlgo.\n`)
  const withOwn = run(['check', path.join(target, 'planning')])
  assert.doesNotMatch(withOwn.stderr + withOwn.stdout, /product\.md: sin/)
})

// Cuatro corridas reales, cuatro resultados distintos: dos cubrieron todas las variables declaradas y
// dos dejaron afuera las que la conversación no tocó —entre ellas el broker por donde entran los datos—.
// Una variable sin dueño no rompe nada hoy: rompe el día que alguien tiene que desplegar.
test('check avisa por las credenciales que nadie se llevó', () => {
  const base = tempRoot('cauce-creds-')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"scripts":{"test":"x"}}')
  fs.writeFileSync(path.join(workspace, '.env.example'), 'DATABASE_URL=\nSENTRY_DSN=\n')
  assert.equal(run(['init', target, '--name', 'R', '--mode', 'sidecar', '--no-install']).status, 0)

  // Con la instancia sin arrancar no hay dónde tendrían que estar, así que no se avisa nada.
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /nadie las carga/)

  // Escrita a medias: una nombrada, la otra no.
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Organización\n\nAlgo real.\n')
  fs.appendFileSync(path.join(target, 'AGENTS.md'), '\n- DATABASE_URL: la carga el equipo de infra.\n')
  const half = run(['check', path.join(target, 'planning')])
  assert.equal(half.status, 0, 'es advertencia: no rompe el gate')
  assert.match(half.stderr + half.stdout, /declara SENTRY_DSN/)
  assert.doesNotMatch(half.stderr + half.stdout, /DATABASE_URL/, 'la que sí tiene dueño no se nombra')

  fs.appendFileSync(path.join(target, 'planning', 'HUMAN_ACTIONS.md'),
    '| sentry | pendiente | onboard | Cargar SENTRY_DSN en el entorno |\n')
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /nadie las carga/)
})

// Una corrida real dejó `epic-001.md` sin slug: el archivo estaba escrito, era una épica legítima, y
// `check` respondía «planning válido: 0 épica(s)». El silencio es peor que el rechazo — el planning se
// reporta sano mientras el trabajo que alguien escribió no existe para el sistema.
test('check no deja pasar una épica que nadie va a leer', () => {
  const base = tempRoot('cauce-invisible-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const roadmap = path.join(target, 'planning', 'roadmap')
  const epic = [
    '---', 'epic: 001', 'title: Algo', 'status: open', 'service: .', '---', '',
    '## Criterios', '', '- **C1** — Algo observable.', '',
    '## Contexto relevante', '', '- Contexto.', '',
    '## Historias', '', '- [ ] **una** (→ C1) — Hace algo. _Aceptación: pasa algo._ (service: .)', '',
  ].join('\n')

  fs.writeFileSync(path.join(roadmap, 'epic-001.md'), epic)
  const broken = run(['check', path.join(target, 'planning')])
  assert.equal(broken.status, 1, 'no puede dar verde')
  assert.match(broken.stderr, /epic-001\.md: nadie lo lee/)

  fs.renameSync(path.join(roadmap, 'epic-001.md'), path.join(roadmap, 'epic-001-algo.md'))
  const good = run(['check', path.join(target, 'planning')])
  assert.equal(good.status, 0, good.stderr)
  assert.match(good.stdout, /1 épica/)
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

// En modo embebido el archivo de instrucciones de Codex y el `AGENTS.md` de la empresa son el mismo, y
// conservarlo entero —lo correcto para un archivo del proyecto— dejaba a ese runner sin una sola línea
// de Cauce. Su contenido se fusiona adentro, entre marcas, y el resto del archivo no se toca.
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
})

test('en embebido las instrucciones del runner conviven con las de la empresa', () => {
  const base = tempRoot('cauce-embebido-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo)
  fs.writeFileSync(path.join(repo, 'package.json'), '{"scripts":{"test":"x"}}')
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  linkEngine(repo)
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)

  const agents = path.join(repo, 'AGENTS.md')
  const withBlock = fs.readFileSync(agents, 'utf8')
  assert.match(withBlock, /## Mapa real/, 'lo de la empresa sigue')
  assert.match(withBlock, /## El arranque/, 'y lo del runner llegó')

  // Reinstalar no duplica, y lo que la empresa escriba sobrevive.
  fs.appendFileSync(agents, '\n## Nuestra sección\n\nAlgo nuestro.\n')
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)
  const again = fs.readFileSync(agents, 'utf8')
  assert.equal(again.split('## El arranque').length - 1, 1, 'una sola copia del bloque')
  assert.match(again, /Nuestra sección/)

  // Borrarlo a mano es un error, no un silencio: el runner queda sin instrucciones y nada lo decía. Se
  // saca el bloque y nada más, que es lo que haría alguien limpiando lo que no reconoce.
  const from = again.indexOf('<!-- cauce:codex inicio')
  const end = '<!-- cauce:codex fin -->'
  fs.writeFileSync(agents, again.slice(0, from) + again.slice(again.indexOf(end) + end.length))
  const broken = run(['automation', 'doctor', repo, 'codex'])
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /no tiene las instrucciones de Cauce/)

  // Y el desinstalador saca el bloque sin llevarse el archivo.
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)
  assert.equal(run(['automation', 'uninstall', repo, 'codex']).status, 0)
  const after = fs.readFileSync(agents, 'utf8')
  assert.doesNotMatch(after, /## El arranque/)
  assert.match(after, /## Mapa real/)
  assert.match(after, /Nuestra sección/)
})

test('automation uninstall saca lo del toolkit y deja lo del usuario', () => {
  const base = tempRoot('cauce-uninst-')
  const workspace = path.join(base, 'mono')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)

  // Lo del usuario, en los mismos lugares que usa el toolkit.
  const settingsFile = path.join(workspace, '.claude', 'settings.json')
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  settings.env = { MI_VAR: '1' }
  settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio' }] })
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  fs.writeFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), '// mío\n')
  fs.mkdirSync(path.join(workspace, '.claude', 'skills', 'mi-cargo'), { recursive: true })
  fs.writeFileSync(path.join(workspace, '.claude', 'skills', 'mi-cargo', 'SKILL.md'), 'propio\n')
  fs.appendFileSync(path.join(workspace, 'CLAUDE.md'), '\n# mi contexto\n')

  const result = run(['automation', 'uninstall', target, 'claude'])
  assert.equal(result.status, 0, result.stderr)

  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'workflows', 'autobuild.js')), false)
  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'skills', 'product-manager')), false)
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), 'utf8'), '// mío\n')
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'skills', 'mi-cargo', 'SKILL.md'), 'utf8'), 'propio\n')

  // Un archivo con cambios propios se conserva y se nombra: decidir sobre él es de la persona.
  assert.match(result.stdout, /conservado CLAUDE\.md/)
  assert.match(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8'), /# mi contexto/)

  const left = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  assert.deepEqual(left.env, { MI_VAR: '1' }, 'lo suyo intacto')
  assert.deepEqual(left.hooks.PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio' }] },
  ], 'y de los hooks sólo queda el suyo')

  // La instancia no se toca: borrarla es otra decisión.
  assert.equal(fs.existsSync(path.join(target, 'planning', 'PROTOCOL.md')), true)
  // Y desinstalar dos veces no es un error ni deja rastro.
  assert.equal(run(['automation', 'uninstall', target, 'claude']).status, 0)
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

test('check rechaza una tarea sin aceptación', () => {
  const base = tempRoot('cauce-invalid-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Invalid', '--mode', 'embedded']).status, 0)
  const invalidBacklog = '# Backlog\n\n## Hito demo — Demo\n\n'
    + '- [ ] **sin-aceptacion** — hacer algo (service: app)\n'
  fs.writeFileSync(path.join(target, 'planning', 'BACKLOG.md'), invalidBacklog)
  const result = run(['check', path.join(target, 'planning')])
  assert.notEqual(result.status, 0)
})

test('install reemplaza el wiring por guard suelto y conserva lo que no es suyo', () => {
  const base = tempRoot('cauce-migrate-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Migrate', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const workspace = base
  const settings = path.join(workspace, '.claude', 'settings.json')
  const guard = (name) => `$CLAUDE_PROJECT_DIR/automatization/hooks/guard-${name}.sh`
  fs.mkdirSync(path.dirname(settings), { recursive: true })
  fs.writeFileSync(settings, JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: ['destructive', 'git-add', 'dependencies', 'governance', 'verify']
          .map((name) => ({ type: 'command', command: guard(name) })) },
        { matcher: 'Edit|Write', hooks: [
          { type: 'command', command: guard('secrets') },
          { type: 'command', command: '$CLAUDE_PROJECT_DIR/scripts/mi-hook.sh' },
        ] },
      ],
    },
    env: { MI_VARIABLE: 'no-tocar' },
  }))

  const result = run(['automation', 'install', target, 'claude'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /reemplazado .*guard-verify\.sh.* por guard-shell\.sh/)

  const config = JSON.parse(fs.readFileSync(settings, 'utf8'))
  const commands = JSON.stringify(config)
  for (const name of ['destructive', 'git-add', 'dependencies', 'governance', 'verify', 'secrets']) {
    assert.equal(commands.includes(`guard-${name}.sh`), false, `${name} quedó registrado dos veces`)
  }
  assert.match(commands, /guard-shell\.sh/)
  assert.match(commands, /guard-files\.sh/)
  assert.match(commands, /mi-hook\.sh/, 'el hook del usuario sobrevive')
  assert.equal(config.env.MI_VARIABLE, 'no-tocar', 'la configuración ajena no se toca')
  // `doctor` también comprueba que el CLI del runner esté en PATH, que es un hecho de la máquina y no
  // del wiring: acá pasaba porque el dev tiene `claude` instalado y fallaba en el runner de CI, que no.
  // Lo que este test mide es que la instalación no dejara nada que reportar.
  const warnings = run(['automation', 'doctor', target, 'claude']).stderr
    .split('\n')
    .filter((line) => line.trim() && !/CLI no encontrado en PATH/.test(line))
  assert.deepEqual(warnings, [], 'doctor no reporta nada del wiring')

  const second = run(['automation', 'install', target, 'claude'])
  assert.equal(second.status, 0, second.stderr)
  assert.equal(/reemplazado/.test(second.stdout), false, 'la segunda instalación no tiene nada que podar')
})

test('check --json entrega estado consumible y conserva el exit code', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const valid = run(['check', planning, '--json'])
  assert.equal(valid.status, 0, valid.stderr)
  const report = JSON.parse(valid.stdout)
  assert.equal(report.ok, true)
  assert.deepEqual(report.errors, [])
  for (const field of ['epics', 'queued', 'done']) assert.equal(typeof report[field], 'number')

  const base = tempRoot('cauce-json-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Json', '--mode', 'embedded']).status, 0)
  fs.writeFileSync(
    path.join(target, 'planning', 'BACKLOG.md'),
    '# Backlog\n\n## Hito demo — Demo\n\n- [ ] **sin-aceptacion** — hacer algo (service: app)\n',
  )
  const invalid = run(['check', path.join(target, 'planning'), '--json'])
  assert.equal(invalid.status, 1)
  const failed = JSON.parse(invalid.stdout)
  assert.equal(failed.ok, false)
  assert.ok(failed.errors.some((error) => error.includes('sin-aceptacion')))
})

test('tree --json refleja el mismo estado que la salida de texto', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const result = run(['tree', planning, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(result.stdout)
  for (const field of ['roadmap', 'backlog']) assert.ok(Array.isArray(state[field]))
  assert.equal(state.wip, null)
  assert.equal(typeof state.done, 'number')
  for (const bucket of ['deuda', 'ideas', 'propuestas', 'lecciones']) {
    assert.equal(typeof state.inbox[bucket], 'number')
  }
  const text = run(['tree', planning, '--no-color'])
  assert.match(text.stdout, new RegExp(`DONE\\s+${state.done} tareas`))
})

test('context entrega el contexto mínimo y respeta la precedencia del protocolo', () => {
  const base = tempRoot('cauce-context-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Context', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar contexto
status: active
service: app
---

# Épica 001 — Demostrar contexto

## Criterios

- **C1** — El resultado se observa.
- **C2** — El segundo criterio no se pide.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **primera** (→ C1) — Entregar resultado. (service: app)
- [ ] **segunda** (→ C2) — Otro resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **primera** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
- [ ] **segunda** [lite] — Otro resultado. (→ C2) (service: app) (epic: 001)
`)

  const queued = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(queued.task.slug, 'primera')
  assert.deepEqual(queued.criteria.map((criterion) => criterion.id), ['C1'], 'sólo el criterio citado')
  assert.equal(queued.wip, null)
  assert.equal(queued.blocked, '')

  fs.writeFileSync(path.join(planning, 'WIP.md'), `---
task: segunda
hito: "demo — Demo"
epic: 001
phase: Build
service: app
---

## Plan aprobado
1. [x] Escribir prueba
2. [ ] Implementar
`)
  const active = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(active.task.slug, 'segunda', 'el WIP activo manda sobre el orden del backlog')
  assert.deepEqual(active.wip, { phase: 'Build', complete: 1, pending: 1 })

  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| tercera | pendiente | Ready | Definir el proveedor antes de estimar |
| vieja | resuelta | Ready | Ya se decidió |
`)
  const blockers = JSON.parse(run(['context', planning, '--json']).stdout).humanActions
  assert.deepEqual(blockers.map((action) => action.task), ['tercera'], 'las resueltas no bloquean')

  fs.writeFileSync(path.join(planning, 'WIP.md'), 'status: IDLE\n')
  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| primera | pendiente | Ready | Definir el proveedor antes de estimar |
`)
  const skipping = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(skipping.task.slug, 'segunda', 'salta la tarea con acción humana abierta')
  assert.deepEqual(skipping.blockedTasks, ['primera'])
  assert.equal(skipping.acceptance, undefined)
  assert.equal(skipping.task.acceptance, 'El segundo criterio no se pide.', 'hereda el texto del criterio citado')

  fs.writeFileSync(path.join(planning, 'AWAITING_REVIEW.md'), '# Checkpoint\n\nRevisar el hito demo.\n')
  const gated = run(['context', planning])
  assert.equal(gated.status, 0, gated.stderr)
  assert.match(gated.stdout, /^BLOCKED\s+awaiting-review — Revisar el hito demo\.$/m)
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).blocked, 'awaiting-review')
})

test('context no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8'))
  const result = run(['context', planning])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8')), before)
})

test('tree no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8')
  const result = run(['tree', planning, '--no-color'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8'), before)
})

test('valida y archiva el ciclo completo de una épica', () => {
  const base = tempRoot('cauce-cycle-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Cycle', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const config = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: 'app' }]
  fs.writeFileSync(path.join(target, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar ciclo
status: active
service: app
---

# Épica 001 — Demostrar ciclo

## Criterios

- **C1** — El resultado se observa.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **demostrar-ciclo** (→ C1) — Entregar resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **demostrar-ciclo** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
`)
  assert.equal(run(['check', planning]).status, 0)

  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(planning, 'DONE.md'), `# Done

## Hito demo — Demo

- [x] **demostrar-ciclo** (epic: 001) — Entregado
  acept: el resultado se observa
  done: node --test terminó con exit code 0
  qa: recorrido real observado con exit code 0
  tests: C1 → node --test test/demo.test.js
  commit: abc1234 feat(app): demonstrate cycle (app@feat/demo)
`)
  const epicPath = path.join(planning, 'roadmap', 'epic-001-demo.md')
  fs.writeFileSync(epicPath, fs.readFileSync(epicPath, 'utf8').replace('status: active', 'status: closed'))
  assert.equal(run(['check', planning]).status, 0)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.equal(fs.existsSync(path.join(planning, 'done', 'epic-001.md')), true)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)

  const archived = fs.readFileSync(path.join(planning, 'done', 'epic-001.md'), 'utf8')
  const recoveredEntry = archived.match(/- \[x\] \*\*demostrar-ciclo\*\*[\s\S]*$/m)[0]
  fs.appendFileSync(path.join(planning, 'DONE.md'), `\n${recoveredEntry}\n`)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)
})

test('Jira sincroniza ADF, preserva curación y promueve sin escribir remoto', () => {
  const base = tempRoot('cauce-jira-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Jira demo', '--mode', 'sidecar']).status, 0)
  fs.mkdirSync(path.join(base, 'app'))

  const registryFile = path.join(target, 'integrations', 'config.json')
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  registry.providers.jira.enabled = true
  fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`)
  assert.equal(run(['integration', 'enable', target, 'jira']).status, 0)
  const jiraFile = path.join(target, 'integrations', 'jira', 'config.json')
  const jira = JSON.parse(fs.readFileSync(jiraFile, 'utf8'))
  jira.enabled = true
  jira.baseUrl = 'https://example.atlassian.net'
  jira.jql = 'project = DEMO'
  fs.writeFileSync(jiraFile, `${JSON.stringify(jira, null, 2)}\n`)

  const fixture = path.resolve(__dirname, 'fixtures', 'jira-search.json')
  assert.equal(run(['integration', 'sync', target, 'jira', '--fixture', fixture]).status, 0)
  const staged = path.join(target, 'integrations', 'jira', 'staging', 'stories', 'DEMO-42')
  const draftFile = path.join(staged, 'draft.md')
  let draft = fs.readFileSync(draftFile, 'utf8')
  assert.match(draft, /La fecha del último sync es visible/)
  assert.match(draft, /service: "app"/)

  draft = draft.replace('state: pending', 'state: ready')
    .replace('promotionKind: ""', 'promotionKind: epic')
    .replace('- Definir destino de promoción.', '- La incidencia se convertirá en épica local.')
  fs.writeFileSync(draftFile, draft)
  assert.equal(run(['integration', 'sync', target, 'jira', '--fixture', fixture]).status, 0)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /incidencia se convertirá/)
  assert.equal(run(['integration', 'check', target, 'jira']).status, 0)
  assert.equal(run(['integration', 'promote', target, 'jira', 'DEMO-42']).status, 0)

  const promoted = fs.readdirSync(path.join(target, 'planning', 'roadmap')).find((file) => /^epic-001-/.test(file))
  assert.ok(promoted)
  const spec = fs.readFileSync(path.join(target, 'planning', 'roadmap', promoted), 'utf8')
  assert.match(spec, /source: jira/)
  assert.match(spec, /remote: DEMO-42/)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /state: promoted/)

  const interrupted = fs.readFileSync(draftFile, 'utf8')
    .replace('state: promoted', 'state: ready')
    .replace(/^promotedAt:.*$/m, 'promotedAt: ""')
  fs.writeFileSync(draftFile, interrupted)
  assert.equal(run(['integration', 'promote', target, 'jira', 'DEMO-42']).status, 0)
  const matchingEpics = fs.readdirSync(path.join(target, 'planning', 'roadmap'))
    .filter((file) => {
      const content = fs.readFileSync(path.join(target, 'planning', 'roadmap', file), 'utf8')
      return content.includes('remote: DEMO-42')
    })
  assert.equal(matchingEpics.length, 1)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /state: promoted/)

  // Las tres reconciliaciones y el plan de escritura comparten este staging y no tenían prueba por
  // CLI: el despachador las declara en una tabla, y una entrada mal escrita ahí no se nota hasta que
  // alguien la usa. `reset` va último porque reescribe el draft desde el snapshot.
  const plan = run(['integration', 'writeback-plan', target, 'jira'])
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(JSON.parse(plan.stdout).writeBack, false, 'no hay ejecutor remoto aprobado')

  for (const operation of ['reconcile', 'rebase', 'reset']) {
    const result = run(['integration', operation, target, 'jira', 'DEMO-42'])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`${operation} aplicado a DEMO-42`))
  }
  assert.notEqual(run(['integration', 'reset', target, 'jira', 'NO-EXISTE']).status, 0)

  // Un item que desaparece del remoto cambia el staging, y `sync` lo contaba sin decirlo. Con
  // curación queda marcado; sin ella se borra. Las dos cosas se avisan porque las dos son pérdidas
  // potenciales de trabajo, y la única señal era mirar el directorio.
  const blank = path.join(base, 'vacio.json')
  fs.writeFileSync(blank, '{"issues":[]}')
  // El `reset` de arriba dejó el draft igual al snapshot, o sea sin curar. Se le vuelve a poner algo
  // propio para probar la rama que conserva.
  fs.writeFileSync(draftFile, `${fs.readFileSync(draftFile, 'utf8')}\n- Nota local.\n`)
  const curated = run(['integration', 'sync', target, 'jira', '--fixture', blank])
  assert.equal(curated.status, 0, curated.stderr)
  assert.match(curated.stdout, /1 con curación ya no están en el remoto/)

  assert.equal(run(['integration', 'reset', target, 'jira', 'DEMO-42']).status, 0)
  const deleted = run(['integration', 'sync', target, 'jira', '--fixture', blank])
  assert.equal(deleted.status, 0, deleted.stderr)
  assert.match(deleted.stdout, /1 sin curar se fueron del remoto y se borraron/)
  assert.equal(fs.existsSync(staged), false, 'y el directorio efectivamente ya no está')
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
  assert.ok(total >= 40)

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

  // Los archivos que el toolkit posee de a uno entran por la misma puerta. Quedaban afuera del
  // registro, así que `upgrade` los reemplazaba sin comparar y la edición se perdía sin aviso: un
  // cargo escribió el índice de ADR que el propio README le pedía actualizar, comprobó que
  // desaparecería, y prefirió no dejar una entrada condenada a irse en silencio.
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
    ['teams', '000-template.md'],
    ['teams', 'README.md'],
    ['organization', 'roles', 'README.md'],
    ['planning', 'business-rules', '000-template.md'],
    ['planning', 'adr', '000-template.md'],
    ['planning', 'roadmap', 'epic-000-template.md'],
  ]) {
    assert.equal(fs.existsSync(path.join(target, ...guide)), true, `falta ${guide.join('/')}`)
  }
  // Y las definiciones que consume el motor siguen sin copiarse.
  assert.equal(fs.existsSync(path.join(target, 'teams', 'system')), false)
  assert.equal(fs.existsSync(path.join(target, 'agents')), false)
})

// Una bandera antes del último posicional se comía su lugar: `agents list --json` tomaba `--json`
// como la raíz y devolvía `[]` sin error. Quien lo consumía —un agente, en el caso que lo destapó—
// no tenía forma de distinguir "no hay cargos" de "me contestaste con nada".
test('una bandera no ocupa el lugar de un argumento', () => {
  const repo = path.resolve(__dirname, '..')
  const withRoot = run(['agents', 'list', repo, '--json'])
  const withoutRoot = run(['agents', 'list', '--json'], repo)
  assert.equal(withRoot.status, 0, withRoot.stderr)
  assert.ok(JSON.parse(withRoot.stdout).length >= 40, 'con raíz explícita antes de la bandera')
  assert.ok(JSON.parse(withoutRoot.stdout).length >= 40, 'y con la bandera sola')
})

// `upgrade` e `install` son para una empresa: reemplazan lo que el toolkit mantiene por lo que el
// toolkit trae. Corridos acá se llevarían puestos los archivos de la raíz —`AGENTS.md` entre ellos,
// donde vive esta misma regla—, y el catálogo se duplicaría en punteros a sí mismo. `fork` ya se
// negaba; estos dos entraban y hacían el daño en silencio.
test('los comandos de una instancia se niegan a correr contra el toolkit', () => {
  const root = tempRoot('cauce-toolkit-')
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'toolkit' }))

  const upgraded = run(['upgrade', root])
  assert.equal(upgraded.status, 2)
  assert.match(upgraded.stderr, /es el toolkit/)

  const installed = run(['automation', 'install', root, 'claude'])
  assert.equal(installed.status, 2)
  assert.match(installed.stderr, /se fabrica Cauce/)

  // Y una instancia de verdad sigue pudiendo: la negativa mira el modo, no el comando.
  const demo = path.join(root, 'demo-ops')
  assert.equal(run(['init', demo, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  linkEngine(demo)
  assert.equal(run(['automation', 'install', demo, 'claude']).status, 0)
})

// Misma distinción que en los guards, un nivel más arriba: `mode()` devolvía '' ante una
// configuración rota, así que `upgrade` no reconocía el modo `toolkit` y seguía adelante — sobre el
// repo donde vive la regla que se lo prohíbe. Ausente sigue siendo ausente y da el error de siempre.
test('una configuración ilegible detiene el comando en vez de pasar por desconocida', () => {
  const root = tempRoot('cauce-config-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = path.join(root, 'ops.config.json')

  fs.writeFileSync(config, '{"project":"x",,"mode":"toolkit"}')
  for (const args of [['upgrade', root], ['automation', 'install', root, 'claude']]) {
    const result = run(args)
    assert.notEqual(result.status, 0, `${args[0]} siguió con la configuración rota`)
    assert.match(result.stderr, /ops\.config\.json no se puede leer/)
  }

  fs.rmSync(config)
  assert.match(run(['upgrade', root]).stderr, /falta ops\.config\.json/, 'ausente no es ilegible')
})

// Una bandera con un typo se ignoraba: `check --jsonn` imprimía la salida humana con código 0, así
// que quien esperaba JSON recibía texto sin señal de nada. Es la misma familia que el bug ya
// documentado en `positionals()` —`--json` tomado como raíz—: ahí se arreglaron los posicionales y no
// las banderas. Y `--help` sólo valía como primer argumento.
test('el CLI rechaza una bandera que no existe en vez de ignorarla', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')

  const typo = run(['check', planning, '--jsonn'])
  assert.equal(typo.status, 2)
  assert.match(typo.stderr, /bandera desconocida --jsonn/)
  assert.match(typo.stderr, /Acepta: --json/, 'y dice cuáles sí valen')

  // Una bandera real pero de otro comando tampoco pasa.
  assert.equal(run(['check', planning, '--force']).status, 2)
  assert.match(run(['archive', planning, '001', '--json']).stderr, /No acepta banderas/)

  // Lo que sí existe sigue funcionando, incluidas las banderas que consumen su valor.
  assert.equal(run(['check', planning, '--json']).status, 0)
  assert.equal(run(['tree', planning, '--json', '--no-color']).status, 0)

  // Y `--help` explica el comando en vez de ejecutarlo contra el directorio actual.
  const help = run(['check', '--help'])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /^Uso:/)

  assert.equal(run(['inventado']).status, 2, 'un comando desconocido sigue fallando')
})

// La línea de comandos se leía de `process.argv` en veinticinco puntos, así que nada de esto se podía
// comprobar sin levantar un proceso y `evaluationBench` sacaba `--force` de una variable global en vez
// de recibirlo. Ahora se parsea una vez al entrar y esto es una función pura.
test('la línea de comandos se parsea una vez y se puede probar sin proceso', () => {
  const { parse } = require('../engine/cli/args')

  const simple = parse(['check', 'planning', '--json'])
  assert.deepEqual(simple.positional, ['check', 'planning'])
  assert.equal(simple.has('--json'), true)
  assert.equal(simple.has('--force'), false)

  // Una bandera con valor se lleva el argumento siguiente: no es un posicional.
  const withValue = parse(['init', 'destino', '--name', 'Demo', '--mode', 'sidecar'])
  assert.deepEqual(withValue.positional, ['init', 'destino'], 'el valor no se cuela como posicional')
  assert.equal(withValue.value('--name'), 'Demo')
  assert.equal(withValue.value('--mode'), 'sidecar')
  assert.equal(withValue.value('--fixture', 'por defecto'), 'por defecto', 'ausente cae al fallback')

  // Y una sin valor declarado no se lleva nada: el caso de `--bench` queda de posicional.
  const bench = parse(['evaluate', 'qa-engineer', '--bench', '01-caso'])
  assert.deepEqual(bench.positional, ['evaluate', 'qa-engineer', '01-caso'])
  assert.equal(bench.has('--bench'), true)

  assert.deepEqual(parse(['check', '--jsonn']).unknown('check'), ['--jsonn'])
  assert.deepEqual(parse(['check', '--json']).unknown('check'), [])
  assert.deepEqual(parse(['archive', 'planning', '001']).unknown('archive'), [])
})

// Sin linter —el toolkit no tiene dependencias, ni siquiera de desarrollo— una convención sólo existe
// si algo la comprueba. El prefijo no es cosmético: `require('fs')` lo puede secuestrar un paquete
// llamado `fs`, y `require('node:fs')` no. Estaba en 31 de 46 lugares, que es la peor de las mezclas.
// El README de un adaptador mandaba a correr `make install-antigravity` y `make doctor-antigravity`:
// ninguno de los dos existió nunca, y una instancia instalada ni siquiera tiene `Makefile`. Ya había un
// test así para la documentación de los cargos; el resto del repositorio no lo tenía, que es donde
// estaba el error. Un comando inventado en un README no rompe nada hasta que alguien lo escribe.
test('ningún documento del repositorio cita un comando make que no existe', () => {
  const root = path.resolve(__dirname, '..')
  const defined = new Set()
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    for (const hit of fs.readFileSync(path.join(root, makefile), 'utf8').matchAll(/^([a-z][a-z0-9-]*):/gm)) {
      defined.add(hit[1])
    }
  }
  const invented = []
  const review = (file) => {
    for (const hit of fs.readFileSync(file, 'utf8').matchAll(/(?:^|[`\s])make ([a-z][a-z0-9-]*)/gm)) {
      if (!defined.has(hit[1])) invented.push(`${path.relative(root, file)}: make ${hit[1]}`)
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // `evaluations/results/` es la transcripción de una corrida, no un documento que alguien siga:
      // contiene comandos que el cargo propuso, y no tienen por qué existir. Misma razón que el test
      // hermano de `agents.test.js`.
      if (entry.name === 'node_modules' || entry.name === 'results' || entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.md')) review(file)
    }
  }
  for (const dir of ['automatization', 'engine', 'template', 'test', 'teams']) walk(path.join(root, dir))
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.md')) review(path.join(root, name))
  }
  assert.ok(defined.size > 5, 'los Makefiles deberían declarar varios objetivos')
  assert.deepEqual(invented, [])
})

test('los módulos de Node se importan con el prefijo node:', () => {
  const root = path.resolve(__dirname, '..')
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const current = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(current)
      else if (entry.name.endsWith('.js')) files.push(current)
    }
  }
  for (const dir of ['engine', 'automatization', 'template', 'test']) walk(path.join(root, dir))

  const loose = []
  for (const file of files) {
    // Sin los comentarios: este mismo test nombra `require('fs')` para explicar por qué no va.
    const source = fs.readFileSync(file, 'utf8').split('\n')
      .filter((line) => !line.trim().startsWith('//')).join('\n')
    for (const match of source.matchAll(/require\('([a-z_]+)'\)/g)) {
      if (require('node:module').builtinModules.includes(match[1])) {
        loose.push(`${path.relative(root, file)}: require('${match[1]}')`)
      }
    }
  }
  assert.deepEqual(loose, [], 'usan `node:` delante')
  assert.ok(files.length > 30, `el recorrido encontró ${files.length} archivos`)
})
