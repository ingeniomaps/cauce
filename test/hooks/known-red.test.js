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
  assert.deepEqual(entries, [{ root: 'app', gate: 'lint', reason: 'ok', expires: '' }])
  assert.deepEqual(errors, [
    'planning/gate-known-red:2: se escribe «<raíz>: <gate> — <motivo> · vence AAAA-MM-DD», y sin esa forma no '
      + 'declara nada',
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

// Caso 560: un rojo declarado vence. Una exención que no vence se pudre, y detrás de un gate declarado un rojo nuevo
// no frena. Renovarla es volver a decidirla, no arrastrarla.
test('un rojo declarado vence: vencido no cuenta y el bloqueo lo nombra, sin fecha avisa', () => {
  const planning = path.join(tempRoot('cauce-rojo-vence-'), 'planning')
  fs.mkdirSync(planning)
  fs.writeFileSync(path.join(planning, KR.FILE), [
    'app: lint — heredado · vence 2026-12-01', 'app: test — suite rota · vence 2026-11-01', 'app: build — sin fecha',
    'app: typecheck — fecha imposible · vence 2026-13-40', 'app: verify — con mayúscula · Vence 2026-12-01', '',
  ].join('\n'))
  const read = KR.readKnownRed(planning, ['app'], '2026-11-24')
  // La de fecha imposible cuenta sin fecha; por qué, en `known-red.js`.
  assert.deepEqual(read.entries.map((one) => [one.gate, one.expires]),
    [['lint', '2026-12-01'], ['build', ''], ['typecheck', ''], ['verify', '2026-12-01']])
  assert.deepEqual(read.expired.map((one) => [one.gate, one.expires]), [['test', '2026-11-01']])
  assert.deepEqual(read.errors, ['planning/gate-known-red:4: «vence 2026-13-40» no es una fecha'])
  // El mismo día del vencimiento todavía cuenta: vence al terminar ese día.
  const lint = (today) => KR.readKnownRed(planning, ['app'], today).entries.some((one) => one.gate === 'lint')
  assert.equal(lint('2026-12-01'), true)
  assert.equal(lint('2026-12-02'), false, 'y al día siguiente ya no')
  fs.writeFileSync(path.join(planning, KR.FILE), 'app: lint — flaky · vence 2026-12-01 (revisar)\n')
  assert.match(KR.readKnownRed(planning, ['app'], '2026-11-24').errors.join('\n'),
    /el vencimiento va al final de la línea/)

  const dir = repo('cauce-rojo-vencido-', 'app: lint — heredado · vence 2020-01-01\napp: test — suite rota\n')
  const message = messageOf('verify', commit(dir))
  assert.match(message, /lint \(exit 1/, 'el vencido vuelve a frenar')
  assert.match(message, /lint estaba declarado en rojo hasta el 2020-01-01/)
  assert.doesNotMatch(message, /test \(exit/, 'el que no tiene fecha todavía no frena')
})

test('check avisa el rojo vencido y el que no tiene fecha', () => {
  const target = path.join(tempRoot('cauce-rojo-check-vence-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const name = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).workspaceRoots[0].name
  fs.writeFileSync(path.join(planning, KR.FILE),
    `${name}: lint — viejo · vence 2020-01-01\n${name}: test — sin fecha\n`)
  const said = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.equal(said.ok, true, JSON.stringify(said.errors))
  const warnings = said.warnings.join('\n')
  assert.match(warnings, new RegExp(`${name} lint venció el 2020-01-01 y vuelve a frenar`))
  assert.match(warnings, new RegExp(`${name} test no dice cuándo vence`))
})
