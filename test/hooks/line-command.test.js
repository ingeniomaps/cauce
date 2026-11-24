'use strict'

// Armar, sumarle un repositorio a o retirar una línea de trabajo frena hasta que la persona la nombre (caso 551).

const { installedProject } = require('../support/environment')
const { blocked, chatSession } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute, executeAll } = require('../../engine/hooks/run')

const DECIDES = /una línea —su rama, sus árboles, lo que escribe en ops\.config\.json— la decide la persona/

function instance(name, lines) {
  const { target } = installedProject(name, 'claude')
  const file = path.join(target, 'ops.config.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), lines }, null, 2))
  return (command) => ({ cwd: target, tool_input: { command } })
}

test('armar una línea nueva, sumarle un repositorio o retirarla frena, por cualquier forma de correr ops', () => {
  const shell = instance('cauce-line-command-', { cobros: ['app'] })
  for (const [command, why] of [
    ['node tools/ops.js line . pagos app', /la declara y le arma su rama la línea pagos/],
    ['npx cauce line . pagos', /la declara y le arma su rama la línea pagos/],
    ['npm run ops -- line . cobros app api', /le suma api la línea cobros/],
    ['node tools/ops.js lines join . cobros --apply', /la retira o la junta la línea cobros/],
    ['node tools/ops.js lines migrate . cobros app --apply; echo listo', /la migra la línea cobros/],
  ]) {
    blocked('line-command', shell(command), DECIDES)
    blocked('line-command', shell(command), why)
  }
})

test('leer, reusar una línea declarada y trabajar dentro de ella pasan', () => {
  const shell = instance('cauce-line-command-lee-', { cobros: ['app/'] })
  for (const command of ['node tools/ops.js lines .', 'node tools/ops.js lines join . cobros',
    'node tools/ops.js lines migrate . cobros app', 'node tools/ops.js line . cobros app',
    'node tools/ops.js line --help', 'node tools/ops.js lines env . cobros --apply',
    'node tools/ops.js worktree . T-1 --line cobros', "grep 'ops line . pagos app' notas.md"]) {
    assert.doesNotThrow(() => execute('line-command', shell(command)), command)
  }
})

test('nombrar la línea en el chat la destraba en ese turno, y en el siguiente vuelve a frenar', () => {
  const shell = instance('cauce-line-command-chat-', {})
  const chat = chatSession()
  try {
    const command = 'node tools/ops.js line . pagos app'
    assert.doesNotThrow(() => execute('line-command', chat.says('creá la línea pagos para app')(shell(command))))
    blocked('line-command', chat.says('ahora revisá la cola')(shell('node tools/ops.js line . otra app')), DECIDES)
    blocked('line-command', chat.says('otra cosa')(shell(command)), DECIDES)
  } finally { chat.close() }
  // Confirmar después del bloqueo la destraba también, sin nombrarla.
  const confirm = chatSession()
  try {
    const command = 'node tools/ops.js lines join . pagos --apply'
    blocked('line-command', confirm.says('juntá lo de hoy')(shell(command)), DECIDES)
    assert.doesNotThrow(() => execute('line-command', confirm.says('dale')(shell(command))))
  } finally { confirm.close() }
})

test('el hook de shell lo corre: frena por el grupo pre-shell que reciben los runners', () => {
  const shell = instance('cauce-line-command-grupo-', {})
  assert.throws(() => executeAll(['pre-shell'], shell('node tools/ops.js line . pagos app')),
    (error) => DECIDES.test(error.message))
})
