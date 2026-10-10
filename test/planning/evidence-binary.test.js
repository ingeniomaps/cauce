'use strict'

// `evidence` no lee como texto lo que no puede ser una prueba (caso 361): lo binario y lo enorme. Se mide que
// no lo cargue, que no lo dé por encontrado, que lo cuente, y que lo de siempre se siga encontrando.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const EV = require('../../engine/core/evidence')

function product(prefix) {
  const root = tempRoot(prefix)
  const app = path.join(root, 'app')
  fs.mkdirSync(path.join(app, 'test'), { recursive: true })
  fs.writeFileSync(path.join(app, 'test', 'alta.test.js'), "test('TestAltaDeVerdad', () => {})\n")
  // Un binario que trae el nombre adentro —un compilado, los pesos de un modelo— y un texto de 6 MB.
  fs.writeFileSync(path.join(app, 'modelo.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]),
    Buffer.from('TestEnElBinario')]))
  fs.writeFileSync(path.join(app, 'volcado.sql'), `${'x'.repeat(6 * 1024 * 1024)}\nTestEnElVolcado\n`)
  return { root, app }
}

test('lo binario y lo enorme no se leen ni se dan por encontrados, y se cuentan', () => {
  const { app } = product('cauce-evidence-binario-')
  const loaded = []
  const original = fs.readFileSync
  fs.readFileSync = function (file, ...rest) {
    const out = original.call(this, file, ...rest)
    if (typeof file === 'string' && file.startsWith(app)) loaded.push([path.basename(file), out.length])
    return out
  }
  const stats = {}
  let verdicts
  try {
    verdicts = EV.contrast('C1 → TestAltaDeVerdad; C2 → TestEnElBinario; C3 → TestEnElVolcado; C4 → TestQueNoEsta',
      [app], [], stats).map((trace) => trace.verdict)
  } finally { fs.readFileSync = original }
  assert.deepEqual(verdicts, ['encontrado', 'ausente', 'ausente', 'ausente'])
  assert.deepEqual(stats.skipped, { binary: 1, large: 1 })
  assert.ok(!loaded.some(([name]) => name === 'volcado.sql'), 'el archivo enorme no se carga en memoria')
  assert.ok(loaded.every(([, size]) => size < 1024 * 1024), `nada grande se cargó: ${JSON.stringify(loaded)}`)
})

test('ops evidence dice cuánto dejó sin leer, y calla cuando leyó todo', () => {
  const { root } = product('cauce-evidence-binario-cli-')
  const ops = path.join(root, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'app', path: '../app' }] }))
  const entry = (tests) => fs.writeFileSync(path.join(ops, 'planning', 'done', 'alta.md'),
    `\n## Hito uno — Uno\n\n- [x] **alta** — Alta\n  acept: responde\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n`
    + `  qa: probado\n  tests: ${tests}\n  commit: n/a — sin commit\n`)
  entry('C1 → TestQueNoEsta')
  const out = run(['evidence', path.join(ops, 'planning'), '--task', 'alta'])
  assert.match(out.stdout, /\[ausente\]/)
  assert.match(out.stdout, /2 archivo\(s\) no se leyeron: 1 binario\(s\) y 1 de más de 5 MB/)
  assert.deepEqual(JSON.parse(run(['evidence', path.join(ops, 'planning'), '--task', 'alta', '--json']).stdout).skipped,
    { binary: 1, large: 1 })

  // Encontrada antes de llegar a ellos, no hay nada que avisar: no se saltearon, no se miraron.
  fs.unlinkSync(path.join(root, 'app', 'modelo.bin'))
  fs.unlinkSync(path.join(root, 'app', 'volcado.sql'))
  assert.doesNotMatch(run(['evidence', path.join(ops, 'planning'), '--task', 'alta']).stdout, /no se leyeron/)
})

// Lo mismo cuando lo que se lee es el commit que la entrada cita: ahí también hay binarios y volcados.
test('en el commit citado tampoco se lee lo binario ni lo enorme', () => {
  const { spawnSync } = require('node:child_process')
  const R = require('../../engine/core/repos')
  const { root, app } = product('cauce-evidence-binario-commit-')
  const ops = path.join(root, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'app', path: '../app' }] }))
  const git = (...args) => {
    const out = spawnSync('git', ['-C', app, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('add', 'test/alta.test.js', 'modelo.bin', 'volcado.sql')
  git('commit', '-qm', 'todo junto')
  const sha = git('rev-parse', '--short', 'HEAD')
  // Fuera del disco, para que sólo el commit pueda contestar.
  for (const file of ['test/alta.test.js', 'modelo.bin', 'volcado.sql']) fs.unlinkSync(path.join(app, file))

  const stats = {}
  const tests = 'C1 → TestAltaDeVerdad; C2 → TestEnElBinario; C3 → TestEnElVolcado'
  const sources = R.commitSources(ops, [{ sha }], [], stats)
  const traces = EV.contrastCommits(tests, EV.contrast(tests, [app], []), sources)
  assert.deepEqual(traces.map((trace) => trace.verdict), ['encontrado', 'ausente', 'ausente'])
  assert.deepEqual(stats.skipped, { binary: 1, large: 1 })
})
