'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

const TEST_TRACE = /^(?:n\/a\s*[—-]\s*.+|(?:A|C\d+)\s*(?:→|->)\s*\S.+)$/i
const DECISION_TRACE = /\[(?:fuente|supuesto):\s*[^\]]+\]/i
const COMMIT_TRACE = /^(?:n\/a\s*[—-]\s*.+|[0-9a-f]{7,40}\s+\S.*)$/i
const EPIC_AUXILIARY_FILES = new Set(['notes.md', 'plan.md', 'research.md', 'spec.md'])

function validTestTrace(value) {
  return String(value || '').split(/\s*;\s*/).filter(Boolean)
    .every((item) => TEST_TRACE.test(item))
}

function validDecisionTrace(value) {
  const text = String(value || '').trim()
  return !text || DECISION_TRACE.test(text)
}

// El campo apunta al artefacto entregado, y el único puntero que no se puede escribir de memoria es el
// sha. La salida explícita existe porque hay tareas que no producen commit —abrir una fila en
// HUMAN_ACTIONS, registrar un informe—, y forzarlas a llenar el campo produce un sha inventado, que es
// peor que la ausencia: parece evidencia.
function validCommitTrace(value) {
  // Se corta en cada `|`, y en un `;` sólo cuando detrás viene un sha: el `;` aparece también dentro del
  // paréntesis final —`(api@main; sin footer Task:)`— y cortar ahí convertiría una nota en un commit que
  // falta. Cada tramo responde por sí mismo; validar sólo el primero dejaba pasar la mitad sin artefacto.
  return String(value || '').trim().split(/\s*(?:\||;(?=\s*[0-9a-f]{7,40}\s))\s*/)
    .every((part) => COMMIT_TRACE.test(part.trim()))
}

// Los criterios que la evidencia realmente rastrea. `n/a — razón` no rastrea ninguno a propósito: es
// la salida explícita, y como lleva su razón escrita se lee en el propio DONE sin que nadie la cruce.
function testedCriteria(value) {
  return String(value || '').split(/\s*;\s*/).filter(Boolean)
    .map((item) => ((item.match(/^(C\d+)\s*(?:→|->)/i) || [])[1] || '').toUpperCase())
    .filter(Boolean)
}

// `cited` son los criterios que la historia declaró cubrir. Rastrear de más es legítimo —una prueba
// puede cerrar dos criterios—; lo que no puede es que el criterio citado se quede sin ninguna
// aserción, porque la épica cierra igual y nadie vuelve a mirarlo.
function validateDoneEntry(entry, cited = []) {
  const at = `${entry.source} ${entry.slug}`
  const errors = []
  if (!entry.tests) errors.push(`${at}: falta tests:`)
  else if (!validTestTrace(entry.tests)) {
    errors.push(`${at}: tests debe rastrear A/CN → prueba o justificar n/a — razón`)
  }
  const traced = testedCriteria(entry.tests)
  if (traced.length) {
    const missing = cited.filter((id) => !traced.includes(id))
    if (missing.length) errors.push(`${at}: la historia cita ${missing.join(', ')} y tests: no lo rastrea`)
  }
  if (entry.commit && !validCommitTrace(entry.commit)) {
    errors.push(`${at}: commit debe apuntar a <sha> <asunto> o justificar n/a — razón`)
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
  // Un borrador se escribe con los bordes marcados; activarla es decir que ya no quedan. Cerrarla con uno
  // adentro es peor: la evidencia queda apoyada sobre algo que nadie decidió.
  if (epic.status !== 'open' && epic.placeholders && epic.placeholders.length) {
    errors.push(`${at}: ${epic.status} con ${epic.placeholders.length} marcador(es) sin resolver `
      + `— "${epic.placeholders[0]}"`)
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

// El número de una regla es su identificador, y lo cita todo el sistema: cargos, workflows, plantillas
// y entradas de DONE. El override se declara escribiendo un archivo con el mismo nombre que el del
// sistema —ahí redefinir sus números es el punto—; en cualquier otro archivo, reusar un `R` crea una
// segunda definición que nadie declaró y que ninguna herramienta veía. Las propias se numeran `P`.
function ruleIds(file) {
  return [...P.read(file).matchAll(/^##\s+([A-Z]\d+)\s+[—-]/gm)].map((match) => match[1])
}

function validateRules(dir) {
  const rules = path.join(dir, 'rules')
  const owner = new Map()
  const errors = []
  const files = (sub) => {
    try {
      return fs.readdirSync(path.join(rules, sub), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
        .map((entry) => entry.name).sort()
    } catch { return [] }
  }
  const system = new Set(files('system'))
  for (const name of system) {
    for (const id of ruleIds(path.join(rules, 'system', name))) {
      if (owner.has(id)) errors.push(`rules/system/${name}: ${id} ya lo define ${owner.get(id)}`)
      else owner.set(id, `rules/system/${name}`)
    }
  }
  for (const name of files('')) {
    // El override se declara por nombre: redefinir los números del archivo que reemplaza es su función.
    if (system.has(name)) continue
    for (const id of ruleIds(path.join(rules, name))) {
      const previo = owner.get(id)
      if (!previo) { owner.set(id, `rules/${name}`); continue }
      errors.push(previo.startsWith('rules/system/')
        ? `rules/${name}: ${id} ya lo define ${previo}; una regla propia se numera P1..Pn, `
          + 'o vive en un archivo con el mismo nombre para declarar el override'
        : `rules/${name}: ${id} ya lo define ${previo}`)
    }
  }
  return errors
}

// Una decisión que no dice si rige no decide nada, y el molde traía el menú entero en la línea de estado:
// tres de las dieciséis decisiones escritas con este modelo se publicaron con el menú intacto. Presentar
// las opciones no obliga a elegir; esto sí. Las secciones son las cuatro que se escriben siempre —las
// alternativas quedan en el molde sin exigirse, porque pedirlas rechazaría quince decisiones que existen—.
const ADR_STATES = ['Propuesto', 'Aceptado', 'Obsoleto']
const ADR_SUPERSEDED = /^Reemplazada por \[[^\]]+\]\([^)]+\)(?: \(\d{4}-\d{2}-\d{2}\))?$/
const ADR_SECTIONS = ['Contexto', 'Decisión', 'Consecuencias', 'Estado de implementación']

function validateAdrFile(at, text) {
  const errors = []
  const estado = ((text.match(/^\*\*Estado:\*\*\s*(.+?)\s*$/m) || [])[1] || '').trim()
  if (!estado) errors.push(`${at}: falta **Estado:**`)
  else if (estado.includes('|')) errors.push(`${at}: el estado sigue siendo el menú de la plantilla; elegí uno`)
  else if (!ADR_STATES.includes(estado) && !ADR_SUPERSEDED.test(estado)) {
    errors.push(`${at}: estado "${estado}" fuera de ${ADR_STATES.join(' | ')} `
      + '| Reemplazada por [NNN](NNN-slug.md)')
  }
  for (const section of ADR_SECTIONS) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(text)) errors.push(`${at}: falta ## ${section}`)
  }
  return errors
}

// El nombre lleva el id porque de ahí sale la identidad con que se detecta un override, y porque una
// decisión se cita por número. Sin él, el archivo existe y no lo alcanza ninguna referencia.
function validateAdr(dir) {
  const adr = path.join(dir, 'adr')
  const errors = []
  const numbers = new Map()
  const scan = (sub, pattern) => {
    let entries = []
    try { entries = fs.readdirSync(path.join(adr, sub), { withFileTypes: true }) } catch { return }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      if (entry.name === 'README.md' || entry.name === '000-template.md') continue
      const at = `adr/${sub ? `${sub}/` : ''}${entry.name}`
      const id = entry.name.match(pattern)
      if (!id) {
        errors.push(`${at}: nadie lo lee como decisión. Una ADR se nombra NNN-<slug>.md, `
          + 'y la del sistema <ID>-NNN-<slug>.md en system/.')
        continue
      }
      if (numbers.has(id[1])) errors.push(`${at}: ${id[1]} ya lo usa ${numbers.get(id[1])}`)
      else numbers.set(id[1], at)
      errors.push(...validateAdrFile(at, P.read(path.join(adr, sub, entry.name))))
    }
  }
  scan('', /^(\d{3})-[a-z0-9-]+\.md$/)
  scan('system', /^([A-Z][A-Z0-9]*-\d{3})-[a-z0-9-]+\.md$/)
  return errors
}

module.exports = {
  testedCriteria,
  validateAdr,
  validateRules,
  validateBacklogStructure,
  validCommitTrace,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
  validateEpic,
  validateRoadmapStructure,
}
