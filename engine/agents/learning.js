'use strict'

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')
const { atomicWrite } = require('../core/files')
// La misma lectura de secciones que usa el planning: repetirla acá sería una segunda copia del mismo
// hecho, y una de las dos se pudre sin que nada falle (R11).
const { section } = require('../planning/parser')
const {
  REQUIRED_SECTIONS, SUMMARY_MAX, PROPOSAL_NAME, REPORT_NAME, assertWritableTeam, assertWritable,
  isoDate, month, proposalOrder, proposalFiles, frontmatterState, proposalState, reportFiles,
} = require('./learning-files')
const { SOURCE_TIERS, CADENCES, cadence, evaluate, evaluateTeam } = require('./learning-sources')

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
// El molde de los apartados que una persona escribe queda; lo que deja de quedar es `## Hallazgos` en
// blanco. Una revisión que no puede decir qué la motiva no puede producir un cambio, y hasta acá se
// llega sólo con material: el llamador ya se negó a abrirla sin él.
function reviseProposal(root, agent, dir, previous, period, hallazgos = [], consumed = []) {
  const parsed = previous.match(PROPOSAL_NAME)
  const revision = Number(parsed[2] || 1) + 1
  const file = path.join(dir, `${period}-r${revision}.md`)
  const molde = `Qué mostró la evaluación posterior a aplicar \`${previous}\`. No repitas acá los hallazgos de esa
propuesta —ya entraron al contrato—: lo que va es lo que se supo después, con el registro de
evaluación que lo sostiene.`
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

${hallazgos.join('\n\n') || molde}

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
  for (const record of consumed) markConsolidated(record)
  return { file, created: true, reports: 0, corrects: previous, findings: hallazgos.length }
}

// La última propuesta del período, si la hay: es contra ella que se decide si abrir una revisión.
function lastOfPeriod(dir, period) {
  const names = proposalFiles(dir).filter((name) => name.match(PROPOSAL_NAME)[1] === period)
  return names.length ? names[names.length - 1] : ''
}

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
//
// Sirve a los dos, y no por generalidad: el formato del registro es el mismo —`### caso` y
// `- Veredicto:`— porque lo escribe el mismo `evaluate --record`. Un cargo tenía este material desde
// siempre y nada lo leía, así que aprendía de su profesión y no de haber fallado su propia medición.
function verdictFindings(root, dir) {
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
// Recibe los hallazgos ya compuestos: el llamador los necesita antes para decidir si abre documento,
// y volver a leerlos acá sería leer dos veces lo mismo para responder la misma pregunta.
function proposeFromRuns(root, agent, target, file, period, { consumed, findings }) {
  fs.writeFileSync(file, `---
flow: ${agent}
period: ${period}
status: proposed
automatic_apply: false
---

# Propuesta de recorrido — ${period}

## Hallazgos

${findings.join('\n\n')}

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

// La propuesta se llama por el mes en que se abre, y `period` sólo existe para una corrida a mano
// sobre otro mes. El ciclo automático no lo usa: nombrarle el mes que cerró abriría una **revisión**
// —lo que se abre cuando ese mes ya tiene una propuesta aplicada—, y corregir es un acto humano.
// Lo que hace que ningún informe se pierda no es el nombre sino el criterio de `pendingReports`.
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

  // La misma regla que abajo, y el mismo motivo: un documento que no puede decir qué corregir no
  // produce un cambio de contrato, y cuesta igual la firma humana que uno que sí. Antes se abría uno
  // por recorrido con corridas sin sellar aunque todas hubieran pasado, para decir que no había nada.
  //
  // Lo que se pierde es el sello de esas corridas, y es inocuo: los hallazgos se componen por caso con
  // la última corrida ganando, así que una verde vieja no cambia ningún veredicto. Lo único que queda
  // es que el recorrido siga contándose en `pending` y su job vuelva a no encontrar nada.
  if (kind === 'flow') {
    const red = verdictFindings(root, target)
    if (!red.findings.length) return { file: '', created: false, reports: 0 }
    if (previous) return reviseProposal(root, agent, proposalDir, previous, sealing, red.findings, red.consumed)
    return proposeFromRuns(root, agent, target, path.join(proposalDir, `${sealing}.md`), sealing, red)
  }

  // Los dos materiales de un cargo, y dicen cosas distintas: un informe sin consolidar dice que cambió
  // la profesión, un caso en rojo dice que el contrato no se sostuvo. Cualquiera de los dos puede
  // cambiarlo, así que cualquiera de los dos abre documento.
  //
  // Sin ninguno no se abre nada, y por eso la guarda vive acá arriba en vez de debajo de la
  // bifurcación, que es donde cubría sólo la propuesta del período: la revisión se fabricaba igual
  // para todo cargo cuya propuesta anterior estuviera aplicada. Que sea un andamio en blanco no la
  // abarata —cuesta la misma firma humana— y encima llega indistinguible de una con hallazgos en la
  // lista de PR. Componer el documento desde el material lo vuelve imposible en vez de prohibido.
  const reportDir = path.join(target, 'learning', 'reports')
  const reports = pendingReports(target, sealing)
  const red = verdictFindings(root, target)
  if (!reports.length && !red.findings.length) return { file: '', created: false, reports: 0 }

  const reportPaths = reports.map((name) => path.join(reportDir, name))
  const hallazgos = [...reportPaths.map((file) => reportSummary(root, file)), ...red.findings]
  const consumed = [...reportPaths, ...red.consumed]
  if (previous) return reviseProposal(root, agent, proposalDir, previous, sealing, hallazgos, consumed)

  const file = path.join(proposalDir, `${sealing}.md`)
  const summaries = hallazgos
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
  for (const record of consumed) markConsolidated(record)
  return { file, created: true, reports: reports.length, findings: red.findings.length }
}

// La recomendación de un informe, que es lo único que la propuesta consolida de él.
function reportSummary(root, report) {
  const name = path.basename(report)
  const text = fs.readFileSync(report, 'utf8')
  // Sin `m`: con esa bandera el `$` casa fin de *línea*, así que la búsqueda no ávida cortaba en el
  // primer salto y la propuesta consolidaba una sola línea de una recomendación de diez.
  const match = text.match(/\n## Recomendación\s*\n([\s\S]*?)(?=\n## |$)/) || []
  const recommendation = (match[1] || 'Sin recomendación registrada.').trim()
  return `### ${name.slice(0, -3)}\n\nFuente interna: \`${path.relative(root, report)}\`\n\n${recommendation}`
}


module.exports = {
  SOURCE_TIERS,
  CADENCES,
  cadence, pendingRuns,
  SUMMARY_MAX, prepareReport, prepareProposal, evaluate, evaluateTeam, proposalState, seal }
