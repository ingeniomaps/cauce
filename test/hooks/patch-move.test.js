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
