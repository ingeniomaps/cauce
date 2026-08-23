'use strict'

// El registro de integraciones y el adaptador de Jira como unidades: paginación, staging tipado,
// curación que sobrevive a un sync, y qué campos rechaza cada configuración.
//
// Tiene su propio reloj y por eso vive aparte: cambia cuando cambia Jira, no cuando cambia el protocolo.
// `wiring.test.js` cubre la otra altura, los comandos `integration` corridos por el CLI.

const { opsConfig, tempRoot } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const I = require('../engine/integrations/registry')
const S = require('../engine/integrations/state')
const PR = require('../engine/integrations/proposals')
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
    JSON.stringify(opsConfig()),
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

// El README declara el contrato que cumple un adaptador, y es lo que lee quien escribe el segundo. Con
// la firma vieja decía `validateConfig(config, errors, warnings)`: el tercer parámetro no existía ni se
// pasaba, así que ese adaptador habría creído poder emitir advertencias y nadie lo habría notado —nada
// falla cuando se ignora un argumento—. Se contrasta contra la declaración real del único que hay.
test('el README de integraciones declara las firmas que el adaptador tiene', () => {
  const raiz = path.resolve(__dirname, '..')
  const readme = fs.readFileSync(path.join(raiz, 'integrations', 'README.md'), 'utf8')
  const fuente = fs.readFileSync(path.join(raiz, 'engine', 'integrations', 'providers', 'jira.js'), 'utf8')

  for (const nombre of ['validateConfig', 'fetchItems', 'normalizeFixture']) {
    const declarada = fuente.match(new RegExp(`(?:async )?function ${nombre}\\(([^)]*)\\)`))
    assert.ok(declarada, `${nombre} se declara en el adaptador`)
    // La firma del README omite los valores por defecto: documenta qué recibe, no cómo se inicializa.
    const params = declarada[1].split(',').map((p) => p.split('=')[0].trim()).filter(Boolean)
    assert.ok(readme.includes(`\`${nombre}(${params.join(', ')})\``),
      `el README declara ${nombre}(${params.join(', ')})`)
  }

  // Y que el adaptador siga exportando las tres: el contrato no es sólo la firma.
  const jira = require('../engine/integrations/providers/jira')
  for (const nombre of ['validateConfig', 'fetchItems', 'normalizeFixture']) {
    assert.equal(typeof jira[nombre], 'function', `el adaptador exporta ${nombre}`)
  }
})
