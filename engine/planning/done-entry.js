'use strict'

// Lo que una entrada de DONE tiene que traer para contar como evidencia: las trazas de `tests:`, `commit:` y
// `decisions:`, los campos de cierre, el carril y la ceremonia que declara, y el `tests: n/a` que el commit
// desmiente. Juzga una entrada o la lista entera y devuelve errores o avisos en texto; no lee el disco, salvo
// lo que pregunte `filesOf`. Salió de `contracts.js` en el caso 407: la épica, el roadmap y el estado se
// validan allá, y lo que cambia acá es el contrato de la evidencia (PROTOCOL, R8, R9, R14).

const path = require('node:path')
const P = require('./parser')
const { NON_EXECUTABLE } = require('./acceptance')

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

const validDecisionTrace = (value) => !String(value || '').trim() || DECISION_TRACE.test(String(value))

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
    errors.push(`${at}: decisions debe citar [fuente: ...] o [supuesto: ...]. Con los registros de R14: lo verificado `
      + 'o documentado va como [fuente: <qué se corrió o se citó>], y una hipótesis como [supuesto: <qué falta>].')
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
// El vocabulario del carril tal como se escribe en una entrada de DONE: los de la línea del BACKLOG más el
// que dice que la línea no lo declaraba. `sin clasificar` no es un hueco disimulado — es el estado que
// `PROTOCOL.md` ya llama estado y no error, y escribirlo distingue «corrió sin carril» de «nadie escribió
// el campo», que es justo lo que este campo vino a poder contestar.
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
// corrió. `express` y `manual` no convocan revisor, así que en los otros tres esa combinación es la ADR
// incumplida, escrita en el propio registro.
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
  // La crítica del plan, que en la tabla de PROTOCOL corre sólo `full` (caso 433). Desde cuándo se debe no lo dice una
  // fecha del toolkit: la instancia recibe el campo cuando actualiza, y eso no queda escrito en ningún lado. Lo dice su
  // propio registro, con la primera entrada que lo trae. Lo anterior se cuenta, como un campo nuevo; lo posterior sin
  // el campo, o con `n/a`, se nombra, porque es una tarea que ya tenía dónde escribirla. Una instancia que todavía no
  // escribió ninguna sólo cuenta.
  const full = own.filter((entry) => entry.lane === 'full')
  const since = own.filter((entry) => entry.critique).map((entry) => entry.fecha).sort()[0]
  const owed = (entry) => since !== undefined && entry.fecha >= since
  const before = full.filter((entry) => !entry.critique && !owed(entry))
  if (before.length) {
    warnings.push(`planning/done: ${before.length} entrada(s) full sin critique: cerradas antes de que esta instancia `
      + 'escribiera el campo, así que no queda en el registro qué objetó la crítica del plan')
  }
  const uncritiqued = full.filter((entry) => (entry.critique ? NO_REVIEW.test(entry.critique) : owed(entry)))
  if (uncritiqued.length) {
    warnings.push(`planning/done: ${uncritiqued.map((entry) => entry.slug).join(', ')} declara(n) lane: full sin `
      + 'crítica del plan en critique:, y full es el carril que la corre')
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
    // `CN → n/a — razón` y `A → n/a — razón` son las formas que PROTOCOL documenta, y la regla sólo veía el
    // `n/a` pelado: el prefijo se quita antes de juzgar (caso 335).
    const bare = (one) => one.replace(/^(?:A|C\d+)\s*(?:→|->)\s*/i, '')
    if (adopted.has(entry.slug) || !traces.length || !traces.every((one) => NOT_APPLICABLE.test(bare(one)))) continue
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

module.exports = {
  commitParts,
  doneEntryErrors,
  doneCeremonyWarnings,
  surfaceWithoutTests,
  validCommitTrace,
  validDecisionTrace,
  validTestTrace,
  validateDoneEntry,
}
