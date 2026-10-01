'use strict'

// La cola partida por hito (caso 212), del lado de quien escribe en ella: cerrar y partir una tarea se hace en
// el archivo donde vive, que `context` dice cuál es; clasificar y proteger la cola mira todos.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const inFile = (file) => ({ [KEY.context]: { ...baseScript()[KEY.context], file } })
const doneOf = ({ written }) => written.find((one) => one.includes('Cerrá T-1 de forma atómica')) || ''

test('Done cierra la tarea en el archivo de su hito y borra el archivo si el hito queda vacío', async () => {
  const run = await runFlow(inFile('backlog/h1.md'))
  ranToEnd(run.result)
  assert.match(doneOf(run), /sacala junto con sus notas indentadas de \.\/planning\/backlog\/h1\.md/)
  assert.match(doneOf(run), /su hito queda sin tareas, borrá ese archivo/)
})

test('sin archivo declarado, la tarea vive en BACKLOG.md como siempre', async () => {
  const run = await runFlow({})
  assert.match(doneOf(run), /sacala junto con sus notas indentadas de \.\/planning\/BACKLOG\.md/)
})

test('clasificar y proteger la cola miran BACKLOG.md y backlog/', async () => {
  const run = await runFlow(inFile('backlog/h1.md'), { lane: 'full', vouched: true })
  const prompt = (key) => (run.prompts.find((one) => one.key === key) || {}).prompt || ''
  assert.match(prompt(KEY.classify), /Clasificá en \.\/planning\/BACKLOG\.md y los archivos de \.\/planning\/backlog\//)
  assert.match(prompt(KEY.build), /ni \.\/planning\/BACKLOG\.md y los archivos de \.\/planning\/backlog\//)
})
