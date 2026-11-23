'use strict'

const { parseDate } = require('./dates')

// Las filas de un CSV de pagos: la que no se puede leer va a rechazadas con su motivo y no entra.
function importRows(rows) {
  const accepted = []
  const rejected = []
  for (const row of rows) {
    try {
      accepted.push({ id: row.id, amount: Number(row.amount), paidAt: parseDate(row.paid_at) })
    } catch (error) {
      rejected.push({ id: row.id, reason: error.message })
    }
  }
  return { accepted, rejected }
}

module.exports = { importRows }
