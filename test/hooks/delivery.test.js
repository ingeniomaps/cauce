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
const { deliveryRules } = require('../../engine/hooks/delivery')

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
    const elsewhere = { hook_event_name: 'PreToolUse', permission_mode: 'default',
      ...chat.says('seguí con lo tuyo')(run(root, merge)) }
    assert.throws(() => executeAll(['pre-shell'], elsewhere),
      (error) => error.ask && /pull request/.test(error.message))
    const ordered = chat.says(`corré ${merge}`)
    assert.doesNotThrow(() => execute('destructive', ordered(run(root, merge))))
  } finally { chat.close() }
  pasteApproval(root, messageOf('destructive', run(root, merge)))
  assert.doesNotThrow(() => execute('destructive', run(root, merge)))
})

// Caso 280. Lo que se mide: que una orden de mergear dicha con palabras pase sin diálogo ni segunda vuelta,
// en `auto` y en los demás modos; que nombrar PRs la acote a ésos; y que lo que no es una orden siga frenando.
// Eso último se mide en un modo sin diálogo: donde lo hay, lo no ordenado se pregunta en vez de frenarse.
const NO_DIALOG = 'dontAsk'
const merges = (root, chat, prompt, mode) => {
  const turn = chat.says(prompt)
  return (command) => outcome({ hook_event_name: 'PreToolUse', permission_mode: mode, ...turn(run(root, command)) })
}
const outcome = (input) => {
  try { executeAll(['destructive'], input); return 'pasa' } catch (error) {
    if (error.ask) return 'diálogo'
    if (error.blocked) return 'frena'
    throw error
  }
}

test('una orden de mergear pasa sin confirmar de nuevo, y nombrar PRs la acota a ésos', () => {
  const root = pushRoot('cauce-delivery-orden-')
  // Una sesión por modo: lo que un modo deja frenado lo aprobaría el mensaje del siguiente, que no niega.
  for (const mode of ['auto', 'default', 'acceptEdits', 'bypassPermissions']) {
    const chat = chatSession()
    try {
      const named = merges(root, chat, 'mergeá account #39, api #49 y acme-ops #33, #34 y #35', mode)
      assert.equal(named('gh pr merge 39 --repo acme/account --squash'), 'pasa', mode)
      assert.equal(named('export GH_TOKEN="$(cat t)"; gh pr merge 35 --repo acme/acme-ops --squash'), 'pasa', mode)
      assert.notEqual(named('gh pr merge 40 --repo acme/account --squash'), 'pasa', `${mode}: el 40 no se nombró`)
      assert.notEqual(named('gh pr merge --repo acme/account --squash'), 'pasa', `${mode}: sin número`)
    } finally { chat.close() }
  }
  const chat = chatSession()
  try {
    const all = merges(root, chat, 'mergealos todos', 'auto')
    assert.equal(all('gh pr merge 2 --repo acme/platform --merge && gh pr merge 3 --repo acme/ops --merge'), 'pasa')
    assert.equal(merges(root, chat, 'PR 7 listo, mergealo', 'auto')('gh pr merge 7 -R acme/app'), 'pasa')
    assert.equal(merges(root, chat, 'mergeá todos menos uno, pero no el #51', 'auto')('gh pr merge 50'), 'pasa')
  } finally { chat.close() }
})

test('lo que no ordena un merge lo sigue frenando', () => {
  const root = pushRoot('cauce-delivery-no-orden-')
  const chat = chatSession()
  try {
    for (const [prompt, command] of [
      ['mergeá todos, pero no el #51', 'gh pr merge 51 --repo acme/app'],
      ['no mergees nada todavía, revisá el #52', 'gh pr merge 52 --repo acme/app'],
      ['mergeá cuando esté verde, ahora no mergees', 'gh pr merge 52 --repo acme/app'],
      ['¿mergeamos el #53?', 'gh pr merge 53 --repo acme/app'],
      ['pará, mergeá el #54 después', 'gh pr merge 54 --repo acme/app'],
      ['revisá el merge de ayer', 'gh pr merge 55 --repo acme/app'],
      ['corré los e2e y mergeá el #56', 'gh pr merge 2 --repo acme/app'],
      ['implementá la tarea de altas', 'gh pr merge 57 --repo acme/app'],
      ['mergeá el #58', 'gh pr close 58 --repo acme/app'],
      ['mergeá el #59', 'gh pr merge 59 --repo acme/app && gh pr comment 59 --body listo'],
      ['mergeá el #60', 'gh pr merge 60 --repo acme/app --admin && git push origin main'],
    ]) assert.equal(merges(root, chat, prompt, NO_DIALOG)(command), 'frena', `${prompt} → ${command}`)
    // Un subagente no hereda la orden: su llamada no es el mensaje de la persona.
    const delegated = { hook_event_name: 'PreToolUse', permission_mode: NO_DIALOG, agent_id: 'a1',
      ...chat.says('mergeá el #61')(run(root, 'gh pr merge 61 --repo acme/app')) }
    assert.throws(() => executeAll(['destructive'], delegated), (error) => error.blocked && !error.ask)
  } finally { chat.close() }
})

test('la confirmación de un merge cubre el PR y no la línea de comando', () => {
  const root = pushRoot('cauce-delivery-item-')
  const chat = chatSession()
  try {
    const first = merges(root, chat, 'seguí con lo tuyo', NO_DIALOG)
    assert.equal(first('gh pr merge 2 --repo acme/app --merge && gh pr merge 3 --repo acme/app --merge'), 'frena')
    const yes = merges(root, chat, 'confirmo', NO_DIALOG)
    assert.equal(yes('gh pr merge 2 --merge --delete-branch --repo acme/app'), 'pasa', 'el mismo PR, escrito distinto')
    assert.equal(yes('gh pr merge https://github.com/acme/app/pull/3 --squash'), 'pasa', 'el otro, por su URL')
    assert.equal(yes('gh pr merge 4 --repo acme/app --merge'), 'frena', 'un PR que no se había frenado')
    assert.equal(yes('gh pr merge 2 --repo acme/other --merge'), 'frena', 'el mismo número en otro repositorio')
    assert.equal(yes('gh pr merge 2 --repo acme/app --merge --admin'), 'frena', '--admin es otro acto')
  } finally { chat.close() }
  const [, , , by] = deliveryRules({})[0]
  assert.deepEqual(by.items('gh pr merge 9 -R acme/app --body "listo, va --repo x" -t titulo'),
    ['gh pr merge 9 --repo acme/app'])
  assert.deepEqual(by.items("gh pr merge 9 --repo=acme/app -b 'va' ; gh pr merge 9 -R acme/app"),
    ['gh pr merge 9 --repo acme/app'])
  assert.deepEqual(by.items('gh pr merge && gh pr merge 9 --repo'), ['gh pr merge', 'gh pr merge 9'])
  assert.equal(by.items('gh pr merge 9 && gh pr close 8'), null)
  const message = messageOf('destructive', run(root, 'gh pr merge 2 --squash --repo acme/app'))
  assert.match(message, /\n {2}gh pr merge 2 --repo acme\/app\n/, 'lo que se pega es el PR, no la línea')
})
