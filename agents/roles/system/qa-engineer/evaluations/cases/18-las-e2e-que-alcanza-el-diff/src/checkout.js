'use strict'

const { format } = require('./money')

// El total del carrito, como lo muestra la pantalla de pago.
function totalLabel(items) {
  return format(items.reduce((sum, item) => sum + item.price * item.quantity, 0))
}

module.exports = { totalLabel }
