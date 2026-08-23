'use strict'

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')
const { atomicWrite } = require('../core/files')

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
  const dir = path.dirname(require('../teams/registry').read(root, slug).file)
  const own = path.resolve(root, 'teams')
  if (path.resolve(dir).startsWith(`${own}${path.sep}`)) return dir
  throw new Error(
    `${slug} es un recorrido que trae Cauce y su aprendizaje se hace en el toolkit, no acá.\n` +
    `  Para tener una versión propia, copialo a teams/${slug}/ y mantenelo vos.`,
  )
}

function assertWritable(root, agent, kind = 'agent') {
  if (kind === 'team') return assertWritableTeam(root, agent)
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

const REPORT_NAME = /^\d{4}-\d{2}-\d{2}\.md$/

function reportFiles(dir) {
  try { return fs.readdirSync(dir).filter((name) => REPORT_NAME.test(name)).sort() } catch { return [] }
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
  atomicWrite(file, text.replace(/^status:\s*\S+\s*$/m, 'status: applied'))
  return { file, already: false }
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
const VERDICT_AGAINST = /\n### ([^\n]+)\n\n- Veredicto: no pasa\n([\s\S]*?)(?=\n### |$)/g

function failedCases(text) {
  return [...text.matchAll(VERDICT_AGAINST)].map((hit) => ({ id: hit[1].trim(), detail: hit[2].trim() }))
}

function teamFindings(root, dir) {
  const results = path.join(dir, 'evaluations', 'results')
  const unsealed = reportFiles(results).filter((name) =>
    frontmatterState(fs.readFileSync(path.join(results, name), 'utf8'), 'draft') !== 'consolidated')
  const findings = []
  for (const name of unsealed) {
    const file = path.join(results, name)
    for (const item of failedCases(fs.readFileSync(file, 'utf8'))) {
      findings.push(`### ${item.id} — ${name.slice(0, -3)}\n\n`
        + `Corrida: \`${path.relative(root, file)}\`\n\n${item.detail}`)
    }
  }
  return { consumed: unsealed.map((name) => path.join(results, name)), findings }
}

// La propuesta de un recorrido. Mismo ciclo que la de un cargo —se abre, se firma, se aplica y se
// sella— y distinto contenido: lo que se corrige es el recorrido mismo, y lo que lo justifica es un
// veredicto en contra, no una fuente nueva.
function proposeFromRuns(root, agent, target, file, period) {
  const { consumed, findings } = teamFindings(root, target)
  const empty = 'Ninguna corrida sin consolidar dejó un veredicto en contra. El recorrido '
    + 'aguantó lo que se le midió, y eso no pide cambio.'
  fs.writeFileSync(file, `---
team: ${agent}
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
  if (previous) {
    const before = path.join(proposalDir, previous)
    if (proposalState(fs.readFileSync(before, 'utf8')) !== 'applied') {
      return { file: before, created: false, reports: 0 }
    }
    return reviseProposal(root, agent, proposalDir, previous, sealing)
  }

  const file = path.join(proposalDir, `${sealing}.md`)
  if (kind === 'team') return proposeFromRuns(root, agent, target, file, sealing)
  const reportDir = path.join(target, 'learning', 'reports')
  // Todo lo que ya ocurrió y todavía no entró, no sólo lo del mes que se consolida. Filtrar por el
  // prefijo del período dejaba huérfano al informe atrasado —el que se escribió después de que su mes
  // se consolidó, o el que llegó tarde—: no entraba en ésa ni en ninguna posterior, porque la del mes
  // siguiente sólo miraba su propio mes. Se perdía el hallazgo entero y en silencio.
  //
  // Repetirlo no es un riesgo: el sello dice cuál ya entró, y por eso este criterio existe recién
  // ahora. Antes todos decían `draft` y no había cómo distinguirlos.
  const reports = reportFiles(reportDir).filter((name) => name.slice(0, 7) <= sealing
    && frontmatterState(fs.readFileSync(path.join(reportDir, name), 'utf8'), 'draft') !== 'consolidated')
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
  const dir = path.dirname(require('../teams/registry').read(root, slug).file)
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

// Basta con las líneas `tier:`: el archivo es del catálogo, no de un tercero, y agregar un parser de
// YAML por un campo rompería la regla de cero dependencias.
function sourceTiers(text) {
  const body = text.includes('sources:') ? text.slice(text.indexOf('sources:')) : ''
  return [...body.matchAll(/tier:\s*([A-Za-z-]+)/g)].map((hit) => hit[1])
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
  SOURCE_TIERS, SUMMARY_MAX, prepareReport, prepareProposal, evaluate, evaluateTeam, proposalState, seal }
