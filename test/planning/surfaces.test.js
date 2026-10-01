'use strict'

// Lo que la empresa declaró que no se puede romper, como lo lee el motor (caso 205). `autobuild` decide
// con esto si una tarea puede ir por el carril sin revisión, así que lo que importa es qué cuenta como
// declarado y qué se reporta como hueco: una tabla en `Por definir` no es una tabla vacía.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { criticalSurfaces } = require('../../engine/planning/surfaces')

const company = (rows) => `# Empresa

## Qué no se puede romper

| Superficie | Qué se detiene si falla | A quién alcanza | Dónde vive |
|---|---|---|---|
${rows.join('\n')}

## Fuentes de verdad
`

function instance(text) {
  const root = tempRoot('cauce-surfaces-')
  fs.mkdirSync(path.join(root, 'organization'))
  if (text !== undefined) fs.writeFileSync(path.join(root, 'organization', 'company.md'), text)
  return root
}

test('la tabla del molde no declara nada y lo reporta', () => {
  const root = instance(company(['| Por definir | Por definir | Por definir | Por definir |']))
  assert.deepEqual(criticalSurfaces(root), { declared: [], pending: true })
})

test('una fila completa se declara y no deja nada pendiente', () => {
  const root = instance(company(['| Alta de pedido | El checkout | Todos los clientes | api/orders |']))
  assert.deepEqual(criticalSurfaces(root), {
    declared: [{ surface: 'Alta de pedido', stops: 'El checkout', reaches: 'Todos los clientes', lives: 'api/orders' }],
    pending: false,
  })
})

// La superficie con nombre rige aunque no se sepa dónde vive: sacarla por eso dejaría pasar por el carril
// sin revisión justo lo que nadie ubicó.
test('una superficie con una celda sin declarar rige igual y deja el hueco a la vista', () => {
  const root = instance(company([
    '| Alta de pedido | El checkout | Todos los clientes | api/orders |',
    '| Recarga de saldo | Pagos | Por definir | web/wallet |',
    '| Por definir | Por definir | Por definir | Por definir |',
  ]))
  const result = criticalSurfaces(root)
  assert.deepEqual(result.declared.map((one) => one.surface), ['Alta de pedido', 'Recarga de saldo'])
  assert.equal(result.pending, true)
})

test('sin archivo, sin sección o sin filas, no hay nada declarado y eso es un hueco', () => {
  assert.deepEqual(criticalSurfaces(instance()), { declared: [], pending: true })
  assert.deepEqual(criticalSurfaces(instance('# Empresa\n\n## Fuentes de verdad\n')), { declared: [], pending: true })
  assert.deepEqual(criticalSurfaces(instance(company([]))), { declared: [], pending: true })
})

test('la sección termina en el encabezado siguiente: una tabla de otra sección no se cuenta', () => {
  const root = instance(`${company(['| Alta de pedido | El checkout | Todos | api/orders |'])}
| Superficie | Otra | Otra | Otra |
|---|---|---|---|
| CRM | x | y | z |
`)
  assert.deepEqual(criticalSurfaces(root).declared.map((one) => one.surface), ['Alta de pedido'])
})

test('context --json entrega las superficies de la instancia', () => {
  const target = path.join(tempRoot('cauce-surfaces-ctx-'), 'demo')
  assert.equal(run(['init', target, '--name', 'Superficies']).status, 0)
  const file = path.join(target, 'organization', 'company.md')
  const molde = run(['context', path.join(target, 'planning'), '--json'])
  assert.equal(molde.status, 0, molde.stderr)
  assert.deepEqual(JSON.parse(molde.stdout).surfaces, { declared: [], pending: true })

  const row = '| Alta de pedido | El checkout | Todos | api/orders |'
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace('| Por definir | Por definir | Por definir | Por definir |', row))
  const declarada = run(['context', path.join(target, 'planning'), '--json'])
  assert.equal(declarada.status, 0, declarada.stderr)
  assert.deepEqual(JSON.parse(declarada.stdout).surfaces.declared.map((one) => one.surface), ['Alta de pedido'])
})
