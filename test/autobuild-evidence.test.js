'use strict'

// Lo que el recorrido exige antes de dar una tarea por cerrada: que el rojo previo se haya visto,
// que cada criterio citado tenga una prueba que lo asercie, que los gates hayan corrido algo y que
// el commit exista. Verde no es lo mismo que cubierto, y acá se mide la diferencia.

const { run } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, ranToEnd, runFlow, reached, writesTo } = require('./autobuild-harness')

test('una aprobación que no declara qué inspeccionó frena en su etapa', async () => {
  const critique = await runFlow({
    [KEY.critique]: { verdict: 'aprobado', concerns: [], consulted: [] },
  })
  assert.equal(critique.result.reason, 'critique-unbacked')

  const review = await runFlow({
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: [] },
  })
  assert.equal(review.result.reason, 'review-unbacked')
})

test('un rojo declarado sin el fallo que lo muestra no cuenta como rojo', async () => {
  const { result } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '   ' }],
    },
  })
  assert.equal(result.reason, 'build-unproven')
  assert.match(result.detail, /TestAltaDuplicada/)
})

test('un caso descubierto entra con su prueba, y el nombre no tiene que coincidir letra por letra', async () => {
  const loose = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  assert.equal(loose.result.reason, 'edge-unproven')

  // El mismo caso, nombrado de las dos formas en que un modelo lo escribe: no debe frenar.
  const covered = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x',
      redFirst: [{ test: 'alta_test.go::TestAltaSinPais', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  ranToEnd(covered.result)
})

test('un criterio sin cubrir va a una persona o vuelve a quien construye, según su causa', async () => {
  const ambiguous = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el alta es rápida', cause: 'ambiguous' }],
    },
  })
  assert.equal(ambiguous.result.reason, 'acceptance-ambiguous')
  assert.ok(
    ambiguous.written.some((text) => text.includes('HUMAN_ACTIONS')),
    'una definición que falta se registra donde la lee una persona',
  )

  // Una prueba que falta la escribe el propio recorrido: rebota, Verify corre de nuevo y sigue.
  let turn = 0
  const bounce = await runFlow({
    [KEY.verify]: () => {
      turn += 1
      return {
        passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
        uncovered: turn === 1 ? [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }] : [],
      }
    },
  })
  ranToEnd(bounce.result)
  assert.equal(turn, 2, 'Verify tiene que volver a correr después del rebote')
  assert.equal(writesTo(bounce.asked, 'Verify'), 1, 'y el rebote va a quien construye, en una sola vuelta')
})

test('un criterio que sigue sin prueba después del rebote frena', async () => {
  const { result } = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }],
    },
  })
  assert.equal(result.reason, 'verify-hollow')
  assert.match(result.detail, /el duplicado se rechaza/)
})

// Verify corta por tres motivos distintos y el más simple —un gate que sale en rojo— era el único sin
// caso: los otros dos miran el verde, así que ninguno lo habría atrapado.
test('un gate en rojo frena aunque los criterios estén cubiertos', async () => {
  const { result, asked } = await runFlow({
    [KEY.verify]: {
      passed: false, details: 'go test ./... salió en 1', uncovered: [],
      commands: [{ cmd: 'go test ./...', exitCode: 1, ranTests: true }],
    },
  })
  assert.equal(result.reason, 'verify-failed')
  assert.match(result.detail, /salió en 1/)
  assert.ok(!reached(asked, 'QA'), 'y no se hace QA sobre un gate en rojo')
})

test('gates en verde que no corrieron ninguna prueba no cierran la tarea', async () => {
  const { result } = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'golangci-lint run', exitCode: 0 }, { cmd: 'go build ./...', exitCode: 0 }],
    },
  })
  assert.equal(result.reason, 'verify-untested')

  // Y el gate cuyo nombre el patrón no conoce pasa igual si quien lo corrió dice que corrió pruebas.
  const declared = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'mvn verify', exitCode: 0, ranTests: true }],
    },
  })
  ranToEnd(declared.result)
})

test('QA en rojo no cierra la tarea aunque los gates estén verdes', async () => {
  const { result, asked } = await runFlow({
    [KEY.qa]: { passed: false, evidence: 'el alta acepta el duplicado contra la API real' },
  })
  assert.equal(result.reason, 'qa-failed')
  assert.match(result.detail, /acepta el duplicado/)
  assert.ok(!reached(asked, 'Commit'), 'y no se commitea lo que no pasó QA')
})

// El commit es parte del artefacto y no un trámite: darlo por hecho cierra la tarea sobre un árbol que
// quedó como estaba.
test('un commit que no se hizo no se da por hecho', async () => {
  const { result } = await runFlow({
    [KEY.commit]: { committed: false, reason: 'quedaron archivos ajenos a la tarea sin stagear' },
  })
  assert.equal(result.reason, 'commit-failed')
  assert.match(result.detail, /sin stagear/)
})
