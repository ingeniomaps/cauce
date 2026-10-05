'use strict'

// A dónde va lo que Build nota y no arregla. Una fila de acción humana es una pregunta a una persona, así
// que sólo la abre lo que una persona tiene que decidir; el trabajo identificado va al INBOX y lo que no
// pide nada queda en el cierre. Con un solo destino las tres cosas llegaban como pregunta (caso 250).

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const DECISION = '¿el routing sigue la misma regla que resolve?'
const DEBT = 'approvals.service.ts queda en 402 líneas sobre el umbral de 400'
const MUTATION = 'hipótesis, no comprobada: quitar genReqId pondría rojo ese caso'
const NOTE = 'el comentario quedó en dos líneas; es redacción'
const building = (discovered) => ({ [KEY.build]: { ...baseScript()[KEY.build], discovered } })
const promptOf = (prompts, label) => prompts.filter((one) => one.key.endsWith(`|${label}`))
  .map((one) => one.prompt).join('\n')

test('de lo que Build nota, sólo la decisión abre una fila de acción humana', async () => {
  const { result, prompts } = await runFlow(building([
    { kind: 'open', detail: DECISION }, { kind: 'debt', detail: DEBT },
    { kind: 'debt', detail: MUTATION }, { kind: 'note', detail: NOTE },
  ]))
  ranToEnd(result)
  // El criterio viaja a quien clasifica, y la duda cae del lado que pregunta: sin eso una sonda real
  // mandó a deuda la única decisión de producto que había entre dieciocho hallazgos.
  const asked = promptOf(prompts, 'build')
  assert.match(asked, /rumbo del producto, el gasto, una obligación externa o el riesgo/)
  assert.match(asked, /Si dudás entre open y otra, es open/)
  const row = promptOf(prompts, 'open-decisions')
  assert.ok(row.includes(DECISION), 'la decisión llega a la fila')
  for (const other of [DEBT, MUTATION, NOTE]) assert.ok(!row.includes(other), `la fila no pregunta por: ${other}`)

  const debt = promptOf(prompts, 'build-debt')
  assert.match(debt, /planning\/inbox\/deuda\//, 'la deuda va a su carpeta del INBOX')
  assert.ok(debt.includes(DEBT) && debt.includes(MUTATION), 'con todo lo identificado')
  assert.ok(debt.includes(`${DEBT} (autobuild · T-1 · 2026-09-08)`), 'y cada entrada dice de qué tarea salió')
  assert.ok(!debt.includes(DECISION) && !debt.includes(NOTE), 'sin lo que tiene otro destino')

  const done = promptOf(prompts, 'done')
  assert.ok(done.includes(NOTE), 'la nota queda en el cierre de la tarea')
  assert.match(done, /notas-de-build va en decisions, con \[supuesto/)
  assert.ok(!done.includes(DEBT) && !done.includes(DECISION), 'y sólo la nota')
})

test('sin ninguna decisión no se escribe ninguna fila', async () => {
  const { result, asked } = await runFlow(building([
    { kind: 'debt', detail: DEBT }, { kind: 'note', detail: NOTE },
  ]))
  ranToEnd(result)
  assert.ok(!asked.some((key) => key.endsWith('|open-decisions')), `no hay a quién preguntarle: ${asked}`)
})

// El tope es el de Review. Lo que no entra no desaparece: queda contado en el hecho que llega a `done/`.
test('lo que pasa del tope no se escribe y queda contado en el cierre', async () => {
  const many = (kind) => [1, 2, 3, 4, 5].map((n) => ({ kind, detail: `${kind} número ${n}` }))
  const { result, prompts } = await runFlow(building([...many('open'), ...many('debt'), ...many('note')]))
  ranToEnd(result)
  for (const [kind, label] of [['open', 'open-decisions'], ['debt', 'build-debt'], ['note', 'done']]) {
    const prompt = promptOf(prompts, label)
    assert.ok(prompt.includes(`${kind} número 3`) && !prompt.includes(`${kind} número 4`), `${kind} corta en tres`)
  }
  assert.match(promptOf(prompts, 'done'), /build=[^;]*2 open sin volcar · 2 debt sin volcar · 2 note sin volcar/)
})
