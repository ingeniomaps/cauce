'use strict'

// Dónde cae un commit: en la rama viva sólo si alguien lo pidió o el proyecto lo declaró (caso 284).

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, chatSession } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const { ordersCommit, branchAfter } = require('../../engine/hooks/live-commit')

const LIVE = /cae en main, la rama viva/

// Un repositorio de la sesión parado en `main`, con un commit y un cambio stageado. La sesión se fija por
// entorno, que es como la conoce un guard, y se saca `CI`, donde el guard no opina.
function onMain(prefix, body) {
  const root = tempRoot(prefix)
  initRepo(root)
  git(['checkout', '-q', '-B', 'main'], root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'uno\n')
  git(['add', 'a.txt'], root)
  git(['commit', '-qm', 'uno'], root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'dos\n')
  git(['add', 'a.txt'], root)
  const saved = { dir: process.env.CLAUDE_PROJECT_DIR, ops: process.env.OPS_ROOT, ci: process.env.CI }
  process.env.CLAUDE_PROJECT_DIR = root
  delete process.env.OPS_ROOT
  delete process.env.CI
  try { return body(root, (command) => ({ cwd: root, tool_input: { command } })) } finally {
    for (const [name, key] of [['CLAUDE_PROJECT_DIR', 'dir'], ['OPS_ROOT', 'ops'], ['CI', 'ci']]) {
      if (saved[key] === undefined) delete process.env[name]
      else process.env[name] = saved[key]
    }
  }
}

test('un commit en la rama viva se frena y manda a cortar una rama, sin pedirle nada a nadie', () => {
  onMain('cauce-live-', (root, at) => {
    blocked('live-commit', at('git commit -m "feat: x"'), LIVE)
    blocked('live-commit', at(`git -C ${root} commit -m "feat: x"`), /git switch -c <tipo>\/<slug>/)
    blocked('live-commit', at('git commit --amend --no-edit'), LIVE)

    // En una rama de trabajo no hay nada que frenar, y cortarla en el mismo comando cuenta.
    assert.doesNotThrow(() => execute('live-commit', at('git switch -c feat/x && git commit -m "feat: x"')))
    blocked('live-commit', at('git switch -c feat/x && git switch main && git commit -m x'), LIVE)
    git(['switch', '-q', '-c', 'feat/x'], root)
    assert.doesNotThrow(() => execute('live-commit', at('git commit -m "feat: x"')))
    blocked('live-commit', at('git checkout main && git commit -m x'), LIVE)
    assert.doesNotThrow(() => execute('live-commit', at('git status && git log -1')), 'no commitea')
  })
})

test('la rama por defecto del remoto es viva aunque no se llame main', () => {
  onMain('cauce-live-remoto-', (root, at) => {
    const remote = tempRoot('cauce-live-remoto-bare-')
    git(['init', '-q', '--bare'], remote)
    git(['branch', '-q', '-m', 'trunk'], root)
    git(['remote', 'add', 'origin', remote], root)
    git(['push', '-q', 'origin', 'trunk'], root)
    git(['remote', 'set-head', 'origin', 'trunk'], root)
    blocked('live-commit', at('git commit -m x'), /cae en trunk, la rama viva/)
  })
})

test('pasa donde no le toca opinar: lo declarado, lo ajeno, el primer commit, el HEAD suelto y CI', () => {
  onMain('cauce-live-pasa-', (root, at) => {
    const foreign = tempRoot('cauce-live-ajeno-')
    initRepo(foreign)
    git(['checkout', '-q', '-B', 'main'], foreign)
    fs.writeFileSync(path.join(foreign, 'b.txt'), 'uno\n')
    git(['add', 'b.txt'], foreign)
    // Con un commit ya hecho: sin él pasaría por no tener rama viva todavía, y no por ser ajeno.
    git(['commit', '-qm', 'uno'], foreign)
    assert.doesNotThrow(() => execute('live-commit', at(`git -C ${foreign} commit -m x`)), 'un repositorio ajeno')

    const fresh = path.join(root, 'nuevo')
    fs.mkdirSync(fresh)
    initRepo(fresh)
    git(['checkout', '-q', '-B', 'main'], fresh)
    assert.doesNotThrow(() => execute('live-commit', at(`git -C ${fresh} commit -m "chore: base"`)),
      'sin commits todavía, la rama viva la crea el primero')

    process.env.CI = 'true'
    assert.doesNotThrow(() => execute('live-commit', at('git commit -m x')), 'en CI no hay a quién pedírselo')
    delete process.env.CI

    git(['checkout', '-q', '--detach'], root)
    assert.doesNotThrow(() => execute('live-commit', at('git commit -m x')), 'con el HEAD suelto no hay rama')
    git(['checkout', '-q', 'main'], root)

    blocked('live-commit', at('git commit -m x'), LIVE)
    fs.mkdirSync(path.join(root, 'planning'))
    const config = (runner) => fs.writeFileSync(path.join(root, 'ops.config.json'),
      JSON.stringify({ project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], runner }))
    config({ commitToLiveBranch: false })
    blocked('live-commit', at('git commit -m x'), LIVE)
    config({ commitToLiveBranch: true })
    assert.doesNotThrow(() => execute('live-commit', at('git commit -m x')), 'el proyecto lo declaró')
  })
})

test('la persona lo habilita nombrando la rama, y «commiteá» a secas no alcanza', () => {
  onMain('cauce-live-chat-', (root) => {
    const chat = chatSession()
    try {
      const call = (says) => says({ cwd: root, tool_input: { command: 'git commit -m "feat: x"' } })
      blocked('live-commit', call(chat.says('commiteá lo que hay')), LIVE)
      blocked('live-commit', call(chat.says('no commitees en main todavía')), LIVE)
      assert.doesNotThrow(() => execute('live-commit', call(chat.says('commiteá en main'))))
    } finally { chat.close() }
  })

  // Sin lista de formas de pedir: alcanza con que la rama esté nombrada, y sólo frena lo que niega o pregunta.
  for (const said of ['hacé el commit directo a main, por favor', 'commit this to main', 'dejalo en main',
    'mandalo a main nomás', '¡eso va a main!']) assert.equal(ordersCommit(said, 'commit main'), true, said)
  for (const said of ['commiteá lo que hay', 'nunca commitees en main', 'a main no', '¿lo commiteo en main?',
    'commiteá en mainline', 'tampoco en main']) assert.equal(ordersCommit(said, 'commit main'), false, said)

  assert.equal(branchAfter('git commit -m x', 'main'), 'main')
  assert.equal(branchAfter('git checkout -b fix/y origin/main && git commit -m x', 'main'), 'fix/y')
})
