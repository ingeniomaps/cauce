'use strict'

// `ops evidence`: el contraste de la evidencia de una entrada de DONE contra lo que no escribió su
// autor. Lo que se mide acá es la salida del comando —qué veredicto da y qué declara no poder ver—;
// la decisión por rastro vive en `engine/core/evidence.js` y la ejercita `test/wiring/hooks.test.js`.
// Vecino de `evidence.test.js`, que mide el contrato escrito de esa misma entrada: allá qué tiene que
// decir DONE, acá contra qué se puede cruzar lo que dijo.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ENTRADA = `
## Hito primero — Primer resultado

- [x] **alta-de-cliente** (epic: 001) — Alta de cliente
  acept: responde 201
  done: npm test (exit 0)
  qa: probado por el camino real
  tests: C1 → TestAltaResponde201; C2 → prueba de alta; A → TestQueNoExiste
  commit: abc1234 feat(api): alta
`

function instancia(prefijo) {
  const root = tempRoot(prefijo)
  const ops = path.join(root, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'api'), { recursive: true })
  fs.writeFileSync(path.join(root, 'api', 'alta_test.go'), 'func TestAltaResponde201(t *testing.T) {}\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'api', path: '../api' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'DONE.md'), `# Done activo\n${ENTRADA}`)
  return ops
}

test('evidence separa el artefacto que existe del que no y del que no se puede buscar', () => {
  const ops = instancia('cauce-evidence-')
  const result = run(['evidence', path.join(ops, 'planning'), '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.task, 'alta-de-cliente')
  assert.deepEqual(report.traces.map((trace) => trace.verdict), ['encontrado', 'inbuscable', 'ausente'])
  assert.deepEqual(report.runs, [], 'sin corridas de verify todavía')

  const texto = run(['evidence', path.join(ops, 'planning')])
  assert.equal(texto.status, 0, texto.stderr)
  assert.match(texto.stdout, /TestQueNoExiste {2}\[ausente\]/)
  // Un contraste que no dice qué no puede ver se lee como si lo hubiera visto todo.
  assert.match(texto.stdout, /No dice que la prueba nombrada haya corrido/)
  assert.match(texto.stdout, /sin corridas registradas/)
})

test('evidence lee el registro de gates y elige la entrada que se le pide', () => {
  const ops = instancia('cauce-evidence-gates-')
  fs.writeFileSync(path.join(ops, 'planning', '.verify-log'),
    `${JSON.stringify({ at: '2026-09-07T10:00:00Z', gate: 'test', status: 0 })}\n`)
  fs.appendFileSync(path.join(ops, 'planning', 'DONE.md'),
    '\n- [x] **baja-de-cliente** (epic: 001) — Baja\n  tests: C1 → TestBaja\n')

  // Sin `--task` responde por la última entrada, que es la que se acaba de cerrar.
  const ultima = run(['evidence', path.join(ops, 'planning'), '--json'])
  assert.equal(JSON.parse(ultima.stdout).task, 'baja-de-cliente')

  const pedida = run(['evidence', path.join(ops, 'planning'), '--task', 'alta-de-cliente', '--json'])
  const report = JSON.parse(pedida.stdout)
  assert.equal(report.task, 'alta-de-cliente')
  assert.deepEqual(report.runs, [{ at: '2026-09-07T10:00:00Z', gate: 'test', status: 0 }])

  const inexistente = run(['evidence', path.join(ops, 'planning'), '--task', 'no-existe'])
  assert.notEqual(inexistente.status, 0)
  assert.match(inexistente.stderr, /DONE no tiene la entrada no-existe/)
})

test('evidence no afirma ausencia donde no hay dónde mirar', () => {
  const root = tempRoot('cauce-evidence-sinraices-')
  const ops = path.join(root, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ project: 'Demo', mode: 'sidecar' }))
  fs.writeFileSync(path.join(ops, 'planning', 'DONE.md'), `# Done activo\n${ENTRADA}`)
  const result = run(['evidence', path.join(ops, 'planning')])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /el proyecto no declara raíces de código/)
  assert.equal(result.stdout.includes('[ausente]'), false, 'sin raíces, nada se da por ausente')

  // Y una entrada sin nada que rastrear se dice, en vez de salir en blanco.
  fs.writeFileSync(path.join(ops, 'planning', 'DONE.md'),
    '# Done activo\n\n- [x] **sin-rastro** — Algo\n  tests: n/a — no hay superficie ejecutable\n')
  assert.match(run(['evidence', path.join(ops, 'planning')]).stdout, /no rastrea ningún criterio/)
})
