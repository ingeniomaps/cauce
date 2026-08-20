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

{{INCLUDE:shared/workflow-root.js}}
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
  properties: {
    ready: { type: 'boolean' }, needsHuman: { type: 'boolean' },
    reason: { type: 'string' }, refinedAcceptance: { type: 'string' },
  },
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
// Un veredicto sin manifiesto no se puede contrastar: `consulted` enumera lo que quien revisó abrió de
// verdad, y es lo único que separa al que miró del que aprobó de memoria. No prueba que lo haya leído bien
// —para eso habría que releerlo—, y esa asimetría es la que lo deja barato (R14).
const DECISION = {
  type: 'object', additionalProperties: false, required: ['approved', 'concerns', 'consulted'],
  properties: {
    approved: { type: 'boolean' }, concerns: { type: 'array', items: { type: 'string' } },
    consulted: { type: 'array', items: { type: 'string' } },
  },
}
// Un exit code dice que el test corrió, no que pruebe lo que la tarea prometió: un test que asercia de
// menos —o que ni existe— sale verde igual, y el guard de verify tampoco lo ve porque también mira exit
// codes. Por eso `uncovered` se contrasta contra la aceptación leyendo el fuente, no la salida (R9).
const VERIFY = {
  type: 'object', additionalProperties: false, required: ['passed', 'commands', 'details', 'uncovered'],
  properties: {
    passed: { type: 'boolean' }, details: { type: 'string' },
    uncovered: { type: 'array', items: { type: 'string' } },
    commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exitCode'], properties: {
      cmd: { type: 'string' }, exitCode: { type: 'integer' }, note: { type: 'string' },
    } } },
    regressions: { type: 'array', items: { type: 'string' } },
    preExisting: { type: 'array', items: { type: 'string' } },
  },
}
const QA = {
  type: 'object', additionalProperties: false, required: ['passed', 'evidence'],
  properties: {
    passed: { type: 'boolean' }, evidence: { type: 'string' }, behavioral: { type: 'boolean' },
    bugs: { type: 'array', items: { type: 'string' } },
  },
}
// RED/GREEN sin registro es una intención: después nadie distingue el test que se vio fallar del que se
// escribió cuando el código ya andaba, y ese segundo no prueba su aserción, sólo que corre. Por eso
// `redFirst` trae el fallo literal de la corrida roja y no la afirmación de que la hubo (R14).
const BUILD = {
  type: 'object', additionalProperties: false, required: ['completed', 'summary', 'redFirst'],
  properties: {
    completed: { type: 'boolean' }, summary: { type: 'string' },
    redFirst: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['test', 'failure'],
      properties: { test: { type: 'string' }, failure: { type: 'string' } },
    } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
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
const BASE = `Nunca inventes credenciales ni decisiones; registrá los bloqueos externos en ${HUMAN}. Nunca ` +
  `ejecutes INBOX por tu cuenta. Nunca hagas push, deploy, amend, force ni git add -A. No edites la gobernanza ` +
  `del proceso, y no toques la contabilidad de planning salvo que este recorrido te lo pida explícitamente.`
// Acompaña a todo prompt con schema DECISION: el schema obliga a llenar `consulted`, y esto obliga a
// llenarlo con lo que se abrió en vez de con lo que se pensaba mirar.
const MANIFEST = ' Enumerá en consulted cada archivo, diff o comando que hayas abierto de verdad, con su ruta.'
// Con qué se reconoce un gate que corre pruebas. Es deliberadamente ancho: incluye los agregadores
// —`make ci`, `npm run check`— porque adentro corren el test, y de lo que se trata es de encontrar
// la corrida que faltó, no de clasificar comandos. El borde izquierdo va explícito en vez de `\b`
// porque `\b(?:` se lee igual que una llamada a `b()` y la comprobación de identificadores del
// paquete de pruebas la marca como función inexistente.
const RUNS_TESTS = /(?:^|[\s/:=-])(?:tests?|specs?|pytest|jest|vitest|mocha|rspec|phpunit|ci|check)\b/i
{{INCLUDE:shared/workflow-finish.js}}

phase('Triage')
// El contrato se lee una sola vez por corrida y viaja como texto: ningún subagente relee AGENTS.md,
// ops.config.json ni PROTOCOL.md. `ops check` y el guard planning-drift siguen validando el resultado.
const contract = await agent(
  `${BASE}\n\nLeé ${ROOT}/AGENTS.md, ${CONFIG} y ${P}/PROTOCOL.md una sola vez y no leas nada más. Reportá los ` +
  `valores de configuración textualmente: project, workspaceRoots como entradas "nombre → ruta", ` +
  `runner.maxTaskHours, runner.commitPerTask y runner.humanCheckpointBetweenMilestones como humanCheckpoint. ` +
  `Copiá la sección "## Contratos" de PROTOCOL.md dentro de contracts tal cual, sin reformular, resumir ni ` +
  `reordenar. En boundaries listá sólo los límites que AGENTS.md enuncia y que restringen la ejecución autónoma.`,
  { schema: CONTRACT, label: 'contract-digest' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer ${CONFIG} ni ${P}/PROTOCOL.md`)

const cotas = contract.boundaries || []
const limits = cotas.length ? ` Límites del proyecto: ${cotas.join('; ')}.` : ''
// Alcance de escritura: para subagentes que tocan código o ejecutan gates del producto.
const SCOPE = `${BASE}\n\nProyecto ${contract.project}. workspaceRoots es el límite completo de escritura del ` +
  `producto: ${contract.workspaceRoots.join('; ')}.${limits} Este preámbulo ya trae el contrato; no vuelvas a leer ` +
  `${ROOT}/AGENTS.md, ${CONFIG} ni ${P}/PROTOCOL.md.`
// Formatos de planning: sólo para subagentes que escriben roadmap, BACKLOG, WIP, DONE o gates.
const LEDGER = `${SCOPE}\n\nContratos de planning, textuales de ${P}/PROTOCOL.md:\n${contract.contracts}`

// Un subagente puede morir —error terminal tras reintentos, o alguien que lo saltea— y entonces el
// runtime devuelve `null`. Sin comprobarlo, la primera propiedad que se le pide revienta el recorrido
// con un TypeError en la fase que sea, y lo que quedó a medias es una tarea con WIP escrito y código
// sin revisar. Cada llamada corta con su etapa puesta: «no contestó» no es lo mismo que «dijo que no»,
// y sólo la segunda significa que alguien juzgó algo.
const read = (prompt, options = {}) => agent(`${BASE}\n\n${prompt}`, options)
const run = (prompt, options = {}) => agent(`${SCOPE}\n\n${prompt}`, options)
const write = (prompt, options = {}) => agent(`${LEDGER}\n\n${prompt}`, options)

// Gate, mutex de WIP y selección de tarea salen de un comando determinista: AWAITING_REVIEW, BACKLOG,
// WIP y HUMAN_ACTIONS nunca entran al contexto de un modelo, y su tamaño deja de costar tokens.
const readContext = () => read(
  `Corré "node tools/ops.js context ${P} --json" desde ${ROOT} y reportá sólo lo que imprimió. Derivá hasTask ` +
  `de si task es null, wipActive de si wip es null y lane de task.tier; copiá slug, hito, service, acceptance ` +
  `y epic de task. El comando es la fuente de verdad: no abras archivos de planning para completarlo.`,
  { schema: CONTEXT, label: 'planning-context' },
)

let planning = await readContext()
if (!planning) return stop('context-unavailable', `no se pudo leer el estado de ${P}`)
if (planning.blocked) return stop('awaiting-human-review', `${GATE} tiene un checkpoint humano sin resolver`)

let currentHito = planning.wipActive ? planning.hito : ''
const completed = []
// Tope de tareas por corrida. No protege de un hito grande —cincuenta tareas en un hito es un problema
// de planificación, no de ejecución— sino de un ciclo: una tarea que vuelve a quedar elegible corre
// para siempre. Se corta con motivo porque agotarlo en silencio se lee igual que haber terminado.
const MAX_TAREAS = 50
let vueltas = 0

while (vueltas++ < MAX_TAREAS) {
  phase('Pick')
  if (!planning.hasTask && !planning.queued) {
    const expansion = await write(
      `Leé ${ROADMAP}. Expandí sólo la próxima épica abierta y aprobada en un hito nuevo de ${BACKLOG}, ` +
      `conservando el slug de cada historia, sus referencias a criterios y su servicio. Nunca promuevas ` +
      `${P}/INBOX.md. Reportá si escribiste algo.`,
      { schema: EXPANSION },
    )
    if (!expansion) return stop('agent-unavailable', 'Pick no devolvió resultado')
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
      `${asRole(OWNERS.ready)}Revisá que ${task.id} tenga aceptación concreta, dependencias resueltas y ninguna ` +
      `decisión pendiente: ${task.acceptance}. Aclará la redacción y nada más; nunca amplíes el alcance.`,
      { schema: READY },
    )
    if (!ready) return stop('agent-unavailable', 'Ready no devolvió resultado')
    if (!ready.ready) {
      await write(`Registrá ${task.id} en ${HUMAN} con el motivo y una acción humana exacta: ${ready.reason}.`)
      return stop('not-ready', ready.reason)
    }
    if (ready.refinedAcceptance) task.acceptance = ready.refinedAcceptance

    if (!direct && !lite) {
      phase('Decompose')
      const estimate = await run(
        `Inspeccioná ${task.service} y estimá ${task.id}. Partila sólo si supera ${contract.maxTaskHours} horas.`,
        { schema: ESTIMATE },
      )
      if (!estimate) return stop('agent-unavailable', 'Decompose no devolvió resultado')
      if (estimate.needsSplit) {
        await write(`Reemplazá sólo ${task.id} en ${BACKLOG} por subtareas ordenadas y verificables de forma ` +
          `independiente: ${JSON.stringify(estimate.subtasks)}.`)
        planning = await readContext()
        if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
        continue
      }
    }

    phase('Plan')
    let plan = await run(
      `${asRole(OWNERS.plan)}Inspeccioná el código real, las instrucciones del repositorio, las convenciones ` +
      `vecinas, el contexto de la épica y el git status de ${task.id}. Producí el plan más chico que satisfaga ` +
      `${task.acceptance}. Un archivo de planning no puede ser un archivo de implementación.`,
      { schema: PLAN },
    )
    if (!plan) return stop('agent-unavailable', 'Plan no devolvió resultado')
    if (!direct && !lite) {
      phase('Critique')
      let critique = await read(
        `Atacá este plan por correctitud, alcance, seguridad, pruebas y conflictos con el código ` +
        `existente.${MANIFEST} Plan: ${JSON.stringify(plan)}`,
        { schema: DECISION },
      )
      if (!critique) return stop('agent-unavailable', 'Critique no devolvió resultado')
      if (!critique.approved) {
        plan = await read(
          `Corregí el plan una vez por: ${critique.concerns.join('; ')}. Plan: ${JSON.stringify(plan)}`,
          { schema: PLAN },
        )
        critique = await read(
          `Volvé a criticar el plan corregido contra ${task.acceptance}.${MANIFEST} Plan: ${JSON.stringify(plan)}`,
          { schema: DECISION },
        )
        if (!plan || !critique) return stop('agent-unavailable', 'la revisión del plan no devolvió resultado')
        if (!critique.approved) return stop('plan-rejected', critique.concerns.join('; '))
      }
      // Acá el plan ya está aprobado por los dos caminos posibles, así que el contraste va una sola vez.
      if (!critique.consulted.length) return stop('critique-unbacked', 'aprobó el plan sin declarar qué inspeccionó')
    }
    await write(
      `Persistí el WIP activo antes de tocar código: task=${task.id}, hito=${JSON.stringify(task.hito)}, ` +
      `phase=Build, service=${task.service}, acceptance=${JSON.stringify(task.acceptance)}, ` +
      `pasos sin tildar=${JSON.stringify(plan.steps)}. Registrá el reparto de cargos ${JSON.stringify(cast)} ` +
      `en las decisiones del WIP, para que después se pueda auditar quién revisó qué. ` +
      `Seguí el contrato de WIP exactamente.`,
    )
  }

  phase('Build')
  const build = await run(
    `${asRole(cast.build)}Implementá sólo ${task.id} dentro de ${task.service}. Retomá en el primer paso ` +
    `pendiente del WIP; comprobá en el disco los pasos ya hechos y tildá cada uno que salga bien. Para cada ` +
    `comportamiento escribí primero la prueba, corréla y anotá en redFirst el test y el fallo literal que ` +
    `dio; recién después implementá. Un test que pasa antes de que exista el código no asercia lo que dice ` +
    `aserciar: endurecelo y volvé a correr hasta verlo fallar. Aceptación: ${task.acceptance}.`,
    { schema: BUILD },
  )
  if (!build) return stop('agent-unavailable', 'Build no devolvió resultado')
  if (!build.completed) return stop('build-blocked', (build.blockers || []).join('; ') || build.summary)
  // Nombrar el test sin traer su fallo es volver a afirmar que hubo rojo, que es lo que el campo evita.
  const sinFallo = build.redFirst.find((entry) => !entry.failure.trim())
  if (sinFallo) return stop('build-unproven', `${sinFallo.test} se declara en rojo sin el fallo que lo muestra`)

  if (!direct) {
    phase('Review')
    let review = await run(
      `${asRole(cast.review)}Revisá el diff real por aceptación, regresiones, seguridad, arquitectura, código ` +
      `generado, migraciones y alcance accidental. Cada cargo revisa su dominio, no el ajeno.${MANIFEST}`,
      { schema: DECISION },
    )
    if (!review) return stop('agent-unavailable', 'Review no devolvió resultado')
    if (!review.approved) {
      await write(`Corregí sólo estos hallazgos con evidencia y actualizá el WIP: ${review.concerns.join('; ')}`)
      review = await run(`Volvé a revisar el diff corregido de ${task.id}.${MANIFEST}`, { schema: DECISION })
      if (!review) return stop('agent-unavailable', 'la re-revisión no devolvió resultado')
      if (!review.approved) return stop('review-failed', review.concerns.join('; '))
    }
    // Aprobar sin declarar qué se abrió no se arregla mandando a tocar código: falló quien revisó.
    if (!review.consulted.length) return stop('review-unbacked', 'aprobó el diff sin declarar qué inspeccionó')
  }

  phase('Verify')
  const verified = await run(
    `${asRole(cast.verify)}Abrí el fuente de los tests que la tarea agregó o cambió y contrastá cada criterio ` +
    `de aceptación contra sus aserciones: en uncovered va el criterio que ningún test codifica, sea porque ` +
    `falta o porque el que dice cubrirlo no asercia esa propiedad. Un test que pasa sin aserciarla no la ` +
    `cubre. Después descubrí y corré los gates reales de ${task.service}: primero las instrucciones del ` +
    `repositorio, después el test, lint, typecheck y build que apliquen. Leé los exit codes de verdad. ` +
    `passed=true exige comandos corridos y ninguna regresión causada por la tarea. ` +
    `Aceptación: ${task.acceptance}.`,
    { schema: VERIFY },
  )
  if (!verified) return stop('agent-unavailable', 'Verify no devolvió resultado')
  if (!verified.passed || !verified.commands.length) return stop('verify-failed', verified.details)
  // Verde por ausencia: los gates pasaron y ninguno corrió las pruebas que esta tarea escribió. El exit
  // code de lint o de build no dice nada del comportamiento, y la corrida cerraba igual.
  if (build.redFirst.length && !verified.commands.some((entry) => RUNS_TESTS.test(entry.cmd))) {
    return stop('verify-untested', `${task.id} escribió pruebas y ningún gate corrió una`)
  }
  if (verified.uncovered.length) {
    return stop('verify-hollow', `sin test que lo codifique: ${verified.uncovered.join('; ')}`)
  }

  phase('QA')
  const qa = await run(
    `${asRole(cast.qa)}${direct || lite
      ? 'Hacé la comprobación de aceptación real más barata'
      : 'Ejercitá el comportamiento real que ve quien lo usa'} para ` +
    `${task.id}. Las pruebas unitarias solas no son QA. Levantá el mínimo runtime necesario y bajalo después. ` +
    `Aceptación: ${task.acceptance}.`,
    { schema: QA },
  )
  if (!qa) return stop('agent-unavailable', 'QA no devolvió resultado')
  if (!qa.passed) return stop('qa-failed', qa.evidence)

  phase('Commit')
  const commit = contract.commitPerTask ? await run(
    `${asRole(OWNERS.commit)}Encontrá el repositorio git dueño de ${task.service}, inspeccioná status y diff, ` +
    `stageá por nombre los archivos de la tarea, creá un solo Conventional Commit con el footer ` +
    `"Task: ${task.id}" y después verificá log y status. Nunca amend ni push; reportá lo que quedó suelto ` +
    `y no era de la tarea.`,
    { schema: COMMIT },
  ) : { committed: true, reason: 'runner.commitPerTask está apagado' }
  if (!commit) return stop('agent-unavailable', 'Commit no devolvió resultado')
  if (!commit.committed) return stop('commit-failed', commit.reason)

  phase('Done')
  await write(
    `Cerrá ${task.id} de forma atómica: agregala bajo su hito en ${DONE} con evidencia de acept, done, qa, ` +
    `tests y commit; sacala junto con sus notas indentadas de ${BACKLOG}; cerrá su épica sólo si no queda ` +
    `ninguna tarea etiquetada; y dejá ${WIP} en status IDLE. Hechos: build=${build.summary}; ` +
    `verify=${JSON.stringify(verified.commands)}; qa=${qa.evidence}; commit=${commit.hash || commit.reason}.`,
  )
  completed.push(task.id)
  planning = await readContext()
  if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
}

if (vueltas > MAX_TAREAS) {
  return stop('milestone-too-long', `la corrida agotó el tope de ${MAX_TAREAS} tareas sin cerrar el hito`)
}

phase('Closing')
const closing = await write(
  `Corré "node tools/ops.js check ${P}" desde ${ROOT}. Si sale en rojo, reparás sólo estado derivado ` +
  `determinista; nunca reescribas aceptación ni decisiones para forzar el verde.`, {
    schema: {
      type: 'object', required: ['passed', 'details'],
      properties: { passed: { type: 'boolean' }, details: { type: 'string' } },
    },
  },
)
if (!closing) return stop('agent-unavailable', 'Closing no devolvió resultado')
if (!closing.passed) return stop('planning-check-failed', closing.details)
if (completed.length && contract.humanCheckpoint) await write(
  `Creá ${GATE} con el hito terminado, las tareas ${completed.join(', ')}, la evidencia, las acciones humanas ` +
  `pendientes y las instrucciones exactas para continuar. Nunca hagas push ni deploy.`,
)
return finish({ done: completed, count: completed.length, hito: currentHito })
