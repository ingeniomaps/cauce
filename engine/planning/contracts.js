'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')
const { PLACEHOLDERS } = require('../core/onboarding')

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

// Todo lo que se juzga sobre el estado ya leído: épicas, hitos, tareas, WIP, evidencia y acciones
// humanas. Vive acá y no en el CLI porque es de la misma clase que sus vecinas —`validateEpic`,
// `validateDoneEntry`, `validateRules`— y estaba creciendo del otro lado sólo porque ahí era más
// rápido escribirla. No lee nada: recibe el estado, así que se prueba sin tocar disco.
function validateState({ epics, milestones, done, wip, roles = new Set(), humanActions = [] }) {
  const errors = []
  const epicNums = new Set()
  const storySlugs = new Set()
  const backlogSlugs = new Set(milestones.flatMap((milestone) => milestone.tasks).map((task) => task.slug))
  for (const duplicate of done.duplicates) errors.push(`DONE duplicado: ${duplicate}`)
  for (const epic of epics) {
    const at = `roadmap/${epic.file}`
    errors.push(...validateEpic(epic, done.set))
    if (!/^\d{3}$/.test(epic.num)) errors.push(`${at}: epic debe ser NNN`)
    if (epicNums.has(epic.num)) errors.push(`${at}: número de épica duplicado ${epic.num}`)
    epicNums.add(epic.num)
    if (!epic.title) errors.push(`${at}: falta title`)
    if (!P.EPIC_STATES.includes(epic.status)) errors.push(`${at}: status inválido "${epic.status}"`)
    if (!epic.criteria.length) errors.push(`${at}: falta al menos un criterio observable`)
    if (!epic.stories.length) errors.push(`${at}: falta al menos una historia`)
    if (!epic.hasContext) errors.push(`${at}: falta "## Contexto relevante"`)
    const criteria = new Set(epic.criteria.map((criterion) => criterion.id))
    for (const story of epic.stories) {
      if (storySlugs.has(story.slug)) errors.push(`${at}: slug de historia duplicado ${story.slug}`)
      storySlugs.add(story.slug)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.slug)) errors.push(`${at}: slug inválido ${story.slug}`)
      if (!story.criteria.length) errors.push(`${at}: ${story.slug} no rastrea a un criterio`)
      for (const criterion of story.criteria) {
        if (!criteria.has(criterion)) errors.push(`${at}: ${story.slug} cita ${criterion}, que no existe`)
      }
      if (!story.service) errors.push(`${at}: ${story.slug} no declara (service: <ruta>)`)
    }
    const missing = epic.stories.filter((story) => !done.set.has(story.slug))
    if (epic.status === 'active' && !missing.length) errors.push(`${at}: active sin historias pendientes; debe cerrar`)
  }

  const milestoneSlugs = new Set()
  for (const milestone of milestones) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(milestone.slug)) errors.push(`hito con slug inválido: ${milestone.slug}`)
    if (milestoneSlugs.has(milestone.slug)) errors.push(`hito duplicado: ${milestone.slug}`)
    // La misma puerta que la épica y la tarea, en el nivel que no la tenía. Un hito agrupa trabajo bajo
    // un nombre, y abrirlo con el nombre puesto para después es el camino natural: nadie promueve una
    // tarea sin aceptación, y en cambio el título del hito se decide al final, cuando ya se construyó
    // debajo. El marcador es lo único que se puede juzgar sin leer — un título vago sigue pasando, y
    // eso es deliberado: acá también un heurístico sobre prosa se equivocaría en los dos sentidos.
    if (PLACEHOLDERS.test(milestone.title)) {
      errors.push(`hito ${milestone.slug}: el título no está decidido — "${milestone.title}"`)
    }
    milestoneSlugs.add(milestone.slug)
    for (const task of milestone.tasks) {
      if (!task.service) errors.push(`BACKLOG ${task.slug}: falta (service: <ruta>)`)
      // Un cargo mal escrito se queda sin resolver en la fase que lo invoca, y ahí ya se gastó todo
      // lo anterior: la revisión desaparece sin que nada falle. Se contrasta acá, antes de ejecutar.
      // Con el catálogo vacío no hay nada contra qué contrastar —una instancia sin la dependencia
      // instalada—, y exigirlo igual convertiría cada cast en un error.
      for (const slug of [task.cast.build, ...task.cast.review].filter(Boolean)) {
        if (roles.size && !roles.has(slug)) {
          errors.push(`BACKLOG ${task.slug}: el cast nombra ${slug}, que no está en el catálogo`)
        }
      }
      if (!task.acceptance && !(task.epic && task.criteria.length)) {
        errors.push(`BACKLOG ${task.slug}: falta aceptación explícita o criterio heredado`)
      }
      // La misma puerta que la épica, un piso abajo: la épica rechaza el marcador al activarse, pero la
      // tarea es lo que un runner recibe. Se juzga la frase que `context` le va a entregar —propia o
      // heredada del criterio—, porque en las dos formas llega igual y se decide sola.
      const inherited = epics.find((epic) => epic.num === task.epic)?.criteria
        .filter((criterion) => task.criteria.includes(criterion.id))
        .map((criterion) => criterion.text).join(' ') || ''
      const acceptance = (task.acceptance || inherited).trim()
      if (acceptance && PLACEHOLDERS.test(acceptance)) {
        errors.push(`BACKLOG ${task.slug}: la aceptación no está decidida — "${acceptance.slice(0, 80)}"`)
      }
      const storyExists = epics.some((epic) => {
        return epic.num === task.epic && epic.stories.some((story) => story.slug === task.slug)
      })
      if (task.epic && !storyExists) {
        errors.push(`BACKLOG ${task.slug}: no existe en epic-${task.epic}`)
      }
      if (done.set.has(task.slug)) errors.push(`${task.slug}: está en BACKLOG y DONE`)
    }
  }

  if (wip && !backlogSlugs.has(wip.task) && !done.set.has(wip.task)) {
    errors.push(`WIP ${wip.task}: no existe en BACKLOG ni DONE`)
  }
  // El WIP es el punto de retorno tras una interrupción, y el protocolo manda seguir desde el primer
  // paso sin tildar. Un plan que el motor no puede contar se lee como un plan terminado, así que la
  // recuperación se queda sin de dónde retomar justo cuando es lo único que quedó del trabajo.
  if (wip && !wip.complete && !wip.pending) {
    errors.push(`WIP ${wip.task}: el plan no tiene pasos que el motor pueda contar; `
      + 'se escriben `1. [ ] paso`')
  }
  for (const row of humanActions) {
    if (!row.valid) {
      errors.push(`HUMAN_ACTIONS ${row.task}: estado "${row.state}" fuera de `
        + `${P.HUMAN_ACTION_STATES.join(' | ')}; mientras no se entienda, la tarea queda bloqueada`)
    }
  }

  for (const entry of done.entries) {
    if (!entry.acceptance) errors.push(`${entry.source} ${entry.slug}: falta acept:`)
    if (!entry.done) errors.push(`${entry.source} ${entry.slug}: falta done:`)
    if (!entry.qa) errors.push(`${entry.source} ${entry.slug}: falta qa:`)
    if (!entry.commit) errors.push(`${entry.source} ${entry.slug}: falta commit:`)
    // Los criterios que la historia declaró cubrir: los cita el roadmap, no la entrada de DONE, así que
    // el cruce sólo existe si la entrada dice de qué épica viene.
    const story = epics.find((epic) => epic.num === entry.epic)?.stories
      .find((candidate) => candidate.slug === entry.slug)
    errors.push(...validateDoneEntry(entry, story ? story.criteria : []))
  }
  return errors
}

// Los umbrales de R17, contados. La regla existía desde antes y nada la medía: una épica de veinte
// criterios pasaba `check` sin una queja, siempre que cada uno tuviera su historia. Es la enumeración
// que nadie contrasta de la que habla R15, y acá el que no contrastaba era el motor.
//
// Cruzar el umbral no es el error: R17 dispara la división, no la decide, y dejar la unidad entera es
// una salida legítima. El error es cruzarlo **sin decidir**. Por eso lo que se exige es la razón —
// `(sin partir: …)`, la misma forma parentética que `(service: …)`—, y con ella puesta la unidad pasa
// en silencio. Avisar igual entrenaría a ignorar el aviso; no exigir nada dejaba la escapatoria sin
// rastro, que era prosa sin mecanismo: exactamente lo que R17 fue hasta que esto existió.
//
// Fijos, sin configurar. La salida ya está adentro de la regla y deja rastro en el artefacto; un umbral
// configurable agrega una segunda salida que no lo deja, porque se sube el día que molesta —o sea
// cuando está funcionando— y queda silenciado para todos sin que nadie lo decida caso por caso. R7 sí
// deja los suyos al proyecto, pero con su razón: dependen del lenguaje y de la superficie. Cinco
// condiciones que un plan tiene que satisfacer a la vez no dependen de ninguna de las dos.
const R17 = { taskCriteria: 5, epicCriteria: 7, milestoneTasks: 9 }

// Se cuenta lo que está estructurado: criterios de la épica, criterios que hereda una tarea, tareas del
// hito. Quedan afuera las dos cosas que no son un conteo: la aceptación escrita en prosa —cuántas
// condiciones tiene una frase es una lectura, y un número inventado ahí sería peor que ninguno— y la
// segunda barra de R17, las cuatro horas de esfuerzo, que no está en el artefacto. Las dos las mira el
// review, que para eso está R3, y la de esfuerzo es la que R17 dice que encuentra lo que ésta deja pasar.
function oversizedUnits({ epics = [], milestones = [] }) {
  const errors = []
  const undecided = (what, count, limit) =>
    `${what}: ${count} (umbral ${limit} de R17). Revisá si son dos resultados con vidas distintas y `
    + 'partilo; si es uno solo, partirlo lo empeora — dejalo entero agregando "(sin partir: <razón>)"'
  const judge = (unit, what, count, limit) => {
    if (count > limit && !unit.noSplit) errors.push(undecided(what, count, limit))
  }
  for (const epic of epics) {
    judge(epic, `roadmap/${epic.file}: criterios`, epic.criteria.length, R17.epicCriteria)
  }
  for (const milestone of milestones) {
    judge(milestone, `hito ${milestone.slug}: tareas`, milestone.tasks.length, R17.milestoneTasks)
    for (const task of milestone.tasks) {
      judge(task, `BACKLOG ${task.slug}: criterios`, task.criteria.length, R17.taskCriteria)
    }
  }
  return errors
}

module.exports = {
  validateState,
  oversizedUnits,
  validateAdr,
  validateRules,
  retiredByOverride,
  validateBacklogStructure,
  validCommitTrace,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
  validateEpic,
  validateRoadmapStructure,
}
