'use strict'

// Lo que publica sin ser un push (caso 225): actuar sobre un PR, abrirlo sin destino, disparar un workflow o
// una release, y desplegar. Lo que se mide: que cada forma frene y su lectura no, que lo declarado por el
// proyecto también, y que se apruebe como el resto —diálogo, orden por chat o `.ops-approval`—.

const { blocked, chatSession, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute, executeAll } = require('../../engine/hooks/run')
const C = require('../../engine/config/validate')

const run = (root, command, extra = {}) => ({ cwd: root, tool_input: { command }, ...extra })

test('cada acto que publica frena, y su lectura no', () => {
  const root = pushRoot('cauce-delivery-')
  for (const command of [
    'gh pr merge 12 --squash --repo acme/app',
    'gh pr review 12 --approve',
    'gh pr close 12',
    'gh pr comment 12 --body listo',
    'gh api --method PUT repos/acme/app/pulls/12/merge',
    'gh api repos/acme/app/pulls/12/reviews -f event=APPROVE',
    'gh pr create --fill',
    'gh workflow run deploy.yml',
    'gh run rerun 123',
    'gh release create v1.0.0',
    'kubectl -n prod apply -f k8s/',
    'terraform -chdir=infra apply',
    'tofu destroy',
    'helm upgrade api ./chart',
    'cd infra && pulumi up --yes',
    'npx cdk deploy',
  ]) blocked('destructive', run(root, command), /R10|--repo/)

  for (const command of [
    'gh pr view 12', 'gh pr list', 'gh pr checks 12', 'gh pr create --repo acme/app --fill',
    'gh pr create -R acme/app --fill', 'gh run list', 'gh release view v1.0.0', 'gh api repos/acme/app/pulls/12',
    'kubectl get pods -l app=set', 'kubectl -n prod describe deploy api', 'terraform plan', 'helm list',
    'git commit -m "docs: explicar por qué gh pr merge se frena"',
  ]) assert.doesNotThrow(() => execute('destructive', run(root, command)), command)
})

test('un deploy que el proyecto declara en deployCommands frena igual', () => {
  const root = pushRoot('cauce-delivery-propio-')
  const file = path.join(root, 'ops.config.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')),
    deployCommands: ['make deploy', './scripts/release.sh'] }))
  blocked('destructive', run(root, 'make deploy ENV=prod'), /deployCommands de ops\.config\.json/)
  blocked('destructive', run(root, 'git pull && ./scripts/release.sh'), /deployCommands/)
  assert.doesNotThrow(() => execute('destructive', run(root, 'make deploy-docs')), 'el nombre entero, no un prefijo')
  assert.ok(C.validateOpsConfig({ deployCommands: ['make deploy', ''] })
    .includes('ops.config.json: deployCommands debe ser una lista de comandos, tal como se escriben'))
})

test('se aprueba como el resto: diálogo en Claude Code, orden por chat o la línea en .ops-approval', () => {
  const root = pushRoot('cauce-delivery-salida-')
  const merge = 'gh pr merge 12 --squash --repo acme/app'
  const chat = chatSession()
  try {
    const elsewhere = { hook_event_name: 'PreToolUse', ...chat.says('seguí con lo tuyo')(run(root, merge)) }
    assert.throws(() => executeAll(['pre-shell'], elsewhere),
      (error) => error.ask && /pull request/.test(error.message))
    const ordered = chat.says(`corré ${merge}`)
    assert.doesNotThrow(() => execute('destructive', ordered(run(root, merge))))
  } finally { chat.close() }
  pasteApproval(root, messageOf('destructive', run(root, merge)))
  assert.doesNotThrow(() => execute('destructive', run(root, merge)))
})
