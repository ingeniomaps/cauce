'use strict'

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Caso 380: una tarea `[manual]` no se le ofrece a un runner y `context` la nombra aparte. El porqué, en
// `currentTask` (`engine/planning/state.js`).
test('una tarea manual no se le ofrece a ningún runner, y context la nombra aparte', () => {
  const base = tempRoot('cauce-manual-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Manual', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const backlog = (...tasks) => fs.writeFileSync(
    path.join(planning, 'BACKLOG.md'), `# Backlog\n\n## Hito demo — Demo\n\n${tasks.join('\n')}\n`,
  )
  const manual = '- [ ] **a-mano** [manual] — Poner el placeholder. _Aceptación: el campo muestra el ejemplo._ '
    + '(service: app)'
  backlog(manual, '- [ ] **con-recorrido** [lite] — Validar al salir. _Aceptación: avisa el error._ (service: app)')
  assert.equal(run(['check', planning]).status, 0, run(['check', planning]).stderr)
  const both = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(both.task.slug, 'con-recorrido', 'se ofrece la que sigue, no la manual')
  assert.deepEqual(both.manual, ['a-mano'])
  assert.match(run(['context', planning]).stdout, /^MANUAL\s+a-mano\b/m, 'y se ve sin pedir --json')

  // Sola en la cola, la tarea no se ofrece igual: la cola no está terminada, la tiene una persona.
  backlog(manual)
  const alone = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(alone.task, null)
  assert.deepEqual(alone.manual, ['a-mano'])

  // Quien espera a una tarea manual espera a la sesión, y eso se dice: sin dueño se leía como una espera huérfana.
  backlog(manual, '- [ ] **despues** [lite] — Seguir. _Aceptación: sigue._ (depende: a-mano) (service: app)')
  const waits = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.deepEqual(waits.waiting, [{ slug: 'despues', dep: 'a-mano', owner: 'la sesión, a mano' }])

  // Y la que este runner reclamó se nombra como suya (`manualHeld`).
  const env = { CAUCE_OWNER: 'ana@acme.com', CAUCE_RUNNER: 'sesion-ana' }
  assert.equal(run(['claim', planning, 'a-mano'], undefined, env).status, 0)
  const held = JSON.parse(run(['context', planning, '--json'], undefined, env).stdout)
  assert.deepEqual(held.manualHeld, ['a-mano'])
  assert.match(run(['context', planning], undefined, env).stdout, /^MANUAL\s+a-mano: .*reclamada por este runner/m)
  const other = JSON.parse(run(['context', planning, '--json'], undefined, { ...env, CAUCE_RUNNER: 'otro' }).stdout)
  assert.deepEqual(other.manualHeld, [], 'el reclamo es de un runner, no de la instancia')
})
