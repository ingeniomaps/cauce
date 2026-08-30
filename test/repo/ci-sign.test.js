'use strict'

// La firma de una propuesta. `Responsable` era texto libre y la puerta comprobaba que hubiera un nombre,
// no de quién era: lo podía escribir cualquiera que tuviera el archivo abierto, incluido un agente. Una
// aprobación de GitHub trae identidad autenticada y no admite aprobarse a uno mismo, así que el guard
// deja de ser una convención. Lo que sigue separado es autorizar de aplicar.

const { tempRoot, workflow, workflowStep } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const APROBACION = '## Aprobación humana\n\n- Estado: pendiente\n'
  + '- Responsable: por definir\n- Fecha: por definir\n'
const propuesta = (estado) =>
  `---\nagent: probe\nperiod: 2099-01\nstatus: ${estado}\n---\n\n# Propuesta\n\n${APROBACION}`

test('aprobar el PR firma la propuesta con la cuenta que aprobó', { skip: process.platform === 'win32' }, () => {
  const source = workflow('sign-proposal')
  const paso = workflowStep(source, 'name: Sign the proposals this pull request carries')
  assert.ok(paso.includes('Responsable'), 'no se encontró el paso que firma')

  const repo = tempRoot('cauce-firma-')
  const remoto = path.join(repo, 'remoto.git')
  const dir = path.join(repo, 'agents', 'roles', 'own', 'probe', 'learning', 'proposals')
  fs.mkdirSync(dir, { recursive: true })
  const git = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })

  // La base del PR: una propuesta ya firmada, que no se puede volver a tocar.
  fs.writeFileSync(path.join(dir, '2099-01.md'),
    propuesta('applied').replace('- Estado: pendiente', '- Estado: aplicada'))
  git('git init -q -b main . && git -c user.email=t@t -c user.name=t commit -qm base --allow-empty')
  git('git add agents && git -c user.email=t@t -c user.name=t commit -qm previa')
  const base = git('git rev-parse HEAD').trim()

  // Lo que el PR agrega: una propuesta sin firmar. Y un archivo ajeno, que no es una propuesta.
  fs.writeFileSync(path.join(dir, '2099-02.md'), propuesta('proposed'))
  // Un documento de planificación trae «- Estado: pendiente» por su cuenta. Es lo que vuelve portante al
  // pathspec: sin él, el paso firmaría una fila de acciones humanas creyendo que es una propuesta.
  fs.mkdirSync(path.join(repo, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'planning', 'HUMAN_ACTIONS.md'),
    '# Acciones humanas\n\n- Estado: pendiente\n- Responsable: por definir\n- Fecha: por definir\n')
  git('git add agents planning && git -c user.email=t@t -c user.name=t commit -qm nueva')
  git(`git init -q --bare ${JSON.stringify(remoto)} && git remote add origin ${JSON.stringify(remoto)}`)

  const hecho = spawnSync('bash', ['-c', paso], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, APPROVER: 'ingeniomaps', BASE: base, GITHUB_HEAD_REF: 'main' },
  })
  assert.equal(hecho.status, 0, `el paso falló: ${hecho.stderr}`)

  const firmada = fs.readFileSync(path.join(dir, '2099-02.md'), 'utf8')
  assert.match(firmada, /^- Estado: aprobada$/m, 'la aprobación queda registrada')
  assert.match(firmada, /^- Responsable: @ingeniomaps$/m, 'con la cuenta que aprobó, no con un texto libre')
  assert.match(firmada, /^- Fecha: \d{4}-\d{2}-\d{2}$/m, 'y su fecha')
  // Firmar autoriza; aplicar es otro acto y lo hace `agent-promote`. Mover esto acá los colapsaría.
  assert.match(firmada, /^status: proposed$/m, 'el frontmatter no se mueve: firmar no es aplicar')

  // La que ya estaba firmada no se vuelve a tocar, ni siquiera para actualizarle la fecha.
  assert.match(fs.readFileSync(path.join(dir, '2099-01.md'), 'utf8'), /^- Estado: aplicada$/m,
    'una propuesta ya decidida no se reescribe')
  // Y lo que no es una propuesta no se firma, aunque traiga las mismas tres líneas.
  assert.match(fs.readFileSync(path.join(repo, 'planning', 'HUMAN_ACTIONS.md'), 'utf8'),
    /^- Estado: pendiente$/m, 'una fila de acciones humanas no es una propuesta')
  assert.equal(git('git show --name-only --format= HEAD').includes('HUMAN_ACTIONS'), false,
    'el commit lleva propuestas y nada más')
})

// El filtro por «pendiente» sólo se nota cuando no hay nada que firmar: sin él, aprobar un PR que toca
// una propuesta ya decidida abriría un commit vacío sobre la rama de alguien. Con `sed` solo no se ve,
// porque reescribir lo ya escrito no cambia el archivo.
test('aprobar un PR sin propuestas pendientes no commitea nada', { skip: process.platform === 'win32' }, () => {
  const paso = workflowStep(workflow('sign-proposal'), 'name: Sign the proposals this pull request carries')
  const repo = tempRoot('cauce-firma-nada-')
  const remoto = path.join(repo, 'remoto.git')
  const dir = path.join(repo, 'agents', 'roles', 'own', 'probe', 'learning', 'proposals')
  fs.mkdirSync(dir, { recursive: true })
  const git = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })

  git('git init -q -b main . && git -c user.email=t@t -c user.name=t commit -qm base --allow-empty')
  const base = git('git rev-parse HEAD').trim()
  fs.writeFileSync(path.join(dir, '2099-01.md'),
    propuesta('applied').replace('- Estado: pendiente', '- Estado: aplicada'))
  git('git add agents && git -c user.email=t@t -c user.name=t commit -qm ya-decidida')
  git(`git init -q --bare ${JSON.stringify(remoto)} && git remote add origin ${JSON.stringify(remoto)}`)
  const antes = git('git rev-parse HEAD').trim()

  const hecho = spawnSync('bash', ['-c', paso], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, APPROVER: 'ingeniomaps', BASE: base, GITHUB_HEAD_REF: 'main' },
  })
  assert.equal(hecho.status, 0, `aprobar un PR corriente no puede fallar: ${hecho.stderr}`)
  assert.equal(git('git rev-parse HEAD').trim(), antes, 'no se escribe un commit que no cambia nada')
  assert.match(hecho.stdout, /no hay nada que hacer/, 'y se dice, en vez de terminar en silencio')
})

// Las tres condiciones que no se pueden ejecutar acá porque son expresiones de GitHub, y que deciden
// cuándo el workflow corre. Un comentario o un «solicitar cambios» no son una aprobación.
test('sólo firma una aprobación, y sólo desde una rama de este repositorio', () => {
  const bloque = workflow('sign-proposal').split(/^  sign:$/m)[1].split(/^  [a-z-]+:$/m)[0]
  assert.match(bloque, /github\.event\.review\.state == 'approved'/, 'un comentario no firma')
  assert.match(bloque, /head\.repo\.full_name == github\.repository/, 'un fork no firma: su token no puede empujar')
  assert.match(bloque, /ref: \$\{\{ github\.event\.pull_request\.head\.ref \}\}/,
    'se trabaja sobre la rama del PR y no sobre refs/pull/N/merge, que no es una rama')
  assert.match(bloque, /APPROVER: \$\{\{ github\.event\.review\.user\.login \}\}/,
    'la identidad sale de la aprobación, que GitHub autentica')
})
