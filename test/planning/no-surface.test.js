'use strict'

// La puerta que sostiene `tests: n/a` (caso 189). El recorrido deja cerrar sin pruebas un criterio que
// Verify declara sin superficie ejecutable, y esa palabra la da un modelo que quiere cerrar: lo que la
// vuelve creíble es que `check` mire qué tocó el commit, sin preguntarle a nadie.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// La instancia y el producto en repositorios distintos, que es el layout que `reposFor` recorre: la
// entrada de DONE nombra un sha y no dice de qué repositorio es.
function instancia(prefijo) {
  const base = tempRoot(prefijo)
  const repo = path.join(base, 'producto')
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true })
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-q')
  git('config', 'user.email', 'prueba@ejemplo.invalid')
  git('config', 'user.name', 'Prueba')
  const commit = (files, message) => {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true })
      fs.writeFileSync(path.join(repo, name), text)
    }
    git('add', ...Object.keys(files))
    git('commit', '-qm', message)
    return git('rev-parse', '--short=12', 'HEAD')
  }
  const ops = path.join(base, 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const configPath = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  config.workspaceRoots = [{ name: 'producto', path: '../producto' }]
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const planning = path.join(ops, 'planning')
  const entrada = (slug, tests, sha, fecha = '2026-09-24') => fs.writeFileSync(
    path.join(planning, 'done', `${slug}.md`),
    `- [x] **${slug}** — Decidir\n  acept: queda escrito el destino\n  fecha: ${fecha}\n`
    + '  done: make test (exit 0)\n  qa: el documento existe y nombra las cuatro tablas\n'
    + `  tests: ${tests}\n  commit: ${sha}\n  lane: full\n  review: aprobado\n`)
  const errores = () => {
    const out = run(['check', planning, '--json'])
    return JSON.parse(out.stdout).errors.filter((one) => /n\/a/.test(one))
  }
  return { commit, entrada, errores }
}

test('check rechaza tests: n/a sobre un commit que toca algo que se ejecuta', () => {
  const { commit, entrada, errores } = instancia('cauce-no-surface-')
  const doc = commit({ 'docs/003-legacy.md': '# ADR\n', 'docs/notas.txt': 'x\n' }, 'docs: decide legacy')
  entrada('sin-codigo', 'n/a — el entregable es un ADR, sin superficie ejecutable', `${doc} docs: decide legacy`)
  assert.deepEqual(errores(), [], 'un commit de sólo documentos sostiene el n/a')

  const code = commit({ 'docs/004.md': '# ADR\n', 'api/alta.go': 'package api\n' }, 'feat: alta')
  entrada('con-codigo', 'n/a — es un documento', `${code} feat: alta`)
  const [error, ...resto] = errores()
  assert.deepEqual(resto, [])
  assert.match(error, /con-codigo/)
  assert.match(error, /api\/alta\.go/, 'nombra lo que se ejecuta')
  assert.doesNotMatch(error, /004\.md/, 'y no lo que no')

  // Cerrado por defecto (R27): lo que no está en la lista de no ejecutables es superficie, también lo que
  // no parece código.
  const make = commit({ Makefile: 'test:\n\ttrue\n', 'docs/005.md': '# ADR\n' }, 'build: make')
  entrada('con-codigo', 'n/a — es un documento', `${make} build: make`)
  assert.match(errores()[0] || '', /Makefile/)
})

test('la puerta mira sólo el n/a entero, y calla donde no hay commit que leer', () => {
  const { commit, entrada, errores } = instancia('cauce-no-surface-bordes-')
  const code = commit({ 'api/alta.go': 'package api\n', 'docs/alta.md': '# alta\n' }, 'feat: alta')
  // Una tarea mixta prueba lo que tiene superficie y declara lo que no: el código del commit es el de los
  // criterios que sí tienen prueba.
  entrada('mixta', 'A → TestAlta; n/a — el manual no se ejecuta', `${code} feat: alta`)
  assert.deepEqual(errores(), [])

  entrada('mixta', 'n/a — no produce commit', 'n/a — sólo abrió una fila en HUMAN_ACTIONS')
  assert.deepEqual(errores(), [], 'sin sha no hay diff que juzgar')

  entrada('mixta', 'n/a — es un documento', 'deadbeef1234 docs: un sha que ningún repositorio conoce')
  assert.deepEqual(errores(), [], 'un sha que no se encuentra no se inventa como superficie')

  // Lo cerrado antes de que la regla existiera no la violó: el `upgrade` no pone `check` en rojo.
  entrada('mixta', 'n/a — es un documento', `${code} feat: alta`, '2026-09-23')
  assert.deepEqual(errores(), [], 'una entrada anterior a la regla no se juzga con ella')
  entrada('mixta', 'n/a — es un documento', `${code} feat: alta`)
  assert.match(errores()[0] || '', /api\/alta\.go/, 'la misma, cerrada desde que rige, sí')
})
