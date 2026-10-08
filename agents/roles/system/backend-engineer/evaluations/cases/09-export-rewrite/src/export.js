'use strict'

// Exporta los pedidos de un comercio al CSV que importa su ERP.
function toCsv(orders) {
  const quote = (value) => (/[";\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value))
  const rows = orders.map((order) => [
    order.id,
    order.customer,
    order.total.toFixed(2).replace('.', ','),
    order.createdAt.slice(0, 10).split('-').reverse().join('/'),
  ])
  return `﻿${['id;cliente;total;fecha', ...rows.map((row) => row.map(quote).join(';'))].join('\r\n')}\r\n`
}

module.exports = { toCsv }
