'use strict'

// La crítica del plan queda escrita: en `## Crítica` del WIP y en `critique:` de `done/` (caso 433). El arnés mide
// lo que se pide; que el agente lo escriba lo midió la corrida real que el caso cita.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, NO_TASK } = require('../support/autobuild-harness')

const prompt = ({ prompts }, key) => (prompts.find((one) => one.key === key) || {}).prompt || ''
const fact = (run) => (prompt(run, 'Done|done').match(/critique=([^;]*);/) || [])[1]

test('la crítica que aprobó sin objeciones queda con lo que miró, en el WIP y en done', async () => {
  const run = await runFlow({})
  ranToEnd(run.result)
  assert.match(prompt(run, 'WIP|wip'),
    /sección ## Crítica con esto, tal cual: "aprobado sin objeciones, sobre api\/alta\.go"/)
  assert.equal(fact(run), 'aprobado sin objeciones, sobre api/alta.go')
})

test('lo que cambió el plan y lo que quedó como condición o anotado llegan a done', async () => {
  let pass = 0
  const run = await runFlow({ [KEY.replan]: baseScript()[KEY.plan], [KEY.critique]: () => {
    pass += 1
    return pass === 1
      ? { verdict: 'con-condiciones', consulted: ['api/alta.go'], concerns: [
        { detail: 'comprobar también el texto exacto del error', blocking: true, replan: true },
        { detail: 'nombrar la prueba como el criterio; y el archivo también', blocking: true, replan: false }] }
      : { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [
        { detail: 'el mensaje podría ir en una constante', blocking: false, replan: false },
        { detail: 'el cero llega también como string', blocking: false, replan: false }] }
  } })
  ranToEnd(run.result)
  assert.equal(fact(run), 'cambió el plan por: comprobar también el texto exacto del error'
    // El «;» de la condición pasa a «,»: es el separador de los hechos del prompt, y la cortaría ahí.
    + ' · condiciones: nombrar la prueba como el criterio, y el archivo también'
    + ' · anotó: el mensaje podría ir en una constante | el cero llega también como string')
})

test('un carril sin crítica lo dice, y quien cierra en otra sesión la copia del WIP', async () => {
  const lite = await runFlow({}, { lane: 'lite' })
  ranToEnd(lite.result)
  assert.equal(fact(lite), 'n/a — el carril lite no corre Critique')
  assert.doesNotMatch(prompt(lite, 'WIP|wip'), /## Crítica/)

  const base = baseScript()[KEY.context]
  const inReview = { ...base, claimed: true, wipActive: true, wip: { phase: 'Review', complete: 1, pending: 0 } }
  const review = await runFlow({
    'Build (reanudado)|commit-found': { committed: true, hash: 'abc123', branch: 'task/T-1' },
    'Build (reanudado)|build-evidence': { completed: true, closedTask: false, summary: 'otra sesión',
      redFirst: [{ id: 'r1', test: 'TestAltaDuplicada', failure: 'want error, got nil' }], discovered: [] },
  }, { args: '--role review', contexts: [inReview, NO_TASK] })
  ranToEnd(review.result)
  // No la tiene en memoria: no va como hecho, y el pedido dice de dónde copiarla.
  assert.equal(fact(review), undefined)
  assert.match(prompt(review, 'Done|done'),
    /critique es la sección ## Crítica del WIP, copiada sin cambiarle nada; si el WIP no la tiene, n\/a — no quedó/)
})

// Lo que la crítica dice que cambió en el plan se comprueba sobre el diff, igual que sus condiciones (caso 436): una
// crítica que anuncia un cambio que el commit no tiene es la que se dice hecha sin hacerse.
test('Review comprueba sobre el diff lo que la crítica dice que cambió el plan', async () => {
  let pass = 0
  const run = await runFlow({ [KEY.replan]: baseScript()[KEY.plan], [KEY.critique]: () => {
    pass += 1
    return pass === 1
      ? { verdict: 'con-condiciones', consulted: ['api/alta.go'], concerns: [
        { detail: 'comprobar también el texto exacto del error', blocking: true, replan: true }] }
      : { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [] }
  } })
  ranToEnd(run.result)
  assert.match(prompt(run, KEY.review), new RegExp('La crítica cambió el plan por esto; comprobá sobre el diff que '
    + 'cada cambio está, y el que no, es un hallazgo: comprobar también el texto exacto del error\\.'))

  // Sin replan no hay nada que anunciar, y el pedido no aparece.
  const plain = await runFlow({})
  assert.doesNotMatch(prompt(plain, KEY.review), /La crítica cambió el plan/)

  // Quien revisa en otra sesión no la tiene en memoria: la busca en el WIP.
  const base = baseScript()[KEY.context]
  const inReview = { ...base, claimed: true, wipActive: true, wip: { phase: 'Review', complete: 1, pending: 0 } }
  const review = await runFlow({
    'Build (reanudado)|commit-found': { committed: true, hash: 'abc123', branch: 'task/T-1' },
    'Build (reanudado)|build-evidence': { completed: true, closedTask: false, summary: 'otra sesión',
      redFirst: [{ id: 'r1', test: 'TestAltaDuplicada', failure: 'want error, got nil' }], discovered: [] },
  }, { args: '--role review', contexts: [inReview, NO_TASK] })
  assert.match(prompt(review, KEY.review), /o su ## Crítica dice que el plan cambió por algo, comprobá sobre el diff/)
})
