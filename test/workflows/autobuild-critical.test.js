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

// La corrida real del 2026-10-01 lo mostró: la tarea subió y pasó por Review, y `done/` decía `express`.
test('el carril que llega al WIP y a done/ es el que corrió', async () => {
  const subida = await runFlow(withSurfaces({ critical: SURFACE }), { lane: 'express', vouched: true })
  assert.match(doneFacts(subida), /Hechos: lane=directo;/)
  assert.match((subida.prompts.find((one) => one.key === KEY.wip) || {}).prompt || '', /lane=directo,/)

  const intacta = await runFlow(withSurfaces({ critical: '' }), { lane: 'express', vouched: true })
  assert.match(doneFacts(intacta), /Hechos: lane=express;/)
})

// Lo que el prompt promete sobre una superficie crítica tiene que coincidir con lo que el código hace: un
// hallazgo sin comprobar no manda a corregir, también ahí, así que se pide comprobar antes de afirmar.
test('sobre una superficie crítica el revisor recibe que tiene que comprobar', async () => {
  const flow = await runFlow(withSurfaces({ critical: '' }), { lane: 'full' })
  const review = (flow.prompts.find((one) => one.key === KEY.review) || {}).prompt || ''
  assert.match(review, /se comprueba antes de afirmarlo; sin comprobar no manda a corregir/)
})

// Sobre una superficie crítica, una sospecha bloqueante sin comprobar frena y la decide una persona: ni se
// corrige —sería cambiar código por una hipótesis— ni se entrega. Fuera de lo crítico sigue yendo al INBOX.
const suspicion = { detail: 'el total puede quedar negativo', blocking: true, ref: 'criterio', verified: false }
const reviewed = (critical, concerns, second) => {
  let pass = 0
  return () => {
    pass += 1
    const base = { ...baseScript()[KEY.review], rules: [], critical }
    return pass === 1 ? { ...base, verdict: 'con-condiciones', concerns } : { ...base, ...second }
  }
}
const ROW = { 'Review|human-row': { readOk: true, tasks: ['T-1'] } }

test('una sospecha sin comprobar sobre una superficie crítica frena y queda para una persona', async () => {
  const flow = await runFlow({ ...withSurfaces({ critical: '' }), ...ROW,
    [KEY.review]: reviewed(SURFACE, [suspicion]) })
  assert.equal(flow.result.reason, 'review-unverified')
  assert.match(flow.result.detail, /el total puede quedar negativo/)
  assert.ok(flow.wrote.includes('Review|critical-human'), 'no registró la fila para una persona')
  assert.ok(!flow.asked.includes('Review|review-fix'), 'mandó a corregir una hipótesis')
  assert.ok(!flow.wrote.some((key) => key.startsWith('Review|release:')), 'soltó la reserva con trabajo construido')
  assert.ok(!flow.phases.includes('Commit'), 'entregó sobre lo crítico sin que nadie lo comprobara')
})

test('fuera de lo crítico, o comprobada, la misma sospecha sigue su camino de siempre', async () => {
  const afuera = await runFlow({ ...withSurfaces({ critical: '' }), [KEY.review]: reviewed('', [suspicion]) })
  ranToEnd(afuera.result)
  assert.ok(!afuera.wrote.includes('Review|critical-human'))

  const comprobada = await runFlow({ ...withSurfaces({ critical: '' }),
    [KEY.review]: reviewed(SURFACE, [{ ...suspicion, verified: true }], { verdict: 'aprobado', concerns: [] }) })
  ranToEnd(comprobada.result)
  assert.ok(comprobada.asked.includes('Review|review-fix'), 'lo comprobado sobre lo crítico se corrige')
})

test('la re-revisión también frena si deja una sospecha sin comprobar sobre lo crítico', async () => {
  const fixable = { ...suspicion, detail: 'falta validar el cupón', verified: true }
  const flow = await runFlow({ ...withSurfaces({ critical: '' }), ...ROW,
    [KEY.review]: reviewed(SURFACE, [fixable], { verdict: 'con-condiciones', concerns: [suspicion] }) })
  assert.equal(flow.result.reason, 'review-unverified')
})
