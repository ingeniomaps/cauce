'use strict'

// Caso 549. Las transcripciones son fixtures armados con la forma que describe engine/cli/review-read.js;
// ninguna es real.

const { tempRoot, run } = require('../support/environment')
const { git, initRepo } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const RR = require('../../engine/cli/review-read')

let calls = 0
const use = (name, input) => ({ id: `t${calls += 1}`, name, input })
// Una línea por llamada y otra por su resultado; `denied` imita la denegación del runner.
function transcript(file, entries) {
  const out = []
  for (const { call, error = false, denied = false, output = 'x' } of entries) {
    out.push({ type: 'assistant', message: { content: [{ type: 'tool_use', ...call }] } })
    out.push({ type: 'user', ...(denied ? { toolDenialKind: 'user-rejected' } : {}),
      message: { content: [{ type: 'tool_result', tool_use_id: call.id, is_error: error, content: output }] } })
  }
  fs.writeFileSync(file, out.map((one) => JSON.stringify(one)).join('\n') + '\n')
}
const DIFF = (file) => `diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n`
function project(session, workflow, agents) {
  const projects = tempRoot('cauce-review-read-')
  const dir = path.join(projects, '-banco', session, 'subagents', 'workflows', workflow)
  fs.mkdirSync(dir, { recursive: true })
  const journal = []
  for (const [id, label, entries] of agents) {
    journal.push({ type: 'started', agentId: id, key: id, label, phase: 'Review' })
    if (entries) transcript(path.join(dir, `agent-${id}.jsonl`), entries)
  }
  fs.writeFileSync(path.join(dir, 'journal.jsonl'), journal.map((one) => JSON.stringify(one)).join('\n') + '\n')
  return projects
}
function repo() {
  const root = tempRoot('cauce-review-read-app-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src', 'sum.js'), 'module.exports = 1\n')
  git(['add', 'src/sum.js'], root)
  return root
}

test('cuenta lo que abrió, un cat literal o por glob y lo que el diff mostró, y gana lo más fuerte', () => {
  const root = repo()
  const files = ['src/sum.js', 'test/sum.test.js', 'README.md', 'src/otro.js', 'src/mostrado.js']
  const projects = project('s1', 'wf_1', [['a1', 'review', [
    // Como bloques de texto, que es la otra forma en que llega la salida de una herramienta.
    { call: use('Bash', { command: 'git -C . diff' }),
      output: [{ type: 'text', text: DIFF('src/sum.js') }, { type: 'text', text: DIFF('src/mostrado.js') }, {}] },
    { call: use('Bash', { command: `cat ${root}/test/*` }) },
    { call: use('Read', { file_path: path.join(root, 'src', 'sum.js') }) },
    { call: use('Bash', { command: 'sed -n 1,20p README.md' }), denied: true },
    { call: use('Bash', { command: 'head src/otro.js' }), error: true },
  ]], ['a2', 'qa', [{ call: use('Read', { file_path: path.join(root, 'README.md') }) }]]])
  const result = RR.contrast(RR.located('s1', 'review', projects), files, root)
  assert.deepEqual(result.read, { 'src/sum.js': 'read', 'test/sum.test.js': 'glob', 'src/mostrado.js': 'diff' })
  assert.deepEqual(result.unread, ['README.md', 'src/otro.js'])
})

test('no cuentan un diff que no lo mostró, un --stat, la versión de antes ni un ls', () => {
  const root = repo()
  const projects = project('s2', 'wf_2', [['b1', 'review', [
    { call: use('Bash', { command: 'git diff' }), output: '' },
    { call: use('Bash', { command: 'git show --stat HEAD' }), output: ' src/sum.js | 1 +\n test/x.js | 3 +++\n' },
    { call: use('Bash', { command: 'git show HEAD:src/sum.js' }), output: 'module.exports = 1\n' },
    { call: use('Bash', { command: 'ls src/sum.js' }), output: 'src/sum.js\n' },
  ]]])
  const result = RR.contrast(RR.located('s2', 'review', projects), ['src/sum.js', 'test/sum.test.js'], root)
  assert.deepEqual(result.read, {})
})

test('de varios recorridos lee sólo el más nuevo, y sin revisor ahí no inventa una lista', () => {
  const projects = project('s3', 'wf_viejo', [['c1', 'review', [{ call: use('Read', { file_path: '/x/viejo.js' }) }]]])
  const newer = path.join(projects, '-banco', 's3', 'subagents', 'workflows', 'wf_nuevo')
  fs.mkdirSync(newer)
  const started = { type: 'started', agentId: 'c2', label: 'review' }
  fs.writeFileSync(path.join(newer, 'journal.jsonl'), `${JSON.stringify(started)}\n`)
  transcript(path.join(newer, 'agent-c2.jsonl'), [])
  const future = new Date(Date.now() + 60_000)
  fs.utimesSync(path.join(newer, 'journal.jsonl'), future, future)
  assert.deepEqual(RR.located('s3', 'review', projects), [path.join(newer, 'agent-c2.jsonl')])
  assert.equal(RR.located('otra', 'review', projects), null)
  assert.equal(RR.located('s3', 'commit', projects), null)
  // El más nuevo sin revisor después de su lista del diff no cae al viejo, que es otra corrida.
  fs.appendFileSync(path.join(newer, 'journal.jsonl'), `${JSON.stringify({ type: 'started', label: 'review-diff' })}\n`)
  fs.utimesSync(path.join(newer, 'journal.jsonl'), future, future)
  assert.equal(RR.located('s3', 'review', projects), null)
})

test('sin sesión ni transcripción el comando lo dice y sale con 1, en vez de una lista vacía', () => {
  const root = repo()
  const env = { CLAUDE_CODE_SESSION_ID: '', HOME: tempRoot('cauce-review-read-home-') }
  const none = run(['review-read', root, '--files', 'src/sum.js'], root, env)
  assert.equal(none.status, 1)
  assert.deepEqual(JSON.parse(none.stdout),
    { found: false, why: 'sin CLAUDE_CODE_SESSION_ID: este runner no deja transcripción' })
  const missing = run(['review-read', root, '--files', 'src/sum.js', '--session', 'zz'], root, env)
  assert.equal(missing.status, 1)
  assert.match(JSON.parse(missing.stdout).why, /no hay transcripción de review para la sesión zz/)
  assert.equal(run(['review-read', root], root, env).status, 2)
})

test('cuenta sólo a quien revisó la tarea en curso, después de su lista del diff', () => {
  const root = repo()
  const projects = project('s4', 'wf_4', [
    ['d1', 'review', [{ call: use('Read', { file_path: path.join(root, 'src', 'sum.js') }) }]],
    ['d2', 'review-diff', null],
    ['d3', 'review', [{ call: use('Bash', { command: 'ls' }) }]],
  ])
  const found = RR.located('s4', 'review', projects)
  assert.deepEqual(found.map((one) => path.basename(one)), ['agent-d3.jsonl'])
  assert.deepEqual(RR.contrast(found, ['src/sum.js'], root).unread, ['src/sum.js'])
})

test('una transcripción ilegible lo dice sin citar lo que no pudo leer', () => {
  const root = repo()
  const home = tempRoot('cauce-review-read-ilegible-')
  const projects = path.join(home, '.claude', 'projects')
  fs.mkdirSync(projects, { recursive: true })
  const made = project('s5', 'wf_5', [['e1', 'review', []]])
  fs.cpSync(made, projects, { recursive: true })
  const agent = path.join(projects, '-banco', 's5', 'subagents', 'workflows', 'wf_5', 'agent-e1.jsonl')
  fs.writeFileSync(agent, 'AKIACLAVE\n')
  const out = run(['review-read', root, '--files', 'src/sum.js', '--session', 's5'], root, { HOME: home })
  assert.equal(out.status, 1)
  assert.deepEqual(JSON.parse(out.stdout), { found: false, why: 'la transcripción no tiene la forma conocida' })
  assert.doesNotMatch(out.stdout + out.stderr, /AKIACLAVE/)
})
