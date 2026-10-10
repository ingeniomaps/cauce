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
