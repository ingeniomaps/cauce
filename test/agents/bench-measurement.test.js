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

// Los dos repositorios son lo que `sidecar` promete, y para qué hacen falta lo dice `populate`. Acá se
// comprueba sobre el `.git` de cada uno y no sobre el `mode` declarado: un `ops.config.json` que dice
// `sidecar` se escribe igual sin que el segundo repositorio exista, y ahí el banco miente sin fallar.
// Por qué van como hermanos también está en `populate` (caso 352).
test('bench sidecar deja instancia y producto como repositorios hermanos', () => {
  const hecho = armar('sidecar')
  assert.equal(hecho.status, 0, hecho.stderr)
  const dir = benchDir(hecho, TOOLKIT)
  const { spawnSync } = require('node:child_process')
  const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).stdout.trim()

  const config = JSON.parse(fs.readFileSync(path.join(dir, 'ops.config.json'), 'utf8'))
  assert.equal(config.mode, 'sidecar')
  assert.equal(fs.existsSync(path.join(dir, '.git')), true, 'la instancia es un repositorio')
  const product = path.join(path.dirname(dir), 'app')
  assert.equal(fs.existsSync(path.join(product, '.git')), true, 'y el producto es otro, al lado')
  assert.deepEqual(config.workspaceRoots.map((one) => path.resolve(dir, one.path)), [product],
    'y la raíz declarada es ese repositorio, no la carpeta que contiene a los dos')
  // Con la raíz en la carpeta contenedora, una tarea sin servicio resolvía al repositorio del que cuelga el
  // banco, que es el del toolkit: `ops worktree` le habría agregado una rama y un árbol.
  const R = require('../../engine/core/repos')
  assert.deepEqual(R.reposFor(dir, '.'), [fs.realpathSync(product)])
  assert.deepEqual(R.reposFor(dir, 'app'), [fs.realpathSync(product)])
  assert.notEqual(git(dir, 'rev-parse', '--show-toplevel'), git(product, 'rev-parse', '--show-toplevel'))
  // Lo que se quita: el producto dentro de la instancia, registrado por ella.
  assert.equal(fs.existsSync(path.join(dir, 'app')), false)
  assert.doesNotMatch(git(dir, 'ls-files', '-s'), /^160000 /m, 'la instancia no registra ningún repositorio ajeno')
  assert.equal(git(dir, 'status', '--porcelain'), '', 'y nace limpia')
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

// Se comprueba sobre el repositorio del producto y no sobre la instancia: la instancia nacía limpia aunque
// el producto viejo siguiera ahí, así que mirarla devolvía verde. La aserción empieza por dónde cuelga el
// producto porque es la precondición de todo lo demás — fuera del banco, el borrado no lo alcanza.
test('el producto del sidecar también nace limpio, no sólo la instancia', () => {
  const dir = benchDir(armar('sidecar'), TOOLKIT)
  // El banco es la carpeta que contiene a los dos, y es lo que se borra entero.
  const bench = path.dirname(dir)
  const app = path.join(bench, 'app')
  assert.equal(path.basename(bench), 'sidecar', `la instancia cuelga del banco: ${dir}`)
  assert.equal(fs.existsSync(path.join(app, '.git')), true, `el producto tiene que colgar del banco: ${app}`)

  fs.writeFileSync(path.join(app, 'marca.txt'), 'lo que dejó la corrida anterior\n')
  assert.match(run(['bench', 'sidecar'], TOOLKIT).stderr, /sin recoger/, 'el trabajo en el producto también cuenta')
  const rehecho = benchDir(armar('sidecar'), TOOLKIT)
  assert.equal(fs.existsSync(path.join(path.dirname(rehecho), 'app', 'marca.txt')), false,
    'el producto se rehace con el banco')

  // Lo que se borra es la carpeta entera, así que todo lo que una corrida dejó en ella es trabajo sin
  // recoger: lo escrito en la instancia, el árbol de una tarea, una nota suelta.
  const refused = () => run(['bench', 'sidecar'], TOOLKIT)
  fs.writeFileSync(path.join(rehecho, 'planning', 'MEDICION.md'), 'lo medido\n')
  assert.match(refused().stderr, /sin recoger/, 'la instancia sucia')
  fs.rmSync(path.join(rehecho, 'planning', 'MEDICION.md'))
  for (const left of ['app-tarea-medida', 'NOTAS.md']) {
    const stray = path.join(path.dirname(rehecho), left)
    if (left.endsWith('.md')) fs.writeFileSync(stray, 'x\n')
    else fs.mkdirSync(stray)
    const said = refused()
    assert.notEqual(said.status, 0, `${left} es trabajo de alguien`)
    assert.ok(said.stderr.includes(left), `y la negativa lo nombra: ${said.stderr}`)
    assert.equal(fs.existsSync(stray), true, 'sin haberlo borrado antes de negarse')
    if (left.endsWith('.md')) fs.unlinkSync(stray)
    else fs.rmdirSync(stray)
  }
  assert.equal(refused().status, 0, 'limpio, se rehace sin que nadie lo diga')
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

// Caso 357. Una línea de trabajo se arma al lado de la instancia, que en el banco es al lado de lo que se
// borra: sobrevivía a rehacerlo, sin repositorio y con el estado de la corrida anterior.
test('rehacer el banco se lleva las líneas de trabajo armadas sobre él', () => {
  const dir = benchDir(armar('sidecar'), TOOLKIT)
  const bench = path.dirname(dir)
  const home = `${bench}-medida`
  const tree = path.join(home, 'ops')
  assert.equal(run(['line', dir, 'medida']).status, 0)
  assert.equal(fs.existsSync(path.join(tree, 'planning')), true, 'la precondición: la línea quedó armada')
  // Una carpeta vecina que no es una línea del banco no se toca, se llame como se llame.
  const neighbour = `${bench}-ajena`
  fs.mkdirSync(neighbour, { recursive: true })
  fs.writeFileSync(path.join(neighbour, 'nota.md'), 'no es del banco\n')

  // Lo que la línea dejó sin commitear es trabajo sin recoger, igual que lo del banco.
  fs.writeFileSync(path.join(tree, 'planning', 'MEDICION.md'), 'lo que devolvió la corrida\n')
  const refused = run(['bench', 'sidecar'], TOOLKIT)
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /sidecar-medida.*sin recoger/s, 'nombra la línea')
  assert.equal(fs.existsSync(path.join(tree, 'planning', 'MEDICION.md')), true, 'y no la borró antes de negarse')

  assert.equal(armar('sidecar').status, 0)
  assert.equal(fs.existsSync(home), false, 'con --force, la línea se va con el banco')
  assert.equal(fs.existsSync(path.join(neighbour, 'nota.md')), true, 'y la vecina que no es una línea, no')
  const again = run(['line', dir, 'medida'])
  assert.equal(again.status, 0, `la línea se puede volver a armar sobre el banco nuevo: ${again.stderr}`)

  // La que quedó huérfana —su repositorio ya no la conoce— no dice si tiene trabajo: se trata como si lo
  // tuviera, y se va igual con --force.
  fs.renameSync(path.join(dir, '.git', 'worktrees'), path.join(dir, '.git', 'worktrees-perdidos'))
  const orphan = run(['bench', 'sidecar'], TOOLKIT)
  assert.notEqual(orphan.status, 0)
  assert.match(orphan.stderr, /sidecar-medida.*sin recoger/s)
  assert.equal(armar('sidecar').status, 0)
  assert.equal(fs.existsSync(home), false)
  fs.unlinkSync(path.join(neighbour, 'nota.md'))
  fs.rmdirSync(neighbour)
})
