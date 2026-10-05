'use strict'

// Lo que el recorrido hace con el estado de planning al cerrar una tarea, y lo que le pasa a quien revisa
// cuando la corrida retoma. Las dos cosas quedaban para alguien: el commit de planning para la persona, y
// las condiciones de la crítica para un Review que no las recibía.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const promptOf = (prompts, key) => prompts.filter((one) => one.key === key).map((one) => one.prompt).join('\n')
const contract = (changes) => ({ [KEY.contract]: { ...baseScript()[KEY.contract], ...changes } })

// Caso 266. El cierre dejaba la cola, `done/` y el INBOX escritos y sin commitear. La rama es una sola que
// se acumula, que es lo que la separa del commit del producto, donde hay una por tarea.
test('al cerrar una tarea se commitea su estado de planning, en una sola rama de trabajo', async () => {
  const { result, prompts, asked } = await runFlow()
  ranToEnd(result)
  const prompt = promptOf(prompts, KEY.planningCommit)
  assert.match(prompt, /chore\(planning\): close T-1/)
  assert.match(prompt, /nunca archivos del producto/)
  assert.match(prompt, /la rama de trabajo de planning que ya exista/)
  assert.match(prompt, /nunca una por tarea/)
  assert.match(prompt, /Nunca amend ni push/)
  assert.ok(asked.indexOf(KEY.planningCommit) > asked.indexOf('Done|done'), 'después de escribir el cierre')

  const allowed = await runFlow(contract({ commitToLiveBranch: true }))
  ranToEnd(allowed.result)
  assert.match(promptOf(allowed.prompts, KEY.planningCommit), /Commiteá en la rama en la que esté ese repositorio/)
  assert.doesNotMatch(promptOf(allowed.prompts, KEY.planningCommit), /work\/planning/)
})

test('sin commit por tarea, tampoco se commitea planning', async () => {
  const { result, asked } = await runFlow(contract({ commitPerTask: false }))
  ranToEnd(result)
  assert.equal(asked.includes(KEY.planningCommit), false)
})

// La tarea ya se entregó: que el commit de planning no salga se dice, y no se reporta como una parada.
test('un commit de planning que no sale se dice y no frena la entrega', async () => {
  const failed = await runFlow({ [KEY.planningCommit]: { committed: false, reason: 'no hay rama de trabajo' } })
  ranToEnd(failed.result)
  assert.deepEqual(failed.result.done, ['T-1'])
  assert.ok(failed.said.some((line) => /planning de T-1 quedó sin commitear: no hay rama de trabajo/.test(line)),
    JSON.stringify(failed.said))

  const live = await runFlow({ [KEY.planningCommit]: { committed: true, hash: 'def456', branch: 'main', live: true } })
  ranToEnd(live.result)
  assert.ok(live.said.some((line) => /planning de T-1 quedó commiteado en la rama viva main/.test(line)))

  const fine = await runFlow()
  assert.ok(!fine.said.some((line) => /estado de planning/.test(line)), 'cuando sale bien no hay nada que avisar')
  const asked = await runFlow({ ...contract({ commitToLiveBranch: true }),
    [KEY.planningCommit]: { committed: true, hash: 'def456', branch: 'main', live: true } })
  assert.ok(!asked.said.some((line) => /rama viva/.test(line)), 'ni cuando el proyecto pidió commitear ahí')
})

// Caso 267. Al retomar no se pasa por la crítica, así que sus condiciones no están en memoria: Review
// recibe dónde leerlas. En una corrida que sí criticó el plan, las recibe escritas y no hace falta.
test('una corrida que retoma le dice a Review dónde están las condiciones de la crítica', async () => {
  const context = baseScript()[KEY.context]
  const resumed = await runFlow({}, { contexts: [
    { ...context, wipActive: true, wip: { phase: 'Build', complete: 1, pending: 2 } },
    { ...context, hasTask: false, wipActive: false, queued: 0 },
  ] })
  ranToEnd(resumed.result)
  const review = promptOf(resumed.prompts, KEY.review)
  assert.match(review, /retomó desde el WIP/)
  assert.ok(review.includes(`planning/${context.wipFile}`), 'nombra el archivo del WIP')
  assert.match(review, /comprobá sobre el diff que cada una se cumplió/)

  const fresh = await runFlow()
  assert.doesNotMatch(promptOf(fresh.prompts, KEY.review), /retomó desde el WIP/, 'sin retomar no se agrega nada')

  const NAMES = 'los identificadores nuevos van en inglés'
  const criticized = await runFlow({ [KEY.critique]: { verdict: 'con-condiciones', consulted: ['api/alta.go'],
    concerns: [{ detail: NAMES, blocking: true, replan: false }] } })
  const direct = promptOf(criticized.prompts, KEY.review)
  assert.ok(direct.includes(NAMES) && !/retomó desde el WIP/.test(direct),
    'con las condiciones en memoria van escritas')
})
