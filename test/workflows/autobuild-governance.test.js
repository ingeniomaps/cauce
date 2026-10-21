'use strict'

// Lo que el guard de gobernanza frena, visto desde el recorrido (caso 383): el commit de un subagente no puede
// esperar a una persona. Por qué se pregunta después del plan y por qué la parada del Commit no rotula «block»
// está en `automatization/workflows/autobuild.js`, junto a cada una.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const asking = (answer) => ({ 'Plan|governed': answer, 'Critique|governed': answer })

test('un plan que toca gobernanza sin aprobar para antes de construir, y dice qué aprobar', async () => {
  const run = await runFlow(asking({ readOk: true, pending: ['automatization/tests/regresion.test.js'] }))
  assert.equal(run.result.reason, 'governance-approval-needed', JSON.stringify(run.result).slice(0, 160))
  assert.match(run.result.detail, /automatization\/tests\/regresion\.test\.js/)
  assert.match(run.result.detail, /\.ops-approval/)
  assert.ok(!run.phases.includes('Build'), `construyó igual: ${run.phases.join(', ')}`)

  // Y lo que se pregunta son los archivos del plan, desde el servicio de la tarea.
  const asked = run.prompts.find((one) => one.key.endsWith('|governed'))
  assert.match(asked.prompt, /ops\.js governed '\S+' --service '\.\/api' --json 'api\/alta\.go'/)

  // Y lo que deja escrito: la fila, la reserva suelta y el asunto del commit de planning.
  assert.ok(run.asked.includes('Critique|governance-human') || run.asked.includes('Plan|governance-human'),
    run.asked.join(', '))
  assert.ok(run.asked.some((key) => key.startsWith('release:') || key.endsWith('|release:T-1')), run.asked.join(', '))
  const block = run.prompts.find((one) => one.key.endsWith('|planning-block'))
  assert.match(block.prompt, /chore\(planning\): await governance approval for T-1/)
})

test('si la pregunta no se pudo hacer, o nada pide aprobación, la corrida sigue', async () => {
  ranToEnd((await runFlow(asking({ readOk: false, pending: ['planning/FLOW.md'] }))).result)
  ranToEnd((await runFlow(asking({ readOk: true, pending: [] }))).result)
})

test('un commit frenado por una aprobación pendiente para sin rotular la tarea como bloqueada', async () => {
  const run = await runFlow({ [KEY.commit]: { committed: false, needsApproval: ['planning/FLOW.md'] } })
  assert.equal(run.result.reason, 'commit-needs-approval', JSON.stringify(run.result).slice(0, 160))
  assert.match(run.result.detail, /planning\/FLOW\.md.*\.ops-approval/)
  assert.match(run.prompts.find((one) => one.key === KEY.commit).prompt, /needsApproval/)
  // Ni commit de planning ni fila: el índice tiene el trabajo de la tarea, y el WIP es lo que se reanuda.
  assert.ok(!run.asked.some((key) => key.endsWith('|planning-block')), `commiteó planning: ${run.asked.join(', ')}`)
  assert.ok(!run.asked.some((key) => key.endsWith('-human')), `dejó una fila: ${run.asked.join(', ')}`)

  // Cualquier otro fallo del commit sigue siendo una parada que se commitea, como pide el caso 289.
  const other = await runFlow({ [KEY.commit]: { committed: false, reason: 'el hook de lint falló' } })
  assert.equal(other.result.reason, 'commit-failed')
  assert.ok(other.asked.includes('Commit|planning-block'), other.asked.join(', '))
})

// Sin servicio no se pasa `--service`: vacío, el parser tomaba `--json` como su valor y la salida dejaba de ser JSON,
// así que la pregunta se perdía sin aviso (revisión del caso 383).
test('sin servicio, la pregunta no le pasa un --service vacío', async () => {
  const run = await runFlow({ [KEY.context]: { ...baseScript()[KEY.context], service: '' } })
  const asked = run.prompts.find((one) => one.key.endsWith('|governed'))
  assert.ok(asked, 'no se preguntó')
  assert.doesNotMatch(asked.prompt, /--service/)
  assert.match(asked.prompt, /governed '\S+' --json 'api\/alta\.go'/)
})

