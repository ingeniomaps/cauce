'use strict'

// Las rutas escribibles de una sola máquina, en `ops.config.local.json` (caso 209). Lo que se mide: que el
// límite de raíces las sume, que `check` las muestre con su origen, que un archivo roto exente menos y nunca
// más, y que de ese archivo no se lea nada que no sea una ruta — el push sigue decidiéndose en el compartido.

const { tempRoot, run } = require('../support/environment')
const { blocked, pushRoot, WORK } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const CP = require('../../engine/config/paths')
const C = require('../../engine/config/validate')

function instance(name, local) {
  const root = tempRoot(name)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    workspaceRoots: [{ name: 'main', path: '.' }], writableOutsideRoots: ['../compartida'],
  }))
  if (local !== undefined) fs.writeFileSync(path.join(root, CP.LOCAL_CONFIG), local)
  return root
}
const write = (root, file) => () => execute('workspace-boundary', { cwd: root, tool_input: { file_path: file } })
const command = (root, line) => () => execute('shell-boundary', { cwd: root, tool_input: { command: line } })

test('una ruta declarada sólo en ops.config.local.json se puede escribir, por herramienta y por comando', () => {
  const root = instance('cauce-local-exenta-', JSON.stringify({ writableOutsideRoots: ['../mia'] }))
  assert.doesNotThrow(write(root, '../mia/nota.md'))
  assert.doesNotThrow(command(root, 'echo x > ../mia/nota.md'))
  assert.doesNotThrow(write(root, '../compartida/nota.md'), 'la del archivo compartido sigue valiendo')
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../otra/nota.md' } }, /fuera de las raíces/)

  assert.deepEqual(CP.writableOutsideRoots(root, JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'))))
    .map((one) => `${one.from}: ${one.declared}`), ['ops.config.json: ../compartida', 'ops.config.local.json: ../mia'])
})

test('sin archivo local, o con uno roto, no se exenta nada más que lo compartido', () => {
  for (const [name, local] of [['ausente', undefined], ['roto', '{mal'], ['lista', '["../mia"]'],
    ['otra-forma', JSON.stringify({ writableOutsideRoots: '../mia' })]]) {
    const root = instance(`cauce-local-${name}-`, local)
    blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../mia/nota.md' } }, /fuera de las raíces/)
    assert.doesNotThrow(write(root, '../compartida/nota.md'), `${name}: lo compartido no depende del local`)
  }
})

test('check avisa lo que el archivo local no puede hacer, sin fallar', () => {
  const at = (local) => C.localConfigWarnings(instance('cauce-local-check-', local))
  assert.deepEqual(at(undefined), [])
  assert.deepEqual(at(JSON.stringify({ writableOutsideRoots: ['../mia'] })), [])
  assert.match(at('{mal').join(), /^ops\.config\.local\.json: no se puede leer .*; sus rutas no cuentan$/)
  assert.deepEqual(at('[]'), ['ops.config.local.json: tiene que ser un objeto con writableOutsideRoots; '
    + 'sus rutas no cuentan'])
  assert.deepEqual(at(JSON.stringify({ writableOutsideRoots: ['', 3] })), [
    'ops.config.local.json: writableOutsideRoots[0] debe ser una ruta no vacía',
    'ops.config.local.json: writableOutsideRoots[1] debe ser una ruta no vacía',
  ])
  assert.deepEqual(at(JSON.stringify({ writableOutsideRoots: [], runner: { allowPush: true } })),
    ['ops.config.local.json: de este archivo sólo se lee writableOutsideRoots; runner no rige acá'])
})

test('check muestra cada ruta exenta con el archivo que la declaró, y avisa el local roto', () => {
  const target = path.join(tempRoot('cauce-local-cli-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.match(fs.readFileSync(path.join(target, '.gitignore'), 'utf8'), /^ops\.config\.local\.json$/m,
    'init lo deja fuera de git')
  const check = () => JSON.parse(run(['check', path.join(target, 'planning'), '--json']).stdout)
  fs.writeFileSync(path.join(target, CP.LOCAL_CONFIG), JSON.stringify({ writableOutsideRoots: ['../mia'] }))
  assert.ok(check().warnings.some((one) => one.startsWith('ops.config.local.json: ../mia está exenta')))
  fs.writeFileSync(path.join(target, CP.LOCAL_CONFIG), '{mal')
  const broken = check()
  assert.equal(broken.ok, true, JSON.stringify(broken.errors))
  assert.ok(broken.warnings.some((one) => /^ops\.config\.local\.json: no se puede leer/.test(one)))
})

test('allowPush en el archivo local no autoriza ningún push', () => {
  const root = pushRoot('cauce-local-push-')
  fs.writeFileSync(path.join(root, CP.LOCAL_CONFIG), JSON.stringify({ runner: { allowPush: true } }))
  blocked('destructive', { cwd: root, tool_input: { command: 'git push origin feat/x' } }, WORK)
})
