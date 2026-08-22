'use strict'

const { tempRoot } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateOpsConfig } = require('../engine/config/validate')
const I = require('../engine/integrations/registry')
const S = require('../engine/integrations/state')
const PR = require('../engine/integrations/proposals')
const B = require('../engine/planning/business-rules')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')
const BOOT = require('../engine/cli/bootstrap')
const { providerConfig, safeSegment } = I
const { fetchItems, validateConfig } = require('../engine/integrations/providers/jira')

// Las variables de entorno son del proceso, no del test: si una aserción falla en el medio, la que
// quedó puesta cambia el resultado de los que siguen y el fallo real aparece disfrazado en otro caso.
async function withEnv(vars, cuerpo) {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]))
  Object.assign(process.env, vars)
  try {
    return await cuerpo()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function validConfig() {
  return {
    $schema: '.ops/engine/schemas/ops-config.schema.json',
    project: 'Demo',
    mode: 'embedded',
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
  const root = tempRoot('ops-integration-engine-')
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

// Toda instancia creada antes de 0.16 lleva `planningDir`, y el campo nunca hizo nada. Al actualizar
// tiene que llegar la instrucción —«borrá la línea»— y no un «propiedad desconocida» que deja a la
// persona averiguando si perdió una función.
test('un campo retirado se nombra en vez de caer en propiedad desconocida', () => {
  const old = validConfig()
  old.planningDir = 'planning'
  const errors = validateOpsConfig(old)
  assert.equal(errors.length, 1, 'un solo error, no dos por la misma línea')
  assert.match(errors[0], /planningDir ya no se usa/)
  assert.match(errors[0], /planning\/ en la raíz/, 'dice dónde busca el motor de verdad')
  assert.match(errors[0], /Borrá la línea/, 'y qué hacer con ella')
  assert.ok(!errors[0].includes('propiedad desconocida'))
})

test('las rutas de proveedores no pueden escapar de integrations', () => {
  assert.throws(() => safeSegment('../jira', 'provider'), /inválido/)
  const root = tempRoot('ops-provider-path-')
  fs.mkdirSync(path.join(root, 'integrations'))
  fs.writeFileSync(
    path.join(root, 'integrations', 'config.json'),
    JSON.stringify({ providers: { jira: { config: '../../outside.json' } } }),
  )
  assert.throws(() => providerConfig(root, 'jira'), /fuera de la raíz permitida/)
})

test('Jira pagina con timeout y termina correctamente', async () => {
  await withEnv({ OPS_TEST_JIRA_TOKEN: 'test-token' }, async () => {
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
  })
})

test('Jira corta tokens repetidos y paginación sin límite', async () => {
  await withEnv({ OPS_TEST_JIRA_TOKEN: 'test-token' }, async () => {
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
  })
})

test('Jira no incorpora cuerpos remotos en errores', async () => {
  await withEnv({ OPS_TEST_JIRA_TOKEN: 'test-token' }, async () => {
    const fetchImpl = async () => ({ ok: false, status: 401 })
    await assert.rejects(
      fetchItems(jiraConfig(), { fetchImpl }),
      (error) => error.message === 'Jira respondió HTTP 401',
    )
  })
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
  await withEnv({ OPS_TEST_JIRA_ASSIGNEE: 'another-owner' }, async () => {
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
  })
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
  const root = tempRoot('ops-business-rules-')
  const metadata = '> **Dominio:** demo | **Estado:** vigente | **Actualizado:** 2026-08-14\n'
  const sections = '\n## Reglas\n\n| BR-DEMO-001 | Regla | Resultado |\n'
    + '\n## Por qué existe cada regla\n\n- Razón.\n\n## Historial\n\n- Creación.\n'
  fs.writeFileSync(path.join(root, 'first.md'), `# Primera\n\n${metadata}${sections}`)
  fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`)

  const errors = B.validate(root)

  assert.ok(errors.some((error) => error.includes('BR-DEMO-001 duplicado')))

  // El estado decide si la regla rige o espera aprobación, así que sale del conjunto cerrado y no de
  // texto libre. Aceptar cualquier valor, con la plantilla trayendo `vigente` cableado, hizo que tres
  // cargos publicaran reglas vigentes derivadas de un ADR que ellos mismos dejaron en propuesto.
  fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`
    .replace('BR-DEMO-001', 'BR-DEMO-002').replace('Estado:** vigente', 'Estado:** casi-vigente'))
  const stale = B.validate(root)
  assert.ok(stale.some((error) => /Estado «casi-vigente» no es propuesta, vigente, derogada/.test(error)))

  for (const state of ['propuesta', 'vigente', 'derogada']) {
    fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`
      .replace('BR-DEMO-001', 'BR-DEMO-002').replace('Estado:** vigente', `Estado:** ${state}`))
    assert.equal(B.validate(root).some((error) => error.includes('Estado')), false, state)
  }
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
  const root = tempRoot('ops-parser-')
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
- [ ] **envuelta** (→ C2) — Incremento cuyo texto no entra en un solo renglón y sigue abajo.
  _Aceptación: resultado observable._ (service: app)
`)

  const [epic] = P.readEpics(root)

  assert.deepEqual(epic.stories[0].criteria, ['C1', 'C2', 'C3'])

  // El cuerpo de la historia es multilínea, pero el `$` del lookahead casaba fin de *línea* por la
  // bandera `m`, así que cortaba en el primer salto: la historia envuelta perdía su criterio y su
  // servicio, y `check` respondía «no declara (service: <ruta>)» sobre una historia que sí lo declara.
  // Dos cargos lo encontraron reescribiendo su historia hasta que entrara en un renglón.
  const wrapped = epic.stories.find((story) => story.slug === 'envuelta')
  assert.deepEqual(wrapped.criteria, ['C2'], 'el criterio vive en la primera línea')
  assert.equal(wrapped.service, 'app', 'y el servicio en la segunda')
})

// La plantilla no traía ejemplo, así que quien escribía viñetas planas veía un inbox vacío sobre un
// archivo lleno. La convención del nombre se conserva —es con lo que se cita el ítem— y lo que se
// corrige es que la diferencia sea visible.
test('el inbox dice cuántas viñetas quedaron sin contar', () => {
  const root = tempRoot('ops-inbox-')
  fs.writeFileSync(path.join(root, 'INBOX.md'), '# Inbox\n\n## Deuda\n\n'
    + '- **con-nombre** — Se cuenta.\n- sin nombre, no se cuenta.\n\n'
    + '## Ideas\n\n- **otra** — Se cuenta.\n- tampoco esta.\n')

  const inbox = P.readInbox(root)

  assert.equal(inbox.deuda, 1)
  assert.equal(inbox.ideas, 1)
  assert.equal(inbox.skipped, 2, 'las planas no desaparecen en silencio')
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

  const root = tempRoot('ops-roadmap-')
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
  const root = tempRoot('cauce-ownership-')
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

test('toda ruta declarada del sistema existe en el paquete', () => {
  const O = require('../engine/core/ownership')
  const repoRoot = path.resolve(__dirname, '..')

  // Un archivo del sistema que el mapeo no sabe encontrar nunca llega, y falla en silencio:
  // upgrade lo saltea con un `continue` y nadie se entera.
  const lost = O.SYSTEM_FILES
    .map((file) => ({ file, source: O.sourceOf(file) }))
    .filter(({ source }) => !fs.existsSync(path.join(repoRoot, source)))
  assert.deepEqual(lost, [], 'hay rutas del sistema que no resuelven contra el paquete')

  for (const relative of O.RUNTIME_PATHS.concat(O.SYSTEM_COLLECTIONS)) {
    const source = O.sourceOf(relative)
    // `.ops/*` sólo existe en una instancia en modo copia; en el paquete es su origen real.
    if (relative.startsWith('.ops/')) {
      assert.equal(fs.existsSync(path.join(repoRoot, source)), true, `${relative} → ${source}`)
    }
  }
})

// Un validador probado sólo por lo que acepta no prueba nada: su trabajo es rechazar. Los diez
// rechazos de Jira no tenían una sola aserción, así que quitarle cualquiera —el que exige HTTPS, el
// que fija `writeBack` en false— pasaba CI en verde. Cada caso muta un solo campo de una
// configuración válida, para que el error que se observa sea el de esa mutación y no otro.
test('la configuración de Jira se rechaza campo por campo', () => {
  const validates = () => ({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    jql: 'project = DEMO',
    auth: { type: 'bearer', tokenEnv: 'JIRA_TOKEN' },
    writeBack: false,
  })
  const errors = (change) => {
    const found = []
    validateConfig({ ...validates(), ...change }, found)
    return found
  }

  assert.deepEqual(errors({}), [], 'la base no dispara ningún rechazo')

  const cases = [
    [{ enabled: 'si' }, /enabled debe ser boolean/],
    [{ baseUrl: 'http://example.atlassian.net' }, /baseUrl debe ser HTTPS/],
    [{ baseUrl: 'https://example.atlassian.net/jira' }, /baseUrl debe ser HTTPS/],
    [{ jql: '   ' }, /falta jql/],
    [{ auth: { type: 'oauth', tokenEnv: 'T' } }, /auth\.type debe ser basic\|bearer/],
    [{ auth: { type: 'bearer' } }, /falta auth\.tokenEnv/],
    [{ auth: { type: 'basic', tokenEnv: 'T' } }, /basic exige auth\.emailEnv/],
    [{ writeBack: true }, /writeBack debe permanecer false/],
    [{ timeoutMs: 999 }, /timeoutMs debe ser un entero/],
    [{ timeoutMs: 1500.5 }, /timeoutMs debe ser un entero/],
    [{ maxPages: 0 }, /maxPages debe ser un entero positivo/],
    [{ candidateAssigneeEnv: 'no-es-una-variable' }, /candidateAssigneeEnv debe nombrar/],
  ]
  for (const [change, expected] of cases) {
    const found = errors(change)
    assert.ok(
      found.some((error) => expected.test(error)),
      `${JSON.stringify(change)} no fue rechazado; salió: ${JSON.stringify(found)}`,
    )
  }

  // Y lo opcional sigue siendo opcional: ausente no es inválido.
  assert.deepEqual(errors({ timeoutMs: undefined, maxPages: undefined }), [])
  assert.deepEqual(errors({ timeoutMs: 1000, maxPages: 1, candidateAssigneeEnv: 'JIRA_ME' }), [])
})

// Los once rechazos de una propuesta tampoco tenían aserción, y son los que sostienen que nada llegue
// a Jira sin destino, sin estimación o colgando de un padre inventado. Cada caso escribe una propuesta
// válida con un solo campo cambiado.
test('una propuesta se rechaza campo por campo', () => {
  const root = tempRoot('ops-proposals-')
  const proposed = path.join(root, 'integrations', 'jira', 'proposed')
  fs.mkdirSync(proposed, { recursive: true })
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging', 'epics', 'DEMO-1'), { recursive: true })
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'staging', 'epics', 'DEMO-1', 'remote.json'), '{}')
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ runner: { maxTaskHours: 4 } }))

  const errors = (fields = {}) => {
    const f = { provider: 'jira', state: 'draft', type: 'Epic', summary: 'Un título', desc: 'Un texto', ...fields }
    const frontmatter = ['provider', 'state', 'type', 'parent', 'service', 'estimateHours', 'remote', 'justification']
      .filter((key) => f[key] !== undefined)
      .map((key) => `${key}: ${f[key]}`)
      .join('\n')
    const md = `---\n${frontmatter}\n---\n\n# ${f.summary}\n\n## Descripción\n\n${f.desc}\n`
    fs.writeFileSync(path.join(proposed, '01.md'), md)
    return PR.validate(root, 'jira', [{ resolved: root }])
  }

  assert.deepEqual(errors(), [], 'la base no dispara ningún rechazo')

  const cases = [
    [{ provider: 'otro' }, /provider debe ser jira/],
    [{ state: 'raro' }, /state inválido/],
    [{ type: 'Raro' }, /type inválido/],
    [{ summary: '' }, /falta título/],
    [{ desc: '' }, /falta Descripción/],
    [{ parent: 'no valido' }, /parent no es una clave remota válida/],
    [{ type: 'Story' }, /Story exige parent/],
    [{ type: 'Story', parent: 'DEMO-99' }, /DEMO-99 no está presente en staging/],
    [{ state: 'approved' }, /approved exige service/],
    [{ state: 'approved', service: 'no-existe' }, /service no existe/],
    [{ state: 'approved', service: 'app' }, /approved exige estimateHours mayor que cero/],
    [{ state: 'approved', service: 'app', estimateHours: 8 }, /supera 4h; debe dividirse/],
    [{ state: 'published' }, /published exige remote/],
  ]
  for (const [fields, expected] of cases) {
    const found = errors(fields)
    assert.ok(
      found.some((error) => expected.test(error)),
      `${JSON.stringify(fields)} no fue rechazado; salió: ${JSON.stringify(found)}`,
    )
  }

  // Y una propuesta aprobada completa pasa: el rechazo mira el campo, no el estado.
  assert.deepEqual(errors({ state: 'approved', service: 'app', estimateHours: 3 }), [])
  assert.deepEqual(errors({ state: 'approved', service: 'app', estimateHours: 8, justification: 'x' }), [])
  assert.deepEqual(errors({ type: 'Story', parent: 'DEMO-1' }), [])
})

// Una épica que creció deja de ser un archivo y pasa a ser un directorio con `spec.md` al lado de sus
// notas. `epicFiles` lo contempla, pero ningún test lo ejercitaba: la rama quedaba cubierta o no según
// qué dejara otra prueba en disco, y esa intermitencia hacía fallar el piso de cobertura una de cada
// doce corridas. El caso es real y ahora se mide siempre.
test('una épica que creció a directorio se lee desde su spec.md', () => {
  const root = tempRoot('ops-epic-dir-')
  const big = path.join(root, 'roadmap', 'epic-004-grande')
  fs.mkdirSync(big, { recursive: true })
  fs.writeFileSync(path.join(big, 'spec.md'), `---
epic: 004
title: Grande
status: open
---

## Criterios

- **C1** — Un resultado observable.

## Contexto relevante

- Contexto.

## Historias

- [ ] **una-historia** (→ C1) — Hace algo. (service: app)
`)
  // Vive al lado del spec y no se confunde con él: sólo `spec.md` define la épica.
  fs.writeFileSync(path.join(big, 'notes.md'), '# Notas sueltas\n')

  const epics = P.readEpics(root)
  assert.equal(epics.length, 1, 'una épica, no dos: notes.md no es una')
  assert.equal(epics[0].file, 'epic-004-grande/spec.md', 'y se nombra por su ruta dentro del directorio')
  assert.equal(epics[0].num, '004')
  assert.deepEqual(epics[0].stories.map((story) => story.slug), ['una-historia'])

  // Un directorio con nombre de épica pero sin spec.md no aporta ninguna: se ignora, no revienta.
  fs.mkdirSync(path.join(root, 'roadmap', 'epic-005-vacia'))
  assert.equal(P.readEpics(root).length, 1)
})

// El recorrido posterior a `init` se prueba entero sin npm, sin terminal y sin escribir en el repo del
// usuario: las tres cosas entran como dependencias, que es para lo que se separaron del CLI.
function bootDeps(answers = []) {
  const facts = { npm: 0, runners: [], providers: [], questions: [], said: [] }
  const queue = [...answers]
  return {
    facts,
    deps: {
      ask: (question) => { facts.questions.push(question); return Promise.resolve(queue.shift() ?? '') },
      log: (message) => facts.said.push(message),
      npm: () => { facts.npm += 1; return facts.npmStatus ?? 0 },
      installRunner: (name) => facts.runners.push(name),
      enableProvider: (name) => facts.providers.push(name),
    },
  }
}

const bootOptions = (extra) => ({
  runner: '', integration: '', runners: ['claude', 'codex'], providers: ['jira'],
  interactive: false, install: false, ...extra,
})

test('sin terminal ni banderas, init no pregunta ni toca nada', async () => {
  const { facts, deps } = bootDeps()
  const result = await BOOT.run('/tmp/x', bootOptions(), deps)
  assert.deepEqual(facts.questions, [], 'nadie a quién preguntar')
  assert.equal(facts.npm, 0)
  assert.deepEqual(result, {
    runner: BOOT.SIN_RUNNER, proveedor: BOOT.SIN_PROVEEDOR, instalado: false, pendiente: 'npm install',
  })
})

test('con banderas, init habilita, instala y deja el runner puesto', async () => {
  const { facts, deps } = bootDeps()
  const result = await BOOT.run('/tmp/x', bootOptions({ runner: 'codex', integration: 'jira', install: true }), deps)
  assert.deepEqual(facts.providers, ['jira'])
  assert.equal(facts.npm, 1)
  assert.deepEqual(facts.runners, ['codex'], 'y el runner va después de npm, que es lo que lo resuelve')
  assert.equal(result.instalado, true)
})

test('si npm falla, el runner no se instala y el error se dice', async () => {
  const { facts, deps } = bootDeps()
  facts.npmStatus = 1
  const result = await BOOT.run('/tmp/x', bootOptions({ runner: 'claude', install: true }), deps)
  assert.deepEqual(facts.runners, [], 'instalarlo sin la dependencia sólo produce un error peor')
  assert.equal(result.instalado, false)
  assert.match(result.error, /npm install/)
})

test('una bandera con un valor que no existe se rechaza antes de tocar el disco', async () => {
  const { facts, deps } = bootDeps()
  await assert.rejects(
    () => BOOT.run('/tmp/x', bootOptions({ runner: 'emacs', install: true }), deps),
    /--runner debe ser claude, codex, ninguno/,
  )
  await assert.rejects(
    () => BOOT.run('/tmp/x', bootOptions({ integration: 'trello' }), deps),
    /--integration debe ser jira, ninguna/,
  )
  assert.equal(facts.npm, 0)
})

test('en una terminal, init pregunta runner e integración y entiende número o nombre', async () => {
  const { facts, deps } = bootDeps(['2', 'jira'])
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(facts.questions.length, 2)
  assert.equal(result.runner, 'codex', 'el 2 de la lista')
  assert.equal(result.proveedor, 'jira', 'o el nombre escrito')
})

// Cortar la terminal a mitad de camino no puede terminar la corrida con un error de readline y la
// instancia recién creada sin decir cómo seguir.
test('un Ctrl+D en mitad de la pregunta vale como no elegir', async () => {
  const { facts, deps } = bootDeps()
  deps.ask = () => Promise.reject(new Error('Aborted with Ctrl+D'))
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(result.runner, BOOT.SIN_RUNNER)
  assert.equal(result.proveedor, BOOT.SIN_PROVEEDOR)
  assert.deepEqual(facts.runners, [])
  assert.ok(facts.said.some((line) => line.includes('sin respuesta')))
})

// Enter es la respuesta más probable de quien no sabe qué elegir, y no puede dejar archivos en el repo.
test('un Enter deja todo como estaba, y un dedazo se repregunta', async () => {
  const { facts, deps } = bootDeps(['', ''])
  const blank = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(blank.runner, BOOT.SIN_RUNNER)
  assert.deepEqual(facts.providers, [])

  const other = bootDeps(['gemini', 'nada', '1', ''])
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), other.deps)
  assert.equal(result.runner, 'claude', 'dos intentos fallidos y el tercero vale')
  assert.equal(other.facts.questions.length, 4)
  assert.ok(other.facts.said.some((line) => line.includes('no está en la lista')))
})

// El Estado de una fila decide si su tarea se puede tomar, y hasta que fue vocabulario cerrado lo
// decidía un `includes`: `COMPLETADO` bloqueaba para siempre porque no era ninguna de las palabras
// que el motor reconocía, y un `✅ COMPLETADO — cerrado con run-ui.mjs` desbloqueaba por la palabra
// «cerrado» suelta en la celda. Los dos fallos son silenciosos, y en direcciones opuestas.
test('el estado de una acción humana es vocabulario cerrado y se lee por el principio de la celda', () => {
  const root = tempRoot('ops-human-actions-')
  const fila = (estado) => `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| tarea-uno | ${estado} | Ready | Detalle |
`
  const leer = (estado) => {
    fs.writeFileSync(path.join(root, 'HUMAN_ACTIONS.md'), fila(estado))
    return P.readHumanActions(root)[0]
  }

  assert.deepEqual(P.HUMAN_ACTION_STATES, ['pendiente', 'resuelta'])
  assert.equal(leer('pendiente').resolved, false)
  assert.equal(leer('pendiente').valid, true)
  assert.equal(leer('resuelta').resolved, true)
  assert.equal(leer('Resuelta 2026-08-17').resolved, true, 'admite el detalle detrás del vocabulario')
  assert.equal(leer('resuelta 2026-08-17').valid, true)

  for (const invento of ['✅ COMPLETADO 2026-08-10', 'COMPLETADA', 'hecha', 'SIN EFECTO', '']) {
    const fuera = leer(invento)
    assert.equal(fuera.valid, false, `"${invento}" está fuera del vocabulario`)
    assert.equal(fuera.resolved, false, `"${invento}" no desbloquea: fuera del vocabulario se bloquea`)
  }

  // El accidente inverso: la palabra reconocida aparece dentro del texto, no como estado.
  const accidente = leer('✅ COMPLETADO 2026-08-17 — cerrado con run-ui.mjs')
  assert.equal(accidente.resolved, false, 'una palabra suelta en la celda no resuelve la fila')
  assert.equal(accidente.valid, false)
})

// La plantilla enseña el formato con filas comentadas, igual que BACKLOG y DONE. Sin filtrarlas, el
// ejemplo bloqueaba `slug-de-tarea` en toda instancia recién creada.
test('las filas de ejemplo comentadas no son acciones humanas', () => {
  const plantilla = path.resolve(__dirname, '..', 'template', 'planning')
  assert.deepEqual(P.readHumanActions(plantilla), [], 'la plantilla no trae ninguna acción abierta')
})

// Una viñeta bajo un hito que no cumple el contrato de tarea no la lee nadie: ni `check`, ni `tree`,
// ni el runner que busca trabajo. El motor ya rechaza por esto la épica mal nombrada —«nadie lo lee»—
// y el BACKLOG no tenía la red: dos tareas escritas daban cero en cola y cero errores.
test('una línea de BACKLOG que nadie puede leer es un error, no un silencio', () => {
  const root = tempRoot('ops-backlog-')
  const escribir = (cuerpo) => fs.writeFileSync(path.join(root, 'BACKLOG.md'), cuerpo)
  const errores = () => PC.validateBacklogStructure(root)

  escribir(`# Backlog promovido

Solo contiene trabajo aprobado y listo. Las ideas viven en \`INBOX.md\`.

- una viñeta de prosa fuera de todo hito no es una tarea

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (→ C1) (epic: 001) (service: api)
`)
  assert.deepEqual(errores(), [], 'la forma canónica pasa, y la prosa fuera de un hito no se juzga')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] (→ C1) (epic: 001) — Crear la cuenta. (service: api)
`)
  const refs = errores()
  assert.equal(refs.length, 1)
  assert.match(refs[0], /BACKLOG hito alta: no la lee nadie/)
  assert.match(refs[0], /alta-email-nuevo/, 'el error cita la línea que se pierde')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [x] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  assert.match(errores()[0], /se mueve a DONE\.md/, 'tildar en el backlog borra la tarea del sistema')

  escribir(`# Backlog promovido

## Hito alta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  const encabezado = errores()
  assert.match(encabezado[0], /## Hito <slug> — <T[ií]tulo>/, 'el hito sin título deja sus tareas huérfanas')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

<!--
- [ ] **slug-de-tarea** [full] — Resultado. _Aceptación: conducta observable._ (service: ruta)
-->
`)
  assert.deepEqual(errores(), [], 'el ejemplo comentado enseña el formato sin ser juzgado')
})
