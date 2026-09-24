'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')
const { PLACEHOLDERS } = require('../core/onboarding')
const { acceptanceConditions, OUT_OF_VERIFY, NON_EXECUTABLE } = require('./acceptance')

const TEST_TRACE = /^(?:n\/a\s*[—-]\s*.+|(?:A|C\d+)\s*(?:→|->)\s*\S.+)$/i
const DECISION_TRACE = /\[(?:fuente|supuesto):\s*[^\]]+\]/i
const COMMIT_TRACE = /^(?:n\/a\s*[—-]\s*.+|[0-9a-f]{7,40}\s+\S.*)$/i

// Se corta en `;` sólo cuando detrás **empieza otra traza**. Es la misma decisión que `validCommitTrace`
// toma unas líneas más abajo para el sha, y por el mismo motivo: el `;` es el separador que R8 fija y a
// la vez el signo más común de la prosa española, y este campo pide las dos cosas — el contrato pide
// `CN → prueba` y R9 pide decir cómo se vio fallar esa prueba.
//
// Con el corte a secas, una sola traza con prosa se partía en tres y el campo se rechazaba entero: el
// mensaje mandaba a revisar la traza, que era lo único que estaba bien, y la salida fácil era acortar la
// prosa hasta que pasara — o sea empobrecer justo la evidencia que R9 exige. Pasó dos veces en dos días
// en una instancia real (caso 072).
//
// Lo comparten `validTestTrace` y `testedCriteria` porque «dónde termina una traza» es una sola decisión
// y no dos. Con los datos de hoy las dos formas de partir dan el mismo resultado —un `;` que no abre
// traza no produce un fragmento que empiece por `Cn →`, así que el rastreo no cambia—, y por eso ninguna
// prueba lo distingue: comprobado con una mutación que hace partir distinto a cada uno y sobrevive. Se
// comparte igual, para que no se separen el día que una de las dos cambie.
const TRACE_SPLIT = /\s*;(?=\s*(?:(?:A|C\d+)\s*(?:→|->)|n\/a\s*[—-]))\s*/i
const splitTraces = (value) => String(value || '').split(TRACE_SPLIT).map((one) => one.trim()).filter(Boolean)

function validTestTrace(value) {
  return splitTraces(value).every((item) => TEST_TRACE.test(item))
}

function validDecisionTrace(value) {
  const text = String(value || '').trim()
  return !text || DECISION_TRACE.test(text)
}

// El campo apunta al artefacto entregado, y el único puntero que no se puede escribir de memoria es el
// sha. La salida explícita existe porque hay tareas que no producen commit —abrir una fila en
// HUMAN_ACTIONS, registrar un informe—, y forzarlas a llenar el campo produce un sha inventado, que es
// peor que la ausencia: parece evidencia.
// Se corta en cada `|`, y en un `;` sólo cuando detrás viene un sha: el `;` aparece también dentro del
// paréntesis final —`(api@main; sin footer Task:)`— y cortar ahí convertiría una nota en un commit que
// falta. Cada tramo responde por sí mismo; validar sólo el primero dejaba pasar la mitad sin artefacto.
const commitParts = (value) => String(value || '').trim().split(/\s*(?:\||;(?=\s*[0-9a-f]{7,40}\s))\s*/)

function validCommitTrace(value) {
  return commitParts(value).every((part) => COMMIT_TRACE.test(part.trim()))
}

// Los criterios que la evidencia realmente rastrea. `n/a — razón` no rastrea ninguno a propósito: es
// la salida explícita, y como lleva su razón escrita se lee en el propio DONE sin que nadie la cruce.
function testedCriteria(value) {
  return splitTraces(value)
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
// El vocabulario del carril tal como se escribe en una entrada de DONE: los cuatro de la línea del
// BACKLOG más el que dice que la línea no lo declaraba. `sin clasificar` no es un hueco disimulado — es
// el estado que `PROTOCOL.md` ya llama estado y no error, y escribirlo distingue «corrió sin carril» de
// «nadie escribió el campo», que es justo lo que este campo vino a poder contestar.
const LANE_VALUES = [...P.LANES, 'sin clasificar']

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
  // El carril con el que la tarea corrió. Ausente **avisa** y no frena, porque toda entrada escrita antes
  // de que el campo existiera lo está y no hay de dónde sacárselo: exigirlo pondría en rojo el `check` de
  // cada instancia que actualiza, por algo que nadie puede arreglar. Escrito mal sí frena, porque eso es
  // un valor que alguien puso y de él depende leer si la ceremonia fue la que correspondía (OPS-006).
  if (entry.lane && !LANE_VALUES.includes(entry.lane)) {
    errors.push(`${at}: lane "${entry.lane}" no existe; usá ${LANE_VALUES.join(' | ')}`)
  }
  const story = epics.find((epic) => epic.num === entry.epic)?.stories
    .find((candidate) => candidate.slug === entry.slug)
  return [...errors, ...validateDoneEntry(entry, story ? story.criteria : [])]
}

// Un carril declara **cuánta ceremonia** merecía la tarea; `n/a` en `review:` dice que la revisión no
// corrió. `express` es el único que no convoca revisor, así que en los otros tres esa combinación es la
// ADR incumplida, escrita en el propio registro.
const REVIEWED_LANES = ['directo', 'lite', 'full']
const NO_REVIEW = /^n\/a\b/i

// Lo que el registro puede decir sobre la ceremonia, y lo que todavía no. Los dos campos avisan en vez de
// fallar por lo que dice `doneEntryErrors`, y cuentan en vez de listar porque al principio son todas: lo
// que se lee es que el número baje. Cuando llegue a cero, exigirlos deja de costarle nada a nadie.
//
// El cruce sí nombra las tareas, porque son pocas y cada una es una pregunta concreta para una persona.
// Y también avisa en vez de fallar, por una razón distinta de la de los campos: es un hecho del pasado
// que no se arregla editando la entrada, así que el único camino al verde sería reescribir el registro.
// Un gate que se apaga mintiendo es peor que no tenerlo.
//
// `sin clasificar` queda afuera del cruce a propósito: el recorrido corre esas tareas por el carril
// completo, pero eso lo sabe el recorrido y no la entrada. Avisar sobre lo que hay que deducir es lo que
// llena de ruido un aviso que después nadie mira.
function doneCeremonyWarnings(done, adopted = new Set()) {
  const own = done.entries.filter((entry) => !adopted.has(entry.slug))
  const warnings = []
  const withoutLane = own.filter((entry) => !entry.lane)
  if (withoutLane.length) {
    warnings.push(`planning/done: ${withoutLane.length} entrada(s) sin lane:, así que no se puede comprobar `
      + 'sobre el registro que la ceremonia que recibieron fue la que su superficie pedía (OPS-006)')
  }
  const withoutReview = own.filter((entry) => !entry.review)
  if (withoutReview.length) {
    warnings.push(`planning/done: ${withoutReview.length} entrada(s) sin review:, que es la dimensión con la `
      + 'que OPS-006 dice que se mide si el carril elegido fue el correcto')
  }
  const skipped = own.filter((entry) => REVIEWED_LANES.includes(entry.lane)
    && entry.review && NO_REVIEW.test(entry.review))
  if (skipped.length) {
    warnings.push(`planning/done: ${skipped.map((entry) => entry.slug).join(', ')} declara(n) un carril `
      + 'que convoca revisor y una revisión que no corrió: el carril reduce ceremonia, nunca evidencia')
  }
  return warnings
}

// Lo que sólo existe después de Verify: el registro de la tarea, no su producto. `done/<slug>.md` lo
// escribe Done, el commit lo escribe Commit y el reclamo se libera al cerrar, así que una aceptación que
// pida verlos pide algo que en Verify todavía no puede estar.
const POST_VERIFY = [
  [/\bplanning\/done\b|\bdone\/|\bentrada de DONE\b/i, 'planning/done/'],
  [/\bla evidencia\b|\bevidencia registrada\b/i, 'la evidencia'],
  [/\bel commit\b|\bcommitead[oa]\b/i, 'el commit'],
  [/\bel reclamo\b|\bclaims\//i, 'el reclamo'],
]

// Una condición de aceptación que nombra el registro en vez del producto no se puede cumplir nunca: se
// comprueba en Verify, que corre antes que Commit y que Done. El recorrido lo detecta —y hace bien—, pero
// recién ahí: en la corrida que originó esto fueron 1,2 M de tokens y once agentes para terminar con el
// trabajo hecho, sin commit y sin poder cerrar (caso 140).
//
// Avisa y no falla, por lo mismo que el aviso de HUMAN_ACTIONS resueltas sin commit —que nació del 121,
// el mismo daño y el mismo tamaño—: el patrón es de texto y una aceptación legítima puede mencionar la
// palabra sin depender de ella. Un aviso que salta siempre se termina apagando.
//
// Se juzga condición por condición y no la aceptación entera, que es el grano con el que Verify contrasta
// —su `uncovered` enumera criterios—: las aceptaciones reales traen varias y marcar el párrafo completo
// señala a las que están bien por vecindad. Y la marca se busca en la condición, no en la tarea, para que
// excluir una no exima a las demás.
//
// Lo que corresponde casi siempre no es borrar la cláusula sino moverla: `tests:`, `qa:` y `commit:` de
// DONE ya exigen ese registro (PROTOCOL), así que repetirlo en la aceptación no agrega garantía — agrega
// un bloqueo. Cuando sí corresponde dejarla, se declara y pasa en silencio.
function unverifiableAcceptance(milestones = []) {
  const warnings = []
  for (const milestone of milestones) {
    for (const task of milestone.tasks || []) {
      for (const condition of acceptanceConditions(task.acceptance)) {
        if (OUT_OF_VERIFY.test(condition)) continue
        const names = POST_VERIFY.filter(([pattern]) => pattern.test(condition))
        if (!names.length) continue
        warnings.push(`BACKLOG ${task.slug}: una condición nombra ${names.map(([, what]) => what).join(', ')}`
          + ', que existe después de Verify, así que no se puede comprobar cuando se la comprueba. Eso va '
          + 'en tests:, qa: o commit: de su entrada de DONE, que ya lo exigen; si de verdad va acá, '
          + 'declaralo con "(fuera de verify: <razón>)"')
      }
    }
  }
  return warnings
}

// `tests: n/a` dice que la tarea no produjo nada que se ejecute, y quien lo escribe es el mismo que quiere
// cerrar: desde el 189 el recorrido lo emite cuando Verify declara `no-surface`, que es la palabra de un
// modelo. Lo que la vuelve creíble es mirar qué tocó el commit, y eso no lo decide nadie. Se juzga el n/a
// entero y no el mixto: en una tarea que rastrea algún criterio con su prueba, el código del commit es el
// de esos criterios y no dice nada del que se declaró sin superficie.
//
// `filesOf` devuelve los archivos de un sha, o null si ningún repositorio lo conoce. Ahí calla, igual que
// el resto de lo que pregunta a git desde `check`: un sha que no se encuentra no es superficie, y avisarlo
// sería inventar el hallazgo. Lo adoptado queda afuera por lo mismo que en el resto de DONE: se escribió
// antes de que el contrato lo pidiera.
//
// Y rige desde que existe. Una entrada cerrada antes con `tests: n/a` sobre código no violó nada que se le
// hubiera pedido, y frenarla ahora pondría `check` en rojo con el `upgrade` —y con él al guard que lo corre
// antes de cada commit— por algo que nadie puede corregir sin reescribir evidencia. Es la misma razón por
// la que se exime lo adoptado, aplicada a lo que ya estaba cerrado cuando la regla llegó.
const NOT_APPLICABLE = /^n\/a\s*[—-]/i
const SURFACE_SINCE = '2026-09-24'

function surfaceWithoutTests(entries, filesOf, adopted = new Set()) {
  const errors = []
  for (const entry of entries) {
    const traces = splitTraces(entry.tests)
    if (adopted.has(entry.slug) || !traces.length || !traces.every((one) => NOT_APPLICABLE.test(one))) continue
    if (!(String(entry.fecha || '') >= SURFACE_SINCE)) continue
    for (const sha of commitParts(entry.commit).map((part) => (part.match(/^([0-9a-f]{7,40})\s/) || [])[1])) {
      if (!sha) continue
      const surface = (filesOf(sha) || [])
        .filter((file) => !NON_EXECUTABLE.includes(path.extname(file).toLowerCase()))
      if (!surface.length) continue
      const shown = surface.length > 5 ? [...surface.slice(0, 5), `y ${surface.length - 5} más`] : surface
      errors.push(`${entry.source} ${entry.slug}: tests: n/a dice que no hay superficie ejecutable y el commit `
        + `${sha} toca ${shown.join(', ')}; sólo ${NON_EXECUTABLE.join(', ')} cuentan como no ejecutables, `
        + 'así que esos criterios se rastrean con su prueba')
    }
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
  const state = new Map()
  const visit = (slug, trail) => {
    if (state.get(slug) === 'listo') return
    const from = trail.indexOf(slug)
    if (from >= 0) {
      const cycle = [...trail.slice(from), slug]
      errors.push(`BACKLOG: ciclo de dependencias ${cycle.join(' → ')}`)
      return
    }
    for (const dep of queued.get(slug) || []) {
      // La que se depende a sí misma ya tiene su error, más claro que un ciclo de un solo paso.
      if (dep !== slug && queued.has(dep)) visit(dep, [...trail, slug])
    }
    state.set(slug, 'listo')
  }
  for (const slug of queued.keys()) visit(slug, [])
  return [...new Set(errors)]
}

// Todo lo que se juzga sobre el estado ya leído: épicas, hitos, tareas, WIP, evidencia y acciones
// humanas. Vive acá y no en el CLI porque es de la misma clase que sus vecinas —`validateEpic`,
// `validateDoneEntry`, `validateRules`— y estaba creciendo del otro lado sólo porque ahí era más
// rápido escribirla. No lee nada: recibe el estado, así que se prueba sin tocar disco.
function validateState({
  epics, milestones, done, wips = [], roles = new Set(), humanActions = [], adopted = new Set(),
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

  for (const wip of wips) {
    const at = `wip/${wip.runner}.md`
    if (!backlogSlugs.has(wip.task) && !done.set.has(wip.task)) {
      errors.push(`${at}: ${wip.task} no existe en BACKLOG ni DONE`)
    }
  // El WIP es el punto de retorno tras una interrupción, y el protocolo manda seguir desde el primer
  // paso sin tildar. Un plan que el motor no puede contar se lee como un plan terminado, así que la
  // recuperación se queda sin de dónde retomar justo cuando es lo único que quedó del trabajo.
    if (!wip.complete && !wip.pending) {
      errors.push(`${at}: el plan de ${wip.task} no tiene pasos que el motor pueda contar; `
        + 'se escriben `1. [ ] paso`')
    }
  }
  for (const row of humanActions) {
    if (!row.valid) {
      errors.push(`HUMAN_ACTIONS ${row.task}: estado "${row.state}" fuera de `
        + `${P.HUMAN_ACTION_STATES.join(' | ')}; mientras no se entienda, la tarea queda bloqueada`)
      continue
    }
    // La primera columna es a la vez lo que una persona lee y la clave con la que el motor bloquea:
    // la selección de tarea (`state.js`) arma su conjunto de bloqueadas con ella tal cual. Esa doble
    // función es libre a propósito —el molde manda
    // nombrar la épica o el recorrido cuando la tarea todavía no existe— así que lo que no se puede
    // recortar es la libertad, y lo que sí se puede es la forma intermedia: la celda que **menciona** una
    // tarea de la cola sin ser su slug.
    //
    // Es la peor de las tres porque promete un bloqueo que no ocurre, y nada lo dice: la fila se escribe
    // sin error, sale en `ops context` bajo HUMAN como si estuviera registrada, y la tarea se sigue
    // ofreciendo. `**slug: de qué se trata**` es la que sale natural, porque esta tabla la lee una
    // persona. Sin esto la ausencia no deja rastro, que es la forma de R15 aplicada a un mecanismo.
    if (backlogSlugs.has(row.task)) continue
    const near = [...backlogSlugs].find((slug) => new RegExp(`\\b${slug}\\b`).test(row.task))
    if (near) {
      errors.push(`HUMAN_ACTIONS: la fila "${row.task}" nombra a ${near} y no bloquea nada, porque el `
        + `motor bloquea por la primera columna exacta. Dejá "${near}" sola ahí y contá el resto en la `
        + 'acción, o nombrá la épica o el recorrido si lo que se frena no es esa tarea')
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
  doneCeremonyWarnings,
  unverifiableAcceptance,
  surfaceWithoutTests,
  validCommitTrace,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
  validateEpic,
}
