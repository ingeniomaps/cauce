'use strict'

// Lo que la revisión mandó a corregir una y otra vez, leído de `done/`, y el registro de qué se hizo con
// eso (`LESSONS.md`). No promueve ni escribe: calcula qué regla merece volver al INBOX como lección y
// deja que el recorrido la anote y que una persona decida (caso 214).
//
// Una regla se propone cuando se corrigió en al menos `THRESHOLD` tareas distintas: una sola es un error
// de esa tarea, y la repetición es lo que dice que la regla no se está cumpliendo de antemano.
//
// Lo que ya está en el registro como propuesta o aplicada no se vuelve a proponer, y lo rechazado sólo
// vuelve con una tarea que no estaba cuando se rechazó. Sin evidencia nueva, proponerlo otra vez es
// insistir.
//
// Los hallazgos de criterio no se agrupan acá. Juntar dos frases distintas que hablan del mismo defecto
// es juicio, y se listan para quien lo tenga.

const path = require('node:path')
const P = require('./parser')

const FILE = 'LESSONS.md'
const STATES = ['propuesta', 'aplicada', 'rechazada']
const THRESHOLD = 2
// `detalle [ref]`, que es como `autobuild` escribe cada corrección dentro del `review` de `done/`.
const ITEM = /^(.*\S)\s+\[([^\]]+)\]$/

function corrected(review) {
  const segment = String(review || '').match(/corregido:\s*(.*?)(?=\s·\s|$)/)
  if (!segment) return []
  return segment[1].split(/\s\|\s/).map((item) => item.trim().match(ITEM)).filter(Boolean)
    .map(([, detail, ref]) => ({ detail: detail.trim(), ref: ref.trim().replace(/^\.\//, '') }))
}

function readLedger(dir) {
  const text = P.withoutComments(P.read(path.join(dir, FILE)))
  if (!text.trim()) return { exists: false, rows: [] }
  const rows = P.tableRows(P.section(text, /Registro/))
    .filter(({ cells }) => cells.length >= 4 && !/^regla$/i.test(cells[0]))
    .map(({ line, cells }) => ({
      ref: cells[0].replace(/`/g, '').trim(),
      state: cells[1].toLowerCase(),
      tasks: cells[2].split(',').map((task) => task.trim()).filter(Boolean),
      date: cells[3],
      raw: line,
    }))
  return { exists: true, rows }
}

// El nombre con que la lección entra al INBOX. Sale de la regla y no se elige, para que la misma regla
// tenga siempre el mismo nombre y el INBOX no la reciba dos veces con nombres distintos.
function lessonName(ref) {
  const [file, rule = ''] = ref.split('#')
  const base = path.basename(file, '.md')
  return `reforzar-${[base, rule].filter(Boolean).join('-')}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

function candidates(dir) {
  const byRef = new Map()
  const criteria = []
  for (const entry of P.readDone(dir).entries) {
    for (const item of corrected(entry.review)) {
      if (/^criterio\b/i.test(item.ref)) { criteria.push({ task: entry.slug, detail: item.detail }); continue }
      if (!byRef.has(item.ref)) byRef.set(item.ref, { ref: item.ref, tasks: [], details: [] })
      const one = byRef.get(item.ref)
      if (!one.tasks.includes(entry.slug)) { one.tasks.push(entry.slug); one.details.push(item.detail) }
    }
  }
  const ledger = readLedger(dir)
  const proposals = []
  for (const one of byRef.values()) {
    if (one.tasks.length < THRESHOLD) continue
    const row = ledger.rows.find((candidate) => candidate.ref === one.ref)
    if (row && row.state !== 'rechazada') continue
    if (row && one.tasks.every((task) => row.tasks.includes(task))) continue
    proposals.push({ ...one, name: lessonName(one.ref), reopened: Boolean(row) })
  }
  return { proposals, criteria, ledger: ledger.exists }
}

function validate(dir) {
  return readLedger(dir).rows
    .filter((row) => !STATES.includes(row.state))
    .map((row) => `${FILE}: la regla ${row.ref} tiene estado «${row.state}», que no es ${STATES.join(', ')}`)
}

module.exports = { FILE, STATES, THRESHOLD, candidates, corrected, validate }
