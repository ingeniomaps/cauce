'use strict'

// La re-revisión comprueba lo que mandó a corregir (caso 484). Antes revisaba el diff de nuevo sin saber qué se
// había pedido, y `done/` registraba como `corregido:` todo lo mandado, se hubiera corregido o no: de ahí cuenta
// `ops lessons`. Las vueltas y su tope siguen en `autobuild-review-rounds.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runFlow, ranToEnd, KEY } = require('../support/autobuild-harness')

const B1 = { detail: 'el handler no valida el monto', blocking: true, verified: true, decision: false }
const reviewed = (verdict, concerns, previous) => ({
  verdict, consulted: ['api/alta.go'], concerns, ...(previous ? { previous } : {}),
})
const confirmed = (id) => ({ id, fixed: true, evidence: 'api/alta.go:12 valida el monto antes de guardar' })
const reviewsOf = ({ prompts }) => prompts.filter((one) => one.key === 'Review|review').map((one) => one.prompt)
const doneOf = ({ prompts }) => (prompts.find((one) => one.key === 'Done|done') || {}).prompt || ''

const script = (...answers) => {
  let turn = 0
  return { [KEY.review]: () => answers[Math.min(turn++, answers.length - 1)] }
}

test('la re-revisión recibe cada bloqueante que se mandó a corregir, con su id', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], [confirmed('r1-B1')])))
  ranToEnd(run.result)
  const [, again] = reviewsOf(run)
  assert.match(again, /r1-B1: el handler no valida el monto/)
  assert.match((run.prompts.find((one) => one.key === 'Review|review-fix') || {}).prompt, /r1-B1: el handler/)
})

test('lo que la re-revisión confirma corregido llega a done/', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], [confirmed('r1-B1')])))
  ranToEnd(run.result)
  assert.match(doneOf(run), /corregido: el handler no valida el monto/)
})

// El caso tal cual: la re-revisión aprueba sin decir nada del bloqueante. Antes `done/` afirmaba la corrección.
test('un bloqueante que la re-revisión no confirma no se registra como corregido', async () => {
  for (const previous of [[], [{ id: 'r1-B1', fixed: false, evidence: 'sigue sin validar' }],
    [{ id: 'r1-B1', fixed: true, evidence: '' }]]) {
    const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], previous)))
    assert.doesNotMatch(doneOf(run), /corregido:/, `con ${JSON.stringify(previous)} afirmó una corrección`)
  }
})

test('lo no confirmado vuelve a corregirse y al tope frena nombrándolo', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], [])))
  assert.equal(run.result.reason, 'review-failed')
  assert.match(run.result.detail, /r1-B1.*el handler no valida el monto/)
  assert.equal(run.asked.filter((key) => key === 'Review|review-fix').length, 2, 'se pidió corregirlo otra vez')
})

test('una segunda confirmación tardía alcanza', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], []),
    reviewed('aprobado', [], [confirmed('r1-B1')])))
  ranToEnd(run.result)
  assert.match(doneOf(run), /corregido: el handler no valida el monto/)
})

test('lo confirmado en vueltas distintas se registra una vez cada uno', async () => {
  const B2 = { ...B1, detail: 'falta el caso vacío' }
  const run = await runFlow(script(reviewed('con-condiciones', [B1, B2]),
    reviewed('aprobado', [], [confirmed('r1-B1')]), reviewed('aprobado', [], [confirmed('r1-B2')])))
  ranToEnd(run.result)
  const [, listed] = doneOf(run).match(/corregido: ([^;·]*)/) || []
  assert.deepEqual(String(listed).split(' | ').map((one) => one.trim()).sort(),
    ['el handler no valida el monto', 'falta el caso vacío'])
})

// Con dos vueltas el mismo id no puede nombrar dos hallazgos distintos.
test('los bloqueantes nuevos de la segunda vuelta llevan id de esa vuelta', async () => {
  const B2 = { detail: 'un comentario sigue con la forma vieja', blocking: true, verified: true, fixable: true }
  const run = await runFlow(script(reviewed('con-condiciones', [B1]),
    reviewed('con-condiciones', [B2], [confirmed('r1-B1')]),
    reviewed('aprobado', [], [confirmed('r2-B1')])))
  ranToEnd(run.result)
  const [, , third] = reviewsOf(run)
  assert.match(third, /r2-B1: un comentario sigue con la forma vieja/)
  assert.doesNotMatch(third, /r1-B1/, 'lo ya confirmado no se vuelve a preguntar')
  assert.match(doneOf(run), /corregido: el handler no valida el monto[^;]*\| un comentario sigue/)
})

test('el id se reconoce aunque el revisor lo escriba con otra mayúscula', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]),
    reviewed('aprobado', [], [{ ...confirmed('r1-B1'), id: ' R1-B1 ' }])))
  ranToEnd(run.result)
  assert.match(doneOf(run), /corregido: el handler no valida el monto/)
})

// Lo que no se confirma vuelve con su id, así que repetirlo en concerns lo mandaría a corregir dos veces.
test('la re-revisión pide no repetir en concerns lo que sigue de la lista', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]), reviewed('aprobado', [], [confirmed('r1-B1')])))
  assert.match(reviewsOf(run)[1], /no lo repitas en concerns/)
})

// Antes `noted` leía sólo la última pasada: lo anotado o sospechado en una que después se re-revisaba se perdía.
test('lo anotado en una pasada que se re-revisa llega igual al INBOX', async () => {
  const note = { detail: 'el nombre del handler podría ser más claro', blocking: false }
  const doubt = { detail: 'el total podría desbordar', blocking: true, verified: false }
  const run = await runFlow(script(reviewed('con-condiciones', [B1, note]),
    reviewed('aprobado', [doubt], [confirmed('r1-B1')])))
  ranToEnd(run.result)
  const inbox = (run.prompts.find((one) => one.key === 'Review|review-noted') || {}).prompt || ''
  assert.match(inbox, /podría ser más claro/, 'lo anotado en la primera pasada se perdió')
  assert.match(inbox, /\[sin verificar\] el total podría desbordar/, 'la sospecha de la re-revisión se perdió')

  // Y la sospecha de una re-revisión intermedia, que la tercera pasada ya no repite.
  const B2 = { detail: 'un comentario sigue con la forma vieja', blocking: true, verified: true, fixable: true }
  const three = await runFlow(script(reviewed('con-condiciones', [B1]),
    reviewed('con-condiciones', [B2, doubt], [confirmed('r1-B1')]), reviewed('aprobado', [], [confirmed('r2-B1')])))
  ranToEnd(three.result)
  assert.match((three.prompts.find((one) => one.key === 'Review|review-noted') || {}).prompt || '',
    /\[sin verificar\] el total podría desbordar/, 'la sospecha de la vuelta intermedia se perdió')
})

test('lo que sigue vuelve a corregirse con el motivo que dio el revisor', async () => {
  const run = await runFlow(script(reviewed('con-condiciones', [B1]),
    reviewed('aprobado', [], [{ id: 'r1-B1', fixed: false, evidence: 'valida el monto pero acepta cero' }]),
    reviewed('aprobado', [], [confirmed('r1-B1')])))
  ranToEnd(run.result)
  const [, second] = run.prompts.filter((one) => one.key === 'Review|review-fix').map((one) => one.prompt)
  assert.match(second, /r1-B1: el handler no valida el monto \(sigue: valida el monto pero acepta cero\)/)
  assert.match(doneOf(run), /corregido: el handler no valida el monto[;·]/, 'a done/ va el hallazgo, no el motivo')
})
