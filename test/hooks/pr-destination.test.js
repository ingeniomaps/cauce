'use strict'

// Caso 540: un `gh pr create --repo` frena si el repositorio que nombra no es el `origin` del checkout donde corre,
// porque R10 dice que lo que se publica va al repositorio en el que se trabaja, y en un fork eso es el fork. Con el
// `origin` nombrado pasa como antes, y la salida es la de siempre: el diálogo, el chat o `.ops-approval`.

const { blocked, chatSession, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')

const run = (cwd, command) => ({ cwd, tool_input: { command } })
const FOREIGN = /no es el origin/

// Un checkout del producto dentro de la instancia, con el fork como `origin` y el original como `upstream`.
function checkout(prefix, origin = 'https://github.com/me/app.git') {
  const root = pushRoot(prefix)
  const app = path.join(root, 'app')
  fs.mkdirSync(app)
  const git = (...args) => execFileSync('git', ['-C', app, ...args], { stdio: 'pipe' })
  git('init', '-q')
  git('remote', 'add', 'upstream', 'https://github.com/org/app.git')
  if (origin) git('remote', 'add', 'origin', origin)
  return { root, app }
}

test('un PR al original desde un fork frena, y al origin pasa', () => {
  const { app } = checkout('cauce-pr-destino-')
  for (const command of ['gh pr create --repo org/app --base develop --fill', 'gh pr create -R org/app --fill',
    'gh pr create --repo=org/app --fill', 'gh -R org/app pr create --fill', 'gh pr create --repo me/otro --fill',
    'gh -R org/app pr create', 'gh pr create --repo me/app --repo org/app --fill', 'gh -R me/app pr create -R org/app',
    'gh -Rorg/app pr create --fill', 'gh pr create -Rorg/app', 'gh pr new --repo org/app --fill',
    'gh pr create --repo app --fill', 'gh pr create --repo "$UP" --fill',
    'gh pr create --repo $(git remote get-url upstream) --fill',
  ]) blocked('destructive', run(app, command), FOREIGN)
  for (const command of ['gh pr create --repo me/app --base develop --fill', 'gh pr create -R ME/App --fill',
    'gh -R me/app pr create --fill', 'gh pr create --repo=me/app --fill', 'gh pr create --repo "me/app" --fill',
    'gh pr create --repo org/app --repo me/app', 'gh -Rme/app pr create --fill', 'gh pr new -R me/app --fill',
    'gh pr create --repo github.com/me/app --fill', 'gh pr create --repo https://github.com/me/app --fill',
  ]) assert.doesNotThrow(() => execute('destructive', run(app, command)), command)
  // `pr new` es el alias de `pr create`, y sin destino frena como él.
  blocked('destructive', run(app, 'gh pr new --fill'), /sin --repo/)
  // Sin valor no hay destino que comparar: `gh` lo rechaza solo.
  assert.doesNotThrow(() => execute('destructive', run(app, 'gh pr create --repo')))
})

test('el origin se lee de donde corre gh, por SSH o con credencial en la URL, y no se imprime', () => {
  for (const origin of ['git@github.com:me/app.git', 'https://x-access-token:s3cr3t@github.com/me/app',
    'ssh://git@ssh.github.com:443/me/app.git', 'https://github.acme.com/me/app.git', 'git@acme.ghe.com:me/app.git']) {
    const { app } = checkout('cauce-pr-destino-url-', origin)
    assert.doesNotThrow(() => execute('destructive', run(app, 'gh pr create --repo me/app --fill')), origin)
    assert.doesNotMatch(messageOf('destructive', run(app, 'gh pr create --repo org/app --fill')), /s3cr3t/)
  }
  const { root, app } = checkout('cauce-pr-destino-cd-')
  assert.doesNotThrow(() => execute('destructive', run(root, `cd ${app} && gh pr create --repo me/app --fill`)))
  blocked('destructive', run(root, `cd ${app} && gh pr create --repo org/app --fill`), FOREIGN)
})

test('sin origin no hay contra qué comprobar, y frena; un origin local no es el repositorio nombrado', () => {
  const { app } = checkout('cauce-pr-destino-sin-', '')
  blocked('destructive', run(app, 'gh pr create --repo me/app --fill'), /no tiene origin/)
  blocked('destructive', run(app, 'gh pr create --repo "$UP" --fill'), /no tiene origin/)
  blocked('destructive', run(app, 'gh pr create --repo app --fill'), /no tiene origin/)
  const local = checkout('cauce-pr-destino-local-', '/srv/git/app.git').app
  blocked('destructive', run(local, 'gh pr create --repo me/app --fill'), FOREIGN)
})

test('se aprueba como el resto: por el chat, o con la línea en .ops-approval', () => {
  const { root, app } = checkout('cauce-pr-destino-salida-')
  const create = 'gh pr create --repo org/app --base develop --fill'
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive', chat.says(`corré ${create}`)(run(app, create))))
  } finally { chat.close() }
  blocked('destructive', run(app, create), FOREIGN)
  assert.deepEqual(pasteApproval(root, messageOf('destructive', run(app, create))), ['gh pr create --repo org/app'])
  assert.doesNotThrow(() => execute('destructive', run(app, create)))
  assert.doesNotThrow(() => execute('destructive', run(app, 'gh pr create --repo org/app --title otro --fill')))
})
