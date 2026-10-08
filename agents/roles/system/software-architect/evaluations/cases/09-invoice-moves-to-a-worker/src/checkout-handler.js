'use strict'

const { renderInvoice, upload } = require('./invoices')
const { nextInvoiceNumber } = require('./numbering')
const { audit } = require('./audit')

// POST /checkout
async function checkout(req, res, db) {
  const result = await db.transaction(async (tx) => {
    const order = await tx.orders.insert({ customerId: req.body.customerId, items: req.body.items })
    // El número sale de la misma transacción que el pedido: si el pedido no se confirma, no se consume.
    const number = await nextInvoiceNumber(tx)
    await tx.invoices.insert({ orderId: order.id, number })
    return { order, number }
  })
  const pdf = await renderInvoice(result.order, result.number)
  const invoiceUrl = await upload(`invoices/${result.number}.pdf`, pdf)
  await audit('invoice.issued', { orderId: result.order.id, number: result.number, by: req.user.id })
  res.status(201).json({ orderId: result.order.id, invoiceUrl })
}

module.exports = { checkout }
