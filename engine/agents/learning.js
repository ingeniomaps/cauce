'use strict'

// Motor de aprendizaje controlado para los perfiles de agentes.

const fs = require('fs')
const path = require('path')

const REQUIRED_SECTIONS = [
  'Hallazgos',
  'Evidencia',
  'Cambio propuesto',
  'Riesgos y regresiones',
  'Evaluación',
  'Aprobación humana',
]

function agentRoot(root, agent) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agent || '')) throw new Error(`agente inválido: ${agent || '(vacío)'}`)
  const catalog = path.join(root, 'agents')
  let types = []
  try {
    types = fs.readdirSync(catalog, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch { /* catálogo ausente */ }
  const matches = types
    .map((type) => path.join(catalog, type, agent))
    .filter((target) => fs.existsSync(path.join(target, 'SKILL.md')))
  if (!matches.length) throw new Error(`no existe agents/<tipo>/${agent}/SKILL.md`)
  if (matches.length > 1) {
    throw new Error(`agente ambiguo ${agent}: ${matches.map((target) => path.relative(root, target)).join(', ')}`)
  }
  return matches[0]
}

function isoDate(now = new Date()) { return now.toISOString().slice(0, 10) }
function month(now = new Date()) { return now.toISOString().slice(0, 7) }

function prepareReport(root, agent, now = new Date()) {
  const reports = path.join(agentRoot(root, agent), 'learning', 'reports')
  const file = path.join(reports, `${isoDate(now)}.md`)
  fs.mkdirSync(reports, { recursive: true })
  if (fs.existsSync(file)) return { file, created: false }
  fs.writeFileSync(file, `---
agent: ${agent}
date: ${isoDate(now)}
status: draft
---

# Investigación semanal — ${isoDate(now)}

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
  const target = agentRoot(root, agent)
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
    const match = text.match(/^## Recomendación\s*\n([\s\S]*?)(?=\n## |$)/m) || []
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
  const target = agentRoot(root, agent)
  const errors = []
  const requiredFiles = [
    'learning/sources.yaml',
    'learning/HISTORY.md',
    'learning/CODEX_AUTOMATION.md',
    'evaluations/expected-behaviors.yaml',
  ]
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
