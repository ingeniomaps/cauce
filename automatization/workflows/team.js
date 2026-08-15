// Recorrido de un equipo: convierte una intención en una épica candidata, o en la razón por la
// que todavía no se puede. Es el espejo de `autobuild`, que ejecuta trabajo ya aprobado.
//
// Nunca promueve: escribe la épica en roadmap/ y para. Promoverla al BACKLOG sigue siendo la firma
// humana que autoriza ejecución.
export const meta = {
  name: 'team',
  description: 'Recorre las etapas de un equipo, exige sus exit gates y propone una épica',
  whenToUse: 'Evaluar si una idea es viable y darle forma antes de aprobarla, con varios cargos.',
  phases: [
    { title: 'Contract', detail: 'Manifiesto del equipo y contexto de la empresa' },
    { title: 'Stages', detail: 'Una etapa por dueño de decisión, con su exit gate' },
    { title: 'Draft', detail: 'Épica candidata con criterios observables' },
    { title: 'Closing', detail: 'Validación y acciones humanas pendientes' },
  ],
}

// El prefijo lo completa `automation install`: en modo sidecar la herramienta se abre en la carpeta
// de la compañía y la raíz ops es uno de sus hijos, no la carpeta misma.
const ROOT = (process.env.OPS_ROOT
  || `${process.env.CLAUDE_PROJECT_DIR || '.'}/{{OPS_DIR}}`).replace(/\/+$/, '')
const P = `${ROOT}/planning`
const ROADMAP = `${P}/roadmap`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const INBOX = `${P}/INBOX.md`
const REPORTS = `${P}/reports`

// Tres formas de invocarlo, porque escribir JSON en un slash command no es razonable:
//
//   /team quiero cobrar con tarjeta                    equipo por defecto
//   /team feasibility-review: quiero cobrar con tarjeta   equipo elegido por prefijo
//   /team {"team": "acme-soporte", "intent": "..."}    argumentos estructurados
//
// El prefijo se toma como candidato y se confirma más abajo contra los equipos que existen: si no es
// uno, el texto completo era la intención y nadie tuvo que aprenderse una sintaxis.
const input = typeof args === 'string' ? { intent: args } : (args || {})
const raw = String(input.intent || process.env.OPS_INTENT || '').trim()
const prefix = raw.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+)$/s)
const CANDIDATE = String(input.team || process.env.OPS_TEAM || (prefix ? prefix[1] : '') || 'product-development')
const INTENT = (input.team || !prefix ? raw : prefix[2]).trim()

const MANIFEST = {
  type: 'object', additionalProperties: false, required: ['name', 'purpose', 'stages', 'guardrails'],
  properties: {
    name: { type: 'string' }, purpose: { type: 'string' },
    outcome: { type: 'string', enum: ['epic', 'report'] },
    entryAgent: { type: 'string' }, facilitator: { type: 'string' },
    guardrails: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      domain: { type: 'string' }, agent: { type: 'string' },
    } } },
    stages: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, agent: { type: 'string' }, exitGate: { type: 'string' },
      phase: { type: 'string', enum: ['discovery', 'delivery'] },
      produces: { type: 'array', items: { type: 'string' } },
    } } },
  },
}
const STAGE = {
  type: 'object', additionalProperties: false, required: ['gatePassed', 'findings'],
  properties: {
    gatePassed: { type: 'boolean' },
    findings: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    missing: { type: 'string' },
    humanAction: { type: 'string' },
  },
}
const EPIC = {
  type: 'object', additionalProperties: false, required: ['viable', 'title'],
  properties: {
    viable: { type: 'boolean' }, title: { type: 'string' }, slug: { type: 'string' },
    reason: { type: 'string' },
    criteria: { type: 'array', items: { type: 'string' } },
    stories: { type: 'array', items: { type: 'string' } },
  },
}

const stop = (reason, detail = '') => {
  log(`Checkpoint: ${reason}${detail ? ` — ${detail}` : ''}`)
  return finish({ stopped: true, reason, detail })
}

if (!INTENT) return stop('sin-intencion', 'pasá la intención a evaluar en args.intent')

phase('Contract')

const BASE = `Nunca inventes clientes, métricas, restricciones ni decisiones. No confundas una opinión ` +
  `del modelo con evidencia: si algo no se puede afirmar con lo disponible, decilo y registrá qué ` +
  `haría falta averiguar. No promuevas trabajo al BACKLOG, no escribas en sistemas externos y no ` +
  `declares validado nada sin evidencia observable.`

const resolved = await agent(
  `${BASE}\n\nRun "node tools/ops.js team list" from ${ROOT}. Report whether "${CANDIDATE}" is one of ` +
  `the slugs it printed, and the full list. Do not guess: report only what the command printed.`,
  { schema: { type: 'object', required: ['exists', 'teams'], properties: {
    exists: { type: 'boolean' }, teams: { type: 'array', items: { type: 'string' } },
  } }, label: 'team-resolve' },
)
if (!resolved) return stop('teams-unavailable', 'no se pudo listar los equipos')
if (!resolved.exists && (input.team || process.env.OPS_TEAM)) {
  return stop('equipo-inexistente', `${CANDIDATE} no existe. Disponibles: ${resolved.teams.join(', ')}`)
}
// El prefijo era parte de la intención, no un equipo: se recompone y sigue con el equipo por defecto.
const TEAM = resolved.exists ? CANDIDATE : 'product-development'
const GOAL = resolved.exists ? INTENT : raw
if (!resolved.exists && prefix) log(`"${CANDIDATE}" no es un equipo: se toma el texto completo como intención.`)

const contract = await agent(
  `${BASE}\n\nRun "node tools/ops.js team show ${TEAM} --json" from ${ROOT} and report only what it ` +
  `printed: name, purpose, outcome, entryAgent, facilitator, guardrails, the stages with id, phase, ` +
  `agent, ` +
  `produces and exitGate, and decisionOwners flattened into owners as domain/agent pairs. Then read ` +
  `${ROOT}/organization/ and report nothing from it: it is context for later stages, not output.`,
  { schema: MANIFEST, label: 'team-contract' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer el manifiesto de ${TEAM}`)

const owners = (contract.owners || []).map((owner) => `${owner.domain}=${owner.agent}`).join(', ')
const RULES = `${BASE}\n\nEquipo ${contract.name}: ${contract.purpose}\n` +
  `Guardrails: ${contract.guardrails.join(' ')}\n` +
  `${owners ? `Dueños de decisión: ${owners}. Ningún otro cargo resuelve en su dominio.\n` : ''}` +
  `Contexto de la empresa en ${ROOT}/organization/. Intención a evaluar: ${GOAL}`

phase('Stages')

const handoffs = []
const blocked = []
// Sólo descubrimiento: este recorrido propone trabajo, no lo ejecuta. Las etapas de entrega las
// corre `autobuild`, y sólo después de que una persona promueva la épica al BACKLOG.
const discovery = contract.stages.filter((stage) => stage.phase === 'discovery')
if (!discovery.length) return stop('sin-descubrimiento', `${TEAM} no declara etapas de discovery`)
for (const stage of discovery) {
  const previous = handoffs.length
    ? `Handoffs previos:\n${handoffs.map((entry) => `- ${entry.id}: ${entry.findings}`).join('\n')}`
    : 'Sos la primera etapa: no hay handoff previo.'

  const result = await agent(
    `${RULES}\n\n${previous}\n\nActuá como ${stage.agent}, respetando su contrato en ` +
    `agents/<tipo>/${stage.agent}/SKILL.md y sus límites. Etapa "${stage.id}": producí ` +
    `${(stage.produces || []).join(' y ')}. Distinguí hechos, evidencia, supuestos y preguntas ` +
    `abiertas. El exit gate es: "${stage.exitGate}". Marcá gatePassed sólo si se cumple de verdad; ` +
    `si no, explicá en missing qué falta y en humanAction la acción concreta que lo desbloquea.`,
    { schema: STAGE, label: `stage:${stage.id}` },
  )
  if (!result) return stop('stage-unavailable', `la etapa ${stage.id} no devolvió resultado`)

  handoffs.push({ id: stage.id, agent: stage.agent, ...result })
  if (!result.gatePassed) {
    blocked.push({ stage: stage.id, missing: result.missing || '', action: result.humanAction || '' })
    log(`Gate no cumplido en ${stage.id}: ${result.missing || 'sin detalle'}`)
    break
  }
}

if (blocked.length) {
  await agent(
    `${RULES}\n\nRegistrá en ${HUMAN} una fila por cada bloqueo, con la tarea, el estado pendiente, el ` +
    `origen (etapa ${blocked[0].stage}) y la acción humana exacta que lo desbloquea. No inventes ` +
    `responsables ni fechas. Bloqueos: ${JSON.stringify(blocked)}`,
    { label: 'human-actions' },
  )
  return stop('gate-no-cumplido', `${blocked[0].stage}: ${blocked[0].missing}`)
}

phase('Draft')

// Un recorrido que registra lo aprendido no propone trabajo: deja el informe y las tareas de
// seguimiento en el INBOX, donde una persona decide si alguna merece convertirse en épica.
if (contract.outcome === 'report') {
  const report = await agent(
    `${RULES}\n\nHandoffs completos:\n${JSON.stringify(handoffs)}\n\nEscribí el informe en ${REPORTS} como ` +
    `<AAAA-MM-DD>-<slug>.md: qué pasó, qué se sabe con evidencia, qué se supone, qué se decidió y qué ` +
    `queda abierto. Separá causa de síntoma y no atribuyas responsabilidad a personas. Registrá cada ` +
    `seguimiento en la sección Lecciones de ${INBOX}, sin promoverlo, y toda acción que requiera una ` +
    `persona en ${HUMAN}.`,
    { schema: { type: 'object', required: ['file', 'followUps'], properties: {
      file: { type: 'string' }, followUps: { type: 'integer' }, summary: { type: 'string' },
    } }, label: 'report-write' },
  )
  if (!report) return stop('report-unavailable', 'el informe no devolvió resultado')
  log(`Informe en ${report.file}. ${report.followUps} seguimiento(s) en el INBOX, sin promover.`)
  return finish({ team: TEAM, stages: handoffs.length, report: report.file, promoted: false })
}

const epic = await agent(
  `${RULES}\n\nHandoffs completos:\n${JSON.stringify(handoffs)}\n\nComo product-manager, decidí si la ` +
  `intención es viable con la evidencia reunida. Si lo es, redactá la épica: título, slug en ` +
  `kebab-case, criterios observables C1..CN —cada uno verificable sin ambigüedad— e historias que ` +
  `rastreen a esos criterios. Si no lo es, viable=false y el motivo concreto. No la promuevas.`,
  { schema: EPIC, label: 'epic-draft' },
)
if (!epic) return stop('draft-unavailable', 'la propuesta de épica no devolvió resultado')

if (!epic.viable) {
  await agent(
    `${RULES}\n\nRegistrá la conclusión en la sección Lecciones de ${INBOX}: por qué esta intención no ` +
    `es viable hoy y qué la haría viable. Motivo: ${epic.reason}`,
    { label: 'inbox-lesson' },
  )
  return stop('no-viable', epic.reason)
}

await agent(
  `${RULES}\n\nEscribí la épica en ${ROADMAP} como epic-NNN-${epic.slug}.md, tomando el próximo NNN ` +
  `libre y siguiendo el contrato de ${P}/PROTOCOL.md: frontmatter epic/title/status/service con ` +
  `status open, criterios **CN**, "## Contexto relevante" e historias con (→ CN) y (service: ruta). ` +
  `Título: ${epic.title}. Criterios: ${JSON.stringify(epic.criteria)}. ` +
  `Historias: ${JSON.stringify(epic.stories)}. No toques BACKLOG.md: la promoción es humana.`,
  { label: 'epic-write' },
)

phase('Closing')

const closing = await agent(
  `${RULES}\n\nRun "node tools/ops.js check ${P}" from ${ROOT} and report whether it passed. If it ` +
  `failed, repair only the epic you just wrote so it satisfies the contract; never weaken a criterion ` +
  `to force green.`,
  { schema: { type: 'object', required: ['passed', 'details'], properties: {
    passed: { type: 'boolean' }, details: { type: 'string' },
  } }, label: 'closing-check' },
)
if (!closing || !closing.passed) return stop('check-failed', closing ? closing.details : 'sin resultado')

log(`Épica candidata lista en ${ROADMAP}. Promoverla al BACKLOG requiere una decisión humana.`)
return finish({ team: TEAM, stages: handoffs.length, epic: epic.slug, promoted: false })
