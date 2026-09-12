'use strict'

// Lo que una sesión concedió, visto desde `check`. El 116 trajo `granted` —lo que un guard deja pasar queda
// anotado y se hereda mensaje a mensaje— y lo dejó del lado que nadie audita: vive en el temporal del
// sistema y ninguna corrida lo muestra, mientras que por una sola línea en `.ops-approval` `check` sí
// avisa. Una exención que no se ve es un límite que ya no existe (caso 117).

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const CHAT = require('../../engine/hooks/chat')

test('check muestra lo que la sesión concedió, y no lo de otra instancia', () => {
  const target = path.join(tempRoot('cauce-concedido-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const otra = path.join(tempRoot('cauce-concedido-otra-'), 'demo-ops')
  assert.equal(run(['init', otra, '--name', 'Otra', '--mode', 'sidecar', '--no-install']).status, 0)

  const session = `prueba-concedido-${process.pid}`
  const vecina = `prueba-vecina-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  const avisos = (root) => JSON.parse(run(['check', path.join(root, 'planning'), '--json']).stdout)
    .warnings.filter((one) => /concedid/i.test(one))
  try {
    // La persona nombra la ruta y el guard la deja pasar: ahí es donde queda concedida (caso 116).
    const input = { session_id: session, prompt_id: 'm1', cwd: target }
    execute('chat', { ...input, prompt: 'escribí planning/rules/process.md' })
    assert.deepEqual(CHAT.unauthorized(input, ['planning/rules/process.md']), [], 'la orden lo autoriza')

    assert.deepEqual(avisos(target),
      ['1 ruta(s) concedidas en el chat de esta sesión: planning/rules/process.md'])

    // Y lo concedido trabajando en otra instancia no se le cuenta a ésta: el registro vive en el temporal,
    // que es uno solo por máquina, así que sin distinguir la raíz una instancia vería las exenciones de la
    // de al lado y el aviso diría algo falso.
    const ajena = { session_id: vecina, prompt_id: 'm1', cwd: otra }
    execute('chat', { ...ajena, prompt: 'escribí planning/rules/commits.md' })
    assert.deepEqual(CHAT.unauthorized(ajena, ['planning/rules/commits.md']), [])
    assert.deepEqual(avisos(target),
      ['1 ruta(s) concedidas en el chat de esta sesión: planning/rules/process.md'],
      'lo de la otra instancia no entra')
  } finally {
    for (const one of [session, vecina]) fs.rmSync(path.join(CHAT.DIR, `${one}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})
