'use strict'

// Corre `flow` de verdad, con los cargos simulados. Es el mismo arnés que `autobuild.test.js` y existe
// por la misma razón: sus otros tests leen el fuente renderizado y comprueban que una línea esté escrita,
// lo que muestra que un freno existe pero no que frene cuando corresponde ni —sobre todo— que deje pasar
// cuando no. Cuatro corridas reales de `autobuild` encontraron tres defectos que ningún `match` veía.
//
// Lo que este arnés NO ve: los schemas. El runtime los valida antes de entregar la respuesta al recorrido,
// y acá el guion devuelve lo que se le pida, así que un `enum` recortado o un campo que dejó de ser
// obligatorio pasan sin ruido. Eso se cubre leyendo el fuente, en `workflows.test.js`.

require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileWorkflow } = require('./workflow')

// Un equipo de dos etapas de descubrimiento: alcanza para ver el handoff entre una y la siguiente, que
// es donde vive casi todo lo que el recorrido decide.
function baseScript() {
  return {
    'flow-contract': {
      exists: true, name: 'feasibility-review', purpose: 'decidir si vale el esfuerzo',
      outcome: 'epic', entryAgent: 'product-manager', facilitator: 'product-manager',
      guardrails: ['No promover al BACKLOG.'],
      owners: [{ domain: 'producto', agent: 'product-manager' }],
      stages: [
        {
          id: 'encuadre', agent: 'product-manager', phase: 'discovery', skill: '/r/pm/SKILL.md',
          produces: ['problema acotado'], exitGate: 'el problema está acotado y es de alguien',
        },
        {
          id: 'factibilidad', agent: 'software-architect', phase: 'discovery', skill: '/r/sa/SKILL.md',
          produces: ['opciones y costo'], exitGate: 'hay al menos una opción con su costo',
        },
      ],
    },
    'stage:encuadre': {
      gate: 'cumplido', summary: 'el problema es el alta duplicada', findings: 'análisis largo del encuadre',
      evidence: ['tres tickets de soporte'], assumptions: [], openQuestions: [],
    },
    'stage:factibilidad': {
      gate: 'cumplido', summary: 'una opción, dos semanas', findings: 'análisis largo de factibilidad',
      evidence: ['el servicio ya expone el alta'], assumptions: [], openQuestions: [],
    },
    'epic-draft': {
      outcome: 'hacer', title: 'Alta sin duplicados', slug: 'alta-sin-duplicados',
      criteria: ['C1 el duplicado se rechaza'], stories: ['rechazar duplicado (→ C1)'],
    },
    'closing-check': { passed: true, details: 'check verde' },
  }
}

async function runFlow(changes = {}, intent = 'quiero que el alta no duplique vendedores') {
  const script = { ...baseScript(), ...changes }
  const asked = []
  const written = []
  const prompts = []

  const agent = async (prompt, options = {}) => {
    const key = options.label || (options.schema && options.schema.required || []).join(',')
    asked.push(key)
    prompts.push({ key, prompt })
    if (!options.schema) { written.push(prompt); return { ok: true } }
    if (!(key in script)) throw new Error(`el guion no cubre ${key}`)
    const answer = script[key]
    return typeof answer === 'function' ? answer() : answer
  }

  const result = await compileWorkflow('flow')(
    agent, () => {}, () => {},
    async (thunks) => Promise.all(thunks.map((t) => t())), async () => [], async () => ({}),
    { intent }, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { result, asked, written, prompts }
}

test('flow recorre sus etapas y deja la épica sin promover', async () => {
  const { result, asked } = await runFlow()
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}: ${result.detail || ''}`)
  assert.equal(result.promoted, false, 'la promoción es una firma humana, no un paso del recorrido')
  assert.equal(result.stages, 2)
  assert.ok(asked.includes('stage:encuadre') && asked.includes('stage:factibilidad'))
})

// El resumen viaja entre etapas y el análisis entero sólo a la síntesis: son requisitos opuestos y por eso
// no son el mismo texto. Si la etapa siguiente recibiera findings, el tope no ahorraría nada.
test('entre etapas viaja el resumen, y el análisis entero llega a la síntesis', async () => {
  const { prompts } = await runFlow()
  const second = prompts.find((one) => one.key === 'stage:factibilidad').prompt
  assert.match(second, /el problema es el alta duplicada/, 'la siguiente recibe el resumen de la anterior')
  assert.equal(
    second.includes('análisis largo del encuadre'), false,
    'y no el análisis entero, que se reenviaría en cada etapa posterior',
  )
  const draft = prompts.find((one) => one.key === 'epic-draft').prompt
  assert.match(draft, /análisis largo del encuadre/, 'quien sintetiza sí lee el análisis completo')
  assert.equal(draft.includes('el problema es el alta duplicada'), false, 'y no lo recibe dos veces')
})

test('un exit gate no cumplido corta y deja la acción humana escrita', async () => {
  const { result, written, asked } = await runFlow({
    'stage:encuadre': {
      gate: 'no-cumplido', summary: 'no se pudo acotar', findings: 'x',
      missing: 'nadie sabe a qué usuario le pasa', humanAction: 'preguntarle a soporte',
    },
  })
  assert.equal(result.reason, 'gate-no-cumplido')
  assert.ok(!asked.includes('stage:factibilidad'), 'no se sigue con la etapa siguiente')
  assert.ok(written.some((texto) => texto.includes('HUMAN_ACTIONS')), 'el bloqueo queda con su acción')
})

// El estado del medio: la etapa cumplió, y deja una condición que la síntesis tiene que respetar. Con dos
// estados se diluía en la prosa del handoff y la épica podía no recogerla.
test('una etapa cumple con condiciones y esas condiciones llegan a la síntesis', async () => {
  const { result, prompts, written } = await runFlow({
    'stage:factibilidad': {
      gate: 'con-condiciones', summary: 'una opción viable', findings: 'x',
      openQuestions: [
        { detail: 'el costo depende de migrar la tabla, sin medir', blocking: true },
        { detail: 'convendría revisar el naming del endpoint', blocking: false },
      ],
    },
  })
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}`)
  const draft = prompts.find((one) => one.key === 'epic-draft').prompt
  // El detalle solo no sirve como aserción: viaja igual dentro del handoff completo, así que pasaría
  // aunque la condición no se destacara. Lo que se comprueba es que llegue señalada como condición.
  assert.match(
    draft, /Condiciones que las etapas dejaron abiertas[\s\S]{0,200}sin medir/,
    'la condición llega señalada a quien redacta, no diluida en el handoff',
  )
  assert.ok(
    written.some((texto) => texto.includes('HUMAN_ACTIONS') && texto.includes('sin medir')),
    'y queda como decisión pendiente, que es lo que impide que se lea como resuelta',
  )
  assert.equal(
    written.some((texto) => texto.includes('naming del endpoint')), false,
    'lo que no condiciona nada no se convierte en acción humana',
  )
})

test('una intención no viable deja la lección y no escribe épica', async () => {
  const { result, asked } = await runFlow({
    'epic-draft': { outcome: 'no-hacer', title: 'x', reason: 'no hay usuarios que lo pidan' },
  })
  assert.equal(result.reason, 'no-viable')
  assert.ok(asked.includes('inbox-lesson'), 'la conclusión queda registrada')
  assert.ok(!asked.includes('epic-write'), 'y no se escribe una épica que nadie va a ejecutar')
})

// El contrato del equipo enumera tres salidas —hacer, no hacer o investigar— y con dos la del medio se
// convertía en la primera. En una corrida real la etapa que decide cerró con «investigar antes de estimar»
// y el recorrido escribió igual una épica con cinco criterios: presupuestar lo que nadie sabe todavía.
test('cuando lo que falta es averiguar, no sale una épica disfrazada', async () => {
  const { result, asked } = await runFlow({
    'epic-draft': {
      outcome: 'investigar', title: 'Recuperación de cuenta',
      reason: 'nadie sabe dónde corre el proceso ni si sigue vivo',
    },
  })
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}`)
  assert.match(result.investigate, /dónde corre el proceso/, 'el recorrido devuelve qué hay que averiguar')
  assert.equal(result.promoted, false)
  assert.ok(asked.includes('investigar'), 'queda escrito qué averiguar y quién puede')
  assert.ok(!asked.includes('epic-write'), 'y no se escribe una épica que nadie pidió')
})

test('un check en rojo al cerrar frena en vez de dar por buena la épica', async () => {
  const { result } = await runFlow({
    'closing-check': { passed: false, details: 'la épica no trae criterios observables' },
  })
  assert.equal(result.reason, 'check-failed')
  assert.match(result.detail, /criterios observables/)
})

test('un equipo que no existe se dice, con los que sí', async () => {
  const { result } = await runFlow({
    'flow-contract': { exists: false, flows: ['product-development', 'incident-review'] },
  })
  assert.equal(result.reason, 'equipo-inexistente')
  assert.match(result.detail, /product-development/)
})
