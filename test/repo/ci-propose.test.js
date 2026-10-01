'use strict'

// El job que consolida corre `/agent-propose`, y lo que estas pruebas cuidan es que pueda correrlo y que,
// cuando no puede, se note. El ensamblaje del 2026-10-01 llamó a `claude` en los 53 cargos sin haberlo
// instalado y la corrida salió en verde (caso 219).

const { tempRoot, workflow, workflowStep } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO = path.resolve(__dirname, '..', '..')

function job(source, name) {
  return source.split(new RegExp(`^  ${name}:$`, 'm'))[1].split(/^  [a-z-]+:$/m)[0]
}

test('el job que consolida instala el CLI que invoca, en la versión que usa el que investiga', () => {
  const source = workflow('agent-learning')
  const propose = job(source, 'propose')

  const install = propose.indexOf('- name: Install Claude Code')
  assert.ok(install > 0, 'propose instala el CLI')
  assert.ok(install < propose.indexOf('- name: Write the concrete change'), 'antes del paso que lo llama')
  assert.match(propose.slice(install), /^\s*if: steps\.proposal\.outputs\.decided != 'true'$/m,
    'sólo cuando hay algo que escribir, igual que el paso que lo usa')

  assert.match(source, /^ {2}CLAUDE_CODE_VERSION: \d+\.\d+\.\d+$/m, 'la versión vive en el env del workflow')
  for (const name of ['research', 'propose']) {
    assert.match(job(source, name), /npm install -g "@anthropic-ai\/claude-code@\$CLAUDE_CODE_VERSION"/,
      `${name} instala la versión declarada`)
  }
  assert.equal(/claude-code@\d/.test(source), false, 'no queda una versión escrita a mano en un job')
})

// El paso se ejecuta de verdad, con un `claude` de mentira primero en el PATH: lo que se mide es qué deja
// el paso cuando la corrida falla, y eso no depende de por qué falló. Un binario ausente da 127 por el
// mismo `if !`. El doble reemplaza al CLI porque el real habla con un modelo y factura.
function runStep(t, { claudeExit, oauth = 'x', apikey = 'y' }) {
  const dir = tempRoot('cauce-propose-')
  fs.symlinkSync(path.join(REPO, 'engine'), path.join(dir, 'engine'))
  fs.symlinkSync(path.join(REPO, 'automatization'), path.join(dir, 'automatization'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexit ${claudeExit}\n`, { mode: 0o755 })
  const output = path.join(dir, 'output')
  fs.writeFileSync(output, '')

  const step = workflowStep(workflow('agent-learning'), '- name: Write the concrete change')
  assert.ok(step, 'el paso existe')
  const result = spawnSync('bash', ['-e', '-c', step], {
    cwd: dir, encoding: 'utf8',
    env: {
      PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      AGENT: 'probe', OAUTH: oauth, APIKEY: apikey, GITHUB_OUTPUT: output,
    },
  })
  t.diagnostic(result.stdout + result.stderr)
  return { status: result.status, out: result.stdout, outputs: fs.readFileSync(output, 'utf8') }
}

test('una corrida de /agent-propose que falla queda dicha en la salida del paso, sin frenarlo', (t) => {
  // Sin frenar: después vienen los sellos, y si no se empujan el mes siguiente consume lo mismo.
  const fallo = runStep(t, { claudeExit: 1 })
  assert.equal(fallo.status, 0, 'el paso sigue, para que la rama salga con sus sellos')
  assert.match(fallo.outputs, /^failed=true$/m, 'y deja dicho que falló')

  const bien = runStep(t, { claudeExit: 0 })
  assert.equal(bien.status, 0)
  assert.equal(/failed=/.test(bien.outputs), false, 'una corrida buena no deja nada')

  // Sin credencial el ciclo degrada a propósito (caso 155): avisa y no es un fallo.
  const sinCredencial = runStep(t, { claudeExit: 1, oauth: '', apikey: '' })
  assert.equal(sinCredencial.status, 0)
  assert.match(sinCredencial.out, /::notice title=Sin credencial para proponer::/)
  assert.equal(/failed=/.test(sinCredencial.outputs), false, 'faltar la credencial no pone el job en rojo')
})

test('el job termina en rojo cuando la corrida falló, después de empujar los sellos', () => {
  const propose = job(workflow('agent-learning'), 'propose')
  assert.match(propose, /- name: Write the concrete change\n\s*id: write\n/, 'el paso se puede leer por id')

  const fail = propose.indexOf('- name: Fail when the proposal run failed')
  assert.ok(fail > propose.indexOf('- name: Open proposal pull request'), 'falla después de empujar la rama')
  const body = propose.slice(fail)
  assert.match(body, /^\s*if: steps\.write\.outputs\.failed == 'true'$/m, 'sólo cuando la corrida falló')
  assert.match(body, /::error /, 'como error, no como aviso')
  assert.match(body, /^\s*exit 1$/m)
})
