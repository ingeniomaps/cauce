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
  git(ops, 'add', 'planning', 'ops.config.json')
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
  assert.equal(LN.currentLine(tempRoot('cauce-sin-git-')), '', 'fuera de git no hay línea')
})
