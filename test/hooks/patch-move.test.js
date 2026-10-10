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

// Lo que el archivo trae y lo que el parche agrega se juzgan por separado; por qué no se calcula cómo va a quedar
// está junto al guard, en `engine/hooks/migrations.js`.
test('lo que un archivo ya traía se juzga cuando el renombrado lo vuelve una migración', () => {
  const root = project('ops-hook-patch-move-contenido-')
  fs.mkdirSync(path.join(root, 'service', 'scratch'))
  fs.mkdirSync(path.join(root, 'service', 'migrations'))
  const write = (name, ...lines) => fs.writeFileSync(path.join(root, 'service', 'scratch', name), lines.join('\n'))
  const move = (from, to, ...hunk) => asCodex(root,
    patchOf(`*** Update File: service/scratch/${from}`, `*** Move to: service/migrations/${to}`, '@@', ...hunk))
  write('drop.sql', 'DROP TABLE users;', '')
  // Y el mensaje dice de dónde viene lo que frena: no es algo que el parche escriba.
  blocked('migrations', move('drop.sql', '003_drop.sql', ' DROP TABLE users;', '+-- listo'),
    /003_drop\.sql.*renombra service\/scratch\/drop\.sql.*DROP TABLE/s)
  // También sin tocarle una línea, y con finales de línea de Windows.
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/migrations/004_drop.sql')), /DROP TABLE/)
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'crlf.sql'), 'CREATE TABLE t (id int);\r\nDROP TABLE t;\r\n')
  blocked('migrations', move('crlf.sql', '005_c.sql', '+-- nota'), /DROP TABLE/)
  // Un renombrado en dos saltos dentro del mismo parche viene del mismo archivo.
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/scratch/tmp.sql', '*** Update File: service/scratch/tmp.sql',
    '*** Move to: service/migrations/400.sql')), /400\.sql.*renombra service\/scratch\/drop\.sql/)
  // Y no se sigue la cadena, que se puede armar para que termine en otro lado: se mira todo archivo que el
  // parche renombra. Con el nombre de origen ocupado por otro renombrado, o en un ciclo, frena igual.
  write('limpio.sql', 'CREATE TABLE t (id int);', '')
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/migrations/401.sql', '*** Update File: service/scratch/limpio.sql',
    '*** Move to: service/scratch/drop.sql')), /401\.sql.*drop\.sql.*DROP TABLE/s)
  blocked('migrations', asCodex(root, patchOf('*** Update File: service/scratch/drop.sql',
    '*** Move to: service/migrations/a.sql', '*** Update File: service/migrations/a.sql',
    '*** Move to: service/migrations/b.sql', '*** Update File: service/migrations/b.sql',
    '*** Move to: service/scratch/drop.sql')), /DROP TABLE/)
  // Lo que el parche agrega al renombrarlo cuenta, aunque lo que traía estuviera limpio.
  write('ok.sql', 'CREATE TABLE t (id int);', '')
  blocked('migrations', move('ok.sql', '006_ok.sql', '+DROP TABLE t;'), /DROP TABLE/)
  assert.doesNotThrow(() => execute('migrations', move('ok.sql', '007_ok.sql', '+CREATE INDEX i ON t (id);')))
  // Lo que traía se juzga entero, también su reversión: el mismo parche puede sacarle el marcador, y entonces
  // lo que era reversión pasa a aplicarse.
  write('marcada.sql', '-- +goose Up', 'CREATE TABLE t (id int);', '-- +goose Down', 'DROP TABLE t;', '')
  blocked('migrations', move('marcada.sql', '008_m.sql', '+-- nota'), /DROP TABLE/)
  blocked('migrations', move('marcada.sql', '011_m.sql', ' CREATE TABLE t (id int);', '--- +goose Down',
    ' DROP TABLE t;'), /DROP TABLE/)
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

// La regla es una sola y no tiene nada propio; el porqué está junto a ella, en `testEvidence`. Acá se fijan
// los dos lados: lo que tiene que seguir pasando, que son los renombrados de todos los días, y lo que frena.
test('un renombrado es un borrado cuando el nombre nuevo no es una prueba para este guard, y sólo entonces', () => {
  const root = project('ops-hook-patch-move-regla-')
  const move = (from, to) => asCodex(root, patchOf(`*** Update File: ${from}`, `*** Move to: ${to}`, '@@', '-x', '+y'))
  for (const [from, to] of [['service/src/a.test.js', 'service/src/__tests__/a.js'],
    ['service/src/a.test.js', 'service/test/a.js'], ['service/src/a.spec.ts', 'service/src/b.spec.tsx'],
    ['service/src/__tests__/Button.js', 'service/src/__tests__/Button.tsx'],
    ['service/tests/helpers.js', 'service/tests/helpers.ts'], ['service/test/README', 'service/test/README.md'],
    ['service/tests/FooTest.java', 'service/tests/BarTest.java']]) {
    assert.doesNotThrow(() => execute('test-evidence', move(from, to)), `${from} → ${to}`)
  }
  for (const [from, to] of [['service/src/a.test.js', 'service/src/a.test.bak'],
    ['service/src/a.spec.ts', 'service/src/a.spec.disabled'], ['service/pkg/a_test.go', 'service/pkg/a.test.off'],
    ['service/tests/login.py', 'service/attic/login.txt']]) blocked('test-evidence', move(from, to), /borra una prueba/)
})

test('un parche con cientos de renombrados se juzga en un tiempo que crece con su tamaño', () => {
  const root = project('ops-hook-patch-move-muchos-')
  const sections = Array.from({ length: 800 }, (_, at) => [`*** Update File: service/old/${at}.sql`,
    `*** Move to: service/migrations/${at}.sql`]).flat()
  const started = Date.now()
  assert.doesNotThrow(() => execute('migrations', asCodex(root, patchOf(...sections))))
  assert.ok(Date.now() - started < 1000, `tardó ${Date.now() - started} ms`)
})
