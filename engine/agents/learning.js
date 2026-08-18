'use strict'

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')

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
function assertWritable(root, agent) {
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

function proposalState(text) {
  return ((text.match(/^status:\s*(\S+)\s*$/m) || [])[1] || 'proposed').toLowerCase()
}

// El estado terminal del ciclo. Existía la firma, la aplicación y el historial, y faltaba justo el
// paso que vuelve irrepetible lo ya hecho: `status:` nacía en `proposed` y nadie lo movía nunca.
//
// No era un dato desprolijo. `agent-promote` busca la propuesta más nueva y aplica si el estado dice
// aprobada con responsable — y «aprobada y aplicada» cumple eso—, así que volver a correrlo sobre una
// propuesta ya aplicada la aplicaba de nuevo. Como los cambios son aditivos por diseño, el resultado
// no es un error visible sino un contrato con cada viñeta y cada fuente duplicadas.
function seal(root, agent, period = '') {
  const dir = path.join(assertWritable(root, agent), 'learning', 'proposals')
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
  fs.writeFileSync(file, text.replace(/^status:\s*\S+\s*$/m, 'status: applied'))
  return { file, already: false }
}

function prepareReport(root, agent, now = new Date()) {
  const reports = path.join(assertWritable(root, agent), 'learning', 'reports')
  const file = path.join(reports, `${isoDate(now)}.md`)
  fs.mkdirSync(reports, { recursive: true })
  if (fs.existsSync(file)) return { file, created: false }
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
function reviseProposal(root, agent, dir, previo, now) {
  const period = month(now)
  const anterior = previo.match(PROPOSAL_NAME)
  const revision = Number(anterior[2] || 1) + 1
  const file = path.join(dir, `${period}-r${revision}.md`)
  fs.writeFileSync(file, `---
agent: ${agent}
period: ${period}
revision: ${revision}
corrects: ${previo}
status: proposed
automatic_apply: false
---

# Propuesta mensual — ${period}, revisión ${revision}

Corrige \`${previo}\`, que ya está aplicada y queda sellada donde está. Esta revisión no la reemplaza ni
la reabre: es un cambio distinto, con su propia firma.

## Hallazgos

Qué mostró la evaluación posterior a aplicar \`${previo}\`. No repitas acá los hallazgos de esa propuesta
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
  return { file, created: true, reports: 0, corrects: previo }
}

// La última propuesta del período, si la hay: es contra ella que se decide si abrir una revisión.
function lastOfPeriod(dir, period) {
  const names = proposalFiles(dir).filter((name) => name.match(PROPOSAL_NAME)[1] === period)
  return names.length ? names[names.length - 1] : ''
}

function prepareProposal(root, agent, now = new Date()) {
  const target = assertWritable(root, agent)
  const proposalDir = path.join(target, 'learning', 'proposals')
  fs.mkdirSync(proposalDir, { recursive: true })

  // Una sola propuesta pendiente por período. Si la última todavía no se aplicó, abrir otra partiría
  // la firma en dos documentos que dicen cosas distintas sobre el mismo contrato.
  const previo = lastOfPeriod(proposalDir, month(now))
  if (previo) {
    const anterior = path.join(proposalDir, previo)
    if (proposalState(fs.readFileSync(anterior, 'utf8')) !== 'applied') {
      return { file: anterior, created: false, reports: 0 }
    }
    return reviseProposal(root, agent, proposalDir, previo, now)
  }

  const file = path.join(proposalDir, `${month(now)}.md`)
  let names = []
  try { names = fs.readdirSync(path.join(target, 'learning', 'reports')) } catch { /* vacío */ }
  const reports = names.filter((name) => name.startsWith(month(now)) && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort()
  const summaries = reports.map((name) => {
    const report = path.join(target, 'learning', 'reports', name)
    const text = fs.readFileSync(report, 'utf8')
    // Sin `m`: con esa bandera el `$` casa fin de *línea*, así que la búsqueda no ávida cortaba en el
    // primer salto y la propuesta consolidaba una sola línea de una recomendación de diez.
    const match = text.match(/\n## Recomendación\s*\n([\s\S]*?)(?=\n## |$)/) || []
    const recommendation = (match[1] || 'Sin recomendación registrada.').trim()
    return `### ${name.slice(0, -3)}\n\nFuente interna: \`${path.relative(root, report)}\`\n\n${recommendation}`
  })
  fs.writeFileSync(file, `---
agent: ${agent}
period: ${month(now)}
status: proposed
automatic_apply: false
---

# Propuesta mensual — ${month(now)}

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
  return { file, created: true, reports: reports.length }
}

function evaluate(root, agent) {
  const target = catalog.resolve(root, agent)
  const errors = []
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
  const skill = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').toLowerCase()
  for (const phrase of ['no inventar', 'autorización', 'evidencia observable']) {
    if (!skill.includes(phrase)) errors.push(`SKILL.md no conserva el control: ${phrase}`)
  }
  // Sin su línea, el cargo existe pero no se encuentra: quien tiene una tarea tendría que abrir la
  // carpeta para saber si es éste. Se exige acá y no como advertencia porque es estático y de una línea.
  const linea = catalog.summary(target)
  if (!linea) errors.push('SKILL.md no declara summary: la línea con la que se elige este cargo')
  else if (linea.length > SUMMARY_MAX) {
    errors.push(`summary tiene ${linea.length} caracteres y el máximo es ${SUMMARY_MAX}: `
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
  let cases = 0
  try {
    cases = fs.readdirSync(path.join(target, 'evaluations', 'cases'))
      .filter((name) => name.endsWith('.md')).length
  } catch { /* vacío */ }
  return { errors, proposals: proposals.length, pending, cases }
}

module.exports = { prepareReport, prepareProposal, evaluate, proposalState, seal }
