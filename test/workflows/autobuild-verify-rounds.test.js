'use strict'

// La vuelta que compra un criterio que aparece recién en la segunda pasada de Verify (caso 346), y sus dos
// bordes: es una sola, y lo que ya se había pedido no la compra. El porqué está junto al bucle, en el recorrido.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

// Los textos de la corrida real: la primera pasada trajo la condición 3 y la segunda, la 2.
const DOC = '3. La entrada «npm run lint sin la variable da un verde más laxo» de docs/RIESGOS.md sale en el '
  + 'mismo cambio'
const SCRIPT = '2. El script sigue sin --fix y con el mismo patrón de archivos: lo único que cambia es la variable'
const ctx = { ...baseScript()[KEY.context],
  acceptance: `1. el lint del script usa la variable del CI; ${SCRIPT.slice(3)}; ${DOC.slice(3)}` }
const lacks = (...criteria) => ({
  passed: true, details: 'verde', commands: [{ cmd: 'npm test', exitCode: 0, ranTests: true }], covered: [],
  uncovered: criteria.map((criterion) => ({ criterion, cause: 'missing-test' })),
})
const passes = (...verdicts) => {
  let turn = 0
  const script = { [KEY.context]: ctx, [KEY.verify]: () => verdicts[Math.min(turn++, verdicts.length - 1)] }
  return runFlow(script, { contexts: [ctx] }).then((out) => ({ ...out, turns: turn,
    bounces: out.prompts.filter((one) => one.key === 'Verify|missing-tests').map((one) => one.prompt) }))
}

test('un criterio que aparece recién en la segunda pasada compra una vuelta más, sólo para él', async () => {
  const out = await passes(lacks(DOC), lacks(SCRIPT), lacks())
  ranToEnd(out.result)
  assert.equal(out.turns, 3)
  assert.equal(out.bounces.length, 2)
  assert.ok(out.bounces[0].includes(DOC) && !out.bounces[0].includes(SCRIPT), 'la primera pide lo de la primera pasada')
  assert.ok(out.bounces[1].includes(SCRIPT) && !out.bounces[1].includes(DOC), 'la segunda, sólo lo que apareció')
})

test('la vuelta extra es una: lo que falte después frena, sea nuevo o no', async () => {
  const again = await passes(lacks(DOC), lacks(SCRIPT), lacks(SCRIPT))
  assert.equal(again.result.reason, 'verify-hollow')
  assert.equal(again.turns, 3)
  // Uno que no se parece a ninguno de los pedidos: lo que frena acá es el tope, no que ya se haya pedido.
  const third = await passes(lacks(DOC), lacks(SCRIPT), lacks('la página de inicio responde antes de un segundo'))
  assert.equal(third.result.reason, 'verify-hollow')
  assert.equal(third.turns, 3, 'un tercer criterio nuevo no compra una cuarta pasada')
  assert.equal(third.bounces.length, 2)
})

test('lo que ya se pidió y sigue sin cubrir frena como antes, sin vuelta extra', async () => {
  // La segunda pasada lo reescribe a su modo —sin número, con otras palabras alrededor—: es el mismo.
  const reworded = 'El script sigue sin --fix y con el mismo patrón de archivos (sólo cambia la variable)'
  const same = await passes(lacks(SCRIPT), lacks(reworded))
  assert.equal(same.result.reason, 'verify-hollow')
  assert.equal(same.turns, 2)
  assert.equal(same.bounces.length, 1)
  // Con uno pedido y uno nuevo, el pedido frena igual: la vuelta no lo iba a salvar.
  const mixed = await passes(lacks(SCRIPT), lacks(SCRIPT, DOC))
  assert.equal(mixed.result.reason, 'verify-hollow')
  assert.equal(mixed.turns, 2)
  assert.match(mixed.result.detail, /El script sigue sin --fix/)
})

test('si la pasada de la vuelta extra no contesta o sale en rojo, la parada es la de siempre', async () => {
  const red = await passes(lacks(DOC), lacks(SCRIPT), { ...lacks(), passed: false, details: 'lint en rojo' })
  assert.equal(red.result.reason, 'verify-failed')
  const mute = await passes(lacks(DOC), lacks(SCRIPT), null)
  assert.equal(mute.result.reason, 'agent-unavailable')
})

// Un criterio que no dice qué aserciar no es una prueba que falta: pedirle a Build que la escriba es
// inventar la definición. Si aparece recién en la segunda pasada, frena como antes.
test('un criterio ambiguo que aparece en la segunda pasada no compra la vuelta', async () => {
  const vague = { ...lacks(), uncovered: [{ criterion: 'la pantalla se siente rápida', cause: 'ambiguous' }] }
  const out = await passes(lacks(DOC), vague, lacks())
  assert.equal(out.result.reason, 'verify-hollow')
  assert.equal(out.turns, 2)
  assert.equal(out.bounces.length, 1)
})