'use strict'

// Caso 533: las ramas vivas que el proyecto declara llegan a los dos prompts que commitean, y sin declarar ninguna
// el texto es el de siempre. Sin esto el agente commiteaba en `develop` y lo frenaba `live-commit` después.

const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')
const test = require('node:test')
const assert = require('node:assert/strict')

const withLive = (liveBranches) => ({ [KEY.contract]: { ...baseScript()[KEY.contract], liveBranches } })
const asked = (prompts, label) => (prompts.find((one) => one.key.split('|')[1] === label) || {}).prompt || ''

test('las ramas vivas declaradas llegan al commit del producto y al de planning', async () => {
  const declared = await runFlow(withLive(['develop', 'production']))
  ranToEnd(declared.result)
  for (const label of ['commit', 'planning-commit']) {
    assert.match(asked(declared.prompts, label),
      /rama viva —main, master, develop, production o la rama por defecto del remoto— no commitees/, label)
  }
  const repeated = await runFlow(withLive(['main', 'develop']))
  assert.match(asked(repeated.prompts, 'commit'), /rama viva —main, master, develop o la rama/, 'sin repetir main')
  const plain = await runFlow({})
  for (const label of ['commit', 'planning-commit']) {
    assert.match(asked(plain.prompts, label), /rama viva —main, master o la rama por defecto del remoto— no commitees/,
      label)
  }
})
