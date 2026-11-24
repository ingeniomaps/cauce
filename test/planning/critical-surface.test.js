'use strict'

// Caso 561: el carril contra lo que el diff tocó. Por qué, en `engine/planning/critical-surface.js`.

const { tempRoot, run } = require('../support/environment')
const { git, initRepo } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const TODAY = new Date().toISOString().slice(0, 10)
const entry = (slug, lane, sha, fecha = TODAY) => `- [x] **${slug}** — ${slug}
  acept: algo
  fecha: ${fecha}
  done: hecho
  qa: exit 0
  tests: n/a — razón: la prueba no tiene superficie
  commit: ${sha} ${slug}
  lane: ${lane}
  review: skipped (${lane})
  critique: skipped (${lane})
`

function instance(critical, { merged = false, linked = false } = {}) {
  const base = tempRoot('cauce-critica-')
  const app = path.join(base, 'app')
  fs.mkdirSync(path.join(app, 'db', 'migrations'), { recursive: true })
  initRepo(app)
  fs.writeFileSync(path.join(app, 'readme.md'), 'hola\n')
  fs.mkdirSync(path.join(app, '.github', 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(app, '.github', 'workflows', 'deploy.yml'), 'on: push\n')
  git(['add', '-A'], app)
  git(['commit', '-qm', 'inicio'], app)
  // Con `merged`, la migración entra por un merge sin avance rápido, como un PR.
  if (merged) git(['checkout', '-qb', 'rama'], app)
  fs.writeFileSync(path.join(app, 'db', 'migrations', '001.sql'), 'create table x();\n')
  git(['add', '-A'], app)
  git(['commit', '-qm', 'migración'], app)
  if (merged) {
    git(['checkout', '-q', '-'], app)
    git(['merge', '-q', '--no-ff', '-m', 'merge', 'rama'], app)
  }
  const sha = spawnSync('git', ['-C', app, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'App', '--mode', 'sidecar', '--no-install']).status, 0)
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  // Con `linked`, la raíz llega por un enlace, como el árbol de una línea de trabajo.
  if (linked) fs.symlinkSync(app, path.join(base, 'enlace'))
  config.workspaceRoots = [{ name: 'app', path: linked ? '../enlace' : '../app', ...(critical ? { critical } : {}) }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  return { ops, sha, planning: path.join(ops, 'planning') }
}
const warnings = (planning) => JSON.parse(run(['check', planning, '--json']).stdout).warnings.join('\n')

test('una tarea fuera de full cuyos commits tocan una superficie crítica avisa', () => {
  const { sha, planning } = instance(['db/migrations/**'])
  fs.mkdirSync(path.join(planning, 'done'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'done', 'tareas.md'), entry('alta', 'express', sha)
    + entry('baja', 'full', sha) + entry('vieja', 'express', sha, '2026-01-01')
    + entry('suelta', 'sin clasificar', sha) + entry('revisada', 'lite', sha))
  const said = warnings(planning)
  assert.match(said, /alta: carril express y sus commits tocan db\/migrations\/001\.sql.*nadie revisó el diff/)
  assert.doesNotMatch(said, /baja: carril/, 'en full ya hay quien mira el diff')
  assert.doesNotMatch(said, /vieja: carril/, 'lo cerrado antes de la regla no se juzga')
  assert.doesNotMatch(said, /suelta: carril/, 'sin clasificar corre el carril full')
  assert.match(said, /revisada: carril lite y sus commits tocan db\/migrations\/001\.sql/)
  assert.doesNotMatch(said, /revisada: .*nadie revisó/, 'lite tiene revisor')
})

test('la superficie se ve también por un merge y por una raíz que pasa por un enlace', () => {
  for (const shape of [{ merged: true }, { linked: true }]) {
    const { sha, planning } = instance(['db/migrations/**'], shape)
    fs.mkdirSync(path.join(planning, 'done'), { recursive: true })
    fs.writeFileSync(path.join(planning, 'done', 'tareas.md'), entry('alta', 'express', sha))
    assert.match(warnings(planning), /alta: carril express y sus commits tocan db\/migrations\/001\.sql/,
      JSON.stringify(shape))
  }
})

test('una superficie que no coincide con ningún archivo avisa, y sin declarar no hay nada', () => {
  const { planning } = instance(['payments/**'])
  assert.match(warnings(planning), /app: critical «payments\/\*\*» no coincide con ningún archivo versionado/)
  assert.doesNotMatch(warnings(instance().planning), /critical/)
  // Lo que empieza con punto también es una ruta: `**` no lo salta.
  assert.doesNotMatch(warnings(instance(['**/workflows/**']).planning), /no coincide/)
})

test('un critical que no es texto lo dice check, y una raíz sin repositorio avisa que no se mide', () => {
  for (const bad of [[1], [null]]) {
    const said = JSON.parse(run(['check', instance(bad).planning, '--json']).stdout)
    assert.equal(said.ok, false, JSON.stringify(bad))
    assert.match(said.errors.join('\n'), /critical debe ser una lista de globs/)
  }
  const { ops, planning } = instance(['db/**'])
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  const plain = path.join(path.dirname(ops), 'suelta')
  fs.mkdirSync(plain)
  config.workspaceRoots = [{ name: 'suelta', path: '../suelta', critical: ['db/**'] }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  assert.match(warnings(planning), /suelta: declara critical y no es un repositorio git/)
  // La que no está en esta máquina no se confunde con una que no es repositorio.
  config.workspaceRoots = [{ name: 'lejos', path: '../no-esta', critical: ['db/**'] }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  assert.doesNotMatch(warnings(planning), /lejos: declara critical/)
})

// Lo cerrado hace más de 30 días ya no se mira, y lo adoptado nunca: no lo cerró nadie bajo esta instancia.
test('se juzga sólo lo cerrado en los últimos 30 días, y no lo adoptado', () => {
  const { criticalWarnings } = require('../../engine/planning/critical-surface')
  const { ops, sha } = instance(['db/migrations/**'])
  const one = (fecha, slug = 'alta') => ({ source: 'planning/done/tareas.md', slug, lane: 'express', fecha,
    commit: `${sha} alta` })
  const said = (entries, adopted) => criticalWarnings(ops, entries, '2027-01-30', adopted).join('\n')
  assert.match(said([one('2027-01-15')]), /alta: carril express/)
  assert.doesNotMatch(said([one('2026-12-01')]), /alta: carril/, 'fuera de la ventana')
  assert.doesNotMatch(said([one('2027-01-15')], new Set(['alta'])), /alta: carril/, 'adoptada')
})
