'use strict'

// Los nombres y estados que el ciclo de aprendizaje escribe en disco: cómo se llama un informe y una
// propuesta, en qué orden se leen, en qué estado están y dónde se puede escribir. Vive aparte porque
// lo necesitan los dos lados —el ciclo que produce esos documentos y la validación que los juzga— y
// sin este corte cada uno tendría que requerir al otro.

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')
const ownership = require('../core/ownership')

const REQUIRED_SECTIONS = [
  'Hallazgos',
  'Evidencia',
  'Cambio propuesto',
  'Riesgos y regresiones',
  'Evaluación',
  'Aprobación humana',
]

// El molde que una revisión llevó hasta 0.87.0, cuando todavía no empezaba por «Por definir». Sigue acá
// porque los documentos ya escritos no cambian: nueve propuestas del repositorio lo tienen intacto, y siete
// de ellas llegaron firmadas a `main` el 2026-09-14 (caso 135).
const LEGACY_REVISION = `Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. Decilo
explícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus casos, no para
un texto que acaba de fallar su primera medición.`

// Una propuesta firmada y sin aplicar no espera lo mismo que una sin firmar: en la primera la decisión
// ya se tomó y el trabajo quedó detenido; la segunda está bien quieta hasta que alguien la lea.
// `proposalState` no las distingue —mira el frontmatter, y la firma la escribe `sign-proposal.yml` en
// el cuerpo—, así que las dos caían en el mismo `pending` y la que ya tenía autoridad para avanzar se
// veía igual que la que no. Sin ese aviso hay que acordarse, y dos propuestas firmadas el 2026-09-01
// se habrían quedado ahí sin que nada lo dijera.
const SIGNED = /^-[ \t]*Estado:[ \t]*aprobada[ \t]*$/mi

// Los dos destinos que cierran una propuesta. `archived` es «se miró y no cambia nada»: no espera
// trabajo, así que contarla como pendiente deja al cargo reportando deuda que nadie va a pagar. Y por lo
// mismo tampoco puede bloquear la propuesta siguiente, que es lo que hacía mientras el único cerrado era
// `applied`.
const CLOSED = new Set(['applied', 'archived'])

// Si nadie decidió todavía. Vive acá y no en `learning-seal` porque lo miran los dos lados —el que compone
// y el que sella— y sin este corte uno tendría que requerir al otro.
//
// Son dos criterios y hacen falta los dos. El prefijo cubre los moldes que empiezan por «Por definir», que
// es como se escriben desde 0.88.0; la coincidencia exacta cubre el molde viejo, que no empieza así y por
// eso se colaba. Y tiene que ser **exacta**: quien redacta suele continuar la frase del molde en vez de
// borrarla —`qa-engineer/2026-08-r2.md` dice «Una revisión suele no ser aditiva, **y ésta lo es en
// parte**: …» y decide de verdad—, así que comparar por el principio marcaría como vacío lo que está lleno.
const undecided = (value) => {
  const text = String(value || '').trim()
  return !text || /^(por definir|pendiente)\b/i.test(text) || text === LEGACY_REVISION
}

// Un cargo del sistema vive dentro del paquete: escribir ahí perdería el informe en el próximo
// `npm ci`, y además duplicaría en cada empresa una investigación sobre la profesión que se hace
// mejor una sola vez. Lo que sí es de esta empresa es su contexto, y ese tiene otro lugar.
// Un recorrido no viene del paquete cuando lo mantiene este repositorio, así que la pregunta de
// dónde se puede escribir es la misma y la respuesta se resuelve igual: dentro del proyecto, sí.
function assertWritableTeam(root, slug) {
  const dir = path.dirname(require('../flows/registry').read(root, slug).file)
  const own = path.resolve(root, 'flows')
  if (path.resolve(dir).startsWith(`${own}${path.sep}`)) return dir
  throw new Error(
    `${slug} es un recorrido que trae Cauce y su aprendizaje se hace en el toolkit, no acá.\n` +
    `  Para tener una versión propia, copialo a flows/${slug}/ y mantenelo vos.`,
  )
}

function assertWritable(root, agent, kind = 'agent') {
  if (kind === 'flow') return assertWritableTeam(root, agent)
  const found = catalog.find(root, agent)
  // Lo que decide no es si el cargo es del sistema, sino si vive dentro de este repositorio. En el
  // toolkit los cargos del sistema son propios y se aprenden acá; en una instancia vienen del
  // paquete, y escribir ahí se pierde en el próximo `npm ci` o en el próximo upgrade.
  const own = path.resolve(catalog.projectCatalog(root))
  if (path.resolve(found.dir).startsWith(`${own}${path.sep}`)) return found.dir
  throw new Error(
    `${agent} es un cargo que trae Cauce y su aprendizaje se hace en el toolkit, no acá.\n` +
    `  Lo que este cargo debe saber de esta empresa va en organization/roles/${agent}.md.\n` +
    `  Para tener una versión propia del cargo, adoptalo: ops agents fork ${agent}.`,
  )
}

function isoDate(now = new Date()) { return now.toISOString().slice(0, 10) }
function month(now = new Date()) { return now.toISOString().slice(0, 7) }

// Una propuesta por período, y sus revisiones. La revisión existe porque aplicar no es el final del
// ciclo: la evaluación posterior es la que dice si el cambio sirvió, y cuando dice que no, el sello
// —que está para que nadie reaplique lo mismo y duplique cada viñeta— dejaba al cargo con un contrato
// que se sabe mal calibrado y sin camino para corregirlo hasta el mes siguiente. La corrección es un
// cambio distinto: documento propio, firma propia, y la aplicada queda sellada donde está.
const PROPOSAL_NAME = /^(\d{4}-\d{2})(?:-r(\d+))?\.md$/

// Mismo cuidado que con los registros de evaluación: `-` va antes que `.` en ASCII, así que ordenar
// nombres pondría `2026-08-r2.md` delante de `2026-08.md` y la revisión se leería como la más vieja.
function proposalOrder(name) {
  const [, period, revision] = name.match(PROPOSAL_NAME)
  return `${period}-${String(Number(revision || 1)).padStart(4, '0')}`
}

// El tope de la línea de índice. No es estético: es una línea por cargo, todas a la vez, y una que se
// envuelve rompe la columna que hace posible el vistazo.
const SUMMARY_MAX = 120

function proposalFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => PROPOSAL_NAME.test(name))
      .sort((one, other) => proposalOrder(one).localeCompare(proposalOrder(other)))
  } catch { return [] }
}

function frontmatterState(text, fallback) {
  return ((text.match(/^status:\s*(\S+)\s*$/m) || [])[1] || fallback).toLowerCase()
}

// La vigente de un período: con revisiones abiertas, la última. La usan componer y cerrar.
function lastOfPeriod(dir, period) {
  const names = proposalFiles(dir).filter((name) => name.match(PROPOSAL_NAME)[1] === period)
  return names.length ? names[names.length - 1] : ''
}

function proposalState(text) {
  return frontmatterState(text, 'proposed')
}

// El sufijo `-N` es la segunda corrida del mismo día, y es la que trae el veredicto más nuevo. Sin él
// en el patrón, más de una cuarta parte de los registros que existían —de cargos y de recorridos—
// quedaban fuera del ciclo: no entraban a ninguna propuesta y nada lo delataba, que es el modo de fallo
// que el comentario de `markConsolidated` ya describía para el informe atrasado.
const REPORT_NAME = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/

function reportFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .map((name) => [name, REPORT_NAME.exec(name)])
      .filter(([, hit]) => hit)
      .sort(([, a], [, b]) =>
        (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : Number(a[2] || 0) - Number(b[2] || 0)))
      .map(([name]) => name)
  } catch { return [] }
}

module.exports = {
  REQUIRED_SECTIONS, SUMMARY_MAX, PROPOSAL_NAME, REPORT_NAME, undecided, SIGNED, CLOSED,
  assertWritableTeam, assertWritable, isoDate, month,
  proposalOrder, proposalFiles, frontmatterState, proposalState, reportFiles, lastOfPeriod,
}
