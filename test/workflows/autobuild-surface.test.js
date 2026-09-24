'use strict'

// Los criterios que Verify no puede comprobar con una prueba y que igual tienen que poder cerrarse: el
// que no tiene superficie ejecutable —un ADR, una política— (caso 189) y el que se declaró fuera de
// Verify porque nombra lo que existe después (caso 195). Los dos viajan a Done como hecho en vez de
// rebotar a escribir una prueba imposible.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached } = require('../support/autobuild-harness')

const promptOf = (out, key) => (out.prompts.find((one) => one.key === key) || {}).prompt || ''
const withAcceptance = (acceptance) => ({ ...baseScript()[KEY.context], acceptance })
const verdict = (uncovered, extra = {}) => ({
  passed: true, details: 'make test 0', commands: [{ cmd: 'make test', exitCode: 0, ranTests: true }],
  uncovered, ...extra,
})

test('una tarea de sólo documento cierra con tests: n/a en vez de parar en verify-hollow', async () => {
  const crits = ['queda escrito en api/docs/ el destino de cada tabla', 'la decisión nombra la estructura canónica']
  const ctx = withAcceptance(crits.join('; '))
  let turn = 0
  const out = await runFlow({
    [KEY.context]: ctx,
    [KEY.plan]: { approach: 'ADR', steps: ['1'], files: ['api/docs/adr/003.md'], testStrategy: 'n/a' },
    [KEY.build]: { completed: true, summary: 'ADR escrito', redFirst: [], discovered: [], closedTask: false },
    [KEY.verify]: () => {
      turn += 1
      return verdict(crits.map((criterion) => ({ criterion, cause: 'no-surface', reason: 'es un ADR' })))
    },
  }, { contexts: [ctx] })
  ranToEnd(out.result)
  assert.equal(turn, 1, 'sin missing-test no hay segunda pasada')
  assert.ok(!out.asked.includes('Verify|missing-tests'), 'ni un agente escribiendo pruebas imposibles')

  const done = promptOf(out, 'Done|done')
  assert.match(done, /sin-superficie=/)
  for (const criterion of crits) assert.ok(done.includes(criterion), `Done recibe «${criterion}»`)
  assert.match(done, /tests: n\/a — /, 'y la forma que el contrato define')

  // QA no se saltea: comprueba el documento contra lo que la aceptación enumera.
  assert.ok(reached(out.asked, 'QA'))
  assert.match(promptOf(out, 'QA|qa'), /el documento existe y cubre/)
})

test('con causas mezcladas, el rebote pide sólo las pruebas que faltan', async () => {
  const code = 'el duplicado se rechaza'
  const doc = 'el manual explica el rechazo'
  const ctx = withAcceptance(`${code}; ${doc}`)
  let turn = 0
  const out = await runFlow({
    [KEY.context]: ctx,
    [KEY.verify]: () => {
      turn += 1
      return verdict([
        ...(turn === 1 ? [{ criterion: code, cause: 'missing-test' }] : []),
        { criterion: doc, cause: 'no-surface', reason: 'el manual no se ejecuta' },
      ], { covered: turn === 1 ? [] : [{ criterion: code, test: 'TestDuplicado' }] })
    },
  }, { contexts: [ctx] })
  ranToEnd(out.result)
  assert.equal(turn, 2)
  const bounce = promptOf(out, 'Verify|missing-tests')
  assert.ok(bounce.includes(code), 'el que falta')
  assert.ok(!bounce.includes(doc), 'y no el que no tiene superficie')
  // QA con superficie sigue ejercitando el comportamiento: el pedido cambia sólo si no queda ninguno.
  assert.doesNotMatch(promptOf(out, 'QA|qa'), /el documento existe y cubre/)

  const hollow = await runFlow({
    [KEY.context]: ctx,
    [KEY.verify]: verdict([
      { criterion: code, cause: 'missing-test' },
      { criterion: doc, cause: 'no-surface', reason: 'el manual no se ejecuta' },
    ]),
  }, { contexts: [ctx] })
  assert.equal(hollow.result.reason, 'verify-hollow')
  assert.ok(!hollow.result.detail.includes(doc), 'la parada nombra sólo lo que de verdad falta')
})

test('una condición marcada fuera de verify no llega a Verify ni a QA, y viaja a Done', async () => {
  const marked = 'el commit lleva el footer Task: T-1 (fuera de verify: lo registra Commit, después de Verify)'
  const ctx = withAcceptance(`el alta rechaza un duplicado; ${marked}`)
  const out = await runFlow({ [KEY.context]: ctx }, { contexts: [ctx] })
  ranToEnd(out.result)
  const verify = promptOf(out, 'Verify|verify')
  assert.ok(verify.includes('el alta rechaza un duplicado'), 'la otra condición sí llega')
  assert.ok(!verify.includes('footer Task'), 'la marcada no')
  assert.ok(!promptOf(out, 'QA|qa').includes('footer Task'), 'ni a QA')
  assert.ok(promptOf(out, 'Done|done').includes(`fuera-de-verify=${JSON.stringify([marked])}`))
})

// Done escribía `tests: CN → prueba` sin que nadie le pasara qué prueba cubría qué: el mapeo lo tenía
// Verify, que lo contrastó leyendo el fuente, y no viajaba (hallazgo del 189).
test('Done recibe el mapeo criterio → prueba que Verify contrastó', async () => {
  const covered = [{ criterion: 'el alta rechaza un duplicado', test: 'TestAltaDuplicada' }]
  const out = await runFlow({ [KEY.verify]: verdict([], { covered }) })
  ranToEnd(out.result)
  assert.ok(promptOf(out, 'Done|done').includes(`cubiertos=${JSON.stringify(covered)}`))
})
