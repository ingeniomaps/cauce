'use strict'

// El aviso que recibe un PR que lleva una propuesta pendiente y no lo abrió el bot. La firma sale de una
// aprobación, GitHub no deja aprobar el PR propio, y cuando las dos cuentas coinciden no falla nada:
// simplemente no aparece el botón. Este aviso es lo único que lo dice en el momento, y por eso avisa en
// vez de fallar — con equipo, un compañero puede aprobar el PR que abrió otro.

const { tempRoot, workflow, workflowStep } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

// Corre el paso sobre un PR de un solo commit que agrega una propuesta en el estado pedido.
const run = (name, state, author) => {
  const step = workflowStep(workflow('ci'), 'name: Warn when a pending proposal cannot be signed')
  const repo = tempRoot(`cauce-aviso-${name}-`)
  const dir = path.join(repo, 'agents', 'roles', 'own', 'probe', 'learning', 'proposals')
  fs.mkdirSync(dir, { recursive: true })
  const git = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })

  git('git init -q -b main . && git -c user.email=t@t -c user.name=t commit -qm base --allow-empty')
  const base = git('git rev-parse HEAD').trim()
  fs.writeFileSync(path.join(dir, '2099-01.md'),
    `---\nagent: probe\nstatus: proposed\n---\n\n## Aprobación humana\n\n- Estado: ${state}\n`)
  git('git add agents && git -c user.email=t@t -c user.name=t commit -qm propuesta')

  const done = spawnSync('bash', ['-e', '-c', step], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, BASE: base, AUTHOR: author },
  })
  assert.equal(done.status, 0, `el aviso no puede tumbar CI: ${done.stderr}`)
  return done.stdout
}

test('una propuesta pendiente que su autor no va a poder aprobar se avisa',
  { skip: process.platform === 'win32' }, () => {
    const output = run('avisa', 'pendiente', 'ingeniomaps')
    assert.match(output, /^::warning title=/m, 'llega como anotación del PR, no como una línea de log más')
    assert.match(output, /2099-01\.md/, 'y nombra el archivo, que es lo que hay que ir a mirar')
    assert.match(output, /Open pull request/, 'y qué hacer, que es reabrirlo desde el workflow')
  })

test('el PR que abrió el bot no se avisa: quien firme va a poder aprobarlo',
  { skip: process.platform === 'win32' }, () => {
    assert.equal(/::warning/.test(run('bot', 'pendiente', 'github-actions[bot]')), false,
      'avisar acá entrenaría a ignorar el aviso, que es el único que hay')
  })

test('una propuesta ya firmada no se avisa, aunque el PR lo abra una persona',
  { skip: process.platform === 'win32' }, () => {
    assert.equal(/::warning/.test(run('firmada', 'aprobada', 'ingeniomaps')), false,
      'lo que dispara el aviso es que quede una firma por dar, no que el archivo sea una propuesta')
  })
