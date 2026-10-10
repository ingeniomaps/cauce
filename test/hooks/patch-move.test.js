'use strict'

// Caso 366. Un `apply_patch` puede renombrar: `*** Update File: a` seguido de `*** Move to: b`. Los guards de
// archivos leían la ruta de origen y no la de destino, así que un archivo de adentro se mudaba afuera de las
// raíces, o a un nombre que otro guard cuida, sin que ninguno lo mirara.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

// Un nombre que no existe: el guard sólo lee el parche.
const OUT = path.join(os.homedir(), 'fuera-de-las-raices')

function project(name) {
  const root = path.join(tempRoot(name), 'repo')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'service', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'service', path: 'service' }] }))
  return root
}
const moved = (to) => ['*** Begin Patch', '*** Update File: service/src/a.js', `*** Move to: ${to}`, '@@', '-x', '+y',
  '*** End Patch'].join('\n')
// Las tres formas en que llega el sobre: Codex lo manda como `command`.
const SHAPES = ['command', 'patch', 'input']

test('un parche que muda un archivo afuera de las raíces frena por el destino', () => {
  const root = project('ops-hook-patch-move-')
  for (const shape of SHAPES) {
    const input = (to) => ({ cwd: root, tool_name: 'apply_patch', tool_input: { [shape]: moved(to) } })
    blocked('workspace-boundary', input(`${OUT}/b.js`), /fuera-de-las-raices\/b\.js.*fuera de las raíces/s)
    blocked('workspace-boundary', input('../../../../../../../../no-es-de-nadie/b.js'), /fuera de las raíces/)
    assert.doesNotThrow(() => execute('workspace-boundary', input('service/src/b.js')), shape)
  }
})

test('el destino de una mudanza lo miran también los guards que cuidan un nombre', () => {
  const root = project('ops-hook-patch-move-nombre-')
  const input = { cwd: root, tool_name: 'apply_patch', tool_input: { command: moved('service/.env') } }
  blocked('secrets', input, /\.env/)
})

test('una migración renombrada se sigue juzgando por su sección, no por el sobre entero', () => {
  const root = project('ops-hook-patch-move-migracion-')
  const patch = (hunk) => ['*** Begin Patch', '*** Update File: service/migrations/003_x.sql',
    '*** Move to: service/migrations/004_x.sql', '@@', ...hunk, '*** End Patch'].join('\n')
  const input = (hunk) => ({ cwd: root, tool_name: 'apply_patch', tool_input: { command: patch(hunk) } })
  // Lo que el parche quita no destruye nada, tampoco en el archivo con su nombre nuevo.
  assert.doesNotThrow(() => execute('migrations', input(['-DROP TABLE old_users;', '+CREATE TABLE users (id int);'])))
  blocked('migrations', input(['-CREATE TABLE users (id int);', '+DROP TABLE users;']), /DROP TABLE/)
  // Un renombrado que cae sobre un archivo que el mismo parche ya edita no le tapa lo que agrega.
  const onto = ['*** Begin Patch', '*** Update File: service/migrations/003_x.sql', '@@', '+DROP TABLE users;',
    '*** Update File: service/notes.txt', '*** Move to: service/migrations/003_x.sql', '@@', '-a', '+b',
    '*** End Patch'].join('\n')
  blocked('migrations', { cwd: root, tool_name: 'apply_patch', tool_input: { command: onto } }, /DROP TABLE/)
  // También cuando el archivo renombrado existe y está limpio: lo que la otra sección agrega sigue contando.
  fs.writeFileSync(path.join(root, 'service', 'notes.txt'), 'a\n')
  blocked('migrations', { cwd: root, tool_name: 'apply_patch', tool_input: { command: onto } }, /DROP TABLE/)
})

// Caso 367. Un renombrado llega con contenido que el parche no trae y deja sin su nombre al archivo de origen.
const patchOf = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')
const asCodex = (root, patch) => ({ cwd: root, tool_name: 'apply_patch', tool_input: { command: patch } })

// No se calcula cómo va a quedar el archivo después del parche. Se intentó, imitando a quien lo aplica, y cada
// revisión encontró otra regla que faltaba. Se juzga lo que el archivo trae y, aparte, lo que el parche agrega.
test('lo que un archivo ya traía se juzga cuando el renombrado lo vuelve una migración', () => {
  const root = project('ops-hook-patch-move-contenido-')
  fs.mkdirSync(path.join(root, 'service', 'scratch'))
  fs.mkdirSync(path.join(root, 'service', 'migrations'))
  const write = (name, ...lines) => fs.writeFileSync(path.join(root, 'service', 'scratch', name), lines.join('\n'))
  const move = (from, to, ...hunk) => asCodex(root,
    patchOf(`*** Update File: service/scratch/${from}`, `*** Move to: service/migrations/${to}`, '@@', ...hunk))
  write('drop.sql', 'DROP TABLE users;', '')
  blocked('migrations', move('drop.sql', '003_drop.sql', ' DROP TABLE users;', '+-- listo'),
    /003_drop\.sql.*DROP TABLE/s)
  // También sin tocarle una línea, y con finales de línea de Windows.
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/migrations/004_drop.sql')), /DROP TABLE/)
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'crlf.sql'), 'CREATE TABLE t (id int);\r\nDROP TABLE t;\r\n')
  blocked('migrations', move('crlf.sql', '005_c.sql', '+-- nota'), /DROP TABLE/)
  // Lo que el parche agrega al renombrarlo cuenta, aunque lo que traía estuviera limpio.
  write('ok.sql', 'CREATE TABLE t (id int);', '')
  blocked('migrations', move('ok.sql', '006_ok.sql', '+DROP TABLE t;'), /DROP TABLE/)
  assert.doesNotThrow(() => execute('migrations', move('ok.sql', '007_ok.sql', '+CREATE INDEX i ON t (id);')))
  // Lo que traía se juzga como una migración: un DROP en su reversión no es del bloque que aplica.
  write('marcada.sql', '-- +goose Up', 'CREATE TABLE t (id int);', '-- +goose Down', 'DROP TABLE t;', '')
  assert.doesNotThrow(() => execute('migrations', move('marcada.sql', '008_m.sql', '+-- nota')))
  // El costo, que se elige: si el archivo trae un DROP y el mismo parche se lo quita, frena igual. No se
  // adivina qué línea quita el parche; la salida es la aprobación que este guard ya ofrece.
  blocked('migrations', move('drop.sql', '009_ok.sql', '-DROP TABLE users;', '+CREATE TABLE users (id int);'),
    /DROP TABLE/)
  // Renombrar una migración que ya existe es reescribirla, y eso lo frena la regla de siempre, por el origen.
  fs.writeFileSync(path.join(root, 'service', 'migrations', '001_old.sql'), 'DROP TABLE legacy;\n')
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/migrations/001_old.sql',
    '*** Move to: service/migrations/002_old.sql', '@@', ' DROP TABLE legacy;', '+-- nota')), /001_old\.sql existe/)
  // Sin archivo de origen que leer —lo crea el mismo parche, o no está— queda lo que el parche trae.
  assert.doesNotThrow(() => execute('migrations', move('no-existe.sql', '010_x.sql', '+CREATE TABLE t (id int);')))
})

test('renombrar una prueba a un nombre que ya no lo es cuenta como borrarla', () => {
  const root = project('ops-hook-patch-move-prueba-')
  const move = (from, to) => asCodex(root, patchOf(`*** Update File: ${from}`, `*** Move to: ${to}`, '@@', '-x', '+y'))
  blocked('test-evidence', move('service/src/a.test.js', 'service/attic/a.js.txt'),
    /service\/src\/a\.test\.js borra una prueba.*a\.js\.txt/s)
  // Mudarla y que siga siendo una prueba no pierde nada; y renombrar lo que no era una prueba, tampoco.
  assert.doesNotThrow(() => execute('test-evidence', move('service/src/a.test.js', 'service/lib/a.test.js')))
  assert.doesNotThrow(() => execute('test-evidence', move('service/src/a.js', 'service/src/b.js')))
})

test('un sobre con finales de línea de Windows se lee igual', () => {
  const root = project('ops-hook-patch-move-crlf-')
  fs.mkdirSync(path.join(root, 'service', 'scratch'))
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'drop.sql'), 'DROP TABLE users;\n')
  const crlf = (...lines) => asCodex(root, patchOf(...lines).split('\n').join('\r\n'))
  blocked('test-evidence', crlf('*** Update File: service/src/a.test.js', '*** Move to: service/attic/a.js.txt',
    '@@', '-x', '+y'), /borra una prueba/)
  blocked('migrations', crlf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/migrations/005_d.sql', '@@', ' DROP TABLE users;', '+-- listo'), /DROP TABLE/)
})

test('una prueba que cambia de extensión o de herramienta sigue siendo una prueba', () => {
  const root = project('ops-hook-patch-move-sigue-')
  const move = (from, to) => asCodex(root, patchOf(`*** Update File: ${from}`, `*** Move to: ${to}`, '@@', '-x', '+y'))
  for (const [from, to] of [['service/src/a.test.js', 'service/src/a.test.mjs'],
    ['service/src/a.test.js', 'service/src/a.test.cjs'], ['service/src/a.spec.ts', 'service/src/a.spec.mts'],
    ['service/src/a.spec.ts', 'service/cypress/e2e/a.cy.ts']]) {
    assert.doesNotThrow(() => execute('test-evidence', move(from, to)), `${from} → ${to}`)
  }
  // Pero un nombre que ningún runner levanta es apagarla, tenga el `.test.` que tenga.
  for (const [from, to] of [['service/src/a.test.js', 'service/src/a.test.bak'],
    ['service/src/a.test.js', 'service/src/a.test.txt'], ['service/src/a.spec.ts', 'service/src/a.spec.disabled'],
    ['service/pkg/a_test.go', 'service/pkg/a.test.off'],
    // También dentro de una carpeta de pruebas, que es donde más viven: la carpeta no la vuelve una que corra.
    ['service/tests/a.test.js', 'service/tests/a.test.bak'],
    ['service/tests/a.test.js', 'service/tests/a.test.js.disabled'],
    ['service/src/__tests__/a.js', 'service/src/__tests__/a.js.off']]) {
    blocked('test-evidence', move(from, to), /borra una prueba/)
  }
  // Lo que es una prueba por la carpeta en la que vive sigue siéndolo mientras se quede en una: pasar de JS a
  // TS, o renombrar un ayudante o un dato, no saca nada de la suite.
  for (const [from, to] of [['service/tests/FooTest.java', 'service/tests/BarTest.java'],
    ['service/src/__tests__/Button.js', 'service/src/__tests__/Button.tsx'],
    ['service/tests/helpers.js', 'service/tests/helpers.ts'], ['service/tests/login.js', 'service/tests/login.ts'],
    ['service/tests/fixtures/data.json', 'service/tests/fixtures/data.yaml'],
    ['service/tests/README.txt', 'service/tests/README.md']]) {
    assert.doesNotThrow(() => execute('test-evidence', move(from, to)), `${from} → ${to}`)
  }
})
