'use strict'

// Contratos deterministas de planning; no contiene estado de proyecto.

const fs = require('node:fs')
const path = require('node:path')

const EPIC_STATES = ['open', 'active', 'closed']

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
    }
  }).filter((epic) => epic.status !== 'template' && epic.num !== '000')
}

function readBacklog(dir) {
  const text = withoutComments(read(path.join(dir, 'BACKLOG.md')))
  const milestones = []
  let current = null
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+Hito\s+([^\s]+)\s+[—-]\s+(.+)$/)
    if (heading) {
      current = { slug: heading[1], title: heading[2].trim(), heading: line.slice(3), tasks: [] }
      milestones.push(current)
      continue
    }
    if (/^##\s+/.test(line)) current = null
    const task = line.match(/^-\s+\[\s\]\s+\*\*([^*]+)\*\*\s*(?:\[(directo|lite|full)\])?\s+[—-]\s+(.+)$/)
    if (!task || !current) continue
    const rest = task[3]
    current.tasks.push({
      slug: task[1].trim(), tier: task[2] || '',
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
  EPIC_STATES, read, frontmatter, readEpics, readBacklog, readDone, readWip, readInbox,
}
