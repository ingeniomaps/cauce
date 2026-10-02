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

// Los dos pasos se ejecutan de verdad, con un `claude` de mentira primero en el PATH. El doble reemplaza al
// CLI porque el real habla con un modelo y factura; anota con qué se lo llamó y, según el caso, escribe el
// cambio en la propuesta o no toca nada, que es lo que hacía el real cuando el recorrido no tenía permiso.
const BLANK = '# Propuesta\n\n## Cambio propuesto\n\nPor definir\n'
const DECIDED = '# Propuesta\n\n## Cambio propuesto\n\nAgregar a SKILL.md la conducta X.\n'

function runSteps(t, { claude, oauth = 'x', apikey = 'y' }) {
  const dir = tempRoot('cauce-propose-')
  fs.symlinkSync(path.join(REPO, 'engine'), path.join(dir, 'engine'))
  fs.symlinkSync(path.join(REPO, 'automatization'), path.join(dir, 'automatization'))
  const proposal = path.join(dir, 'proposal.md')
  fs.writeFileSync(proposal, BLANK)
  fs.writeFileSync(path.join(dir, 'decided.md'), DECIDED)
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const fake = {
    decides: `cp "${dir}/decided.md" "${proposal}"\nexit 0`,
    idle: 'exit 0',
    fails: 'exit 1',
    removes: `rm "${proposal}"\nexit 0`,
  }[claude]
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$@" >> "${dir}/args"\n${fake}\n`, { mode: 0o755 })

  const source = workflow('agent-learning')
  const env = {
    PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    AGENT: 'probe', OAUTH: oauth, APIKEY: apikey, FILE: proposal,
  }
  const run = (anchor) => {
    const output = path.join(dir, `output-${anchor.length}`)
    fs.writeFileSync(output, '')
    const step = workflowStep(source, anchor)
    assert.ok(step, `existe el paso ${anchor}`)
    const result = spawnSync('bash', ['-e', '-c', step], {
      cwd: dir, encoding: 'utf8', env: { ...env, GITHUB_OUTPUT: output },
    })
    t.diagnostic(result.stdout + result.stderr)
    return { status: result.status, out: result.stdout, outputs: fs.readFileSync(output, 'utf8') }
  }
  const write = run('- name: Write the concrete change')
  // El segundo paso corre sólo si el primero intentó, que es la condición que tiene en el workflow.
  const decision = /^attempted=true$/m.test(write.outputs) ? run('- name: Check the proposal again') : null
  const args = fs.existsSync(path.join(dir, 'args')) ? fs.readFileSync(path.join(dir, 'args'), 'utf8') : ''
  return { write, decision, args }
}

test('lo que decide si el recorrido hizo su trabajo es el documento, no el código de salida', (t) => {
  const bien = runSteps(t, { claude: 'decides' })
  assert.match(bien.args, /--allowedTools Workflow /, 'el recorrido tiene permiso para correrse')
  assert.equal(bien.decision.status, 0)
  assert.match(bien.decision.outputs, /^decided=true$/m, 'una propuesta que el recorrido completó queda decidida')

  // Salir en cero sin escribir nada es lo que pasó en la corrida real: tiene que leerse como fallo.
  const ocioso = runSteps(t, { claude: 'idle' })
  assert.match(ocioso.decision.outputs, /^decided=false$/m, 'salir en cero sin escribir no es decidir')

  // Y un fallo no frena el paso: después vienen los sellos, y sin empujarlos el mes siguiente consume lo mismo.
  const fallo = runSteps(t, { claude: 'fails' })
  assert.equal(fallo.write.status, 0, 'el paso sigue, para que la rama salga con sus sellos')
  assert.match(fallo.decision.outputs, /^decided=false$/m)

  const sinDocumento = runSteps(t, { claude: 'removes' })
  assert.equal(sinDocumento.decision.status, 0, 'no corta el job antes de empujar los sellos')
  assert.match(sinDocumento.decision.outputs, /^decided=false$/m, 'sin el documento no hay nada decidido')

  // Sin credencial el ciclo degrada a propósito (caso 155): avisa y no se vuelve a preguntar nada.
  const sinCredencial = runSteps(t, { claude: 'fails', oauth: '', apikey: '' })
  assert.match(sinCredencial.write.out, /::notice title=Sin credencial para proponer::/)
  assert.equal(sinCredencial.decision, null, 'faltar la credencial no pone el job en rojo')
})

test('el PR y el rojo leen el veredicto de después del recorrido', () => {
  const propose = job(workflow('agent-learning'), 'propose')
  assert.match(propose, /- name: Write the concrete change\n\s*id: write\n/, 'el paso se puede leer por id')
  assert.match(propose, /DECIDED: \$\{\{ steps\.decision\.outputs\.decided \|\| steps\.proposal\.outputs\.decided \}\}/,
    'el PR se pide con el veredicto nuevo cuando lo hay')

  const fail = propose.indexOf('- name: Fail when the proposal run failed')
  assert.ok(fail > propose.indexOf('- name: Open proposal pull request'), 'falla después de empujar la rama')
  const body = propose.slice(fail)
  assert.match(body, /^\s*if: steps\.decision\.outputs\.decided == 'false'$/m, 'sólo cuando sigue sin decidir')
  assert.match(body, /::error /, 'como error, no como aviso')
  assert.match(body, /^\s*exit 1$/m)
})

test('el recorrido tiene un techo de espera mayor que el default, y el job lo cubre', () => {
  const propose = job(workflow('agent-learning'), 'propose')
  const step = propose.slice(propose.indexOf('- name: Write the concrete change'))
  const found = step.match(/^\s*CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '(\d+)'$/m)
  assert.ok(found, 'el paso que propone declara el techo')
  const ceiling = Number(found[1])
  assert.ok(ceiling > 600000, 'más que los 600 s que cortaron a 15 cargos')

  const timeout = Number(propose.match(/^ {4}timeout-minutes: (\d+)$/m)[1])
  assert.ok(timeout * 60000 >= ceiling + 10 * 60000, 'el job deja diez minutos después del techo')
})

function runArchive(t, frontmatter, body = '') {
  const dir = tempRoot('cauce-archive-')
  const proposal = path.join(dir, 'proposal.md')
  const decided = DECIDED.split('\n').slice(2).join('\n')
  fs.writeFileSync(proposal, `---\nagent: probe\n${frontmatter}status: proposed\n---\n\n${decided}${body}`)
  // El doble reemplaza al CLI: lo que se mide es si el paso lo llama y con qué, no el archivado en sí, que
  // ya tiene sus pruebas en el motor.
  const ops = path.join(dir, 'ops.js')
  fs.writeFileSync(ops, `require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'calls'))}, `
    + `JSON.stringify({ argv: process.argv.slice(2), owner: process.env.CAUCE_OWNER || '' }))\n`)
  const output = path.join(dir, 'output')
  fs.writeFileSync(output, '')
  const step = workflowStep(workflow('agent-learning'), '- name: Archive when nothing changes')
  assert.ok(step, 'el paso existe')
  const result = spawnSync('bash', ['-e', '-c', step], {
    cwd: dir, encoding: 'utf8',
    env: {
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      AGENT: 'probe', FILE: proposal, OPS: ops, GITHUB_OUTPUT: output,
      CAUCE_OWNER: 'agent-propose (github-actions[bot])',
    },
  })
  t.diagnostic(result.stdout + result.stderr)
  const calls = path.join(dir, 'calls')
  return {
    status: result.status,
    outputs: fs.readFileSync(output, 'utf8'),
    call: fs.existsSync(calls) ? JSON.parse(fs.readFileSync(calls, 'utf8')) : null,
  }
}

test('una propuesta que dice «cambia: no» se archiva con su motivo, y ninguna otra', (t) => {
  const sinCambio = runArchive(t, 'cambia: no\n')
  assert.equal(sinCambio.status, 0)
  assert.ok(sinCambio.call, 'llama al CLI')
  assert.deepEqual(sinCambio.call.argv.slice(0, 3), ['learn', 'probe', '--archived'])
  const reason = sinCambio.call.argv[sinCambio.call.argv.indexOf('--reason') + 1]
  assert.ok(reason && reason.trim(), 'con motivo: es lo que lee el informe siguiente')
  assert.match(sinCambio.call.owner, /\S/, 'y con alguien a quien atribuirlo')
  assert.match(sinCambio.outputs, /^archived=true$/m)

  for (const [name, front] of [['cambia: si', 'cambia: si\n'], ['sin el campo', ''], ['otro valor', 'cambia: nop\n']]) {
    const firma = runArchive(t, front)
    assert.equal(firma.status, 0)
    assert.equal(firma.call, null, `${name}: no se archiva`)
    assert.equal(/archived=true/.test(firma.outputs), false, `${name}: sigue pidiendo firma`)
  }

  // Sólo el frontmatter: la misma línea en el cuerpo es prosa, no una decisión.
  const enElCuerpo = runArchive(t, '', 'cambia: no\n')
  assert.equal(enElCuerpo.call, null)
})

test('la archivada abre su PR con auto-merge, y el recorrido sabe contestar el campo', () => {
  const source = workflow('agent-learning')
  const propose = job(source, 'propose')
  const archive = propose.indexOf('- name: Archive when nothing changes')
  assert.ok(archive > propose.indexOf('- name: Check the proposal again'), 'después de saber si decidió')
  assert.ok(archive < propose.indexOf('- name: Detect changes'), 'y antes de armar el PR, para que el archivado viaje')
  assert.match(propose.slice(archive), /^\s*if: steps\.decision\.outputs\.decided == 'true'$/m)

  const open = workflowStep(source, '- name: Open proposal pull request')
  assert.match(open, /if \[ "\$ARCHIVED" = 'true' \]; then[\s\S]*gh pr merge "\$branch" --auto --merge/,
    'la archivada se mergea sola cuando su CI pase')

  const recorrido = fs.readFileSync(path.join(REPO, 'automatization', 'workflows', 'agent-propose.js'), 'utf8')
  assert.match(recorrido, /cambia: si/)
  assert.match(recorrido, /cambia: no/)
})
