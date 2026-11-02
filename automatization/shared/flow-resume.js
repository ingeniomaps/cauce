// Retomar un recorrido que frenó en un gate esperando a una persona (caso 458). La corrida que frena deja en
// `planning/reports/` un archivo con los handoffs de lo que ya cerró, y la que retoma lo lee y no vuelve a pagar esas
// etapas. Va en disco y no en la caché de reanudación del runtime de workflows: esa caché es de la misma sesión, y
// quien contesta un gate suele hacerlo otro día.
//
// La suma es la misma que `resumeHash` de `engine/flows/resume.js`, donde está para qué sirve.
function resumeCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(resumeCanonical).join(',')}]`
  if (value && typeof value === 'object') {
    const pairs = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${resumeCanonical(value[key])}`)
    return `{${pairs.join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

function resumeHash(value) {
  let hash = 0x811c9dc5
  for (const char of resumeCanonical(value)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// Lo que la corrida que retoma necesita de cada etapa cerrada: el handoff entero, porque a la síntesis le llega
// todo salvo el resumen —evidencia y supuestos incluidos—, y una etapa reutilizada no puede llegarle con menos.
const resumeHandoff = (entry) => ({
  id: entry.id, agent: entry.agent, gate: entry.gate, summary: entry.summary || '', analysis: entry.analysis || '',
  evidence: entry.evidence || [], assumptions: entry.assumptions || [],
  missing: entry.missing || '', humanAction: entry.humanAction || '',
  openQuestions: (entry.openQuestions || []).map((one) => ({ detail: one.detail, blocking: Boolean(one.blocking) })),
})

const RESUME_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['flow', 'intent', 'today', 'stages', 'stoppedAt', 'handoffs', 'hash'],
  properties: {
    flow: { type: 'string' }, intent: { type: 'string' }, today: { type: 'string' }, stoppedAt: { type: 'string' },
    hash: { type: 'string' }, stages: { type: 'array', items: { type: 'string' } },
    handoffs: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'agent', 'gate', 'summary', 'analysis', 'evidence', 'assumptions', 'missing', 'humanAction',
        'openQuestions'], properties: {
        id: { type: 'string' }, agent: { type: 'string' }, gate: { type: 'string' }, summary: { type: 'string' },
        analysis: { type: 'string' }, missing: { type: 'string' }, humanAction: { type: 'string' },
        evidence: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        openQuestions: { type: 'array', items: { type: 'object', additionalProperties: false,
          required: ['detail', 'blocking'],
          properties: { detail: { type: 'string' }, blocking: { type: 'boolean' } } } },
      } } },
  },
}

// Qué se reutiliza de una retoma, o por qué no se puede. Lo que cerró sale del archivo, salvo lo que quien retoma
// pidió relanzar y lo que depende de eso; la etapa que frenó corre siempre. Una retoma que no coincide con esta
// corrida se rechaza nombrando qué difiere: reutilizar un handoff de otro recorrido, otra intención u otras etapas
// es decidir sobre un análisis que no es éste.
function resumePlan(file, saved, { flow, intent, stages, rerun, ancestors, error }) {
  if (!saved) {
    return { stop: 'retoma-ilegible', detail: `no se pudo leer ${file}: ${error || 'el comando no devolvió nada'}. ` +
      `Para verlo: node tools/ops.js flow resume show "${file}"` }
  }
  const { hash, ...payload } = saved
  if (resumeHash(payload) !== hash) {
    return { stop: 'retoma-corrupta', detail: `${file} no llegó igual a como se guardó: la suma no coincide, y una ` +
      'etapa no se reutiliza sobre un resumen que pudo cambiar' }
  }
  const ids = stages.map((stage) => stage.id)
  const differs = [
    saved.flow !== flow && `es de ${saved.flow}, no de ${flow}: repetí con "flow": "${saved.flow}"`,
    intent && saved.intent !== intent && 'la intención no es la misma: para retomar, no la pases o pasala igual',
    saved.stages.join(',') !== ids.join(',')
      && `las etapas eran ${saved.stages.join(', ')} y hoy son ${ids.join(', ')}`,
    ...rerun.filter((id) => !ids.includes(id)).map((id) => `rerun nombra ${id}, que no es una etapa`),
  ].filter(Boolean)
  if (differs.length) return { stop: 'retoma-no-coincide', detail: `${file}: ${differs.join('; ')}` }
  const relaunched = new Set(stages.filter((stage, index) =>
    rerun.includes(stage.id) || ancestors(stage, index).some((id) => rerun.includes(id))).map((stage) => stage.id))
  const reused = new Map()
  for (const entry of saved.handoffs) {
    if (entry.gate !== 'no-cumplido' && !relaunched.has(entry.id)) reused.set(entry.id, entry)
  }
  return { reused }
}

// Lo que recibe una etapa que vuelve a correr al retomar. Va al final de su prompt, así lo demás queda igual.
//
// A cada etapa que frenó le toca además cerrar la acción humana que su gate había pedido, si con la respuesta su gate
// ahora se cumple: una fila que sigue pendiente se lee como un bloqueo abierto. Se la encarga a ella y no a un agente
// más porque ya tiene la respuesta en la mano y herramientas de archivo; un agente aparte costaba otra vuelta entera.
// La fila se reconoce por lo que pidió, que es lo único que la retoma sabe de ella: el agente que la escribió no
// devuelve su ruta. Por eso, sin ese texto o con dudas, no se toca ninguna.
function resumeBlock(stage, saved, answers, rerun, human) {
  const previous = saved.handoffs.find((entry) => entry.id === stage.id)
  const stopped = saved.handoffs.filter((entry) => entry.gate === 'no-cumplido').map((entry) => entry.id)
  const asked = previous && previous.gate === 'no-cumplido' ? previous.humanAction : ''
  return `\n\nEsta corrida retoma otra que frenó en el gate de ${stopped.join(' y ') || saved.stoppedAt}. ` +
    (answers ? `Lo que contestó la persona:\n${answers}\n`
      : `No hay respuestas nuevas: se pidió relanzar ${rerun.join(', ')}.\n`) +
    (previous ? `Tu análisis de esa corrida está en ${previous.analysis}: partí de él y cambiá sólo lo que estas ` +
      'respuestas mueven, en vez de rehacerlo. ' : '') +
    'Si una respuesta contradice algo que una etapa anterior dejó establecido, cerrá con gate=no-cumplido y nombrá ' +
    'en missing qué etapa habría que relanzar.' +
    (answers && asked ? ` Si con esto tu gate se cumple —cumplido o con-condiciones, no si volvés a cerrar en ` +
      `no-cumplido—, en ${human} está pendiente la fila que la corrida anterior registró por tu gate, la que pedía ` +
      `«${asked}»: cambiá su status a «resuelta <AAAA-MM-DD>» y agregá al cuerpo lo que contestó la persona. Si ` +
      'ninguna fila pendiente pide eso, o hay más de una que podría ser, no toques ninguna y decilo en missing.' : '')
}
