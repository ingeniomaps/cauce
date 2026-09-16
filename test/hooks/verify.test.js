'use strict'

// El gate que corre antes de un commit: qué versión del trabajo juzga, qué entorno recibe y qué no
// puede tocar mientras lo juzga.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, messageOf, DESARMAN } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, guards } = require('../../engine/hooks/run')

test('la copia recibe la palanca que apaga la sincronización, y ya no la que desarma confirmaciones', () => {
  const root = tempRoot('ops-hook-ci-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  // El gate va en un archivo y no inline: tiene que quedar trackeado para que la copia lo materialice,
  // y anota fuera del árbol que se juzga para que las dos corridas escriban en el mismo lugar.
  const visto = path.join(tempRoot('ops-hook-ci-visto-'), 'visto.txt')
  fs.writeFileSync(path.join(root, 'gate.js'),
    `const d = ${JSON.stringify(DESARMAN)}\n`
    + `require('node:fs').appendFileSync(${JSON.stringify(visto)}, `
    + `'verify=' + (process.env.pnpm_config_verify_deps_before_run || 'vacio') `
    + `+ ' viejo=' + (process.env.npm_config_verify_deps_before_run || 'vacio') `
    + `+ ' desarmadas=' + Object.keys(d).filter((k) => process.env[k]).join(',') + '\\n')\n`)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node gate.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, 'planning', '.keep'), '')
  // Todo staged y nada suelto: es la única forma de que no haya copia, y cuesta decirlo porque un solo
  // archivo sin trackear ya la dispara — `git status` lo lista y la condición mira cualquier diferencia,
  // no sólo un cambio sin stagear.
  git(['add', '-A'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  // Se despejan a mano para las dos mitades, porque lo que se mide es qué agrega el guard y no qué traía
  // el entorno. `CI` la exporta Actions: sin despejarla, la mitad de «no hay copia» pasaría en una laptop
  // y afirmaría en CI algo que ahí no es cierto. La otra la exporta el propio `verify` cuando esta suite
  // corre dentro de una copia, y sin despejarla la prueba frenaba todo commit con algo sin trackear
  // (caso 093).
  const ISOLATED = ['CI', 'npm_config_verify_deps_before_run', 'pnpm_config_verify_deps_before_run']
  const antes = Object.fromEntries(ISOLATED.map((name) => [name, process.env[name]]))
  try {
    for (const name of ISOLATED) delete process.env[name]
    assert.doesNotThrow(() => execute('verify', commit))
    assert.match(fs.readFileSync(visto, 'utf8'), /^verify=vacio viejo=vacio desarmadas=$/m,
      'sin copia no se le cambia el entorno a nadie')

    // Y ahora sí hay copia, por lo más barato que la dispara.
    fs.writeFileSync(visto, '')
    fs.writeFileSync(path.join(root, 'suelto.txt'), 'no trackeado\n')
    assert.doesNotThrow(() => execute('verify', commit))
    const enLaCopia = fs.readFileSync(visto, 'utf8')
    // La segunda mitad es la aserción de ausencia que R9 pide para una quita: el nombre viejo no viaja.
    // Sin ella, exportar los dos a la vez pasaría, y lo que se quitó fue justamente el que no sirve.
    assert.match(enLaCopia, /^verify=false viejo=vacio/m,
      'la copia no sincroniza nada antes de correr el gate, y por el nombre que pnpm sí lee')
    assert.match(enLaCopia, /desarmadas=$/m,
      `y ninguna de éstas llega al gate:\n${Object.entries(DESARMAN)
        .map(([k, why]) => `  ${k}: ${why}`).join('\n')}`)
  } finally {
    for (const name of ISOLATED) {
      if (antes[name] === undefined) delete process.env[name]
      else process.env[name] = antes[name]
    }
  }
})

// La regresión del caso 070, medida como R9 pide que se mida una quita: por ausencia de daño. Poner
// `CI=true` en la copia no agregaba una conducta, **quitaba** una —la confirmación con la que pnpm frena
// antes de purgar—, y esa confirmación era lo único que protegía al `node_modules` del proyecto. Sin
// ella la reinstalación avanza y borra por el enlace; el gate igual termina en verde, así que nada lo
// dice.
//
// Se usa un `pnpm` de mentira porque el de verdad exige una instalación real, y lo que hay que fijar no es
// qué hace pnpm sino **qué le pedimos**: con la comprobación previa apagada no toca nada, y con cualquier
// otro valor empieza borrando.
//
// Pero el nombre por el que el falso pregunta no es libre, y ahí estuvo el agujero. Preguntaba por
// `npm_config_…`, que pnpm ignora, así que fabricaba un mecanismo inexistente y quedaba verde sobre una
// mitigación que nunca llegaba (caso 151). Pregunta por el mismo nombre que exporta `commitTree`, que es
// el que pnpm lee de verdad: un falso que preguntara por otro se queda verde haga lo que haga el motor.
test('un gate no puede purgar el node_modules del proyecto por el enlace', () => {
  const root = tempRoot('ops-hook-purga-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e ""' } }))
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'marca.txt'), 'el árbol del proyecto\n')
  git(['add', 'package.json', 'app.js', '.gitignore', 'pnpm-lock.yaml'], root)

  // El `pnpm` de mentira: reinstala —o sea, empieza borrando— salvo que se le haya apagado la
  // comprobación previa. Sigue el enlace, que es exactamente por donde ocurrió el daño.
  const falso = tempRoot('ops-hook-purga-bin-')
  fs.writeFileSync(path.join(falso, 'pnpm'), '#!/usr/bin/env bash\n'
    + 'if [ "${pnpm_config_verify_deps_before_run:-}" != "false" ]; then\n'
    + '  rm -f node_modules/marca.txt\n'
    + 'fi\n'
    + 'exit 0\n', { mode: 0o755 })

  // Árbol e índice difieren, que es cuando se materializa la copia y aparece el enlace.
  fs.writeFileSync(path.join(root, 'suelto.txt'), 'no trackeado\n')
  const antes = process.env.PATH
  try {
    process.env.PATH = `${falso}${path.delimiter}${antes}`
    assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))
  } finally {
    process.env.PATH = antes
  }

  // La aserción es de ausencia de daño: que el gate haya pasado no dice nada: en la regresión también
  // pasaba, y el árbol del proyecto ya no estaba.
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'marca.txt')), true,
    'el node_modules del proyecto sigue entero')
})

// La copia mide el índice, así que lo que un gate escriba en lo enlazado queda con la versión **staged**
// mientras el fuente en disco tiene otra — y nada lo dice. Medido con un `dist/` que pasaba de lo que el
// usuario editaba a lo que estaba en el índice (caso 069). Las dos mitades importan y por eso van
// juntas: dejar de enlazar la salida no vale nada si además se deja de enlazar la dependencia.
test('un gate no pisa lo que el usuario ya construyó, y sigue viendo sus dependencias', () => {
  const root = tempRoot('ops-hook-aislado-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\nnode_modules/\n')
  fs.writeFileSync(path.join(root, 'build.js'), 'const fs = require("node:fs")\n'
    + 'if (!fs.existsSync("node_modules/dep/marca.txt")) { console.error("falta la dependencia"); process.exit(1) }\n'
    + 'fs.mkdirSync("dist", { recursive: true })\n'
    + 'fs.copyFileSync("app.js", "dist/app.js")\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'node build.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'VERSION = "staged"\n')
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'marca.txt'), 'soy la dependencia\n')
  git(['add', '-A'], root)

  // El usuario sigue editando y ya había construido con lo suyo.
  fs.writeFileSync(path.join(root, 'app.js'), 'VERSION = "lo-que-estoy-editando"\n')
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(root, 'app.js'), path.join(root, 'dist', 'app.js'))

  // Que pase es la mitad que prueba que la dependencia sigue enlazada: sin ella el build sale en rojo.
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }),
    'la dependencia se enlaza igual, que es lo que el gate no puede fabricar')
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8').trim(),
    'VERSION = "lo-que-estoy-editando"', 'y la salida de build del usuario queda como estaba')
})

// El mensaje decía `test (exit 1)` y tiraba la salida de la herramienta, así que una suite en rojo y un
// gestor que se negó a arrancar el script llegaban con el mismo texto — y la salida que el guard ofrece
// empuja a aprobar el commit como «rojo conocido». Es la misma forma de fallar que el caso 066 encontró
// en una prueba, acá en lo que lee una persona.
test('un gate que falla dice cuánto tardó y qué dijo la herramienta', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-mudo-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: 'node -e "console.error(\'ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY\');process.exit(1)"' },
  }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  git(['add', 'package.json', 'app.js'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  blocked('verify', commit, /ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY/)
  blocked('verify', commit, /test \(exit 1, \d+\.\d s\)/)
  // Y el número va con el hecho, no con un veredicto: un lint puede fallar rápido y de verdad.
  blocked('verify', commit, /no alcanza para correr una suite/)
  assert.equal(typeof EV.runs(root).slice(-1)[0].ms, 'number', 'la duración queda en el registro')
})

// Qué cita el bloqueo cuando el reporte trae pruebas verdes y rojas, en cada formato comprobado (caso 094).
test('el bloqueo de verify cita la prueba que falló, no una verde que dice error', () => {
  const root = tempRoot('ops-hook-cita-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'alta.test.js'), "const test = require('node:test')\n"
    + "const assert = require('node:assert')\n"
    + "test('el error de validación se informa', () => assert.ok(true))\n"
    + "test('el alta guarda el cliente', () => assert.equal(1, 2))\n")
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }
  const cites = (script, expected) => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: script } }))
    git(['add', 'package.json', 'alta.test.js'], root)
    const cited = messageOf('verify', commit).split('\n')[0]
    assert.match(cited, expected)
    assert.doesNotMatch(cited, /✔|: ok \d|--- PASS| PASSED/, 'no cita una prueba en verde')
  }
  const prints = (...lines) => `node -e "${lines.map((line) => `console.log('${line}')`).join(';')};process.exit(1)"`

  cites('node --test', /✖ el alta guarda el cliente/)
  cites('node --test --test-reporter=tap', /not ok 2 - el alta guarda el cliente/)
  // La salida de `go test -v`, copiada de una corrida real con go 1.26, la escribe un script: la suite no
  // puede suponer que go esté instalado. La primera línea no tiene marca y dice «Error», así que es la
  // marca de fallo lo que evita citarla.
  cites(prints('=== RUN   TestElErrorSeInforma', '--- PASS: TestElErrorSeInforma (0.00s)',
    '=== RUN   TestElAltaGuarda', '    a_test.go:4: no', '--- FAIL: TestElAltaGuarda (0.00s)', 'FAIL'),
  /--- FAIL: TestElAltaGuarda/)
  // Jest, vitest, mocha y pytest, copiados de corridas reales entubadas —las versiones, en `shell.js`—. La
  // primera línea de cada uno es la que se citaba antes: el archivo, el resumen o la verde.
  cites(prints('FAIL ./alta.test.js', '  ● el alta guarda el cliente', '    expect(received).toBe(expected)'),
    /● el alta guarda el cliente/)
  cites(prints(' ❯ alta.test.mjs (2 tests | 1 failed) 7ms', '   × el alta guarda el cliente 4ms'),
    /× el alta guarda el cliente/)
  cites(prints('  ✔ el error de validación se informa al usuario', '  1) el alta guarda el cliente', '  1 failing'),
    /1\) el alta guarda el cliente/)
  cites(prints('test_alta.py::test_el_error_de_validacion_se_informa PASSED [ 50%]',
    'test_alta.py::test_el_alta_guarda_el_cliente FAILED [100%]', '=== FAILURES ===',
    'FAILED test_alta.py::test_el_alta_guarda_el_cliente - assert 1 == 2'), /FAILED test_alta\.py::test_el_alta/)
  // Sin marca de fallo sigue la búsqueda por palabra, que ya no puede quedarse con una verde.
  cites(prints('✔ el error se informa', 'Error: cannot connect'), /Error: cannot connect/)
  cites(prints('test_a.py::test_el_error_se_informa PASSED [ 50%]', 'ERROR: file not found'), /ERROR: file not found/)
})

test('el contraste de evidencia separa lo que existe de lo que no se puede buscar', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-contraste-')
  fs.mkdirSync(path.join(root, 'api'), { recursive: true })
  fs.writeFileSync(path.join(root, 'api', 'alta_test.go'), 'func TestAltaResponde201(t *testing.T) {}\n')
  const roots = [path.join(root, 'api')]

  const veredicto = (tests) => EV.contrast(tests, roots).map((trace) => trace.verdict)
  assert.deepEqual(veredicto('C1 → TestAltaResponde201'), ['encontrado'])
  // La prueba inventada es lo que este contraste existe para atrapar.
  assert.deepEqual(veredicto('C1 → TestQueNoExiste'), ['ausente'])
  // Y la descrita en prosa no se da por ausente: el molde admite «nombre de prueba o comando», así que
  // confundir «no lo encontré» con «no existe» convertiría la forma documentada en un error.
  assert.deepEqual(veredicto('C1 → prueba de alta de cliente'), ['inbuscable'])
  assert.deepEqual(veredicto('n/a — no hay superficie ejecutable'), [])
  // El tercer veredicto, con su razón en `core/evidence.js`: acá se ejerce la lista vacía de raíces.
  assert.deepEqual(EV.contrast('C1 → TestAltaResponde201', []).map((t) => t.verdict), ['inbuscable'])
})

// La fuga que el caso 045 nombra: `verify` corría los gates con `GIT_DIR` del repositorio real, así que
// un gate que escribe con git —la suite de un proyecto levantando repos de prueba, típicamente— escribía
// en el repositorio que el guard estaba juzgando. Se mide por el efecto y no por el entorno: lo que
// importa no es qué variable se exporta sino que el repo de verdad no gane nada.
test('verify no deja que un gate escriba en el repositorio que juzga', () => {
  const root = tempRoot('ops-hook-fuga-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: 'git commit --allow-empty -m fuga-desde-el-gate || true' },
  }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  // Sin esto el árbol está limpio, `commitTree` no materializa nada y la fuga no se puede ejercer.
  fs.writeFileSync(path.join(root, 'sucio.txt'), 'algo sin stagear\n')

  // El caso enumera tres daños y el commit es sólo uno: también aparecieron archivos trackeados que
  // nadie agregó, y un `git add` sin commit no toca el log. Se compara el estado entero contra el de
  // antes en vez de enumerar lo esperado: enumerar deja pasar lo que uno no pensó en escribir.
  // Se descuenta `planning/`: es donde `verify` deja su propio registro de gates, que sí es una
  // escritura suya y esperada. Todo lo demás tiene que quedar idéntico.
  const estado = () => spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n').filter((line) => !/planning\//.test(line)).join('\n')
  const antes = estado()

  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))

  const log = spawnSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' }).stdout
  assert.equal(/fuga-desde-el-gate/.test(log), false, 'el gate commiteó en el repositorio de verdad')
  assert.equal(estado(), antes, 'el índice o el árbol del repositorio de verdad cambiaron durante el gate')
  const config = spawnSync('git', ['config', '--local', '--get', 'core.worktree'],
    { cwd: root, encoding: 'utf8' }).stdout.trim()
  assert.equal(config, '', 'el repositorio quedó apuntando a un árbol que ya no existe')
})

// Lo que la persona pidió en el chat, visto por los guards (caso 098). El registro lo escribe el hook de
// mensaje y lo lee cada guard con la sesión y el mensaje de la llamada. Cada prueba abre una sesión propia
// para no leer el registro de otra, y saca `CI` del entorno: en la puerta está puesta, y ahí no hay persona.
let sesiones = 0
