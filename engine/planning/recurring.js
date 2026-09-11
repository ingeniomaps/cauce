'use strict'

// El contrato de `RECURRING.md`: qué se declaró que vuelve, cuándo vence y qué línea se promueve.
// No ejecuta ni encola —eso lo decide una persona editando `BACKLOG.md`—; acá se lee el archivo y se
// calcula una fecha, que es todo lo que la máquina puede aportar sin decidir por nadie.
//
// La fecha de hoy entra por parámetro. Preguntarla adentro dejaría cada prueba de vencimiento válida
// sólo el día que se escribió, y el vencimiento es justamente lo único que este módulo calcula.

const path = require('node:path')
const P = require('./parser')

const FILE = 'RECURRING.md'

// Vocabulario cerrado, en meses, por la misma razón que el estado de `HUMAN_ACTIONS.md`. `semanal` no
// está y no es un olvido: el período viaja en el slug de cada vuelta con grano de mes, así que dos
// vueltas de la misma semana no se distinguirían.
const CADENCES = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
// La fila que el molde trae activa escribe su `Desde` como marcador, porque la fecha depende del día en
// que se crea la instancia y la reemplazan `init` y `upgrade`. Sin resolver sólo existe en el molde
// mismo —el que `npm run check` valida en el toolkit—, y ahí no vence: `status` la descarta por fecha.
const PLACEHOLDER = /^\{\{[A-Z_]+\}\}$/
// `- **qué** AAAA-MM-DD — razón`. El nombre en negrita adelante es la misma convención del INBOX, y por
// el mismo motivo: es con lo que se cita la fila desde otro lado.
const POSTPONEMENT = /^-\s+\*\*([^*]+)\*\*\s+(\S+)\s+[—-]\s+(.+)$/

// Suma meses sobre `AAAA-MM-DD` en UTC. El día se recorta al último del mes destino: un ancla escrita
// el 31 no puede caer en un 31 de febrero, y correrla al 3 de marzo movería la vuelta de mes.
function addMonths(iso, months) {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

// Las dos listas del archivo, cada una acotada a su sección. Buscarlas en el texto entero haría que una
// viñeta de la prosa —el archivo explica sus propias columnas con viñetas— entrara como postergación.
function read(dir) {
  const text = P.withoutComments(P.read(path.join(dir, FILE)))
  if (!text.trim()) return { exists: false, rows: [], postponements: [] }
  const rows = P.tableRows(P.section(text, /Recurrencias/))
    // El literal, por el mismo motivo que en `readHumanActions`, donde está escrito.
    .filter(({ cells }) => cells.length >= 4 && !/^qué$/i.test(cells[0]))
    .map(({ line, cells }) => ({
      id: cells[0], cadence: cells[1], since: cells[2], task: cells[3], raw: line,
    }))
  const postponements = P.section(text, /Postergaciones/).split('\n')
    .filter((line) => /^-\s/.test(line))
    .map((line) => {
      const match = line.match(POSTPONEMENT)
      return match
        ? { id: match[1].trim(), date: match[2], reason: match[3].trim(), raw: line }
        : { id: '', date: '', reason: '', raw: line }
    })
  return { exists: true, rows, postponements }
}

// La línea que se pega en BACKLOG. La celda de la tabla es literalmente la cola de esa línea, así que
// lo que una persona escribió una vez es lo que se promueve, sin retipear.
function taskLine(row, period) {
  return `- [ ] **${row.id}-${period}** — ${row.task}`
}

function validate({ exists, rows, postponements }) {
  if (!exists) return []
  const errors = []
  const seen = new Set()
  for (const row of rows) {
    const at = `${FILE} ${row.id || '(fila sin nombre)'}`
    if (!ID.test(row.id)) errors.push(`${at}: el identificador va en minúsculas, sin espacios`)
    else if (seen.has(row.id)) errors.push(`${FILE}: identificador duplicado ${row.id}`)
    seen.add(row.id)
    if (!CADENCES[row.cadence]) {
      errors.push(`${at}: cadencia "${row.cadence}" fuera de ${Object.keys(CADENCES).join(' | ')}`)
    }
    if (!DATE.test(row.since) && !PLACEHOLDER.test(row.since)) errors.push(`${at}: Desde debe ser AAAA-MM-DD`)
    // Se juzga la línea armada y no la celda suelta: lo que se promueve es esa línea, y quien la va a
    // leer es el mismo lector de BACKLOG. Una celda que pasa acá y una línea que BACKLOG rechaza es el
    // error que aparece un mes después, con la tarea ya pegada.
    const task = P.taskFromLine(taskLine(row, '0000-00'))
    if (!task) errors.push(`${at}: la celda no arma una línea de tarea`)
    else {
      if (!task.acceptance) errors.push(`${at}: la tarea no declara _Aceptación: ..._`)
      if (!task.service) errors.push(`${at}: la tarea no declara (service: <ruta>)`)
    }
  }
  for (const one of postponements) {
    if (!one.id) {
      errors.push(`${FILE}: una postergación se escribe "- **qué** AAAA-MM-DD — razón": ${one.raw.trim()}`)
      continue
    }
    if (!DATE.test(one.date)) errors.push(`${FILE}: postergación de ${one.id}: la fecha va en AAAA-MM-DD`)
    if (!seen.has(one.id)) errors.push(`${FILE}: postergación de ${one.id}, que la tabla no declara`)
  }
  return errors
}

// El último período cerrado, leído de DONE y no de una celda: una fecha que alguien tiene que acordarse
// de actualizar miente a los tres meses, y la entrada de DONE es además la evidencia de que se hizo.
function lastPeriod(id, done) {
  const pattern = new RegExp(`^${id}-(\\d{4}-\\d{2})$`)
  const periods = done.entries.map((entry) => (entry.slug.match(pattern) || [])[1]).filter(Boolean)
  return periods.sort().pop() || ''
}

function status({ rows, postponements, done, today }) {
  return rows
    .filter((row) => ID.test(row.id) && CADENCES[row.cadence] && DATE.test(row.since))
    .map((row) => {
      const months = CADENCES[row.cadence]
      const last = lastPeriod(row.id, done)
      // Cerrada una vuelta, la siguiente se cuenta desde el período que la cerró; sin ninguna, desde el
      // ancla escrita al declarar la fila. Es lo que hace rodante al vencimiento: saltearse una vuelta
      // corre la próxima en vez de deber dos.
      const base = last ? addMonths(`${last}-01`, months) : row.since
      // Y las postergaciones que cuentan son las escritas después de que terminó el período cerrado:
      // las anteriores ya las absorbió ese cierre, que es lo que reinicia el contador.
      const from = last ? addMonths(`${last}-01`, 1) : row.since
      const postponed = postponements.filter((one) => one.id === row.id && one.date >= from).length
      const due = addMonths(base, months * postponed)
      const overdueDays = daysBetween(due, today)
      return {
        id: row.id, cadence: row.cadence, task: row.task, last, due, postponed,
        overdueDays, overdue: overdueDays >= 0,
      }
    })
}

function warnings(state) {
  const lines = []
  for (const one of state.filter((candidate) => candidate.overdue)) {
    const when = one.overdueDays === 0 ? 'vence hoy' : `vencida hace ${one.overdueDays} día(s)`
    lines.push(`${FILE}: ${one.id} ${when} (${one.due})`)
  }
  // Tres seguidas no son un atraso: son una fila que no se va a hacer con la cadencia que declara. El
  // contador es la alarma, y por eso se cuenta desde el último cierre y no desde siempre.
  for (const one of state.filter((candidate) => candidate.postponed >= 3)) {
    lines.push(`${FILE}: ${one.id} postergada ${one.postponed} veces desde el último cierre; `
      + 'revisá la cadencia o la fila')
  }
  return lines
}

// Los marcadores de fecha del molde, resueltos para una instancia que nace hoy. `Desde` es la primera
// fecha de vencimiento y no el día en que se declara la fila, así que va un período después: con la
// fecha de hoy la fila nacía «vence hoy» (caso 106). Trimestral es la cadencia de la fila del molde.
function sinceValues(today) {
  return { '{{INBOX_SINCE}}': addMonths(today, CADENCES.trimestral) }
}

module.exports = { FILE, read, validate, status, warnings, taskLine, sinceValues }
