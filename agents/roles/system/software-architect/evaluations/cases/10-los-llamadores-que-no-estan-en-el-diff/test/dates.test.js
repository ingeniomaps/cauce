const test = require('node:test')
const assert = require('node:assert/strict')
const { parseDate } = require('../src/dates')

test('una fecha válida se lee', () => {
  assert.equal(parseDate('2026-11-22').toISOString(), '2026-11-22T00:00:00.000Z')
})
test('una fecha inválida devuelve null', () => assert.equal(parseDate('2026-13-40'), null))
