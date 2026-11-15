'use strict'

// Lo que los guards de límites no dejan escribir dentro de `.git`. Por qué, en `engine/hooks/git-internals.js`. El
// banco va fuera del temporal, que los dos guards eximen.

const { outsideTempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

const INSIDE = /dentro de \.git sólo se escribe lo que escribe un commit/

function project(name, roots = true) {
  const root = outsideTempRoot(name)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify(roots ? { workspaceRoots: [{ name: 'r', path: '.' }] } : {}))
  return root
}

test('un hook o la configuración de git no se escriben, ni con la herramienta de archivos ni por el shell', () => {
  for (const roots of [true, false]) {
    const root = project(`ops-hook-git-internals-${roots}-`, roots)
    const file = (file_path) => ({ cwd: root, tool_input: { file_path } })
    const shell = (command) => ({ cwd: root, tool_input: { command } })
    for (const one of ['.git/hooks/pre-commit', '.git/config', `${root}/.git/hooks/post-checkout`,
      '.git/worktrees/x/config.worktree', '.git/config.worktree']) {
      blocked('workspace-boundary', file(one), INSIDE)
    }
    for (const command of ['echo x > .git/hooks/pre-commit', 'cp evil .git/hooks/pre-commit',
      'tee -a .git/config < x', 'git config core.hooksPath h', 'git -C . config --local core.fsmonitor x',
      'git config set user.name x', 'git config --unset user.name', `printf x >> ${root}/.git/config`,
      'rm -f .git/config', 'touch .git/hooks/pre-push', 'mkdir -p .git/hooks/pre-commit.d',
      'git config --bool core.bare true', 'git config -f .git/config core.hooksPath h', 'git init --template=t',
      'git clone --template t u r', 'git config edit', 'git config -e',
      'echo x > .git/modules/sub/hooks/pre-commit', 'echo x > .GIT/config', 'git config core.hooksPath list',
      'echo x > .git/modules/lib/foo/hooks/pre-commit', 'echo x > .git/modules/lib/foo/config',
      'cp pre-commit .git/modules/sub/hooks/', 'mkdir -p .git/modules/lib/foo/hooks',
      `git -C /tmp config -f ${root}/.git/config core.hooksPath h`]) {
      blocked('shell-boundary', shell(command), INSIDE)
    }
    // Lo que escribe un commit, y leer la configuración, pasan.
    for (const one of ['.git/COMMIT_EDITMSG', 'src/hooks/x.js', 'config', 'docs/.git-notes/config']) {
      assert.doesNotThrow(() => execute('workspace-boundary', file(one)), one)
    }
    for (const command of ['git config --get user.name', 'git config user.email', 'git config list',
      'git config --path core.hooksPath', 'git config --bool core.bare', 'git config --type bool core.bare',
      'git config -f .gitmodules --get-regexp path', 'git config --blob HEAD:.gitmodules --list',
      'git config --default x --get k', 'git config --get-colorbool color.ui', 'git config --global user.name X',
      'git config -f .gitmodules submodule.x.url u', 'git init', 'git clone u r', 'git worktree add ../w',
      'git config get --all user.name', 'git config get --show-names user.name', 'git config get --regexp a',
      'git config get --url=https://x http.proxy', 'git config get --value=x a.b', 'git config --no-type --get x',
      'git config -t bool core.bare', 'echo x > .git/modules/lib/foo/HEAD', 'mkdir -p .git/modules/hooks',
      'git -c core.hooksPath=/dev/null commit -m x', 'git switch -c feat/x', 'cat .git/config',
      'echo x > config', 'git status']) {
      assert.doesNotThrow(() => execute('shell-boundary', shell(command)), command)
    }
  }
})

// Un repositorio de prueba se arma en el temporal, y ahí configurarlo es trabajo corriente: el guard lo deja pasar como
// deja pasar el resto de lo que cae ahí.
test('configurar un repositorio en el temporal pasa', () => {
  const root = project('ops-hook-git-internals-temp-')
  const temp = require('node:os').tmpdir()
  for (const command of [`cd ${temp}/r && git config user.email a`, `git -C ${temp}/r config user.email a`,
    `git -C ${temp}/r config commit.gpgsign false`]) {
    assert.doesNotThrow(() => execute('shell-boundary', { cwd: root, tool_input: { command } }), command)
  }
  blocked('shell-boundary', { cwd: root, tool_input: { command: 'git config user.email a' } }, INSIDE)
})
