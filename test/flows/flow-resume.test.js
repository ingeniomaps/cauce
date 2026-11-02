'use strict'

// Retomar un recorrido frenado en un gate sin volver a pagar lo que ya cerró (caso 458). Dos mitades: el recorrido,
// corrido de verdad con los cargos guionados como en `flow.test.js`, y el archivo de retoma, que guarda y lee el
// motor.

const { tempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { compileWorkflow } = require('../support/workflow')
const R = require('../../engine/flows/resume')

const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
const stage = (id, dependsOn) => ({
  id, agent: `a-${id}`, phase: 'discovery', skill: `/r/${id}/SKILL.md`, produces: ['x'], exitGate: `g-${id}`, dependsOn,
})
// El grafo de `product-development`: `architect` junta dos ramas, así que relanzar una no relanza la otra.
const STAGES = [stage('frame', []), stage('research', ['frame']), stage('shape', ['research']),
  stage('architect', ['frame', 'shape']), stage('plan', ['architect'])]
const closed = (id) => ({ gate: 'cumplido', summary: `resumen de ${id}`, analysis: `/w/${id}.md`, openQuestions: [],
  evidence: [`evidencia de ${id}`], assumptions: [`supuesto de ${id}`] })

function script(extra = {}) {
  const out = {
    'flow-contract': { exists: true, name: 'pd', purpose: 'p', outcome: 'epic', entryAgent: 'pm', facilitator: 'pm',
      today: '2026-10-28', guardrails: ['g'], stages: STAGES },
    'stage:plan': { gate: 'no-cumplido', summary: 'falta D1', analysis: '/w/plan.md', missing: 'D1',
      humanAction: 'contestar D1', openQuestions: [] },
    'resume-save': { saved: true, path: '/w/planning/reports/2026-10-28-product-development-retoma.json' },
    'epic-draft': { outcome: 'hacer', title: 'T', slug: 't', criteria: ['C1'], stories: ['h'] },
    'closing-check': { passed: true, details: 'ok' },
    ...extra,
  }
  for (const id of ['frame', 'research', 'shape', 'architect']) out[`stage:${id}`] ||= closed(id)
  return out
}

async function runFlow(args, changes = {}) {
  const answers = script(changes)
  const prompts = []
  const logs = []
  const agent = async (prompt, options = {}) => {
    prompts.push({ key: options.label, prompt })
    if (!options.schema) return { ok: true }
    if (!(options.label in answers)) throw new Error(`el guion no cubre ${options.label}`)
    return answers[options.label]
  }
  const result = await compileWorkflow('flow')(
    agent, () => {}, (line) => logs.push(line), async (thunks) => Promise.all(thunks.map((one) => one())),
    async () => [], async () => ({}), args, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  const asked = prompts.map((one) => one.key)
  return { result, prompts, asked, logs, prompt: (key) => (prompts.find((one) => one.key === key) || {}).prompt }
}

// Lo que el recorrido le manda guardar al frenar: el JSON va al final del pedido, y la suma en el comando.
function savedPayload(prompt) {
  return { payload: JSON.parse(prompt.slice(prompt.indexOf('\n\n{') + 2)), hash: prompt.match(/--hash (\w+)/)[1] }
}

// Una retoma tal como la devuelve `ops flow resume show`: lo que guardó la corrida que frenó, con su suma.
async function savedResume() {
  const first = await runFlow({ intent: 'banco de nichos' })
  const { payload } = savedPayload(first.prompt('resume-save'))
  return { ...payload, hash: R.resumeHash(payload) }
}
const resumeArgs = (extra = {}) => ({ flow: 'product-development', resume: '/w/r.json', answers: 'D1=sí', ...extra })

test('frenar en un gate guarda la retoma, con una suma que el motor reconoce', async () => {
  const { result, prompt } = await runFlow({ intent: 'banco de nichos' })
  assert.equal(result.reason, 'gate-no-cumplido')
  assert.equal(result.resume, '/w/planning/reports/2026-10-28-product-development-retoma.json')
  const { payload, hash } = savedPayload(prompt('resume-save'))
  assert.equal(R.resumeHash(payload), hash, 'la suma del recorrido y la del motor tienen que dar igual')
  assert.equal(payload.intent, 'banco de nichos')
  assert.equal(payload.stoppedAt, 'plan')
  assert.deepEqual(payload.stages, ['frame', 'research', 'shape', 'architect', 'plan'])
  assert.deepEqual(payload.handoffs.map((one) => `${one.id}:${one.gate}`),
    ['frame:cumplido', 'research:cumplido', 'shape:cumplido', 'architect:cumplido', 'plan:no-cumplido'])
  assert.match(prompt('resume-save'), /planning\/reports\/2026-10-28-product-development-retoma\.json/)
  // El JSON no viaja por el shell: Claude Code rechaza un heredoc con llaves y comillas antes de correrlo.
  assert.match(prompt('resume-save'), /with your file-writing tool/)
  assert.match(prompt('resume-save'), /save "<the file you wrote>"/, 'entre comillas, por las rutas con espacios')
  assert.doesNotMatch(prompt('resume-save'), /<</)
})

test('retomar no relanza lo que cerró, y la etapa que frenó recibe las respuestas y su análisis anterior', async () => {
  const resume = await savedResume()
  const { result, asked, prompt } = await runFlow(resumeArgs(), {
    'flow-contract': { ...script()['flow-contract'], resume },
    'stage:plan': closed('plan'),
  })
  assert.equal(result.stopped, undefined, `frenó: ${result.reason} ${result.detail}`)
  for (const id of ['frame', 'research', 'shape', 'architect']) {
    assert.ok(!asked.includes(`stage:${id}`), `${id} cerró en la corrida anterior y no se vuelve a pagar`)
  }
  assert.ok(asked.includes('stage:plan'))
  assert.match(prompt('stage:plan'), /retoma otra que frenó en el gate de plan/)
  assert.match(prompt('stage:plan'), /D1=sí/)
  assert.match(prompt('stage:plan'), /Tu análisis de esa corrida está en \/w\/plan\.md/)
  assert.match(prompt('stage:plan'), /resumen de architect/, 'lo reutilizado le llega como cualquier handoff')
  assert.match(prompt('epic-draft'), /\/w\/frame\.md/, 'y a la síntesis, con la ruta de su análisis')
  // Con todo lo que una etapa le deja a la síntesis, no sólo el resumen: reutilizada no llega con menos.
  assert.match(prompt('epic-draft'), /evidencia de frame/)
  assert.match(prompt('epic-draft'), /supuesto de research/)
  // La etapa que frenó cierra la acción humana que su gate había pedido; las demás no tocan nada de eso.
  assert.match(prompt('stage:plan'), /status a «resuelta <AAAA-MM-DD>»/)
  assert.match(prompt('stage:plan'), /«contestar D1»/, 'nombrando cuál, con lo que la corrida anterior pidió')
  assert.match(prompt('stage:plan'), /no si volvés a cerrar en no-cumplido/, 'y sólo si con eso el gate se cumple')
  assert.match(prompt('flow-contract'), /flow resume show "\/w\/r\.json"/,
    'entre comillas: una ruta con espacios se partía')
})

// La forma que tomó una sesión real: el mismo objeto, pero como texto. Leído como intención, corría todo desde cero.
test('los argumentos que llegan como texto JSON se leen como argumentos, no como intención', async () => {
  const resume = await savedResume()
  const { result, asked } = await runFlow(JSON.stringify(resumeArgs()), {
    'flow-contract': { ...script()['flow-contract'], resume },
    'stage:plan': closed('plan'),
  })
  assert.equal(result.stopped, undefined, `frenó: ${result.reason} ${result.detail}`)
  assert.deepEqual(asked.filter((key) => key.startsWith('stage:')), ['stage:plan'])
  // Y un texto que no es un objeto sigue siendo la intención, como siempre.
  for (const intent of ['{ no es json', '["una", "lista"]']) {
    const { prompt } = await runFlow(intent)
    assert.ok(prompt('stage:frame').includes(intent), intent)
  }
})

// Lo que se reutiliza se escribió el día de la retoma, y el contexto pudo cambiar desde entonces: se avisa.
test('retomar una retoma de otro día lo avisa, y una del mismo día no', async () => {
  const resume = await savedResume()
  const changes = (today) => ({ 'flow-contract': { ...script()['flow-contract'], today, resume },
    'stage:plan': closed('plan') })
  const later = await runFlow(resumeArgs(), changes('2026-11-03'))
  assert.ok(later.logs.some((line) => /La retoma es del 2026-10-28/.test(line)), later.logs.join('\n'))
  const same = await runFlow(resumeArgs(), changes('2026-10-28'))
  assert.ok(!same.logs.some((line) => /La retoma es del/.test(line)), same.logs.join('\n'))
})

test('rerun relanza la etapa nombrada y lo que depende de ella, y nada más', async () => {
  const resume = await savedResume()
  const { asked, prompt } = await runFlow(resumeArgs({ rerun: ['shape'] }), {
    'flow-contract': { ...script()['flow-contract'], resume },
    'stage:plan': closed('plan'),
  })
  assert.deepEqual(asked.filter((key) => key.startsWith('stage:')), ['stage:shape', 'stage:architect', 'stage:plan'])
  assert.match(prompt('stage:shape'), /Tu análisis de esa corrida está en \/w\/shape\.md/)
})

test('rerun acepta una etapa suelta, y sin respuestas relanza igual sin tocar ninguna acción humana', async () => {
  const resume = await savedResume()
  const changes = { 'flow-contract': { ...script()['flow-contract'], resume }, 'stage:plan': closed('plan') }
  const single = await runFlow(resumeArgs({ rerun: 'shape' }), changes)
  const stages = (asked) => asked.filter((key) => key.startsWith('stage:'))
  assert.deepEqual(stages(single.asked), ['stage:shape', 'stage:architect', 'stage:plan'])
  const onlyRerun = { flow: 'product-development', resume: '/w/r.json', rerun: ['shape'] }
  const { asked, prompt } = await runFlow(onlyRerun, changes)
  assert.deepEqual(stages(asked), ['stage:shape', 'stage:architect', 'stage:plan'])
  assert.match(prompt('stage:shape'), /No hay respuestas nuevas: se pidió relanzar shape/)
  assert.doesNotMatch(prompt('stage:plan'), /resuelta/, 'sin respuesta no hay acción humana contestada')
})

test('rerun vacío o nulo no es una etapa, y las respuestas como objeto llegan como JSON', async () => {
  for (const rerun of [null, '', []]) {
    const { result } = await runFlow({ intent: 'banco de nichos', rerun })
    assert.equal(result.reason, 'gate-no-cumplido', `rerun ${JSON.stringify(rerun)} no frena una corrida normal`)
    const bare = await runFlow({ flow: 'product-development', resume: '/w/r.json', rerun })
    assert.equal(bare.result.reason, 'sin-respuestas')
  }
  const resume = await savedResume()
  const { prompt } = await runFlow(resumeArgs({ answers: { D1: 'sí' } }), {
    'flow-contract': { ...script()['flow-contract'], resume }, 'stage:plan': closed('plan'),
  })
  assert.match(prompt('stage:plan'), /"D1": "sí"/)
  assert.doesNotMatch(prompt('stage:plan'), /object Object/)
})

// Si frenaron dos etapas del mismo nivel, cada una cierra la fila de su propio gate, no sólo la primera.
test('dos etapas que frenaron juntas reciben, cada una, la acción humana que pidió su gate', async () => {
  const stages = [stage('frame', []), stage('uno', ['frame']), stage('dos', ['frame'])]
  const contract = { ...script()['flow-contract'], stages }
  const blocked = (id) => ({ gate: 'no-cumplido', summary: `falta ${id}`, analysis: `/w/${id}.md`, missing: id,
    humanAction: `contestar ${id}`, openQuestions: [] })
  const first = await runFlow({ intent: 'x' }, { 'flow-contract': contract, 'stage:uno': blocked('uno'),
    'stage:dos': blocked('dos') })
  const { payload } = savedPayload(first.prompt('resume-save'))
  const resume = { ...payload, hash: R.resumeHash(payload) }
  const { prompt } = await runFlow(resumeArgs(), { 'flow-contract': { ...contract, resume },
    'stage:uno': closed('uno'), 'stage:dos': closed('dos') })
  assert.match(prompt('stage:uno'), /frenó en el gate de uno y dos/)
  assert.match(prompt('stage:uno'), /«contestar uno»/)
  assert.match(prompt('stage:dos'), /«contestar dos»/)
})

test('una retoma que no corresponde a esta corrida se rechaza diciendo qué difiere', async () => {
  const resume = await savedResume()
  const contract = (one) => ({ 'flow-contract': { ...script()['flow-contract'], resume: one } })
  const cases = [
    [resumeArgs({ intent: 'otra cosa' }), contract(resume), 'retoma-no-coincide', /intención/],
    [resumeArgs(), contract({ ...resume, flow: 'otro' }), 'retoma-corrupta', /suma/],
    [resumeArgs(), contract({ ...resume, handoffs: resume.handoffs.map((one) =>
      ({ ...one, summary: `${one.summary}.` })) }), 'retoma-corrupta', /suma/],
    [resumeArgs({ rerun: ['nada'] }), contract(resume), 'retoma-no-coincide', /rerun nombra nada/],
    [resumeArgs(), { 'flow-contract': script()['flow-contract'] }, 'retoma-ilegible', /flow resume show/],
    // La causa que dio el comando llega a la corrida, no sólo «no se pudo leer».
    [resumeArgs(), { 'flow-contract': { ...script()['flow-contract'], resumeError: 'handoffs[0]: falta evidence' } },
      'retoma-ilegible', /falta evidence/],
  ]
  for (const [args, changes, reason, detail] of cases) {
    const { result, asked } = await runFlow(args, changes)
    assert.equal(result.reason, reason, JSON.stringify(result))
    assert.match(result.detail, detail)
    assert.ok(!asked.some((key) => key.startsWith('stage:')), `${reason}: ninguna etapa corre`)
  }
  // Otro recorrido con su suma bien calculada: la suma pasa y lo que frena es el recorrido.
  const other = { ...resume, flow: 'otro' }
  delete other.hash
  const { result } = await runFlow(resumeArgs(), contract({ ...other, hash: R.resumeHash(other) }))
  assert.equal(result.reason, 'retoma-no-coincide')
  assert.match(result.detail, /es de otro, no de product-development/)
})

test('retomar sin respuestas, o responder sin retoma, frena sin gastar ni el contrato', async () => {
  const cases = [
    [{ flow: 'product-development', resume: '/w/r.json' }, 'sin-respuestas'],
    [{ flow: 'product-development', resume: '/w/r.json', rerun: [] }, 'sin-respuestas'],
    // El daño 1 del caso: las respuestas sin retoma no llegaban a ninguna etapa, y nada lo decía.
    [{ intent: 'banco de nichos', answers: 'D1=sí' }, 'sin-retoma'],
    [{ intent: 'banco de nichos', rerun: ['frame'] }, 'sin-retoma'],
  ]
  for (const [args, reason] of cases) {
    const { result, asked } = await runFlow(args)
    assert.equal(result.reason, reason, JSON.stringify(args))
    assert.deepEqual(asked, [])
  }
})

test('sin retoma no aparece nada de la retoma en ningún prompt', async () => {
  const { prompts } = await runFlow({ intent: 'banco de nichos' })
  for (const { key, prompt } of prompts.filter((one) => one.key !== 'resume-save')) {
    assert.doesNotMatch(prompt, /flow resume|retoma/i, `${key} no tiene por qué saber de la retoma`)
  }
})

test('el motor sella la retoma sólo si quedó igual, y la lee sólo si está sellada y nadie la editó', () => {
  const root = tempRoot('cauce-retoma-')
  const payload = { flow: 'pd', intent: 'i', today: '2026-10-28', stages: ['a'], stoppedAt: 'a',
    handoffs: [{ id: 'a', agent: 'x', gate: 'no-cumplido', summary: 's', analysis: '/a.md', evidence: [],
      assumptions: [], missing: '', humanAction: '', openQuestions: [] }] }
  const file = 'planning/reports/2026-10-28-pd-retoma.json'
  const write = (value) => {
    fs.mkdirSync(path.join(root, 'planning', 'reports'), { recursive: true })
    fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2))
  }
  write({ ...payload, intent: 'otra' })
  assert.throws(() => R.save(root, file, R.resumeHash(payload)), /suma de control no coincide/)
  assert.throws(() => R.show(root, file), /se editó después de guardarse/, 'lo que no se selló no sirve para retomar')
  assert.throws(() => R.save(root, '../afuera.json', R.resumeHash(payload)), /retoma/)
  write({ flow: 1 })
  assert.throws(() => R.save(root, file, R.resumeHash({ flow: 1 })), /falta intent/)
  // Lo que no tiene la forma no se sella, sea cual sea la suma: cada rama de la comprobación, por separado.
  for (const [value, message] of [
    [[], /no es un objeto/],
    [{ ...payload, handoffs: ['frame'] }, /handoffs\[0\]: no es un objeto/],
    [{ ...payload, stages: 'a' }, /stages no es una lista/],
    [{ ...payload, handoffs: {} }, /handoffs no es una lista/],
    [{ ...payload, handoffs: [{ id: 'a' }] }, /handoffs\[0\]: falta agent/],
  ]) {
    write(value)
    assert.throws(() => R.save(root, file, R.resumeHash(value)), message)
  }
  fs.writeFileSync(path.join(root, file), '{')
  assert.throws(() => R.save(root, file, 'x'), /no se pudo leer la retoma/)
  assert.throws(() => R.save(root, 'planning/reports/r.txt', 'x'), /va en un \.json/)
  assert.throws(() => R.show(root, 'planning/reports/no-existe.json'), /no se pudo leer la retoma/)
  write({ flow: 1 })
  assert.throws(() => R.show(root, file), /falta intent/)

  write(payload)
  assert.equal(R.save(root, file, R.resumeHash(payload)), path.join(root, file))
  assert.deepEqual(R.show(root, file), { ...payload, hash: R.resumeHash(payload) })
  const sealed = path.join(root, file)
  fs.writeFileSync(sealed, fs.readFileSync(sealed, 'utf8').replace('"s"', '"t"'))
  assert.throws(() => R.show(root, file), /se editó después de guardarse/)
})

test('el comando sella el archivo y devuelve la ruta, y show imprime lo sellado', () => {
  const root = tempRoot('cauce-retoma-cli-')
  const payload = { flow: 'pd', intent: 'i', today: 'd', stages: [], stoppedAt: 'a', handoffs: [] }
  const env = { ...process.env }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT']) delete env[key]
  const run = (args) => spawnSync(process.execPath, [CLI, 'flow', 'resume', ...args],
    { cwd: root, encoding: 'utf8', env })
  const file = 'planning/reports/r.json'
  fs.mkdirSync(path.join(root, 'planning', 'reports'), { recursive: true })
  fs.writeFileSync(path.join(root, file), JSON.stringify(payload))
  const refused = run(['save', file, '--hash', 'deadbeef'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /suma de control no coincide/)
  const saved = run(['save', file, '--hash', R.resumeHash(payload)])
  assert.equal(saved.status, 0, saved.stderr)
  assert.equal(saved.stdout.trim(), path.join(root, file))
  const shown = run(['show', file])
  assert.equal(shown.status, 0, shown.stderr)
  assert.deepEqual(JSON.parse(shown.stdout), { ...payload, hash: R.resumeHash(payload) })
  assert.notEqual(run(['borrar', file]).status, 0)
  // Con la raíz nombrada, la respuesta no depende de dónde se corre (caso 172).
  const elsewhere = spawnSync(process.execPath, [CLI, 'flow', 'resume', 'show', file, root],
    { cwd: path.dirname(root), encoding: 'utf8', env })
  assert.equal(elsewhere.status, 0, elsewhere.stderr)
})

// Las dos sumas tienen que dar igual sobre cualquier cosa que el recorrido guarde, no sólo sobre un ejemplo: si se
// separan, toda retoma se rechaza en producción con la suite en verde.
test('la suma del recorrido y la del motor dan igual sobre lo que se puede guardar', () => {
  const include = path.resolve(__dirname, '..', '..', 'automatization', 'shared', 'flow-resume.js')
  const source = fs.readFileSync(include, 'utf8')
  const workflowHash = new Function(`${source}; return resumeHash`)()
  for (const value of [
    {}, [], '', 0, null, { b: 1, a: [2, { d: 'x', c: null }] },
    { texto: '«comillas» —rayas— acentos ñ y emoji 😀', vacío: undefined, lista: [undefined, '', false] },
    { summary: 'línea\ncon "comillas" y \\ barra', n: -1.5e-3 },
  ]) {
    assert.equal(workflowHash(value), R.resumeHash(value), JSON.stringify(value))
  }
})
