const test = require('node:test')
const assert = require('node:assert/strict')
const { signup } = require('../src/customers')

test('un email ya registrado se rechaza con 409 y su motivo', () => {
  const store = new Map()
  signup(store, { email: 'ana@example.com', name: 'Ana' })
  assert.deepEqual(signup(store, { email: ' Ana@Example.com ', name: 'Ana' }),
    { status: 409, body: { error: 'Ese email ya tiene una cuenta' } })
})
