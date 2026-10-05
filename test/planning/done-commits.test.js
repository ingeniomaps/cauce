'use strict'

// El commit que cita una entrada de done/ tiene que existir (caso 243). Lo que se mide: que se avise por
// entrada el sha que su repositorio no tiene —también el de un blob—, que el repositorio nombrado se busque
// dentro de una raíz que no es un repositorio, que lo que no se puede mirar vaya en una sola línea, y que
// `check` lo muestre sin fallar.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const R = require('../../engine/core/repos')
const DC = require('../../engine/planning/done-commits')

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
  { cwd, encoding: 'utf8' })

// Como en una instancia real: la raíz declarada es una carpeta con repositorios adentro, y no es uno.
function instance(name) {
  const base = tempRoot(name)
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const api = path.join(base, 'api')
  fs.mkdirSync(api)
  git(api, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(api, 'archivo.txt'), 'x\n')
  git(api, 'add', 'archivo.txt')
  git(api, 'commit', '-qm', 'base')
  const sha = git(api, 'rev-parse', '--short', 'HEAD').stdout.trim()
  const blob = git(api, 'rev-parse', '--short', 'HEAD:archivo.txt').stdout.trim()
  return { target, sha, blob }
}
const entry = (slug, commit) => ({ slug, source: `done/${slug}.md`, commit })

test('se avisa por entrada el sha que su repositorio no tiene, y sólo ése', () => {
  const { target, sha, blob } = instance('cauce-commits-')
  const warnings = DC.unknownCommitWarnings([
    entry('real', `${sha} feat: algo (api@main)`),
    entry('inventado', 'deadbee feat: algo (api@main)'),
    entry('blob', `${blob} feat: algo (api@main)`),
    entry('varios', `${sha} feat: uno (api@main); deadbee fix: otro (api@main)`),
    entry('sin-commit', 'n/a — no hubo cambio'),
  ], (items) => R.commitStatus(target, items))
  assert.deepEqual(warnings.map((one) => one.split(':')[0]), [
    'done/inventado.md inventado', 'done/blob.md blob', 'done/varios.md varios'])
  assert.match(warnings[0], /el commit deadbee no está en su repositorio/)
})

// Caso 254, del lado de `check`: con una raíz por repositorio, `(api@main)` nombra a la raíz y no a una
// carpeta adentro. Buscando sólo adentro, el commit quedaba «sin comprobar» teniendo el repositorio al lado.
test('un repositorio nombrado como su raíz declarada se encuentra', () => {
  const { target, sha } = instance('cauce-commits-raiz-')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'api', path: '../api' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  const status = R.commitStatus(target, [{ sha, repo: 'api' }, { sha: 'deadbee', repo: 'api' }])
  assert.deepEqual(status, ['found', 'missing'])
})

test('lo que no se puede mirar va en una sola línea, con los repositorios que faltan', () => {
  const { target, sha } = instance('cauce-commits-ausente-')
  const warnings = DC.unknownCommitWarnings([
    entry('real', `${sha} feat: algo (api@main)`),
    entry('otro-repo', 'abc1234 feat: algo (web@main)'),
    entry('otro-mas', 'abc1235 feat: algo (web@main)'),
    entry('sin-nombre', 'abc1236 feat: algo'),
  ], (items) => R.commitStatus(target, items))
  assert.deepEqual(warnings, ['done/: 3 commit(s) no se comprobaron porque su repositorio no está en esta '
    + 'máquina (web, sin repositorio nombrado)'])
})

test('check lo muestra como aviso y sigue en verde', () => {
  const { target } = instance('cauce-commits-check-')
  fs.writeFileSync(path.join(target, 'planning', 'done', 'inventado.md'), '- [x] **inventado** — Algo\n'
    + '  acept: se observa\n  fecha: 2026-10-02\n  done: hecho y `make test` salió 0\n  qa: observado\n'
    + '  tests: n/a — sin superficie\n  commit: deadbee feat: algo (api@main)\n')
  const result = JSON.parse(run(['check', path.join(target, 'planning'), '--json']).stdout)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.ok(result.warnings.some((one) => /inventado: el commit deadbee no está en su repositorio/.test(one)),
    JSON.stringify(result.warnings))
})
