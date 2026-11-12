'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { computeCommissions } = require('../src/commissions')

test('calcula una fila por vendedor', () => {
  const rows = [
    { id: 1, vendedor_id: 7, monto_centavos: 120000, estado: 'confirmada' },
    { id: 2, vendedor_id: 7, monto_centavos: 30000, estado: 'confirmada' },
    { id: 3, vendedor_id: 9, monto_centavos: 50000, estado: 'confirmada' },
  ]
  assert.strictEqual(computeCommissions(rows).length, 2)
})
