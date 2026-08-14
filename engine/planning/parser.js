'use strict'

// Contratos deterministas de planning; no contiene estado de proyecto.

const fs = require('fs')
const path = require('path')

const EPIC_STATES = ['open', 'active', 'closed']
const TIERS = ['directo', 'lite', 'full']

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

function readEpics(dir, { includeTemplates = false } = {}) {
  return epicFiles(dir).map(({ name, file }) => {
    const text = read(file)
    const field = frontmatter(text)
    const criteria = [...section(text, /Criterios/i).matchAll(/^-\s+\*\*(C\d+)(?:[^*]*)\*\*\s+[—-]\s+(.+)$/gm)]
      .map((match) => ({ id: match[1], text: match[2].trim() }))
    const storyPattern = new RegExp(
      String.raw`^[-*]\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*\s+([\s\S]*?)` +
        String.raw`(?=\n[-*]\s+(?:\[[ xX]\]\s+)?\*\*|\n##|$)`,
      'gm',
    )
    const stories = [...section(text, /Historias/i).matchAll(storyPattern)]
      .map((match) => ({
        slug: match[1].trim(),
        text: match[2].replace(/\s+/g, ' ').trim(),
        criteria: criteriaRefs(match[2]),
        service: ((match[2].match(/\(service:\s*([^)]+)\)/) || [])[1] || '').trim(),
      }))
    return {
      file: name,
      path: file,
      num: field('epic'),
      title: field('title'),
      status: field('status'),
      service: field('service'),
      criteria,
      stories,
      hasContext: /^##\s+Contexto relevante/im.test(text),
    }
  }).filter((epic) => includeTemplates || epic.status !== 'template' && epic.num !== '000')
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
      slug: task[1].trim(), tier: task[2] || '', text: rest,
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

function readInbox(dir) {
  const result = { deuda: 0, ideas: 0, propuestas: 0, lecciones: 0 }
  for (const part of read(path.join(dir, 'INBOX.md')).split(/^##\s+/m)) {
    const title = part.split('\n')[0]
    const count = (part.match(/^[-*]\s+(?:\[[ xX]\]\s+)?\*\*/gm) || []).length
    if (/Deuda/i.test(title)) result.deuda = count
    if (/Ideas|Visi[oó]n/i.test(title)) result.ideas = count
    if (/Propuestas/i.test(title)) result.propuestas = count
    if (/Lecciones/i.test(title)) result.lecciones = count
  }
  return result
}

module.exports = {
  EPIC_STATES, TIERS, read, frontmatter, readEpics, readBacklog, readDone, readWip, readInbox,
}
