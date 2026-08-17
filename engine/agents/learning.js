'use strict'

// Motor de aprendizaje controlado para los perfiles de agentes.

const fs = require('fs')
const path = require('path')
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

function prepareProposal(root, agent, now = new Date()) {
  const target = assertWritable(root, agent)
  const proposalDir = path.join(target, 'learning', 'proposals')
  const file = path.join(proposalDir, `${month(now)}.md`)
  fs.mkdirSync(proposalDir, { recursive: true })
  if (fs.existsSync(file)) return { file, created: false, reports: 0 }
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
  let proposals = []
  try {
    proposals = fs.readdirSync(path.join(target, 'learning', 'proposals'))
      .filter((name) => /^\d{4}-\d{2}\.md$/.test(name))
  } catch { /* vacío */ }
  for (const name of proposals) {
    const text = fs.readFileSync(path.join(target, 'learning', 'proposals', name), 'utf8')
    if (!/^automatic_apply:\s*false$/m.test(text)) errors.push(`${name}: automatic_apply debe ser false`)
    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(`## ${section}`)) errors.push(`${name}: falta sección ${section}`)
    }
  }
  let cases = 0
  try {
    cases = fs.readdirSync(path.join(target, 'evaluations', 'cases'))
      .filter((name) => name.endsWith('.md')).length
  } catch { /* vacío */ }
  return { errors, proposals: proposals.length, cases }
}

module.exports = { prepareReport, prepareProposal, evaluate }
