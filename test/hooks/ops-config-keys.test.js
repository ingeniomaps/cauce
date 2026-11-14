'use strict'

// Caso 498: lo que el agente escribe en `ops.config.json` y afloja un guard lo confirma una persona, como el permiso de
// push (caso 114) y las raíces (caso 373). Cada llave que acepta el motor dice si afloja algo, y con qué cambio.

const { tempRoot } = require('../support/environment')
const { blocked, chatSession, messageOf } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')
const { KEYS, loosened } = require('../../engine/hooks/config-keys')
const { CONFIG_KEYS, RUNNER_KEYS } = require('../../engine/config/validate')

test('cada llave que acepta ops.config.json dice si afloja un guard', () => {
  const accepted = [...CONFIG_KEYS, ...RUNNER_KEYS.map((key) => `runner.${key}`)]
  assert.deepEqual(accepted.filter((key) => !Object.hasOwn(KEYS, key)), [],
    'una llave nueva tiene que clasificarse en engine/hooks/config-keys.js')
  assert.deepEqual(Object.keys(KEYS).filter((key) => !accepted.includes(key)), [], 'y no sobra ninguna')
})

// Cada llave que afloja, en su forma real: un cambio que afloja, con lo que tiene que nombrar, y otro que angosta.
const CASES = {
  'runner.commitToLiveBranch': [{ runner: {} }, { runner: { commitToLiveBranch: true } }, 'true',
    { runner: { commitToLiveBranch: true } }, { runner: { commitToLiveBranch: false } }],
  'runner.allowAiSignature': [{ runner: {} }, { runner: { allowAiSignature: true } }, 'true',
    { runner: { allowAiSignature: true } }, { runner: {} }],
  'runner.humanCheckpointBetweenMilestones': [{ runner: { humanCheckpointBetweenMilestones: true } },
    { runner: { humanCheckpointBetweenMilestones: false } }, 'false',
    { runner: { humanCheckpointBetweenMilestones: false } }, { runner: { humanCheckpointBetweenMilestones: true } }],
  'runner.maxTaskHours': [{ runner: { maxTaskHours: 4 } }, { runner: { maxTaskHours: 8 } }, '8',
    { runner: { maxTaskHours: 4 } }, { runner: { maxTaskHours: 2 } }],
  boundedCommands: [{}, { boundedCommands: ['vitest'] }, '+vitest', { boundedCommands: ['vitest'] }, {}],
  reviewExempt: [{}, { reviewExempt: ['**/*.lock'] }, '+**/*.lock', { reviewExempt: ['**/*.lock'] }, {}],
  lines: [{ lines: { a: ['../x'] } }, { lines: { a: ['../x', '../y'] } }, 'a +../y', { lines: { a: ['../x'] } }, {}],
  deployCommands: [{ deployCommands: ['make deploy'] }, {}, '-make deploy', {}, { deployCommands: ['make deploy'] }],
  guards: [{ guards: { 'pre-shell': ['g/a.sh'] } }, { guards: { 'pre-shell': ['g/b.sh'] } }, 'pre-shell -g/a.sh',
    { guards: { 'pre-shell': ['g/a.sh'] } }, { guards: { 'pre-shell': ['g/a.sh', 'g/b.sh'] } }],
  comments: [{ comments: { inlineMax: 3 } }, { comments: { inlineMax: 9 } }, 'inlineMax 9',
    {}, { comments: { inlineMax: 3 } }],
  // Declararla por primera vez reemplaza los defaults: lo que deja de mirarse es lo que afloja.
  migrations: [{}, { migrations: { extensions: ['ts'] } }, '.sql', { migrations: { paths: ['db'] } },
    { migrations: { paths: ['db', 'otra'] } }],
  mode: [{ mode: 'sidecar' }, { mode: 'toolkit' }, 'toolkit', { mode: 'sidecar' }, { mode: 'embedded' }],
}

test('cada llave afloja en una sola dirección, nombra qué, y lo que angosta no se pregunta', () => {
  const loosening = Object.entries(KEYS).filter(([, rule]) => rule).map(([key]) => key)
  assert.deepEqual(loosening.filter((key) => !CASES[key]), [], 'cada llave que afloja tiene su par de casos')
  for (const [key, [before, after, detail, from, to]] of Object.entries(CASES)) {
    assert.deepEqual(loosened(before, after), [`${key} ${detail}`], `${key}: no vio lo que afloja`)
    assert.deepEqual(loosened(from, to), [], `${key}: frenó lo que angosta`)
  }
  assert.deepEqual(loosened({ comments: {} }, {}), ['comments sin declarar'], 'quitar comments apaga el guard')
  assert.deepEqual(loosened({ comments: {} }, { comments: false }), ['comments sin declarar'], 'y ponerlo en falso')
  assert.deepEqual(loosened({ comments: { language: 'es' } }, { comments: {} }), ['comments -language'])
  assert.deepEqual(loosened({ runner: { maxTaskHours: 4 } }, { runner: { maxTaskHours: '100' } }),
    ['runner.maxTaskHours 100'], 'como número, como lo lee autobuild')
})

const BASE = { project: 'x', mode: 'sidecar', workspaceRoots: [{ name: 'app', path: '../app' }],
  runner: { allowPush: false }, deployCommands: ['make deploy'] }

function instance(name) {
  const root = path.join(tempRoot(name), 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  const file = path.join(root, 'ops.config.json')
  fs.writeFileSync(file, JSON.stringify(BASE, null, 2))
  const write = (content) => ({ cwd: root, tool_input: { file_path: file, content: JSON.stringify(content, null, 2) } })
  return { write }
}

const LOOSENS = /afloja lo que frena a un agente: runner\.commitToLiveBranch true\./

test('escribirse una llave que afloja lo frena, y la persona lo confirma', () => {
  const { write } = instance('ops-hook-afloja-')
  const live = { ...BASE, runner: { ...BASE.runner, commitToLiveBranch: true } }
  const chat = chatSession()
  try {
    const message = messageOf('ops-config', chat.says('seguí con la tarea')(write(live)))
    assert.match(message, LOOSENS)
    assert.match(message, /\n {2}afloja runner\.commitToLiveBranch true\n/, 'la línea nombra la llave y el valor')
    assert.doesNotThrow(() => execute('ops-config', chat.says('dale')(write(live))), 'confirmado pasa')
    blocked('ops-config', chat.says('ahora el login')(write(live)), LOOSENS)
    // Lo que angosta y lo que no afloja nada pasan sin preguntar.
    const narrower = chat.says('seguí')
    assert.doesNotThrow(() => execute('ops-config', narrower(write({ ...BASE, deployCommands: ['make deploy', 'b'] }))))
    assert.doesNotThrow(() => execute('ops-config', narrower(write({ ...BASE, project: 'otro' }))))
  } finally {
    chat.close()
  }
})
