'use strict'

const { format } = require('./money')

// Lo que se devuelve por un reembolso parcial: la parte del total que se pidió.
function refundLabel(total, share) {
  return format(total * share)
}

module.exports = { refundLabel }
