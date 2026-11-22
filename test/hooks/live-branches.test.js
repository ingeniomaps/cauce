'use strict'

// Caso 533: las ramas vivas que el proyecto declara en `runner.liveBranches` —develop, staging, production con
// GitFlow— cuentan como `main`: un commit que cae en ellas frena, publicar en ellas pide nombrarlas en
// `pushToLiveBranches`, y el agente no se escribe la llave.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, pushRoot } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const C = require('../../engine/config/validate')

const declare = (root, runner) => {
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'embedded', runner }, null, 2))
}

test('un commit en una rama declarada viva frena, y sin declararla pasa como antes', () => {
  const root = tempRoot('cauce-viva-commit-')
  initRepo(root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'uno\n')
  git(['add', 'a.txt'], root)
  git(['commit', '-qm', 'uno'], root)
  git(['checkout', '-q', '-b', 'develop'], root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'dos\n')
  git(['add', 'a.txt'], root)
  const saved = { dir: process.env.CLAUDE_PROJECT_DIR, ci: process.env.CI }
  process.env.CLAUDE_PROJECT_DIR = root
  delete process.env.CI
  try {
    const commit = { cwd: root, tool_input: { command: 'git commit -m "feat: x"' } }
    declare(root, {})
    assert.doesNotThrow(() => execute('live-commit', commit), 'sin declararla, develop es de trabajo')
    declare(root, { liveBranches: ['develop', 'production'] })
    blocked('live-commit', commit, /cae en develop, la rama viva/)
  } finally {
    if (saved.dir === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = saved.dir
    if (saved.ci !== undefined) process.env.CI = saved.ci
  }
})

test('publicar en una rama declarada viva pide nombrarla en pushToLiveBranches, como main', () => {
  const root = pushRoot('cauce-viva-push-', { allowPush: true })
  const push = (command) => ({ cwd: root, tool_input: { command } })
  for (const branch of ['develop', 'production']) {
    assert.doesNotThrow(() => execute('destructive', push(`git push origin ${branch}`)), `sin declarar: ${branch}`)
  }
  declare(root, { allowPush: true, liveBranches: ['develop', 'production'] })
  for (const branch of ['develop', 'production', 'main']) {
    blocked('destructive', push(`git push origin ${branch}`), new RegExp(`publica cambios en ${branch}, la rama viva`))
  }
  assert.doesNotThrow(() => execute('destructive', push('git push origin feat/x')))
  declare(root, { allowPush: true, liveBranches: ['develop', 'production'], pushToLiveBranches: ['develop'] })
  assert.doesNotThrow(() => execute('destructive', push('git push origin develop')))
  blocked('destructive', push('git push origin production'), /publica cambios en production, la rama viva/)
})

test('la llave se valida como pushToLiveBranches, y el agente no se la escribe', () => {
  assert.ok(C.validateOpsConfig({ runner: { liveBranches: ['release/*'] } })
    .includes('ops.config.json: runner.liveBranches debe ser una lista de nombres de rama exactos, sin espacios ni '
      + 'patrones'))
  assert.deepEqual(C.validateOpsConfig({ runner: { liveBranches: ['develop'] } })
    .filter((one) => one.includes('liveBranches')), [])
  const root = tempRoot('cauce-viva-llave-')
  declare(root, { allowPush: false, liveBranches: ['develop'] })
  const write = (runner) => ({ cwd: root, tool_input: { file_path: path.join(root, 'ops.config.json'),
    content: JSON.stringify({ mode: 'embedded', runner }, null, 2) } })
  blocked('ops-config', write({ allowPush: false, liveBranches: [] }), /runner\.liveBranches/)
  blocked('ops-config', write({ allowPush: false }), /runner\.liveBranches/)
})
