'use strict'

// Review recibe la lista de archivos que toca el diff y contesta en `opened` cuáles abrió; el motor resta y exige el
// resto (caso 485). Antes sólo frenaba un `consulted` vacío: un revisor que abría un archivo de diez y lo declaraba
// aprobaba igual.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runFlow, ranToEnd, baseScript, KEY } = require('../support/autobuild-harness')

const DIFF = { 'Review|review-diff': { files: ['api/alta.go'] } }
const approves = (...opened) => ({ verdict: 'aprobado', consulted: opened.length ? opened : ['README.md'], opened,
  concerns: [] })
const passes = (...answers) => {
  let turn = 0
  return () => answers[Math.min(turn++, answers.length - 1)]
}
const reviews = ({ asked }) => asked.filter((key) => key === 'Review|review').length
const reviewPrompts = ({ prompts }) => prompts.filter((one) => one.key === 'Review|review').map((one) => one.prompt)

// El caso tal cual: aprueba declarando sólo un archivo que el diff no toca.
test('una Review que no abrió un archivo del diff tiene una pasada más y, si sigue sin abrirlo, para', async () => {
  const run = await runFlow({ ...DIFF, [KEY.review]: passes(approves()) })
  assert.equal(run.result.reason, 'review-unbacked')
  assert.match(run.result.detail, /api\/alta\.go/)
  assert.equal(reviews(run), 2, 'no se le dio una pasada para abrir lo que faltaba')
  assert.ok(!run.asked.some((key) => key.startsWith('Verify|')), 'llegó a Verify sin haber mirado el diff')
})

test('Review recibe la lista exacta del diff, y la pasada de más sólo lo que faltó', async () => {
  const run = await runFlow({ 'Review|review-diff': { files: ['api/alta.go', 'api/alta_test.go'] },
    [KEY.review]: passes(approves('api/alta_test.go'), approves('api/alta.go')) })
  ranToEnd(run.result)
  const [first, second] = reviewPrompts(run)
  assert.match(first, /El diff toca estos archivos: api\/alta\.go, api\/alta_test\.go/)
  assert.match(second, /no declaraste haber abierto api\/alta\.go,/)
  assert.doesNotMatch(second, /abierto api\/alta\.go, api\/alta_test/, 'volvió a pedir lo que ya había abierto')
})

// `consulted` sigue siendo prosa libre: nombrar un archivo ahí no es decir que se abrió.
test('lo que cuenta es opened, no lo que consulted menciona', async () => {
  const run = await runFlow({ ...DIFF,
    [KEY.review]: passes({ verdict: 'aprobado', consulted: ['git diff', 'api/alta.go'], opened: [], concerns: [] }) })
  assert.equal(run.result.reason, 'review-unbacked')
  for (const one of [' ./api/alta.go ', '`api/alta.go`', 'api/alta.go:12', 'api/alta.go#L12-L20', '`api/alta.go`:12',
    'api/alta.go,']) {
    const written = await runFlow({ ...DIFF, [KEY.review]: passes(approves(one)) })
    ranToEnd(written.result)
  }
})

test('la pasada de más no borra un bloqueo ni lo que la primera encontró', async () => {
  const blocked = { ...approves(), verdict: 'bloqueado',
    concerns: [{ detail: 'el handler arma el SQL con el monto', blocking: true, verified: true }] }
  const run = await runFlow({ ...DIFF, [KEY.review]: passes(blocked, approves('api/alta.go')) })
  assert.equal(run.result.reason, 'review-blocked')
  assert.match(run.result.detail, /arma el SQL/)

  const decision = { detail: 'el formato del monto fija un contrato público', blocking: false, decision: true }
  const kept = await runFlow({ ...DIFF, [KEY.review]: passes({ ...approves(), concerns: [decision] },
    approves('api/alta.go')) })
  ranToEnd(kept.result)
  assert.ok(kept.written.some((text) => /contrato público/.test(text)), 'la decisión de la primera pasada se perdió')
})

test('lo que el proyecto declara en reviewExempt no se exige', async () => {
  const script = {
    [KEY.contract]: { ...baseScript()[KEY.contract], reviewExempt: ['**/*.lock', 'api/__snapshots__/'] },
    'Review|review-diff': { files: ['api/alta.go', 'api/go.sum.lock', 'api/__snapshots__/alta.snap'] },
    [KEY.review]: passes(approves('api/alta.go')),
  }
  const run = await runFlow(script)
  ranToEnd(run.result)
  assert.equal(reviews(run), 1)

  const without = await runFlow({ ...script, [KEY.contract]: baseScript()[KEY.contract] })
  assert.equal(without.result.reason, 'review-unbacked', 'sin declararlo, el lockfile se exige')
  assert.match(without.result.detail, /go\.sum\.lock/)
})

test('lo que ya estaba sin commitear antes de construir no se exige', async () => {
  const run = await runFlow({
    'Build|review-baseline': { files: ['previa/otra-tarea.go'] },
    'Review|review-diff': { files: ['api/alta.go', 'previa/otra-tarea.go'] },
    [KEY.review]: passes(approves('api/alta.go')),
  })
  ranToEnd(run.result)
  assert.equal(reviews(run), 1)
  const before = (run.prompts.find((one) => one.key === 'Build|review-baseline') || {}).prompt || ''
  assert.match(before, /antes de que T-1 empiece: puede no haber nada/)
})

test('al retomar desde el WIP no se saca la foto de antes', async () => {
  const wip = { ...baseScript()[KEY.context], claimed: true, wipActive: true, wip: { phase: 'Build', complete: 1,
    pending: 1 } }
  const run = await runFlow({ ...DIFF, [KEY.review]: passes(approves('api/alta.go')) }, { contexts: [wip] })
  assert.ok(!run.asked.some((key) => key.endsWith('|review-baseline')), 'sacó la foto con la tarea ya empezada')
})

test('el pedido del diff pide el lado nuevo de un renombre y deja afuera lo borrado', async () => {
  const run = await runFlow({ ...DIFF, [KEY.review]: passes(approves('api/alta.go')) })
  const diff = (run.prompts.find((one) => one.key === 'Review|review-diff') || {})
  assert.equal(diff.agentType, 'cauce-clerk')
  assert.match(diff.prompt, /git status --porcelain/)
  assert.match(diff.prompt, /de un renombre, sólo la ruta nueva; un archivo borrado no va/)
})

test('con --role review el diff sale de los commits de quien construyó, sin foto del árbol', async () => {
  const wip = { ...baseScript()[KEY.context], claimed: true, wipActive: true, wip: { phase: 'Review', complete: 1,
    pending: 0 } }
  const run = await runFlow({ ...DIFF,
    'Build (reanudado)|commit-found': { committed: true, hash: 'abc123', branch: 'task/T-1' },
    'Build (reanudado)|build-evidence': { completed: true, closedTask: false, summary: 'construida en otra sesión',
      redFirst: [{ id: 'r1', test: 'TestAlta', failure: 'want error, got nil' }], discovered: [] },
    [KEY.review]: passes(approves('api/alta.go')),
  }, { args: '--role review', contexts: [wip] })
  const diff = (run.prompts.find((one) => one.key.endsWith('|review-diff')) || {}).prompt || ''
  assert.match(diff, /git show --name-status --format= <hash>" para cada uno de abc123/)
  assert.ok(!run.asked.some((key) => key.endsWith('|review-baseline')), 'sacó una foto del árbol en el rol review')
})
