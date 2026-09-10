'use strict'

// El banco de evaluación: la instancia desechable donde se mide un cargo. Es un subsistema con
// vocabulario propio —se crea, se recrea entera, se versiona, se niega a pisar trabajo sin recoger— y
// estaba dentro de la suite del CLI, que prueba otra cosa.

const { MIN_ROLES, tempRoot, run, linkEngine, discard, undeletable } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const CAT = require('../../engine/cli/catalog')

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
  const rastro = path.join(dir, 'planning', 'rastro-de-la-corrida-anterior.md')
  fs.writeFileSync(rastro, 'lo que escribió el cargo la vez pasada\n')
  // El resultado de la segunda corrida se mira. Descartarlo era lo que volvía mudo este caso: **toda**
  // falla del comando —`EACCES`, `ENOTEMPTY`, `EEXIST`— terminaba en el mismo `true !== false` sobre el
  // rastro, con el stderr tirado. Tres investigaciones dejaron escrito «no está establecido por qué» y
  // ésta es la razón: el instrumento borraba la evidencia justo cuando importaba (caso 066).
  const rehecho = run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit)
  assert.equal(rehecho.status, 0, `rehacer el banco falló: ${rehecho.stderr}`)
  assert.equal(fs.existsSync(rastro), false, 'la corrida anterior no contamina la siguiente')
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
    const negado = run(['evaluate', 'product-manager', '--bench', '13-sin-permiso', '--force'], toolkit)
    assert.notEqual(negado.status, 0, 'no sigue como si el banco fuera nuevo')
    assert.match(negado.stderr, /13-sin-permiso/, 'y nombra la ruta, que es lo que permite diagnosticar')
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

  const negado = run(['evaluate', 'product-manager', '--bench', '09-proteccion'], toolkit)
  assert.equal(negado.status, 2)
  assert.match(negado.stderr, /trabajo sin recoger/)
  assert.match(fs.readFileSync(path.join(dir, 'planning', 'INBOX.md'), 'utf8'), /lo que produjo el cargo/)

  // Con el registro ya guardado, rehacerlo es intencional y se permite.
  const forzado = run(['evaluate', 'product-manager', '--bench', '09-proteccion', '--force'], toolkit)
  assert.equal(forzado.status, 0, forzado.stderr)
  assert.equal(fs.readFileSync(path.join(dir, 'planning', 'INBOX.md'), 'utf8').includes('produjo'), false)
})

// Dos casos del mismo cargo, que es lo único que distingue un banco por caso de uno por cargo. Con un
// banco compartido ninguno cambió de veredicto: lo que cambió fue la respuesta, que ya no era la que
// el caso pedía medir — uno evaluó cuatro candidatas que en su enunciado no existían.
test('cada caso recibe su propio banco', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const primero = run(['evaluate', 'product-manager', '--bench', '10-uno', '--force'], toolkit)
  const segundo = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
  assert.equal(primero.status, 0, primero.stderr)
  assert.equal(segundo.status, 0, segundo.stderr)
  const one = benchDir(primero, toolkit)
  const other = benchDir(segundo, toolkit)
  assert.notEqual(one, other, 'dos casos no comparten directorio')

  fs.appendFileSync(path.join(one, 'planning', 'INBOX.md'), '\n- lo que escribió el primer caso\n')
  const vecino = fs.readFileSync(path.join(other, 'planning', 'INBOX.md'), 'utf8')
  assert.equal(vecino.includes('el primer caso'), false, 'y no se leen entre sí')

  // Preparar el banco de un caso no puede borrar el del vecino, que quizá esté a mitad de corrida.
  // El `stderr` va en la aserción como en las dos de arriba: sin él, un rojo en CI dice `1 !== 0` y
  // nada más, y distinguir una intermitencia de una regresión cuesta descartar hipótesis a mano.
  const rehecho = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
  assert.equal(rehecho.status, 0, rehecho.stderr)
  assert.match(fs.readFileSync(path.join(one, 'planning', 'INBOX.md'), 'utf8'), /el primer caso/)

  // El nombre entra en una ruta: no puede escaparse del directorio de bancos.
  const escape = run(['evaluate', 'product-manager', '--bench', '../../etc'], toolkit)
  assert.equal(escape.status, 2)
  assert.match(escape.stderr, /nombre inválido para el banco/)
})

// Los dos modos en la misma prueba: separados, un `--bench` que devolviera siempre lo mismo pasaría
// la mitad que se mirara. Por qué en una empresa no hay banco, en `evaluationBench`.
test('el banco es del toolkit; una instancia recibe la salida que le corresponde', () => {
  const base = tempRoot('cauce-bench-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  const result = run(['evaluate', 'product-manager', '--bench'], target)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /--bench es del toolkit/)
  assert.match(result.stderr, /evaluate product-manager/, 'y nombra la salida real')
})

// El banco es del toolkit y en una instancia se niega, que es correcto. Lo que no era correcto es qué
// recomendaba: adoptar el cargo. El guard mira el modo de la instancia y nada más, así que quien
// seguía el consejo forkeaba, repetía el comando y recibía el mismo mensaje diciéndole que forkeara.
//
// La asimetría que lo delató: `learn` sí cambia de comportamiento con el fork —falla antes, escribe el
// informe después— y por eso su mensaje puede hablar de adoptar. Éste no.
test('el error de --bench dice qué hacer, no un fork que no cambia nada', () => {
  const base = tempRoot('cauce-bench-consejo-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)

  const negado = run(['evaluate', 'backend-engineer', '--bench'], target)
  assert.equal(negado.status, 2)
  const dicho = negado.stderr + negado.stdout
  assert.match(dicho, /--bench es del toolkit/)
  assert.doesNotMatch(dicho, /agents fork/, 'adoptarlo no habilita el banco: el guard mira el modo')
  assert.match(dicho, /evaluate backend-engineer/, 'y dice el comando que sí corresponde acá')

  // Y adoptarlo no cambia la respuesta, que es justamente lo que el consejo viejo prometía.
  assert.equal(run(['agents', 'fork', 'backend-engineer'], target).status, 0)
  const trasFork = run(['evaluate', 'backend-engineer', '--bench'], target)
  assert.equal(trasFork.status, 2)
  assert.doesNotMatch(trasFork.stderr + trasFork.stdout, /agents fork/)
})

// Se mide por el efecto: con la variable puesta a propósito, ni el señuelo gana el commit del banco ni
// el banco se queda sin el suyo. Por qué `-C` no alcanza lo dice `engine/cli/catalog.js`.
test('el banco commitea en el banco aunque el entorno traiga GIT_DIR', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const señuelo = tempRoot('cauce-senuelo-')
  spawnSync('git', ['-C', señuelo, 'init', '-q'], { encoding: 'utf8' })

  const antes = process.env.GIT_DIR
  process.env.GIT_DIR = path.join(señuelo, '.git')
  let bench
  try {
    bench = run(['evaluate', 'product-manager', '--bench', '09-git-dir', '--force'], toolkit)
  } finally {
    if (antes === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = antes
  }
  assert.equal(bench.status, 0, bench.stderr)

  const señueloLog = spawnSync('git', ['-C', señuelo, 'log', '--oneline'], { encoding: 'utf8' }).stdout
  assert.equal(/banco limpio/.test(señueloLog), false, 'el banco commiteó en el repositorio del entorno')

  const dir = benchDir(bench, toolkit)
  const propio = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' }).stdout
  assert.match(propio, /banco limpio/, 'y el banco quedó sin su propio commit')
})

// Se prueba la función y no el comando porque **no se sabe cómo provocar el fallo**: es el caso 073, y
// bajo Node 26 —la única versión donde ocurrió— doce corridas de la suite entera no lo reprodujeron. La
// guarda que esto cubre estuvo dos meses sin prueba por eso mismo, y lo que costó fue caro: sólo se la
// pudo mirar cuando disparó en CI, ya tarde para corregir lo que no traía. Qué trae y por qué, en
// `benchSurvived`; acá se fija que efectivamente lo traiga.
test('la guarda del banco trae con qué diagnosticar, no una muestra', () => {
  const dir = tempRoot('cauce-sobrevivio-')
  const antiguo = path.join(dir, 'viejo.txt')
  fs.mkdirSync(path.join(dir, 'hondo', 'mas'), { recursive: true })
  fs.writeFileSync(antiguo, 'lo que el borrado no tocó')
  fs.writeFileSync(path.join(dir, 'hondo', 'mas', 'nuevo.txt'), 'lo que se escribió después')
  // El corte va entre los dos archivos: el primero queda con fecha anterior y el segundo, posterior.
  const since = fs.statSync(path.join(dir, 'hondo', 'mas', 'nuevo.txt')).mtimeMs
  fs.utimesSync(antiguo, new Date(since - 10_000), new Date(since - 10_000))

  const dicho = CAT.benchSurvived(dir, since)
  assert.match(dicho, /Sobrevivieron 2 archivo\(s\) en 2 directorio\(s\)/, 'cuántos, no una muestra')
  assert.match(dicho, /viejo\.txt \(anterior al borrado\)/, 'lo que el borrado no tocó se ve como tal')
  assert.match(dicho, /nuevo\.txt \(escrito durante el borrado\)/, 'y lo que alguien reescribió, también')
  assert.match(dicho, new RegExp(process.version.replace(/\./g, '\\.')),
    'con la versión de Node, que es la única correlación que las dos fallas tienen')
  // El segundo borrado no rodea nada —quien la llama corta igual— y acá sí puede sacarlo, que es la
  // respuesta «era transitorio». Sin este dato, «quedó» y «quedó para siempre» se leen igual.
  assert.match(dicho, /un segundo borrado sí lo sacó/)
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
  for (const jamas of ['/', '/casa/alguien', '/casa/alguien/Code/suyo', '/proyecto', '/proyecto/engine']) {
    const negativa = undeletable(jamas, roots)
    assert.ok(negativa, `${jamas} tiene que rechazarse`)
    assert.ok(negativa.includes(jamas), 'y el rechazo dice qué ruta iba a borrar')
    assert.ok(negativa.includes('/desechable'), 'y contra qué la comparó')
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
  const desechable = tempRoot('cauce-discard-')
  fs.writeFileSync(path.join(desechable, 'algo.txt'), 'x')
  discard(desechable)
  assert.equal(fs.existsSync(desechable), false)

  // El objetivo que se rechaza es una ruta **inventada** dentro del propio temporal, no una real: lo que
  // se mide es que el motivo llegue, y para eso no hace falta apuntarle a nada que importe.
  const fuera = path.join(tempRoot('cauce-discard-fuera-'), '..', '..', 'no-deberia-borrarse')
  assert.throws(() => discard(path.resolve('/', 'no-existe', 'nada')), /borrado abortado/)
  assert.ok(undeletable(fuera, [path.join(fuera, 'sub')]), 'el mismo motivo, sin borrar nada')
})

// La ruta del banco, en sus dos direcciones. Nada de esto borra: `benchDir` sólo asercia, así que puede
// recibir la salida vacía que provocó el desastre sin poder repetirlo.
test('la ruta de un banco no sale de una salida vacía ni de fuera de .cauce-eval', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  assert.equal(path.resolve(toolkit, ''), toolkit, 'la salida vacía resuelve a la raíz: eso la vuelve peligrosa')
  assert.throws(() => benchDir({ stdout: '', stderr: 'el comando falló' }, toolkit), /el banco no se creó/)
  assert.throws(() => benchDir({ stdout: 'engine', stderr: '' }, toolkit), /no es un banco/)

  const bueno = run(['evaluate', 'product-manager', '--bench', '15-ruta', '--force'], toolkit)
  const dir = benchDir(bueno, toolkit)
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
  const dicho = CAT.clearBench(dir, scratch, () => {})
  assert.match(dicho, /no se pudo borrar entero/, 'la guarda habla')
  assert.match(dicho, /quedo\.txt/, 'y nombra lo que sobrevivió')

  // Y el destino se comprueba antes de destruir: una ruta que no cuelga del banco se rechaza nombrando
  // las dos. El objetivo es inventado y el borrado inyectado no borra, así que ni mutando la comprobación
  // esta prueba puede llevarse nada.
  const afuera = CAT.clearBench(path.join(scratch, '..', 'no-es-un-banco'), scratch, () => {})
  assert.match(afuera, /no cuelga de/, 'se niega')
  assert.match(afuera, /no-es-un-banco/, 'y dice qué ruta iba a borrar')
  assert.ok(afuera.includes(path.resolve(scratch)), 'y contra qué la comparó')

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
