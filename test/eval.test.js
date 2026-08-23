'use strict'

// Corre `agent-eval` y `team-eval` de verdad, con los subagentes simulados. Están en el mismo archivo
// porque lo que se les exige es lo mismo: que un fallo del instrumento nunca se escriba como conducta
// del sujeto. Leer el fuente no alcanzaba —el `filter(Boolean)` y el `catch` se leen razonables— y el
// precio de no verlo fue un registro `passed: 0, total: 0` que afirmaba una medición que no ocurrió.

require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileWorkflow } = require('./workflow')

const CASES = {
  items: [
    { id: '01-uno', request: 'primer pedido', expected: ['se observa algo'] },
    { id: '02-dos', request: 'segundo pedido', expected: ['se observa otra cosa'] },
  ],
  forbidden: [], skill: '/r/x/SKILL.md', cli: 'engine/cli/ops.js', mode: 'toolkit', system: false,
}

// El guion responde por label. Un valor `function` se invoca, que es como se simula el agente que
// devuelve nada o el que revienta.
async function run(name, script, extra = {}) {
  const asked = []
  const written = []

  const agent = async (prompt, options = {}) => {
    const label = options.label || ''
    asked.push(label)
    if (!options.schema) { written.push(prompt); return { ok: true } }
    const answer = label in script ? script[label] : script[label.split(':')[0]]
    if (answer === undefined) throw new Error(`el guion no cubre ${label}`)
    return typeof answer === 'function' ? answer(label) : answer
  }

  const pipeline = async (items, ...stages) => {
    const out = []
    for (const [index, item] of items.entries()) {
      let value = item
      try {
        for (const stage of stages) value = await stage(value, item, index)
      } catch { value = null }
      out.push(value)
    }
    return out
  }
  const parallel = async (thunks) =>
    Promise.all(thunks.map((thunk) => Promise.resolve().then(thunk).catch(() => null)))

  const result = await compileWorkflow(name)(
    agent, () => {}, () => {}, parallel, pipeline, extra.workflow || (async () => ({})),
    extra.args, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { result, asked, written }
}

const AGENT_SCRIPT = {
  cases: CASES,
  bancos: { path: '/b', failed: [] },
  responde: { response: 'lo que contestó el cargo' },
  juzga: { passed: true, met: [], reasoning: 'se observan todos' },
}

test('agent-eval no escribe registro cuando ningún caso llegó a un veredicto', async () => {
  const { result, asked } = await run('agent-eval', {
    ...AGENT_SCRIPT,
    juzga: () => { throw new Error('el juez murió') },
  }, { args: { agent: 'x' } })

  assert.equal(result.reason, 'sin-veredicto', `frenó en ${result.reason}`)
  assert.match(result.detail, /01-uno, 02-dos/, 'y nombra los casos que quedaron sin medir')
  assert.equal(asked.includes('registrar'), false, 'un registro de cero casos afirma lo que no ocurrió')
})

test('agent-eval deja sin medir el caso que nadie juzgó, en vez de reprobarlo', async () => {
  const { result, written } = await run('agent-eval', {
    ...AGENT_SCRIPT,
    // El runtime devuelve null cuando el subagente muere por un error terminal: el caso no se juzgó.
    juzga: (label) => (label.endsWith('02-dos') ? null : AGENT_SCRIPT.juzga),
  }, { args: { agent: 'x' } })

  assert.equal(result.total, 1, 'el que no se midió no entra en el total')
  assert.equal(result.passed, 1)
  const record = written.find((one) => one.includes('# Casos adversariales'))
  assert.ok(record, 'se escribió el registro con el caso que sí se midió')
  assert.match(record, /Sin medir[^\n]*02-dos/, 'y el registro dice cuál faltó, para no leerse completo')
  assert.equal(/### 02-dos\n\n- Veredicto: no pasa/.test(record), false,
    'un caso sin juzgar no es un caso reprobado')
})

test('team-eval no juzga el caso en el que el recorrido reventó', async () => {
  const { result, asked, written } = await run('team-eval', {
    casos: CASES,
    bancos: { path: '/b', failed: [] },
    juzga: { passed: true, met: [], reasoning: 'se observan todos' },
  }, {
    args: { team: 'x' },
    workflow: async (_name, options) =>
      (String(options.intent).startsWith('segundo')
        ? Promise.reject(new Error('el recorrido reventó'))
        : { stages: 2, promoted: false }),
  })

  assert.equal(asked.includes('juzga:02-dos'), false,
    'un error de infraestructura no se le pasa al juez, que lo leería como una detención del recorrido')
  assert.ok(asked.includes('juzga:01-uno'), 'el caso sano sí se juzga')
  assert.equal(result.total, 1, 'y el que reventó no cuenta como caso medido')
  const record = written.find((one) => one.includes('# Casos adversariales'))
  assert.match(record, /Sin medir[^\n]*02-dos/)
})
