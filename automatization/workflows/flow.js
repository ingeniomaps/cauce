// Recorrido de un equipo: convierte una intención en una épica candidata, o en la razón por la
// que todavía no se puede. Es el espejo de `autobuild`, que ejecuta trabajo ya aprobado.
//
// Nunca promueve: escribe la épica en roadmap/ y para. Promoverla al BACKLOG sigue siendo la firma
// humana que autoriza ejecución.
export const meta = {
  name: 'flow',
  description: 'Recorre las etapas de un equipo, exige sus exit gates y propone una épica',
  whenToUse: 'Evaluar si una idea es viable y darle forma antes de aprobarla, con varios cargos.',
  phases: [
    { title: 'Contract', detail: 'Manifiesto del equipo y contexto de la empresa' },
    { title: 'Stages', detail: 'Una etapa por dueño de decisión, con su exit gate' },
    { title: 'Draft', detail: 'Épica candidata con criterios observables' },
    { title: 'Closing', detail: 'Validación y acciones humanas pendientes' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}

// Dónde trabaja el recorrido. Normalmente es la raíz donde se lo invocó; `args.root` existe para
// correrlo sobre otra instancia —el banco desechable con el que `flow-eval` lo mide—, porque un
// recorrido que sólo sabe escribir en su propio planning/ no se puede medir sin ensuciarlo.
const WORKDIR = String((typeof args === 'string' ? '' : (args || {}).root) || ROOT).replace(/\/+$/, '')
const P = `${WORKDIR}/planning`
const ROADMAP = `${P}/roadmap`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const INBOX = `${P}/INBOX.md`
const REPORTS = `${P}/reports`

// Tres formas de invocarlo, porque escribir JSON en un slash command no es razonable:
//
//   /flow quiero cobrar con tarjeta                    equipo por defecto
//   /flow feasibility-review: quiero cobrar con tarjeta   equipo elegido por prefijo
//   /flow {"flow": "acme-soporte", "intent": "..."}    argumentos estructurados
//
// El prefijo se toma como candidato y se confirma más abajo contra los equipos que existen: si no es
// uno, el texto completo era la intención y nadie tuvo que aprenderse una sintaxis.
const input = typeof args === 'string' ? { intent: args } : (args || {})
const raw = String(input.intent || '').trim()
const prefix = raw.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+)$/s)
const CANDIDATE = String(input.flow || (prefix ? prefix[1] : '') || 'product-development')
const INTENT = (input.flow || !prefix ? raw : prefix[2]).trim()

const MANIFEST = {
  // `exists` es lo único obligatorio: el mismo agente responde "no hay tal equipo" sin poder llenar
  // un manifiesto que no existe. El resto se exige después, cuando sí lo hay.
  type: 'object', additionalProperties: false, required: ['exists'],
  properties: {
    exists: { type: 'boolean' },
    flows: { type: 'array', items: { type: 'string' } },
    name: { type: 'string' }, purpose: { type: 'string' },
    outcome: { type: 'string', enum: ['epic', 'report'] },
    entryAgent: { type: 'string' }, facilitator: { type: 'string' },
    guardrails: { type: 'array', items: { type: 'string' } },
    // Dos campos más del contrato real. No los usa el recorrido, pero el agente copia lo que el comando
    // imprimió y `additionalProperties: false` los rechazaba: el reintento volvía a copiarlos hasta
    // agotar el cap, y un caso de `feasibility-review` quedó sin medir por eso. Es el mismo defecto que
    // `dependsOn`, que se arregló mirando sólo las claves de las etapas.
    completion: { type: 'array', items: { type: 'string' } },
    conditionalAgents: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      domain: { type: 'string' }, agent: { type: 'string' },
    } } },
    stages: { type: 'array', items: { type: 'object', additionalProperties: false,
      // `skill` es obligatorio a propósito: siendo opcional el agente lo omitía, la etapa caía al
      // camino de respaldo y salía a buscar el contrato igual. Un dato que se puede resolver una vez
      // no debería depender de que alguien se acuerde de resolverlo.
      required: ['id', 'agent', 'phase', 'skill'], properties: {
      id: { type: 'string' }, agent: { type: 'string' }, exitGate: { type: 'string' },
      phase: { type: 'string', enum: ['discovery', 'delivery'] },
      produces: { type: 'array', items: { type: 'string' } },
      // El recorrido no lo usa —las etapas corren en orden—, pero el contrato lo trae y al agente se le
      // pide que reporte lo que el comando imprimió. Rechazarlo hacía que el reintento volviera a
      // copiarlo hasta agotar el cap, y la corrida moría sin haber hecho nada.
      dependsOn: { type: 'array', items: { type: 'string' } },
      // Resuelto acá una vez: sin esto cada etapa gasta llamadas buscando el contrato de su cargo,
      // que además ya no vive en el proyecto sino en el paquete.
      skill: { type: 'string' },
    } } },
  },
}
// `findings` y `summary` dicen cosas distintas a propósito. El primero es el análisis entero y lo lee
// una sola vez quien sintetiza al final; el segundo viaja a cada etapa posterior, así que un handoff que
// arrastra todo pasa a costar una vez por etapa en vez de una vez (R16).
// Tres estados porque una etapa tiene tres cosas distintas que decir, y con un booleano la del medio se
// pierde: cumplir dejando una condición que la síntesis tiene que respetar se veía igual que cumplir sin
// nada pendiente, y la condición se diluía en la prosa del handoff. Y `blocking` separa la pregunta que
// condiciona lo que se decida después de la que sólo conviene mirar alguna vez.
const STAGE = {
  type: 'object', additionalProperties: false, required: ['gate', 'findings', 'summary'],
  properties: {
    gate: { type: 'string', enum: ['cumplido', 'con-condiciones', 'no-cumplido'] },
    findings: { type: 'string' }, summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['detail', 'blocking'],
      properties: { detail: { type: 'string' }, blocking: { type: 'boolean' } },
    } },
    missing: { type: 'string' },
    humanAction: { type: 'string' },
  },
}
// Tres salidas porque el contrato del equipo enumera tres —«hacer, no hacer o investigar»— y con un
// booleano la del medio no tenía dónde caer. En una corrida real la etapa que decide cerró con
// «investigar antes de estimar» y el recorrido escribió igual una épica con cinco criterios y cinco
// historias: investigar se convirtió en hacer, que es justo lo que esa etapa había dicho que no.
const EPIC = {
  type: 'object', additionalProperties: false, required: ['outcome', 'title'],
  properties: {
    outcome: { type: 'string', enum: ['hacer', 'investigar', 'no-hacer'] },
    title: { type: 'string' }, slug: { type: 'string' },
    reason: { type: 'string' },
    criteria: { type: 'array', items: { type: 'string' } },
    stories: { type: 'array', items: { type: 'string' } },
  },
}

// Lo que una etapa deja condicionado y la siguiente tiene que respetar. Lo demás que anotó no se pierde:
// viaja en el handoff completo hasta la síntesis, pero no condiciona nada ni llega como acción humana.
const openConditions = (entries) => entries.flatMap((entry) => (entry.openQuestions || [])
  .filter((one) => one.blocking).map((one) => `${entry.id}: ${one.detail}`))

{{INCLUDE:shared/workflow-finish.js}}

if (!INTENT) return stop('sin-intencion', 'pasá la intención a evaluar en args.intent')

phase('Contract')

const BASE = `Nunca inventes clientes, métricas, restricciones ni decisiones. No confundas una opinión ` +
  `del modelo con evidencia: si algo no se puede afirmar con lo disponible, decilo y registrá qué ` +
  `haría falta averiguar. No promuevas trabajo al BACKLOG, no escribas en sistemas externos y no ` +
  `declares validado nada sin evidencia observable.`

// Tres comandos deterministas en un solo agente. Eran dos agentes, y el segundo además leía
// `organization/` "como contexto para etapas siguientes": cada etapa es un agente nuevo con su
// propio contexto, así que esa lectura no llegaba a ninguna parte y sólo costaba tokens.
const contract = await agent(
  `${BASE}\n\nFrom ${WORKDIR}, run exactly these commands and report only what they printed. Read no ` +
  `other file.\n` +
  `1. "node tools/ops.js flow show ${CANDIDATE} --json".\n` +
  `2. "node tools/ops.js flow list" — copy every slug it printed into flows, verbatim. Do this even ` +
  `when command 1 worked: a stage that names a destination has to pick it from that list, and if it ` +
  `only ran on failure the destination came out of memory.\n` +
  `   If command 1 failed, set exists=false, report flows, and stop.\n` +
  `3. "node tools/ops.js agents list --json", which gives each role its resolved path.\n` +
  `Report exists=true and these manifest fields: name, purpose, outcome, entryAgent, facilitator, ` +
  `guardrails, decisionOwners flattened into owners as domain/agent pairs, and stages with id, phase, ` +
  `agent, produces, dependsOn and exitGate. Drop every other field the command printed — the schema ` +
  `rejects it, and a retry that copies it again burns the run.\n` +
  `For every stage set skill to "${WORKDIR}/<path>/SKILL.md", where <path> is what command 3 printed ` +
  `for that stage's agent. That command prints paths relative to ${WORKDIR}, and the stages run from ` +
  `elsewhere, so the prefix is not optional.`,
  { schema: MANIFEST, label: 'flow-contract' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer el manifiesto de ${CANDIDATE}`)
if (contract.exists === false) {
  if (input.flow) {
    return stop('equipo-inexistente', `${CANDIDATE} no existe. Disponibles: ${(contract.flows || []).join(', ')}`)
  }
  // El prefijo era parte de la intención, no un equipo: se recompone y se reintenta por defecto.
  return stop('equipo-inexistente', `"${CANDIDATE}" no es un equipo. Repetí sin el prefijo: la ` +
    `intención completa era "${raw}". Disponibles: ${(contract.flows || []).join(', ')}`)
}
if (!contract.name || !contract.stages || !contract.guardrails) {
  return stop('contrato-incompleto', `el manifiesto de ${CANDIDATE} no trae nombre, etapas o guardrails`)
}
const FLOW = CANDIDATE
const GOAL = INTENT

const owners = (contract.owners || []).map((owner) => `${owner.domain}=${owner.agent}`).join(', ')
// Qué recorridos existen. Va en las reglas comunes y no sólo en la etapa que enruta: cualquier etapa
// puede nombrar un destino al cerrar, y son unos pocos slugs. Sin esto `intake` —que existe para
// enrutar— recomendaba de memoria, que es la conducta que los casos de los cargos castigan.
const catalogo = (contract.flows || []).filter((slug) => slug !== FLOW)
const RULES = `${BASE}\n\nRecorrido ${contract.name}: ${contract.purpose}\n` +
  `Guardrails: ${contract.guardrails.join(' ')}\n` +
  `${owners ? `Dueños de decisión: ${owners}. Ningún otro cargo resuelve en su dominio.\n` : ''}` +
  `${catalogo.length ? `Recorridos que existen además de éste: ${catalogo.join(', ')}. Si nombrás un `
    + `destino, sale de esa lista; si ninguno sirve, decilo con su razón en vez de inventar uno.\n` : ''}` +
  `Contexto de la empresa en ${WORKDIR}/organization/. Intención a evaluar: ${GOAL}`

phase('Stages')

const handoffs = []
const blocked = []
// Sólo descubrimiento: este recorrido propone trabajo, no lo ejecuta. Las etapas de entrega las
// corre `autobuild`, y sólo después de que una persona promueva la épica al BACKLOG.
const discovery = contract.stages.filter((stage) => stage.phase === 'discovery')
if (!discovery.length) return stop('sin-descubrimiento', `${FLOW} no declara etapas de discovery`)
for (const stage of discovery) {
  const previous = handoffs.length
    ? `Handoffs previos:\n${handoffs.map((entry) => `- ${entry.id}: ${entry.summary}`).join('\n')}`
      + (openConditions(handoffs).length
        ? '\n\nCondiciones que dejaron las etapas anteriores y tenés que respetar:\n'
          + openConditions(handoffs).map((one) => `- ${one}`).join('\n')
        : '')
    : 'Sos la primera etapa: no hay handoff previo.'

  const result = await agent(
    `${RULES}\n\n${previous}\n\nActuá como ${stage.agent}, respetando su contrato en ` +
    `${stage.skill || `${WORKDIR}/agents/roles/${stage.agent}/SKILL.md`} y sus límites. ` +
    `Etapa "${stage.id}": producí ` +
    `${(stage.produces || []).join(' y ')}. Distinguí hechos, evidencia, supuestos y preguntas ` +
    `abiertas. El exit gate es: "${stage.exitGate}". Cerrá con gate=cumplido si se cumple y no queda nada ` +
    `pendiente; gate=con-condiciones si se cumple pero dejás una condición que lo que se decida después ` +
    `tiene que respetar; y gate=no-cumplido si no se cumple, y ahí explicá en missing qué falta y en ` +
    `humanAction la acción concreta que lo desbloquea. En openQuestions marcá blocking=true sólo en la que ` +
    `condiciona la decisión siguiente. ` +
    `En findings va el análisis completo: lo lee sólo quien sintetiza al final. En summary va, en 150 ` +
    `palabras o menos, lo que la etapa siguiente necesita para decidir —no un resumen de tu análisis, ` +
    `sino lo que le cambia el trabajo—, porque eso se le reenvía a cada etapa posterior.`,
    { schema: STAGE, label: `stage:${stage.id}` },
  )
  if (!result) return stop('stage-unavailable', `la etapa ${stage.id} no devolvió resultado`)

  handoffs.push({ id: stage.id, agent: stage.agent, ...result })
  if (result.gate === 'no-cumplido') {
    blocked.push({ stage: stage.id, missing: result.missing || '', action: result.humanAction || '' })
    log(`Gate no cumplido en ${stage.id}: ${result.missing || 'sin detalle'}`)
    break
  }
}

if (blocked.length) {
  // Lo que las etapas anteriores sí resolvieron viaja con el bloqueo. Sin esto se perdía: un recorrido
  // que frena en la etapa 3 tiraba el trabajo de las dos primeras, que vivía sólo en memoria. Quien lea
  // la acción humana necesita saber qué quedó establecido para no volver a discutirlo, y el cargo que
  // aprende de sus propias decisiones no tiene de dónde leerlas si nunca se escribieron.
  const settled = handoffs.filter((entry) => entry.gate !== 'no-cumplido')
  const established = settled.length
    ? `Lo que ya quedó establecido y no hay que volver a discutir:\n${settled
      .map((entry) => `- ${entry.id} (${entry.agent}): ${entry.findings}`).join('\n')}`
    : 'Ninguna etapa anterior cerró: el bloqueo es de la primera.'
  await agent(
    `${RULES}\n\nRegistrá en ${HUMAN} una fila por cada bloqueo, con la tarea, el estado pendiente, el ` +
    `origen (etapa ${blocked[0].stage}) y la acción humana exacta que lo desbloquea. No inventes ` +
    `responsables ni fechas. Bloqueos: ${JSON.stringify(blocked)}\n\n${established}\n\nIncluí en la fila un ` +
    `resumen de lo establecido, con la etapa y el cargo que lo decidió: es el trabajo que ya se pagó.`,
    { label: 'human-actions' },
  )
  return stop('gate-no-cumplido', `${blocked[0].stage}: ${blocked[0].missing}`)
}

// Quien sintetiza lee el análisis entero. El resumen de control ya hizo su trabajo viajando entre
// etapas, y acá sólo diría dos veces lo mismo.
const complete = handoffs.map(({ summary, ...rest }) => rest)

// Una condición que ninguna etapa levantó no desaparece porque el recorrido haya cerrado. Va dos veces a
// propósito: al prompt de quien redacta, para que la épica o el informe la respete, y a las acciones
// humanas, porque una condición que sólo vive dentro del artefacto se lee como parte de lo ya resuelto.
const pending = openConditions(handoffs)
const CONDITIONS = pending.length
  ? `\n\nCondiciones que las etapas dejaron abiertas y el resultado tiene que respetar:\n`
    + pending.map((one) => `- ${one}`).join('\n')
  : ''
if (pending.length) {
  await agent(
    `${RULES}\n\nRegistrá en ${HUMAN} una fila por cada condición que las etapas dejaron abierta, con la ` +
    `etapa que la levantó y qué decisión la cierra. No inventes responsables ni fechas, y no las des por ` +
    `resueltas: ${JSON.stringify(pending)}`,
    { label: 'condiciones' },
  )
}

phase('Draft')

// Un recorrido que registra lo aprendido no propone trabajo: deja el informe y las tareas de
// seguimiento en el INBOX, donde una persona decide si alguna merece convertirse en épica.
if (contract.outcome === 'report') {
  const report = await agent(
    `${RULES}\n\nHandoffs completos:\n${JSON.stringify(complete)}${CONDITIONS}\n\n` +
    `Escribí el informe en ${REPORTS} como ` +
    `<AAAA-MM-DD>-<slug>.md: qué pasó, qué se sabe con evidencia, qué se supone, qué se decidió y qué ` +
    `queda abierto. Separá causa de síntoma y no atribuyas responsabilidad a personas. Registrá cada ` +
    `seguimiento en ${INBOX} sin promoverlo, en la sección que le toca por su sujeto: un cambio del ` +
    `producto con su evidencia va a Propuestas, lo aprendido sobre cómo trabajamos va a Lecciones. ` +
    `Toda acción que requiera una persona, en ${HUMAN}.`,
    { schema: { type: 'object', required: ['file', 'followUps'], properties: {
      file: { type: 'string' }, followUps: { type: 'integer' }, summary: { type: 'string' },
    } }, label: 'report-write' },
  )
  if (!report) return stop('report-unavailable', 'el informe no devolvió resultado')
  log(`Informe en ${report.file}. ${report.followUps} seguimiento(s) en el INBOX, sin promover.`)
  return finish({ flow: FLOW, stages: handoffs.length, report: report.file, promoted: false })
}

const epic = await agent(
  `${RULES}\n\nHandoffs completos:\n${JSON.stringify(complete)}${CONDITIONS}\n\n` +
  `Como product-manager, decidí si la ` +
  `intención es viable con la evidencia reunida. Si lo es, redactá la épica: título, slug en ` +
  `kebab-case, criterios observables C1..CN —cada uno verificable sin ambigüedad— e historias que ` +
  `rastreen a esos criterios. Si lo que hace falta antes es averiguar algo —hablar con usuarios, medir lo ` +
  `que no se mide, explorar el diseño—, outcome=investigar con qué hay que averiguar y quién puede: eso no ` +
  `es una épica más chica, es otra cosa. Si no vale el esfuerzo, outcome=no-hacer con el motivo concreto y ` +
  `qué lo cambiaría. No promuevas nada.`,
  { schema: EPIC, label: 'epic-draft' },
)
if (!epic) return stop('draft-unavailable', 'la propuesta de épica no devolvió resultado')

// Cada salida va donde el contrato del equipo dice que va, y ninguna escribe una épica que nadie pidió.
if (epic.outcome === 'no-hacer') {
  await agent(
    `${RULES}\n\nRegistrá la conclusión en la sección Lecciones de ${INBOX}: por qué esta intención no ` +
    `es viable hoy y qué la haría viable. Motivo: ${epic.reason}`,
    { label: 'inbox-lesson' },
  )
  return stop('no-viable', epic.reason)
}
// Terminar en «hay que averiguar esto primero» no es un recorrido fallido: es el resultado que evita
// presupuestar sobre lo que nadie sabe todavía. Lo que no puede es salir disfrazado de épica.
if (epic.outcome === 'investigar') {
  await agent(
    `${RULES}\n\nRegistrá en ${HUMAN} qué hay que averiguar antes de poder decidir esta intención y quién ` +
    `puede hacerlo, sin inventar responsables ni fechas, y dejá la conclusión en la sección Ideas de ` +
    `${INBOX} sin promoverla. Qué falta averiguar: ${epic.reason}`,
    { label: 'investigar' },
  )
  return finish({ flow: FLOW, stages: handoffs.length, investigate: epic.reason, promoted: false })
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
  `${RULES}\n\nRun "node tools/ops.js check ${P}" from ${WORKDIR} and report whether it passed. If it ` +
  `failed, repair only the epic you just wrote so it satisfies the contract; never weaken a criterion ` +
  `to force green.`,
  { schema: { type: 'object', required: ['passed', 'details'], properties: {
    passed: { type: 'boolean' }, details: { type: 'string' },
  } }, label: 'closing-check' },
)
if (!closing || !closing.passed) return stop('check-failed', closing ? closing.details : 'sin resultado')

log(`Épica candidata lista en ${ROADMAP}. Promoverla al BACKLOG requiere una decisión humana.`)
return finish({ flow: FLOW, stages: handoffs.length, epic: epic.slug, promoted: false })
