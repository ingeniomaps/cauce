'use strict'

// Lleva un monto a centavos redondeando al más cercano.
const toCents = (amount) => Math.round(amount * 100)

const format = (amount) => `$ ${(toCents(amount) / 100).toFixed(2).replace('.', ',')}`

module.exports = { toCents, format }
