'use strict'

const { renderInvoice, upload } = require('./invoices')

// Borrador del squad: consume la cola `invoices`.
async function handle(message, db) {
  const order = await db.orders.find(message.orderId)
  const pdf = await renderInvoice(order, message.number)
  await upload(`invoices/${message.number}.pdf`, pdf)
}

module.exports = { handle, retries: 3 }
