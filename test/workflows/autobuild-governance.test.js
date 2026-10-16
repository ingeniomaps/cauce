'use strict'

// Lo que el guard de gobernanza frena, visto desde el recorrido (caso 383): el commit de un subagente no puede
// esperar a una persona. Por qué se pregunta después del plan y por qué la parada del Commit no rotula «block»
// está en `automatization/workflows/autobuild.js`, junto a cada una.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, ranToEnd, runFlow } = require('../support/autobuild-harness')

const asking = (answer) => ({ 'Plan|governed': answer, 'Critique|governed': answer })

test('un plan que toca gobernanza sin aprobar para antes de construir, y dice qué aprobar', async () => {
  const run = await runFlow(asking({ readOk: true, pending: ['automatization/tests/regresion.test.js'] }))
  assert.equal(run.result.reason, 'governance-approval-needed', JSON.stringify(run.result).slice(0, 160))
  assert.match(run.result.detail, /automatization\/tests\/regresion\.test\.js/)
  assert.match(run.result.detail, /\.ops-approval/)
  assert.ok(!run.phases.includes('Build'), `construyó igual: ${run.phases.join(', ')}`)

  // Y lo que se pregunta son los archivos del plan, desde el servicio de la tarea.
  const asked = run.prompts.find((one) => one.key.endsWith('|governed'))
  assert.match(asked.prompt, /ops\.js governed \S+ --service \.\/api --json 'api\/alta\.go'/)
})

// La pregunta adelanta un aviso que el guard da igual al commitear: si no se pudo hacer, no hay razón para parar.
test('si la pregunta no se pudo hacer, o nada pide aprobación, la corrida sigue', async () => {
  ranToEnd((await runFlow(asking({ readOk: false, pending: ['planning/FLOW.md'] }))).result)
  ranToEnd((await runFlow(asking({ readOk: true, pending: [] }))).result)
})

test('un commit frenado por una aprobación pendiente para sin rotular la tarea como bloqueada', async () => {
  const run = await runFlow({ [KEY.commit]: { committed: false, needsApproval: ['planning/FLOW.md'] } })
  assert.equal(run.result.reason, 'commit-needs-approval', JSON.stringify(run.result).slice(0, 160))
  assert.match(run.result.detail, /planning\/FLOW\.md.*\.ops-approval/)
  assert.ok(!run.asked.some((key) => key.endsWith('|planning-block')), `rotuló la parada: ${run.asked.join(', ')}`)
  assert.match(run.prompts.find((one) => one.key === KEY.commit).prompt, /needsApproval/)

  // Cualquier otro fallo del commit sigue siendo una parada que se commitea, como pide el caso 289.
  const other = await runFlow({ [KEY.commit]: { committed: false, reason: 'el hook de lint falló' } })
  assert.equal(other.result.reason, 'commit-failed')
  assert.ok(other.asked.includes('Commit|planning-block'), other.asked.join(', '))
})
