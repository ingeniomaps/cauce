'use strict'

const { parseDate } = require('./dates')

// Cuántos días pasaron entre la emisión y el pago de cada factura.
function daysToPay(invoices) {
  return invoices.map((one) => ({
    id: one.id,
    days: Math.round((parseDate(one.paid_at).getTime() - parseDate(one.issued_at).getTime()) / 86_400_000),
  }))
}

module.exports = { daysToPay }
