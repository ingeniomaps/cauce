'use strict'

// Reconocer un workspace antes de que la instancia exista: qué se cuenta como servicio, qué se
// saltea y con qué pregunta arranca `onboard`. Es lo único de esta familia que no escribe nada.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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
