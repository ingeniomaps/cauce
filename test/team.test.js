'use strict'

// Corre `team` de verdad, con los cargos simulados. Es el mismo arnés que `autobuild.test.js` y existe
// por la misma razón: sus otros tests leen el fuente renderizado y comprueban que una línea esté escrita,
// lo que muestra que un freno existe pero no que frene cuando corresponde ni —sobre todo— que deje pasar
// cuando no. Cuatro corridas reales de `autobuild` encontraron tres defectos que ningún `match` veía.
//
// Lo que este arnés NO ve: los schemas. El runtime los valida antes de entregar la respuesta al recorrido,
// y acá el guion devuelve lo que se le pida, así que un `enum` recortado o un campo que dejó de ser
// obligatorio pasan sin ruido. Eso se cubre leyendo el fuente, en `workflows.test.js`.

require('./entorno')

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const A = require('../engine/automation')

const AUTOMATION = path.resolve(__dirname, '..', 'automatization')
const WORKFLOW = path.resolve(AUTOMATION, 'workflows', 'team.js')

function compilar() {
  const source = A.render(WORKFLOW, '', AUTOMATION).replace(/^export const meta =/m, 'const meta =')
  return new Function('agent', 'phase', 'log', 'parallel', 'pipeline', 'workflow', 'args', 'budget',
    `return (async () => {\n${source}\n})()`)
}

// Un equipo de dos etapas de descubrimiento: alcanza para ver el handoff entre una y la siguiente, que
// es donde vive casi todo lo que el recorrido decide.
function guionBase() {
  return {
    'team-contract': {
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

async function correr(cambios = {}, intent = 'quiero que el alta no duplique vendedores') {
  const guion = { ...guionBase(), ...cambios }
  const pedidas = []
  const escritos = []
  const prompts = []

  const agent = async (prompt, options = {}) => {
    const clave = options.label || (options.schema && options.schema.required || []).join(',')
    pedidas.push(clave)
    prompts.push({ clave, prompt })
    if (!options.schema) { escritos.push(prompt); return { ok: true } }
    if (!(clave in guion)) throw new Error(`el guion no cubre ${clave}`)
    const respuesta = guion[clave]
    return typeof respuesta === 'function' ? respuesta() : respuesta
  }

  const resultado = await compilar()(
    agent, () => {}, () => {},
    async (thunks) => Promise.all(thunks.map((t) => t())), async () => [], async () => ({}),
    { intent }, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { resultado, pedidas, escritos, prompts }
}

test('team recorre sus etapas y deja la épica sin promover', async () => {
  const { resultado, pedidas } = await correr()
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}: ${resultado.detail || ''}`)
  assert.equal(resultado.promoted, false, 'la promoción es una firma humana, no un paso del recorrido')
  assert.equal(resultado.stages, 2)
  assert.ok(pedidas.includes('stage:encuadre') && pedidas.includes('stage:factibilidad'))
})

// El resumen viaja entre etapas y el análisis entero sólo a la síntesis: son requisitos opuestos y por eso
// no son el mismo texto. Si la etapa siguiente recibiera findings, el tope no ahorraría nada.
test('entre etapas viaja el resumen, y el análisis entero llega a la síntesis', async () => {
  const { prompts } = await correr()
  const segunda = prompts.find((one) => one.clave === 'stage:factibilidad').prompt
  assert.match(segunda, /el problema es el alta duplicada/, 'la siguiente recibe el resumen de la anterior')
  assert.equal(
    segunda.includes('análisis largo del encuadre'), false,
    'y no el análisis entero, que se reenviaría en cada etapa posterior',
  )
  const draft = prompts.find((one) => one.clave === 'epic-draft').prompt
  assert.match(draft, /análisis largo del encuadre/, 'quien sintetiza sí lee el análisis completo')
  assert.equal(draft.includes('el problema es el alta duplicada'), false, 'y no lo recibe dos veces')
})

test('un exit gate no cumplido corta y deja la acción humana escrita', async () => {
  const { resultado, escritos, pedidas } = await correr({
    'stage:encuadre': {
      gate: 'no-cumplido', summary: 'no se pudo acotar', findings: 'x',
      missing: 'nadie sabe a qué usuario le pasa', humanAction: 'preguntarle a soporte',
    },
  })
  assert.equal(resultado.reason, 'gate-no-cumplido')
  assert.ok(!pedidas.includes('stage:factibilidad'), 'no se sigue con la etapa siguiente')
  assert.ok(escritos.some((texto) => texto.includes('HUMAN_ACTIONS')), 'el bloqueo queda con su acción')
})

// El estado del medio: la etapa cumplió, y deja una condición que la síntesis tiene que respetar. Con dos
// estados se diluía en la prosa del handoff y la épica podía no recogerla.
test('una etapa cumple con condiciones y esas condiciones llegan a la síntesis', async () => {
  const { resultado, prompts, escritos } = await correr({
    'stage:factibilidad': {
      gate: 'con-condiciones', summary: 'una opción viable', findings: 'x',
      openQuestions: [
        { detail: 'el costo depende de migrar la tabla, sin medir', blocking: true },
        { detail: 'convendría revisar el naming del endpoint', blocking: false },
      ],
    },
  })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  const draft = prompts.find((one) => one.clave === 'epic-draft').prompt
  // El detalle solo no sirve como aserción: viaja igual dentro del handoff completo, así que pasaría
  // aunque la condición no se destacara. Lo que se comprueba es que llegue señalada como condición.
  assert.match(
    draft, /Condiciones que las etapas dejaron abiertas[\s\S]{0,200}sin medir/,
    'la condición llega señalada a quien redacta, no diluida en el handoff',
  )
  assert.ok(
    escritos.some((texto) => texto.includes('HUMAN_ACTIONS') && texto.includes('sin medir')),
    'y queda como decisión pendiente, que es lo que impide que se lea como resuelta',
  )
  assert.equal(
    escritos.some((texto) => texto.includes('naming del endpoint')), false,
    'lo que no condiciona nada no se convierte en acción humana',
  )
})

test('una intención no viable deja la lección y no escribe épica', async () => {
  const { resultado, pedidas } = await correr({
    'epic-draft': { outcome: 'no-hacer', title: 'x', reason: 'no hay usuarios que lo pidan' },
  })
  assert.equal(resultado.reason, 'no-viable')
  assert.ok(pedidas.includes('inbox-lesson'), 'la conclusión queda registrada')
  assert.ok(!pedidas.includes('epic-write'), 'y no se escribe una épica que nadie va a ejecutar')
})

// El contrato del equipo enumera tres salidas —hacer, no hacer o investigar— y con dos la del medio se
// convertía en la primera. En una corrida real la etapa que decide cerró con «investigar antes de estimar»
// y el recorrido escribió igual una épica con cinco criterios: presupuestar lo que nadie sabe todavía.
test('cuando lo que falta es averiguar, no sale una épica disfrazada', async () => {
  const { resultado, pedidas } = await correr({
    'epic-draft': {
      outcome: 'investigar', title: 'Recuperación de cuenta',
      reason: 'nadie sabe dónde corre el proceso ni si sigue vivo',
    },
  })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.match(resultado.investigate, /dónde corre el proceso/, 'el recorrido devuelve qué hay que averiguar')
  assert.equal(resultado.promoted, false)
  assert.ok(pedidas.includes('investigar'), 'queda escrito qué averiguar y quién puede')
  assert.ok(!pedidas.includes('epic-write'), 'y no se escribe una épica que nadie pidió')
})

test('un check en rojo al cerrar frena en vez de dar por buena la épica', async () => {
  const { resultado } = await correr({
    'closing-check': { passed: false, details: 'la épica no trae criterios observables' },
  })
  assert.equal(resultado.reason, 'check-failed')
  assert.match(resultado.detail, /criterios observables/)
})

test('un equipo que no existe se dice, con los que sí', async () => {
  const { resultado } = await correr({
    'team-contract': { exists: false, teams: ['product-development', 'incident-review'] },
  })
  assert.equal(resultado.reason, 'equipo-inexistente')
  assert.match(resultado.detail, /product-development/)
})
