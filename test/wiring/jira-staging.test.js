'use strict'

// El staging de Jira cuando sincroniza más de una persona (caso 222). Con `candidateAssigneeEnv`, lo que una
// curó es contexto para la otra, y el contexto se regenera: compartido, el sync de la segunda borraba la
// curación de la primera y lo contaba como «refrescado».

const { opsConfig, tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const I = require('../../engine/integrations/registry')

const FIXTURE = path.resolve(__dirname, '..', 'support', 'fixtures', 'jira-search.json')
const TEMPLATE_GITIGNORE = path.resolve(__dirname, '..', '..', 'template', 'gitignore')

function jiraRoot() {
  const root = tempRoot('cauce-jira-staging-')
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning', 'roadmap'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(path.join(root, 'integrations', 'config.json'), JSON.stringify({
    schemaVersion: 1, providers: { jira: { adapter: 'jira', enabled: true, config: 'jira/config.json' } },
  }))
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'config.json'), JSON.stringify({
    enabled: true, baseUrl: 'https://example.atlassian.net', jql: 'project = DEMO', pageSize: 10,
    auth: { type: 'bearer', tokenEnv: 'OPS_TEST_JIRA_TOKEN' }, serviceFrom: 'component',
    candidateAssigneeEnv: 'OPS_TEST_JIRA_ME', acceptanceHeading: 'Criterios de aceptación', writeBack: false,
  }))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(opsConfig()))
  return root
}
// El fixture trae DEMO-42 asignada a `abc`.
async function syncAs(root, who) {
  const before = process.env.OPS_TEST_JIRA_ME
  process.env.OPS_TEST_JIRA_ME = who
  try { return await I.sync(root, 'jira', { fixture: FIXTURE }) } finally {
    if (before === undefined) delete process.env.OPS_TEST_JIRA_ME
    else process.env.OPS_TEST_JIRA_ME = before
  }
}
const draft = (root) => path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-42', 'draft.md')
const role = (root) => JSON.parse(fs.readFileSync(path.join(path.dirname(draft(root)), 'remote.json'), 'utf8'))
  .sync.role

test('lo que una persona curó no lo pisa el sync de otra, y el resumen lo cuenta', async () => {
  const root = jiraRoot()
  await syncAs(root, 'abc')
  fs.appendFileSync(draft(root), '\nCURADO POR ADA\n')
  const other = await syncAs(root, 'otra-persona')
  assert.match(fs.readFileSync(draft(root), 'utf8'), /CURADO POR ADA/)
  assert.equal(role(root), 'candidate', 'sigue candidato: un contexto no puede llevar curación')
  assert.equal(other.foreign, 1)
  assert.equal(other.refreshed, 0)
  assert.deepEqual(I.validate(root, 'jira').errors, [])
})

test('sin curación, el ítem de otra persona sigue pasando a contexto', async () => {
  const root = jiraRoot()
  await syncAs(root, 'abc')
  const other = await syncAs(root, 'otra-persona')
  assert.equal(role(root), 'context')
  assert.equal(other.foreign, 0)
  assert.equal(other.refreshed, 1)
})

test('el molde deja el staging fuera de git', () => {
  assert.match(fs.readFileSync(TEMPLATE_GITIGNORE, 'utf8'), /^integrations\/\*\/staging\/$/m)
})
