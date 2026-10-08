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
    ['`la suma de dos numeros`', 'encontrado'],
    ['`un caso que no existe`', 'ausente'],
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
  const partial = one("app/test/suma.test.js — 'la suma de dos numeros', 'no existe' y 'tampoco'")
  assert.deepEqual([partial.files, partial.names, partial.missing],
    [['app/test/suma.test.js'], ['la suma de dos numeros', 'no existe', 'tampoco'], ['no existe', 'tampoco']])
  assert.deepEqual(one('app/test/suma.test.js › suma › falta uno').missing, ['falta uno'])
})

// Caso 330. Una corrida real nombra la prueba y sigue en prosa, con código entre backticks y salidas entre
// comillas. Decide la prueba —el último tramo, o lo primero entre comillas—, y lo demás que la traza cite se
// dice al lado si no aparece. Las formas son las de dos entradas de una instancia, con los nombres cambiados,
// más las que dos revisiones encontraron mal leídas. Cada fila: la traza, el veredicto, la prueba que se
// buscó, y lo que faltó (en `parcial`) o lo citado que no apareció (en `encontrado`).
test('decide la prueba que la traza nombra, y lo demás que cite se dice al lado', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('cauce-evidence-prosa-')
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  write('api/src/pedidos/pedidos.service.spec.ts', "describe('PedidosService.list', () => {\n"
    + "  it('summary y args salen del pedido', () => {})\n  it('toolName es el name de su pedido', () => {})\n"
    + "  it('crea', () => {})\n  it('renderiza `toolName` bien', () => {})\n})\n")
  write('api/test/core.describe.ts', "it('el listado trae la acción y no cruza cuentas', async () => {})\n")
  write('api/test/api.e2e-spec.ts', "import './core.describe'\n")
  const one = (artifact) => EV.contrast(`A → ${artifact}`, [root])[0]
  const F = 'src/pedidos/pedidos.service.spec.ts'
  const LIST = 'PedidosService.list'
  const SUMMARY = 'summary y args salen del pedido'
  const LISTING = 'el listado trae la acción y no cruza cuentas'

  for (const [artifact, verdict, names, rest = []] of [
    // La prueba existe: lo que sigue es aclaración, y lo que cite sin estar se dice al lado.
    [`${F} › ${LIST} › '${SUMMARY}`, 'encontrado', [SUMMARY]],
    [`${F} › ${LIST} › 'toolName es el name de su pedido' (d1→t1, en orden) — criterio: (2) \`toolName\``,
      'encontrado',
      ['toolName es el name de su pedido']],
    [`test/core.describe.ts › «${LISTING}», pendiente de CI y no verde: sólo en CI`, 'encontrado', [LISTING]],
    [`api/test/core.describe.ts › “${LISTING}”: \`expect(a).toEqual({ b: 1 })\``, 'encontrado', [LISTING],
      ['expect(a).toEqual({ b: 1 })']],
    [`${F} › ${LIST}, mutación corrida en copia: C1 falla con \`Expected: "80" / Received: null\``,
      'encontrado', [LIST],
      ['Expected: "80" / Received: null']],
    [`${F} › describe ${LIST} — nota (detalle)`, 'encontrado', [LIST]],
    [`${F} › ${LIST} (los dos casos)`, 'encontrado', [LIST]],
    [`${F} › **${LIST}** › \`${SUMMARY}\``, 'encontrado', [SUMMARY]],
    [`${F} › ${LIST} › 'renderiza \`toolName\` bien'`, 'encontrado', ['renderiza `toolName` bien']],
    // Un nombre entre comillas va entero, también con un paréntesis o una raya adentro.
    [`${F} › ${LIST} › 'crea (paginada) — bien'`, 'parcial', ['crea (paginada) — bien'], ['crea (paginada) — bien']],
    [`${F} › ${LIST} › 'crea' — pasa (antes: «TypeError: x is not a function»)`, 'encontrado', ['crea'],
      ['TypeError: x is not a function']],
    [`${F} › ${LIST} › 'crea' — falla con "Cannot read properties"`,
      'encontrado', ['crea'], ['Cannot read properties']],
    [`${F} — '${SUMMARY}' más 'un caso inventado'`, 'encontrado', [SUMMARY], ['un caso inventado']],
    [`${F} › OtroDescribe › 'crea'`, 'encontrado', ['crea'], ['OtroDescribe']],
    [`${F} › ${LIST}: nota sin comillas`, 'encontrado', [LIST]],
    [`${F} — \`crea\` y \`inventado\``, 'encontrado', [], ['inventado']],
    // Lo que acompaña al archivo, o va delante del nombre en su tramo, no es la prueba.
    [`npx jest ${F} › ${LIST} › 'crea'`, 'encontrado', ['crea']],
    [`${F} (nuevo) › ${LIST} › 'crea'`, 'encontrado', ['crea']],
    [`${F} › ${LIST} › caso 'crea'`, 'encontrado', ['crea']],
    [`${F} › ${LIST} › nuevo: 'crea'`, 'encontrado', ['crea']],
    [`${F} › describe("${LIST}") › it("crea")`, 'encontrado', ['crea']],
    [`${F} › ${LIST} > 'crea'`, 'encontrado', ['crea']],
    // Un separador adentro de las comillas es parte del nombre.
    [`${F} > ${LIST} > "toolName es el name de su pedido"`, 'encontrado', ['toolName es el name de su pedido']],
    [`${F} > ${LIST} > "un caso > 0 inventado"`, 'parcial', ['un caso > 0 inventado'], ['un caso > 0 inventado']],
    // `>` en una aclaración es «mayor que», no un tramo.
    [`${F} '${SUMMARY}' — con x > 3 falla`, 'encontrado', [SUMMARY]],
    // La que empieza en prosa nombra un archivo: lo que cita se dice, y no decide.
    ['mutación observada en la copia: api/test/core.describe.ts:728 «expected 200 "OK", got 404 "Not Found"», exit 1',
      'encontrado', [], ['expected 200 "OK", got 404 "Not Found"']],
    ['api/test/api.e2e-spec.ts importa (línea 1) e invoca api/test/core.describe.ts, donde viven los casos',
      'encontrado', []],
    // Y la prueba que no existe no pasa por buena, la escriba como la escriba.
    ['test/core.describe.ts › «un caso que no existe»: `expect(x).toBe(1)`', 'parcial', ['un caso que no existe'],
      ['un caso que no existe']],
    [`${F} › ${LIST} › 'un caso inventado' (nota)`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`${F} › ${LIST}: 'un caso inventado'`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`${F} › OtroService.list, nota`, 'parcial', ['OtroService.list'], ['OtroService.list']],
    [`${F} › describe: ServicioInventado`, 'parcial', ['ServicioInventado'], ['ServicioInventado']],
    [`${F} › C1: caso inventado`, 'parcial', ['C1: caso inventado'], ['C1: caso inventado']],
    [`${F} › ${LIST} › 'xy'`, 'parcial', ['xy'], ['xy']],
    ['test/core.describe.ts — «un caso que no existe», pendiente', 'parcial', ['un caso que no existe'],
      ['un caso que no existe']],
    ['«un caso que no existe» en test/core.describe.ts',
      'parcial', ['un caso que no existe'], ['un caso que no existe']],
    [`${F} -t "un caso inventado"`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`${F} › caso “un caso inventado”`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`${F} — caso 'un caso inventado'`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`* ${F} — 'un caso inventado'`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    [`${F} — suite > un caso inventado`, 'parcial', ['un caso inventado'], ['un caso inventado']],
    // Sólo código, y nada de él en el archivo: era lo único que la traza daba para buscar.
    [`${F} — \`un caso inventado\``, 'parcial', [], ['un caso inventado']],
  ]) {
    const got = one(artifact)
    assert.deepEqual([got.verdict, got.names, got.missing || got.absent], [verdict, names, rest], artifact)
  }
})

// Caso 331. La traza que arma el recorrido tiene una forma fija y se lee tal cual: el archivo, el nombre
// entre «», y de la aclaración nada. Es lo que saca de este contraste la parte que adivinaba.
test('la traza que arma el recorrido se lee por su forma, sin mirar la aclaración', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('cauce-evidence-armada-')
  fs.mkdirSync(path.join(root, 'app', 'test'), { recursive: true })
  fs.writeFileSync(path.join(root, 'app', 'test', 'resta.test.js'),
    "test('la resta: el primero menos el segundo', () => {})\ntest('crea', () => {})\n"
    + "test('uno; dos  «tres» cuatro', () => {})\ntest('alfa «beta» gama', () => {})\n")
  const one = (artifact) => EV.contrast(`A → ${artifact}`, [root])[0]
  const F = 'test/resta.test.js'
  const NAME = 'la resta: el primero menos el segundo'

  for (const [artifact, verdict, names, rest] of [
    [`${F} › «${NAME}» — criterio: resta(a, b) devuelve a - b`, 'encontrado', [NAME], []],
    [`app/${F} › «${NAME}»`, 'encontrado', [NAME], []],
    [`./${F}:2 › «crea» — escrita a mano, con su línea`, 'encontrado', ['crea'], []],
    // La aclaración no se mira: lo que cite, exista o no, no cambia nada ni se informa.
    [`${F} › «crea» — falla con 'un caso inventado' y \`expect(x)\` · criterio: «otro» › 'más'`,
      'encontrado', ['crea'], []],
    // El nombre va entero, con lo que traiga adentro.
    [`${F} › «la resta: el primero» — criterio: x`, 'encontrado', ['la resta: el primero'], []],
    [`${F} › «la resta — el primero (menos) 'el' segundo» — criterio: x`, 'parcial',
      ["la resta — el primero (menos) 'el' segundo"], ["la resta — el primero (menos) 'el' segundo"]],
    // El nombre viaja sin `;`, sin dobles espacios y sin `»`: se compara con el archivo leído igual.
    [`${F} › «uno, dos «tres" cuatro» — criterio: x`, 'encontrado', ['uno, dos «tres" cuatro'], []],
    // Una traza escrita a mano, sin la forma, se compara con el archivo tal cual está.
    [`${F} — 'alfa «beta» gama'`, 'encontrado', ['alfa «beta» gama'], []],
    // La prueba renombrada o inventada, y el archivo que no está.
    [`${F} › «la resta de dos numeros» — criterio: x`,
      'parcial', ['la resta de dos numeros'], ['la resta de dos numeros']],
    [`test/otra.test.js › «${NAME}» — criterio: x`, 'ausente', [NAME], undefined],
    // Sin archivo, lo nombrado no es una prueba que se pueda ir a buscar.
    ['«lectura de docs/alta.md» — no hay prueba que lo ejecute · criterio: la guía lo nombra', 'inbuscable'],
  ]) {
    const got = one(artifact)
    assert.deepEqual([got.verdict, got.names, got.missing || got.absent], [verdict, names, rest], artifact)
  }
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
    + 'C5 → node --test src/test/suma.test.js; '
    + "C6 → src/test/suma.test.js › 'la suma de dos numeros': `expect(suma(2, 3)).toBe(5)`\n")
  const text = run(['evidence', path.join(root, 'planning')])
  assert.match(text.stdout, /'un caso que no existe en ningun lado' {2}\[ausente\]\n/)
  assert.match(text.stdout, /TestInventadoXyz {2}\[ausente\]\n/)
  assert.match(text.stdout, /'la suma de dos numeros' {2}\[encontrado\] — en el archivo: la suma de dos numeros\n/)
  assert.match(text.stdout, /'otro' y 'más' {2}\[parcial\] — el archivo existe; no aparece en él: otro, más\n/)
  assert.match(text.stdout, /suma\.test\.js {2}\[encontrado\] — se comprobó sólo el archivo\n/)
  assert.match(text.stdout,
    /\[encontrado\] — en el archivo: la suma de dos numeros; cita y no aparece: expect\(suma\(2, 3\)\)\.toBe\(5\)\n/)
})
