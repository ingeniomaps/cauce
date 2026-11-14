'use strict'

// El freno de `plan-first` y el de la gobernanza en una sesión sin ningún mensaje registrado dicen por qué (caso 503).

const { tempRoot } = require('../support/environment')
const { chatSession, git, initRepo, messageOf, planFirstRoot, WIP_IDLE } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const NOTE = /No hay ningún mensaje de la persona registrado en esta sesión/

function governed() {
  const root = tempRoot('ops-hook-sin-registro-gob-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning', 'rules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'planning', 'rules', 'process.md'), '# regla\n')
  git(['add', 'planning/rules/process.md'], root)
  return root
}

test('sin mensaje registrado, plan-first y la gobernanza dicen que lo pedido antes no cuenta', () => {
  const product = planFirstRoot('ops-hook-sin-registro-plan-', WIP_IDLE)
  const commits = governed()
  const cases = [
    ['plan-first', { cwd: product, tool_input: { file_path: path.join(product, 'src', 'app.js') } }],
    ['governance', { cwd: commits, tool_input: { command: 'git commit -m x' } }],
  ]
  // Abrirla saca `CI` del entorno: con `CI` puesto la línea no sale.
  const chat = chatSession()
  try {
    for (const [guard, call] of cases) {
      const none = `sin-registro-${process.pid}-${guard}`
      assert.match(messageOf(guard, { session_id: none, prompt_id: 'm1', ...call }), NOTE, guard)
      // Con un registro de otro mensaje el guard frena igual, y la línea sería falsa: lo que la persona dijo sí
      // quedó registrado, y lo que se frena no lo pidió ella.
      const other = chat.says('contame qué hay en el backlog')
      assert.doesNotMatch(messageOf(guard, { ...other(call), prompt_id: 'otro' }), NOTE, guard)
      // Un subagente no tiene registro propio, y su freno no es de una persona que haya pedido algo.
      assert.doesNotMatch(messageOf(guard, { session_id: none, agent_id: 'a1', ...call }), NOTE, guard)
      // Ni CI ni un rol delegado tienen detrás a una persona que repita nada.
      for (const [key, value] of [['CI', 'true'], ['CAUCE_DELEGATED', '1']]) {
        process.env[key] = value
        const message = () => messageOf(guard, { session_id: none, prompt_id: 'm1', ...call })
        try { assert.doesNotMatch(message(), NOTE, `${guard}: ${key}`) } finally { delete process.env[key] }
      }
    }
  } finally { chat.close() }
})
