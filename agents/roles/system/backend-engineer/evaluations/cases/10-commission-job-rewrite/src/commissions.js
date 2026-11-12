'use strict'

// Tramos sobre el total neto del vendedor, en centavos: hasta 1.000.000 cobra 3 %, hasta 5.000.000 cobra 5 %,
// y arriba 7 %. Una venta anulada no cuenta; una devuelta resta su monto.
function rate(total) {
  if (total < 1_000_000) return 0.03
  if (total < 5_000_000) return 0.05
  return 0.07
}

function computeCommissions(rows) {
  const totals = new Map()
  for (const row of rows) {
    if (row.estado === 'anulada') continue
    const sign = row.estado === 'devuelta' ? -1 : 1
    totals.set(row.vendedor_id, (totals.get(row.vendedor_id) || 0) + sign * row.monto_centavos)
  }
  const result = []
  for (const [vendedor, total] of [...totals].sort((a, b) => a[0] - b[0])) {
    result.push({ vendedor_id: vendedor, total_centavos: total, comision_centavos: Math.round(total * rate(total)) })
  }
  return result
}

function toCsv(result) {
  return 'vendedor_id;total_centavos;comision_centavos\n' +
    result.map((r) => `${r.vendedor_id};${r.total_centavos};${r.comision_centavos}\n`).join('')
}

module.exports = { computeCommissions, toCsv }
