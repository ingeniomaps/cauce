'use strict'

// Contratos deterministas de planning; no contiene estado de proyecto.

const fs = require('node:fs')
const path = require('node:path')
const { frontmatter: fields } = require('../core/frontmatter')
const { PLACEHOLDERS } = require('../core/onboarding')

const EPIC_STATES = ['open', 'active', 'closed']

// Vocabulario común de paradas. Una parada sin nombre obliga a quien la recibe —persona, supervisor o
// workflow— a reconstruir del estado entero qué pasó, y es lo primero que se pierde cuando cada runner
// inventa su propia frase. `context` emite las dos que puede determinar solo; el resto las nombra la
// fase que para.
const STOP_REASONS = [
  'awaiting-review', 'blocked-on-human', 'not-ready', 'plan-rejected', 'review-unresolved',
  'verify-regression', 'verify-inconsistent', 'qa-failed', 'commit-failed', 'budget-low',
]

// El contrato de una línea de BACKLOG, en un solo lugar: lo usa el lector para armar la cola y el
// validador para rechazar lo que el lector va a descartar. Separados, el validador aprobaba la forma
// que el lector no leía, que es la manera más cara de tener las dos cosas.
const MILESTONE_HEADING = /^##\s+Hito\s+([^\s]+)\s+[—-]\s+(.+)$/

// Los carriles, en orden de ceremonia creciente. El orden es parte del vocabulario, porque un carril
// leído fuera de orden se elige por su nombre y no por su criterio. Que la prosa del PROTOCOL vaya en
// este mismo orden lo ata la suite del toolkit —`planning-template.test.js`—, no `check`: un workflow
// en sandbox no puede importar este módulo, así que la atadura es una prueba y no una validación.
const LANES = ['express', 'directo', 'lite', 'full']
const TASK_LINE = new RegExp(
  String.raw`^-\s+\[\s\]\s+\*\*([^*]+)\*\*\s*(?:\[(${LANES.join('|')})\])?\s+[—-]\s+(.+)$`,
)
// Lo mismo con cualquier tag: distingue el lane inexistente de la línea sin lane, que es un estado
// legítimo. Sin esa diferencia las dos caían en «no la lee nadie» y la corrección no era la misma.
const TASK_LINE_ANY_LANE = /^-\s+\[\s\]\s+\*\*([^*]+)\*\*\s*\[([^\]]+)\]\s+[—-]\s+/

function read(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

// Los contratos de planning leen un campo por nombre y no el objeto entero: devolver una función evita
// que cada llamador tenga que preguntar si la clave existe antes de usarla.
function frontmatter(text) {
  const values = fields(text)
  return (key) => values[key] || ''
}

// La coincidencia exacta gana sobre la parcial, y sólo si no hay exacta se acepta la parcial. Con
// `find` a secas, `## Criterios de aceptación` le ganaba a `## Criterios` por estar antes: la épica que
// promovía una integración traía la sección importada primero y el parser leía esa, que no tiene
// ninguna viñeta `- **CN** —`. Anclar del todo habría roto lo contrario —`## Historias (Tareas)` es un
// título real de una migración—, así que la parcial sigue valiendo cuando es la única.
function section(text, heading) {
  const parts = text.split(/^##\s+/m)
  const titles = parts.map((part) => part.split('\n')[0].trim())
  const exact = parts.findIndex((part, i) => new RegExp(`^${heading.source}$`, heading.flags).test(titles[i]))
  if (exact >= 0) return parts[exact]
  return parts.find((part, i) => heading.test(titles[i])) || ''
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

// La razón por la que una unidad cruza el umbral de R17 y sigue entera. Se escribe con la misma forma
// parentética que el resto del contrato —`(service: …)`, `(epic: 001)`—, y se busca en el texto que es
// de esa unidad y de ninguna otra: el archivo entero para la épica, la línea del encabezado para el
// hito, la línea de la tarea para la tarea.
const noSplitReason = (text) => ((text.match(/\(sin partir:\s*([^)]+)\)/i) || [])[1] || '').trim()

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

function readEpics(dir) {
  return epicFiles(dir).map(({ name, file }) => {
    const text = read(file)
    const field = frontmatter(text)
    // Mismo corte que ya se arregló para las historias: con la bandera `m`, `$` casa fin de línea, así
    // que un criterio envuelto perdía todo lo que venía detrás del salto —normalmente cómo se verifica
    // y qué debe seguir funcionando—. Se lee hasta el próximo criterio o el fin de la sección, y se
    // devuelve en una sola línea porque quien lo recibe lo lee como aceptación, no como markdown.
    const criterionPattern = new RegExp(
      String.raw`^-\s+\*\*(C\d+)(?:[^*]*)\*\*\s+[—-]\s+([\s\S]*?)(?=\n-\s+\*\*C\d+|(?![\s\S]))`,
      'gm',
    )
    const criteria = [...section(text, /Criterios/i).matchAll(criterionPattern)]
      .map((match) => ({ id: match[1], text: match[2].trim().replace(/\s*\n\s*/g, ' ') }))
    // `(?![\s\S])` y no `$`: con la bandera `m` el `$` casa fin de **línea**, así que el cuerpo no ávido
    // cortaba en el primer salto y una historia envuelta perdía su `(service: …)` y sus `(→ CN)`. El
    // error que salía era «no declara (service: <ruta>)» — culpaba al autor de algo que sí había escrito.
    // Dos cargos distintos lo encontraron reescribiendo su historia hasta que entrara en un solo renglón.
    const storyPattern = new RegExp(
      String.raw`^[-*]\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*\s+([\s\S]*?)` +
        String.raw`(?=\n[-*]\s+(?:\[[ xX]\]\s+)?\*\*|\n##|(?![\s\S]))`,
      'gm',
    )
    const stories = [...section(text, /Historias/i).matchAll(storyPattern)]
      .map((match) => ({
        slug: match[1].trim(),
        criteria: criteriaRefs(match[2]),
        service: ((match[2].match(/\(service:\s*([^)]+)\)/) || [])[1] || '').trim(),
      }))
    return {
      file: name,
      path: file,
      num: field('epic'),
      title: field('title'),
      status: field('status'),
      criteria,
      stories,
      hasContext: /^##\s+Contexto relevante/im.test(text),
      // El molde describe esta sección como «lo que el ejecutor lee antes de decidir el cómo», y `check`
      // da error si falta. Hasta acá se comprobaba que estuviera y se tiraba el texto en el mismo
      // renglón, así que quien tenía que leerla nunca la recibía: `context` la resuelve por él, que
      // además tiene prohibido ir a buscarla.
      //
      // Son dos campos y no uno porque contestan distinto: `hasContext` dice si el encabezado está
      // —que es lo que `check` exige hoy— y `context` trae el cuerpo, que puede estar vacío debajo de
      // un encabezado presente. Unificarlos convertiría una sección vacía en un error nuevo, que es
      // otra decisión y no ésta.
      context: section(text, /Contexto relevante/i).split('\n').slice(1).join('\n').trim(),
      noSplit: noSplitReason(text),
      // Las líneas que todavía no decidieron nada. Se guardan enteras y no como un booleano porque el
      // error tiene que decir cuál es: «tiene un marcador» manda a releer la épica entera.
      placeholders: text.split('\n').map((line) => line.trim())
        .filter((line) => line && PLACEHOLDERS.test(line)),
    }
  }).filter((epic) => epic.status !== 'template' && epic.num !== '000')
}

// El reparto viaja en la línea de la tarea —`(cast: quien-entrega → quien-revisa, otro)`—, y la
// flecha es lo que los separa. Los revisores son opcionales porque el lane más barato no tiene
// ninguno, y el reparto entero también: una tarea sin clasificar es el estado que dispara al
// clasificador, no un error. Devuelve siempre la forma completa para que nadie tenga que preguntar
// si el campo existe antes de leerlo.
function readCast(rest) {
  const raw = ((rest.match(/\(cast:\s*([^)]+)\)/i) || [])[1] || '').trim()
  const [build, reviewers] = raw.split(/\s*(?:→|->)\s*/)
  return {
    build: (build || '').trim(),
    review: (reviewers || '').split(',').map((slug) => slug.trim()).filter(Boolean),
  }
}

// El texto de la aceptación, delimitado por las cursivas que lo envuelven. El cierre no es «el
// próximo guión bajo»: un identificador como `MAX_ATTEMPTS` trae los suyos, y cortar en el primero
// devolvía `MAX` con `check` en verde, que es la forma cara del error —la tarea se lee completa y no
// lo está—. Cierra el `_` que markdown cerraría: el que no está entre caracteres de palabra.
const ACCEPTANCE = /_Aceptaci[oó]n:\s*(.*?\S)_(?![A-Za-z0-9])/i

// Cuántas condiciones tiene una aceptación escrita en prosa. Estuvo mucho tiempo sin contarse con una
// razón buena —contar condiciones en una frase es una lectura, y un número inventado es peor que
// ninguno—, y lo que la resuelve es no leer: se cuenta lo que el autor marcó. Los `(N)` cuando hay más
// de uno, y si no los hay, los tramos que él mismo separó con `;`.
//
// Sub-cuenta a propósito. Una frase larga con comas vale 1, y un solo `(1)` suelto también: un umbral
// que salta cuando no debe convierte la escapatoria de R17 en trámite, y ahí la razón se escribe para
// callar el mensaje en vez de para que alguien la lea. Un falso negativo deja las cosas como estaban.
function acceptanceConditions(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const marcadas = (text.match(/\(\d+\)/g) || []).length
  if (marcadas >= 2) return marcadas
  return text.split(';').map((one) => one.trim()).filter(Boolean).length
}

// Una línea de tarea, leída en un solo lugar: `readBacklog` la usa para armar la cola y `recurring.js`
// para juzgar la línea que va a emitir. Es el mismo motivo por el que `TASK_LINE` no está duplicado —
// lo que emite una y lee la otra tiene que ser la misma forma, o el emisor produce lo que el lector
// descarta.
function taskFromLine(line) {
  const task = line.match(TASK_LINE)
  if (!task) return null
  const rest = task[3]
  const acceptance = ((rest.match(ACCEPTANCE) || [])[1] || '').trim()
  return {
    slug: task[1].trim(), tier: task[2] || '', cast: readCast(rest),
    epic: ((rest.match(/\(epic:\s*(\d{3})\)/) || [])[1] || ''),
    service: ((rest.match(/\(service:\s*([^)]+)\)/) || [])[1] || '').trim(),
    acceptance,
    conditions: acceptanceConditions(acceptance),
    criteria: criteriaRefs(rest),
    // De qué otras tareas depende. El orden del BACKLOG alcanzaba mientras hubiera un runner: con dos,
    // el segundo toma la que sigue mientras el primero construye la de la que depende, y el orden deja
    // de decir nada.
    depends: ((rest.match(/\(depende:\s*([^)]+)\)/i) || [])[1] || '')
      .split(',').map((one) => one.trim()).filter(Boolean),
    noSplit: noSplitReason(rest),
  }
}

function readBacklog(dir) {
  const text = withoutComments(read(path.join(dir, 'BACKLOG.md')))
  const milestones = []
  let current = null
  for (const line of text.split('\n')) {
    const heading = line.match(MILESTONE_HEADING)
    if (heading) {
      current = {
        slug: heading[1], title: heading[2].trim(), heading: line.slice(3),
        noSplit: noSplitReason(line), tasks: [],
      }
      milestones.push(current)
      continue
    }
    if (/^##\s+/.test(line)) current = null
    const task = current ? taskFromLine(line) : null
    if (task) current.tasks.push(task)
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

const DONE_FIELDS = 'acept|done|qa|tests|decisions|commit'

// Un campo vale hasta el próximo campo, una línea en blanco o el fin de la entrada. Mismo corte que ya
// se arregló para los criterios y las historias, con el mismo síntoma: el valor es prosa y se envuelve a
// 120 columnas, así que leer sólo la primera línea dejaba afuera lo que el autor escribió y `check`
// reportaba una ausencia que no existía —«decisions debe citar» sobre un campo cuya cita cerraba abajo—.
//
// El corte por línea en blanco no es simetría: el último campo es el único que no tiene otro campo
// detrás, y sin él se traga lo que venga después dentro de la entrada. En silencio, además, porque
// `validCommitTrace` sigue aprobando un `commit` contaminado mientras el prefijo sea válido.
//
// La sangría es `[^\S\n]` y no `\s`: `\s` incluye el salto, así que el match puede empezar en la línea
// anterior y arrastrar una línea en blanco adentro del valor.
function doneField(body, name) {
  const pattern = new RegExp(`^[^\\S\\n]+${name}:[^\\S\\n]*([\\s\\S]*?)`
    + `(?=\\n[^\\S\\n]+(?:${DONE_FIELDS}):|\\n[^\\S\\n]*\\n|(?![\\s\\S]))`, 'mi')
  return ((body.match(pattern) || [])[1] || '').replace(/\s+/g, ' ').trim()
}

function readDone(dir) {
  const entries = []
  for (const file of doneFiles(dir)) {
    const text = withoutComments(read(file))
    const donePattern = /^-\s+\[[xX]\]\s+\*\*([^*]+)\*\*([^\n]*)([\s\S]*?)(?=\n-\s+\[[xX]\]|\n##|(?![\s\S]))/gm
    const matches = [...text.matchAll(donePattern)]
    for (const match of matches) {
      const body = match[3]
      const field = (name) => doneField(body, name)
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

// Vocabulario cerrado del Estado de `HUMAN_ACTIONS.md`. Es cerrado porque de este campo depende que una
// tarea se pueda tomar, y quien lo escribe no recibe ninguna señal de haberlo escrito mal: cualquier
// palabra de fuera del vocabulario deja la fila abierta y su tarea bloqueada sin que nada lo diga.
const HUMAN_ACTION_STATES = ['pendiente', 'resuelta']

// Se lee por el principio de la celda —no por `includes`— para que el detalle que acompaña al estado
// («resuelta 2026-08-17») siga valiendo sin que una palabra suelta dentro de un texto largo resuelva
// una fila que sigue abierta. `valid` distingue la fila mal escrita de la fila pendiente: las dos
// bloquean, pero sólo una es un error que hay que reportar.
// En markdown un pipe dentro de una celda se escribe `\|` —es la única forma que hay— así que partir
// por todo `|` abre esa celda en dos y corre las columnas de la fila. El daño peor es silencioso: con el
// pipe detrás de la palabra del vocabulario, el estado sigue leyéndose bien, `check` pasa y lo que se
// entrega como acción de desbloqueo es el contenido de `Origen`.
//
// Lo que no cubre: una celda que termine en una barra invertida literal. En markdown eso se escribe
// `\\` y acá se leería como escape del separador. Es un borde que nadie escribe y taparlo pedía un
// parser de verdad; queda dicho en vez de supuesto.
const SEPARADOR = /(?<!\\)\|/
const SEPARADORES = /^\|\s*:?-+/

// El escape se quita al normalizar. Esta columna existe para que una persona lea qué tiene que hacer, y
// `\|` no es parte de lo que quiso decir: es cómo markdown escribe un pipe. La fila archivada no se ve
// afectada —`archive` reescribe `raw`, la línea original, no las celdas—, así que quitarlo no pierde nada.
const celda = (cell) => cell.trim().replace(/\\\|/g, '|')

// Las filas de datos de las tablas de un texto, con las celdas ya normalizadas. Vive acá y no en cada
// lector porque el escape del pipe tiene que leerse igual en los dos archivos que traen tabla: escrito
// dos veces, una de las dos copias se pudre sin que nada falle.
//
// En markdown la cabecera es la fila anterior a la de separadores, diga lo que diga su primera celda.
// Se marcan todas y no la primera: un archivo con una tabla por sección tiene una cabecera por tabla,
// y con `findIndex` la segunda y la tercera vuelven a leerse como datos. Nada más se mueve, porque una
// fila de datos nunca está inmediatamente antes de los guiones.
function tableRows(text) {
  const lineas = text.split('\n')
  const cabeceras = new Set(lineas.map((line, i) => (SEPARADORES.test(line) ? i - 1 : -1)))
  return lineas
    .filter((line, i) => /^\|/.test(line) && !SEPARADORES.test(line) && !cabeceras.has(i))
    .map((line) => ({ line, cells: line.split(SEPARADOR).slice(1, -1).map(celda) }))
}

function readHumanActions(dir) {
  const rows = tableRows(withoutComments(read(path.join(dir, 'HUMAN_ACTIONS.md'))))
  // El literal queda como resguardo de la tabla escrita sin su fila de separadores: markdown no la
  // renderiza como tabla, y este parser lee sus filas igual.
  return rows.filter(({ cells }) => cells.length >= 4 && !/^tarea$/i.test(cells[0]))
    .map(({ line, cells }) => {
      const state = (cells[1].match(new RegExp(`^(${HUMAN_ACTION_STATES.join('|')})\\b`, 'i')) || [])[1] || ''
      return {
        task: cells[0], state: cells[1], origin: cells[2], action: cells[3],
        valid: Boolean(state), resolved: state.toLowerCase() === 'resuelta', raw: line,
      }
    })
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

// Un ítem se cuenta cuando empieza con su nombre en negrita, y el nombre existe para poder citarlo
// —`HUMAN_ACTIONS.md` y las propuestas mensuales se refieren a un ítem por ese slug—. La convención se
// conserva; lo que no se conserva es el silencio.
//
// La plantilla no traía ningún ejemplo, así que quien escribía viñetas planas veía cero ítems sobre un
// archivo con doce y nada se lo decía. `skipped` es lo que vuelve visible esa diferencia.
function readInbox(dir) {
  const result = { deuda: 0, ideas: 0, propuestas: 0, lecciones: 0, skipped: 0 }
  for (const part of read(path.join(dir, 'INBOX.md')).split(/^##\s+/m)) {
    const title = part.split('\n')[0]
    const bullets = (part.match(/^[-*]\s+(?:\[[ xX]\]\s+)?/gm) || []).length
    const count = (part.match(/^[-*]\s+(?:\[[ xX]\]\s+)?\*\*/gm) || []).length
    if (/Deuda|Ideas|Visi[oó]n|Propuestas|Lecciones/i.test(title)) result.skipped += bullets - count
    if (/Deuda/i.test(title)) result.deuda = count
    if (/Ideas|Visi[oó]n/i.test(title)) result.ideas = count
    if (/Propuestas/i.test(title)) result.propuestas = count
    if (/Lecciones/i.test(title)) result.lecciones = count
  }
  return result
}

module.exports = {
  EPIC_STATES, HUMAN_ACTION_STATES, LANES, MILESTONE_HEADING, STOP_REASONS,
  TASK_LINE, TASK_LINE_ANY_LANE,
  read, section, withoutComments, frontmatter, readEpics, readBacklog, readDone, readWip,
  acceptanceConditions, tableRows, taskFromLine,
  readInbox, readHumanActions,
}
