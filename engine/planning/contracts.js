'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')
const { PLACEHOLDERS } = require('../core/onboarding')

const TEST_TRACE = /^(?:n\/a\s*[—-]\s*.+|(?:A|C\d+)\s*(?:→|->)\s*\S.+)$/i
const DECISION_TRACE = /\[(?:fuente|supuesto):\s*[^\]]+\]/i
const COMMIT_TRACE = /^(?:n\/a\s*[—-]\s*.+|[0-9a-f]{7,40}\s+\S.*)$/i

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

// Los cinco juicios que recibe una entrada de DONE, juntos. Estaban repartidos entre el bucle que las
// recorre y `validateDoneEntry`, y ese reparto no se nota hasta que algo tiene que preguntar «¿a esta
// entrada le falta *algo*?»: la primera versión de la exención por adopción se escribió en una de las
// dos mitades y las otras cuatro comprobaciones seguían fallando.
//
// Los criterios que la historia declaró cubrir los cita el roadmap y no la entrada, así que el cruce
// sólo existe si la entrada dice de qué épica viene.
function doneEntryErrors(entry, epics = []) {
  const at = `${entry.source} ${entry.slug}`
  const errors = []
  if (!entry.acceptance) errors.push(`${at}: falta acept:`)
  // La fecha de cierre. Mientras las entradas vivían en un archivo, el orden lo daba la posición; con un
  // archivo por tarea no hay posición, y sin fecha no hay forma de saber cuál se cerró antes.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.fecha)) errors.push(`${at}: falta fecha: AAAA-MM-DD`)
  if (!entry.done) errors.push(`${at}: falta done:`)
  if (!entry.qa) errors.push(`${at}: falta qa:`)
  if (!entry.commit) errors.push(`${at}: falta commit:`)
  const story = epics.find((epic) => epic.num === entry.epic)?.stories
    .find((candidate) => candidate.slug === entry.slug)
  return [...errors, ...validateDoneEntry(entry, story ? story.criteria : [])]
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

// Las dependencias declaradas, contra lo que existe y contra sí mismas. Dos errores distintos y los dos
// dejan tareas que no se le ofrecen a nadie: una que depende de algo que no existe no está lista nunca, y
// un ciclo se traba entero. Las dos se ven como una cola que no avanza y sin causa visible.
function dependencyErrors(milestones, done) {
  const errors = []
  const tasks = milestones.flatMap((milestone) => milestone.tasks)
  const queued = new Map(tasks.map((task) => [task.slug, task.depends || []]))
  for (const task of tasks) {
    for (const dep of task.depends || []) {
      if (dep === task.slug) errors.push(`BACKLOG ${task.slug}: depende de sí misma`)
      else if (!queued.has(dep) && !done.set.has(dep)) {
        errors.push(`BACKLOG ${task.slug}: depende de ${dep}, que no existe en BACKLOG ni DONE`)
      }
    }
  }
  // Recorrido en profundidad con el camino a cuestas: al reencontrar un slug que sigue en el camino,
  // ese camino **es** el ciclo, y nombrarlo entero es lo que lo hace reparable — decir sólo que hay uno
  // deja el trabajo de encontrarlo del lado de quien lee.
  const estado = new Map()
  const visitar = (slug, camino) => {
    if (estado.get(slug) === 'listo') return
    const desde = camino.indexOf(slug)
    if (desde >= 0) {
      const ciclo = [...camino.slice(desde), slug]
      errors.push(`BACKLOG: ciclo de dependencias ${ciclo.join(' → ')}`)
      return
    }
    for (const dep of queued.get(slug) || []) {
      // La que se depende a sí misma ya tiene su error, más claro que un ciclo de un solo paso.
      if (dep !== slug && queued.has(dep)) visitar(dep, [...camino, slug])
    }
    estado.set(slug, 'listo')
  }
  for (const slug of queued.keys()) visitar(slug, [])
  return [...new Set(errors)]
}

// Todo lo que se juzga sobre el estado ya leído: épicas, hitos, tareas, WIP, evidencia y acciones
// humanas. Vive acá y no en el CLI porque es de la misma clase que sus vecinas —`validateEpic`,
// `validateDoneEntry`, `validateRules`— y estaba creciendo del otro lado sólo porque ahí era más
// rápido escribirla. No lee nada: recibe el estado, así que se prueba sin tocar disco.
function validateState({
  epics, milestones, done, wip, roles = new Set(), humanActions = [], adopted = new Set(),
}) {
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

  errors.push(...dependencyErrors(milestones, done))

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
    // La entrada exenta por adopción se saltea entera. Es por entrada y no por campo ausente: una
    // historia escrita bajo otro contrato puede traer un `commit:` con formato ajeno, y perdonar sólo
    // «falta X» la dejaría fallando por lo que sí escribió.
    if (adopted.has(entry.slug)) continue
    errors.push(...doneEntryErrors(entry, epics))
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
module.exports = {
  validateState,
  doneEntryErrors,
  validCommitTrace,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
  validateEpic,
}
