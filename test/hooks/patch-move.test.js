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

test('lo que un archivo ya traía se juzga cuando el renombrado lo vuelve una migración', () => {
  const root = project('ops-hook-patch-move-contenido-')
  fs.mkdirSync(path.join(root, 'service', 'scratch'))
  fs.mkdirSync(path.join(root, 'service', 'migrations'))
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'drop.sql'), 'DROP TABLE users;\n')
  fs.writeFileSync(path.join(root, 'service', 'migrations', '001_old.sql'), 'DROP TABLE legacy;\n')
  const move = (from, to, ...hunk) => asCodex(root,
    patchOf(`*** Update File: ${from}`, `*** Move to: ${to}`, '@@', ...hunk))
  blocked('migrations', move('service/scratch/drop.sql', 'service/migrations/003_drop.sql',
    ' DROP TABLE users;', '+-- listo'), /003_drop\.sql.*DROP TABLE/s)
  // Y lo que el parche le agrega al renombrarlo también cuenta, aunque lo que traía estuviera limpio.
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'ok.sql'), 'CREATE TABLE t (id int);\n')
  blocked('migrations', move('service/scratch/ok.sql', 'service/migrations/005_ok.sql', '+DROP TABLE t;'), /DROP TABLE/)
  // Lo que el parche quita ya no va a estar: no se frena por lo que deja de existir.
  assert.doesNotThrow(() => execute('migrations', move('service/scratch/drop.sql', 'service/migrations/003_ok.sql',
    '-DROP TABLE users;', '+CREATE TABLE users (id int);')))
  // Renombrar una migración que ya existe es reescribirla, y eso lo frena la regla de siempre, por el origen.
  blocked('migrations', move('service/migrations/001_old.sql', 'service/migrations/002_old.sql',
    ' DROP TABLE legacy;', '+-- nota'), /001_old\.sql existe/)
  // Sin archivo de origen que leer —lo crea el mismo parche, o no está— queda lo que el parche trae.
  assert.doesNotThrow(() => execute('migrations', move('service/scratch/no-existe.sql',
    'service/migrations/004_x.sql', '+CREATE TABLE t (id int);')))
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

// Lo que encontró la revisión del 367: «lo que va a quedar» se calculaba por aproximación.
test('lo que va a quedar en un archivo renombrado se arma aplicando el parche donde cae', () => {
  const root = project('ops-hook-patch-move-aplicado-')
  fs.mkdirSync(path.join(root, 'service', 'scratch'))
  const write = (name, ...lines) => fs.writeFileSync(path.join(root, 'service', 'scratch', name), lines.join('\n'))
  const move = (name, to, ...hunk) => asCodex(root,
    patchOf(`*** Update File: service/scratch/${name}`, `*** Move to: service/migrations/${to}`, '@@', ...hunk))
  // Lo agregado cae donde el hunk dice, no al final: acá es el bloque que aplica, no la reversión.
  write('marked.sql', '-- +goose Up', 'CREATE TABLE t (id int);', '-- +goose Down', 'DROP TABLE t;', '')
  blocked('migrations', move('marked.sql', '003_m.sql', ' -- +goose Up', '+DROP TABLE users;',
    ' CREATE TABLE t (id int);'), /DROP TABLE/)
  // Y lo quitado es la línea que el hunk señala: sacar el de la reversión no saca el del bloque que aplica.
  write('twice.sql', '-- +goose Up', 'DROP TABLE t;', '-- +goose Down', 'DROP TABLE t;', '')
  blocked('migrations', move('twice.sql', '020.sql', ' -- +goose Down', '-DROP TABLE t;', '+SELECT 1;'), /DROP TABLE/)
  // Un origen con finales de línea de Windows se lee igual.
  fs.writeFileSync(path.join(root, 'service', 'scratch', 'crlf.sql'), 'DROP TABLE old;\r\nCREATE TABLE t (id int);\r\n')
  assert.doesNotThrow(() => execute('migrations', move('crlf.sql', '004_c.sql', '-DROP TABLE old;',
    '+CREATE TABLE n (id int);')))
  // Un marcador de reversión agregado antes de un DROP que ya estaba lo deja en la reversión: dónde cae decide.
  write('reversion.sql', '-- +goose Up', 'CREATE TABLE t (id int);', 'DROP TABLE t;', '')
  blocked('migrations', move('reversion.sql', '040.sql', ' -- +goose Up', '+-- nota'), /DROP TABLE/)
  assert.doesNotThrow(() => execute('migrations', move('reversion.sql', '041.sql', ' CREATE TABLE t (id int);',
    '+-- +goose Down')))
  // Si el parche no se puede ubicar en el archivo, se juzga el archivo como está: no se supone que quitó nada.
  write('lejos.sql', 'DROP TABLE x;', '')
  blocked('migrations', move('lejos.sql', '030.sql', ' esto no está', '-ni esto', '+SELECT 1;'), /DROP TABLE/)
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
})
