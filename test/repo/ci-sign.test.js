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

// El nombre no viaja en el payload de la review —trae `login` y nada más—, así que el paso lo consulta.
// Un `gh` falso es lo que deja medir las dos salidas de esa consulta sin salir a la red, que además ataría
// la prueba a cómo se llame hoy una cuenta ajena.
const conGh = (repo, guion) => {
  const bin = path.join(repo, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\n${guion}\n`, { mode: 0o755 })
  return `${bin}${path.delimiter}${process.env.PATH}`
}

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
    env: {
      ...process.env,
      APPROVER: 'ingeniomaps',
      BASE: base,
      BRANCH: 'main',
      // `&`, `/` y `\` son los tres metacaracteres del reemplazo de `sed`. El nombre los trae a propósito:
      // sin escaparlos, `&` pega el renglón entero de vuelta y `/` cierra el comando antes de tiempo.
      PATH: conGh(repo, "printf '%s' 'Ana & Co/Dev'"),
    },
  })
  assert.equal(hecho.status, 0, `el paso falló: ${hecho.stderr}`)

  const firmada = fs.readFileSync(path.join(dir, '2099-02.md'), 'utf8')
  assert.match(firmada, /^- Estado: aprobada$/m, 'la aprobación queda registrada')
  // El `login` es lo que se puede cruzar contra la aprobación; el nombre es lo que se lee dentro de un año.
  assert.match(firmada, /^- Responsable: @ingeniomaps \(Ana & Co\/Dev\)$/m,
    'la cuenta que aprobó y su nombre, con los metacaracteres de sed puestos tal cual')
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
    env: {
      ...process.env, APPROVER: 'ingeniomaps', BASE: base, BRANCH: 'main',
      PATH: conGh(repo, "printf '%s' 'Ana'"),
    },
  })
  assert.equal(hecho.status, 0, `aprobar un PR corriente no puede fallar: ${hecho.stderr}`)
  assert.equal(git('git rev-parse HEAD').trim(), antes, 'no se escribe un commit que no cambia nada')
  assert.match(hecho.stdout, /no hay nada que hacer/, 'y se dice, en vez de terminar en silencio')
})

// Consultar el nombre es una llamada a un tercero, así que puede no contestar: una cuenta sin nombre
// público, un token sin alcance, la API caída. El paso corre bajo `bash -e` —el default de Actions en
// Linux es `bash -e {0}`, documentado en la referencia de sintaxis de workflows—, así que sin tolerar ese
// fallo la firma entera se caería por el adorno. Por eso la prueba corre con `-e`: sin él, el `|| true`
// se puede borrar y nada se pone rojo.
test('una consulta de nombre que no contesta firma igual, con la cuenta sola',
  { skip: process.platform === 'win32' }, () => {
    const paso = workflowStep(workflow('sign-proposal'), 'name: Sign the proposals this pull request carries')
    const repo = tempRoot('cauce-firma-sin-nombre-')
    const remoto = path.join(repo, 'remoto.git')
    const dir = path.join(repo, 'agents', 'roles', 'own', 'probe', 'learning', 'proposals')
    fs.mkdirSync(dir, { recursive: true })
    const git = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })

    git('git init -q -b main . && git -c user.email=t@t -c user.name=t commit -qm base --allow-empty')
    const base = git('git rev-parse HEAD').trim()
    fs.writeFileSync(path.join(dir, '2099-01.md'), propuesta('proposed'))
    git('git add agents && git -c user.email=t@t -c user.name=t commit -qm nueva')
    git(`git init -q --bare ${JSON.stringify(remoto)} && git remote add origin ${JSON.stringify(remoto)}`)

    const hecho = spawnSync('bash', ['-e', '-c', paso], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env, APPROVER: 'ingeniomaps', BASE: base, BRANCH: 'main',
        PATH: conGh(repo, 'exit 1'),
      },
    })
    assert.equal(hecho.status, 0, `el nombre es un adorno y no puede tumbar la firma: ${hecho.stderr}`)
    assert.match(fs.readFileSync(path.join(dir, '2099-01.md'), 'utf8'),
      /^- Responsable: @ingeniomaps$/m, 'sin nombre queda la cuenta sola, no un parentesis vacio')
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
  // `GITHUB_HEAD_REF` está vacío en `pull_request_review`, y el push moría en «invalid refspec 'HEAD:'»
  // **después** de firmar y commitear bien: el fallo estaba en la última línea de un paso que hizo todo
  // lo demás. La prueba lo dejaba pasar porque le pasaba esa variable a mano.
  assert.match(bloque, /BRANCH: \$\{\{ github\.event\.pull_request\.head\.ref \}\}/,
    'la rama sale del payload, que es de donde ya salía el checkout')
  assert.equal(/GITHUB_HEAD_REF/.test(bloque.replace(/^\s*#[^\n]*$/gm, '')), false,
    'y no de una variable que este evento no setea')
})

// El PR de una propuesta lo abre el bot y no la persona, y no es una preferencia: GitHub no deja aprobar
// el propio PR, así que cuando lo abre la misma cuenta que después tendría que aprobarlo, la firma
// automática no puede dispararse y hay que escribirla a mano. Pasó con #78 y con #84.
//
// Y trae su propia puerta porque un PR abierto por el `GITHUB_TOKEN` no dispara workflows: los tres PR
// de investigación del 2026-08-29 llegaron con cero checks. Sin esto el PR nacería sin haber pasado por
// la puerta, y el guard de rutas absolutas —que ya cazó siete referencias en registros nuevos— no correría.
test('el PR lo abre el bot, y no nace sin pasar por la puerta', () => {
  const source = workflow('open-pr')
  const bloque = source.split(/^  open:$/m)[1].split(/^  [a-z-]+:$/m)[0]

  assert.match(bloque, /GH_TOKEN: \$\{\{ github\.token \}\}/,
    'lo abre el GITHUB_TOKEN, o sea el bot: la persona queda libre para aprobarlo')
  assert.match(bloque, /pull-requests: write/, 'y ése es el único permiso de escritura que pide')
  assert.equal(/contents: write/.test(bloque), false, 'no escribe el repositorio: sólo propone')

  // La puerta va antes de abrir, no después: un PR del bot no la dispara por su cuenta.
  const puerta = bloque.indexOf('npm run ci')
  const abre = bloque.indexOf('gh pr create')
  assert.ok(puerta > 0, 'corre la puerta')
  assert.ok(puerta < abre, 'y la corre antes de abrir, que es lo que evita un PR sin CI')

  // Abrir dos veces la misma rama dejaría dos PR compitiendo por la misma firma.
  assert.match(bloque, /--json state --jq \.state/, 'no abre un segundo PR sobre una rama que ya tiene uno')
})

