'use strict'

// Lo que un runner recibe para trabajar: `context` con la tarea que toca y su aceptación, `tree` con
// el estado a la vista, y el vocabulario con que se nombra una parada. Ninguno de los dos escribe
// nada, y eso también se comprueba: leer el estado no puede cambiarlo.

const { tempRoot, run, linkEngine, filesBelow, wipPath, writeWip } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')


test('tree --json refleja el mismo estado que la salida de texto', () => {
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')
  const result = run(['tree', planning, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(result.stdout)
  for (const field of ['roadmap', 'backlog']) assert.ok(Array.isArray(state[field]))
  assert.deepEqual(state.wip, [], 'sin ningún runner trabajando, la lista de planes va vacía')
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

  writeWip(planning, `---
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

  fs.rmSync(wipPath(planning), { force: true })
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

// Las cuatro cosas que hay que ver de una sección que viaja: que salga en el texto, que salga en el
// JSON, que no arrastre su encabezado y que termine donde termina. Las dos últimas son las que un
// `section()` mal recortado rompe sin que nada más se note. `readEpics` dice por qué viaja.
test('el contexto de la épica llega a quien ejecuta la tarea', () => {
  const base = tempRoot('cauce-ctx-epica-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-catalogo.md'), `---
epic: 001
title: Catálogo canónico
status: active
service: api
---

# Épica 001 — Catálogo canónico

## Resultado

El proveedor puede marcar si su oferta compite.

## Criterios

- **C1** — Cuando el proveedor cambia la marca, la oferta queda marcada.

## Contexto relevante

- Sin esa marca el ruteo no distingue a quién ofrecerle una orden ajena.

## Historias

- [ ] **marcar-oferta** (→ C1) — Incremento. _Aceptación: la oferta declara si compite._ (service: api)
`)
  fs.appendFileSync(path.join(planning, 'BACKLOG.md'), '\n## Hito catalogo — Catálogo\n\n'
    + '- [ ] **marcar-oferta** [lite] — La oferta declara si compite. (→ C1) (epic: 001) (service: api)\n')

  const salida = run(['context', planning]).stdout
  assert.match(salida, /CTX\s+- Sin esa marca el ruteo no distingue/, 'la sección viaja en la salida de texto')
  const json = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.match(json.epic.context, /Sin esa marca el ruteo/)
  assert.doesNotMatch(json.epic.context, /Contexto relevante/, 'el encabezado no es contenido')
  assert.doesNotMatch(json.epic.context, /Historias|Criterios/, 'y la sección termina donde termina')
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
  // La cola, que es el archivo de estado que el molde sí trae: los planes viven en `wip/` y no viajan,
  // así que en el molde no hay ninguno que mirar.
  const cola = path.join(planning, 'BACKLOG.md')
  const before = fs.readFileSync(cola, 'utf8')
  const result = run(['tree', planning, '--no-color'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(cola, 'utf8'), before)
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

// El texto de la aceptación se delimita con las cursivas de markdown, y un identificador con guión
// bajo tiene los mismos caracteres que ese delimitador. La primera versión del lector cortaba en el
// primer `_` que encontraba: `_Aceptación: MAX_ATTEMPTS vale 5._` devolvía `MAX`, `check` pasaba en
// verde, y quien tomaba la tarea construía contra tres letras. Markdown ya resuelve esto —un `_`
// entre caracteres de palabra no abre ni cierra énfasis— y el lector tiene que resolverlo igual.
test('la aceptación con un identificador adentro llega entera', () => {
  const base = tempRoot('cauce-acceptance-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Aceptación', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const backlog = (task) => fs.writeFileSync(
    path.join(planning, 'BACKLOG.md'), `# Backlog\n\n## Hito demo — Demo\n\n${task}\n`,
  )
  const acceptance = () => JSON.parse(run(['context', planning, '--json']).stdout).task.acceptance

  backlog('- [ ] **tope** [express] — Subir el tope. '
    + '_Aceptación: `MAX_ATTEMPTS` vale 5 y el reintento se rinde al quinto._ (service: app)')
  assert.equal(run(['check', planning]).status, 0)
  assert.equal(acceptance(), '`MAX_ATTEMPTS` vale 5 y el reintento se rinde al quinto.')

  // El identificador pegado al cierre es el borde: ahí el `_` que delimita y el que separa palabras
  // son vecinos, y quedarse con el primero deja la aceptación partida por la mitad.
  backlog('- [ ] **tope** [express] — Subir el tope. '
    + '_Aceptación: el tope lo fija MAX_ATTEMPTS_ (service: app)')
  assert.equal(acceptance(), 'el tope lo fija MAX_ATTEMPTS')
})

// Por qué una ausencia no puede contestar como una cola vacía está en `assertPlanning`. Acá se mide que
// los dos comandos que leen el planning sin validarlo fallen y digan cuál es la ruta: `check` y
// `evidence` ya fallaban cada uno por su cuenta, así que no entran.
test('un planning que no se puede leer no contesta como uno vacío', () => {
  const base = tempRoot('cauce-context-ausente-')

  for (const comando of ['context', 'tree']) {
    // La ruta que no existe, que es el caso que originó esto: en sidecar, `<empresa>-ops/planning`
    // escrito desde adentro de la raíz resuelve a `<empresa>-ops/<empresa>-ops/planning`.
    const ausente = path.join(base, 'ops', 'ops', 'planning')
    const noExiste = run([comando, ausente, '--json'])
    assert.notEqual(noExiste.status, 0, `${comando} sobre una ruta inexistente tiene que fallar`)
    assert.equal(noExiste.stdout.trim(), '', `${comando} no imprime un estado que se lea como válido`)
    // La ruta **resuelta**, porque el error que esto ataca es de resolución: decir la que se escribió
    // devuelve la pregunta a quien ya la hizo mal.
    assert.match(noExiste.stderr, new RegExp(path.resolve(ausente).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')),
      `${comando} nombra la ruta resuelta: ${noExiste.stderr}`)

    // Y existir no alcanza: un directorio cualquiera contestaba cola vacía igual de bien.
    const vacio = path.join(base, `dir-${comando}`)
    fs.mkdirSync(vacio, { recursive: true })
    const sinBacklog = run([comando, vacio, '--json'])
    assert.notEqual(sinBacklog.status, 0, `${comando} sobre un directorio sin BACKLOG.md tiene que fallar`)
    assert.match(sinBacklog.stderr, /BACKLOG\.md/, `y decir qué falta: ${sinBacklog.stderr}`)
  }

  // Lo que no debe cambiar: un planning de verdad y sin trabajo en cola sigue contestando cola vacía,
  // que es la mitad legítima de la distinción.
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Ausente', '--mode', 'sidecar']).status, 0)
  const bueno = run(['context', path.join(target, 'planning'), '--json'])
  assert.equal(bueno.status, 0, `un planning recién creado se lee sin error: ${bueno.stderr}`)
  assert.equal(JSON.parse(bueno.stdout).queued, 0, 'y su cola está vacía, que es un estado válido')
})

// `autobuild` dejó de promover una épica al BACKLOG —`open` es «candidata editable que aún no fue
// promovida», así que pegarla es promoverla, y BR-OPS-002 la deja fuera hasta que la apruebe una
// persona—. Lo que queda es nombrarla, igual que se nombra una recurrencia vencida: sin esto, quien
// corre el recorrido ve «sin tarea disponible» y no sabe que lo que sigue es promover.
test('sin cola, context nombra la próxima épica sin promover', () => {
  const base = tempRoot('cauce-next-epic-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Next', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const epica = (num, status) => fs.writeFileSync(
    path.join(planning, 'roadmap', `epic-${num}-demo.md`),
    `---\nepic: ${num}\ntitle: Épica ${num}\nstatus: ${status}\nservice: app\n---\n\n`
    + `# Épica ${num} — Épica ${num}\n\n## Criterios\n\n- **C1** — Se observa.\n\n`
    + `## Contexto relevante\n\n- Vive en app/.\n\n## Historias\n\n`
    + `- [ ] **h-${num}** (→ C1) — Hacer algo. (service: app)\n`,
  )
  epica('003', 'open')
  epica('002', 'closed')

  const sinCola = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(sinCola.task, null, 'el escenario es sin tarea en cola')
  assert.equal(sinCola.nextEpic && sinCola.nextEpic.num, '003', 'la próxima open, no la cerrada')
  assert.match(run(['context', planning]).stdout, /^EPIC\s+003:.*sin promover$/m,
    'y se ve sin pedir --json, que es como se lee en una corrida')

  // Con trabajo en cola no dice nada: la épica que sigue no le habla a quien va a tomar una tarea, y un
  // aviso que sale siempre deja de leerse. Que aparezca es la señal.
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'),
    '# Backlog\n\n## Hito demo — Demo\n\n- [ ] **h-003** [full] — Hacer algo. (→ C1) (service: app) (epic: 003)\n')
  const conCola = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(conCola.task.slug, 'h-003', 'ahora sí hay tarea')
  assert.equal(conCola.nextEpic, null, 'y la épica deja de nombrarse')
})

// Por qué el WIP lleva el carril, en `parseWip`. Acá se fijan las dos direcciones, que separadas no
// dicen nada: que declarado sobreviva, y que **sin** declarar siga vacío. Sin la segunda, un default
// cualquiera —el primero de la lista, el de la tarea de al lado— pasaría la primera y estaría inventando
// un dato que después se lee como registro.
test('el carril sobrevive a reanudar una corrida sobre el WIP', () => {
  const planning = path.join(tempRoot('cauce-lane-wip-'), 'planning')
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
  linkEngine(path.dirname(planning))
  // La tarea ya no está en la cola, que es exactamente el estado en el que se cierra: la línea se borró.
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog\n\n## Hito demo — Demo\n')

  writeWip(planning, `---
task: alta
hito: "demo — Demo"
phase: Done
service: app
lane: express
---

## Plan aprobado
1. [x] Implementar
`)
  const conCarril = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(conCarril.task.slug, 'alta')
  assert.equal(conCarril.task.tier, 'express', 'el cierre todavía sabe con qué carril corrió')

  writeWip(planning, `---
task: alta
hito: "demo — Demo"
phase: Done
service: app
---

## Plan aprobado
1. [x] Implementar
`)
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).task.tier, '',
    'y un WIP que no lo declara no estrena carril: vacío es "no se sabe"')
})
