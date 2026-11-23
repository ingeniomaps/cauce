'use strict'

// El banco de evaluación: la instancia desechable donde se mide un cargo. Es un subsistema con
// vocabulario propio —se crea, se recrea entera, se versiona, se niega a pisar trabajo sin recoger— y
// estaba dentro de la suite del CLI, que prueba otra cosa.

const { MIN_ROLES, tempRoot, linkEngine, discard, undeletable } = require('../support/environment')
const environment = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const CAT = require('../../engine/cli/catalog')

// Los bancos que esta suite arma se arman sobre este repositorio —el banco es del toolkit a propósito— y
// quedaban ahí después de cada corrida (caso 372). Se anota cada caso que se pide, y al cierre se retira
// eso y nada más: `.cauce-eval/` guarda también bancos de evaluaciones reales, con informes que pueden no
// estar consolidados, y un nombre que no se pidió acá no se toca. Anotarlo al pedirlo, en vez de listarlo,
// es lo que deja cubierto el caso que alguien agregue después.
const TOOLKIT = path.resolve(__dirname, '..', '..')
const BENCHES = path.join(TOOLKIT, '.cauce-eval', 'product-manager')
const asked = new Set()
function run(args, cwd) {
  // Un `--bench` sin nombre es una prueba de que el comando lo exige, no un banco; y uno que no cuelga de
  // la carpeta del cargo —`../otro`— tampoco: anotarlo dejaría el cierre borrando un banco hermano real.
  const at = args[0] === 'evaluate' ? args.indexOf('--bench') : -1
  const name = at >= 0 ? args[at + 1] : undefined
  const dir = typeof name === 'string' ? path.resolve(BENCHES, name) : ''
  if (dir.startsWith(BENCHES + path.sep)) asked.add(dir)
  return environment.run(args, cwd)
}

test.after(() => {
  // Un banco que el comando rechazó no llegó a existir, y uno que una prueba ya retiró tampoco. Se retira
  // antes de aserciar nada: una aserción que corte primero dejaría los bancos en el repositorio.
  for (const dir of asked) if (fs.existsSync(dir)) discard(dir)
  if (fs.existsSync(BENCHES) && !fs.readdirSync(BENCHES).length) fs.rmdirSync(BENCHES)
  assert.ok([...asked].every((dir) => dir.startsWith(BENCHES + path.sep)),
    'sólo lo que cuelga de la carpeta del cargo')
  for (const dir of asked) assert.equal(fs.existsSync(dir), false, `${dir} quedó en el repositorio`)
})

// La ruta del banco, resuelta contra la raíz que se le pasó. Nunca desde una salida vacía: con `stdout`
// en blanco `path.resolve(toolkit, '')` **es** la raíz del toolkit, y lo que siga la trata como si fuera
// un banco —le quita permisos, la borra—. Eso borró este repositorio el 2026-09-10 (caso 080).
//
// Se exige además que la ruta cuelgue de `.cauce-eval/`: la salida vacía fue la forma que ocurrió, y no
// la única que produce una ruta que no es un banco.
function benchDir(result, toolkit) {
  const printed = result.stdout.trim()
  assert.ok(printed, `el banco no se creó, así que no hay ruta que usar: ${result.stderr}`)
  const dir = path.resolve(toolkit, printed)
  assert.ok(dir.includes(`${path.sep}.cauce-eval${path.sep}`), `no es un banco: ${dir}`)
  return dir
}

// Que el banco sea una instancia de verdad y no un directorio: `check` pasa adentro, el catálogo
// resuelve y `planning/` está escribible. Para qué hace falta, en `evaluationBench`.
test('el banco de evaluación es una instancia de verdad, no un directorio vacío', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const bench = run(['evaluate', 'product-manager', '--bench', '06-instancia', '--force'], toolkit)
  assert.equal(bench.status, 0, bench.stderr)
  // La salida es relativa a la raíz que se le pasó, no al cwd de la suite: resolverla contra `toolkit`
  // es lo que deja estas pruebas independientes de desde dónde se corran.
  const dir = benchDir(bench, toolkit)
  assert.ok(fs.existsSync(path.join(dir, 'ops.config.json')), 'con su configuración')
  assert.ok(fs.existsSync(path.join(dir, 'planning', 'INBOX.md')), 'y un planning donde escribir')

  // `findOpsRoot` reconoce una raíz ops por tener planning/: sin esto los guards no la ven siquiera.
  const valid = run(['check', path.join(dir, 'planning')], toolkit)
  assert.equal(valid.status, 0, valid.stdout + valid.stderr)

  // Y el catálogo resuelve desde adentro, que es lo que hace del banco un lugar de trabajo.
  const roles = JSON.parse(run(['agents', 'list', dir, '--json'], toolkit).stdout)
  assert.ok(roles.length >= MIN_ROLES, `el banco ve el catálogo (${roles.length})`)
})

// Se fija la ruta entera y no sólo que no sea absoluta: con `path.isAbsolute` solo, una salida vacía
// o un `.` pelado también pasaban. Por qué relativa, en la rama `--bench` de `catalog.js`.
test('la ruta del banco se imprime relativa a la raíz', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const bench = run(['evaluate', 'product-manager', '--bench', '12-ruta-relativa', '--force'], toolkit)
  assert.equal(bench.status, 0, bench.stderr)
  const dir = bench.stdout.trim()
  assert.equal(dir, path.join('.cauce-eval', 'product-manager', '12-ruta-relativa'))
  assert.ok(fs.existsSync(path.resolve(toolkit, dir)), 'y resuelve contra la raíz que se le pasó')
})

// Reutilizarlo dejaría que lo que un cargo escribió el lunes sea contexto del que responde el martes,
// y dos corridas del mismo caso dejarían de ser comparables.
test('el banco se recrea entero en cada corrida', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const dir = benchDir(run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit), toolkit)
  const trail = path.join(dir, 'planning', 'rastro-de-la-corrida-anterior.md')
  fs.writeFileSync(trail, 'lo que escribió el cargo la vez pasada\n')
  // El resultado de la segunda corrida se mira. Descartarlo era lo que volvía mudo este caso: **toda**
  // falla del comando —`EACCES`, `ENOTEMPTY`, `EEXIST`— terminaba en el mismo `true !== false` sobre el
  // rastro, con el stderr tirado. Tres investigaciones dejaron escrito «no está establecido por qué» y
  // ésta es la razón: el instrumento borraba la evidencia justo cuando importaba (caso 066).
  const rebuilt = run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit)
  assert.equal(rebuilt.status, 0, `rehacer el banco falló: ${rebuilt.stderr}`)
  assert.equal(fs.existsSync(trail), false, 'la corrida anterior no contamina la siguiente')
})

// Un banco que no se puede rehacer corta la corrida nombrando la ruta, en vez de seguir sobre un árbol
// que no es nuevo. Se mide quitando permiso de escritura, que hace fallar el borrado de forma
// reproducible — y **no** pasa por la guarda: sin permiso `rmSync` lanza, así que lo que corta es el
// error y no la comprobación. Lo que esta prueba fija es que el fallo hable con la ruta puesta, que es
// lo único que separa una intermitencia de una regresión cuando llega desde CI.
test('un banco que no se puede rehacer lo dice, en vez de seguir', { skip: process.getuid?.() === 0 }, () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const dir = benchDir(run(['evaluate', 'product-manager', '--bench', '13-sin-permiso', '--force'], toolkit), toolkit)
  fs.chmodSync(dir, 0o500)
  try {
    const denied = run(['evaluate', 'product-manager', '--bench', '13-sin-permiso', '--force'], toolkit)
    assert.notEqual(denied.status, 0, 'no sigue como si el banco fuera nuevo')
    assert.match(denied.stderr, /13-sin-permiso/, 'y nombra la ruta, que es lo que permite diagnosticar')
  } finally {
    fs.chmodSync(dir, 0o755)
    discard(dir)
  }
})

// La respuesta de un cargo puede no ser toda su entrega: `backend-engineer` contestó un resumen del
// webhook y escribió el contrato —firma, orden de verificación, catorce pruebas— en su `INBOX.md`. El
// juez, que sólo leía la respuesta, lo dio por ausente y lo reprobó. El banco versionado desde su
// estado limpio es lo que deja ver la diferencia entre el resumen y la entrega.
test('el banco queda versionado para poder ver qué escribió el cargo', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  // `--force` porque el test deja el banco escrito y la corrida siguiente tiene que poder rehacerlo;
  // y se comprueba el estado antes de usar la salida: con `dir` vacío, `git -C ''` cae en el repo padre
  // y contesta sobre el toolkit sin dar error.
  const bench = run(['evaluate', 'product-manager', '--bench', '08-versionado', '--force'], toolkit)
  assert.equal(bench.status, 0, bench.stderr)
  const dir = benchDir(bench, toolkit)
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).stdout

  assert.equal(git('status', '--porcelain').trim(), '', 'el banco nace sin cambios pendientes')
  assert.match(git('log', '--oneline'), /banco limpio/, 'con su estado limpio ya commiteado')

  fs.appendFileSync(path.join(dir, 'planning', 'INBOX.md'), '\n- lo que produjo el cargo\n')
  const changes = git('status', '--porcelain')
  assert.match(changes, /planning\/INBOX\.md/, 'y lo escrito aparece como cambio')
  assert.match(git('diff'), /lo que produjo el cargo/, 'con su contenido visible en el diff')

  // `node_modules` es un symlink al toolkit, no obra del cargo: verlo ahí sería ruido y además
  // arrastraría el repositorio entero al diff.
  assert.equal(changes.includes('node_modules'), false)
})

// El banco arranca con trabajo sin commitear, que es el estado que el freno mira. Con el banco limpio
// el comando pasa, así que sin esa precondición el caso no mide nada.
test('rehacer un banco con trabajo sin recoger se niega', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const dir = benchDir(run(['evaluate', 'product-manager', '--bench', '09-proteccion', '--force'], toolkit), toolkit)
  fs.appendFileSync(path.join(dir, 'planning', 'INBOX.md'), '\n- lo que produjo el cargo\n')

  const denied = run(['evaluate', 'product-manager', '--bench', '09-proteccion'], toolkit)
  assert.equal(denied.status, 2)
  assert.match(denied.stderr, /trabajo sin recoger/)
  assert.match(fs.readFileSync(path.join(dir, 'planning', 'INBOX.md'), 'utf8'), /lo que produjo el cargo/)

  // Con el registro ya guardado, rehacerlo es intencional y se permite.
  const forced = run(['evaluate', 'product-manager', '--bench', '09-proteccion', '--force'], toolkit)
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(fs.readFileSync(path.join(dir, 'planning', 'INBOX.md'), 'utf8').includes('produjo'), false)
})

// Dos casos del mismo cargo, que es lo único que distingue un banco por caso de uno por cargo. Con un
// banco compartido ninguno cambió de veredicto: lo que cambió fue la respuesta, que ya no era la que
// el caso pedía medir — uno evaluó cuatro candidatas que en su enunciado no existían.
test('cada caso recibe su propio banco', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const first = run(['evaluate', 'product-manager', '--bench', '10-uno', '--force'], toolkit)
  const second = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
  assert.equal(first.status, 0, first.stderr)
  assert.equal(second.status, 0, second.stderr)
  const one = benchDir(first, toolkit)
  const other = benchDir(second, toolkit)
  assert.notEqual(one, other, 'dos casos no comparten directorio')

  fs.appendFileSync(path.join(one, 'planning', 'INBOX.md'), '\n- lo que escribió el primer caso\n')
  const neighbor = fs.readFileSync(path.join(other, 'planning', 'INBOX.md'), 'utf8')
  assert.equal(neighbor.includes('el primer caso'), false, 'y no se leen entre sí')

  // Preparar el banco de un caso no puede borrar el del vecino, que quizá esté a mitad de corrida.
  // El `stderr` va en la aserción como en las dos de arriba: sin él, un rojo en CI dice `1 !== 0` y
  // nada más, y distinguir una intermitencia de una regresión cuesta descartar hipótesis a mano.
  const rebuilt = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
  assert.equal(rebuilt.status, 0, rebuilt.stderr)
  assert.match(fs.readFileSync(path.join(one, 'planning', 'INBOX.md'), 'utf8'), /el primer caso/)

  // El nombre entra en una ruta: no puede escaparse del directorio de bancos.
  const escape = run(['evaluate', 'product-manager', '--bench', '../../etc'], toolkit)
  assert.equal(escape.status, 2)
  assert.match(escape.stderr, /nombre inválido para el banco/)
})

// Los dos modos en la misma prueba: separados, un `--bench` que devolviera siempre lo mismo pasaría la mitad que se
// mirara. Desde el caso 509 una instancia tiene banco para lo suyo; para un cargo del catálogo la salida es adoptarlo,
// y ahora adoptarlo sí habilita el banco (lo mide «un cargo propio tiene banco», más abajo).
test('en una instancia, el banco de un cargo del catálogo se niega nombrando cómo hacerlo propio', () => {
  const base = tempRoot('cauce-bench-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  const result = run(['evaluate', 'product-manager', '--bench'], target)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /product-manager es del catálogo de Cauce: se evalúa en el toolkit/)
  assert.match(result.stderr, /ops agents fork product-manager/, 'y nombra la salida real')
  assert.doesNotMatch(result.stderr, /--bench es del toolkit/, 'el mensaje viejo, que ya no es cierto, no sale')
})

// Se mide por el efecto: con la variable puesta a propósito, ni el señuelo gana el commit del banco ni
// el banco se queda sin el suyo. Por qué `-C` no alcanza lo dice `engine/cli/catalog.js`.
test('el banco commitea en el banco aunque el entorno traiga GIT_DIR', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const decoy = tempRoot('cauce-senuelo-')
  spawnSync('git', ['-C', decoy, 'init', '-q'], { encoding: 'utf8' })

  const earlier = process.env.GIT_DIR
  process.env.GIT_DIR = path.join(decoy, '.git')
  let bench
  try {
    bench = run(['evaluate', 'product-manager', '--bench', '09-git-dir', '--force'], toolkit)
  } finally {
    if (earlier === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = earlier
  }
  assert.equal(bench.status, 0, bench.stderr)

  const decoyLog = spawnSync('git', ['-C', decoy, 'log', '--oneline'], { encoding: 'utf8' }).stdout
  assert.equal(/banco limpio/.test(decoyLog), false, 'el banco commiteó en el repositorio del entorno')

  const dir = benchDir(bench, toolkit)
  const own = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' }).stdout
  assert.match(own, /banco limpio/, 'y el banco quedó sin su propio commit')
})

// Se prueba la función y no el comando porque **no se sabe cómo provocar el fallo**: es el caso 073, y
// bajo Node 26 —la única versión donde ocurrió— doce corridas de la suite entera no lo reprodujeron. La
// guarda que esto cubre estuvo dos meses sin prueba por eso mismo, y lo que costó fue caro: sólo se la
// pudo mirar cuando disparó en CI, ya tarde para corregir lo que no traía. Qué trae y por qué, en
// `benchSurvived`; acá se fija que efectivamente lo traiga.
test('la guarda del banco trae con qué diagnosticar, no una muestra', () => {
  const dir = tempRoot('cauce-sobrevivio-')
  const older = path.join(dir, 'viejo.txt')
  fs.mkdirSync(path.join(dir, 'hondo', 'mas'), { recursive: true })
  fs.writeFileSync(older, 'lo que el borrado no tocó')
  fs.writeFileSync(path.join(dir, 'hondo', 'mas', 'nuevo.txt'), 'lo que se escribió después')
  // El corte va entre los dos archivos: el primero queda con fecha anterior y el segundo, posterior.
  const since = fs.statSync(path.join(dir, 'hondo', 'mas', 'nuevo.txt')).mtimeMs
  fs.utimesSync(older, new Date(since - 10_000), new Date(since - 10_000))

  const said = CAT.benchSurvived(dir, since)
  assert.match(said, /Sobrevivieron 2 archivo\(s\) en 2 directorio\(s\)/, 'cuántos, no una muestra')
  assert.match(said, /viejo\.txt \(anterior al borrado\)/, 'lo que el borrado no tocó se ve como tal')
  assert.match(said, /nuevo\.txt \(escrito durante el borrado\)/, 'y lo que alguien reescribió, también')
  assert.match(said, new RegExp(process.version.replace(/\./g, '\\.')),
    'con la versión de Node, que es la única correlación que las dos fallas tienen')
  // El segundo borrado no rodea nada —quien la llama corta igual— y acá sí puede sacarlo, que es la
  // respuesta «era transitorio». Sin este dato, «quedó» y «quedó para siempre» se leen igual.
  assert.match(said, /un segundo borrado sí lo sacó/)
  assert.equal(fs.existsSync(dir), false, 'y efectivamente lo sacó')
})

// La aserción es de **ausencia**, que es como se prueba una quita: lo que se sacó es un proceso que ya no
// tiene que aparecer. Comprobar que el banco commitea no comprueba que dejó de lanzar nada — las dos
// cosas convivían, y ahí el verde decía que ocurrió la mitad.
//
// Se mide sobre un commit real hecho dentro del banco ya creado, con `GIT_TRACE=1`, porque el escritor no
// deja rastro en el árbol cuando no encuentra trabajo: lo único que se ve siempre es que git lo lanzó.
// Por qué importa que no lo lance, en `engine/cli/catalog.js`.
test('el banco no deja un mantenimiento de git escribiendo por detrás', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const bench = run(['evaluate', 'product-manager', '--bench', '14-sin-mantenimiento', '--force'], toolkit)
  assert.equal(bench.status, 0, bench.stderr)
  const dir = benchDir(bench, toolkit)

  fs.writeFileSync(path.join(dir, 'planning', 'INBOX.md'), '- algo que commitear\n')
  const git = (...args) => spawnSync('git', ['-C', dir, ...args],
    { encoding: 'utf8', env: { ...process.env, GIT_TRACE: '1' } })
  git('add', 'planning/INBOX.md')
  const commit = git('commit', '-q', '-m', 'una entrega del cargo')
  assert.equal(commit.status, 0, commit.stderr)
  assert.equal((commit.stderr.match(/run_command: git maintenance/g) || []).length, 0,
    `el commit del banco lanzó mantenimiento de fondo:\n${commit.stderr}`)
})

// El decisor, con rutas **fabricadas**: ninguna de estas cadenas existe en disco y ninguna se le pasa a
// algo que borre. Es lo que permite nombrar acá `/`, un home y la raíz de un repositorio sin ponerlos en
// riesgo — y es lo que la versión anterior de esta prueba no hacía, con el resultado que cuenta el 080.
test('el decisor de borrado rechaza todo lo que no cuelga de un banco desechable', () => {
  // Nombres inventados a propósito: nada de esto existe, y así la prueba puede hablar de una casa y de
  // la raíz de un repositorio sin escribir en el disco la ruta real de ninguna máquina.
  const roots = ['/desechable', '/scratch/banco', '/proyecto/.cauce-eval']
  for (const never of ['/', '/casa/alguien', '/casa/alguien/Code/suyo', '/proyecto', '/proyecto/engine']) {
    const refusal = undeletable(never, roots)
    assert.ok(refusal, `${never} tiene que rechazarse`)
    assert.ok(refusal.includes(never), 'y el rechazo dice qué ruta iba a borrar')
    assert.ok(refusal.includes('/desechable'), 'y contra qué la comparó')
  }
  // Las raíces desechables tampoco: se comparan como padres, con el separador puesto.
  assert.ok(undeletable('/desechable', roots), 'una raíz desechable no se borra a sí misma')
  assert.ok(undeletable('/desechableX/otro', roots), 'y un vecino con el mismo prefijo no se cuela')

  assert.equal(undeletable('/desechable/lo-mio/x', roots), null, 'lo desechable sí pasa')
  assert.equal(undeletable('/proyecto/.cauce-eval/product-manager/01', roots), null)
})

// Y el borrado, sobre lo único que se le pasa en toda la suite: un temporal que la prueba acaba de crear.
// Nada de acá depende del decisor para ser seguro.
test('el borrado de la suite se lleva lo desechable y devuelve el motivo cuando no', () => {
  const disposable = tempRoot('cauce-discard-')
  fs.writeFileSync(path.join(disposable, 'algo.txt'), 'x')
  discard(disposable)
  assert.equal(fs.existsSync(disposable), false)

  // El objetivo que se rechaza es una ruta **inventada** dentro del propio temporal, no una real: lo que
  // se mide es que el motivo llegue, y para eso no hace falta apuntarle a nada que importe.
  const outside = path.join(tempRoot('cauce-discard-fuera-'), '..', '..', 'no-deberia-borrarse')
  assert.throws(() => discard(path.resolve('/', 'no-existe', 'nada')), /borrado abortado/)
  assert.ok(undeletable(outside, [path.join(outside, 'sub')]), 'el mismo motivo, sin borrar nada')
})

// La ruta del banco, en sus dos direcciones. Nada de esto borra: `benchDir` sólo asercia, así que puede
// recibir la salida vacía que provocó el desastre sin poder repetirlo.
test('la ruta de un banco no sale de una salida vacía ni de fuera de .cauce-eval', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  assert.equal(path.resolve(toolkit, ''), toolkit, 'la salida vacía resuelve a la raíz: eso la vuelve peligrosa')
  assert.throws(() => benchDir({ stdout: '', stderr: 'el comando falló' }, toolkit), /el banco no se creó/)
  assert.throws(() => benchDir({ stdout: 'engine', stderr: '' }, toolkit), /no es un banco/)

  const good = run(['evaluate', 'product-manager', '--bench', '15-ruta', '--force'], toolkit)
  const dir = benchDir(good, toolkit)
  assert.ok(dir.includes(`${path.sep}.cauce-eval${path.sep}`), 'y un banco de verdad pasa')
  discard(dir)
})

// La guarda que corta cuando el banco sobrevivió a su propio borrado, por fin ejercida. Desde el 066
// existía sin una sola prueba, y comprobado: borrar su línea no ponía nada en rojo. No se puede provocar
// con el sistema de archivos real —ése es el caso 078—, así que se inyecta un borrado que no borra.
//
// Nada de acá le pasa a algo que destruya una ruta que importe: el objetivo es un temporal que la prueba
// acaba de crear, y el que se rechaza no existe (R23).
test('un banco que sobrevive a su borrado corta la corrida, y sólo se borra dentro del banco', () => {
  const scratch = tempRoot('cauce-clear-')
  const dir = path.join(scratch, 'product-manager', '01-caso')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'quedo.txt'), 'lo que el borrado no se llevó')

  // El borrado que no borra: es la única forma de ejercer la rama, y por eso la función lo recibe.
  const said = CAT.clearBench(dir, scratch, () => {})
  assert.match(said, /no se pudo borrar entero/, 'la guarda habla')
  assert.match(said, /quedo\.txt/, 'y nombra lo que sobrevivió')

  // Y el destino se comprueba antes de destruir: una ruta que no cuelga del banco se rechaza nombrando
  // las dos. El objetivo es inventado y el borrado inyectado no borra, así que ni mutando la comprobación
  // esta prueba puede llevarse nada.
  const outside = CAT.clearBench(path.join(scratch, '..', 'no-es-un-banco'), scratch, () => {})
  assert.match(outside, /no cuelga de/, 'se niega')
  assert.match(outside, /no-es-un-banco/, 'y dice qué ruta iba a borrar')
  assert.ok(outside.includes(path.resolve(scratch)), 'y contra qué la comparó')

  // Descendiente estricto, y las dos formas en que eso importa: el banco no se borra a sí mismo, y un
  // vecino que empieza igual no se cuela. Sin el separador las dos pasarían, y ninguna de las aserciones
  // de arriba lo notaría — se comprobó mutándolo.
  assert.match(CAT.clearBench(scratch, scratch, () => {}), /no cuelga de/, 'el banco no se borra a sí mismo')
  assert.match(CAT.clearBench(`${scratch}-vecino/algo`, scratch, () => {}), /no cuelga de/,
    'y un vecino con el mismo prefijo tampoco')

  // Con el borrado de verdad, sobre el temporal que esta prueba creó, no queda nada y no hay motivo.
  assert.equal(CAT.clearBench(dir, scratch), null)
  assert.equal(fs.existsSync(dir), false)
})

// Caso 509: en una instancia el banco es para lo propio. Un cargo forkeado se evalúa con los archivos de sus casos a
// mano, en una instancia desechable que lo resuelve a él —no al del catálogo— y que git no ve; uno del catálogo se
// sigue evaluando en el toolkit.
test('en una instancia, un cargo propio tiene banco con sus archivos, y uno del catálogo no', () => {
  const { installedProject, CLI } = require('../support/environment')
  const { target, runCli: atRoot, env } = installedProject('cauce-banco-instancia-')
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: target, encoding: 'utf8', env })
  spawnSync('git', ['init', '-q'], { cwd: target })
  const catalog = runCli(['evaluate', 'software-architect', '--bench', '07-approval-without-looking'])
  assert.equal(catalog.status, 2)
  assert.match(catalog.stderr, /del catálogo de Cauce.*agents fork software-architect/s)
  assert.equal(JSON.parse(runCli(['evaluate', 'software-architect', '--cases', '--json']).stdout).owned, false)

  assert.equal(atRoot(['agents', 'fork', 'software-architect', target]).status, 0)
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Organización\n\nUna empresa que vende ruteo.\n')
  fs.writeFileSync(path.join(target, 'planning', 'rules', 'propias.md'), '# Reglas propias\n')
  // Un enlace relativo de la empresa viaja como enlace relativo: absoluto, lo que el banco escribiera ahí caería en la
  // instancia viva.
  fs.symlinkSync(path.join('..', 'software-architect', 'SKILL.md'),
    path.join(target, 'agents', 'roles', 'software-architect', 'references', 'enlace.md'))
  // Uno absoluto apuntaría a la instancia viva desde el banco: no viaja.
  fs.symlinkSync(path.join(target, 'organization', 'workspace.md'), path.join(target, 'organization', 'vivo.md'))
  assert.equal(JSON.parse(runCli(['evaluate', 'software-architect', '--cases', '--json']).stdout).owned, true)
  const made = runCli(['evaluate', 'software-architect', '--bench', '07-approval-without-looking'])
  assert.equal(made.status, 0, made.stderr)
  const dir = path.resolve(target, made.stdout.trim())
  assert.ok(fs.existsSync(path.join(dir, 'pr-318.diff')), 'el archivo del caso está donde el prompt lo nombra')
  const roles = JSON.parse(runCli(['agents', 'list', dir, '--json']).stdout)
  const role = roles.find((one) => one.slug === 'software-architect')
  assert.equal(role.system, false, 'el banco resuelve el cargo propio, no el del catálogo')
  assert.equal(fs.existsSync(path.join(dir, role.path, 'evaluations')), false, 'sin los casos ni lo esperado')
  assert.equal(runCli(['check', path.join(dir, 'planning')]).status, 0, 'el banco es una instancia válida')
  // Y es una copia de la empresa, no del molde: su contexto y sus reglas viajan al banco.
  assert.match(fs.readFileSync(path.join(dir, 'organization', 'company.md'), 'utf8'), /Una empresa que vende ruteo/)
  assert.ok(fs.existsSync(path.join(dir, 'planning', 'rules', 'propias.md')), 'sus reglas también')
  assert.equal(fs.readlinkSync(path.join(dir, role.path, 'references', 'enlace.md')),
    path.join('..', 'software-architect', 'SKILL.md'), 'el enlace sigue relativo, dentro del banco')
  assert.equal(fs.existsSync(path.join(dir, 'organization', 'vivo.md')), false, 'el absoluto no viaja')
  const status = spawnSync('git', ['-C', target, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }).stdout
  assert.doesNotMatch(status, /\.cauce-eval/, 'git no ve el banco')
})

// La otra mitad del 509: un recorrido propio también tiene banco en la instancia, y el banco lo resuelve a él.
test('en una instancia, un recorrido propio tiene banco, y uno del catálogo no', () => {
  const { installedProject, CLI } = require('../support/environment')
  const { target, env } = installedProject('cauce-banco-recorrido-')
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: target, encoding: 'utf8', env })
  const [caseName] = JSON.parse(runCli(['evaluate', 'intake', '--flow', '--cases', '--json']).stdout).cases
  const catalog = runCli(['evaluate', 'intake', '--flow', '--bench', caseName.id])
  assert.equal(catalog.status, 2)
  assert.match(catalog.stderr, /copiá su carpeta a flows\/intake\//)

  fs.cpSync(path.join(TOOLKIT, 'flows', 'system', 'intake'), path.join(target, 'flows', 'intake'), { recursive: true })
  fs.appendFileSync(path.join(target, 'flows', 'intake', 'README.md'), '\nNuestra versión.\n')
  const made = runCli(['evaluate', 'intake', '--flow', '--bench', caseName.id])
  assert.equal(made.status, 0, made.stderr)
  const dir = path.resolve(target, made.stdout.trim())
  assert.match(fs.readFileSync(path.join(dir, 'flows', 'intake', 'README.md'), 'utf8'), /Nuestra versión/)
  assert.equal(runCli(['flow', 'show', 'intake']).status, 0)
})
