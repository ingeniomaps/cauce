'use strict'

// `check` contra una instancia de verdad: qué rechaza, qué avisa y qué exit code deja. Acá el
// contrato se mira desde afuera — los parsers y validadores que lo sostienen se prueban directo en
// `contracts.test.js` y sus hermanas, donde se ve *por qué* falla; acá, *que* falle.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('la plantilla canónica pasa el validador', () => {
  const result = run(['check', path.resolve(__dirname, '..', '..', 'template', 'planning')])
  assert.equal(result.status, 0, result.stderr)
})

// Una corrida real reescribió `organization/` entero: buen contenido, otras secciones. El archivo se lee
// completo y perdió cuatro dimensiones, y nadie las va a pedir después porque nada indica que faltaban.
test('check avisa cuando una dimensión del molde desapareció', () => {
  const base = tempRoot('cauce-molde-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /sin ##/, 'el molde intacto no avisa')

  const company = path.join(target, 'organization', 'company.md')
  fs.writeFileSync(company, '# Organización\n\n## Propósito\n\nGenerar catálogos.\n')
  const warned = run(['check', path.join(target, 'planning')])
  assert.equal(warned.status, 0, 'es advertencia, no error: los archivos son de la empresa')
  assert.match(warned.stderr + warned.stdout, /company\.md: sin ## De qué se trata.*y \d+ más/)

  // Agregar secciones propias no molesta: lo que se avisa es lo que se fue.
  const mold = fs.readFileSync(path.join(target, 'organization', 'product.md'), 'utf8')
  fs.writeFileSync(path.join(target, 'organization', 'product.md'), `${mold}\n## Nuestra sección\n\nAlgo.\n`)
  const withOwn = run(['check', path.join(target, 'planning')])
  assert.doesNotMatch(withOwn.stderr + withOwn.stdout, /product\.md: sin/)
})

// Cuatro corridas reales, cuatro resultados distintos: dos cubrieron todas las variables declaradas y
// dos dejaron afuera las que la conversación no tocó —entre ellas el broker por donde entran los datos—.
// Una variable sin dueño no rompe nada hoy: rompe el día que alguien tiene que desplegar.
test('check avisa por las credenciales que nadie se llevó', () => {
  const base = tempRoot('cauce-creds-')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"scripts":{"test":"x"}}')
  fs.writeFileSync(path.join(workspace, '.env.example'), 'DATABASE_URL=\nSENTRY_DSN=\n')
  assert.equal(run(['init', target, '--name', 'R', '--mode', 'sidecar', '--no-install']).status, 0)

  // Con la instancia sin arrancar no hay dónde tendrían que estar, así que no se avisa nada.
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /nadie las carga/)

  // Escrita a medias: una nombrada, la otra no.
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Organización\n\nAlgo real.\n')
  fs.appendFileSync(path.join(target, 'AGENTS.md'), '\n- DATABASE_URL: la carga el equipo de infra.\n')
  const half = run(['check', path.join(target, 'planning')])
  assert.equal(half.status, 0, 'es advertencia: no rompe el gate')
  assert.match(half.stderr + half.stdout, /declara SENTRY_DSN/)
  assert.doesNotMatch(half.stderr + half.stdout, /DATABASE_URL/, 'la que sí tiene dueño no se nombra')

  fs.appendFileSync(path.join(target, 'planning', 'HUMAN_ACTIONS.md'),
    '| sentry | pendiente | onboard | Cargar SENTRY_DSN en el entorno |\n')
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stdout, /nadie las carga/)
})

// Una corrida real dejó `epic-001.md` sin slug: el archivo estaba escrito, era una épica legítima, y
// `check` respondía «planning válido: 0 épica(s)». El silencio es peor que el rechazo — el planning se
// reporta sano mientras el trabajo que alguien escribió no existe para el sistema.
test('check no deja pasar una épica que nadie va a leer', () => {
  const base = tempRoot('cauce-invisible-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const roadmap = path.join(target, 'planning', 'roadmap')
  const epic = [
    '---', 'epic: 001', 'title: Algo', 'status: open', 'service: .', '---', '',
    '## Criterios', '', '- **C1** — Algo observable.', '',
    '## Contexto relevante', '', '- Contexto.', '',
    '## Historias', '', '- [ ] **una** (→ C1) — Hace algo. _Aceptación: pasa algo._ (service: .)', '',
  ].join('\n')

  fs.writeFileSync(path.join(roadmap, 'epic-001.md'), epic)
  const broken = run(['check', path.join(target, 'planning')])
  assert.equal(broken.status, 1, 'no puede dar verde')
  assert.match(broken.stderr, /epic-001\.md: nadie lo lee/)

  fs.renameSync(path.join(roadmap, 'epic-001.md'), path.join(roadmap, 'epic-001-algo.md'))
  const good = run(['check', path.join(target, 'planning')])
  assert.equal(good.status, 0, good.stderr)
  assert.match(good.stdout, /1 épica/)
})

test('check rechaza una tarea sin aceptación', () => {
  const base = tempRoot('cauce-invalid-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Invalid', '--mode', 'embedded']).status, 0)
  const invalidBacklog = '# Backlog\n\n## Hito demo — Demo\n\n'
    + '- [ ] **sin-aceptacion** — hacer algo (service: app)\n'
  fs.writeFileSync(path.join(target, 'planning', 'BACKLOG.md'), invalidBacklog)
  const result = run(['check', path.join(target, 'planning')])
  assert.notEqual(result.status, 0)
})

test('check --json entrega estado consumible y conserva el exit code', () => {
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')
  const valid = run(['check', planning, '--json'])
  assert.equal(valid.status, 0, valid.stderr)
  const report = JSON.parse(valid.stdout)
  assert.equal(report.ok, true)
  assert.deepEqual(report.errors, [])
  for (const field of ['epics', 'queued', 'done']) assert.equal(typeof report[field], 'number')

  const base = tempRoot('cauce-json-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Json', '--mode', 'embedded']).status, 0)
  fs.writeFileSync(
    path.join(target, 'planning', 'BACKLOG.md'),
    '# Backlog\n\n## Hito demo — Demo\n\n- [ ] **sin-aceptacion** — hacer algo (service: app)\n',
  )
  const invalid = run(['check', path.join(target, 'planning'), '--json'])
  assert.equal(invalid.status, 1)
  const failed = JSON.parse(invalid.stdout)
  assert.equal(failed.ok, false)
  assert.ok(failed.errors.some((error) => error.includes('sin-aceptacion')))
})

// Un tag desconocido no matchea el contrato de tarea, así que la tarea desaparecía de la cola. Ahora
// falla, y dice cuál es el vocabulario en vez de mandar a comparar la línea contra un regex.
test('un lane que no existe se nombra, no se descarta', () => {
  const base = tempRoot('cauce-lane-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [urgente] — Crear la cuenta. _Aceptación: 201 y login._ (service: api)
`)
  const result = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.equal(result.ok, false)
  assert.ok(
    result.errors.some((error) => /lane "urgente" no existe; usá express \| directo \| lite \| full/.test(error)),
    `el error nombra el lane y el vocabulario: ${JSON.stringify(result.errors)}`,
  )
})

// Las dos formas en que la aceptación le llega a un runner —propia y heredada del criterio— porque
// una sola deja pasar la otra, y `context` entrega la misma frase en los dos casos.
test('una tarea no se toma con la aceptación sin decidir', () => {
  const base = tempRoot('cauce-acept-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
  const epica = (criterio) => fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-alta.md'), `---
epic: 001
title: Alta de cuenta
status: open
service: api
---

## Criterios

- **C1** — ${criterio}

## Contexto relevante

- \`api/src/auth.js\` ya valida el formato.

## Historias

- [ ] **alta-nueva** (→ C1) — Crear la cuenta. (service: api)

## Riesgos y decisiones humanas

- Ninguno.
`)
  const backlog = (linea) => fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

${linea}
`)
  const errores = () => JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /BACKLOG alta-nueva/.test(error))

  epica('Un alta con email nuevo devuelve 201.')
  backlog('- [ ] **alta-nueva** [lite] — Crear la cuenta. _Aceptación: 201 y login._ (service: api)')
  assert.deepEqual(errores(), [], 'una aceptación decidida pasa')

  backlog('- [ ] **alta-nueva** [lite] — Crear la cuenta. _Aceptación: Por definir._ (service: api)')
  assert.deepEqual(errores(),
    ['BACKLOG alta-nueva: la aceptación no está decidida — "Por definir."'])

  // Heredada: la tarea no escribe aceptación y el criterio que cita todavía no decidió nada.
  epica('El umbral de reintentos: por definir.')
  backlog('- [ ] **alta-nueva** [lite] — Crear la cuenta. (→ C1) (epic: 001) (service: api)')
  assert.deepEqual(errores(),
    ['BACKLOG alta-nueva: la aceptación no está decidida — "El umbral de reintentos: por definir."'])

  // Y con el criterio resuelto, la misma tarea heredada pasa.
  epica('Un alta con email nuevo devuelve 201.')
  assert.deepEqual(errores(), [])
})

// El fixture escribe el plan con viñetas en vez de pasos numerados: cuenta cero, que es el estado que
// se lee igual que un plan terminado. Por qué eso rompe la recuperación, en `validateState`.
test('un WIP activo sin pasos contables es un error', () => {
  const base = tempRoot('cauce-wip-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. _Aceptación: 201 y login._ (service: api)
`)
  const wip = (plan) => fs.writeFileSync(path.join(planning, 'WIP.md'), `---
task: alta-email-nuevo
hito: "alta — Alta de cuenta"
epic: 001
phase: Build
started: 2026-08-22
service: api
acceptance: "201 y login"
---

## Plan aprobado
${plan}
`)
  const errores = () => JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /^WIP /.test(error))

  wip('1. [x] Prueba roja\n2. [ ] Implementar')
  assert.deepEqual(errores(), [], 'el plan numerado pasa')

  wip('- [x] Prueba roja\n- [ ] Implementar')
  assert.deepEqual(errores(),
    ['WIP alta-email-nuevo: el plan no tiene pasos que el motor pueda contar; se escriben `1. [ ] paso`'])

  wip('El plan es obvio.')
  assert.equal(errores().length, 1, 'un plan sin pasos tampoco sirve para retomar')

  fs.writeFileSync(path.join(planning, 'WIP.md'), 'status: IDLE\n')
  assert.deepEqual(errores(), [], 'el WIP inactivo no tiene plan que contar')
})
