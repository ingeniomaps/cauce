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

test('la frontera system/ separa lo del toolkit de lo del proyecto', () => {
  const O = require('../engine/core/ownership')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-ownership-'))
  const rules = path.join(root, 'planning', 'rules')
  fs.mkdirSync(path.join(rules, 'system'), { recursive: true })
  fs.writeFileSync(path.join(rules, 'system', 'commits.md'), '# sistema\n')
  fs.writeFileSync(path.join(rules, 'system', 'process.md'), '# sistema\n')

  assert.deepEqual(O.overrides(root), [], 'sin archivos propios no hay override')

  // Una regla propia con otro nombre convive; con el mismo nombre, reemplaza.
  fs.writeFileSync(path.join(rules, 'acme-naming.md'), '# propia\n')
  assert.deepEqual(O.overrides(root), [], 'anexar no es sobrescribir')
  fs.writeFileSync(path.join(rules, 'commits.md'), '# propia\n')
  assert.deepEqual(
    O.overrides(root).map((entry) => [entry.collection, entry.id]),
    [['planning/rules', 'commits']],
  )

  // Las reglas de negocio se identifican por ID, no por nombre de archivo.
  const business = path.join(root, 'planning', 'business-rules')
  fs.mkdirSync(path.join(business, 'system'), { recursive: true })
  fs.writeFileSync(path.join(business, 'system', 'BR-OPS-002-propuestas.md'), '# sistema\n')
  fs.writeFileSync(path.join(business, 'BR-OPS-002-version-propia.md'), '# propia\n')
  assert.ok(
    O.overrides(root).some((entry) => entry.id === 'BR-OPS-002'),
    'un archivo con otro nombre pero el mismo ID sigue siendo un override',
  )

  // `upgrade` sólo puede tocar esto.
  const paths = O.systemPaths(root)
  assert.ok(paths.includes('planning/rules/system'))
  assert.ok(paths.includes('planning/business-rules/system'))
  assert.equal(paths.some((entry) => entry.includes('acme-naming')), false, 'nada propio es reemplazable')
})

test('un team propio reemplaza al del sistema sin duplicarlo en la lista', () => {
  const T = require('../engine/teams/registry')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-teams-'))
  const write = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ slug: 'demo', name }))
    fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# workflow\n')
  }
  write(path.join(root, 'teams', 'system', 'demo'), 'Del sistema')

  assert.deepEqual(T.list(root), ['demo'])
  assert.equal(T.read(root, 'demo').manifest.name, 'Del sistema')

  write(path.join(root, 'teams', 'demo'), 'Del proyecto')
  assert.deepEqual(T.list(root), ['demo'], 'el slug no aparece dos veces')
  assert.equal(T.read(root, 'demo').manifest.name, 'Del proyecto', 'el del proyecto manda')
})

test('el changelog dice qué trae una versión antes de reemplazar system/', () => {
  const CL = require('../engine/core/changelog')
  const text = [
    '# Changelog', '',
    '## [0.3.0] - No publicado', '- lo que viene', '',
    '## [0.2.0] - 2026-08-14', '- cambió el protocolo', '',
    '## [0.1.0] - 2026-08-01', '- primera versión', '',
  ].join('\n')

  // Sólo lo estrictamente posterior a lo instalado y hasta la versión que se recibe: repetir lo ya
  // aplicado es ruido, y anunciar lo que el paquete todavía no trae sería mentir.
  assert.deepEqual(CL.between(text, '0.1.0', '0.2.0').map((entry) => entry.version), ['0.2.0'])
  assert.equal(CL.between(text, '0.1.0', '0.2.0')[0].body, '- cambió el protocolo')
  assert.deepEqual(CL.between(text, '0.2.0', '0.3.0').map((entry) => entry.version), ['0.3.0'])
  assert.deepEqual(CL.between(text, '0.3.0', '0.3.0'), [], 'al día no imprime nada')
  assert.deepEqual(
    CL.between(text, '', '0.2.0').map((entry) => entry.version), ['0.2.0', '0.1.0'],
    'sin versión previa se muestra todo lo que llega',
  )

  // Un encabezado sin número, como [Unreleased], no se puede ordenar: se muestra siempre.
  const unreleased = ['## [Unreleased]', '- en curso', '', '## [0.1.0] - 2026-08-01', '- vieja'].join('\n')
  assert.deepEqual(CL.between(unreleased, '0.1.0', '0.2.0').map((entry) => entry.version), ['Unreleased'])

  assert.ok(CL.compare('0.10.0', '0.9.0') > 0, 'compara por número, no por texto')
  assert.equal(CL.compare('1.2.3', '1.2.3'), 0)
})

test('el changelog del paquete cubre la versión que se publica', () => {
  const CL = require('../engine/core/changelog')
  const repoRoot = path.resolve(__dirname, '..')
  const version = require(path.join(repoRoot, 'package.json')).version
  const versions = CL.entries(CL.read(repoRoot)).map((entry) => entry.version)

  assert.ok(versions.length, 'el paquete lleva su changelog')
  assert.ok(
    versions.some((entry) => entry.startsWith(version)),
    `la versión ${version} no está documentada en CHANGELOG.md`,
  )
})

test('un equipo debe separar descubrimiento de entrega', () => {
  const T = require('../engine/teams/registry')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-fases-'))
  const dir = path.join(root, 'teams', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')

  const manifest = (stages) => {
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({
      schemaVersion: 1, slug: 'demo', name: 'Demo', purpose: 'p', outcome: 'epic',
      entryAgent: 'product-manager', facilitator: 'product-manager',
      guardrails: ['g'], completion: ['c'], stages,
    }))
    return T.validate(root, 'demo').errors
  }
  const stage = (id, phase) => ({
    id, phase, agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y',
  })

  // Sin phase no se puede saber qué corre /team y qué corre autobuild.
  const sinFase = manifest([{ id: 'frame', agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y' }])
  assert.ok(sinFase.some((error) => /phase debe ser/.test(error)))

  // Un equipo que sólo entrega no propone nada: no hay recorrido que correr.
  const soloEntrega = manifest([stage('build', 'delivery')])
  assert.ok(soloEntrega.some((error) => /al menos una etapa de discovery/.test(error)))

  assert.deepEqual(manifest([stage('frame', 'discovery'), stage('build', 'delivery')]), [])
})

test('los equipos del sistema declaran sus fases y no construyen en descubrimiento', () => {
  const T = require('../engine/teams/registry')
  const repoRoot = path.resolve(__dirname, '..')
  const teams = T.list(repoRoot)
  assert.ok(teams.length >= 2, 'se distribuye más de una forma de recorrido')

  for (const slug of teams) {
    const result = T.validate(repoRoot, slug)
    assert.deepEqual(result.errors, [], `${slug}: ${result.errors.join(', ')}`)
    const discovery = result.manifest.stages.filter((stage) => stage.phase === 'discovery')
    assert.ok(discovery.length, `${slug}: no propone nada`)
    // Construir es entrega: hacerlo en descubrimiento sería escribir código antes de la aprobación.
    for (const stage of discovery) {
      assert.equal(
        /working-increment|release-readiness/.test((stage.produces || []).join(' ')), false,
        `${slug}/${stage.id}: produce un artefacto de entrega en una etapa de descubrimiento`,
      )
    }
  }
})

test('un equipo declara qué deja, y el de incidentes no propone trabajo', () => {
  const T = require('../engine/teams/registry')
  const repoRoot = path.resolve(__dirname, '..')

  const outcomes = {}
  for (const slug of T.list(repoRoot)) {
    const { manifest } = T.read(repoRoot, slug)
    outcomes[slug] = manifest.outcome
  }
  assert.equal(outcomes['incident-review'], 'report', 'una revisión registra, no propone')
  assert.equal(outcomes['product-development'], 'epic')
  assert.equal(outcomes['feasibility-review'], 'epic')

  // Un outcome desconocido no valida: el workflow sólo sabe terminar de las formas declaradas.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-outcome-'))
  const dir = path.join(root, 'teams', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')
  fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({
    schemaVersion: 1, slug: 'demo', name: 'D', purpose: 'p', outcome: 'inventado',
    entryAgent: 'product-manager', facilitator: 'product-manager',
    guardrails: ['g'], completion: ['c'],
    stages: [{ id: 'frame', phase: 'discovery', agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y' }],
  }))
  assert.ok(T.validate(root, 'demo').errors.some((error) => /outcome debe ser/.test(error)))
})

test('la revisión de incidentes no se presenta como respuesta en vivo', () => {
  const doc = fs.readFileSync(
    path.resolve(__dirname, '..', 'teams', 'system', 'incident-review', 'WORKFLOW.md'), 'utf8',
  )
  // Prometer respuesta a incidentes sería peligroso: no hay guardia, ni acceso, ni decisión bajo presión.
  const flat = doc.replace(/\s+/g, ' ')
  assert.match(flat, /No responde incidentes en vivo/)
  assert.match(flat, /ya contenido/)
  assert.match(flat, /no es un incident commander/)
  assert.match(flat, /atribuye responsabilidad a personas/)
})
