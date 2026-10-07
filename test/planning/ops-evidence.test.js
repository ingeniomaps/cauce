'use strict'

// `ops evidence`: el contraste de la evidencia de una entrada de DONE contra lo que no escribió su
// autor. Lo que se mide acá es la salida del comando —qué veredicto da y qué declara no poder ver—;
// la decisión por rastro vive en `engine/core/evidence.js` y la ejercita `test/hooks/verify.test.js`.
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
  fecha: 2026-09-08
  done: npm test (exit 0)
  qa: probado por el camino real
  tests: C1 → TestAltaResponde201; C2 → prueba de alta; A → TestQueNoExiste
  commit: abc1234 feat(api): alta
`

function instancia(prefijo) {
  const root = tempRoot(prefijo)
  const ops = path.join(root, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.mkdirSync(path.join(root, 'api'), { recursive: true })
  fs.writeFileSync(path.join(root, 'api', 'alta_test.go'), 'func TestAltaResponde201(t *testing.T) {}\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'api', path: '../api' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'alta-de-cliente.md'), ENTRADA)
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
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'baja-de-cliente.md'),
    '- [x] **baja-de-cliente** (epic: 001) — Baja\n  fecha: 2026-09-09\n  tests: C1 → TestBaja\n')

  // Sin `--task` responde por la más reciente. Qué la decide —la fecha, no la posición— lo prueba
  // `done.test.js`, donde las dos se contradicen; acá sólo se comprueba que elija sin que se le pida.
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
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ project: 'Demo', mode: 'sidecar' }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'alta-de-cliente.md'), ENTRADA)
  const result = run(['evidence', path.join(ops, 'planning')])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /el proyecto no declara raíces de código/)
  assert.equal(result.stdout.includes('[ausente]'), false, 'sin raíces, nada se da por ausente')

  // Y una entrada sin nada que rastrear se dice, en vez de salir en blanco.
  fs.rmSync(path.join(ops, 'planning', 'done', 'alta-de-cliente.md'))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'sin-rastro.md'),
    '- [x] **sin-rastro** — Algo\n  tests: n/a — no hay superficie ejecutable\n')
  assert.match(run(['evidence', path.join(ops, 'planning')]).stdout, /no rastrea ningún criterio/)
})

// Caso 316. La traza que escribe una corrida trae el archivo y el nombre del caso, y son dos cosas que se
// pueden buscar. Va cada forma con su veredicto. Lo que importa son los dos errores: que una prueba que no
// existe salga `encontrado`, y que una traza que dice la verdad salga `parcial` o `ausente`.
test('una traza con archivo y nombre de caso se contrasta por sus partes', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('cauce-evidence-partes-')
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  write('app/test/suma.test.js', "describe('suma', () => {\n  test('la suma de dos numeros', () => {})\n})\n")
  // El mismo nombre de archivo en otra carpeta, sin el caso: no alcanza con que alguno se llame igual.
  write('app/otra/suma.test.js', "test('otra cosa', () => {})\n")
  write('app/packages/@acme/api/alta.spec.ts', "it('da de alta', () => {})\n")
  write('lib/resta_test.go', 'func TestResta(t *testing.T) {}\n')
  const roots = [path.join(root, 'app'), path.join(root, 'lib')]
  const one = (artifact) => EV.contrast(`A → ${artifact}`, roots)[0]

  for (const [artifact, expected] of [
    ["app/test/suma.test.js — 'la suma de dos numeros'", 'encontrado'],
    ['app/test/suma.test.js › la suma de dos numeros', 'encontrado'],
    ['app/test/suma.test.js › describe suma › it la suma de dos numeros', 'encontrado'],
    ['app/test/suma.test.js > suma > la suma de dos numeros', 'encontrado'],
    ['app/test/suma.test.js:2:3 — "la suma de dos numeros"', 'encontrado'],
    ['app/test/suma.test.js#L2, `la suma de dos numeros`', 'encontrado'],
    ['`./test/suma.test.js`: `la suma de dos numeros`', 'encontrado'],
    ["app\\test\\suma.test.js — 'la suma de dos numeros'", 'encontrado'],
    ["packages/@acme/api/alta.spec.ts — 'da de alta'", 'encontrado'],
    // Sin barra, cuenta como archivo el que existe con ese nombre; y la segunda raíz también se recorre.
    ["resta_test.go — 'TestResta'", 'encontrado'],
    // Varios archivos: cada caso tiene que estar en alguno de los que la traza nombra.
    ["app/test/suma.test.js y app/otra/suma.test.js — 'la suma de dos numeros' y 'otra cosa'", 'encontrado'],
    // Lo que no viene entre comillas ni con › no se toma por caso: es el comando, o una nota.
    ['node --test app/test/suma.test.js', 'encontrado'],
    ['la suma de dos numeros (app/test/suma.test.js)', 'encontrado'],
    ['test/suma.test.js (nueva)', 'encontrado'],
    // El archivo está y el caso no: ni con comillas, ni anidado, ni en el archivo de al lado.
    ["app/test/suma.test.js — 'un caso que no existe'", 'parcial'],
    ['app/test/suma.test.js › suma › un caso que no existe', 'parcial'],
    ["app/otra/suma.test.js — 'la suma de dos numeros'", 'parcial'],
    ["app/test/suma.test.js — 'la suma de dos numeros' y 'otra cosa'", 'parcial'],
    ["app/test/suma.test.js:2 — 'un caso que no existe'", 'parcial'],
    ["app/test/suma.test.js — '123'", 'parcial'],
    // Cada forma de escribir la ruta se reconoce como archivo: con el caso mal, es `parcial` y no `ausente`.
    ["resta_test.go — 'no existe'", 'parcial'],
    ['app/test/suma.test.js:2:3 — "no existe"', 'parcial'],
    ["app/test/suma.test.js#L2, 'no existe'", 'parcial'],
    ["`./test/suma.test.js`: 'no existe'", 'parcial'],
    ["app\\test\\suma.test.js — 'no existe'", 'parcial'],
    ['app/test/suma.test.js > suma > no existe', 'parcial'],
    // El caso está y el archivo no, o está en una carpeta que no es la que la traza dice.
    ["app/test/no-existe.test.js — 'la suma de dos numeros'", 'ausente'],
    ["carpeta/test/suma.test.js — 'la suma de dos numeros'", 'ausente'],
    ["app/test/suma.test.js y app/test/falta.test.js — 'la suma de dos numeros'", 'ausente'],
    // La ruta se compara por dónde termina y por carpetas enteras, no por si aparece adentro de otra.
    ["test/suma.te — 'la suma de dos numeros'", 'ausente'],
    ["st/suma.test.js — 'la suma de dos numeros'", 'ausente'],
    // Sin archivo, lo entrecomillado se busca en todo el árbol; una frase suelta no.
    ["'la suma de dos numeros'", 'encontrado'],
    ["no-existe.test.js — 'la suma de dos numeros'", 'encontrado'],
    ["'un caso que no existe'", 'ausente'],
    ["'la suma de dos numeros' y 'un caso que no existe'", 'ausente'],
    ['la suma de dos numeros', 'inbuscable'],
    ['corre en node.js sin errores', 'inbuscable'],
    ['npm test', 'inbuscable'],
    ["'a' y 'b'", 'inbuscable'],
  ]) assert.equal(one(artifact).verdict, expected, artifact)
  // Lo que ya se buscaba se busca igual: una sola palabra, en la ruta o en el contenido.
  assert.equal(one('app/test/suma.test.js').verdict, 'encontrado')
  assert.equal(one('suma.test.js').verdict, 'encontrado')
  assert.equal(one('TestQueNoExiste').verdict, 'ausente')
  assert.equal(EV.contrast("A → app/test/suma.test.js — 'la suma de dos numeros'", [])[0].verdict, 'inbuscable')
  // Las partes viajan, para que quien lee sepa qué se buscó y qué faltó.
  const partial = one("app/test/suma.test.js › suma › 'no existe' y 'tampoco'")
  assert.deepEqual([partial.files, partial.names, partial.missing],
    [['app/test/suma.test.js'], ['no existe', 'tampoco'], ['no existe', 'tampoco']])
  assert.deepEqual(one('app/test/suma.test.js › suma › falta uno').missing, ['falta uno'])
})

// La raíz por defecto de una instancia contiene su propio `planning/`. Sin sacarlo del recorrido, la entrada
// se encontraba a sí misma: una prueba inventada salía `encontrado` porque su nombre estaba, en la entrada.
test('evidence no encuentra en planning lo que la propia entrada escribió', () => {
  const root = tempRoot('cauce-evidence-propia-')
  fs.mkdirSync(path.join(root, 'planning', 'done'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src', 'test'), { recursive: true })
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(root, 'src', 'test', 'suma.test.js'), "test('la suma de dos numeros', () => {})\n")
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  fs.writeFileSync(path.join(root, 'planning', 'done', 'suma.md'), '- [x] **suma** — Suma\n  fecha: 2026-10-07\n'
    + "  tests: C1 → 'un caso que no existe en ningun lado'; C2 → TestInventadoXyz; "
    + "C3 → src/test/suma.test.js — 'la suma de dos numeros';"
    + "C4 → src/test/suma.test.js — 'la suma de dos numeros', 'otro' y 'más'; "
    + 'C5 → node --test src/test/suma.test.js\n')
  const text = run(['evidence', path.join(root, 'planning')])
  assert.match(text.stdout, /'un caso que no existe en ningun lado' {2}\[ausente\]\n/)
  assert.match(text.stdout, /TestInventadoXyz {2}\[ausente\]\n/)
  assert.match(text.stdout, /'la suma de dos numeros' {2}\[encontrado\]\n/)
  assert.match(text.stdout, /'otro' y 'más' {2}\[parcial\] — el archivo existe; no aparece en él: otro, más\n/)
  assert.match(text.stdout, /suma\.test\.js {2}\[encontrado\] — se comprobó el archivo; el caso no viene entre/)
})
