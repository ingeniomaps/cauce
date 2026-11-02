'use strict'

// Un guard que falla en vez de juzgar (caso 467). Por qué sale con 2, en `exitCodeOf`.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { exitCodeOf } = require('../../engine/hooks/run')

const RUN = path.join(__dirname, '..', '..', 'engine', 'hooks', 'run.js')

function instance(name) {
  const root = tempRoot(name)
  fs.mkdirSync(path.join(root, 'planning'))
  const config = { workspaceRoots: [{ name: 'main', path: '.' }] }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  spawnSync('git', ['init', '-q'], { cwd: root })
  return root
}

// Un byte nulo en la ruta del `-C` es un error que ningún guard espera: lo lanza Node al llamar a git.
const hook = (root, names) => spawnSync(process.execPath, [RUN, ...names], {
  input: JSON.stringify({ cwd: root, tool_input: { command: 'git -C /a\u0000b commit -m x' } }),
  encoding: 'utf8', env: { ...process.env, OPS_ROOT: root },
})

test('un guard que lanza en pre-shell frena con 2 y nombra qué guard falló', () => {
  const result = hook(instance('cauce-falla-grupo-'), ['pre-shell'])
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /^BLOQUEADO: /)
  assert.match(result.stderr, /el guard [\w-]+ falló sin llegar a juzgar/)
  assert.match(result.stderr, /null bytes/, 'con el error de verdad')
})

test('un guard suelto de un evento que frena también sale con 2', () => {
  const result = hook(instance('cauce-falla-suelto-'), ['governance'])
  assert.equal(result.status, 2, result.stderr)
})

test('un error en un evento que no puede frenar sigue sin frenar', () => {
  const error = new Error('roto')
  for (const names of [['stop'], ['planning-drift'], ['prompt'], ['chat'], ['prompt-notice'], ['rules-notice']]) {
    assert.equal(exitCodeOf(names, error), 1, `${names} no debe atar la sesión ni tragarse el mensaje`)
  }
})

test('lo que no se declaró exento frena, y un bloqueo sale con 2 en cualquier evento', () => {
  const error = new Error('roto')
  for (const names of [['pre-shell'], ['pre-files'], ['pre-read'], ['pre-mcp'], ['verify'], ['uno-nuevo']]) {
    assert.equal(exitCodeOf(names, error), 2, `${names} no contestó, así que no autoriza`)
  }
  assert.equal(exitCodeOf(['stop'], Object.assign(new Error('x'), { blocked: true })), 2)
})

// Es la salida de cuando no se puede leer la configuración (caso 419): tiene que seguir saliendo en 0.
test('restaurar un ops.config.json ilegible sigue pasando', () => {
  const root = instance('cauce-falla-restaura-')
  fs.writeFileSync(path.join(root, 'ops.config.json'), '{ no es json')
  const result = spawnSync(process.execPath, [RUN, 'pre-shell'], {
    input: JSON.stringify({ cwd: root, tool_input: { command: 'git checkout HEAD -- ops.config.json' } }),
    encoding: 'utf8', env: { ...process.env, OPS_ROOT: root },
  })
  assert.equal(result.status, 0, result.stderr)
})

test('un error que no se puede editar o que no es un Error conserva su mensaje y el guard', () => {
  const { executeAll, guards } = require('../../engine/hooks/run')
  const original = guards.destructive
  try {
    guards.destructive = () => { throw 'texto suelto' }
    assert.throws(() => executeAll(['destructive'], {}), /el guard destructive falló.*texto suelto/)
    guards.destructive = () => { throw Object.freeze(new Error('congelado')) }
    assert.throws(() => executeAll(['destructive'], {}), /el guard destructive falló.*congelado/)
  } finally { guards.destructive = original }
})

test('sin nombres de guard no hay nada exento: frena', () => {
  assert.equal(exitCodeOf([], new Error('roto')), 2)
})
