'use strict'

// El banco de evaluación: la instancia desechable donde se mide un cargo. Es un subsistema con
// vocabulario propio —se crea, se recrea entera, se versiona, se niega a pisar trabajo sin recoger— y
// estaba dentro de la suite del CLI, que prueba otra cosa.

const { MIN_ROLES, tempRoot, run, linkEngine } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Que el banco sea una instancia de verdad y no un directorio: `check` pasa adentro, el catálogo
// resuelve y `planning/` está escribible. Para qué hace falta, en `evaluationBench`.
test('el banco de evaluación es una instancia de verdad, no un directorio vacío', () => {
  const toolkit = path.resolve(__dirname, '..', '..')
  const bench = run(['evaluate', 'product-manager', '--bench', '06-instancia', '--force'], toolkit)
  assert.equal(bench.status, 0, bench.stderr)
  // La salida es relativa a la raíz que se le pasó, no al cwd de la suite: resolverla contra `toolkit`
  // es lo que deja estas pruebas independientes de desde dónde se corran.
  const dir = path.resolve(toolkit, bench.stdout.trim())
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
  const dir = path.resolve(toolkit,
    run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit).stdout.trim())
  const rastro = path.join(dir, 'planning', 'rastro-de-la-corrida-anterior.md')
  fs.writeFileSync(rastro, 'lo que escribió el cargo la vez pasada\n')
  run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit)
  assert.equal(fs.existsSync(rastro), false, 'la corrida anterior no contamina la siguiente')
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
  const printed = bench.stdout.trim()
  assert.ok(printed, 'el banco tiene que haberse creado')
  const dir = path.resolve(toolkit, printed)
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
  const dir = path.resolve(toolkit,
    run(['evaluate', 'product-manager', '--bench', '09-proteccion', '--force'], toolkit).stdout.trim())
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
  const one = path.resolve(toolkit, primero.stdout.trim())
  const other = path.resolve(toolkit, segundo.stdout.trim())
  assert.notEqual(one, other, 'dos casos no comparten directorio')

  fs.appendFileSync(path.join(one, 'planning', 'INBOX.md'), '\n- lo que escribió el primer caso\n')
  const vecino = fs.readFileSync(path.join(other, 'planning', 'INBOX.md'), 'utf8')
  assert.equal(vecino.includes('el primer caso'), false, 'y no se leen entre sí')

  // Preparar el banco de un caso no puede borrar el del vecino, que quizá esté a mitad de corrida.
  assert.equal(run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit).status, 0)
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
