'use strict'

// Lo que el recorrido exige antes de dar una tarea por cerrada: que el rojo previo se haya visto,
// que cada criterio citado tenga una prueba que lo asercie, que los gates hayan corrido algo y que
// el commit exista. Verde no es lo mismo que cubierto, y acá se mide la diferencia.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached, writesTo } = require('../support/autobuild-harness')

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

// Caso 306. Las dos formas que frenaron corridas reales con el caso probado: el `describe` en el medio de un
// lado y no del otro, y dos casos del mismo archivo juntos en un rojo. Y las que tienen que seguir frenando,
// que son el lado caro: un borde que entra sin prueba porque su nombre se parece al de un rojo.
test('un caso descubierto se reconoce por sus tramos, llegue como llegue la ruta', async () => {
  const withEdge = (test, reds) => runFlow({ [KEY.build]: { completed: true, summary: 'x',
    redFirst: reds.map((one) => ({ test: one, failure: 'want 403' })),
    discovered: [{ kind: 'edge', detail: 'borde', test }] } })
  const nested = await withEdge('src/a.service.spec.ts › segregación: sin decisión legible no aprueba → 403',
    ['src/a.service.spec.ts › AService.resolve › segregación: sin decisión legible no aprueba → 403'])
  ranToEnd(nested.result)
  const joined = await withEdge('src/b.controller.spec.ts › el 404 también sale con no-store',
    ["src/b.controller.spec.ts — 'consulta con el token del header' y 'el 404 también sale con no-store'"])
  ranToEnd(joined.result)

  const stops = [
    ['otro caso', 'src/a.spec.ts › otro caso que nadie vio en rojo', 'src/a.spec.ts › AService › un caso'],
    ['otro archivo', 'src/a.service.spec.ts › sale con no-store', "src/b.controller.spec.ts — 'sale con no-store'"],
    ['mismo nombre de archivo en otra carpeta', 'src/users/service.spec.ts › rechaza sin permiso',
      'src/orders/service.spec.ts › rechaza sin permiso'],
    ['un archivo cuyo nombre termina igual', 'src/a.service.spec.ts › sale con no-store',
      'src/data.service.spec.ts › sale con no-store'],
    ['un caso contenido en otro', 'a.spec.ts › rechaza el token', 'a.spec.ts › Auth › no rechaza el token de servicio'],
    ['el mismo caso en otro describe', 'a.spec.ts › Alta › rechaza duplicado', 'a.spec.ts › Baja › rechaza duplicado'],
    ['un rojo que no nombra el archivo', 'src/a.spec.ts › caso con nombre largo', 'OtroModulo › caso con nombre largo'],
    ['un nombre de dos letras', 'src/a.spec.ts › ok', 'src/a.spec.ts › AService › no deja el token en el log'],
  ]
  for (const [why, test, red] of stops) {
    assert.equal((await withEdge(test, [red])).result.reason, 'edge-unproven', why)
  }
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

  // La tercera forma es la que apareció corriendo, y por qué la contención sola no la cubre está junto a
  // la comparación, en el recorrido. Va acá porque las dos de arriba pasaban igual con el defecto puesto:
  // lo que esta fija es que el nombre anotado de dos maneras distintas no frene.
  const anotado = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x',
      redFirst: [{ test: "saldo.test.js — 'período vacío' (rojo por mutación)", failure: 'want EUR 70.00' }],
      discovered: [{
        kind: 'edge', detail: 'período vacío', test: "saldo.test.js — 'período vacío' (saldo.test.js:45)",
      }],
    },
  })
  ranToEnd(anotado.result)
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
  assert.equal(writesTo(bounce.wrote, 'Verify'), 1, 'y el rebote va a quien construye, en una sola vuelta')
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

// Caso 251. El repo de un servicio queda en su rama viva después de cada merge, y el commit caía ahí. Las
// dos mitades van juntas: que se pida cortar la rama, y que un commit que igual quedó en la viva no se dé
// por bueno — el prompt solo no prueba qué hizo quien lo recibió.
const commitPrompt = (prompts) => prompts.find((one) => one.key === KEY.commit).prompt
const live = { committed: true, hash: 'abc123', branch: 'main', live: true }
const allowed = { [KEY.contract]: { ...baseScript()[KEY.contract], commitToLiveBranch: true } }

test('Commit corta una rama para la tarea en vez de commitear en la rama viva', async () => {
  const { result, prompts } = await runFlow({
    [KEY.commit]: { committed: true, hash: 'abc123', branch: 'fix/T-1', live: false },
  })
  ranToEnd(result)
  assert.match(commitPrompt(prompts), /git switch -c <tipo>\/T-1/, 'la rama lleva el slug de la tarea')
  assert.match(commitPrompt(prompts), /no commitees ahí ni lo consultes/, 'y cortarla no espera a nadie')
  const done = prompts.find((one) => one.key === 'Done|done').prompt
  assert.match(done, /commit=abc123 \(\.\/api@fix\/T-1\)/, 'la entrada de DONE dice en qué repositorio y rama quedó')
})

test('un commit que quedó en la rama viva no cierra la tarea', async () => {
  const { result, asked } = await runFlow({ [KEY.commit]: live })
  assert.equal(result.reason, 'commit-failed')
  assert.match(result.detail, /abc123.*rama viva main/)
  assert.ok(!reached(asked, 'Done'), 'no se escribe DONE sobre un commit mal ubicado')
})

test('con runner.commitToLiveBranch el commit va a la rama viva, que es lo que el proyecto pidió', async () => {
  const { result, prompts } = await runFlow({ ...allowed, [KEY.commit]: live })
  ranToEnd(result)
  assert.doesNotMatch(commitPrompt(prompts), /git switch -c/, 'y no se le pide cortar nada')
})
