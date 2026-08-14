'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { validateOpsConfig } = require('../engine/config/validate')
const I = require('../engine/integrations/registry')
const S = require('../engine/integrations/state')
const B = require('../engine/planning/business-rules')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')
const { providerConfig, safeSegment } = I
const { fetchItems } = require('../engine/integrations/providers/jira')

function validConfig() {
  return {
    $schema: '.ops/engine/schemas/ops-config.schema.json',
    project: 'Demo',
    mode: 'embedded',
    planningDir: 'planning',
    workspaceRoots: [{ name: 'main', path: '.' }],
    runner: {
      maxTaskHours: 4,
      humanCheckpointBetweenMilestones: true,
      commitPerTask: true,
      allowPush: false,
    },
  }
}

function jiraConfig() {
  return {
    baseUrl: 'https://example.atlassian.net',
    jql: 'project = DEMO',
    pageSize: 10,
    auth: { type: 'bearer', tokenEnv: 'OPS_TEST_JIRA_TOKEN' },
  }
}

function integrationRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-integration-engine-'))
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'proposed'))
  fs.mkdirSync(path.join(root, 'planning', 'roadmap'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(
    path.join(root, 'integrations', 'config.json'),
    JSON.stringify({
      schemaVersion: 1,
      providers: {
        jira: { adapter: 'jira', enabled: true, config: 'jira/config.json' },
      },
    }),
  )
  fs.writeFileSync(
    path.join(root, 'integrations', 'jira', 'config.json'),
    JSON.stringify({
      ...jiraConfig(),
      enabled: true,
      serviceFrom: 'component',
      acceptanceHeading: 'Criterios de aceptación',
      writeBack: false,
    }),
  )
  fs.writeFileSync(
    path.join(root, 'ops.config.json'),
    JSON.stringify(validConfig()),
  )
  return root
}

function writeFixture(root, name, summary = 'Resumen remoto') {
  const fixture = path.join(root, name)
  fs.writeFileSync(fixture, JSON.stringify({
    issues: [{
      id: '1',
      key: 'DEMO-1',
      fields: {
        summary,
        description: 'Descripción remota\n\n## Criterios de aceptación\n\n- Funciona.',
        issuetype: { name: 'Story' },
        status: { name: 'To Do' },
        assignee: { accountId: 'owner', displayName: 'Owner' },
        components: [{ name: 'app' }],
        labels: ['lane:full'],
        updated: '2026-08-14T12:00:00Z',
      },
    }],
  }))
  return fixture
}

test('valida el contrato completo de ops.config.json', () => {
  assert.deepEqual(validateOpsConfig(validConfig()), [])
  const invalid = validConfig()
  invalid.extra = true
  invalid.runner.allowPush = 'no'
  const errors = validateOpsConfig(invalid)
  assert.ok(errors.some((error) => error.includes('propiedad desconocida extra')))
  assert.ok(errors.some((error) => error.includes('allowPush debe ser boolean')))
})

test('las rutas de proveedores no pueden escapar de integrations', () => {
  assert.throws(() => safeSegment('../jira', 'provider'), /inválido/)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-provider-path-'))
  fs.mkdirSync(path.join(root, 'integrations'))
  fs.writeFileSync(
    path.join(root, 'integrations', 'config.json'),
    JSON.stringify({ providers: { jira: { config: '../../outside.json' } } }),
  )
  assert.throws(() => providerConfig(root, 'jira'), /fuera de la raíz permitida/)
})

test('Jira pagina con timeout y termina correctamente', async () => {
  process.env.OPS_TEST_JIRA_TOKEN = 'test-token'
  const calls = []
  const pages = [
    { issues: [], nextPageToken: 'next' },
    { issues: [], isLast: true },
  ]
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => pages.shift() }
  }
  const result = await fetchItems(jiraConfig(), { fetchImpl, timeoutMs: 25 })
  assert.deepEqual(result, [])
  assert.equal(calls.length, 2)
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  delete process.env.OPS_TEST_JIRA_TOKEN
})

test('Jira corta tokens repetidos y paginación sin límite', async () => {
  process.env.OPS_TEST_JIRA_TOKEN = 'test-token'
  const repeated = async () => ({
    ok: true,
    json: async () => ({ issues: [], nextPageToken: 'same' }),
  })
  await assert.rejects(
    fetchItems(jiraConfig(), { fetchImpl: repeated, maxPages: 5 }),
    /nextPageToken repetido/,
  )
  let page = 0
  const endless = async () => ({
    ok: true,
    json: async () => ({ issues: [], nextPageToken: `page-${++page}` }),
  })
  await assert.rejects(
    fetchItems(jiraConfig(), { fetchImpl: endless, maxPages: 2 }),
    /límite de 2 páginas/,
  )
  delete process.env.OPS_TEST_JIRA_TOKEN
})

test('Jira no incorpora cuerpos remotos en errores', async () => {
  process.env.OPS_TEST_JIRA_TOKEN = 'test-token'
  const fetchImpl = async () => ({ ok: false, status: 401 })
  await assert.rejects(
    fetchItems(jiraConfig(), { fetchImpl }),
    (error) => error.message === 'Jira respondió HTTP 401',
  )
  delete process.env.OPS_TEST_JIRA_TOKEN
})

test('staging tipado detecta conflicto y permite reset y reconcile', async () => {
  const root = integrationRoot()
  const first = writeFixture(root, 'first.json')
  await I.sync(root, 'jira', { fixture: first })
  const staged = path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-1')
  const draftFile = path.join(staged, 'draft.md')
  const snapshotFile = path.join(staged, 'remote.json')
  assert.equal(fs.existsSync(draftFile), true)

  const local = fs.readFileSync(draftFile, 'utf8')
    .replace('# Resumen remoto', '# Resumen local')
    .replace('state: pending', 'state: ready')
  fs.writeFileSync(draftFile, local)
  const second = writeFixture(root, 'second.json', 'Resumen remoto cambiado')
  await I.sync(root, 'jira', { fixture: second })
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
  const preserved = fs.readFileSync(draftFile, 'utf8')
  const signals = S.derive(snapshot, preserved)
  assert.deepEqual(signals.conflict, ['summary'])
  assert.match(preserved, /state: pending/)
  assert.equal(I.writebackPlan(root, 'jira').blocked.length, 1)

  I.reconcile(root, 'jira', 'reset', ['DEMO-1'])
  const resetDraft = fs.readFileSync(draftFile, 'utf8')
  const resetSnapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
  assert.deepEqual(S.derive(resetSnapshot, resetDraft).incoming, [])
  assert.match(resetDraft, /# Resumen remoto cambiado/)

  const curated = resetDraft.replace('Descripción remota', 'Descripción local aprobada')
  fs.writeFileSync(draftFile, curated)
  I.reconcile(root, 'jira', 'reconcile', ['DEMO-1'])
  const plan = I.writebackPlan(root, 'jira')
  assert.equal(plan.writeBack, false)
  assert.equal(plan.wouldWrite, 0)
  assert.equal(plan.updates.length, 1)
  assert.deepEqual(plan.blocked, [])
})

test('sync limpia intactos ausentes y conserva curados como missing', async () => {
  const root = integrationRoot()
  await I.sync(root, 'jira', { fixture: writeFixture(root, 'items.json') })
  const staged = path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-1')
  const draftFile = path.join(staged, 'draft.md')
  const empty = path.join(root, 'empty.json')
  fs.writeFileSync(empty, '{"issues":[]}')
  const curated = fs.readFileSync(draftFile, 'utf8')
    .replace('Definir destino de promoción.', 'Mantener la decisión local.')
  fs.writeFileSync(draftFile, curated)
  const partial = await I.sync(root, 'jira', { fixture: empty, complete: false })
  assert.equal(partial.removed, 0)
  assert.equal(fs.existsSync(staged), true)
  const preserved = await I.sync(root, 'jira', { fixture: empty })
  assert.equal(preserved.missing, 1)
  const snapshot = JSON.parse(fs.readFileSync(path.join(staged, 'remote.json'), 'utf8'))
  assert.equal(snapshot.sync.missingFromRemote, true)

  I.reconcile(root, 'jira', 'reset', ['DEMO-1'])
  const removed = await I.sync(root, 'jira', { fixture: empty })
  assert.equal(removed.removed, 1)
  assert.equal(fs.existsSync(staged), false)
})

test('sync migra staging plano legado a la categoría tipada', async () => {
  const root = integrationRoot()
  const fixture = writeFixture(root, 'items.json')
  await I.sync(root, 'jira', { fixture })
  const staging = path.join(root, 'integrations', 'jira', 'staging')
  const typed = path.join(staging, 'stories', 'DEMO-1')
  const legacy = path.join(staging, 'DEMO-1')
  fs.renameSync(typed, legacy)

  await I.sync(root, 'jira', { fixture })

  assert.equal(fs.existsSync(legacy), false)
  assert.equal(fs.existsSync(typed), true)
})

test('items ajenos se mantienen como contexto regenerable', async () => {
  const root = integrationRoot()
  const configFile = path.join(root, 'integrations', 'jira', 'config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.candidateAssigneeEnv = 'OPS_TEST_JIRA_ASSIGNEE'
  fs.writeFileSync(configFile, JSON.stringify(config))
  process.env.OPS_TEST_JIRA_ASSIGNEE = 'another-owner'
  const fixture = writeFixture(root, 'context.json')
  await I.sync(root, 'jira', { fixture })
  const staged = path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-1')
  const snapshotFile = path.join(staged, 'remote.json')
  const draftFile = path.join(staged, 'draft.md')
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
  assert.equal(snapshot.sync.role, 'context')
  assert.match(fs.readFileSync(draftFile, 'utf8'), /state: context/)
  fs.writeFileSync(draftFile, fs.readFileSync(draftFile, 'utf8').replace(
    'Descripción remota',
    'Edición que no debe persistir',
  ))
  await I.sync(root, 'jira', { fixture })
  assert.doesNotMatch(fs.readFileSync(draftFile, 'utf8'), /no debe persistir/)
  delete process.env.OPS_TEST_JIRA_ASSIGNEE
})

test('propuestas aprobadas se validan y aparecen en el plan sin escribir', async () => {
  const root = integrationRoot()
  await I.sync(root, 'jira', { fixture: writeFixture(root, 'items.json') })
  const proposal = path.join(root, 'integrations', 'jira', 'proposed', 'crear-alerta.md')
  fs.writeFileSync(proposal, `---
provider: jira
state: approved
parent: DEMO-1
type: Task
service: app
estimateHours: 2
---

# Crear alerta

## Descripción

El operador recibe una alerta observable.
`)
  assert.deepEqual(I.validate(root, 'jira').errors, [])
  const plan = I.writebackPlan(root, 'jira')
  assert.equal(plan.writeBack, false)
  assert.equal(plan.creates.length, 1)
  assert.equal(plan.wouldWrite, 0)
})

test('business rules exige contrato y detecta IDs duplicados', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-business-rules-'))
  const metadata = '> **Dominio:** demo | **Estado:** vigente | **Actualizado:** 2026-08-14\n'
  const sections = '\n## Reglas\n\n| BR-DEMO-001 | Regla | Resultado |\n'
    + '\n## Por qué existe cada regla\n\n- Razón.\n\n## Historial\n\n- Creación.\n'
  fs.writeFileSync(path.join(root, 'first.md'), `# Primera\n\n${metadata}${sections}`)
  fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`)

  const errors = B.validate(root)

  assert.ok(errors.some((error) => error.includes('BR-DEMO-001 duplicado')))
})

test('contratos de evidencia rastrean pruebas y decisiones duraderas', () => {
  assert.equal(PC.validTestTrace('C1 → test:create; C2 -> npm test'), true)
  assert.equal(PC.validTestTrace('A → make lint'), true)
  assert.equal(PC.validTestTrace('n/a — cambio solo documental'), true)
  assert.equal(PC.validTestTrace('tests passed'), false)
  assert.equal(PC.validDecisionTrace('TTL de 72h. [supuesto: ventana del MVP]'), true)
  assert.equal(PC.validDecisionTrace('Se reutiliza el guard. [fuente: src/auth.js]'), true)
  assert.equal(PC.validDecisionTrace('TTL de 72h.'), false)
  assert.deepEqual(PC.validateDoneEntry({
    source: 'DONE.md', slug: 'demo', tests: '', decisions: '',
  }), ['DONE.md demo: falta tests:'])
})

test('parser acepta historias legadas y múltiples referencias de criterio', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-parser-'))
  fs.mkdirSync(path.join(root, 'roadmap'))
  fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demo
status: open
service: app
---

## Criterios

- **C1** — Primer resultado.
- **C2** — Segundo resultado.
- **C3** — Tercer resultado.

## Contexto relevante

- Contexto.

## Historias

* **historia-legada** (→ C1, C2, C3) — Resultado. (service: app)
`)

  const [epic] = P.readEpics(root)

  assert.deepEqual(epic.stories[0].criteria, ['C1', 'C2', 'C3'])
})

test('roadmap valida trazabilidad, cierre y estructura de épicas grandes', () => {
  const epic = {
    file: 'epic-002-demo/spec.md',
    num: '003',
    status: 'closed',
    criteria: [{ id: 'C1' }, { id: 'C1' }, { id: 'C2' }],
    stories: [
      { slug: 'repetida', criteria: ['C1'] },
      { slug: 'repetida', criteria: ['C1'] },
    ],
  }
  const errors = PC.validateEpic(epic, new Set())
  assert.ok(errors.some((error) => error.includes('nombre indica 002')))
  assert.ok(errors.some((error) => error.includes('criterio duplicado C1')))
  assert.ok(errors.some((error) => error.includes('historia duplicada repetida')))
  assert.ok(errors.some((error) => error.includes('C2 no está cubierto')))
  assert.ok(errors.some((error) => error.includes('closed sin evidencia')))

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-roadmap-'))
  const roadmap = path.join(root, 'roadmap')
  const large = path.join(roadmap, 'epic-001-grande')
  fs.mkdirSync(large, { recursive: true })
  fs.writeFileSync(path.join(large, 'draft.md'), '# Archivo desconocido\n')
  const structure = PC.validateRoadmapStructure(root)
  assert.ok(structure.some((error) => error.includes('falta spec.md')))
  assert.ok(structure.some((error) => error.includes('draft.md: archivo auxiliar no permitido')))
})
