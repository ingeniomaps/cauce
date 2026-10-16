'use strict'

// `ops governed` contesta antes de construir lo que el guard de gobernanza va a frenar al commitear (caso 383).
// Lo que se mide es que conteste lo mismo que el guard: las mismas rutas, juzgadas desde la raíz ops, y con la
// aprobación de `planning/.ops-approval` descontada. Lo que el guard frena y cómo se aprueba está en
// `test/hooks/commit.test.js`.

const { tempRoot, run } = require('../support/environment')
const { initRepo } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

function instance(name) {
  const root = tempRoot(name)
  initRepo(root)
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], runner: {} }))
  fs.cpSync(MOLDE, path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'automatization', 'tests'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'), { recursive: true })
  return root
}

const pending = (root, args) => {
  const result = run(['governed', 'planning', '--json', ...args], root)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout).pending
}

test('governed nombra lo que el guard frenaría, y no lo que está fuera de la gobernanza', () => {
  const root = instance('ops-governed-')
  assert.deepEqual(pending(root, ['automatization/tests/regresion.test.js', 'app/alta.js', 'planning/FLOW.md']),
    ['automatization/tests/regresion.test.js', 'planning/FLOW.md'])
})

test('governed descuenta lo que una persona ya aprobó en planning/.ops-approval', () => {
  const root = instance('ops-governed-approved-')
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'planning/FLOW.md\n')
  assert.deepEqual(pending(root, ['automatization/tests/regresion.test.js', 'planning/FLOW.md']),
    ['automatization/tests/regresion.test.js'])
})

// Un plan escribe sus rutas como le sale: desde la raíz o desde el servicio de la tarea. Las dos tienen que
// llegar a la misma ruta del índice, que es la que el guard frena y la que una persona escribe al aprobar.
test('governed resuelve una ruta escrita desde el servicio de la tarea', () => {
  const root = instance('ops-governed-service-')
  assert.deepEqual(pending(root, ['--service', 'automatization', 'tests/nueva.test.js']),
    ['automatization/tests/nueva.test.js'])
})
