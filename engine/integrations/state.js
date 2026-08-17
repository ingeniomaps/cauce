'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')

const STATES = ['context', 'pending', 'ready', 'rejected', 'promoted']
const CRITICAL_FIELDS = [
  'summary',
  'description',
  'type',
  'status',
  'assignee',
  'parent',
  'components',
  'labels',
]
const CATEGORIES = {
  epic: 'epics',
  story: 'stories',
  task: 'tasks',
  'sub-task': 'subtasks',
  subtask: 'subtasks',
}

const sha256 = (value) => {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function frontmatter(text) {
  const block = (String(text).match(/^---\s*\n([\s\S]*?)\n---/) || [])[1] || ''
  const values = {}
  for (const line of block.split('\n')) {
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function replaceField(text, name, value) {
  const line = new RegExp(`^${name}:.*$`, 'm')
  return line.test(text) ? text.replace(line, `${name}: ${value}`) : text
}

function sections(text) {
  const body = String(text).replace(/^---[\s\S]*?---\s*/, '')
  const title = ((body.match(/^#\s+(.+)$/m) || [])[1] || '').trim()
  const result = { title }
  const names = ['Descripción', 'Aceptación', 'Comentarios', 'Decisiones', 'Problemas de preparación']
  for (const [index, name] of names.entries()) {
    const following = names.slice(index + 1).map(escapeRegex).join('|')
    const end = following ? `(?=^##\\s+(?:${following})\\s*$|(?![\\s\\S]))` : '(?![\\s\\S])'
    const pattern = new RegExp(`^##\\s+${escapeRegex(name)}\\s*\\n([\\s\\S]*?)${end}`, 'im')
    result[name] = ((body.match(pattern) || [])[1] || '').trim()
  }
  return result
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function categoryOf(item) {
  return CATEGORIES[String(item.type || '').toLowerCase()] || 'items'
}

function roleOf(item, config) {
  const envName = config.candidateAssigneeEnv
  if (!envName) return 'candidate'
  const expected = process.env[envName]
  if (!expected) throw new Error(`Falta la variable ${envName} para resolver candidatos`)
  return item.assignee && item.assignee.accountId === expected ? 'candidate' : 'context'
}

function remoteView(item) {
  return Object.fromEntries(CRITICAL_FIELDS.map((field) => [field, normalize(item[field])]))
}

function localView(draft) {
  const parsed = sections(draft)
  return {
    summary: normalize(parsed.title),
    description: normalize(parsed.Descripción),
  }
}

function normalize(value) {
  if (Array.isArray(value)) return [...value].map(normalize).sort(compareJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
  }
  return value === undefined || value === null ? '' : value
}

function compareJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function same(left, right) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function derive(snapshot, draft) {
  const base = snapshot.sync.base || remoteView(snapshot.item)
  const remote = remoteView(snapshot.item)
  const local = localView(draft)
  const incoming = CRITICAL_FIELDS.filter((field) => !same(remote[field], base[field]))
  const outgoing = ['summary', 'description'].filter((field) => !same(local[field], base[field]))
  return {
    incoming,
    outgoing,
    conflict: incoming.filter((field) => outgoing.includes(field)),
    diverged: frontmatter(draft).state === 'promoted' && incoming.length > 0,
  }
}

function renderDraft(item, config, state = 'pending') {
  const service = config.serviceFrom === 'component' && item.components.length === 1
    ? item.components[0]
    : ''
  const acceptance = item.acceptance || 'Por definir.'
  const issues = []
  if (!item.acceptance) issues.push('La incidencia no contiene aceptación concreta.')
  if (!service) issues.push('Debe definirse un servicio único para la promoción.')
  if (!issues.length) issues.push('Ninguno detectado automáticamente.')
  return `---
provider: jira
remote: ${item.key}
type: ${item.type}
state: ${state}
service: "${service}"
promotionKind: ""
promotionEpic: ""
promotionCriteria: ""
promotedAt: ""
---

# ${item.summary}

## Descripción

${item.description || 'Sin descripción.'}

## Aceptación

${acceptance}

## Comentarios

- Contexto local; nunca se envía al proveedor.

## Decisiones

- Definir destino de promoción.

## Problemas de preparación

${issues.map((issue) => `- ${issue}`).join('\n')}
`
}

function readStaging(root, provider = '') {
  const staging = path.join(root, 'integrations', provider, 'staging')
  const items = []
  let categories = []
  try { categories = fs.readdirSync(staging, { withFileTypes: true }) } catch { return items }
  for (const category of categories.filter((entry) => entry.isDirectory())) {
    const categoryDir = path.join(staging, category.name)
    if (fs.existsSync(path.join(categoryDir, 'remote.json'))) {
      items.push({ key: category.name, category: 'legacy', dir: categoryDir })
      continue
    }
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      items.push({
        key: entry.name,
        category: category.name,
        dir: path.join(categoryDir, entry.name),
      })
    }
  }
  return items.sort((left, right) => left.key.localeCompare(right.key))
}

function reconcile(root, provider, operation, keys = []) {
  const selected = new Set(keys)
  const results = []
  for (const staged of readStaging(root, provider)) {
    if (selected.size && !selected.has(staged.key)) continue
    const snapshotFile = path.join(staged.dir, 'remote.json')
    const draftFile = path.join(staged.dir, 'draft.md')
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
    let draft = fs.readFileSync(draftFile, 'utf8')
    if (operation === 'reset') {
      const state = snapshot.sync.role === 'context' ? 'context' : 'pending'
      draft = renderDraft(snapshot.item, snapshot.sync.config || {}, state)
      snapshot.sync.base = remoteView(snapshot.item)
      snapshot.sync.baseAt = new Date().toISOString()
    } else if (operation === 'reconcile') {
      snapshot.sync.base = remoteView(snapshot.item)
      snapshot.sync.baseAt = new Date().toISOString()
    } else if (operation !== 'rebase') {
      throw new Error(`Operación de reconciliación desconocida: ${operation}`)
    }
    const canonicalState = snapshot.sync.role === 'context' ? 'context' : 'pending'
    snapshot.sync.draftBaseHash = sha256(
      renderDraft(snapshot.item, snapshot.sync.config || {}, canonicalState),
    )
    snapshot.sync.draftChanged = sha256(draft) !== snapshot.sync.draftBaseHash
    F.atomicWrite(draftFile, draft)
    F.atomicWriteJson(snapshotFile, snapshot)
    results.push(staged.key)
  }
  if (selected.size && results.length !== selected.size) {
    const missing = [...selected].filter((key) => !results.includes(key))
    throw new Error(`No se encontraron en staging: ${missing.join(', ')}`)
  }
  return results
}

module.exports = {
  STATES,
  categoryOf,
  derive,
  frontmatter,
  localView,
  readStaging,
  reconcile,
  remoteView,
  renderDraft,
  replaceField,
  roleOf,
  sections,
  sha256,
}
