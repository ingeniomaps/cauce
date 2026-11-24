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
  // También desde una subcapa: antes resolvía la carpeta de la sesión, sin `origin`, y frenaba de más.
  assert.doesNotThrow(() => execute('destructive', run(root, `(cd ${app} && gh pr create --repo me/app --fill)`)))
  blocked('destructive', run(root, `(cd ${app} && gh pr create --repo org/app --fill)`), FOREIGN)
  // Un `cd` en una subcapa que ya cerró no mueve al comando de después.
  blocked('destructive', run(app, `(cd ${root} && ls); gh pr create --repo org/app --fill`), FOREIGN)
  assert.doesNotThrow(() => execute('destructive', run(root, `( cd ${app} && gh pr create --repo me/app --fill )`)))
  // El `cd` de afuera se suma al de la subcapa, y adentro cuenta el último.
  const parent = path.dirname(root)
  assert.doesNotThrow(() => execute('destructive',
    run(parent, `cd ${path.basename(root)} && (cd app && gh pr create --repo me/app --fill)`)))
  assert.doesNotThrow(() => execute('destructive', run(root, `(cd ${parent}; cd ${app}; gh pr create --repo me/app)`)))
  const chained = `(cd ${path.basename(root)} && cd app && gh pr create --repo me/app)`
  assert.doesNotThrow(() => execute('destructive', run(parent, chained)), 'los cd de la subcapa, en orden')
  // Cada `gh pr create` desde su carpeta, y un `$(…)` cerrado adentro de la subcapa no la cierra.
  blocked('destructive', run(app, `gh pr create --repo me/app; (cd ${root} && gh pr create --repo me/app)`),
    /no tiene origin/)
  blocked('destructive', run(root, `(cd ${app} && gh pr create --repo me/app); gh pr create --repo me/app`),
    /no tiene origin/)
  blocked('destructive', run(root, `(cd ${app} && x=$(pwd) && gh pr create --repo org/app)`), FOREIGN)
  assert.doesNotThrow(() => execute('destructive', run(root, `(cd ${app} && x=$(pwd) && gh pr create --repo me/app)`)))
  blocked('destructive', run(app, `(ls; cd ${root}); gh pr create --repo org/app --fill`), FOREIGN)
  blocked('destructive', run(app, `echo "a; cd ${root}" && gh pr create --repo org/app --fill`), FOREIGN)
  const { app: other } = checkout('cauce-pr-destino-otro-', 'https://github.com/org/app.git')
  // Un `git -C` no mueve la carpeta del shell, y `gh` corre donde está: HEAD tomaba el `-C` y dejaba pasar esto.
  blocked('destructive', run(app, `git -C ${other} status && gh pr create --repo org/app`), FOREIGN)
  // Un `cd` con la ruta entre comillas mueve la carpeta igual, también después de un commit.
  blocked('destructive', run(app, `git commit -qm x ; cd "${other}" && gh pr create --repo me/app`), FOREIGN)
  // En un `bash -c` lo citado es código que corre: su `cd` cuenta.
  blocked('destructive', run(app, `cd ${other} ; bash -c "cd ${app} && gh pr create --repo org/app"`), FOREIGN)
  assert.doesNotThrow(() => execute('destructive', run(root, `bash -c 'cd ${app} && gh pr create --repo me/app'`)))
  // Pero corre en un proceso hijo: su `cd` no mueve al shell de afuera, como tampoco uno en segundo plano o en una
  // tubería.
  for (const moved of [`bash -c 'cd ${other}';`, `sh -c "cd ${other}; true";`, `bash -lc 'echo ( ; cd ${other}';`,
    `cd ${other} &`, `cd ${other} | true;`, `cd ${other} 2>/dev/null | true;`, `cd ${other} >/dev/null &`,
    `true | cd ${other};`]) {
    blocked('destructive', run(app, `${moved} gh pr create --repo org/app`), FOREIGN)
  }
  // `&>` es una redirección: ese `cd` sí mueve.
  assert.doesNotThrow(() => execute('destructive', run(root, `cd ${app} &>/dev/null; gh pr create --repo me/app`)))
  // Un `)` suelto adentro de un `-c` no cierra la subcapa de afuera.
  assert.doesNotThrow(() => execute('destructive',
    run(root, `(cd ${app} && bash -c 'echo )' && gh pr create --repo me/app)`)))
  // Y el que corre adentro del `-c`, pero en otra llamada del mismo comando, tampoco.
  blocked('destructive', run(app, `bash -c 'cd ${other} && gh pr create --repo org/app' ; gh pr create --repo org/app`),
    FOREIGN)
  // Lo citado que dice «gh pr create» no es una llamada, y no le presta su carpeta a la de verdad.
  for (const quoted of ['echo "gh pr create"', "echo 'gh pr new'", 'printf %s "gh pr create --repo org/app"',
    'grep -n "gh pr create" README.md', 'git commit -m "note: gh pr create"']) {
    blocked('destructive', run(app, `cd ${other} && ${quoted} ; cd ${app} && gh pr create --repo org/app`), FOREIGN)
  }
  // Dos llamadas que dicen lo mismo, cada una desde su carpeta: frena si alguna no corre en su origin.
  const twice = `cd ${other} && gh pr create --repo org/app ; cd ${app} && gh pr create --repo org/app`
  blocked('destructive', run(app, twice), FOREIGN)
  // Un `--title` entre comillas no cambia de dónde corre la llamada.
  assert.doesNotThrow(() => execute('destructive', run(root, `cd ${app} && gh pr create --title "a b" --repo me/app`)))
  blocked('destructive', run(root, `cd ${app} && gh pr create --title "a b" --repo org/app`), FOREIGN)
  assert.doesNotThrow(() => execute('destructive', run(app, 'echo pr create')), 'sin gh no hay llamada')
  // Un paréntesis entre comillas no abre una subcapa.
  blocked('destructive', run(app, `echo "(cd ${root}" && gh pr create --repo org/app --fill`), FOREIGN)
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
