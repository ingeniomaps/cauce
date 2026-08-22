'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

const TEST_TRACE = /^(?:n\/a\s*[—-]\s*.+|(?:A|C\d+)\s*(?:→|->)\s*\S.+)$/i
const DECISION_TRACE = /\[(?:fuente|supuesto):\s*[^\]]+\]/i
const EPIC_AUXILIARY_FILES = new Set(['notes.md', 'plan.md', 'research.md', 'spec.md'])

function validTestTrace(value) {
  return String(value || '').split(/\s*;\s*/).filter(Boolean)
    .every((item) => TEST_TRACE.test(item))
}

function validDecisionTrace(value) {
  const text = String(value || '').trim()
  return !text || DECISION_TRACE.test(text)
}

function validateDoneEntry(entry) {
  const at = `${entry.source} ${entry.slug}`
  const errors = []
  if (!entry.tests) errors.push(`${at}: falta tests:`)
  else if (!validTestTrace(entry.tests)) {
    errors.push(`${at}: tests debe rastrear A/CN → prueba o justificar n/a — razón`)
  }
  if (!validDecisionTrace(entry.decisions)) {
    errors.push(`${at}: decisions debe citar [fuente: ...] o [supuesto: ...]`)
  }
  return errors
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
}

function validateEpic(epic, done = new Set()) {
  const at = `roadmap/${epic.file}`
  const errors = []
  const named = epic.file.match(/^epic-(\d{3})-/)
  if (named && named[1] !== epic.num) {
    errors.push(`${at}: el nombre indica ${named[1]} pero el frontmatter declara ${epic.num || 'vacío'}`)
  }
  for (const id of duplicates(epic.criteria.map((criterion) => criterion.id))) {
    errors.push(`${at}: criterio duplicado ${id}`)
  }
  for (const slug of duplicates(epic.stories.map((story) => story.slug))) {
    errors.push(`${at}: historia duplicada ${slug}`)
  }
  const covered = new Set(epic.stories.flatMap((story) => story.criteria))
  for (const criterion of epic.criteria) {
    if (!covered.has(criterion.id)) errors.push(`${at}: ${criterion.id} no está cubierto por ninguna historia`)
  }
  if (epic.status === 'closed') {
    const missing = epic.stories.filter((story) => !done.has(story.slug))
    if (missing.length) errors.push(`${at}: closed sin evidencia para ${missing.map((story) => story.slug).join(', ')}`)
  }
  return errors
}

function validateRoadmapStructure(dir) {
  const roadmap = path.join(dir, 'roadmap')
  let entries = []
  try { entries = fs.readdirSync(roadmap, { withFileTypes: true }) } catch { return ['falta roadmap/'] }
  const errors = []
  for (const entry of entries) {
    // Un archivo que se llama como una épica y no cumple el patrón no lo lee nadie: ni `check`, ni
    // `tree`, ni el runner que busca trabajo. Ignorarlo en silencio es peor que rechazarlo, porque el
    // planning se reporta válido mientras la épica que alguien escribió no existe para el sistema.
    if (/^epic-/.test(entry.name) && !/^epic-\d{3}-/.test(entry.name)) {
      errors.push(
        `roadmap/${entry.name}: nadie lo lee. Una épica se nombra epic-NNN-<slug>.md, `
        + 'o un directorio epic-NNN-<slug>/ con spec.md adentro.',
      )
      continue
    }
    if (!entry.isDirectory() || !/^epic-\d{3}-/.test(entry.name)) continue
    const epicDir = path.join(roadmap, entry.name)
    if (!fs.existsSync(path.join(epicDir, 'spec.md'))) {
      errors.push(`roadmap/${entry.name}: falta spec.md`)
    }
    for (const child of fs.readdirSync(epicDir, { withFileTypes: true })) {
      if (!child.isFile() || !EPIC_AUXILIARY_FILES.has(child.name)) {
        errors.push(`roadmap/${entry.name}/${child.name}: archivo auxiliar no permitido`)
      }
    }
  }
  return errors
}

// El BACKLOG es la única cola, y su lector descarta en silencio lo que no cumple el contrato: una
// viñeta mal escrita no está en cola, no aparece en `tree` y no la toma nadie, sin que nada falle.
// Se juzga sólo lo que vive bajo un hito —el encabezado del archivo es prosa— y sólo las viñetas,
// para no confundir con un error el texto que acompaña a una tarea.
function validateBacklogStructure(dir) {
  const text = P.withoutComments(P.read(path.join(dir, 'BACKLOG.md')))
  const errors = []
  let hito = ''
  for (const line of text.split('\n')) {
    const heading = line.match(P.MILESTONE_HEADING)
    if (heading) { hito = heading[1]; continue }
    if (/^##\s+Hito\b/.test(line)) {
      errors.push(`BACKLOG "${line.trim()}": encabezado inválido; se escribe ## Hito <slug> — <Título>, `
        + 'y sin él las tareas que vienen abajo quedan huérfanas')
      hito = ''
      continue
    }
    if (/^##\s+/.test(line)) { hito = ''; continue }
    if (!hito || !/^\s*[-*]\s+\S/.test(line) || P.TASK_LINE.test(line)) continue
    const lane = line.match(P.TASK_LINE_ANY_LANE)
    if (lane) {
      errors.push(`BACKLOG ${lane[1].trim()}: lane "${lane[2]}" no existe; usá ${P.LANES.join(' | ')}, `
        + 'o dejá la tarea sin clasificar')
      continue
    }
    const at = `BACKLOG hito ${hito}: no la lee nadie`
    if (/^-\s+\[[xX]\]/.test(line)) {
      errors.push(`${at} — ${line.trim().slice(0, 60)}. Una tarea terminada se mueve a DONE.md, no se tilda acá.`)
      continue
    }
    errors.push(`${at} — ${line.trim().slice(0, 60)}. Una tarea se escribe `
      + '`- [ ] **slug** [lane] — descripción`, con `(→ CN) (epic: NNN)` o `_Aceptación:_` después del guión.')
  }
  return errors
}

module.exports = {
  validateBacklogStructure,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
  validateEpic,
  validateRoadmapStructure,
}
