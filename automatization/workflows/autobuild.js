// Implementación portable de planning/PROTOCOL.md para runners compatibles con workflows de Claude.
// Descubre proyecto, servicios y límites desde ops.config.json; no codifica rutas ni proveedores.
export const meta = {
  name: 'autobuild',
  description: 'Triage → Pick → Cast → Ready → Plan → Build → Review → Verify → QA → Commit → Done',
  whenToUse: 'Ejecutar un hito aprobado con recuperación por WIP y checkpoint humano entre hitos.',
  phases: [
    'Triage', 'Pick', 'Cast', 'Ready', 'Decompose', 'Plan', 'Critique', 'Build', 'Review',
    'Verify', 'QA', 'Commit', 'Done', 'Closing',
  ].map((title) => ({ title, detail: `Fase ${title} del protocolo agnóstico` })),
}

// El prefijo lo completa `automation install`. No puede venir del entorno: el runtime de workflows no
// expone `process`, así que leerlo de ahí reventaba el archivo entero en su primera línea. Viaja
// escrito, relativo a la carpeta donde se abre la herramienta, que es el cwd de los agentes.
const ROOT = '{{OPS_DIR}}'.replace(/\/+$/, '') || '.'
const CONFIG = `${ROOT}/ops.config.json`
const P = `${ROOT}/planning`
const BACKLOG = `${P}/BACKLOG.md`
const DONE = `${P}/DONE.md`
const WIP = `${P}/WIP.md`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const GATE = `${P}/AWAITING_REVIEW.md`
const ROADMAP = `${P}/roadmap`

// Estado de planning tal como lo emite `ops context --json`; ningún modelo parsea BACKLOG ni WIP.
const CONTEXT = {
  type: 'object', additionalProperties: false, required: ['blocked', 'hasTask', 'wipActive', 'queued'],
  properties: {
    blocked: { type: 'string' }, hasTask: { type: 'boolean' }, wipActive: { type: 'boolean' },
    queued: { type: 'integer' }, slug: { type: 'string' }, hito: { type: 'string' },
    service: { type: 'string' }, acceptance: { type: 'string' }, epic: { type: 'string' },
    lane: { type: 'string', enum: ['', 'directo', 'lite', 'full'] },
    blockedTasks: { type: 'array', items: { type: 'string' } },
  },
}
const EXPANSION = {
  type: 'object', additionalProperties: false, required: ['expanded'],
  properties: { expanded: { type: 'boolean' }, hito: { type: 'string' }, reason: { type: 'string' } },
}
const READY = {
  type: 'object', additionalProperties: false, required: ['ready', 'needsHuman'],
  properties: { ready: { type: 'boolean' }, needsHuman: { type: 'boolean' }, reason: { type: 'string' }, refinedAcceptance: { type: 'string' } },
}
const ESTIMATE = {
  type: 'object', additionalProperties: false, required: ['hours', 'needsSplit'],
  properties: {
    hours: { type: 'number' }, needsSplit: { type: 'boolean' },
    subtasks: { type: 'array', items: { type: 'object', required: ['title', 'acceptance'], properties: {
      title: { type: 'string' }, acceptance: { type: 'string' }, service: { type: 'string' },
    } } },
  },
}
const PLAN = {
  type: 'object', additionalProperties: false, required: ['approach', 'steps', 'files', 'testStrategy'],
  properties: {
    approach: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
    testStrategy: { type: 'string' },
  },
}
const DECISION = {
  type: 'object', additionalProperties: false, required: ['approved', 'concerns'],
  properties: { approved: { type: 'boolean' }, concerns: { type: 'array', items: { type: 'string' } } },
}
const VERIFY = {
  type: 'object', additionalProperties: false, required: ['passed', 'commands', 'details'],
  properties: {
    passed: { type: 'boolean' }, details: { type: 'string' },
    commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exitCode'], properties: {
      cmd: { type: 'string' }, exitCode: { type: 'integer' }, note: { type: 'string' },
    } } },
    regressions: { type: 'array', items: { type: 'string' } }, preExisting: { type: 'array', items: { type: 'string' } },
  },
}
const QA = {
  type: 'object', additionalProperties: false, required: ['passed', 'evidence'],
  properties: { passed: { type: 'boolean' }, evidence: { type: 'string' }, behavioral: { type: 'boolean' }, bugs: { type: 'array', items: { type: 'string' } } },
}
const COMMIT = {
  type: 'object', additionalProperties: false, required: ['committed'],
  properties: {
    committed: { type: 'boolean' }, hash: { type: 'string' }, subject: { type: 'string' },
    branch: { type: 'string' }, leftovers: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' },
  },
}
// Dueño por defecto de cada fase. Es determinista: no hace falta preguntarle a un modelo quién
// revisa la arquitectura o quién decide si la evidencia de calidad alcanza.
const OWNERS = {
  ready: 'product-manager',
  plan: 'software-architect',
  review: 'software-architect',
  verify: 'qa-engineer',
  qa: 'qa-engineer',
  commit: 'release-manager',
}

const CAST_RULES = 'Elegís quién trabaja, no qué se hace. No inventes slugs: usá sólo los que ' +
  'devuelve el CLI. Un cargo se suma por riesgo, plataforma o alcance, nunca por rutina.'

const CAST = {
  type: 'object', additionalProperties: false, required: ['build'],
  properties: {
    build: { type: 'string' },
    review: { type: 'array', items: { type: 'string' } },
    verify: { type: 'array', items: { type: 'string' } },
    qa: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
}

const CONTRACT = {
  type: 'object', additionalProperties: false,
  required: ['project', 'workspaceRoots', 'maxTaskHours', 'commitPerTask', 'humanCheckpoint', 'contracts'],
  properties: {
    project: { type: 'string' }, workspaceRoots: { type: 'array', minItems: 1, items: { type: 'string' } },
    maxTaskHours: { type: 'number' }, commitPerTask: { type: 'boolean' },
    humanCheckpoint: { type: 'boolean' }, contracts: { type: 'string' },
    boundaries: { type: 'array', items: { type: 'string' } },
  },
}

// Preámbulo invariante: no depende del proyecto y nunca obliga a leer un archivo.
const BASE = `Never invent credentials or decisions; register external blockers in ${HUMAN}. Never execute INBOX ` +
  `automatically. Never push, deploy, amend, force, or use git add -A. Never edit process governance, and do not ` +
  `edit planning bookkeeping unless this workflow explicitly requests it.`
const stop = (reason, detail = '') => {
  log(`Checkpoint: ${reason}${detail ? ` — ${detail}` : ''}`)
  return finish({ stopped: true, reason, detail })
}

phase('Triage')
// El contrato se lee una sola vez por corrida y viaja como texto: ningún subagente relee AGENTS.md,
// ops.config.json ni PROTOCOL.md. `ops check` y el guard planning-drift siguen validando el resultado.
const contract = await agent(
  `${BASE}\n\nRead ${ROOT}/AGENTS.md, ${CONFIG} and ${P}/PROTOCOL.md exactly once and read nothing else. Report the ` +
  `config values verbatim: project, workspaceRoots as "name → path" entries, runner.maxTaskHours, ` +
  `runner.commitPerTask, and runner.humanCheckpointBetweenMilestones as humanCheckpoint. Copy the "## Contratos" ` +
  `section of PROTOCOL.md into contracts literally, without rewording, summarising or reordering it. ` +
  `In boundaries list only limits stated in AGENTS.md that constrain autonomous execution.`,
  { schema: CONTRACT, label: 'contract-digest' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer ${CONFIG} ni ${P}/PROTOCOL.md`)

const limits = (contract.boundaries || []).length ? ` Project limits: ${contract.boundaries.join('; ')}.` : ''
// Alcance de escritura: para subagentes que tocan código o ejecutan gates del producto.
const SCOPE = `${BASE}\n\nProject ${contract.project}. workspaceRoots is the complete writable product boundary: ` +
  `${contract.workspaceRoots.join('; ')}.${limits} This preamble already carries the contract; do not re-read ` +
  `${ROOT}/AGENTS.md, ${CONFIG} or ${P}/PROTOCOL.md.`
// Formatos de planning: sólo para subagentes que escriben roadmap, BACKLOG, WIP, DONE o gates.
const LEDGER = `${SCOPE}\n\nPlanning contracts, verbatim from ${P}/PROTOCOL.md:\n${contract.contracts}`

const read = (prompt, options = {}) => agent(`${BASE}\n\n${prompt}`, options)
const run = (prompt, options = {}) => agent(`${SCOPE}\n\n${prompt}`, options)
const write = (prompt, options = {}) => agent(`${LEDGER}\n\n${prompt}`, options)

// Gate, mutex de WIP y selección de tarea salen de un comando determinista: AWAITING_REVIEW, BACKLOG,
// WIP y HUMAN_ACTIONS nunca entran al contexto de un modelo, y su tamaño deja de costar tokens.
const readContext = () => read(
  `Run "node tools/ops.js context ${P} --json" from ${ROOT} and report only what it printed. Derive hasTask from ` +
  `whether task is null, wipActive from whether wip is null, and lane from task.tier; copy slug, hito, service, ` +
  `acceptance and epic from task. The command is the source of truth: do not open planning files to complete it.`,
  { schema: CONTEXT, label: 'planning-context' },
)

let planning = await readContext()
if (!planning) return stop('context-unavailable', `no se pudo leer el estado de ${P}`)
if (planning.blocked) return stop('awaiting-human-review', `${GATE} tiene un checkpoint humano sin resolver`)

let currentHito = planning.wipActive ? planning.hito : ''
const completed = []
let safety = 0

while (safety++ < 50) {
  phase('Pick')
  if (!planning.hasTask && !planning.queued) {
    const expansion = await write(
      `Read ${ROADMAP}. Expand only the next approved open epic into a new hito of ${BACKLOG}, preserving each story ` +
      `slug, its criteria references and its service. Never promote ${P}/INBOX.md. Report whether you wrote anything.`,
      { schema: EXPANSION },
    )
    if (!expansion.expanded) break
    planning = await readContext()
    if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
  }
  if (!planning.hasTask || (currentHito && planning.hito !== currentHito)) break
  const task = {
    id: planning.slug, hito: planning.hito, service: planning.service,
    acceptance: planning.acceptance, epic: planning.epic,
  }
  currentHito = task.hito
  const direct = planning.lane === 'directo'
  const lite = planning.lane === 'lite'

  // Quién ejecuta cada fase. Los dueños por defecto son fijos y no gastan una llamada; los
  // condicionales entran por riesgo, plataforma y alcance —nunca por rutina—, que es la misma
  // regla que ya usa el team. En `directo` no hay condicionales: el lane baja ceremonia.
  const cast = { ...OWNERS, build: '' }
  if (!direct) {
    phase('Cast')
    const chosen = await read(
      `${CAST_RULES}\n\nTarea ${task.id} en ${task.service}. Aceptación: ${task.acceptance}.\n` +
      `Run "node tools/ops.js agents list ${ROOT} --json" and choose only from the slugs it lists.\n` +
      `Elegí el cargo que implementa según la plataforma del servicio${lite ? '.' : ', y los cargos ' +
      'condicionales que la superficie realmente justifica: seguridad si toca autenticación, permisos, ' +
      'criptografía o datos sensibles; privacidad si toca datos personales; sre si toca disponibilidad, ' +
      'límites o despliegue; ux si cambia una superficie que usa una persona; y el que corresponda a ' +
      'datos o modelos si los toca. Dejá vacío lo que no aplique: sumar un cargo que no aporta es ruido ' +
      'que diluye la revisión.'}`,
      { schema: CAST, label: 'cast' },
    )
    if (chosen) {
      cast.build = chosen.build || ''
      for (const key of ['review', 'verify', 'qa']) {
        cast[key] = [OWNERS[key], ...(lite ? [] : chosen[key] || [])].filter(Boolean).join(', ')
      }
      log(`Cargos: build=${cast.build || '(sin asignar)'} · review=${cast.review} · qa=${cast.qa}`)
    }
  }
  const asRole = (slugs) => (slugs
    ? `Actuá como ${slugs}, respetando el contrato de cada uno en su SKILL.md bajo agents/ y sus ` +
      `límites: un cargo que no puede decidir solo, no decide solo.\n\n`
    : '')

  if (!planning.wipActive) {
    phase('Ready')
    const ready = await read(
      `${asRole(OWNERS.ready)}Check concrete acceptance, dependencies and unresolved decisions for ${task.id}: ` +
      `${task.acceptance}. Clarify wording only; never expand scope.`, { schema: READY },
    )
    if (!ready.ready) {
      await write(`Register ${task.id} in ${HUMAN} with reason and an exact human action: ${ready.reason}.`)
      return stop('not-ready', ready.reason)
    }
    if (ready.refinedAcceptance) task.acceptance = ready.refinedAcceptance

    if (!direct && !lite) {
      phase('Decompose')
      const estimate = await run(
        `Inspect ${task.service} and estimate ${task.id}. Split it only if it exceeds ${contract.maxTaskHours} hours.`,
        { schema: ESTIMATE },
      )
      if (estimate.needsSplit) {
        await write(`Replace only ${task.id} in ${BACKLOG} with ordered, independently verifiable subtasks: ${JSON.stringify(estimate.subtasks)}.`)
        planning = await readContext()
        if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
        continue
      }
    }

    phase('Plan')
    let plan = await run(
      `${asRole(OWNERS.plan)}Inspect real code, repository instructions, neighbouring conventions, epic context ` +
      `and git status for ${task.id}. ` +
      `Produce the smallest plan satisfying ${task.acceptance}. Planning files cannot be implementation files.`, { schema: PLAN },
    )
    if (!direct && !lite) {
      phase('Critique')
      let critique = await read(
        `Attack this plan for correctness, scope, security, tests and conflicts with existing code: ${JSON.stringify(plan)}`,
        { schema: DECISION },
      )
      if (!critique.approved) {
        plan = await read(`Revise the plan once for: ${critique.concerns.join('; ')}. Plan: ${JSON.stringify(plan)}`, { schema: PLAN })
        critique = await read(`Re-critique the revised plan against ${task.acceptance}: ${JSON.stringify(plan)}`, { schema: DECISION })
        if (!critique.approved) return stop('plan-rejected', critique.concerns.join('; '))
      }
    }
    await write(
      `Persist active WIP before code: task=${task.id}, hito=${JSON.stringify(task.hito)}, phase=Build, service=${task.service}, ` +
      `acceptance=${JSON.stringify(task.acceptance)}, unchecked steps=${JSON.stringify(plan.steps)}. ` +
      `Registrá además el reparto de cargos ${JSON.stringify(cast)} en las decisiones del WIP, para que ` +
      `después se pueda auditar quién revisó qué. Follow the WIP contract exactly.`,
    )
  }

  phase('Build')
  const build = await run(
    `${asRole(cast.build)}Implement only ${task.id} inside ${task.service}. Resume at the first pending WIP ` +
    `step; verify completed steps on disk ` +
    `and tick each successful step. Use RED/GREEN for behavior. Acceptance: ${task.acceptance}.`, {
      schema: { type: 'object', required: ['completed', 'summary'], properties: {
        completed: { type: 'boolean' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } },
      } },
    },
  )
  if (!build.completed) return stop('build-blocked', (build.blockers || []).join('; ') || build.summary)

  if (!direct) {
    phase('Review')
    let review = await run(
      `${asRole(cast.review)}Review the actual diff for acceptance, regressions, security, architecture, ` +
      `generated code, migrations and accidental scope. Cada cargo revisa su dominio, no el ajeno.`,
      { schema: DECISION },
    )
    if (!review.approved) {
      await write(`Fix only these evidence-backed findings and update WIP: ${review.concerns.join('; ')}`)
      review = await run(`Re-review the corrected diff for ${task.id}.`, { schema: DECISION })
      if (!review.approved) return stop('review-failed', review.concerns.join('; '))
    }
  }

  phase('Verify')
  const verified = await run(
    `${asRole(cast.verify)}Discover and run the real gates for ${task.service}: repository instructions first, ` +
    `then applicable test, lint, ` +
    `typecheck and build. Read actual exit codes. passed=true needs commands and no task-caused regression.`, { schema: VERIFY },
  )
  if (!verified.passed || !verified.commands.length) return stop('verify-failed', verified.details)

  phase('QA')
  const qa = await run(
    `${asRole(cast.qa)}${direct || lite ? 'Perform the cheapest real acceptance check' : 'Exercise real consumer-visible behavior'} for ` +
    `${task.id}. Unit tests alone are not QA. Start only minimum runtime and tear it down. Acceptance: ${task.acceptance}.`,
    { schema: QA },
  )
  if (!qa.passed) return stop('qa-failed', qa.evidence)

  phase('Commit')
  const commit = contract.commitPerTask ? await run(
    `${asRole(OWNERS.commit)}Find the git repo owning ${task.service}, inspect status/diff, stage explicit task ` +
    `files, create one Conventional ` +
    `Commit with footer "Task: ${task.id}", then verify log/status. Never amend or push; report unrelated leftovers.`,
    { schema: COMMIT },
  ) : { committed: true, reason: 'runner.commitPerTask is disabled' }
  if (!commit.committed) return stop('commit-failed', commit.reason)

  phase('Done')
  await write(
    `Atomically close ${task.id}: append it under its hito in ${DONE} with acept, done, qa, tests and commit evidence; ` +
    `remove it and its indented notes from ${BACKLOG}; close its epic only if no tagged task remains; reset ${WIP} to ` +
    `status IDLE. Facts: build=${build.summary}; verify=${JSON.stringify(verified.commands)}; qa=${qa.evidence}; ` +
    `commit=${commit.hash || commit.reason}.`,
  )
  completed.push(task.id)
  planning = await readContext()
  if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
}

phase('Closing')
const closing = await write(
  `Run "node tools/ops.js check ${P}" from ${ROOT}. If red, repair only deterministic derived state; never rewrite ` +
  `acceptance or decisions to force green.`, {
    schema: { type: 'object', required: ['passed', 'details'], properties: { passed: { type: 'boolean' }, details: { type: 'string' } } },
  },
)
if (!closing.passed) return stop('planning-check-failed', closing.details)
if (completed.length && contract.humanCheckpoint) await write(
  `Create ${GATE} with the completed hito, tasks ${completed.join(', ')}, evidence, pending human actions and exact ` +
  `continuation instructions. Never push or deploy.`,
)
return finish({ done: completed, count: completed.length, hito: currentHito })
