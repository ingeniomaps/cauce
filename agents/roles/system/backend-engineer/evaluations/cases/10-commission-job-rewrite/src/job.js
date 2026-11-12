'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { computeCommissions, toCsv } = require('./commissions')

const db = new DatabaseSync(process.env.VENTAS_DB || path.join(__dirname, '..', 'db', 'ventas.sqlite'))
const rows = db.prepare('SELECT id, vendedor_id, monto_centavos, estado FROM ventas').all()
const out = process.env.COMISIONES_OUT || path.join(__dirname, '..', 'out', 'comisiones.csv')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, toCsv(computeCommissions(rows)))
console.log(`${rows.length} ventas procesadas → ${out}`)
