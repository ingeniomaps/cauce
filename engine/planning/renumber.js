'use strict'

// Mover una épica a otro número (caso 217). Dos líneas de trabajo que crean una épica a la vez toman el mismo
// «próximo NNN libre», porque ninguna ve la de la otra hasta traerla; git no choca —los archivos se llaman
// distinto— y lo ve `check`. Lo caro era renumerar a mano: el archivo, su frontmatter y cada tarea que la cita.
//
// `plan` decide y no escribe: devuelve el renombre y los textos nuevos, o el motivo por el que no se puede.
// Así un pedido mal hecho —un número tomado, una épica que no existe— no deja nada a medio mover.

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

const BASE = /^epic-(\d{3})-(.+?)(?:\.md)?$/

function markdownBelow(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return markdownBelow(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

function plan(root, epicName, num) {
  const base = path.basename(String(epicName || '').replace(/\/spec\.md$/, '')).replace(/\/$/, '')
  const named = base.match(BASE)
  if (!named) return { error: `${epicName} no es el nombre de una épica (epic-NNN-slug)` }
  if (!/^\d{3}$/.test(String(num))) return { error: `${num} no es un número de épica: van tres dígitos, como 007` }
  const [, old, slug] = named
  if (old === num) return { error: `${base.replace(/\.md$/, '')} ya tiene el número ${num}` }
  const roadmap = path.join(root, 'roadmap')
  const asFile = path.join(roadmap, `epic-${old}-${slug}.md`)
  const asDir = path.join(roadmap, `epic-${old}-${slug}`)
  const from = fs.existsSync(asFile) ? asFile : (fs.existsSync(path.join(asDir, 'spec.md')) ? asDir : null)
  if (!from) return { error: `no existe roadmap/epic-${old}-${slug}.md ni roadmap/epic-${old}-${slug}/spec.md` }
  const epics = P.readEpics(root)
  const taken = epics.find((epic) => epic.num === num)
  if (taken) return { error: `el número ${num} ya lo tiene roadmap/${taken.file}` }
  const closed = P.readDone(root).entries.find((entry) => entry.epic === num)
  if (closed) {
    return { error: `el número ${num} lo cita una tarea cerrada (${closed.source}): es de una épica que ya existió` }
  }

  const oldBase = `epic-${old}-${slug}`
  const newBase = `epic-${num}-${slug}`
  const to = path.join(roadmap, from === asFile ? `${newBase}.md` : newBase)
  if (fs.existsSync(to)) return { error: `ya existe ${path.relative(root, to)}` }
  const spec = from === asFile ? asFile : path.join(asDir, 'spec.md')
  const stories = new Set((epics.find((epic) => epic.path === spec) || { stories: [] }).stories.map((s) => s.slug))

  const edits = []
  for (const file of markdownBelow(root)) {
    const text = P.read(file)
    let next = text.split(oldBase).join(newBase)
    if (file === spec) {
      next = next.replace(new RegExp(`^epic:\\s*${old}\\s*$`, 'm'), `epic: ${num}`)
        .replace(new RegExp(`^(#\\s+Épica\\s+)${old}\\b`, 'm'), `$1${num}`)
    } else {
      // Sólo las tareas de esta épica: con el número repetido, las de la otra citan el mismo `(epic: NNN)`.
      next = next.split('\n').map((line) => {
        const task = line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*/)
        return task && stories.has(task[1].trim())
          ? line.replace(new RegExp(`\\(epic:\\s*${old}\\)`, 'g'), `(epic: ${num})`) : line
      }).join('\n')
    }
    if (next !== text) edits.push({ file, text: next })
  }
  return { from, to, edits }
}

// Escribe primero y renombra al final: si una escritura falla, la épica sigue donde estaba y con su número.
function apply(result) {
  for (const edit of result.edits) fs.writeFileSync(edit.file, edit.text)
  fs.renameSync(result.from, result.to)
}

// El número que se ofrece en el mensaje de `check`: el siguiente al más alto, que es lo que pide el contrato.
// Cuenta también lo que citan las tareas cerradas: una épica archivada deja el roadmap, y su número no vuelve.
function nextFree(epics, done = { entries: [] }) {
  const used = [...epics.map((epic) => epic.num), ...done.entries.map((entry) => entry.epic)]
  const highest = Math.max(0, ...used.map(Number).filter(Number.isInteger))
  return String(highest + 1).padStart(3, '0')
}

module.exports = { plan, apply, nextFree }
