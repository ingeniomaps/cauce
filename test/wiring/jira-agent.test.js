'use strict'

// Jira leído por un agente, sin token en disco (caso 226). Lo que se mide: que la configuración en modo agente
// no pida credenciales y la REST siga pidiéndolas, que el payload diga si trajo todo y que sin eso no se borre
// nada de lo ausente, y que una descripción en markdown —la que devuelve el MCP— llegue entera.

const { opsConfig, tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const I = require('../../engine/integrations/registry')
const { fetchItems, validateConfig } = require('../../engine/integrations/providers/jira')

const AGENT = { enabled: true, transport: 'agent', mcpServer: 'atlassian', baseUrl: 'https://example.atlassian.net',
  jql: 'project = DEMO', serviceFrom: 'component', acceptanceHeading: 'Criterios de aceptación', writeBack: false }

function jiraRoot() {
  const root = tempRoot('cauce-jira-agente-')
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning', 'roadmap'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(path.join(root, 'integrations', 'config.json'), JSON.stringify({
    schemaVersion: 1, providers: { jira: { adapter: 'jira', enabled: true, config: 'jira/config.json' } } }))
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'config.json'), JSON.stringify(AGENT))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(opsConfig()))
  return root
}
const issue = (key, description = 'Algo.') => ({ key, id: key.replace(/\D/g, ''), fields: {
  summary: `Ítem ${key}`, description, issuetype: { name: 'Story' }, status: { name: 'To Do' },
  components: [{ name: 'app' }], labels: [], updated: '2026-10-01T00:00:00.000+0000' } })
const payload = (root, name, body) => {
  const file = path.join(root, name)
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}
const staged = (root) => fs.readdirSync(path.join(root, 'integrations', 'jira', 'staging', 'stories')).sort()

test('en modo agente no se piden credenciales; por REST, sí', () => {
  const errors = (config) => { const found = []; validateConfig(config, found); return found }
  assert.deepEqual(errors(AGENT), [])
  assert.ok(errors({ ...AGENT, transport: 'rest' }).includes('jira: falta auth.tokenEnv'))
  assert.ok(errors({ ...AGENT, transport: 'mcp' }).includes('jira: transport debe ser rest|agent'))
  assert.ok(errors({ ...AGENT, mcpServer: 'atlassian acme' }).some((one) => /mcpServer es el nombre/.test(one)))
  assert.ok(errors({ ...AGENT, transport: undefined }).includes('jira: falta auth.tokenEnv'), 'sin transport es REST')
  assert.ok(errors({ ...AGENT, cloudId: ' ' }).includes('jira: cloudId no puede ir vacío'))
})

test('en modo agente el sync sin payload dice cómo se hace', async () => {
  await assert.rejects(fetchItems(AGENT), /lee por agente.*--payload/)
})

test('lo que el payload no trajo sólo se borra si declara que trajo todo', async () => {
  const root = jiraRoot()
  const both = [issue('DEMO-1'), issue('DEMO-2')]
  await I.sync(root, 'jira', { payload: payload(root, 'a.json', { complete: true, issues: both }) })
  assert.deepEqual(staged(root), ['DEMO-1', 'DEMO-2'])
  const half = payload(root, 'b.json', { complete: false, issues: [issue('DEMO-1')] })
  const partial = await I.sync(root, 'jira', { payload: half })
  assert.deepEqual(staged(root), ['DEMO-1', 'DEMO-2'], 'una lectura a medias no borra')
  assert.equal(partial.partial, true)
  await I.sync(root, 'jira', { payload: payload(root, 'c.json', { complete: true, issues: [issue('DEMO-1')] }) })
  assert.deepEqual(staged(root), ['DEMO-1'])
  await assert.rejects(I.sync(root, 'jira', { payload: payload(root, 'd.json', { issues: [] }) }),
    /tiene que declarar complete: true o false/)
})

test('la descripción en markdown llega entera, con su aceptación, y el CLI avisa lo parcial', async () => {
  const root = jiraRoot()
  const md = 'El operador ve el último sync.\n\n## Criterios de aceptación\n\n- La fecha es visible.'
  const file = payload(root, 'e.json', { complete: false, issues: [issue('DEMO-7', md)] })
  const result = run(['integration', 'sync', root, 'jira', '--payload', file])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /el payload no trajo todo \(complete: false\): no se borró nada de lo ausente/)
  const remote = JSON.parse(fs.readFileSync(path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-7',
    'remote.json'), 'utf8')).item
  assert.equal(remote.description, md)
  assert.match(JSON.stringify(remote.acceptance), /La fecha es visible/)
})
