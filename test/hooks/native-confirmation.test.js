'use strict'

// La confirmación con el diálogo de Claude Code (caso 221). Lo que se mide: que lo que hoy espera un sí por
// chat pida el diálogo, que un mensaje sobre otra cosa ya no lo apruebe, que un bloqueo de verdad le gane a
// una pregunta dentro del mismo grupo, que el proceso responda lo que Claude Code lee, y que Codex —sin
// diálogo— siga como estaba.

const { blocked, chatSession, pushRoot, planFirstRoot, WIP_CON_PLAN } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute, executeAll } = require('../../engine/hooks/run')
const CF = require('../../engine/hooks/confirm')

const RUN = path.resolve(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
const claude = (call) => (extra) => call({ hook_event_name: 'PreToolUse', permission_mode: 'default', ...extra })
const push = (root) => ({ cwd: root, tool_input: { command: 'git push origin feat/x' } })
const asks = (fn) => {
  try { fn() } catch (error) {
    return error.ask ? error.message : assert.fail(`bloqueó sin preguntar: ${error.message}`)
  }
  return assert.fail('no preguntó')
}

test('en Claude Code un push frenado pide el diálogo, y un mensaje sobre otra cosa no lo aprueba', () => {
  const root = pushRoot('cauce-native-push-')
  const chat = chatSession()
  try {
    const first = claude(chat.says('implementá la tarea de alta de clientes'))
    const message = asks(() => executeAll(['destructive'], first(push(root))))
    assert.ok(message.includes(CF.LEAD), message)
    const unrelated = claude(chat.says('agregá una regla nueva a planning/rules/process.md'))
    asks(() => executeAll(['destructive'], unrelated(push(root))))
  } finally { chat.close() }
})

// Caso 257. En `auto` el diálogo no lo contesta una persona: Claude Code lo resuelve solo y la herramienta
// corre. Pedirlo ahí dejaba pasar lo que el guard frenaba, así que en ese modo —y en cualquiera que no esté
// medido— el guard bloquea y la salida vuelve a ser el chat.
test('donde nadie contesta el diálogo, el guard bloquea en vez de pedirlo', () => {
  const root = pushRoot('cauce-native-auto-')
  for (const mode of ['auto', 'plan', 'dontAsk', 'un-modo-que-todavia-no-existe', undefined]) {
    const chat = chatSession()
    try {
      const call = chat.says('implementá la tarea de alta de clientes')
      const input = { hook_event_name: 'PreToolUse', permission_mode: mode, ...call(push(root)) }
      assert.equal(CF.native(input), false, `${mode} no usa el diálogo`)
      assert.throws(() => executeAll(['destructive'], input),
        (error) => error.blocked && !error.ask && /publica cambios/.test(error.message), `${mode} tiene que bloquear`)
    } finally { chat.close() }
  }
  for (const mode of ['default', 'acceptEdits', 'bypassPermissions']) {
    assert.equal(CF.native({ hook_event_name: 'PreToolUse', prompt_id: 'm1', permission_mode: mode }), true, mode)
  }
})

test('Codex no tiene diálogo y sigue con la confirmación por chat', () => {
  const root = pushRoot('cauce-native-codex-')
  const chat = chatSession()
  try {
    const first = chat.says('implementá la tarea', 'turn_id')
    blocked('destructive', { hook_event_name: 'PreToolUse', ...first(push(root)) }, /publica cambios/)
    const yes = chat.says('dale, subilo', 'turn_id')
    assert.doesNotThrow(() => execute('destructive', { hook_event_name: 'PreToolUse', ...yes(push(root)) }))
  } finally { chat.close() }
})

test('dentro de un grupo, un bloqueo de verdad le gana a una pregunta', () => {
  const root = pushRoot('cauce-native-grupo-')
  const chat = chatSession()
  try {
    const call = claude(chat.says('seguí'))
    const both = { cwd: root, tool_input: { command: 'git push origin feat/x && git add -A' } }
    assert.throws(() => executeAll(['pre-shell'], call(both)),
      (error) => error.blocked && !error.ask && /git add/.test(error.message))
    // Y un bloqueo que no se aprueba con un sí no se vuelve pregunta.
    const live = { cwd: root, tool_input: { command: 'git push origin main' } }
    assert.throws(() => executeAll(['pre-shell'], call(live)), (error) => error.blocked && !error.ask)
  } finally { chat.close() }
})

test('una lectura de credencial también pide el diálogo, y la salida es la que Claude Code lee', () => {
  const reader = planFirstRoot('cauce-native-lectura-', WIP_CON_PLAN)
  const input = { hook_event_name: 'PreToolUse', permission_mode: 'default', prompt_id: 'm1',
    session_id: 'cauce-native-proceso',
    cwd: reader, tool_name: 'Read', tool_input: { file_path: path.join(reader, '.env') } }
  asks(() => executeAll(['pre-read'], input))
  const ran = spawnSync('node', [RUN, 'pre-read'], { input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, OPS_ROOT: reader } })
  assert.equal(ran.status, 0, ran.stderr)
  const out = JSON.parse(ran.stdout).hookSpecificOutput
  assert.equal(out.hookEventName, 'PreToolUse')
  assert.equal(out.permissionDecision, 'ask')
  assert.match(out.permissionDecisionReason, /\.env/)
})

test('sin nada que aprobar no hay diálogo: plan-first con un plan a la vista pide el plan, no un sí', () => {
  const AP = require('../../engine/hooks/approval')
  const input = { hook_event_name: 'PreToolUse', permission_mode: 'default', prompt_id: 'm1',
    cwd: pushRoot('cauce-native-vacio-') }
  AP.HOW(null, [], input, [])
  assert.equal(CF.takeAsk(input), false)
  AP.HOW(null, ['src/app.js'], input)
  assert.equal(CF.takeAsk(input), true)
})

test('lo que pasa por HOW tampoco queda esperando un sí del chat', () => {
  const reader = planFirstRoot('cauce-native-how-', WIP_CON_PLAN)
  const read = { cwd: reader, tool_name: 'Read', tool_input: { file_path: path.join(reader, '.env') } }
  const chat = chatSession()
  try {
    asks(() => executeAll(['pre-read'], claude(chat.says('implementá la tarea'))(read)))
    asks(() => executeAll(['pre-read'], claude(chat.says('agregá un test para el alta'))(read)))
  } finally { chat.close() }
})

test('el agente que quiere escribirse la aprobación también pasa por el diálogo, con las líneas a la vista', () => {
  const root = pushRoot('cauce-native-propia-')
  const file = path.join(root, 'planning', '.ops-approval')
  const write = (call) => call({ cwd: root, tool_name: 'Write',
    tool_input: { file_path: file, content: 'src/app.js\n' } })
  const chat = chatSession()
  try {
    // Sin nombrar el archivo, y nombrándolo pero sin nombrar la línea: las dos escrituras se preguntan.
    const unnamed = asks(() => executeAll(['pre-files'], write(claude(chat.says('seguí con la tarea')))))
    assert.match(unnamed, /quiere agregar a .*\.ops-approval.*estas líneas:\n {2}src\/app\.js\n/s)
    const unasked = asks(() => executeAll(['pre-files'],
      write(claude(chat.says('agregá a planning/.ops-approval la ruta de la migración')))))
    assert.match(unasked, /src\/app\.js/)
  } finally { chat.close() }
})
