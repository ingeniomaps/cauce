'use strict'

// Validar y recorrer el planning por el CLI: `check`, `tree`, `context` y `archive`. Es la familia de
// comandos de `engine/cli/planning.js`.
//
// Acá el contrato se mira desde afuera, con una instancia de verdad y su exit code. Los parsers y los
// validadores que lo sostienen se prueban directo en `contracts.test.js`.

const { filesBelow, tempRoot, run, linkEngine } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('la plantilla canónica pasa el validador', () => {
  const result = run(['check', path.resolve(__dirname, '..', 'template', 'planning')])
  assert.equal(result.status, 0, result.stderr)
})

// Desinstalar a mano es borrar `ops/` y descubrir después que cada llamada de herramienta ejecuta un
// guard que ya no está; la otra salida —borrar `.claude/` entero— se lleva puesto lo del usuario. Se
// quita lo que Cauce entregó y sigue igual que como lo entregó, y nada más.
// Borrar una instancia era una lista de pasos a mano, y una lista se ejecuta a medias: si la carpeta se
// va antes que el wiring, cada llamada de herramienta del runner queda ejecutando un guard que no está.
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
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
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

test('tree --json refleja el mismo estado que la salida de texto', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const result = run(['tree', planning, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(result.stdout)
  for (const field of ['roadmap', 'backlog']) assert.ok(Array.isArray(state[field]))
  assert.equal(state.wip, null)
  assert.equal(typeof state.done, 'number')
  for (const bucket of ['deuda', 'ideas', 'propuestas', 'lecciones']) {
    assert.equal(typeof state.inbox[bucket], 'number')
  }
  const text = run(['tree', planning, '--no-color'])
  assert.match(text.stdout, new RegExp(`DONE\\s+${state.done} tareas`))
})

test('context entrega el contexto mínimo y respeta la precedencia del protocolo', () => {
  const base = tempRoot('cauce-context-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Context', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar contexto
status: active
service: app
---

# Épica 001 — Demostrar contexto

## Criterios

- **C1** — El resultado se observa.
- **C2** — El segundo criterio no se pide.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **primera** (→ C1) — Entregar resultado. (service: app)
- [ ] **segunda** (→ C2) — Otro resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **primera** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
- [ ] **segunda** [lite] — Otro resultado. (→ C2) (service: app) (epic: 001)
`)

  const queued = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(queued.task.slug, 'primera')
  assert.deepEqual(queued.criteria.map((criterion) => criterion.id), ['C1'], 'sólo el criterio citado')
  assert.equal(queued.wip, null)
  assert.equal(queued.blocked, '')

  fs.writeFileSync(path.join(planning, 'WIP.md'), `---
task: segunda
hito: "demo — Demo"
epic: 001
phase: Build
service: app
---

## Plan aprobado
1. [x] Escribir prueba
2. [ ] Implementar
`)
  const active = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(active.task.slug, 'segunda', 'el WIP activo manda sobre el orden del backlog')
  assert.deepEqual(active.wip, { phase: 'Build', complete: 1, pending: 1 })

  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| tercera | pendiente | Ready | Definir el proveedor antes de estimar |
| vieja | resuelta | Ready | Ya se decidió |
`)
  const blockers = JSON.parse(run(['context', planning, '--json']).stdout).humanActions
  assert.deepEqual(blockers.map((action) => action.task), ['tercera'], 'las resueltas no bloquean')

  // Un estado que el motor no entiende bloquea la tarea igual que uno pendiente —es el lado seguro—,
  // pero deja de hacerlo en silencio: `check` lo nombra con el vocabulario que sí acepta.
  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| primera | ✅ COMPLETADO 2026-08-10 | Ready | Ya se hizo |
`)
  const inventado = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.equal(inventado.ok, false, 'un estado fuera del vocabulario es un error, no un silencio')
  assert.ok(
    inventado.errors.some((error) => /HUMAN_ACTIONS primera: estado .* fuera de pendiente \| resuelta/.test(error)),
    `el error nombra la fila y el vocabulario: ${JSON.stringify(inventado.errors)}`,
  )
  assert.deepEqual(
    JSON.parse(run(['context', planning, '--json']).stdout).humanActions.map((action) => action.task),
    ['primera'],
    'y mientras tanto sigue bloqueando: no se da por resuelta una fila que no se entiende',
  )

  fs.writeFileSync(path.join(planning, 'WIP.md'), 'status: IDLE\n')
  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| primera | pendiente | Ready | Definir el proveedor antes de estimar |
`)
  const skipping = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(skipping.task.slug, 'segunda', 'salta la tarea con acción humana abierta')
  assert.deepEqual(skipping.blockedTasks, ['primera'])
  assert.equal(skipping.acceptance, undefined)
  assert.equal(skipping.task.acceptance, 'El segundo criterio no se pide.', 'hereda el texto del criterio citado')

  fs.writeFileSync(path.join(planning, 'AWAITING_REVIEW.md'), '# Checkpoint\n\nRevisar el hito demo.\n')
  const gated = run(['context', planning])
  assert.equal(gated.status, 0, gated.stderr)
  assert.match(gated.stdout, /^BLOCKED\s+awaiting-review — Revisar el hito demo\.$/m)
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).blocked, 'awaiting-review')
})

// El lane dice cuántas perspectivas merece una tarea y el cast cuáles: son la misma decisión de
// clasificación vista de los dos lados, y por eso viajan juntas en la línea. Escritas ahí se deciden
// una vez y quedan auditables antes de ejecutar, en vez de derivarse en cada corrida y tirarse al
// terminar —que es lo que hacía la fase Cast, y costaba una llamada por tarea—.
test('la línea de tarea lleva su lane y su cast, y los dos siguen siendo opcionales', () => {
  const base = tempRoot('cauce-cast-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Cast', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const backlog = (task) => fs.writeFileSync(
    path.join(planning, 'BACKLOG.md'), `# Backlog\n\n## Hito demo — Demo\n\n${task}\n`,
  )

  // Toda tarea escrita antes de que el cast existiera sigue siendo válida: sin clasificar es un
  // estado legítimo —es el que dispara al clasificador—, no un error de contrato.
  backlog('- [ ] **sin-clasificar** — Otro resultado. _Aceptación: observable._ (service: app)')
  assert.equal(run(['check', planning]).status, 0, 'una tarea sin clasificar sigue siendo válida')
  const plain = JSON.parse(run(['context', planning, '--json']).stdout).task
  assert.equal(plain.tier, '')
  assert.deepEqual(plain.cast, { build: '', review: [] }, 'sin cast, pero con la forma puesta')

  backlog('- [ ] **con-cast** [express] — Cambiar el literal. _Aceptación: dice verde._ '
    + '(service: app) (cast: frontend-engineer → ui-designer, qa-engineer)')
  assert.equal(run(['check', planning]).status, 0)
  const classified = JSON.parse(run(['context', planning, '--json']).stdout).task
  assert.equal(classified.tier, 'express', 'el cuarto lane existe')
  assert.deepEqual(classified.cast, { build: 'frontend-engineer', review: ['ui-designer', 'qa-engineer'] })
  assert.match(run(['context', planning]).stdout, /CAST\s+frontend-engineer → ui-designer, qa-engineer/)

  // Un cargo mal escrito no tiene por qué frenar la corrida en la fase que lo invoca: ahí ya se
  // gastó todo lo anterior. Un slug que el catálogo no resuelve se queda sin revisor en silencio,
  // que es la forma de perder la revisión sin que nada falle.
  backlog('- [ ] **cast-fantasma** [directo] — Cambiar el literal. _Aceptación: dice verde._ '
    + '(service: app) (cast: frontend-enginer)')
  const ghost = run(['check', planning])
  assert.equal(ghost.status, 1, 'un cargo que no existe es un error de contrato')
  assert.match(ghost.stderr, /frontend-enginer/)
})

test('context no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8'))
  const result = run(['context', planning])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8')), before)
})

test('tree no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8')
  const result = run(['tree', planning, '--no-color'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8'), before)
})

test('valida y archiva el ciclo completo de una épica', () => {
  const base = tempRoot('cauce-cycle-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Cycle', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const config = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: 'app' }]
  fs.writeFileSync(path.join(target, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar ciclo
status: active
service: app
---

# Épica 001 — Demostrar ciclo

## Criterios

- **C1** — El resultado se observa.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **demostrar-ciclo** (→ C1) — Entregar resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **demostrar-ciclo** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
`)
  assert.equal(run(['check', planning]).status, 0)

  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(planning, 'DONE.md'), `# Done

## Hito demo — Demo

- [x] **demostrar-ciclo** (epic: 001) — Entregado
  acept: el resultado se observa
  done: node --test terminó con exit code 0
  qa: recorrido real observado con exit code 0
  tests: C1 → node --test test/demo.test.js
  commit: abc1234 feat(app): demonstrate cycle (app@feat/demo)
`)
  const epicPath = path.join(planning, 'roadmap', 'epic-001-demo.md')
  fs.writeFileSync(epicPath, fs.readFileSync(epicPath, 'utf8').replace('status: active', 'status: closed'))
  assert.equal(run(['check', planning]).status, 0)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.equal(fs.existsSync(path.join(planning, 'done', 'epic-001.md')), true)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)

  const archived = fs.readFileSync(path.join(planning, 'done', 'epic-001.md'), 'utf8')
  const recoveredEntry = archived.match(/- \[x\] \*\*demostrar-ciclo\*\*[\s\S]*$/m)[0]
  fs.appendFileSync(path.join(planning, 'DONE.md'), `\n${recoveredEntry}\n`)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)
})

// Las filas resueltas nunca llegan a un modelo —`ops context` ya las excluye—, así que archivarlas no
// ahorra contexto: mantiene legible el archivo que una persona tiene que curar. Por eso el disparador
// es el estado y no una fecha, y por eso el destino es el mismo `done/` que ya guarda evidencia.
test('archive human-actions saca las filas resueltas y conserva todo lo demás', () => {
  const base = tempRoot('cauce-archive-ha-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', 'template', 'planning'), planning, { recursive: true })
  const archivo = path.join(planning, 'HUMAN_ACTIONS.md')
  const original = fs.readFileSync(archivo, 'utf8')
  fs.writeFileSync(archivo, original.replace(
    /(\|---\|---\|---\|---\|\n)/,
    '$1| alta-smtp | resuelta 2026-08-17 | Ready | Se creó la cuenta. |\n'
    + '| pago-plan | pendiente | QA | Aprobar el gasto del plan pago. |\n'
    + '| dns-staging | resuelta | Verify | Se apuntó el registro. |\n',
  ))

  const result = run(['archive', planning, 'human-actions'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /2 fila\(s\) archivadas/)

  const quedo = fs.readFileSync(archivo, 'utf8')
  assert.match(quedo, /^\| pago-plan \| pendiente \|/m, 'la pendiente se queda')
  assert.doesNotMatch(quedo, /alta-smtp|dns-staging/, 'las resueltas se van')
  assert.ok(quedo.includes('| Tarea | Estado | Origen |'), 'el encabezado de la tabla sobrevive')
  assert.ok(quedo.includes('vocabulario cerrado'), 'y la prosa que explica el archivo también')
  assert.ok(quedo.includes('slug-de-tarea'), 'y el ejemplo comentado, que no es una fila real')

  const historial = fs.readFileSync(path.join(planning, 'done', 'human-actions.md'), 'utf8')
  assert.match(historial, /^\| alta-smtp \| resuelta 2026-08-17 \| Ready \| Se creó la cuenta\. \|$/m)
  assert.match(historial, /^\| dns-staging \| resuelta \| Verify \|/m)
  assert.ok(historial.includes('| Tarea | Estado | Origen |'), 'el historial se lee solo')

  // Segunda corrida: no hay nada que mover y no se toca ningún archivo.
  const otra = run(['archive', planning, 'human-actions'])
  assert.equal(otra.status, 0, otra.stderr)
  assert.match(otra.stdout, /no hay filas resueltas/)
  assert.equal(fs.readFileSync(archivo, 'utf8'), quedo)

  // Y lo archivado se acumula en vez de reemplazarse.
  fs.appendFileSync(archivo, '| cuenta-meta | resuelta | Ready | Se habilitó el acceso. |\n')
  assert.equal(run(['archive', planning, 'human-actions']).status, 0)
  const segundo = fs.readFileSync(path.join(planning, 'done', 'human-actions.md'), 'utf8')
  for (const slug of ['alta-smtp', 'dns-staging', 'cuenta-meta']) {
    assert.ok(segundo.includes(slug), `${slug} sigue en el historial`)
  }
  assert.equal((segundo.match(/^\| Tarea \| Estado/gm) || []).length, 1, 'un solo encabezado')
  // Una copia pelada de `planning/` no es una instancia —le falta `integrations/config.json`—, así que
  // se juzga lo que este comando toca y no el exit code entero.
  const validacion = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.deepEqual(
    validacion.errors.filter((error) => /HUMAN_ACTIONS|human-actions/.test(error)), [],
    'lo que quedó y lo que se archivó siguen siendo válidos',
  )
})

// El lane estaba escrito en cuatro lugares y ninguno era el dueño: el regex del parser, el contrato y
// las descripciones del PROTOCOL, y dos schemas más el prompt del clasificador en el workflow. Un
// workflow corre en sandbox y no puede importar el motor, así que la única atadura posible es ésta:
// el motor manda y el test falla cuando una copia se despega.
test('el vocabulario de lanes tiene un dueño y las copias no se despegan', () => {
  const P = require('../engine/planning/parser')
  assert.deepEqual(P.LANES, ['express', 'directo', 'lite', 'full'], 'en orden de ceremonia creciente')

  const raiz = path.resolve(__dirname, '..')
  const protocolo = fs.readFileSync(path.join(raiz, 'template', 'planning', 'PROTOCOL.md'), 'utf8')
  assert.ok(protocolo.includes(`[${P.LANES.join('|')}]`), 'el contrato de tarea enumera los lanes')
  const seccion = protocolo.split(/^##\s+/m).find((parte) => /^Lanes/.test(parte))
  const descritos = [...seccion.matchAll(/^- `([a-z]+)`/gm)].map((match) => match[1])
  assert.deepEqual(descritos, P.LANES, 'y cada uno tiene su criterio escrito, en el mismo orden')

  const workflow = fs.readFileSync(path.join(raiz, 'automatization', 'workflows', 'autobuild.js'), 'utf8')
  const enums = [...workflow.matchAll(/enum:\s*\[([^\]]*)\]/g)]
    .map((match) => match[1].split(',').map((item) => item.trim().replace(/^'|'$/g, '')))
    .filter((values) => values.includes('express'))
  assert.equal(enums.length, 2, 'los dos schemas que aceptan un lane')
  for (const values of enums) {
    assert.deepEqual(values.filter(Boolean), P.LANES, 'cada schema enumera los mismos lanes')
  }
  for (const lane of P.LANES) {
    assert.ok(workflow.includes(`\`${lane}\``), `el prompt del clasificador nombra ${lane}`)
  }
})

// Un tag desconocido no matchea el contrato de tarea, así que la tarea desaparecía de la cola. Ahora
// falla, y dice cuál es el vocabulario en vez de mandar a comparar la línea contra un regex.
test('un lane que no existe se nombra, no se descarta', () => {
  const base = tempRoot('cauce-lane-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', 'template', 'planning'), planning, { recursive: true })
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

// Una parada sin nombre obliga a leer el estado entero para saber qué pasó, y en la salida de texto
// era indistinguible de no tener trabajo: `TASK (sin tarea disponible)` decía lo mismo con la cola
// vacía que con toda la cola trabada por una persona. El vocabulario es el que ya usan las instancias
// que venían de antes, y vive en el motor para que la prosa del protocolo no se le despegue.
test('una parada se nombra con el vocabulario del protocolo', () => {
  const P = require('../engine/planning/parser')
  const protocolo = fs.readFileSync(
    path.resolve(__dirname, '..', 'template', 'planning', 'PROTOCOL.md'), 'utf8',
  )
  const seccion = protocolo.split(/^##\s+/m).find((parte) => /^Razones de parada/.test(parte))
  assert.ok(seccion, 'PROTOCOL.md documenta las razones de parada')
  const documentadas = [...seccion.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((match) => match[1])
  assert.deepEqual(
    [...new Set(documentadas)].sort(),
    [...P.STOP_REASONS].sort(),
    'la prosa y el motor enumeran el mismo vocabulario',
  )

  const base = tempRoot('cauce-parada-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', 'template', 'planning'), planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. _Aceptación: 201 y login._ (service: api)
`)

  const vacio = run(['context', planning])
  assert.match(vacio.stdout, /^TASK\s+alta-email-nuevo/m, 'sin bloqueos, entrega la tarea')

  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| alta-email-nuevo | pendiente | Ready | Crear la cuenta SMTP y dejar el token en \`.env\`. |
`)
  const trabado = run(['context', planning])
  assert.match(trabado.stdout, /^BLOCKED\s+blocked-on-human — alta-email-nuevo: Crear la cuenta SMTP/m)
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).blocked, 'blocked-on-human')

  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog promovido\n')
  const sinCola = run(['context', planning])
  assert.match(sinCola.stdout, /^TASK\s+\(sin tarea disponible\)/m,
    'la cola vacía sigue siendo otra cosa que una cola trabada')
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).blocked, '')

  // Y sin tarea las acciones humanas salen igual. Estaban después del `return`, así que una instancia
  // recién arrancada —`onboard` deja filas pendientes y ninguna tarea— contestaba «sin tarea
  // disponible» y se tragaba lo único que había para hacer. Lo destapó una corrida de `technical-design`
  // sobre su banco: siete filas pendientes y `context` no nombró ninguna.
  assert.match(sinCola.stdout, /^HUMAN\s+alta-email-nuevo: Crear la cuenta SMTP/m,
    'lo que toca es que una persona desbloquee, y eso es lo que el comando existe para decir')
})

// Las dos formas en que la aceptación le llega a un runner —propia y heredada del criterio— porque
// una sola deja pasar la otra, y `context` entrega la misma frase en los dos casos.
test('una tarea no se toma con la aceptación sin decidir', () => {
  const base = tempRoot('cauce-acept-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', 'template', 'planning'), planning, { recursive: true })
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

// La tabla del README enumera las piezas de planning, y una tabla completa afirma completitud aunque
// ninguna frase lo diga: `reports/` existía con su propio README y no figuraba, así que nadie iba a
// pedir después lo que nada indicaba que faltara.
test('el README de planning enumera todas las piezas que existen', () => {
  const raiz = path.resolve(__dirname, '..', 'template', 'planning')
  const readme = fs.readFileSync(path.join(raiz, 'README.md'), 'utf8')
  const piezas = fs.readdirSync(raiz, { withFileTypes: true })
    .filter((entry) => entry.name !== 'README.md' && !entry.name.startsWith('.'))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  for (const pieza of piezas) {
    assert.ok(readme.includes(`\`${pieza}\``), `README no menciona ${pieza}`)
  }
})

// El fixture escribe el plan con viñetas en vez de pasos numerados: cuenta cero, que es el estado que
// se lee igual que un plan terminado. Por qué eso rompe la recuperación, en `validateState`.
test('un WIP activo sin pasos contables es un error', () => {
  const base = tempRoot('cauce-wip-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', 'template', 'planning'), planning, { recursive: true })
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

// Una plantilla existe para copiarse, así que no puede traer nada que haya que borrar para que la copia
// funcione. La guía sobre el marcador de ambigüedad contenía el marcador, y toda épica nacida de acá
// fallaba al activarse por un renglón de instrucciones. La guía vive en el README, que no se copia.
test('una copia de la plantilla de épica se activa tal cual', () => {
  const base = tempRoot('cauce-plantilla-epica-')
  const planning = path.join(base, 'planning')
  const molde = path.resolve(__dirname, '..', 'template', 'planning')
  fs.cpSync(molde, planning, { recursive: true })

  const plantilla = fs.readFileSync(path.join(molde, 'roadmap', 'epic-000-template.md'), 'utf8')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-alta.md'), plantilla
    .replace(/^epic: 000$/m, 'epic: 001')
    .replace(/^status: template$/m, 'status: active')
    .replace(/^title: .*$/m, 'title: Alta de cuenta'))
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **slug-de-historia** [lite] — x. (→ C1) (epic: 001) (service: ruta)
- [ ] **slug-del-borde** [lite] — x. (→ C2) (epic: 001) (service: ruta)
`)
  const errores = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /epic-001|BACKLOG/.test(error))
  assert.deepEqual(errores, [], 'la copia no arrastra nada que haya que borrar')
})

// El README declara qué rango vive en cada archivo para no tener que grepear, y un rango que envejece
// es peor que ninguno: manda a buscar una regla donde ya no está. Se contrasta contra los archivos.
test('los rangos que declara el README de reglas son los que hay', () => {
  const rules = path.resolve(__dirname, '..', 'template', 'planning', 'rules')
  const readme = fs.readFileSync(path.join(rules, 'README.md'), 'utf8')
  const declarado = [...readme.matchAll(/^- `system\/([a-z-]+\.md)` — ([^:]+):/gm)]
  assert.ok(declarado.length >= 4, 'el README declara un rango por archivo del sistema')

  const expandir = (texto) => texto.split(',').flatMap((parte) => {
    const rango = parte.trim().match(/^R(\d+)\.\.R(\d+)$/)
    if (!rango) return [parte.trim()]
    const desde = Number(rango[1])
    return Array.from({ length: Number(rango[2]) - desde + 1 }, (_, paso) => `R${desde + paso}`)
  })

  const cubiertos = new Set()
  for (const [, archivo, rango] of declarado) {
    const reales = [...fs.readFileSync(path.join(rules, 'system', archivo), 'utf8')
      .matchAll(/^##\s+(R\d+)\s+[—-]/gm)].map((match) => match[1])
    assert.deepEqual(expandir(rango).sort(), reales.sort(), `el rango de ${archivo} no es el que hay`)
    for (const id of reales) cubiertos.add(id)
  }

  // Y ningún archivo del sistema queda sin declarar.
  const archivos = fs.readdirSync(path.join(rules, 'system')).filter((name) => name.endsWith('.md'))
  assert.equal(declarado.length, archivos.length, 'cada archivo del sistema tiene su línea')
  assert.equal(cubiertos.size, 22, 'las veintidós reglas están declaradas en alguna línea')
})

// La misma lección que la plantilla de épica: lo que se copia no puede traer algo que haya que borrar
// para que la copia valga. El molde de ADR traía el menú de estado entero, y tres decisiones reales se
// publicaron con él intacto.
test('una copia de la plantilla de ADR se valida tal cual', () => {
  const base = tempRoot('cauce-plantilla-adr-')
  const planning = path.join(base, 'planning')
  const molde = path.resolve(__dirname, '..', 'template', 'planning')
  fs.cpSync(molde, planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'adr', '001-algo.md'),
    fs.readFileSync(path.join(molde, 'adr', '000-template.md'), 'utf8'))

  const errores = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /adr\//.test(error))
  assert.deepEqual(errores, [], 'la copia nace válida y en Propuesto')
})
