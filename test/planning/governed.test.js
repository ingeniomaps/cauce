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

const TEMPLATE = path.resolve(__dirname, '..', '..', 'template', 'planning')

function instance(name) {
  const root = tempRoot(name)
  initRepo(root)
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], runner: {} }))
  fs.cpSync(TEMPLATE, path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'automatization', 'tests'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'), { recursive: true })
  return root
}

const pending = (root, args) => {
  const result = run(['governed', 'planning', '--json', ...args], root)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout).pending
}
// Las rutas como las coteja el guard: enteras desde la raíz real del repositorio (caso 445).
const at = (root, ...files) => files.map((file) => path.join(fs.realpathSync(root), file))

test('governed nombra lo que el guard frenaría, y no lo que está fuera de la gobernanza', () => {
  const root = instance('ops-governed-')
  assert.deepEqual(pending(root, ['automatization/tests/regresion.test.js', 'app/alta.js', 'planning/FLOW.md']),
    at(root, 'automatization/tests/regresion.test.js', 'planning/FLOW.md'))
})

test('governed descuenta lo que una persona ya aprobó en planning/.ops-approval', () => {
  const root = instance('ops-governed-approved-')
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), `${at(root, 'planning/FLOW.md')}\n`)
  assert.deepEqual(pending(root, ['automatization/tests/regresion.test.js', 'planning/FLOW.md']),
    at(root, 'automatization/tests/regresion.test.js'))
  // La forma relativa ya no descuenta nada: es la que el guard dejó de aceptar.
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'planning/FLOW.md\n')
  assert.deepEqual(pending(root, ['planning/FLOW.md']), at(root, 'planning/FLOW.md'))
})

// Las dos lecturas de una ruta, desde la raíz y desde el servicio; el porqué, en `readings`.
test('governed resuelve una ruta escrita desde el servicio de la tarea', () => {
  const root = instance('ops-governed-service-')
  assert.deepEqual(pending(root, ['--service', 'automatization', 'tests/nueva.test.js']),
    at(root, 'automatization/tests/nueva.test.js'))
})

// Un archivo nuevo en el primer nivel del servicio (revisión del caso 383, en `readings`).
test('governed resuelve desde el servicio un archivo nuevo en su primer nivel', () => {
  const root = instance('ops-governed-top-')
  assert.deepEqual(pending(root, ['--service', 'automatization', 'nueva.test.js']),
    at(root, 'automatization/nueva.test.js'))
  // Y una ruta escrita desde la raíz, que ya nombra al servicio, sigue resolviendo desde la raíz.
  assert.deepEqual(pending(root, ['--service', 'automatization', 'automatization/otra.test.js']),
    at(root, 'automatization/otra.test.js'))
  // Y la que es gobernanza vista desde la raíz no se pierde porque el servicio sea otro.
  assert.deepEqual(pending(root, ['--service', 'app', 'planning/rules/nueva.md']), at(root, 'planning/rules/nueva.md'))
})

// Un enlace simbólico en la ruta del plan (el porqué, en `real`).
test('governed nombra la ruta del índice aunque el plan llegue por un enlace simbólico',
  { skip: process.platform === 'win32' }, () => {
  const root = instance('ops-governed-link-')
  fs.symlinkSync(path.join(root, 'planning'), path.join(root, 'planning-enlace'))
  assert.deepEqual(pending(root, ['planning-enlace/FLOW.md']), at(root, 'planning/FLOW.md'))
})
