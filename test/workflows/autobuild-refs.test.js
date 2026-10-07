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

// Caso 207. Lo que la revisión mandó a corregir llega a `done/` con su regla: es el único registro que
// sobrevive a la corrida, y sin esto la misma falla corregida en diez tareas no dejaba rastro.
const doneFacts = (run) => prompt(run, 'Done|done')

test('lo que se mandó a corregir llega a done/ con su regla', async () => {
  const run = await flow([
    finding({ ref: RULE, verified: true }),
    finding({ detail: 'falta el índice', ref: 'criterio', verified: true }),
  ])
  ranToEnd(run.result)
  assert.match(doneFacts(run), /review=[^;]*corregido: la clave viaja en el log \[planning\/rules\/security\.md#P2\]/)
  assert.match(doneFacts(run), /review=[^;]*\| falta el índice \[criterio\]/)
})

test('sin correcciones, o con sólo sospechas, done/ no dice que se corrigió algo', async () => {
  for (const concerns of [[], [finding({ ref: RULE, verified: false })]]) {
    const run = await flow(concerns)
    ranToEnd(run.result)
    assert.doesNotMatch(doneFacts(run), /corregido:/, `con ${JSON.stringify(concerns)} afirmó una corrección`)
  }
})

test('lo corregido lleva tope y cuenta lo que no entra', async () => {
  const many = [1, 2, 3, 4, 5].map((n) => finding({ detail: `hallazgo ${n}`, ref: 'criterio', verified: true }))
  const run = await flow(many)
  ranToEnd(run.result)
  const listed = '1 \\[criterio\\] \\| hallazgo 2 \\[criterio\\] \\| hallazgo 3 \\[criterio\\]'
  assert.match(doneFacts(run), new RegExp(`corregido: hallazgo ${listed}`))
  assert.doesNotMatch(doneFacts(run), /hallazgo 4/)
  assert.match(doneFacts(run), /y 2 más/)
})

// Caso 210. Review juzga el diff contra la aceptación, así que la recibe —y la que rige, que puede ser la
// que Ready refinó en esta corrida, no la que sigue escrita en el BACKLOG—.
test('las dos pasadas de Review reciben la aceptación que rige', async () => {
  const run = await flow([finding({ ref: RULE, verified: true })])
  const passes = run.prompts.filter((one) => one.key === KEY.review)
  assert.equal(passes.length, 2, 'la primera revisión y la re-revisión')
  for (const { prompt: text } of passes) assert.ok(text.includes('el alta rechaza un duplicado'), text.slice(-300))

  const refined = await runFlow({
    [KEY.context]: { ...baseScript()[KEY.context], rules: RULES },
    [KEY.ready]: { ready: true, needsHuman: false, refinedAcceptance: 'el alta rechaza un email duplicado' },
    [KEY.review]: approved,
  })
  ranToEnd(refined.result)
  assert.ok(prompt(refined, KEY.review).includes('el alta rechaza un email duplicado'), 'no recibió la refinada')
})

// Caso 211. El prompt de Done traía el hecho de revisión y el agente lo resumía al escribirlo: lo que mide
// esta prueba es el pedido de copia textual; que se cumpla lo midió la corrida real que el caso cita.
test('Done pide lane y review textuales', async () => {
  const run = await flow([])
  assert.match(prompt(run, 'Done|done'), /lane y review van textuales, copiados de estos hechos sin resumir/)
})

// Revisión de la tanda: una sospecha de la primera pasada se perdía si la re-revisión no la repetía.
test('la sospecha de la primera pasada llega al INBOX aunque la re-revisión no la repita', async () => {
  const run = await flow([
    finding({ ref: RULE, verified: true }),
    finding({ detail: 'puede haber una carrera en el alta', ref: 'criterio', verified: false }),
  ])
  ranToEnd(run.result)
  assert.match(prompt(run, 'Review|review-noted'), /\[sin verificar\] puede haber una carrera en el alta/)
})

// La ruta como la escribe el revisor —con `./` delante— y `criterio` con mayúscula no son citas sin base.
test('una regla que rige citada con otra forma de la ruta no se marca como que no rige', async () => {
  const run = await flow([
    finding({ ref: `./${RULE}`, verified: true }),
    finding({ detail: 'falta el índice', ref: 'Criterio', verified: true }),
  ])
  const fix = prompt(run, 'Review|review-fix')
  assert.doesNotMatch(fix, /que no rige/, fix.slice(-400))
})

// Caso 214. El cierre trae del motor qué regla se corrigió en varias tareas y la anota como lección, sin
// promover; sin nada que anotar no escribe, y con más del tope anota sólo el tope.
const lesson = (n) => ({ name: `reforzar-commits-r${n}`, ref: `planning/rules/system/commits.md#R${n}`,
  tasks: ['alta', 'baja'], reopened: false })
const closingWith = (lessons) => ({ [KEY.closing]: { ok: true, errors: [], warnings: [], lessons } })

test('el cierre anota como lección la regla corregida en varias tareas, con su fila en LESSONS.md', async () => {
  const run = await runFlow(closingWith([lesson(8)]))
  ranToEnd(run.result)
  const noted = run.written.find((one) => one.includes('inbox/lecciones/')) || ''
  assert.match(noted, /reforzar-commits-r8: la revisión corrigió [^ ]+#R8 en 2 tareas; ¿le falta a la regla/)
  assert.match(noted, /visibilidad\? \(alta, baja\) \(autobuild · lecciones · 2026-09-08\)/, 'entra entera')
  // La fecha es la de la primera lectura: la relectura que cierra la cola no la trae.
  assert.match(noted, /\| propuesta \| <tareas separadas por coma> \| 2026-09-08 \|/)
  assert.match(noted, /sin promover ninguna/)
  // Caso 216: una entrada por archivo, y ya no en la sección de INBOX.md, que es lo que chocaba entre líneas.
  assert.match(noted, /su propio archivo/)
  assert.doesNotMatch(noted, /sección Lecciones de [^ ]*INBOX\.md/)
  assert.match(noted, /LESSONS\.md[^|]*\| <ref> \| propuesta \|/)
  assert.match(prompt(run, 'Closing|closing'), /node tools\/ops\.js lessons \.\/planning --json/)
})

test('sin lecciones no se escribe nada, y con más del tope se anota sólo el tope', async () => {
  const none = await runFlow(closingWith([]))
  assert.ok(!none.wrote.includes('Closing|lessons-noted'))
  const many = await runFlow(closingWith([1, 2, 3, 4].map(lesson)))
  const noted = many.written.find((one) => one.includes('inbox/lecciones/')) || ''
  assert.match(noted, /reforzar-commits-r3/)
  assert.doesNotMatch(noted, /reforzar-commits-r4/)
})
