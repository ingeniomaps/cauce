'use strict'

// El banco de medición: la misma instancia desechable que evalúa un cargo, poblada para medir otra cosa.
// Corre sobre la misma máquina que el banco de evaluación —`makeBench` y `seal`, que es donde está
// escrito qué garantiza cada paso— y cambia sólo qué queda adentro.
//
// Por qué el comando existe lo cuenta `engine/cli/bench.js`. Lo que esta suite fija es otra cosa: que
// cada escenario **sirva**, no que exista. Un banco que no enciende se ve igual que uno que mide, así que
// aserciar lo que quedó escrito en disco dejaría pasar justo el defecto que hay que atrapar — por eso
// cada caso le pregunta al motor —`check`, `context`— y no al archivo.

const { tempRoot, run, linkEngine } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// La ruta que el comando imprime, resuelta contra la raíz. La guarda de salida vacía es la misma que en
// `bench.test.js`, y ahí está por qué; duplicada acá se repite, así que acá sólo se usa.
function benchDir(result, toolkit) {
  const printed = result.stdout.trim()
  assert.ok(printed, `el banco no se creó, así que no hay ruta que usar: ${result.stderr}`)
  const dir = path.resolve(toolkit, printed)
  assert.ok(dir.includes(`${path.sep}.cauce-eval${path.sep}`), `no es un banco: ${dir}`)
  return dir
}

// El CLI se lanza desde `engine/cli/`, así que `opsRoot()` resolvería ahí y el modo no sería
// `toolkit`. Se le pasa la raíz como cwd, igual que la suite del banco de evaluación.
const TOOLKIT = path.resolve(__dirname, '..', '..')

// Siempre con `--force`: el banco se niega a rehacerse sobre trabajo sin recoger (caso 029), y una
// suite que corre después de una medición a mano se toparía con eso. Acá no hay evidencia que
// cuidar — la que cuida esa guarda es la de una corrida real, no la de una prueba.
const armar = (escenario) => run(['bench', escenario, '--force'], TOOLKIT)

test('bench suelto es una instancia de verdad, no un directorio vacío', () => {
  const hecho = armar('suelto')
  assert.equal(hecho.status, 0, hecho.stderr)
  const dir = benchDir(hecho, TOOLKIT)

  assert.equal(fs.existsSync(path.join(dir, 'ops.config.json')), true)
  // El motor ya viene enlazado: el banco promete una instancia donde el CLI funciona, así que enlazarlo
  // acá afirmaría que hacía falta. Se comprueba corriendo `check` adentro, que es la prueba de que sí.
  assert.equal(fs.existsSync(path.join(dir, 'node_modules', '@ingeniomaps', 'cauce')), true,
    'el banco trae su motor, no se lo pone quien lo usa')
  assert.equal(run(['check', path.join(dir, 'planning')]).status, 0, 'el planning del banco es válido')
})

// Lo que a los bancos improvisados les faltaba: que la tarea que el escenario escribe sea una tarea para
// el motor, no una línea que se le parece. Se comprueba con `context`, que es quien la ofrece, y no
// leyendo el archivo — el archivo se ve bien en los dos casos.
test('bench tarea deja una tarea que el motor reconoce, reclamada y con plan', () => {
  const hecho = armar('tarea')
  assert.equal(hecho.status, 0, hecho.stderr)
  const dir = benchDir(hecho, TOOLKIT)

  // Con el id que el banco escribió, que es el que imprime por `stderr`. La suite fija `CAUCE_RUNNER` en
  // `/w/prueba` para todas sus pruebas, así que sin esto `context` busca el WIP de ese runner y contesta
  // que no hay ninguno — el banco estaría bien y la medición miraría otro lado.
  const contexto = run(['context', path.join(dir, 'planning'), '--json'], undefined, { CAUCE_RUNNER: dir })
  assert.equal(contexto.status, 0, contexto.stderr)
  const estado = JSON.parse(contexto.stdout)
  assert.ok(estado.task, `la tarea tiene que estar en la cola: ${contexto.stdout.slice(0, 200)}`)
  assert.equal(estado.claimed, true, 'y reclamada, que es lo que un guard de plan mira')
  assert.ok(estado.wip, 'con WIP activo')
  assert.ok(estado.wip.pending > 0, 'y con un paso pendiente, o Build no tendría nada que hacer')
})

// Los dos árboles son lo que `sidecar` promete, y para qué hacen falta lo dice `populate`. Acá se
// comprueba sobre el `.git` de cada uno y no sobre el `mode` declarado: un `ops.config.json` que dice
// `sidecar` se escribe igual sin que el segundo repositorio exista, y ahí el banco miente sin fallar.
test('bench sidecar deja dos repositorios distintos y una raíz declarada', () => {
  const hecho = armar('sidecar')
  assert.equal(hecho.status, 0, hecho.stderr)
  const dir = benchDir(hecho, TOOLKIT)

  const config = JSON.parse(fs.readFileSync(path.join(dir, 'ops.config.json'), 'utf8'))
  assert.equal(config.mode, 'sidecar')
  const raices = config.workspaceRoots.map((one) => path.resolve(dir, one.path))
  assert.ok(raices.length, 'declara al menos una raíz de producto')
  for (const raiz of raices) {
    assert.equal(fs.existsSync(path.join(raiz, '.git')), true, `${raiz} tiene que ser su propio repo`)
  }
  assert.equal(fs.existsSync(path.join(dir, '.git')), true, 'y la instancia también')
})

// La guarda que el resto de esta suite nunca toca, porque todas pasan `--force`. Es la que cuida la
// evidencia de una medición hecha a mano: rehacer el banco encima la borra, y quien la perdió no tiene
// de dónde sacarla. Sin este caso, la única cobertura de la negativa era que nadie la ejerciera.
test('un banco con trabajo sin recoger no se rehace sin que alguien lo diga', () => {
  const dir = benchDir(armar('suelto'), TOOLKIT)
  fs.writeFileSync(path.join(dir, 'planning', 'MEDICION.md'), 'lo que devolvió la corrida\n')

  const sinForce = run(['bench', 'suelto'], TOOLKIT)
  assert.notEqual(sinForce.status, 0, 'no se rehace encima de trabajo sin recoger')
  assert.match(sinForce.stderr, /sin recoger/)
  assert.match(sinForce.stderr, /--force/, 'y dice cómo seguir, o la negativa deja varado')
  assert.equal(fs.existsSync(path.join(dir, 'planning', 'MEDICION.md')), true,
    'y sobre todo: no lo borró antes de negarse')
})

test('un escenario que no existe se niega nombrando los que hay', () => {
  const hecho = armar('no-existe')
  assert.notEqual(hecho.status, 0)
  for (const nombre of ['suelto', 'tarea', 'sidecar']) {
    assert.match(hecho.stderr, new RegExp(nombre), `nombra ${nombre}`)
  }
})

// Un banco se recrea entero: lo que se midió el lunes no puede ser contexto de lo que se mide el martes.
// Es la misma premisa que en el de evaluación, y acá pesa igual — una medición sobre restos de otra se
// lee igual que una limpia.
test('cada corrida recibe un banco nuevo', () => {
  const primero = armar('suelto')
  const dir = benchDir(primero, TOOLKIT)
  fs.writeFileSync(path.join(dir, 'planning', 'INBOX.md'), 'lo que dejó la corrida anterior\n')

  const segundo = armar('suelto')
  assert.equal(benchDir(segundo, TOOLKIT), dir, 'el mismo escenario usa el mismo lugar')
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'planning', 'INBOX.md'), 'utf8'),
    /corrida anterior/, 'y nace limpio')
})

// La negativa fuera del toolkit la razona `bench()`. Acá se fija que además **diga** dónde está el
// límite: un rechazo mudo deja a quien lo recibe sin saber si el comando no existe o si existe y no le
// toca, y son dos cosas distintas que se arreglan distinto.
test('bench es del toolkit; una instancia recibe la salida que le corresponde', () => {
  const base = tempRoot('cauce-bench-instancia-')
  const target = path.join(base, 'ops')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)

  const hecho = run(['bench', 'suelto'], target)
  assert.notEqual(hecho.status, 0, 'en una instancia no se arma un banco')
  assert.match(hecho.stderr, /toolkit/)
})

// Se comprueba sobre el repositorio del producto y no sobre la instancia, que es lo que dejaba pasar el
// defecto que `populate` registra: la instancia nacía limpia en los dos casos, así que mirarla devolvía
// verde con el producto viejo adentro. La aserción empieza por dónde cuelga el producto porque es la
// precondición de todo lo demás — si vuelve a quedar afuera del banco, el resto ya no mide nada.
test('el producto del sidecar también nace limpio, no sólo la instancia', () => {
  const dir = benchDir(armar('sidecar'), TOOLKIT)
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'ops.config.json'), 'utf8'))
  const app = path.resolve(dir, config.workspaceRoots[0].path)
  assert.ok(app.startsWith(dir + path.sep), `el producto tiene que colgar del banco: ${app}`)

  fs.writeFileSync(path.join(app, 'marca.txt'), 'lo que dejó la corrida anterior\n')
  const rehecho = benchDir(armar('sidecar'), TOOLKIT)
  const otra = path.resolve(rehecho, JSON.parse(
    fs.readFileSync(path.join(rehecho, 'ops.config.json'), 'utf8')).workspaceRoots[0].path)
  assert.equal(fs.existsSync(path.join(otra, 'marca.txt')), false, 'el producto se rehace con el banco')
})

// La salida de este comando es entrada de otra cosa: quien mide toma la ruta y la usa. Una segunda línea
// en `stdout` la vuelve inservible sin que nada falle a la vista —se concatena y lo que sigue resuelve
// contra un destino que no existe—, que es la forma del caso 080. El consejo del escenario `tarea` viaja
// por `stderr` justamente por eso, y esto lo fija.
test('la ruta sale sola por stdout, aunque el escenario tenga algo más que decir', () => {
  for (const escenario of ['suelto', 'tarea', 'sidecar']) {
    const hecho = armar(escenario)
    assert.equal(hecho.status, 0, hecho.stderr)
    assert.equal(hecho.stdout.trim().split('\n').length, 1,
      `${escenario} imprimió más de una línea: ${JSON.stringify(hecho.stdout)}`)
  }
  // Y el dato auxiliar no se pierde: sigue estando, en el canal que no contamina la ruta.
  assert.match(armar('tarea').stderr, /export CAUCE_RUNNER=/)
})
