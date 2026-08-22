'use strict'

// Contratos deterministas de planning; no contiene estado de proyecto.

const fs = require('node:fs')
const path = require('node:path')
const { PLACEHOLDERS } = require('../core/onboarding')

const EPIC_STATES = ['open', 'active', 'closed']

// Vocabulario común de paradas. Una parada sin nombre obliga a quien la recibe —persona, supervisor o
// workflow— a reconstruir del estado entero qué pasó, y es lo primero que se pierde cuando cada runner
// inventa su propia frase. `context` emite las dos que puede determinar solo; el resto las nombra la
// fase que para.
const STOP_REASONS = [
  'awaiting-review', 'blocked-on-human', 'not-ready', 'plan-rejected', 'review-unresolved',
  'verify-regression', 'verify-inconsistent', 'qa-failed', 'commit-failed', 'budget-low',
]

// El contrato de una línea de BACKLOG, en un solo lugar: lo usa el lector para armar la cola y el
// validador para rechazar lo que el lector va a descartar. Separados, el validador aprobaba la forma
// que el lector no leía, que es la manera más cara de tener las dos cosas.
const MILESTONE_HEADING = /^##\s+Hito\s+([^\s]+)\s+[—-]\s+(.+)$/

// Los carriles, en orden de ceremonia creciente. El orden es parte del vocabulario: la prosa que los
// describe va de menos a más y `check` lo contrasta, porque un carril leído fuera de orden se elige por
// su nombre y no por su criterio.
const LANES = ['express', 'directo', 'lite', 'full']
const TASK_LINE = new RegExp(
  String.raw`^-\s+\[\s\]\s+\*\*([^*]+)\*\*\s*(?:\[(${LANES.join('|')})\])?\s+[—-]\s+(.+)$`,
)
// Lo mismo con cualquier tag: distingue el lane inexistente de la línea sin lane, que es un estado
// legítimo. Sin esa diferencia las dos caían en «no la lee nadie» y la corrección no era la misma.
const TASK_LINE_ANY_LANE = /^-\s+\[\s\]\s+\*\*([^*]+)\*\*\s*\[([^\]]+)\]\s+[—-]\s+/

function read(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

function frontmatter(text) {
  const block = (text.match(/^---\s*\n([\s\S]*?)\n---/m) || [])[1] || ''
  const values = new Map()
  for (const line of block.split('\n')) {
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (match) values.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ''))
  }
  return (key) => values.get(key) || ''
}

function section(text, heading) {
  const parts = text.split(/^##\s+/m)
  return parts.find((part) => heading.test(part.split('\n')[0])) || ''
}

function withoutComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

function epicFiles(dir) {
  const roadmap = path.join(dir, 'roadmap')
  let entries = []
  try { entries = fs.readdirSync(roadmap, { withFileTypes: true }) } catch { return [] }
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && /^epic-\d{3}-.+\.md$/.test(entry.name)) {
      files.push({ name: entry.name, file: path.join(roadmap, entry.name) })
    } else if (entry.isDirectory() && /^epic-\d{3}-/.test(entry.name)) {
      const spec = path.join(roadmap, entry.name, 'spec.md')
      if (fs.existsSync(spec)) files.push({ name: `${entry.name}/spec.md`, file: spec })
    }
  }
  return files
}

function criteriaRefs(text) {
  const refs = []
  const groups = [
    ...text.matchAll(/\(\s*(?:→|->)\s*([^)]*)\)/g),
    ...text.matchAll(/\*\(\s*criterios?\s+([^)]*)\)\*/gi),
  ]
  for (const group of groups) {
    for (const match of group[1].matchAll(/C?\d+/gi)) {
      const id = match[0].toUpperCase()
      refs.push(id.startsWith('C') ? id : `C${id}`)
    }
  }
  return [...new Set(refs)]
}

function readEpics(dir) {
  return epicFiles(dir).map(({ name, file }) => {
    const text = read(file)
    const field = frontmatter(text)
    const criteria = [...section(text, /Criterios/i).matchAll(/^-\s+\*\*(C\d+)(?:[^*]*)\*\*\s+[—-]\s+(.+)$/gm)]
      .map((match) => ({ id: match[1], text: match[2].trim() }))
    // `(?![\s\S])` y no `$`: con la bandera `m` el `$` casa fin de **línea**, así que el cuerpo no ávido
    // cortaba en el primer salto y una historia envuelta perdía su `(service: …)` y sus `(→ CN)`. El
    // error que salía era «no declara (service: <ruta>)» — culpaba al autor de algo que sí había escrito.
    // Dos cargos distintos lo encontraron reescribiendo su historia hasta que entrara en un solo renglón.
    const storyPattern = new RegExp(
      String.raw`^[-*]\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*\s+([\s\S]*?)` +
        String.raw`(?=\n[-*]\s+(?:\[[ xX]\]\s+)?\*\*|\n##|(?![\s\S]))`,
      'gm',
    )
    const stories = [...section(text, /Historias/i).matchAll(storyPattern)]
      .map((match) => ({
        slug: match[1].trim(),
        criteria: criteriaRefs(match[2]),
        service: ((match[2].match(/\(service:\s*([^)]+)\)/) || [])[1] || '').trim(),
      }))
    return {
      file: name,
      path: file,
      num: field('epic'),
      title: field('title'),
      status: field('status'),
      criteria,
      stories,
      hasContext: /^##\s+Contexto relevante/im.test(text),
      // Las líneas que todavía no decidieron nada. Se guardan enteras y no como un booleano porque el
      // error tiene que decir cuál es: «tiene un marcador» manda a releer la épica entera.
      placeholders: text.split('\n').map((line) => line.trim())
        .filter((line) => line && PLACEHOLDERS.test(line)),
    }
  }).filter((epic) => epic.status !== 'template' && epic.num !== '000')
}

// El reparto viaja en la línea de la tarea —`(cast: quien-entrega → quien-revisa, otro)`—, y la
// flecha es lo que los separa. Los revisores son opcionales porque el lane más barato no tiene
// ninguno, y el reparto entero también: una tarea sin clasificar es el estado que dispara al
// clasificador, no un error. Devuelve siempre la forma completa para que nadie tenga que preguntar
// si el campo existe antes de leerlo.
function readCast(rest) {
  const raw = ((rest.match(/\(cast:\s*([^)]+)\)/i) || [])[1] || '').trim()
  const [build, reviewers] = raw.split(/\s*(?:→|->)\s*/)
  return {
    build: (build || '').trim(),
    review: (reviewers || '').split(',').map((slug) => slug.trim()).filter(Boolean),
  }
}

function readBacklog(dir) {
  const text = withoutComments(read(path.join(dir, 'BACKLOG.md')))
  const milestones = []
  let current = null
  for (const line of text.split('\n')) {
    const heading = line.match(MILESTONE_HEADING)
    if (heading) {
      current = { slug: heading[1], title: heading[2].trim(), heading: line.slice(3), tasks: [] }
      milestones.push(current)
      continue
    }
    if (/^##\s+/.test(line)) current = null
    const task = line.match(TASK_LINE)
    if (!task || !current) continue
    const rest = task[3]
    current.tasks.push({
      slug: task[1].trim(), tier: task[2] || '', cast: readCast(rest),
      epic: ((rest.match(/\(epic:\s*(\d{3})\)/) || [])[1] || ''),
      service: ((rest.match(/\(service:\s*([^)]+)\)/) || [])[1] || '').trim(),
      acceptance: ((rest.match(/_Aceptaci[oó]n:\s*([^_]+)_/i) || [])[1] || '').trim(),
      criteria: criteriaRefs(rest),
    })
  }
  return milestones
}

function doneFiles(dir) {
  const files = [path.join(dir, 'DONE.md')]
  const archive = path.join(dir, 'done')
  try {
    files.unshift(...fs.readdirSync(archive).filter((file) => /^epic-\d{3}\.md$/.test(file)).sort()
      .map((file) => path.join(archive, file)))
  } catch { /* no archive yet */ }
  return files
}

function readDone(dir) {
  const entries = []
  for (const file of doneFiles(dir)) {
    const text = withoutComments(read(file))
    const donePattern = /^-\s+\[[xX]\]\s+\*\*([^*]+)\*\*([^\n]*)([\s\S]*?)(?=\n-\s+\[[xX]\]|\n##|(?![\s\S]))/gm
    const matches = [...text.matchAll(donePattern)]
    for (const match of matches) {
      const body = match[3]
      const field = (name) => ((body.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'mi')) || [])[1] || '').trim()
      entries.push({
        slug: match[1].trim(),
        epic: ((match[2].match(/\(epic:\s*(\d{3})\)/) || [])[1] || ''),
        acceptance: field('acept'), done: field('done'), qa: field('qa'), tests: field('tests'),
        decisions: field('decisions'), commit: field('commit'),
        source: path.relative(dir, file), raw: match[0].trimEnd(),
      })
    }
  }
  const duplicates = entries.map((entry) => entry.slug)
    .filter((slug, index, all) => all.indexOf(slug) !== index)
  return { entries, set: new Set(entries.map((entry) => entry.slug)), duplicates: [...new Set(duplicates)] }
}

// Vocabulario cerrado del Estado de `HUMAN_ACTIONS.md`. Es cerrado porque de este campo depende que una
// tarea se pueda tomar, y quien lo escribe no recibe ninguna señal de haberlo escrito mal: cualquier
// palabra de fuera del vocabulario deja la fila abierta y su tarea bloqueada sin que nada lo diga.
const HUMAN_ACTION_STATES = ['pendiente', 'resuelta']

// Se lee por el principio de la celda —no por `includes`— para que el detalle que acompaña al estado
// («resuelta 2026-08-17») siga valiendo sin que una palabra suelta dentro de un texto largo resuelva
// una fila que sigue abierta. `valid` distingue la fila mal escrita de la fila pendiente: las dos
// bloquean, pero sólo una es un error que hay que reportar.
function readHumanActions(dir) {
  const rows = withoutComments(read(path.join(dir, 'HUMAN_ACTIONS.md'))).split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*:?-+/.test(line))
    .map((line) => ({ line, cells: line.split('|').slice(1, -1).map((cell) => cell.trim()) }))
  return rows.filter(({ cells }) => cells.length >= 4 && !/^tarea$/i.test(cells[0]))
    .map(({ line, cells }) => {
      const state = (cells[1].match(new RegExp(`^(${HUMAN_ACTION_STATES.join('|')})\\b`, 'i')) || [])[1] || ''
      return {
        task: cells[0], state: cells[1], origin: cells[2], action: cells[3],
        valid: Boolean(state), resolved: state.toLowerCase() === 'resuelta', raw: line,
      }
    })
}

function readWip(dir) {
  const text = read(path.join(dir, 'WIP.md'))
  if (/^status:\s*IDLE/m.test(text)) return null
  const field = frontmatter(text)
  const task = field('task')
  if (!task) return null
  return {
    task, phase: field('phase') || '?', service: field('service'),
    complete: (text.match(/^\d+\.\s+\[[xX]\]/gm) || []).length,
    pending: (text.match(/^\d+\.\s+\[\s\]/gm) || []).length,
  }
}

// Un ítem se cuenta cuando empieza con su nombre en negrita, y el nombre existe para poder citarlo
// —`HUMAN_ACTIONS.md` y las propuestas mensuales se refieren a un ítem por ese slug—. La convención se
// conserva; lo que no se conserva es el silencio.
//
// La plantilla no traía ningún ejemplo, así que quien escribía viñetas planas veía cero ítems sobre un
// archivo con doce y nada se lo decía. `skipped` es lo que vuelve visible esa diferencia.
function readInbox(dir) {
  const result = { deuda: 0, ideas: 0, propuestas: 0, lecciones: 0, skipped: 0 }
  for (const part of read(path.join(dir, 'INBOX.md')).split(/^##\s+/m)) {
    const title = part.split('\n')[0]
    const bullets = (part.match(/^[-*]\s+(?:\[[ xX]\]\s+)?/gm) || []).length
    const count = (part.match(/^[-*]\s+(?:\[[ xX]\]\s+)?\*\*/gm) || []).length
    if (/Deuda|Ideas|Visi[oó]n|Propuestas|Lecciones/i.test(title)) result.skipped += bullets - count
    if (/Deuda/i.test(title)) result.deuda = count
    if (/Ideas|Visi[oó]n/i.test(title)) result.ideas = count
    if (/Propuestas/i.test(title)) result.propuestas = count
    if (/Lecciones/i.test(title)) result.lecciones = count
  }
  return result
}

module.exports = {
  EPIC_STATES, HUMAN_ACTION_STATES, LANES, MILESTONE_HEADING, STOP_REASONS,
  TASK_LINE, TASK_LINE_ANY_LANE,
  read, withoutComments, frontmatter, readEpics, readBacklog, readDone, readWip,
  readInbox, readHumanActions,
}
