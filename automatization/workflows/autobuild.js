// Implementación portable de planning/PROTOCOL.md para runners compatibles con workflows de Claude.
// Descubre proyecto, servicios y límites desde ops.config.json; no codifica rutas ni proveedores.
export const meta = {
  name: 'autobuild',
  description: 'Triage → Pick → Classify → Plan → WIP → Build → Review → Verify → QA → Commit → Done',
  whenToUse: 'Ejecutar un hito aprobado con recuperación por WIP y checkpoint humano entre hitos.',
  // Escritas una por una y no derivadas de una lista: el runtime exige que `meta` sea un literal puro
  // —sin llamadas, variables ni interpolación— y con un `.map` acá rechazaba el archivo entero antes de
  // la primera fase. Escribirlas también les da un detalle propio, que es lo que se lee al autorizar.
  phases: [
    { title: 'Triage', detail: 'Contrato del proyecto y estado de planning' },
    { title: 'Pick', detail: 'La próxima tarea, o la épica que falta expandir' },
    { title: 'Classify', detail: 'Carril y reparto de la tarea que no los declara' },
    { title: 'Ready', detail: 'Aceptación concreta y sin decisiones pendientes' },
    { title: 'Decompose', detail: 'Partir la tarea que no entra en el tope de horas' },
    { title: 'Plan', detail: 'El cambio más chico que satisface la aceptación' },
    { title: 'Critique', detail: 'El plan atacado antes de escribir código' },
    { title: 'WIP', detail: 'El plan aprobado persistido antes del primer cambio' },
    { title: 'Build', detail: 'Implementación con la prueba en rojo primero' },
    { title: 'Review', detail: 'El diff real revisado por el dueño de cada dominio' },
    { title: 'Verify', detail: 'Los gates del servicio y la aceptación que ninguna prueba codifica' },
    { title: 'QA', detail: 'El comportamiento ejercitado como lo ve quien lo usa' },
    { title: 'Commit', detail: 'Conventional Commits, uno por naturaleza del diff, sin push' },
    { title: 'Done', detail: 'Cierre atómico en DONE con el WIP en IDLE' },
    { title: 'Closing', detail: 'Check de planning y checkpoint humano del hito' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
const CONFIG = `${ROOT}/ops.config.json`
const P = `${ROOT}/planning`
const ORG = `${ROOT}/organization`
const BACKLOG = `${P}/BACKLOG.md`
const DONE = `${P}/DONE.md`
const WIP = `${P}/WIP.md`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const GATE = `${P}/AWAITING_REVIEW.md`
const ROADMAP = `${P}/roadmap`

// Estado de planning tal como lo emite `ops context --json`; ningún modelo parsea BACKLOG ni WIP.
const CONTEXT = {
  type: 'object', additionalProperties: false,
  required: ['blocked', 'hasTask', 'wipActive', 'queued', 'cast'],
  properties: {
    blocked: { type: 'string' }, hasTask: { type: 'boolean' }, wipActive: { type: 'boolean' },
    queued: { type: 'integer' }, slug: { type: 'string' }, hito: { type: 'string' },
    service: { type: 'string' }, acceptance: { type: 'string' }, epic: { type: 'string' },
    lane: { type: 'string', enum: ['', 'express', 'directo', 'lite', 'full'] },
    // Quién entrega y quiénes miran, decidido al clasificar la tarea y escrito en su línea. Viene
    // siempre, aunque venga vacío: preguntar si el campo existe antes de leerlo es la clase de borde
    // que se olvida en una rama y revienta en la otra.
    cast: {
      type: 'object', additionalProperties: false, required: ['build', 'review'],
      properties: { build: { type: 'string' }, review: { type: 'array', items: { type: 'string' } } },
    },
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
//
// Tres estados porque hay tres cosas distintas que decir, y con un booleano dos se pisan: «no puedo
// aprobar esto» y «apruebo con algo que hay que corregir antes de entregar» caían las dos en el mismo
// `false`, así que la primera gastaba igual una vuelta de corrección sobre algo que la corrección no
// arregla. Y `blocking` separa lo que impide entregar de la mejora opinable, que hasta ahora mandaba a
// tocar código con la misma fuerza que un defecto.
const DECISION = {
  type: 'object', additionalProperties: false, required: ['verdict', 'concerns', 'consulted'],
  properties: {
    verdict: { type: 'string', enum: ['aprobado', 'con-condiciones', 'bloqueado'] },
    concerns: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['detail', 'blocking'],
      properties: { detail: { type: 'string' }, blocking: { type: 'boolean' } },
    } },
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
    // Dos causas que se leen igual en el resultado y piden cosas opuestas: a una le falta trabajo que
    // el propio recorrido puede hacer, a la otra le falta una decisión que no es suya. Sin separarlas,
    // la corrida frena por las dos y una persona termina resolviendo lo que se resolvía solo.
    uncovered: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['criterion', 'cause'],
      properties: {
        criterion: { type: 'string' },
        cause: { type: 'string', enum: ['missing-test', 'ambiguous'] },
      },
    } },
    commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exitCode'], properties: {
      cmd: { type: 'string' }, exitCode: { type: 'integer' }, note: { type: 'string' },
      ranTests: { type: 'boolean' },
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
  type: 'object', additionalProperties: false,
  required: ['completed', 'summary', 'redFirst', 'discovered', 'closedTask'],
  properties: {
    completed: { type: 'boolean' }, summary: { type: 'string' }, closedTask: { type: 'boolean' },
    redFirst: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['test', 'failure'],
      properties: { test: { type: 'string' }, failure: { type: 'string' } },
    } },
    blockers: { type: 'array', items: { type: 'string' } },
    // Estricto en el cómo, flexible en el qué: un `kind` por cada uno de los dos destinos que R6 le da a
    // lo que aparece y el plan no previó. Lo que agrega este recorrido es el enganche — el caso que esta
    // tarea puede fijar entra con la prueba que lo fija, y por eso su `test` tiene que estar en `redFirst`.
    discovered: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['kind', 'detail'],
      properties: {
        kind: { type: 'string', enum: ['edge', 'open'] },
        detail: { type: 'string' }, test: { type: 'string' },
      },
    } },
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

// Clasificar decide dos cosas de una: cuántas perspectivas merece la tarea —el lane— y cuáles —el
// cast—. El criterio va escrito porque sin él la clasificación es intuición, y la intuición se
// infla hacia arriba: toda tarea termina pareciendo `full`, que es el carril que no hay que
// justificar. Lo que decide es la superficie del cambio, no su tamaño en líneas: un `if` en el
// chequeo de permisos es `full`, y un componente entero de presentación puede ser `directo`.
const CLASSIFY_RULES = 'Clasificás quién trabaja y cuánta ceremonia merece la tarea; no decidís qué ' +
  'se hace ni lo hacés. Lane: `express` si la aceptación nombra un valor literal y el resultado no ' +
  'lo mira nadie —un typo, un umbral interno, un renombre—; `directo` si es igual de mecánico pero ' +
  'cambia una superficie que alguien ve; `lite` si es comportamiento nuevo ' +
  'dentro de un servicio con superficie conocida; `full` si cruza contratos entre servicios, datos, ' +
  'autenticación o permisos, o si la aceptación tiene un borde sin decidir. Cast: quien implementa ' +
  'según la plataforma del servicio, y los revisores que la superficie realmente justifica ' +
  '—seguridad si toca autenticación, permisos, criptografía o datos sensibles; privacidad si toca ' +
  'datos personales; sre si toca disponibilidad, límites o despliegue; ux si cambia una superficie ' +
  'que usa una persona; el de datos o modelos si los toca—. Sumar un cargo que no aporta es ruido ' +
  'que diluye la revisión. No inventes slugs: usá sólo los que devuelve el CLI.'

const CLASSIFICATION = {
  type: 'object', additionalProperties: false, required: ['classified'],
  properties: {
    classified: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['slug', 'lane', 'build'],
      properties: {
        slug: { type: 'string' }, lane: { type: 'string', enum: ['express', 'directo', 'lite', 'full'] },
        build: { type: 'string' }, review: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
    } },
  },
}

const CONTRACT = {
  type: 'object', additionalProperties: false,
  required: ['project', 'workspaceRoots', 'maxTaskHours', 'commitPerTask', 'humanCheckpoint', 'contracts'],
  properties: {
    project: { type: 'string' }, workspaceRoots: { type: 'array', minItems: 1, items: { type: 'string' } },
    // La puerta que el proyecto declara, si la declara. Viaja con la raíz porque es de la base de código
    // y no del runner: un monorepo tiene una por servicio, y uno solo tiene una sola.
    gates: { type: 'array', items: { type: 'string' } },
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
// Acompaña a todo prompt con schema DECISION. Sin el criterio escrito los tres estados son tres nombres
// y el del medio se pierde primero; por qué son tres está donde se declaran.
const VERDICT = ' Cerrá con verdict=aprobado si no queda nada por corregir antes de entregar; ' +
  'verdict=con-condiciones si lo que falta se corrige dentro de este mismo cambio; y verdict=bloqueado ' +
  'si algo no se resuelve acá —el diseño no lo cubre, falta una decisión ajena, o la corrección excede el ' +
  'alcance—. Marcá blocking=true sólo en el hallazgo que impide entregar: el resto queda registrado y no ' +
  'manda a tocar código.'
// Lo que hay que corregir antes de entregar. El resto de los hallazgos no desaparece: se registra.
const blockers = (verdict) => verdict.concerns.filter((one) => one.blocking).map((one) => one.detail)
// Atajo para reconocer un gate que corrió pruebas sin preguntarle a nadie. No alcanza solo y no
// pretende hacerlo: `mvn verify`, `gradle build`, `tox`, `bin/rails t` y cualquier `make` con nombre
// propio corren pruebas y no se parecen a esto, así que el que corrió el comando además lo declara en
// `ranTests` y vale cualquiera de los dos. Una lista de nombres siempre le va a faltar el siguiente;
// lo que no puede es frenar una corrida legítima por no conocerlo.
//
// El borde izquierdo va explícito en vez de `\b` porque `\b(?:` se lee igual que una llamada a `b()`
// y la comprobación de identificadores del paquete de pruebas la marca como función inexistente.
const RUNS_TESTS = /(?:^|[\s/:=-])(?:tests?|specs?|pytest|jest|vitest|mocha|rspec|phpunit|ci|check)\b/i
{{INCLUDE:shared/workflow-finish.js}}

// Por qué fases pasó esta corrida. Existe porque auditar una tarea no puede exigir leer este archivo:
// para saber si Review había corrido hubo que abrir el fuente y cruzarlo con los commits del día.
//
// Se envuelve `phase` en vez de anotar en sus quince llamadas: una que se olvidara de anotar dejaría
// un registro incompleto, que se lee igual que uno completo. Y se envuelve reasignando en vez de
// declarar, porque `phase` llega como parámetro del wrapper que arma el runner y redeclararlo con
// `const` es un SyntaxError; reasignar un parámetro sí es legal, y `announce` guarda el original.
const ran = []
const announce = phase
phase = (name) => { ran.push(name); announce(name) }

phase('Triage')
// El contrato se lee una sola vez por corrida y viaja como texto: ningún subagente relee AGENTS.md,
// workspace.md, ops.config.json ni PROTOCOL.md. `ops check` y el guard planning-drift siguen validando
// el resultado.
//
// `organization/workspace.md` está en esa lista desde que 0.57.0 sacó del `AGENTS.md` lo que sólo sabe
// el proyecto: los límites que éste amplía o restringe viven ahí, y sin leerlo lo que viaja a cada
// subagente como «Límites del proyecto» eran sólo los genéricos del toolkit.
const contract = await agent(
  `${BASE}\n\nLeé ${ROOT}/AGENTS.md, ${ORG}/workspace.md, ${CONFIG} y ${P}/PROTOCOL.md una sola vez y no ` +
  `leas nada más. Reportá los ` +
  `valores de configuración textualmente: project, workspaceRoots como entradas "nombre → ruta", ` +
  `runner.maxTaskHours, runner.commitPerTask y runner.humanCheckpointBetweenMilestones como humanCheckpoint. ` +
  `En gates poné una entrada "ruta → comando" por cada workspaceRoot que declare \`verify\`, y ninguna por ` +
  `las que no lo declaren: la lista vacía significa que el proyecto no dice con qué se verifica. ` +
  `Copiá la sección "## Contratos" de PROTOCOL.md dentro de contracts tal cual, sin reformular, resumir ni ` +
  `reordenar. En boundaries listá los límites que AGENTS.md enuncia y las "Excepciones de autonomía" que ` +
  `declare ${ORG}/workspace.md, que son las de este proyecto: si ese archivo no existe o su sección sigue ` +
  `como la trae el molde, no inventes ninguna.`,
  { schema: CONTRACT, label: 'contract-digest' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer ${CONFIG} ni ${P}/PROTOCOL.md`)

const bounds = contract.boundaries || []
const limits = bounds.length ? ` Límites del proyecto: ${bounds.join('; ')}.` : ''
// Alcance de escritura: para subagentes que tocan código o ejecutan gates del producto.
const SCOPE = `${BASE}\n\nProyecto ${contract.project}. workspaceRoots es el límite completo de escritura del ` +
  `producto: ${contract.workspaceRoots.join('; ')}.${limits} Este preámbulo ya trae el contrato; no vuelvas a leer ` +
  `${ROOT}/AGENTS.md, ${ORG}/workspace.md, ${CONFIG} ni ${P}/PROTOCOL.md.`
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
  `de si task es null, wipActive de si wip es null y lane de task.tier; copiá slug, hito, service, acceptance, ` +
  `epic y cast de task. El comando es la fuente de verdad: no abras archivos de planning para completarlo.`,
  { schema: CONTEXT, label: 'planning-context' },
)

let planning = await readContext()
if (!planning) return stop('context-unavailable', `no se pudo leer el estado de ${P}`)
if (planning.blocked) return stop('awaiting-human-review', `${GATE} tiene un checkpoint humano sin resolver`)

let currentMilestone = planning.wipActive ? planning.hito : ''
const completed = []
// Tope de tareas por corrida. No protege de un hito grande —cincuenta tareas en un hito es un problema
// de planificación, no de ejecución— sino de un ciclo: una tarea que vuelve a quedar elegible corre
// para siempre. Se corta con motivo porque agotarlo en silencio se lee igual que haber terminado.
const MAX_TASKS = 50
let rounds = 0
// Tareas que ya pasaron por el clasificador en esta corrida. Sin esto, una que vuelve sin lane
// —porque la escritura falló o el modelo la salteó— se reclasifica en cada vuelta del bucle.
const classified = new Set()

while (rounds++ < MAX_TASKS) {
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
  if (!planning.hasTask || (currentMilestone && planning.hito !== currentMilestone)) break
  const task = {
    id: planning.slug, hito: planning.hito, service: planning.service,
    acceptance: planning.acceptance, epic: planning.epic,
  }
  currentMilestone = task.hito

  // Ver la tarea y, si no está clasificada, clasificarla antes de ejecutarla. Se hace una vez por
  // tarea y se escribe en su línea, así que la decisión sobrevive a la corrida y la puede corregir
  // una persona antes de que se ejecute nada — al revés que la fase Cast, que la tomaba en caliente,
  // costaba una llamada por tarea y la tiraba al terminar. Clasifica el hito entero de una sola
  // llamada: lo que cuesta una vez no debería costar una vez por tarea.
  //
  // Un WIP activo no se reclasifica: la tarea ya está en vuelo con las fases que le tocaron, y
  // cambiárselas a mitad de camino la deja con un plan aprobado bajo otro carril.
  const unclassified = !planning.lane || !planning.cast.build
  if (unclassified && !planning.wipActive && !classified.has(task.id)) {
    phase('Classify')
    classified.add(task.id)
    const classification = await write(
      `${CLASSIFY_RULES}\n\nRun "node tools/ops.js agents list ${ROOT} --json" and choose only from the slugs ` +
      `it lists.\nClasificá en ${BACKLOG} todas las tareas en cola que no declaren lane o no declaren cast, ` +
      `empezando por ${task.id} en ${task.service} —aceptación: ${task.acceptance}—. El lane va entre ` +
      `corchetes después del slug y el reparto al final de la línea, con la forma ` +
      `"(cast: quien-entrega → quien-revisa, otro)". No toques nada más de la línea, ni el orden del hito, ` +
      `ni las tareas que ya declaran las dos cosas. Reportá lo que escribiste.`,
      { schema: CLASSIFICATION },
    )
    if (classification && classification.classified.length) {
      log(`Clasificadas: ${classification.classified
        .map((one) => `${one.slug} [${one.lane}] ${one.build}`).join(' · ')}`)
      planning = await readContext()
      if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
      continue
    }
    // Sin clasificación no se frena la tarea: `full` es el carril que no saltea nada, así que lo que
    // se pierde es tiempo y no evidencia. Frenar acá cobraría una interrupción por lo único que el
    // recorrido puede resolver solo.
    log(`${task.id} sigue sin clasificar: corre por el carril completo`)
  }

  // Quién puso el carril, que es lo que justifica saltear Ready y no el carril en sí: el clasificador
  // leyó la aceptación en esta corrida y dijo que nombra un valor literal. Escrito a mano en la línea,
  // ese lector no existió —`Classify` sólo corre si falta lane o cast—, y saltear la única fase que
  // pregunta si la tarea está lista quedaba apoyado en una premisa que nadie comprobó.
  const vouched = classified.has(task.id)
  const express = planning.lane === 'express'
  const direct = planning.lane === 'directo'
  const lite = planning.lane === 'lite'
  // Lo mecánico no se planifica ni se pregunta si está listo: el clasificador ya leyó la aceptación y
  // dijo que nombra un valor literal. Volver a preguntarlo son dos llamadas para llegar al mismo lado.
  const mechanical = express || direct

  // Quién ejecuta cada fase. Los dueños por defecto son fijos y no gastan una llamada; quien
  // implementa y quiénes revisan por riesgo salen de la línea de la tarea. Los revisores valen en
  // todos los carriles: los nombró quien ya sabía cuál era el carril, y descartarlos acá sería un
  // segundo filtro que contradice al primero.
  const cast = { ...OWNERS, build: planning.cast.build }
  cast.review = [OWNERS.review, ...planning.cast.review].filter(Boolean).join(', ')
  log(`Cargos: build=${cast.build || '(sin asignar)'} · review=${cast.review} · qa=${cast.qa}`)
  // Nombrar el cargo no alcanza: hay que decir dónde está su contrato, y `agents/` no es la respuesta.
  // El catálogo no se copia a la instancia —viaja en el paquete— así que esa carpeta no existe en la raíz
  // y la instrucción anterior mandaba a leer una ruta ausente. El workflow tampoco puede resolverla por
  // su cuenta: su runtime no lee archivos. Lo que sí puede es decir con qué comando se resuelve, y el
  // agente la obtiene dentro de su propia vuelta, sin costar una llamada más.
  const asRole = (slugs) => (slugs
    ? `Actuá como ${slugs}, respetando el contrato de cada uno y sus límites: un cargo que no puede ` +
      `decidir solo, no decide solo.\n\n` +
      `Leé ese contrato antes de empezar, no lo supongas por el nombre del cargo. El catálogo no se copia ` +
      `a esta instancia, así que no hay carpeta \`agents/\` en la raíz: la ruta la da ` +
      `"node tools/ops.js agents list ${ROOT} --json" en el campo \`path\` del slug, y el contrato es ` +
      `\`<path>/SKILL.md\`.\n\n`
    : '')

  if (!planning.wipActive) {
    if (!mechanical || !vouched) {
      phase('Ready')
      const ready = await read(
        `${asRole(OWNERS.ready)}Revisá que ${task.id} tenga aceptación concreta, dependencias resueltas y ` +
        `ninguna decisión pendiente: ${task.acceptance}. Aclará la redacción y nada más; nunca amplíes el ` +
        `alcance.`,
        { schema: READY },
      )
      if (!ready) return stop('agent-unavailable', 'Ready no devolvió resultado')
      if (!ready.ready) {
        await write(`Registrá ${task.id} en ${HUMAN} con el motivo y una acción humana exacta: ${ready.reason}.`)
        return stop('not-ready', ready.reason)
      }
      if (ready.refinedAcceptance) task.acceptance = ready.refinedAcceptance
    }

    if (!mechanical && !lite) {
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

    // El plan de un cambio mecánico es el cambio, y la aceptación ya lo nombra. Pedirlo igual costaba
    // dos llamadas —planificar y criticar el plan— para llegar a lo que la línea de la tarea ya decía.
    let plan = { steps: [`Aplicar en ${task.service} lo que nombra la aceptación: ${task.acceptance}`] }
    if (!mechanical) {
    phase('Plan')
    plan = await run(
      `${asRole(OWNERS.plan)}Inspeccioná el código real, las instrucciones del repositorio, las convenciones ` +
      `vecinas, el contexto de la épica y el git status de ${task.id}. Producí el plan más chico que satisfaga ` +
      `${task.acceptance}. Un archivo de planning no puede ser un archivo de implementación. El plan cubre ` +
      `sólo el cambio dentro de ${task.service}: correr los gates del repositorio, hacer QA, commitear y ` +
      `cerrar la tarea son fases posteriores de este recorrido, cada una con su dueño, así que no van como ` +
      `pasos.`,
      { schema: PLAN },
    )
    if (!plan) return stop('agent-unavailable', 'Plan no devolvió resultado')
    if (!lite) {
      phase('Critique')
      let critique = await read(
        `Atacá este plan por correctitud, alcance, seguridad, pruebas y conflictos con el código ` +
        `existente.${MANIFEST}${VERDICT} Plan: ${JSON.stringify(plan)}`,
        { schema: DECISION },
      )
      if (!critique) return stop('agent-unavailable', 'Critique no devolvió resultado')
      // Un plan bloqueado no se corrige: lo que lo bloquea está fuera de lo que una segunda pasada puede
      // tocar, así que insistir gasta dos llamadas para llegar al mismo lugar.
      if (critique.verdict === 'bloqueado') {
        return stop('plan-blocked', blockers(critique).join('; ') || 'sin condiciones nombradas')
      }
      if (blockers(critique).length) {
        plan = await read(
          `Corregí el plan una vez por: ${blockers(critique).join('; ')}. Plan: ${JSON.stringify(plan)}`,
          { schema: PLAN },
        )
        critique = await read(
          `Volvé a criticar el plan corregido contra ${task.acceptance}.${MANIFEST}${VERDICT} ` +
          `Plan: ${JSON.stringify(plan)}`,
          { schema: DECISION },
        )
        if (!plan || !critique) return stop('agent-unavailable', 'la revisión del plan no devolvió resultado')
        if (critique.verdict === 'bloqueado' || blockers(critique).length) {
          return stop('plan-rejected', blockers(critique).join('; ') || 'sin condiciones nombradas')
        }
      }
      // Acá el plan ya está aprobado por los dos caminos posibles, así que el contraste va una sola vez.
      if (!critique.consulted.length) return stop('critique-unbacked', 'aprobó el plan sin declarar qué inspeccionó')
    }
    }
    phase('WIP')
    // Esta llamada escribe un archivo y nada más, y hay que decirlo con todas las letras. En una corrida
    // real hizo el trabajo entero: leyó los pasos del plan como una orden, implementó, corrió RED/GREEN,
    // cerró la tarea en DONE y dejó el WIP en IDLE. Build encontró todo hecho y lo atribuyó a «una corrida
    // anterior», así que Review, Verify y QA nunca vieron ese código y el recorrido terminó reportando algo
    // distinto de lo que decía planning. El permiso venía del preámbulo de escritura; lo que faltaba era el
    // límite. `wipActive` es el contraste: si el WIP no quedó activo, esta fase hizo otra cosa.
    const persisted = await write(
      `Escribí el WIP y nada más: no toques código, no corras pruebas, no cierres la tarea y no escribas ` +
      `en DONE. Los pasos van sin tildar porque todavía no ocurrieron. task=${task.id}, ` +
      `hito=${JSON.stringify(task.hito)}, phase=Build, service=${task.service}, ` +
      `acceptance=${JSON.stringify(task.acceptance)}, pasos sin tildar=${JSON.stringify(plan.steps)}. ` +
      `Registrá el reparto de cargos ${JSON.stringify(cast)} en las decisiones del WIP, para que después se ` +
      `pueda auditar quién revisó qué. Seguí el contrato de WIP exactamente y reportá con qué status quedó.`,
      { schema: {
        type: 'object', additionalProperties: false, required: ['wipActive'],
        properties: { wipActive: { type: 'boolean' }, note: { type: 'string' } },
      } },
    )
    if (!persisted) return stop('agent-unavailable', 'la persistencia del WIP no devolvió resultado')
    if (!persisted.wipActive) {
      return stop('wip-not-persisted', `${task.id} entra a Build sin WIP activo: ${persisted.note || ''}`)
    }
  }

  phase('Build')
  const build = await run(
    `${asRole(cast.build)}Implementá sólo ${task.id} dentro de ${task.service}. Retomá en el primer paso ` +
    `pendiente del WIP; comprobá en el disco los pasos ya hechos y tildá cada uno que salga bien. Para cada ` +
    `comportamiento escribí primero la prueba, corréla y anotá en redFirst el test y el fallo literal que ` +
    `dio; recién después implementá. Un test que pasa antes de que exista el código no asercia lo que dice ` +
    `aserciar: endurecelo y volvé a correr hasta verlo fallar. Corré las pruebas que necesites para ver ese ` +
    `rojo y ese verde, y nada más: los gates completos, el QA, el commit y el cierre son fases posteriores, ` +
    `así que no toques ${DONE} ni ${BACKLOG} ni el status del WIP. Lo que el plan no previó va en discovered y ` +
    `no en el código a secas: kind=edge si esta tarea lo puede fijar —y entonces entra con su prueba, que ` +
    `nombrás en test y anotás en redFirst—, kind=open si lo notaste y no impide entregar la aceptación: se ` +
    `registra para que lo decida quien corresponde y el recorrido sigue. Si de verdad no podés entregar sin ` +
    `esa decisión, eso no va en discovered: es completed=false con su blocker. ` +
    `Aceptación: ${task.acceptance}.`,
    { schema: BUILD },
  )
  if (!build) return stop('agent-unavailable', 'Build no devolvió resultado')
  if (!build.completed) return stop('build-blocked', (build.blockers || []).join('; ') || build.summary)
  // Construir no es cerrar. Pasó en una corrida real: el plan traía «VERIFY», «QA» y «Cierre — commit» como
  // pasos, quien construyó los ejecutó, y la tarea salió del BACKLOG y entró a DONE sin que Review, Verify
  // ni QA la miraran. El plan ya no los pide; esto detecta que igual hayan ocurrido.
  if (build.closedTask) {
    return stop('build-closed-task', `${task.id} se cerró en Build, sin pasar por Review, Verify ni QA`)
  }
  // Nombrar el test sin traer su fallo es volver a afirmar que hubo rojo, que es lo que el campo evita.
  const unproven = build.redFirst.find((entry) => !entry.failure.trim())
  if (unproven) return stop('build-unproven', `${unproven.test} se declara en rojo sin el fallo que lo muestra`)
  // Lo que queda abierto no lo cierra quien lo encuentra, pero tampoco frena lo que sí se pudo entregar.
  // Tres corridas reales terminaron acá y las tres traían `completed: true`: el hueco nunca fue «no puedo»
  // sino «hay un borde que alguien tiene que decidir», y una aceptación escrita en prosa siempre tiene uno.
  // Frenar por eso frenaba siempre, que es el freno que R6 desaconseja. Lo que de verdad bloquea ya
  // tiene camino —`completed: false` con su blocker—; esto se registra y sigue.
  const openDecisions = build.discovered.filter((entry) => entry.kind === 'open')
  if (openDecisions.length) {
    await write(`Registrá en ${HUMAN} una fila por cada decisión que ${task.id} dejó abierta, con qué la ` +
      `cierra y quién puede tomarla. No inventes responsables ni fechas: ` +
      `${JSON.stringify(openDecisions.map((entry) => entry.detail))}`)
  }
  // Y un caso que sí se fijó acá entra con su prueba o no entró: sin ella el comportamiento nuevo queda
  // sin nada que lo sostenga, y nadie sabe después que debía existir.
  //
  // Los dos campos salen de la misma respuesta pero se escriben por separado, así que pedirles la misma
  // cadena exacta frena una tarea correcta por haber nombrado el test de dos formas —`TestAlta` acá y
  // `users_test.go::TestAlta` allá—. Alcanza con que uno nombre al otro; lo que sigue frenando, que es de
  // lo que se trata, es el caso que no aparece en ningún rojo.
  const namesTest = (red, item) => Boolean(item.test)
    && (red.test.includes(item.test) || item.test.includes(red.test))
  const loose = build.discovered.find((entry) => entry.kind === 'edge'
    && !build.redFirst.some((red) => namesTest(red, entry)))
  if (loose) return stop('edge-unproven', `${loose.detail} entró sin la prueba que lo fija`)

  // Qué revisión hubo, para que el cierre no pueda inventar una. Nace diciendo que no hubo porque
  // `express` no convoca a nadie, y ése es el caso que se escribió como si un cargo hubiera aprobado.
  let reviewFact = 'no corrió (el carril express no convoca revisor)'
  if (!express) {
    phase('Review')
    let review = await run(
      `${asRole(cast.review)}Revisá el diff real por aceptación, regresiones, seguridad, arquitectura, código ` +
      `generado, migraciones y alcance accidental. Cada cargo revisa su dominio, no el ajeno.${MANIFEST}` +
      `${VERDICT}`,
      { schema: DECISION },
    )
    if (!review) return stop('agent-unavailable', 'Review no devolvió resultado')
    if (review.verdict === 'bloqueado') {
      return stop('review-blocked', blockers(review).join('; ') || 'sin condiciones nombradas')
    }
    if (blockers(review).length) {
      await write(`Corregí sólo estos hallazgos con evidencia y actualizá el WIP: ${blockers(review).join('; ')}`)
      review = await run(`Volvé a revisar el diff corregido de ${task.id}.${MANIFEST}${VERDICT}`,
        { schema: DECISION })
      if (!review) return stop('agent-unavailable', 'la re-revisión no devolvió resultado')
      if (review.verdict === 'bloqueado' || blockers(review).length) {
        return stop('review-failed', blockers(review).join('; ') || 'sin condiciones nombradas')
      }
    }
    // Aprobar sin declarar qué se abrió no se arregla mandando a tocar código: falló quien revisó.
    if (!review.consulted.length) return stop('review-unbacked', 'aprobó el diff sin declarar qué inspeccionó')
    reviewFact = `${review.verdict} por ${cast.review}, sobre ${review.consulted.join(', ')}`
    // Lo que no impide entregar no manda a tocar código, y tampoco desaparece: la mejora opinable que se
    // corrige a las apuradas cuesta una vuelta y un riesgo que nadie pidió. Va a Propuestas y no a
    // Lecciones porque lo que la revisión anotó es un cambio del producto con su evidencia; Lecciones es
    // sobre cómo trabajamos, y ahí el hallazgo queda esperando una promoción que nadie va a hacer.
    const noted = review.concerns.filter((one) => !one.blocking).map((one) => one.detail)
    if (noted.length) {
      await write(`Registrá en la sección Propuestas de ${P}/INBOX.md lo que la revisión de ${task.id} dejó ` +
        `anotado sin frenar la entrega, sin promover ninguna: ${JSON.stringify(noted)}`)
    }
  }

  phase('Verify')
  const VERIFY_ASK = `${asRole(cast.verify)}Abrí el fuente de los tests que la tarea agregó o cambió y ` +
    `contrastá cada criterio ` +
    `de aceptación contra sus aserciones: en uncovered va el criterio que ningún test codifica, con su causa ` +
    `—missing-test si el test falta o no asercia la propiedad, ambiguous si el criterio no dice qué habría ` +
    `que aserciar—. Un test que pasa sin aserciarla no la cubre. Después corré los gates reales de ${task.service}. ` +
    // Descubrir la puerta es trabajo de modelo repetido en cada tarea sobre una respuesta que no cambia,
    // y encima adivinable: el proyecto la declara en `verify` y ahí deja de adivinarse. Cuando no la
    // declara se vuelve a descubrir, que es lo que pasaba siempre.
    (contract.gates && contract.gates.length
      ? `El proyecto las declara y no hay que descubrirlas —${contract.gates.join(' · ')}—: corré la de ` +
        `la raíz que contiene ese servicio, tal cual y desde esa raíz. Si falla por algo que la tarea no ` +
        `tocó, decilo en vez de arreglarlo. `
      : `El proyecto no declara con qué se verifica, así que descubrilo: primero las instrucciones del ` +
        `repositorio, después el test, lint, typecheck y build que apliquen. `) +
    `Leé los exit codes de verdad. ` +
    `passed=true exige comandos corridos y ninguna regresión causada por la tarea. Marcá ranTests en el ` +
    `comando que haya corrido las pruebas, sea cual sea su nombre. ` +
    `Aceptación: ${task.acceptance}.`
  let verified = await run(VERIFY_ASK, { schema: VERIFY })
  if (!verified) return stop('agent-unavailable', 'Verify no devolvió resultado')
  // Un criterio que nadie sabe cómo aserciar no es trabajo que falta sino una definición que falta, y
  // definirla acá sería inventarla. Escribir la prueba que falta, en cambio, es trabajo del recorrido:
  // hacer parar a una persona por eso le cobra una interrupción por algo que se resolvía solo.
  const ambiguous = verified.uncovered.find((entry) => entry.cause === 'ambiguous')
  if (ambiguous) {
    await write(`Registrá ${task.id} en ${HUMAN}: el criterio "${ambiguous.criterion}" no dice qué habría ` +
      `que aserciar, y hace falta la decisión que lo fija.`)
    return stop('acceptance-ambiguous', ambiguous.criterion)
  }
  if (verified.uncovered.length) {
    await run(`${asRole(cast.build)}Escribí sólo las pruebas que faltan en ${task.id}, con el mismo rojo ` +
      `previo, y no toques el código de producción: ${verified.uncovered.map((e) => e.criterion).join('; ')}`)
    verified = await run(VERIFY_ASK, { schema: VERIFY })
    if (!verified) return stop('agent-unavailable', 'la segunda pasada de Verify no devolvió resultado')
  }
  if (!verified.passed || !verified.commands.length) return stop('verify-failed', verified.details)
  // Verde por ausencia: los gates pasaron y ninguno corrió las pruebas que esta tarea escribió. El exit
  // code de lint o de build no dice nada del comportamiento, y la corrida cerraba igual.
  const ranTests = verified.commands.some((entry) => entry.ranTests || RUNS_TESTS.test(entry.cmd))
  if (build.redFirst.length && !ranTests) {
    return stop('verify-untested', `${task.id} escribió pruebas y ningún gate corrió una`)
  }
  if (verified.uncovered.length) {
    return stop('verify-hollow', `sin test que lo codifique: ${verified.uncovered.map((e) => e.criterion).join('; ')}`)
  }

  // QA ejercita comportamiento, y lo mecánico no lo cambia: el valor literal que la aceptación nombra
  // ya lo comprobó Verify contra el test, y en `directo` además lo mira el revisor que nombra el cast.
  let qa = { passed: true, evidence: 'carril mecánico: la aceptación queda comprobada en Verify' }
  if (!mechanical) {
    phase('QA')
    qa = await run(
      `${asRole(cast.qa)}${lite
        ? 'Hacé la comprobación de aceptación real más barata'
        : 'Ejercitá el comportamiento real que ve quien lo usa'} para ` +
      `${task.id}. Las pruebas unitarias solas no son QA. Levantá el mínimo runtime necesario y bajalo ` +
      `después. Aceptación: ${task.acceptance}.`,
      { schema: QA },
    )
    if (!qa) return stop('agent-unavailable', 'QA no devolvió resultado')
    if (!qa.passed) return stop('qa-failed', qa.evidence)
  }

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
    `ninguna tarea etiquetada; y dejá ${WIP} en status IDLE. En decisions no nombres una fase ni un cargo ` +
    `que no figure en estos hechos. Hechos: lane=${planning.lane || 'sin clasificar'}; ` +
    `review=${reviewFact}; fases=${ran.join(' → ')}; build=${build.summary}; ` +
    `verify=${JSON.stringify(verified.commands)}; qa=${qa.evidence}; commit=${commit.hash || commit.reason}.`,
  )
  completed.push(task.id)
  planning = await readContext()
  if (!planning) return stop('context-unavailable', `no se pudo releer el estado de ${P}`)
}

if (rounds > MAX_TASKS) {
  return stop('milestone-too-long', `la corrida agotó el tope de ${MAX_TASKS} tareas sin cerrar el hito`)
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
return finish({ done: completed, count: completed.length, hito: currentMilestone, phases: ran })
