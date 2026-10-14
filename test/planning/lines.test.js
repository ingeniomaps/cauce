'use strict'

// Dos líneas de trabajo sobre la misma instancia (caso 239). Lo que se mide: que cada árbol vea sólo los hitos
// de su línea —la de su rama `line/<nombre>`— y el principal sólo los que no son de ninguna; que `claim` conteste
// lo mismo que `context`; que lo que ya tenés no se esconda; que un reclamo hecho en otro worktree se vea y frene;
// y que `check` rechace una línea mal escrita.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const LN = require('../../engine/planning/lines')

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
const hito = (slug, task, line) => `---\norder: 10\n${line ? `line: ${line}\n` : ''}---\n\n`
  + `## Hito ${slug} — ${slug}\n\n- [ ] **${task}** — Algo. _Aceptación: se ve._ (service: app)\n`

// Una instancia con un hito sin línea y uno de `admin`, y dos árboles más: la línea y una rama cualquiera.
function instance() {
  const base = tempRoot('cauce-lineas-')
  const ops = path.join(base, 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.mkdirSync(path.join(ops, 'planning', 'backlog'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'auth.md'), hito('auth', 'auth-token', ''))
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'admin'))
  git(ops, 'init', '-q', '-b', 'main')
  // El `.gitignore` del molde va en la base: `wip/` es local, y sin él contaría como cambio sin commitear.
  git(ops, 'add', 'planning', 'ops.config.json', '.gitignore')
  git(ops, 'commit', '-qm', 'base')
  const line = path.join(base, 'demo-ops-admin')
  git(ops, 'worktree', 'add', '-q', '-b', 'line/admin', line)
  const other = path.join(base, 'demo-ops-otra')
  git(ops, 'worktree', 'add', '-q', '-b', 'feat/otra', other)
  return { main: path.join(ops, 'planning'), line: path.join(line, 'planning'), other: path.join(other, 'planning') }
}
const context = (planning, runner, ...args) => {
  const result = run(['context', planning, '--json', ...args], undefined, { CAUCE_RUNNER: runner, CAUCE_OWNER: runner })
  return { ...result, json: result.status === 0 ? JSON.parse(result.stdout) : null }
}
const claim = (planning, runner, slug) => run(['claim', planning, slug], undefined,
  { CAUCE_RUNNER: runner, CAUCE_OWNER: runner })

test('cada árbol ve los hitos de su línea, y context y claim contestan lo mismo', () => {
  const trees = instance()
  const main = context(trees.main, 'r-main').json
  assert.equal(main.task.slug, 'auth-token')
  assert.equal(main.line, '')
  assert.deepEqual(main.otherLines, ['admin'])

  const line = context(trees.line, 'r-line').json
  assert.equal(line.task.slug, 'admin-consulta')
  assert.equal(line.line, 'admin')
  assert.deepEqual(line.otherLines, ['auth'])

  const refused = claim(trees.line, 'r-line', 'auth-token')
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /auth-token no es de ninguna línea: se toma desde el árbol principal/)
  assert.match(claim(trees.main, 'r-main', 'admin-consulta').stderr, /es de la línea admin/)
  assert.match(context(trees.line, 'r-line', '--hito', 'auth').stderr, /el hito auth no es de ninguna línea/)
})

test('un reclamo hecho en otro árbol se ve y frena', () => {
  const trees = instance()
  assert.equal(claim(trees.main, 'r-main', 'auth-token').status, 0)
  const other = context(trees.other, 'r-otra').json
  assert.equal(other.task, null, 'la única tarea de su cola está tomada en otro árbol')
  assert.deepEqual(other.taken.map((one) => one.slug), ['auth-token'])
  const refused = claim(trees.other, 'r-otra', 'auth-token')
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /desde otro árbol de la instancia/)
})

test('lo que ya tenés no se esconde aunque su hito pase a ser de otra línea', () => {
  const trees = instance()
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  fs.writeFileSync(path.join(trees.line, 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'otra'))
  const line = context(trees.line, 'r-line').json
  assert.equal(line.task.slug, 'admin-consulta')
  assert.equal(line.claimed, true)
})

test('check rechaza una línea mal escrita, y la unidad no toca lo que no declara línea', () => {
  const trees = instance()
  fs.writeFileSync(path.join(trees.main, 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'Admin Nueva'))
  const result = run(['check', trees.main])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /backlog\/admin\.md: line «Admin Nueva» no es un nombre de línea/)
  const milestones = [{ slug: 'a', line: '', tasks: [] }, { slug: 'b', line: 'x', tasks: [] }]
  assert.deepEqual(LN.scope(milestones, '').milestones.map((one) => one.slug), ['a'])
  const loose = tempRoot('cauce-sin-git-')
  assert.equal(LN.currentLine(loose), '', 'fuera de git no hay línea')
  assert.deepEqual(LN.worktrees(loose), [], 'ni árboles')
})

// `ops lines`: el estado de todas las líneas desde cualquier árbol. Lo que se mide: que aparezcan todos los
// worktrees de la instancia y no sólo el propio; que cada uno muestre la cola de su línea y no la ajena; que
// un reclamo y un checkpoint hechos en una línea se vean en su bloque y en ningún otro; y que los commits
// adelante y lo que falta commitear salgan de cada árbol.
const checkpoint = (planning, hito, line) => {
  fs.mkdirSync(path.join(planning, 'checkpoints'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'checkpoints', `${hito}.md`),
    `---\nstatus: pendiente\nhito: ${hito}\nline: ${line}\n---\n\n# Checkpoint: hito ${hito}\n`)
}

test('lines muestra cada árbol con la cola, los reclamos y el checkpoint de su línea', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  checkpoint(trees.line, 'admin', 'admin')
  // El mismo checkpoint en el principal, como queda después de juntar: ahí es donde se ve que frena sólo a su línea.
  checkpoint(trees.main, 'admin', 'admin')
  git(ops.line, 'add', 'planning')
  git(ops.line, 'commit', '-qm', 'claim')
  fs.writeFileSync(path.join(trees.line, 'suelto.md'), 'sin commitear\n')
  fs.mkdirSync(path.join(trees.line, 'wip'), { recursive: true })
  fs.writeFileSync(path.join(trees.line, 'wip', 'r-line.md'),
    '---\ntask: admin-consulta\nphase: Build\nservice: app\n---\n\n## Plan aprobado\n\n1. [ ] escribir\n')
  // Un árbol en una rama que nunca trajo el planning: se lista igual, y dice que ahí no hay nada que leer.
  const bare = path.join(path.dirname(ops.main), 'demo-ops-vacia')
  git(ops.main, 'worktree', 'add', '-q', '-b', 'feat/vacia', bare)
  git(bare, 'rm', '-rq', 'planning')
  git(bare, 'commit', '-qm', 'sin planning')

  const result = run(['lines', ops.main, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.base, 'main')
  const by = Object.fromEntries(report.trees.map((one) => [one.branch, one]))
  assert.deepEqual(Object.keys(by).sort(), ['feat/otra', 'feat/vacia', 'line/admin', 'main'],
    'todos los árboles, no sólo el propio')
  assert.equal(by['feat/vacia'].planning, false)
  assert.deepEqual(by['feat/vacia'].milestones, [])

  assert.equal(by.main.line, '')
  assert.deepEqual(by.main.milestones.map((one) => one.slug), ['auth'], 'el principal ve sólo lo que no es de nadie')
  assert.deepEqual(by.main.claims, [], 'el reclamo de la línea no es del principal')
  assert.deepEqual(by.main.checkpoints, [], 'y el checkpoint de admin no lo frena aunque esté en su disco')
  assert.equal(by.main.current, true)

  assert.equal(by['line/admin'].line, 'admin')
  assert.deepEqual(by['line/admin'].milestones.map((one) => one.slug), ['admin'])
  assert.deepEqual(by['line/admin'].claims.map((one) => one.slug), ['admin-consulta'])
  assert.deepEqual(by['line/admin'].checkpoints, ['checkpoints/admin.md'])
  assert.equal(by['line/admin'].ahead, 1)
  assert.equal(by['line/admin'].behind, 0)
  assert.equal(by['line/admin'].dirty, 1, 'lo que falta commitear se cuenta en su árbol')
  assert.equal(by['line/admin'].current, false)

  assert.equal(by['feat/otra'].line, '', 'una rama que no es line/ cuenta como principal')
  assert.deepEqual(by['feat/otra'].milestones.map((one) => one.slug), ['auth'])

  const text = run(['lines', ops.line])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /base: main/)
  assert.match(text.stdout, /admin .*line\/admin.*\+1/)
  assert.match(text.stdout, /sin commitear/)
  assert.match(text.stdout, /en vuelo: admin-consulta \[Build\] r-line/)
  assert.match(text.stdout, /sin planning en este árbol/)
})

test('lines se niega fuera de git y sobre lo que no es una raíz ops', () => {
  const loose = tempRoot('cauce-lines-sin-git-')
  assert.notEqual(run(['lines', loose]).status, 0)
  const ops = path.join(loose, 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const result = run(['lines', ops])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /no está en un repositorio git/)
})
