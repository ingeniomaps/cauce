'use strict'

// El servicio de un ítem de Jira tomado de una etiqueta (caso 227): los proyectos team-managed no tienen
// componentes. Lo que se mide: que cada `serviceFrom` lea de donde dice, que dos servicios distintos no se
// resuelvan eligiendo uno, que el prefijo se pueda cambiar y viaje con el snapshot, y que un valor mal escrito
// sea un error y no un staging entero sin servicio.

const { opsConfig, tempRoot } = require('../support/environment')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const I = require('../../engine/integrations/registry')
const assert = require('node:assert/strict')
const S = require('../../engine/integrations/state')
const { validateConfig } = require('../../engine/integrations/providers/jira')

const item = (extra) => ({ key: 'DEMO-1', type: 'Story', summary: 'x', description: '', acceptance: 'se ve',
  components: [], labels: [], ...extra })
const service = (it, config) => S.renderDraft(it, config).match(/^service: "(.*)"$/m)[1]

test('cada serviceFrom lee de donde dice', () => {
  const both = item({ components: ['app'], labels: ['service:app', 'lane:full'] })
  assert.equal(service(item({ labels: ['service:app'] }), { serviceFrom: 'label' }), 'app')
  assert.equal(service(item({ labels: ['service:app'] }), { serviceFrom: 'component' }), '',
    'el default no mira etiquetas')
  assert.equal(service(item({ components: ['app'] }), { serviceFrom: 'label' }), '', 'label no mira componentes')
  assert.equal(service(both, { serviceFrom: 'both' }), 'app', 'el mismo servicio por los dos lados es uno')
  assert.equal(service(item({ labels: ['svc=web'] }), { serviceFrom: 'label', serviceLabelPrefix: 'svc=' }), 'web')
  assert.equal(service(item({ components: ['app'] }), {}), 'app', 'sin serviceFrom es componente, como hasta hoy')
})

test('dos servicios distintos no se resuelven eligiendo uno', () => {
  const two = item({ components: ['app'], labels: ['service:web'] })
  const draft = S.renderDraft(two, { serviceFrom: 'both' })
  assert.match(draft, /^service: ""$/m)
  assert.match(draft, /Nombra más de un servicio \(app, web\): debe quedar uno solo\./)
})

test('un serviceFrom o un prefijo mal escritos son error', () => {
  const errors = (config) => {
    const found = []
    validateConfig({ enabled: false, writeBack: false, auth: { type: 'bearer', tokenEnv: 'X' }, ...config }, found)
    return found
  }
  assert.ok(errors({ serviceFrom: 'etiqueta' }).includes('jira: serviceFrom debe ser component|label|both'))
  assert.ok(errors({ serviceLabelPrefix: ' ' }).some((one) => /serviceLabelPrefix/.test(one)))
  assert.deepEqual(errors({ serviceFrom: 'label', serviceLabelPrefix: 'svc:' }), [])
})

test('el prefijo viaja con el snapshot, así que un reset vuelve a encontrar el servicio', async () => {
  const root = tempRoot('cauce-jira-etiquetas-')
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning', 'roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(opsConfig()))
  fs.writeFileSync(path.join(root, 'integrations', 'config.json'), JSON.stringify({
    schemaVersion: 1, providers: { jira: { adapter: 'jira', enabled: true, config: 'jira/config.json' } } }))
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'config.json'), JSON.stringify({
    enabled: true, baseUrl: 'https://example.atlassian.net', jql: 'project = DEMO', serviceFrom: 'label',
    serviceLabelPrefix: 'svc=', auth: { type: 'bearer', tokenEnv: 'X' }, writeBack: false }))
  const fixture = path.join(root, 'f.json')
  fs.writeFileSync(fixture, JSON.stringify({ issues: [{ key: 'DEMO-1', id: '1', fields: { summary: 'x',
    description: 'y', issuetype: { name: 'Story' }, status: { name: 'To Do' }, labels: ['svc=web'],
    updated: '2026-10-01T00:00:00.000+0000' } }] }))
  await I.sync(root, 'jira', { fixture })
  const draft = path.join(root, 'integrations', 'jira', 'staging', 'stories', 'DEMO-1', 'draft.md')
  assert.match(fs.readFileSync(draft, 'utf8'), /^service: "web"$/m)
  fs.appendFileSync(draft, '\ncurado\n')
  I.reconcile(root, 'jira', 'reset', ['DEMO-1'])
  assert.match(fs.readFileSync(draft, 'utf8'), /^service: "web"$/m)
})
