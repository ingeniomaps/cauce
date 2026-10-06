'use strict'

// Editar por MCP la descripción de una tarjeta de Jira en markdown (caso 229). Lo que se mide: que se frene
// sólo esa forma —descripción existente, sin ADF—, en cualquier servidor, que se apruebe como el resto, y que
// la instalación para Claude Code registre el guard sobre la herramienta del MCP.

const { blocked, chatSession, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute, executeAll } = require('../../engine/hooks/run')

const REPO = path.resolve(__dirname, '..', '..')
const edit = (root, input, tool = 'mcp__atlassian__editJiraIssue') => ({ cwd: root, tool_name: tool,
  tool_input: { cloudId: 'x', issueIdOrKey: 'DEMO-1', ...input } })

test('editar una descripción en markdown frena, en cualquier servidor', () => {
  const root = pushRoot('cauce-jira-adf-')
  for (const [input, tool] of [
    [{ fields: { description: 'texto nuevo' } }],
    [{ fields: { description: 'texto nuevo' }, contentFormat: 'markdown' }],
    [{ fields: { description: 'texto nuevo' } }, 'mcp__atlassian-acme__editJiraIssue'],
  ]) blocked('jira-adf', edit(root, input, tool), /aplana lo que el ADF tenía/)
})

test('lo que no aplana nada pasa', () => {
  const root = pushRoot('cauce-jira-adf-pasa-')
  for (const [input, tool] of [
    [{ fields: { description: { type: 'doc', version: 1, content: [] } } }],
    [{ fields: { description: 'texto' }, contentFormat: 'adf' }],
    [{ fields: { description: null } }],
    [{ fields: { summary: 'otro título' } }],
    [{ fields: { description: 'nueva' } }, 'mcp__atlassian__createJiraIssue'],
  ]) assert.doesNotThrow(() => execute('jira-adf', edit(root, input, tool)), JSON.stringify(input))
})

// Es de las que el agente corrige solo —el mensaje dice cómo mandarlo—, así que no abre el diálogo ni donde
// lo hay (caso 285). La línea en `.ops-approval` sigue valiendo.
test('no le pregunta a nadie lo que se corrige mandándolo en ADF, y la línea en .ops-approval lo pasa', () => {
  const root = pushRoot('cauce-jira-adf-salida-')
  const call = edit(root, { fields: { description: 'texto nuevo' } })
  const chat = chatSession()
  try {
    assert.throws(() => executeAll(['pre-mcp'], { hook_event_name: 'PreToolUse', permission_mode: 'default',
      ...chat.says('seguí')(call) }),
      (error) => error.blocked && !error.ask && /DEMO-1/.test(error.message)
        && /Esto lo corregís vos/.test(error.message))
  } finally { chat.close() }
  pasteApproval(root, messageOf('jira-adf', call))
  assert.doesNotThrow(() => execute('jira-adf', call))
})

test('Claude Code registra el guard sobre la herramienta del MCP, sin nombrar el servidor', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, 'automatization', 'runners', 'claude', 'settings.json')))
  const entry = settings.hooks.PreToolUse.find((one) => /editJiraIssue/.test(one.matcher))
  assert.ok(entry, 'hay una entrada para editJiraIssue')
  assert.equal(entry.matcher, 'mcp__.*__editJiraIssue')
  for (const tool of ['mcp__atlassian__editJiraIssue', 'mcp__atlassian-acme__editJiraIssue']) {
    assert.match(tool, new RegExp(`^(?:${entry.matcher})$`))
  }
  const shim = path.join(REPO, 'automatization', 'hooks', 'guard-jira-adf.sh')
  assert.ok(fs.statSync(shim).mode & 0o111, 'el shim es ejecutable')
  assert.match(entry.hooks[0].command, /guard-jira-adf\.sh$/)
})
