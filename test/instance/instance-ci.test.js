'use strict'

// El CI que siembra `init` (caso 231). Lo que se mide: que una instancia sidecar lo reciba y una embedded no
// —ahí el repositorio es el del producto y su CI ya existe—, y que `check` con `--skip-roots` pase sin las
// raíces de al lado nombrando cuáles salteó, mientras que sin la bandera la raíz ausente sigue siendo error, y
// que frene un workflow propio que no compila.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CI = path.join('.github', 'workflows', 'ci.yml')

function instance(mode) {
  const target = path.join(tempRoot(`cauce-ci-${mode}-`), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', mode, '--no-install']).status, 0)
  return target
}

test('una instancia sidecar recibe su CI, que corre check sin las raíces', () => {
  const ci = fs.readFileSync(path.join(instance('sidecar'), CI), 'utf8')
  assert.match(ci, /node tools\/ops\.js check planning --skip-roots/)
  assert.match(ci, /bash -n/)
})

test('una instancia embedded no recibe CI: el repositorio ya tiene el suyo', () => {
  assert.equal(fs.existsSync(path.join(instance('embedded'), CI)), false)
})

test('una raíz ausente es error, y con --skip-roots es un aviso que la nombra', () => {
  const target = instance('sidecar')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots.push({ name: 'lejana', path: '../../no-clonada' })
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  const planning = path.join(target, 'planning')

  const strict = run(['check', planning])
  assert.notEqual(strict.status, 0)
  assert.match(strict.stderr, /no existe la raíz lejana/)

  const skipping = run(['check', planning, '--skip-roots'])
  assert.equal(skipping.status, 0, skipping.stderr)
  assert.match(skipping.stderr, /--skip-roots: 1 raíz\(ces\) ausente\(s\) sin comprobar \(lejana\)/)
  assert.doesNotMatch(skipping.stderr, /no existe la raíz/)
})

test('check frena un workflow propio que no compila', () => {
  const target = instance('sidecar')
  fs.mkdirSync(path.join(target, 'workflows'))
  fs.writeFileSync(path.join(target, 'workflows', 'roto.js'), "export const meta = {}\nawait agent('x'\n")
  const result = run(['check', path.join(target, 'planning')])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /workflows\/roto\.js: /)
})
