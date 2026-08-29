'use strict'

// Lo que un runner recibe para trabajar: `context` con la tarea que toca y su aceptación, `tree` con
// el estado a la vista, y el vocabulario con que se nombra una parada. Ninguno de los dos escribe
// nada, y eso también se comprueba: leer el estado no puede cambiarlo.

const { tempRoot, run, linkEngine, filesBelow } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../../engine/planning/parser')

test('tree --json refleja el mismo estado que la salida de texto', () => {
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')
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
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')
  const before = filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8'))
  const result = run(['context', planning])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8')), before)
})

test('tree no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')
  const before = fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8')
  const result = run(['tree', planning, '--no-color'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8'), before)
})

// Una parada sin nombre obliga a leer el estado entero para saber qué pasó, y en la salida de texto
// era indistinguible de no tener trabajo: `TASK (sin tarea disponible)` decía lo mismo con la cola
// vacía que con toda la cola trabada por una persona. El vocabulario es el que ya usan las instancias
// que venían de antes, y vive en el motor para que la prosa del protocolo no se le despegue.
test('una parada se nombra con el vocabulario del protocolo', () => {
  const P = require('../../engine/planning/parser')
  const protocolo = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'template', 'planning', 'PROTOCOL.md'), 'utf8',
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
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
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

  // Y sin tarea las acciones humanas salen igual, que es el estado de una instancia recién arrancada:
  // `onboard` deja filas pendientes y ninguna tarea. Lo destapó una corrida de `technical-design` sobre
  // su banco: siete filas pendientes y `context` no nombró ninguna.
  assert.match(sinCola.stdout, /^HUMAN\s+alta-email-nuevo: Crear la cuenta SMTP/m,
    'lo que toca es que una persona desbloquee, y eso es lo que el comando existe para decir')
})
