'use strict'

// De dónde sale cada hallazgo del Review y si el revisor lo comprobó (caso 206). Las dos mitades se miden
// juntas: lo comprobado manda a corregir con su regla al lado, y lo supuesto no manda a corregir pero
// tampoco desaparece.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const RULES = ['planning/rules/system/commits.md', 'planning/rules/security.md']
const RULE = `${RULES[1]}#P2`
const finding = (extra) => ({ detail: 'la clave viaja en el log', blocking: true, ...extra })
const approved = { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'], rules: [RULES[1]], critical: '' }

// Primera pasada con los hallazgos que pida el escenario; la re-revisión, limpia.
function reviewing(concerns) {
  let pass = 0
  return () => {
    pass += 1
    return pass === 1 ? { ...approved, verdict: 'con-condiciones', concerns } : approved
  }
}

const flow = (concerns) => runFlow({
  [KEY.context]: { ...baseScript()[KEY.context], rules: RULES },
  [KEY.review]: reviewing(concerns),
})
const prompt = ({ prompts }, key) => (prompts.find((one) => one.key === key) || {}).prompt || ''

test('un hallazgo comprobado manda a corregir con la regla que lo sostiene', async () => {
  const run = await flow([finding({ ref: RULE, verified: true })])
  ranToEnd(run.result)
  assert.ok(prompt(run, 'Review|review-fix').includes(`la clave viaja en el log [${RULE}]`))
})

test('un bloqueante sin comprobar no manda a corregir y queda anotado como sospecha', async () => {
  const run = await flow([finding({ ref: RULE, verified: false })])
  ranToEnd(run.result)
  assert.ok(!run.asked.includes('Review|review-fix'), 'una hipótesis mandó a tocar código')
  assert.match(prompt(run, 'Review|review-noted'), /\[sin verificar\] la clave viaja en el log/)
})

// La cita sin base sigue viaje marcada (R14): ni se borra el hallazgo, ni se corrige la cita en silencio.
test('un hallazgo que cita una regla que no rige pasa a criterio diciendo qué citó', async () => {
  const run = await flow([finding({ ref: 'planning/rules/pagos.md#P9', verified: true })])
  ranToEnd(run.result)
  assert.match(prompt(run, 'Review|review-fix'),
    /\[criterio \(citó planning\/rules\/pagos\.md#P9, que no rige\)\]/)
})

test('un criterio declarado como tal viaja como criterio', async () => {
  const run = await flow([finding({ ref: 'criterio', verified: true })])
  assert.match(prompt(run, 'Review|review-fix'), /la clave viaja en el log \[criterio\]/)
})

test('el revisor recibe qué es ref y qué es verified', async () => {
  const run = await flow([])
  assert.match(prompt(run, KEY.review), /ref es la regla que lo sostiene/)
  assert.match(prompt(run, KEY.review), /verified es true sólo si comprobaste/)
})

// Critique no declara `verified`: un bloqueante suyo sigue bloqueando. Es la contracara de la prueba de
// arriba, y la que se rompe si el filtro pasa a leer el campo por verdad.
test('Critique sigue mandando a replanificar sin el campo nuevo', async () => {
  let pass = 0
  const run = await runFlow({ [KEY.replan]: baseScript()[KEY.plan], [KEY.critique]: () => {
    pass += 1
    return pass === 1
      ? { verdict: 'con-condiciones', consulted: [],
        concerns: [{ detail: 'falta el caso del duplicado', blocking: true }] }
      : { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] }
  } })
  ranToEnd(run.result)
  assert.ok(run.asked.includes(KEY.replan), 'el bloqueante de Critique dejó de bloquear')
})
