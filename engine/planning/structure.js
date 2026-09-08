'use strict'

// Lo que se juzga leyendo el disco: cómo están armados los directorios de planning —roadmap, BACKLOG,
// reglas y ADR— antes de que alguien componga un estado con ellos.
//
// Vive aparte de `contracts.js` porque es la otra mitad de una costura: aquéllas reciben el estado ya
// leído y se prueban sin tocar disco, éstas abren archivos. Se separaron cuando el archivo cruzó las 500
// líneas, y lo que decidió el corte fue eso y no el número.

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

const EPIC_AUXILIARY_FILES = new Set(['notes.md', 'plan.md', 'research.md', 'spec.md'])

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
  let milestone = ''
  for (const line of text.split('\n')) {
    const heading = line.match(P.MILESTONE_HEADING)
    if (heading) { milestone = heading[1]; continue }
    if (/^##\s+Hito\b/.test(line)) {
      errors.push(`BACKLOG "${line.trim()}": encabezado inválido; se escribe ## Hito <slug> — <Título>, `
        + 'y sin él las tareas que vienen abajo quedan huérfanas')
      milestone = ''
      continue
    }
    if (/^##\s+/.test(line)) { milestone = ''; continue }
    if (!milestone || !/^\s*[-*]\s+\S/.test(line) || P.TASK_LINE.test(line)) continue
    const lane = line.match(P.TASK_LINE_ANY_LANE)
    if (lane) {
      errors.push(`BACKLOG ${lane[1].trim()}: lane "${lane[2]}" no existe; usá ${P.LANES.join(' | ')}, `
        + 'o dejá la tarea sin clasificar')
      continue
    }
    const at = `BACKLOG hito ${milestone}: no la lee nadie`
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

// Qué IDs deja de regir un override por nombre: los que definía el archivo del sistema y el propio no
// redefine. Reemplazar el archivo entero es la función del override y está documentada; lo que no se
// veía es la consecuencia, porque la advertencia nombraba el par de archivos y no la diferencia. El
// caso caro es una regla que el motor sigue exigiendo —R17 lo hace—: queda exigida y sin estar escrita
// en ningún lado, y quien la vea fallar la va a buscar en `rules/`, donde ya no está.
// Dos secciones de una épica que compiten por el mismo rol. El parser prefiere la exacta, así que
// resuelve —y en silencio: quien escribió las dos no se entera de que una se ignora entera. La
// promoción dejó de generarlas cuando lo importado empezó a bajar un nivel; a mano se siguen pudiendo
// escribir, y ahí el aviso es lo único que lo dice.
function competingSections(dir) {
  const roadmap = path.join(dir, 'roadmap')
  const avisos = []
  let files = []
  try { files = fs.readdirSync(roadmap).filter((file) => /^epic-\d{3}-/.test(file)) } catch { return [] }
  for (const file of files.sort()) {
    const text = P.read(path.join(roadmap, file))
    const titles = [...text.matchAll(/^##\s+(.+)$/gm)].map((hit) => hit[1].trim())
    for (const role of [/Criterios/i, /Historias/i]) {
      const casan = titles.filter((title) => role.test(title))
      if (casan.length < 2) continue
      const exact = new RegExp(`^${role.source}$`, role.flags)
      const gana = casan.find((title) => exact.test(title)) || casan[0]
      const ignoradas = casan.filter((title) => title !== gana)
      avisos.push(`roadmap/${file}: "## ${gana}" convive con "## ${ignoradas.join('", "## ')}"; `
        + 'sólo se lee la primera y el resto se ignora entero')
    }
  }
  return avisos
}

function retiredByOverride(dir, name) {
  const rules = path.join(dir, 'rules')
  const system = path.join(rules, 'system', name)
  if (!fs.existsSync(system)) return []
  const redefined = ruleIds(path.join(rules, name))
  return ruleIds(system).filter((id) => !redefined.includes(id))
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
      const definedBy = owner.get(id)
      if (!definedBy) { owner.set(id, `rules/${name}`); continue }
      errors.push(definedBy.startsWith('rules/system/')
        ? `rules/${name}: ${id} ya lo define ${definedBy}; una regla propia se numera P1..Pn, `
          + 'o vive en un archivo con el mismo nombre para declarar el override'
        : `rules/${name}: ${id} ya lo define ${definedBy}`)
    }
  }
  return errors
}

// Una decisión que no dice si rige no decide nada, y el molde traía el menú entero en la línea de estado:
// casi una de cada cinco decisiones escritas con este modelo se publicó con el menú intacto. Presentar
// las opciones no obliga a elegir; esto sí. Las secciones son las cuatro que se escriben siempre —las
// alternativas quedan en el molde sin exigirse, porque pedirlas rechazaría a casi todas las que existen—.
const ADR_STATES = ['Propuesto', 'Aceptado', 'Obsoleto']
const ADR_SUPERSEDED = /^Reemplazada por \[[^\]]+\]\([^)]+\)(?: \(\d{4}-\d{2}-\d{2}\))?$/
const ADR_SECTIONS = ['Contexto', 'Decisión', 'Consecuencias', 'Estado de implementación']

function validateAdrFile(at, text) {
  const errors = []
  const declared = ((text.match(/^\*\*Estado:\*\*\s*(.+?)\s*$/m) || [])[1] || '').trim()
  if (!declared) errors.push(`${at}: falta **Estado:**`)
  else if (declared.includes('|')) errors.push(`${at}: el estado sigue siendo el menú de la plantilla; elegí uno`)
  else if (!ADR_STATES.includes(declared) && !ADR_SUPERSEDED.test(declared)) {
    errors.push(`${at}: estado "${declared}" fuera de ${ADR_STATES.join(' | ')} `
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
  validateRoadmapStructure,
  validateBacklogStructure,
  competingSections,
  retiredByOverride,
  validateRules,
  validateAdr,
}
