'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { toCsv } = require('../src/export')
const orders = require('../fixtures/pedidos.json')

test('exporta un encabezado y una línea por pedido', () => {
  const lines = toCsv(orders).trim().split('\n')
  assert.ok(lines[0].includes('id'))
  assert.equal(lines.length, orders.length + 1)
})
