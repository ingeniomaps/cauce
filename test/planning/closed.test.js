'use strict'

// Quien cierra una tarea sabe cuál cerró, y `check --closed` le deja decirlo (caso 463).

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../../engine/planning/contracts')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

const entry = (slug) => `- [x] **${slug}** — Resultado
  acept: el resultado se observa
  fecha: 2026-11-21
  done: se construyó y \`make test\` salió 0, 3 passed
  qa: observado por el camino real
  tests: A → make test
  commit: n/a — prueba
`

const state = ({ queued = [], done = [] } = {}) => ({
  milestones: [{ slug: 'h', title: 'H', tasks: queued.map((slug) => ({ slug })) }],
  done: { entries: done.map((slug) => ({ slug })), set: new Set(done), duplicates: [] },
})

test('closedErrors nombra la tarea cerrada que no quedó en done/ con su slug, y si sigue en la cola', () => {
  assert.deepEqual(PC.closedErrors(['alta'], state({ done: ['alta'] })), [], 'cerrada como corresponde: nada')

  const renamed = PC.closedErrors(['alta'], state({ queued: ['alta'], done: ['alta-renombrada'] }))
  assert.equal(renamed.length, 1)
  assert.match(renamed[0], /^alta: se dio por cerrada y no tiene entrada en done\/ con ese slug, y sigue en la cola/)
  assert.match(renamed[0], /R25/, 'dice cómo se arregla: el slug de la viñeta es el de la cola')

  assert.match(PC.closedErrors(['alta'], state({ done: ['otra'] }))[0],
    /^alta: se dio por cerrada y no tiene entrada en done\/ con ese slug(?!, y sigue)/, 'fuera de la cola, sin entrada')

  // Estar en la cola y en done/ ya es un error de `validateState`; repetirlo acá lo diría dos veces.
  assert.deepEqual(PC.closedErrors(['alta'], state({ queued: ['alta'], done: ['alta'] })), [])

  assert.deepEqual(PC.closedErrors(['alta', 'baja'], state({ done: ['alta'] })).map((one) => one.split(':')[0]),
    ['baja'], 'cada tarea se juzga por separado')
})

test('check --closed frena la tarea cerrada con otro slug, y sin la bandera nada cambia', () => {
  const dir = path.join(tempRoot('cauce-closed-'), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), '# Backlog\n\n## Hito h — H\n\n'
    + '- [ ] **alta** [lite] — Dar de alta. _Aceptación: el alta responde 201._ (service: api)\n')
  fs.writeFileSync(path.join(dir, 'done', 'alta-renombrada.md'), entry('alta-renombrada'))
  const closedErrors = (args) => JSON.parse(run(['check', dir, '--json', ...args]).stdout).errors
    .filter((one) => /se dio por cerrada/.test(one))

  assert.deepEqual(closedErrors([]), [], 'sin --closed, check no sabe qué se cerró y no lo inventa')

  const flagged = run(['check', dir, '--json', '--closed', 'alta'])
  assert.notEqual(flagged.status, 0)
  assert.deepEqual(closedErrors(['--closed', 'alta']).map((one) => one.split(':')[0]), ['alta'])

  fs.renameSync(path.join(dir, 'done', 'alta-renombrada.md'), path.join(dir, 'done', 'alta.md'))
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entry('alta'))
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), '# Backlog\n')
  assert.deepEqual(closedErrors(['--closed', 'alta,']), [],
    'cerrada con su slug y fuera de la cola; la coma suelta no cuenta')
})
