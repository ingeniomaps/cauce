'use strict'

// Las razones con que para `autobuild` contra el vocabulario del motor, en los dos sentidos (caso 390; el porqué, en
// `stops.js`). Es el comparador que R27 pide para una lista que alguien tiene que acordarse de ampliar; el de la prosa
// contra el motor está en `context.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../../engine/planning/stops')

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'automatization', 'workflows', 'autobuild.js'), 'utf8')

// Las literales y las que `planRejected` recibe por nombre, que son las dos formas en que el recorrido nombra una.
const emitted = new Set([
  ...[...SOURCE.matchAll(/\b(?:halt|stop)\('([a-z]+(?:-[a-z]+)+)'/g)].map((match) => match[1]),
  ...[...SOURCE.matchAll(/\bplanRejected\('([a-z]+(?:-[a-z]+)+)'/g)].map((match) => match[1]),
])

test('toda razón con que para autobuild está en una familia del vocabulario', () => {
  const known = new Set(P.STOP_REASONS)
  assert.deepEqual([...emitted].filter((one) => !known.has(one)).sort(), [],
    'una parada nueva se clasifica en STOP_FAMILIES antes de entregarse')
})

test('el vocabulario no nombra razones que nadie emite, salvo las deprecadas', () => {
  // `context` emite las dos que puede determinar solo, y el recorrido para con las mismas.
  assert.deepEqual(P.STOP_REASONS.filter((one) => !emitted.has(one)).sort(), [])
  for (const [old, replacement] of Object.entries(P.DEPRECATED_STOP_REASONS)) {
    assert.ok(!emitted.has(old), `${old} está deprecada y el recorrido la sigue emitiendo`)
    assert.ok(P.STOP_REASONS.includes(replacement), `${old} apunta a ${replacement}, que no está en el vocabulario`)
  }
})

test('cada razón vive en una sola familia', () => {
  const all = Object.values(P.STOP_FAMILIES).flat()
  assert.equal(new Set(all).size, all.length, 'una razón repetida entre familias')
})

// Una razón que llega por variable o por template no la ve el comparador de arriba, que lee literales. Las dos que hay
// hoy se nombran acá: `halt`, que pasa a `stop` la que recibe, y `planRejected`, cuyos nombres sí se leen arriba.
// Una tercera no se cuela en silencio, que es como la lista se había quedado atrás (revisión del caso 390).
test('una parada que no nombra su razón con un literal está declarada', () => {
  const loose = [...SOURCE.matchAll(/\b(?:halt|stop)\(\s*([^'\s)][^,)]*)/g)].map((match) => match[1].trim())
  assert.deepEqual(loose.sort(), ['reason', 'reason'])
})

