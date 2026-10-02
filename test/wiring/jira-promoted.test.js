'use strict'

// Lo promovido no se deshace por la puerta de la reconciliación (caso 228). Lo que se mide: que `reset` y
// `reconcile` se nieguen sobre un ítem promovido sin escribir nada, que `rebase` siga pasando, y que sobre lo
// que no se promovió sigan haciendo lo que hacían.

const { opsConfig, tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const I = require('../../engine/integrations/registry')
const S = require('../../engine/integrations/state')

function jiraRoot() {
  const root = tempRoot('cauce-jira-promovido-')
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning', 'roadmap'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(opsConfig()))
  fs.writeFileSync(path.join(root, 'integrations', 'config.json'), JSON.stringify({
    schemaVersion: 1, providers: { jira: { adapter: 'jira', enabled: true, config: 'jira/config.json' } } }))
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'config.json'), JSON.stringify({
    enabled: true, baseUrl: 'https://example.atlassian.net', jql: 'x', serviceFrom: 'component',
    auth: { type: 'bearer', tokenEnv: 'X' }, writeBack: false }))
  return root
}
const epic = (key, summary) => ({ key, id: key.replace(/\D/g, ''), fields: { summary, issuetype: { name: 'Epic' },
  description: 'd\n\n## Criterios de aceptación\n\n- se ve', status: { name: 'To Do' }, components: [{ name: 'app' }],
  labels: [], updated: summary } })
async function syncWith(root, issues) {
  const fixture = path.join(root, 'f.json')
  fs.writeFileSync(fixture, JSON.stringify({ issues }))
  await I.sync(root, 'jira', { fixture })
}
const draftOf = (root, key) => path.join(root, 'integrations', 'jira', 'staging', 'epics', key, 'draft.md')
const read = (file) => fs.readFileSync(file, 'utf8')
const diverged = (root, key) => S.derive(JSON.parse(read(path.join(path.dirname(draftOf(root, key)), 'remote.json'))),
  read(draftOf(root, key))).diverged

async function promotedThatChanged() {
  const root = jiraRoot()
  await syncWith(root, [epic('DEMO-1', 'v1'), epic('DEMO-2', 'otra')])
  const draft = draftOf(root, 'DEMO-1')
  fs.writeFileSync(draft, read(draft).replace('state: pending', 'state: ready')
    .replace('promotionKind: ""', 'promotionKind: "epic"'))
  I.promote(root, 'jira', 'DEMO-1')
  await syncWith(root, [epic('DEMO-1', 'v2 cambiado en Jira'), epic('DEMO-2', 'otra')])
  return root
}

test('reset y reconcile se niegan sobre lo promovido, sin escribir nada', async () => {
  const root = await promotedThatChanged()
  assert.equal(diverged(root, 'DEMO-1'), true)
  const before = read(draftOf(root, 'DEMO-1'))
  assert.throws(() => I.reconcile(root, 'jira', 'reconcile', ['DEMO-1']),
    /DEMO-1 ya se promovió: reconcile borraría la señal de que Jira cambió/)
  assert.throws(() => I.reconcile(root, 'jira', 'reset', ['DEMO-1']), /reset lo devolvería a pending/)
  assert.throws(() => I.reconcile(root, 'jira', 'reset'), /DEMO-1 ya se promovió/, 'tampoco en lote')
  assert.equal(read(draftOf(root, 'DEMO-1')), before)
  assert.equal(diverged(root, 'DEMO-1'), true, 'la señal sigue')
  assert.deepEqual(I.reconcile(root, 'jira', 'rebase', ['DEMO-1']), ['DEMO-1'], 'rebase no toca la promoción')
})

test('sobre lo que no se promovió siguen haciendo lo que hacían, y el CLI dice por qué se niega', async () => {
  const root = await promotedThatChanged()
  fs.appendFileSync(draftOf(root, 'DEMO-2'), '\ncurado\n')
  assert.deepEqual(I.reconcile(root, 'jira', 'reset', ['DEMO-2']), ['DEMO-2'])
  assert.doesNotMatch(read(draftOf(root, 'DEMO-2')), /curado/)
  const refused = run(['integration', 'reset', root, 'jira', 'DEMO-1'])
  assert.notEqual(refused.status, 0)
  assert.match(`${refused.stdout}${refused.stderr}`, /revisá la épica en planning\/roadmap\//)
})
