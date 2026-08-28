'use strict'

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')
const { atomicWrite } = require('../core/files')
// La misma lectura de secciones que usa el planning: repetirla acá sería una segunda copia del mismo
// hecho, y una de las dos se pudre sin que nada falle (R11).
const { section } = require('../planning/parser')

const REQUIRED_SECTIONS = [
  'Hallazgos',
  'Evidencia',
  'Cambio propuesto',
  'Riesgos y regresiones',
  'Evaluación',
  'Aprobación humana',
]

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

// El tope de la línea de índice. No es estético: son 47 líneas que se leen de un vistazo, y una que
// se envuelve rompe la columna que hace posible el vistazo.
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

function proposalState(text) {
  return frontmatterState(text, 'proposed')
}

// El sufijo `-N` es la segunda corrida del mismo día, y es la que trae el veredicto más nuevo. Sin él
// en el patrón, 51 de los 188 registros que hoy existen —44 de cargos, 7 de recorridos— quedaban fuera
// del ciclo: no entraban a ninguna propuesta y nada lo delataba, que es el modo de fallo que el
// comentario de `markConsolidated` ya describía para el informe atrasado.
//
// Ordenar por nombre no alcanza: `-` (0x2D) es menor que `.` (0x2E), así que `2026-08-24-2.md` cae
// antes que `2026-08-24.md` y la corrida más nueva se leería primero.
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

// El informe que ya entró a una propuesta. Nace en `draft` y nada lo movía nunca, así que el que se
// consolidó y el que se escribió tarde —después de que la propuesta del período ya existía, y por eso
// no entra a ninguna— se leían igual. El segundo no es un descuido de forma: es un hallazgo que no
// llega al contrato y que nada delata. Marcar al primero es lo que deja ver al segundo.
function markConsolidated(file) {
  const text = fs.readFileSync(file, 'utf8')
  if (/^status:\s*\S+\s*$/m.test(text)) {
    return atomicWrite(file, text.replace(/^status:\s*\S+\s*$/m, 'status: consolidated'))
  }
  // Un informe nace con `status`; un registro de corrida no, porque lo escribe el recorrido de
  // evaluación y ahí el dato no existía. Se agrega en vez de exigirle a quien lo escriba que se
  // acuerde: el sello es lo que evita que el mismo hallazgo entre dos veces, y depender de una
  // convención para eso es depender de que nadie la olvide.
  const front = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!front) return
  atomicWrite(file, text.replace(front[0], `---\n${front[1]}\nstatus: consolidated\n---\n`))
}

// El estado terminal del ciclo. Existía la firma, la aplicación y el historial, y faltaba justo el
// paso que vuelve irrepetible lo ya hecho: `status:` nacía en `proposed` y nadie lo movía nunca.
//
// No era un dato desprolijo. `agent-promote` busca la propuesta más nueva y aplica si el estado dice
// aprobada con responsable — y «aprobada y aplicada» cumple eso—, así que volver a correrlo sobre una
// propuesta ya aplicada la aplicaba de nuevo. Como los cambios son aditivos por diseño, el resultado
// no es un error visible sino un contrato con cada viñeta y cada fuente duplicadas.
function seal(root, agent, period = '', kind = 'agent') {
  const dir = path.join(assertWritable(root, agent, kind), 'learning', 'proposals')
  const names = proposalFiles(dir)
  if (!names.length) throw new Error(`${agent} no tiene propuestas en learning/proposals/.`)
  // `--period 2026-08` nombra el período, no un archivo: con revisiones abiertas la que se sella es la
  // vigente de ese período. Resolverlo siempre a `2026-08.md` habría devuelto «ya estaba aplicada» y
  // dejado la revisión sin sellar, que es justo el estado en que `agent-promote` la vuelve a aplicar.
  // Una revisión concreta se puede nombrar entera —`--period 2026-08-r2`— y entonces manda esa.
  const name = period
    ? (/^\d{4}-\d{2}$/.test(period) ? lastOfPeriod(dir, period) : `${period}.md`)
    : names[names.length - 1]
  if (!name || !names.includes(name)) throw new Error(`${agent} no tiene la propuesta ${period || name}.`)
  const file = path.join(dir, name)
  const text = fs.readFileSync(file, 'utf8')
  const state = proposalState(text)
  if (state === 'applied') return { file, already: true }
  if (!/^status:\s*\S+\s*$/m.test(text)) throw new Error(`${file} no declara status en su frontmatter.`)
  // Un cargo llega acá después de `agent-promote`, que se niega si «Aprobación humana» no está firmada.
  // Un recorrido no tiene ese workflow, así que sin esta puerta `--applied` sellaba una propuesta con
  // «Estado: pendiente» y «Cambio propuesto: Por definir»: el frontmatter decía `applied` y el cuerpo
  // decía lo contrario, dentro del mismo documento. Se comprueba para los dos porque la contradicción
  // no depende de quién sea el sujeto, y para el cargo la puerta ya la pasó quien firmó.
  const responsible = (text.match(/^-\s*Responsable:\s*(.+)$/m) || [])[1] || ''
  const change = section(text, /Cambio propuesto/i).split('\n').slice(1).join('\n').trim()
  const undecided = (value) => !value || /^(por definir|pendiente)\b/i.test(value)
  if (undecided(responsible.trim()) || undecided(change)) {
    throw new Error(
      `${path.basename(file)} todavía no la decidió nadie: «Aprobación humana» necesita un responsable `
      + 'y «Cambio propuesto» tiene que decir qué cambia. Aplicar es un acto humano y esto lo registra.',
    )
  }
  const stamped = text
    .replace(/^status:\s*\S+\s*$/m, 'status: applied')
    .replace(/^-[ \t]*Estado:[ \t]*pendiente[ \t]*$/m, '- Estado: aplicada')
    .replace(/^-[ \t]*Fecha:[ \t]*por definir[ \t]*$/mi, `- Fecha: ${isoDate(new Date())}`)
  atomicWrite(file, stamped)
  // El historial sólo lo escribe alguien para los cargos —`agent-promote`— y nadie para los recorridos,
  // así que el registro que la plantilla promete no existía nunca. Se escribe acá porque es determinista:
  // la fecha, el documento, quién aprobó y qué dice que cambia, todo sale de lo que se acaba de sellar.
  if (kind === 'flow') appendHistory(path.dirname(path.dirname(dir)), file, responsible.trim(), change)
  return { file, already: false }
}

// Una fila por propuesta aplicada. El cambio va en una línea: el documento entero está a un enlace, y
// una tabla que lo repite entero deja de leerse.
function appendHistory(target, file, responsible, change) {
  const history = path.join(target, 'learning', 'HISTORY.md')
  if (!fs.existsSync(history)) return
  const line = change.split('\n').map((one) => one.trim()).filter(Boolean)[0] || ''
  const row = `| ${isoDate(new Date())} | \`${path.basename(file)}\` | aplicada | ${responsible} `
    + `| ${line.slice(0, 160)} |\n`
  fs.appendFileSync(history, `${fs.readFileSync(history, 'utf8').endsWith('\n') ? '' : '\n'}${row}`)
}

function prepareReport(root, agent, now = new Date()) {
  const reports = path.join(assertWritable(root, agent), 'learning', 'reports')
  const file = path.join(reports, `${isoDate(now)}.md`)
  fs.mkdirSync(reports, { recursive: true })
  if (fs.existsSync(file)) return { file, created: false }
  // Los sellos de estado de este módulo escriben atómico y esto no, y la diferencia es qué se pierde
  // si la escritura se corta: allá el archivo ya existía y quedaría truncado, acá no había nada. Un
  // documento nuevo a medio escribir se ve; uno viejo a medio pisar se lee como si estuviera entero.
  fs.writeFileSync(file, `---
agent: ${agent}
date: ${isoDate(now)}
status: draft
---

# Investigación semanal — ${isoDate(now)}

<!-- Dos convenciones que el ciclo necesita y que nada más sostiene:

  · Etiquetá cada hallazgo H1, H2, … en el orden en que aparecen. «Evidencia» y «Recomendación» se
    refieren a ellos por esa clave, y la propuesta mensual la cita para decir de qué hallazgo sale
    un cambio. Sin etiqueta las tres secciones dejan de cruzarse y nada lo delata.

  · No renombres los títulos. «## Recomendación» se lee con un patrón exacto y es lo único que la
    propuesta consolida de cada informe: renombrarlo no da error, deja la propuesta vacía.

Este comentario vive fuera de toda sección a propósito — dentro de «Recomendación» viajaría a cada
propuesta consolidada. -->

## Fuentes consultadas

## Hallazgos

## Evidencia

## Posibles prácticas obsoletas

## Recomendación

## Preguntas abiertas
`)
  return { file, created: true }
}

// Abre la revisión siguiente. No vuelve a consolidar los informes semanales: ya se consolidaron en la
// propuesta que ésta corrige, y repetirlos haría que el mismo hallazgo entre dos veces al contrato. El
// insumo de una revisión es otro —qué mostró la evaluación posterior a aplicar—, y por eso el molde
// pregunta eso y no otra cosa.
function reviseProposal(root, agent, dir, previous, period) {
  const parsed = previous.match(PROPOSAL_NAME)
  const revision = Number(parsed[2] || 1) + 1
  const file = path.join(dir, `${period}-r${revision}.md`)
  fs.writeFileSync(file, `---
agent: ${agent}
period: ${period}
revision: ${revision}
corrects: ${previous}
status: proposed
automatic_apply: false
---

# Propuesta mensual — ${period}, revisión ${revision}

Corrige \`${previous}\`, que ya está aplicada y queda sellada donde está. Esta revisión no la reemplaza ni
la reabre: es un cambio distinto, con su propia firma.

## Hallazgos

Qué mostró la evaluación posterior a aplicar \`${previous}\`. No repitas acá los hallazgos de esa propuesta
—ya entraron al contrato—: lo que va es lo que se supo después, con el registro de evaluación que lo
sostiene.

## Evidencia

El registro de la corrida que lo destapó, y la cita del veredicto. Si el cambio anterior falló por estar
mal calibrado, va también la línea del contrato que quedó floja y la del caso que la contradice.

## Cambio propuesto

Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. Decilo
explícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus casos, no para
un texto que acaba de fallar su primera medición.

## Riesgos y regresiones

Qué casos pasaban con el texto anterior y podrían dejar de pasar con éste. Nombralos por su id: son los
que hay que volver a correr.

## Evaluación

Cómo se comprueba que esta vez sí. Nombrá el caso que tiene que cambiar de veredicto y por qué razón, no
sólo que pase.

## Aprobación humana

- Estado: pendiente
- Responsable: por definir
- Fecha: por definir
`)
  return { file, created: true, reports: 0, corrects: previous }
}

// La última propuesta del período, si la hay: es contra ella que se decide si abrir una revisión.
function lastOfPeriod(dir, period) {
  const names = proposalFiles(dir).filter((name) => name.match(PROPOSAL_NAME)[1] === period)
  return names.length ? names[names.length - 1] : ''
}

// La propuesta se llama por el mes en que se abre, y `period` sólo existe para una corrida a mano
// sobre otro mes. El ciclo automático no lo usa: nombrarle el mes que cerró abriría una **revisión**
// —lo que se abre cuando ese mes ya tiene una propuesta aplicada—, y corregir es un acto humano.
// Lo que hace que ningún informe se pierda no es el nombre sino el criterio de más abajo.
// Qué aprende un recorrido, y de dónde. Un cargo aprende de su profesión —normas, versiones, fuentes
// que cambian afuera— y por eso investiga. Un recorrido no tiene profesión: lo único que puede
// enseñarle algo es cómo le fue, así que su insumo son los veredictos en contra de sus propias
// corridas. Pedirle una investigación semanal sería pedirle que lea una literatura que no existe, y
// devolvería informes vacíos.
//
// De cada registro sin sellar entran los casos que no pasaron, con su contraste y de qué corrida
// salen. Si no hay ninguno, eso también es un resultado: el recorrido aguantó y no hay qué corregir.
const VERDICT = /\n### ([^\n]+)\n\n- Veredicto: (pasa|no pasa)\n([\s\S]*?)(?=\n### |$)/g

function verdicts(text) {
  return [...text.matchAll(VERDICT)]
    .map((hit) => ({ id: hit[1].trim(), passed: hit[2] === 'pasa', detail: hit[3].trim() }))
}

// Qué le queda por corregir al recorrido, compuesto por caso y no por corrida. Las corridas se leen en
// orden y la última gana, que es lo que hace la diferencia: un caso que falló y después de un arreglo
// pasó no entra, porque mandaría a arreglar lo arreglado; y el que sigue rojo entra una sola vez, con
// su contraste más nuevo, que es el que describe al recorrido de hoy.
//
// La primera versión volcaba todos los «no pasa» de todas las corridas sin sellar. Sobre las cuatro de
// `incident-review` eso daba seis hallazgos para un solo caso rojo: dos ya corregidos y el mismo caso
// repetido cuatro veces. Un documento que se firma no puede pedir seis correcciones cuando hay una.
//
// Cuántas veces falló sí viaja, porque no es lo mismo un rojo suelto que uno que aguantó dos arreglos
// distintos: lo primero puede ser varianza y lo segundo es una medición estable.
function flowFindings(root, dir) {
  const results = path.join(dir, 'evaluations', 'results')
  const unsealed = reportFiles(results).filter((name) =>
    frontmatterState(fs.readFileSync(path.join(results, name), 'utf8'), 'draft') !== 'consolidated')
  const latest = new Map()
  for (const name of unsealed) {
    const file = path.join(results, name)
    for (const item of verdicts(fs.readFileSync(file, 'utf8'))) {
      const before = latest.get(item.id)
      latest.set(item.id, { ...item, file, name, failures: (before ? before.failures : 0) + (item.passed ? 0 : 1) })
    }
  }
  const findings = [...latest.values()].filter((item) => !item.passed).map((item) =>
    `### ${item.id} — ${item.name.slice(0, -3)}\n\n`
    + `Corrida: \`${path.relative(root, item.file)}\``
    + `${item.failures > 1 ? ` — falló en ${item.failures} corridas de esta tanda` : ''}\n\n${item.detail}`)
  return { consumed: unsealed.map((name) => path.join(results, name)), findings }
}

// Cuántas corridas tiene un recorrido esperando entrar a una propuesta. Es su disparador: un cargo
// aprende cada tanto porque su profesión cambia sola afuera, y un recorrido sólo aprende cuando le
// fue mal, así que preguntarle todos los meses «¿algo nuevo?» sin mirar esto le cuesta una firma
// humana a cambio de un documento que dice «no hay qué corregir».
function pendingRuns(root, slug) {
  const results = path.join(assertWritableTeam(root, slug), 'evaluations', 'results')
  return reportFiles(results).filter((name) =>
    frontmatterState(fs.readFileSync(path.join(results, name), 'utf8'), 'draft') !== 'consolidated').length
}

// El espejo del anterior para un cargo: qué informes esperan entrar a una propuesta. Toma todo lo que
// ya ocurrió y todavía no entró, no sólo lo del mes que se consolida. Filtrar por el prefijo del
// período dejaba huérfano al informe atrasado —el que se escribió después de que su mes se consolidó,
// o el que llegó tarde—: no entraba en ésa ni en ninguna posterior, porque la del mes siguiente sólo
// miraba su propio mes. Se perdía el hallazgo entero y en silencio.
//
// Repetirlo no es un riesgo: el sello dice cuál ya entró, y por eso este criterio existe recién ahora.
// Antes todos decían `draft` y no había cómo distinguirlos.
function pendingReports(target, sealing) {
  const dir = path.join(target, 'learning', 'reports')
  return reportFiles(dir).filter((name) => name.slice(0, 7) <= sealing
    && frontmatterState(fs.readFileSync(path.join(dir, name), 'utf8'), 'draft') !== 'consolidated')
}

// La propuesta de un recorrido. Mismo ciclo que la de un cargo —se abre, se firma, se aplica y se
// sella— y distinto contenido: lo que se corrige es el recorrido mismo, y lo que lo justifica es un
// veredicto en contra, no una fuente nueva.
function proposeFromRuns(root, agent, target, file, period) {
  const { consumed, findings } = flowFindings(root, target)
  const empty = 'Ninguna corrida sin consolidar dejó un veredicto en contra. El recorrido '
    + 'aguantó lo que se le midió, y eso no pide cambio.'
  fs.writeFileSync(file, `---
flow: ${agent}
period: ${period}
status: proposed
automatic_apply: false
---

# Propuesta de recorrido — ${period}

## Hallazgos

${findings.join('\n\n') || empty}

## Evidencia

Los registros citados arriba, en \`evaluations/results/\`. Cada uno dice qué se le pidió al
recorrido y qué contestó, así que la cita es al caso y no a un resumen del caso.

## Cambio propuesto

Por definir. Lo que se corrige es el recorrido: un \`exitGate\` que dejó pasar lo que debía frenar,
una etapa que dependía de otra sin necesidad, un guardrail que nadie podía cumplir, un agente
condicional que hacía falta siempre. No cambiar el contrato de ningún cargo desde acá.

## Riesgos y regresiones

Qué caso pasaba con el recorrido actual y podría dejar de pasar. Un gate más duro frena de más, y eso
también es un defecto: nombralo por su id.

## Evaluación

Qué caso tiene que cambiar de veredicto y por qué razón, no sólo que la corrida salga verde.

## Aprobación humana

- Estado: pendiente
- Responsable: por definir
- Fecha: por definir
`)
  for (const record of consumed) markConsolidated(record)
  return { file, created: true, reports: consumed.length, findings: findings.length }
}

function prepareProposal(root, agent, now = new Date(), period = '', kind = 'agent') {
  if (period && !/^\d{4}-\d{2}$/.test(period)) throw new Error(`período inválido: ${period}`)
  const target = assertWritable(root, agent, kind)
  const sealing = period || month(now)
  const proposalDir = path.join(target, 'learning', 'proposals')
  fs.mkdirSync(proposalDir, { recursive: true })

  // Una sola propuesta pendiente por período. Si la última todavía no se aplicó, abrir otra partiría
  // la firma en dos documentos que dicen cosas distintas sobre el mismo contrato.
  const previous = lastOfPeriod(proposalDir, sealing)
  const pendiente = previous && proposalState(fs.readFileSync(path.join(proposalDir, previous), 'utf8')) !== 'applied'
  if (pendiente) return { file: path.join(proposalDir, previous), created: false, reports: 0 }

  const reports = kind === 'flow' ? [] : pendingReports(target, sealing)
  // El cron lo dice antes que nadie: consolidar sin informes produce un andamiaje que nadie puede
  // aprobar, y el job ve un archivo nuevo y abre el PR igual. Con una cadencia por cargo eso deja de
  // ser un borde: el que investiga cada trimestre pasaría dos meses de cada tres abriendo propuestas
  // para decir que no investigó.
  //
  // Vale para los dos documentos y por eso la guarda vive acá arriba. Vivía debajo de la bifurcación
  // y cubría sólo la propuesta del período: la revisión se fabricaba igual, para todo cargo cuya
  // propuesta anterior estuviera aplicada. Que sea un andamio en blanco no la abarata —cuesta la
  // misma firma— y encima llega indistinguible de una con hallazgos en la lista de PR.
  if (kind !== 'flow' && !reports.length) return { file: '', created: false, reports: 0 }

  // Una revisión corrige un texto ya aplicado, así que no consolida: la escribe una persona mirando el
  // veredicto que lo desmintió. Lo que la habilita es que exista material nuevo, no que exista la
  // propuesta anterior.
  if (previous) return reviseProposal(root, agent, proposalDir, previous, sealing)

  const file = path.join(proposalDir, `${sealing}.md`)
  if (kind === 'flow') return proposeFromRuns(root, agent, target, file, sealing)
  const reportDir = path.join(target, 'learning', 'reports')
  const summaries = reports.map((name) => {
    const report = path.join(reportDir, name)
    const text = fs.readFileSync(report, 'utf8')
    // Sin `m`: con esa bandera el `$` casa fin de *línea*, así que la búsqueda no ávida cortaba en el
    // primer salto y la propuesta consolidaba una sola línea de una recomendación de diez.
    const match = text.match(/\n## Recomendación\s*\n([\s\S]*?)(?=\n## |$)/) || []
    const recommendation = (match[1] || 'Sin recomendación registrada.').trim()
    return `### ${name.slice(0, -3)}\n\nFuente interna: \`${path.relative(root, report)}\`\n\n${recommendation}`
  })
  fs.writeFileSync(file, `---
agent: ${agent}
period: ${sealing}
status: proposed
automatic_apply: false
---

# Propuesta mensual — ${sealing}

## Hallazgos

${summaries.join('\n\n') || 'No hay informes semanales para este período.'}

## Evidencia

Revisar las fuentes primarias enlazadas desde cada informe semanal.

## Cambio propuesto

Por definir tras revisar los hallazgos. No modificar \`SKILL.md\` desde este proceso.

## Riesgos y regresiones

Por evaluar contra los comportamientos y casos del agente.

## Evaluación

Pendiente.

## Aprobación humana

- Estado: pendiente
- Responsable: por definir
- Fecha: por definir
`)
  for (const name of reports) markConsolidated(path.join(reportDir, name))
  return { file, created: true, reports: reports.length }
}

function evaluateTeam(root, slug) {
  const dir = path.dirname(require('../flows/registry').read(root, slug).file)
  const errors = []
  const warnings = []
  if (!fs.existsSync(path.join(dir, 'learning', 'HISTORY.md'))) {
    warnings.push('sin learning/HISTORY.md: lo que se le cambie al recorrido no queda registrado')
  }
  const proposals = proposalFiles(path.join(dir, 'learning', 'proposals'))
  let pending = 0
  for (const name of proposals) {
    const text = fs.readFileSync(path.join(dir, 'learning', 'proposals', name), 'utf8')
    if (!/^automatic_apply:\s*false$/m.test(text)) errors.push(`${name}: automatic_apply debe ser false`)
    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(`## ${section}`)) errors.push(`${name}: falta sección ${section}`)
    }
    if (proposalState(text) !== 'applied') pending += 1
  }
  return { errors, warnings, proposals: proposals.length, pending, cases: 0 }
}

// Qué publica una fuente, que es lo único que decide cada cuánto vale la pena volver a mirarla. No
// dice si es primaria —eso lo exige `rules.require_primary_source`— ni si sigue vigente: lo que se
// aparta del default lo declara la fuente con `authority:` o `status:`, y por eso son dos campos y no
// un nombre compuesto. Cuando eran uno solo el catálogo llegó a 51 etiquetas para estas seis.
const SOURCE_TIERS = ['advisory', 'platform', 'project', 'regulation', 'standard', 'profession']

// Cada cuánto vale la pena volver a mirar cada tipo. Un aviso publica todos los días y llegar un mes
// tarde es llegar tarde; una norma se revisa por edición y mirarla cada lunes devuelve el mismo texto.
// La cadencia de un cargo la fija su fuente más rápida: basta una que corra para que la semana traiga
// algo, y ninguna otra pierde nada por mirarse antes.
const TIER_CADENCE = {
  advisory: 'semanal', platform: 'semanal', project: 'semanal',
  regulation: 'mensual', standard: 'mensual', profession: 'trimestral',
}
const CADENCES = ['semanal', 'mensual', 'trimestral']

// Sale del árbol y no de una lista escrita a mano, por la misma razón que la matriz del cron sale del
// árbol: una lista paralela se pudre el día que un cargo cambia sus fuentes y nadie la toca.
function cadence(root, agent) {
  const file = path.join(catalog.resolve(root, agent), 'learning', 'sources.yaml')
  if (!fs.existsSync(file)) return ''
  const tiers = sourceTiers(fs.readFileSync(file, 'utf8')).filter((one) => TIER_CADENCE[one])
  if (!tiers.length) return ''
  return CADENCES[Math.min(...tiers.map((one) => CADENCES.indexOf(TIER_CADENCE[one])))]
}

// Basta con las líneas `tier:`: el archivo es del catálogo, no de un tercero, y agregar un parser de
// YAML por un campo rompería la regla de cero dependencias.
function sourceTiers(text) {
  const body = text.includes('sources:') ? text.slice(text.indexOf('sources:')) : ''
  return [...body.matchAll(/tier:\s*([A-Za-z-]+)/g)].map((hit) => hit[1])
}

// Las fuentes de un cargo, por su URL. La misma URL con dos nombres es una sola fuente contada dos
// veces: el catálogo llegó a tener la especificación OpenAPI bajo tres —`OpenAPI Specification`,
// `...latest published` y `...3.2.0`— así que arreglarle el `tier` a un cargo no se lo arreglaba a los
// otros, y quien leyera el informe vería la misma página citada como si fueran tres.
function sourceUrls(text) {
  const body = text.includes('sources:') ? text.slice(text.indexOf('sources:')) : ''
  const out = []
  let name = ''
  for (const line of body.split('\n')) {
    const nombre = line.match(/^\s*-\s*name:\s*(.+?)\s*$/)
    if (nombre) { name = nombre[1].replace(/^['"]|['"]$/g, ''); continue }
    const url = line.match(/^\s*url:\s*(\S+)/)
    if (url && name) out.push({ name, url: url[1].replace(/\/+$/, '') })
  }
  return out
}

function evaluate(root, agent) {
  const target = catalog.resolve(root, agent)
  const errors = []
  const warnings = []
  const requiredFiles = [
    'learning/sources.yaml',
    'learning/HISTORY.md',
    'evaluations/expected-behaviors.yaml',
  ]
  // `AUTOMATION.md` documenta cómo corre la automatización de aprendizaje del toolkit. Exigírselo
  // a una empresa que escribe un cargo propio era pedirle contabilidad interna nuestra: su cargo debe
  // tener contrato, fuentes e historia, no nuestro andamiaje.
  if (catalog.find(root, agent).system) requiredFiles.push('learning/AUTOMATION.md')
  for (const relative of requiredFiles) {
    if (!fs.existsSync(path.join(target, relative))) errors.push(`falta ${relative}`)
  }
  const sourcesFile = path.join(target, 'learning', 'sources.yaml')
  if (fs.existsSync(sourcesFile)) {
    const tiers = sourceTiers(fs.readFileSync(sourcesFile, 'utf8'))
    // Sin fuentes el ciclo semanal no tiene literatura que leer y devuelve un informe vacío cada
    // semana. Avisa y no bloquea: un cargo que se está escribiendo todavía no las tiene.
    if (!tiers.length) warnings.push('sources.yaml sin fuentes: la investigación no tiene qué leer')
    for (const tier of tiers) {
      if (!SOURCE_TIERS.includes(tier)) {
        errors.push(`sources.yaml: tier "${tier}" fuera de ${SOURCE_TIERS.join(' | ')}`)
      }
    }
    // Dos nombres para una URL. Es error y no aviso: la cadencia sale del `tier` de cada entrada, así
    // que dos copias de la misma fuente pueden decir cosas distintas sobre cada cuánto publica, y la
    // más rápida gana sin que nadie lo haya decidido.
    const porUrl = new Map()
    for (const one of sourceUrls(fs.readFileSync(sourcesFile, 'utf8'))) {
      const antes = porUrl.get(one.url)
      if (antes && antes !== one.name) {
        errors.push(`sources.yaml: ${one.url} está dos veces, como "${antes}" y como "${one.name}"`)
      }
      porUrl.set(one.url, one.name)
    }
  }
  const skill = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').toLowerCase()
  for (const phrase of ['no inventar', 'autorización', 'evidencia observable']) {
    if (!skill.includes(phrase)) errors.push(`SKILL.md no conserva el control: ${phrase}`)
  }
  // Sin su línea, el cargo existe pero no se encuentra: quien tiene una tarea tendría que abrir la
  // carpeta para saber si es éste. Se exige acá y no como advertencia porque es estático y de una línea.
  const summary = catalog.summary(target)
  if (!summary) errors.push('SKILL.md no declara summary: la línea con la que se elige este cargo')
  else if (summary.length > SUMMARY_MAX) {
    errors.push(`summary tiene ${summary.length} caracteres y el máximo es ${SUMMARY_MAX}: `
      + 'si no entra en una línea, no sirve para elegir de un vistazo')
  }
  const proposals = proposalFiles(path.join(target, 'learning', 'proposals'))
  let pending = 0
  for (const name of proposals) {
    const text = fs.readFileSync(path.join(target, 'learning', 'proposals', name), 'utf8')
    if (!/^automatic_apply:\s*false$/m.test(text)) errors.push(`${name}: automatic_apply debe ser false`)
    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(`## ${section}`)) errors.push(`${name}: falta sección ${section}`)
    }
    // Contar sólo las que esperan algo. Una propuesta aplicada contada como propuesta deja al cargo
    // reportando trabajo pendiente para siempre, y es la misma confusión que permitía reaplicarla.
    if (proposalState(text) !== 'applied') pending += 1
  }
  // Los hallazgos que todavía no llegaron al contrato. No es un error —la propuesta que los tome
  // puede no haberse abierto aún—, pero sin decirlo un informe escrito y olvidado se ve igual que uno
  // ya incorporado: los dos son un archivo en `reports/`.
  const reportDir = path.join(target, 'learning', 'reports')
  const unconsolidated = reportFiles(reportDir).filter((name) =>
    frontmatterState(fs.readFileSync(path.join(reportDir, name), 'utf8'), 'draft') !== 'consolidated')
  if (unconsolidated.length) {
    warnings.push(`${unconsolidated.length} informe(s) sin consolidar (${unconsolidated.join(', ')}): `
      + 'entran en la próxima propuesta')
  }
  let cases = 0
  try {
    cases = fs.readdirSync(path.join(target, 'evaluations', 'cases'))
      .filter((name) => name.endsWith('.md')).length
  } catch { /* vacío */ }
  return { errors, warnings, proposals: proposals.length, pending, cases }
}

module.exports = {
  SOURCE_TIERS,
  CADENCES,
  cadence, pendingRuns,
  SUMMARY_MAX, prepareReport, prepareProposal, evaluate, evaluateTeam, proposalState, seal }
