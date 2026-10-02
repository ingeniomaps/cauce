'use strict'

// El rojo que ya estaba, declarado por raíz y gate (caso 241). Lo que se mide: que un gate declarado falle sin
// frenar el commit, que uno que no está declarado siga frenando, que una declaración mal escrita sea error y no
// una exención silenciosa, y que `check` liste cada una mientras exista.

const { tempRoot, run } = require('../support/environment')
const { git, initRepo, messageOf } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const KR = require('../../engine/core/known-red')

function repo(name, declared) {
  const dir = tempRoot(name)
  initRepo(dir)
  fs.mkdirSync(path.join(dir, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'planning/.verify-log\n')
  fs.writeFileSync(path.join(dir, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'app', path: '.' }], runner: { allowPush: false } }))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'exit 1', lint: 'exit 1' } }))
  fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1\n')
  if (declared) fs.writeFileSync(path.join(dir, 'planning', 'gate-known-red'), declared)
  git(['add', '-A'], dir)
  return dir
}
const commit = (dir) => ({ cwd: dir, tool_input: { command: 'git commit -m x' } })

test('un gate declarado en rojo no frena, y uno que no está declarado sí', () => {
  const both = repo('cauce-rojo-ambos-', 'app: lint — once errores heredados\napp: test — suite rota en pagos\n')
  assert.doesNotThrow(() => execute('verify', commit(both)))
  const onlyLint = repo('cauce-rojo-lint-', '# heredado\napp: lint — once errores heredados\n')
  const message = messageOf('verify', commit(onlyLint))
  assert.match(message, /Verify falló en .*: test \(exit 1/)
  assert.doesNotMatch(message, /lint \(exit/, 'el declarado no aparece entre los que frenan')
  const other = repo('cauce-rojo-otra-raiz-', 'api: lint — de otra raíz\n')
  assert.match(messageOf('verify', commit(other)), /lint \(exit 1/, 'declarado para otra raíz no vale acá')
})

test('una declaración mal escrita es error, y no una exención silenciosa', () => {
  const planning = path.join(tempRoot('cauce-rojo-lectura-'), 'planning')
  fs.mkdirSync(planning)
  fs.writeFileSync(path.join(planning, KR.FILE), [
    'app: lint — ok', 'app: lint', 'app: tests — gate que no existe', 'web: lint — raíz que no existe', '',
  ].join('\n'))
  const { entries, errors } = KR.readKnownRed(planning, ['app'])
  assert.deepEqual(entries, [{ root: 'app', gate: 'lint', reason: 'ok' }])
  assert.deepEqual(errors, [
    'planning/gate-known-red:2: se escribe «<raíz>: <gate> — <motivo>», y sin esa forma no declara nada',
    `planning/gate-known-red:3: el gate «tests» no existe; son ${KR.GATES.join(', ')}`,
    'planning/gate-known-red:4: la raíz «web» no está en workspaceRoots',
  ])
})

test('check lista cada rojo declarado mientras exista, y falla con uno mal escrito', () => {
  const target = path.join(tempRoot('cauce-rojo-check-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const name = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).workspaceRoots[0].name
  fs.writeFileSync(path.join(planning, KR.FILE), `${name}: lint — once errores heredados\n`)
  const ok = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.equal(ok.ok, true, JSON.stringify(ok.errors))
  assert.ok(ok.warnings.includes(`planning/gate-known-red: ${name} lint está en rojo declarado y no frena el `
    + 'commit (once errores heredados)'), JSON.stringify(ok.warnings))
  fs.writeFileSync(path.join(planning, KR.FILE), `${name}: lint\n`)
  assert.equal(JSON.parse(run(['check', planning, '--json']).stdout).ok, false)
})
