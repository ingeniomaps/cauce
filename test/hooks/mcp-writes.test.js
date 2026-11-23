'use strict'

// Caso 541: lo que una herramienta MCP escribe en un sistema ajeno frena hasta que una persona lo apruebe (R12), y lo
// que sólo lee pasa. Cerrado por defecto: una herramienta que no se reconoce como lectura frena, salvo que el
// proyecto declare su servidor como sandbox o la herramienta como lectura.

const { blocked, chatSession, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute, executeAll, hookGroups } = require('../../engine/hooks/run')
const C = require('../../engine/config/validate')

const call = (root, tool_name, tool_input = {}) => ({ cwd: root, tool_name, tool_input })
const WRITES = /escribe por el servidor MCP/
const declare = (root, extra) => {
  const file = path.join(root, 'ops.config.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...extra }))
}

test('una escritura por MCP frena, sea del servidor que sea, y una lectura pasa', () => {
  const root = pushRoot('cauce-mcp-')
  for (const tool of ['mcp__atlassian__createJiraIssue', 'mcp__atlassian-acme__addCommentToJiraIssue',
    'mcp__atlassian__transitionJiraIssue', 'mcp__atlassian__createConfluencePage', 'mcp__slack__slack_send_message',
    'mcp__github__merge_pull_request', 'mcp__plugin_tools_drive__upload_file', 'mcp__nuevo__hacerAlgo',
    'mcp__claude_ai_Notion__notion-create-pages', 'mcp__git__git_commit', 'mcp__git__git',
    // Escrituras cuyo verbo es `log` o `status`.
    'mcp__tempo__log_work', 'mcp__jira__logWork', 'mcp__statuspage__status_update_incident', 'mcp__git__git_status',
  ]) blocked('mcp-writes', call(root, tool), WRITES)
  for (const tool of ['mcp__atlassian__getJiraIssue', 'mcp__atlassian__searchJiraIssuesUsingJql',
    'mcp__github__list_pull_requests', 'mcp__slack__slack_get_channel_history', 'mcp__atlassian__lookupJiraAccountId',
    'mcp__drive__read_file_content', 'mcp__memory__query', 'Bash', 'Read', 'mcp__notion__notion-search',
    'mcp__claude_ai_Notion__notion-fetch', 'mcp__git__git_diff',
    'mcp__claude_ai_Google_Drive__download_file_content',
  ]) assert.doesNotThrow(() => execute('mcp-writes', call(root, tool)), tool)
  // Un verbo de lectura tiene que ser la palabra entera: getaway o listen no lo son.
  blocked('mcp-writes', call(root, 'mcp__x__listenAndReply'), WRITES)
})

test('el grupo pre-mcp lo corre después de jira-adf, que dice cómo no aplanar la tarjeta', () => {
  assert.deepEqual(hookGroups['pre-mcp'], ['jira-adf', 'mcp-writes'])
  const root = pushRoot('cauce-mcp-grupo-')
  const flat = call(root, 'mcp__atlassian__editJiraIssue', { issueIdOrKey: 'ABC-1', fields: { description: 'texto' } })
  assert.throws(() => executeAll(hookGroups['pre-mcp'], flat), (error) => /aplana/.test(error.message))
  const adf = call(root, 'mcp__atlassian__editJiraIssue', { issueIdOrKey: 'ABC-1', contentFormat: 'adf',
    fields: { description: { type: 'doc' } } })
  assert.throws(() => executeAll(hookGroups['pre-mcp'], adf), (error) => WRITES.test(error.message))
})

test('lo declarado en mcpSandbox y mcpReads pasa, y nada más', () => {
  const root = pushRoot('cauce-mcp-declarado-')
  declare(root, { mcpSandbox: ['jira-pruebas'], mcpReads: ['mcp__atlassian__sync_metrics', 'summarize'] })
  assert.doesNotThrow(() => execute('mcp-writes', call(root, 'mcp__jira-pruebas__createJiraIssue')))
  assert.doesNotThrow(() => execute('mcp-writes', call(root, 'mcp__atlassian__sync_metrics')))
  assert.doesNotThrow(() => execute('mcp-writes', call(root, 'mcp__otro__summarize')))
  blocked('mcp-writes', call(root, 'mcp__jira__createJiraIssue'), WRITES)
  blocked('mcp-writes', call(root, 'mcp__atlassian-otro__sync_metrics'), WRITES)
  blocked('mcp-writes', call(root, 'mcp__otro__summarize_all'), WRITES)
  assert.ok(C.validateOpsConfig({ mcpSandbox: ['ok', ''] })
    .includes('ops.config.json: mcpSandbox debe ser una lista de nombres de servidor MCP'))
  assert.ok(C.validateOpsConfig({ mcpReads: 'getX' })
    .includes('ops.config.json: mcpReads debe ser una lista de herramientas MCP, con o sin su prefijo '
      + 'mcp__<servidor>__'))
})

test('se aprueba como el resto: el diálogo, el chat o la línea en .ops-approval, y vale para esa herramienta', () => {
  const root = pushRoot('cauce-mcp-salida-')
  const create = call(root, 'mcp__atlassian__createJiraIssue', { projectKey: 'ABC', summary: 'x' })
  const chat = chatSession()
  try {
    const asked = chat.says('creá la tarjeta')(create)
    const dialog = { hook_event_name: 'PreToolUse', permission_mode: 'default', ...asked }
    assert.throws(() => executeAll(hookGroups['pre-mcp'], dialog), (error) => error.ask && WRITES.test(error.message))
  } finally { chat.close() }
  assert.deepEqual(pasteApproval(root, messageOf('mcp-writes', create)), ['mcp atlassian createJiraIssue'])
  assert.doesNotThrow(() => execute('mcp-writes', create))
  blocked('mcp-writes', call(root, 'mcp__atlassian__addCommentToJiraIssue'), WRITES)
})

// Decisión del caso; por qué, en `engine/hooks/mcp-writes.js`.
test('lo que corrió queda concedido el resto de la sesión para esa herramienta, y un «pará» lo revoca', () => {
  const root = pushRoot('cauce-mcp-sesion-')
  const click = (turn) => turn(call(root, 'mcp__claude-in-chrome__computer', { action: 'left_click' }))
  const chat = chatSession()
  try {
    const first = chat.says('probá el login en el navegador')
    blocked('mcp-writes', click(first), WRITES)
    // Lo aprobó el diálogo, que no le avisa al guard: lo que el guard ve es que la herramienta corrió.
    assert.deepEqual(executeAll(hookGroups['post-mcp'], click(first)), [])
    assert.doesNotThrow(() => execute('mcp-writes', click(first)))
    assert.doesNotThrow(() => execute('mcp-writes', click(chat.says('seguí con el formulario'))))
    blocked('mcp-writes', chat.says('seguí')(call(root, 'mcp__claude-in-chrome__form_input')), WRITES)
    // Una lectura que corrió no concede nada, porque no había nada que aprobar.
    executeAll(hookGroups['post-mcp'], chat.says('mirá la página')(call(root, 'mcp__claude-in-chrome__read_page')))
    blocked('mcp-writes', click(chat.says('pará, no toques nada')), WRITES)
  } finally { chat.close() }
})

test('Claude Code corre post-mcp después de cada herramienta MCP, con su shim', () => {
  const runner = path.join(__dirname, '..', '..', 'automatization')
  const settings = JSON.parse(fs.readFileSync(path.join(runner, 'runners', 'claude', 'settings.json'), 'utf8'))
  const entry = (settings.hooks.PostToolUse || []).find((one) => one.matcher === 'mcp__.*')
  assert.ok(entry, 'hay una entrada de PostToolUse para las herramientas MCP')
  assert.match(entry.hooks[0].command, /guard-mcp-granted\.sh$/)
  assert.ok(fs.statSync(path.join(runner, 'hooks', 'guard-mcp-granted.sh')).mode & 0o111, 'el shim es ejecutable')
})
