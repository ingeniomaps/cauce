'use strict'

// El número de comprobante, con el prefijo del punto de venta.
const invoiceNumber = (pos, seq) => `${String(pos).padStart(4, '0')}-${String(seq).padStart(8, '0')}`

module.exports = { invoiceNumber }
