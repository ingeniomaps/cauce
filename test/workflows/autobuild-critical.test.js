'use strict'

// El piso de carril sobre lo que la empresa declaró que no se puede romper (caso 205).
//
// Cada caso de subida tiene su contracara de ausencia: que el piso no suba lo que no toca nada, y que no
// pregunte cuando no hay nada que decidir. Sin esas, un recorrido que mandara todo a revisión pasaría.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const SURFACE = 'Alta de pedido (api/orders)'
const CHECK = 'Surface|critical-surface'

// Una tarea `express` en una instancia que declaró superficies, con la respuesta que el escenario elija.
const withSurfaces = (answer, extra = {}) => ({
  [KEY.context]: { ...baseScript()[KEY.context], surfaces: [SURFACE], surfacesPending: false, ...extra },
  [CHECK]: answer,
})

const doneFacts = ({ written }) => written.find((prompt) => prompt.includes('Cerrá T-1 de forma atómica')) || ''

test('una tarea express que toca una superficie crítica pasa por Review', async () => {
  const flow = await runFlow(withSurfaces({ critical: SURFACE }), { lane: 'express', vouched: true })
  ranToEnd(flow.result)
  assert.ok(flow.phases.includes('Review'), 'la superficie crítica se entregó sin revisor')
  assert.ok(!flow.phases.includes('Ready'), 'subir a directo no agrega las fases de lo no mecánico')
  assert.ok(flow.said.some((line) => line.includes('sube de express a directo')), 'la subida no quedó dicha')
})

test('una tarea express que no toca ninguna sigue sin revisor', async () => {
  const { result, phases } = await runFlow(withSurfaces({ critical: '' }), { lane: 'express' })
  ranToEnd(result)
  assert.ok(phases.includes('Surface'), 'con superficies declaradas, la pregunta se hace')
  assert.ok(!phases.includes('Review'), 'el piso subió una tarea que no toca nada')
})

// Lo que no se puede determinar sube: equivocarse para arriba cuesta una revisión, para abajo una entrega
// sin mirar sobre lo que no se puede romper.
test('si no se puede determinar o contesta algo fuera de la lista, sube igual', async () => {
  for (const answer of [() => null, { critical: 'Facturación' }]) {
    const { result, phases } = await runFlow(withSurfaces(answer), { lane: 'express' })
    ranToEnd(result)
    assert.ok(phases.includes('Review'), `con ${JSON.stringify(answer)} se entregó sin revisor`)
  }
})

test('sin superficies declaradas, o fuera de express, no se pregunta', async () => {
  const sinTabla = await runFlow({}, { lane: 'express' })
  assert.ok(!sinTabla.asked.includes(CHECK), 'preguntó sin nada que decidir')
  assert.ok(!sinTabla.phases.includes('Review'))
  for (const lane of ['directo', 'lite', 'full']) {
    const { asked } = await runFlow(withSurfaces({ critical: SURFACE }), { lane })
    assert.ok(!asked.includes(CHECK), `${lane} ya pasa por Review y preguntó igual`)
  }
})

test('el clasificador y el revisor reciben las superficies', async () => {
  const flow = await runFlow(withSurfaces({ critical: '' }), { lane: 'full', vouched: true })
  const prompt = (key) => (flow.prompts.find((one) => one.key === key) || {}).prompt || ''
  assert.match(prompt(KEY.classify), /nunca va por express/)
  assert.ok(prompt(KEY.classify).includes(SURFACE), 'el clasificador no recibió la tabla')
  assert.ok(prompt(KEY.review).includes(SURFACE), 'el revisor no recibió la tabla')
})

test('lo que Review dice de las superficies llega a done/, también cuando no toca ninguna', async () => {
  const toca = await runFlow({ ...withSurfaces({ critical: '' }),
    [KEY.review]: { ...baseScript()[KEY.review], critical: SURFACE } })
  const named = SURFACE.replace(/[()]/g, '\\$&')
  assert.match(doneFacts(toca), new RegExp(`review=[^;]*toca la superficie crítica ${named}`))

  const no = await runFlow({ ...withSurfaces({ critical: '' }),
    [KEY.review]: { ...baseScript()[KEY.review], critical: '' } })
  assert.match(doneFacts(no), /review=[^;]*no toca superficies críticas/)

  const pendiente = await runFlow(withSurfaces({ critical: '' }, { surfacesPending: true }))
  assert.match(doneFacts(pendiente), /review=[^;]*filas sin declarar/)
})
