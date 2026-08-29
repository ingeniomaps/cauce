'use strict'

// La cola y el estado que sale de ella: qué línea se puede leer, qué umbral obliga a decidir y con
// qué precedencia se elige la tarea que toca. Se juzga sobre el estado ya leído, sin tocar disco.

const { tempRoot, CLI } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')
const ST = require('../engine/planning/state')

// El marcador se lee del artefacto, no de un objeto de prueba: sin esto `oversizedUnits` podía estar
// perfecta y la razón escrita en la épica no llegar nunca hasta ella. Se comprueba en los tres niveles
// porque cada uno la busca en un texto distinto — el archivo, el encabezado del hito, la línea de la
// tarea— y equivocarse de alcance en uno solo lo vuelve inerte ahí y en ningún otro lado.
test('la razón de no partir se lee en los tres niveles', () => {
  const root = tempRoot('ops-nosplit-')
  fs.mkdirSync(path.join(root, 'roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demo
status: open
---

# Épica 001 — Demo

(sin partir: el harness mide este servicio y no se entrega solo)

## Criterios

- **C1** — Cuando algo, alguien obtiene algo.

## Contexto relevante

- Contexto.

## Historias

- [ ] **una** (→ C1) — Incremento. (service: app)
`)
  fs.writeFileSync(path.join(root, 'BACKLOG.md'), `# Backlog

## Hito primero — Primero (sin partir: es una sola migración y partirla la deja a medias)

- [ ] **una** [lite] — Incremento. (→ C1) (epic: 001) (service: app) (sin partir: los seis bordes son el mismo camino)
`)

  assert.equal(P.readEpics(root)[0].noSplit, 'el harness mide este servicio y no se entrega solo')
  const [hito] = P.readBacklog(root)
  assert.equal(hito.noSplit, 'es una sola migración y partirla la deja a medias')
  assert.equal(hito.tasks[0].noSplit, 'los seis bordes son el mismo camino')

  // El alcance importa: la razón de la tarea es de la tarea, no del hito que la contiene.
  fs.writeFileSync(path.join(root, 'BACKLOG.md'), `# Backlog

## Hito primero — Primero

- [ ] **una** [lite] — Incremento. (service: app) (sin partir: los seis bordes son el mismo camino)
`)
  assert.equal(P.readBacklog(root)[0].noSplit, '', 'el hito no hereda la razón de su tarea')
})

// Una viñeta bajo un hito que no cumple el contrato de tarea no la lee nadie: ni `check`, ni `tree`,
// ni el runner que busca trabajo. El motor ya rechaza por esto la épica mal nombrada —«nadie lo lee»—
// y el BACKLOG no tenía la red: dos tareas escritas daban cero en cola y cero errores.
test('una línea de BACKLOG que nadie puede leer es un error, no un silencio', () => {
  const root = tempRoot('ops-backlog-')
  const escribir = (cuerpo) => fs.writeFileSync(path.join(root, 'BACKLOG.md'), cuerpo)
  const errores = () => PC.validateBacklogStructure(root)

  escribir(`# Backlog promovido

Solo contiene trabajo aprobado y listo. Las ideas viven en \`INBOX.md\`.

- una viñeta de prosa fuera de todo hito no es una tarea

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (→ C1) (epic: 001) (service: api)
`)
  assert.deepEqual(errores(), [], 'la forma canónica pasa, y la prosa fuera de un hito no se juzga')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] (→ C1) (epic: 001) — Crear la cuenta. (service: api)
`)
  const refs = errores()
  assert.equal(refs.length, 1)
  assert.match(refs[0], /BACKLOG hito alta: no la lee nadie/)
  assert.match(refs[0], /alta-email-nuevo/, 'el error cita la línea que se pierde')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [x] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  assert.match(errores()[0], /se mueve a DONE\.md/, 'tildar en el backlog borra la tarea del sistema')

  escribir(`# Backlog promovido

## Hito alta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  const encabezado = errores()
  assert.match(encabezado[0], /## Hito <slug> — <T[ií]tulo>/, 'el hito sin título deja sus tareas huérfanas')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

<!--
- [ ] **slug-de-tarea** [full] — Resultado. _Aceptación: conducta observable._ (service: ruta)
-->
`)
  assert.deepEqual(errores(), [], 'el ejemplo comentado enseña el formato sin ser juzgado')
})

// Las dos mitades juntas, porque separadas cualquiera se cumple sola: cruzar el umbral sin razón tiene
// que fallar, y cruzarlo con la razón escrita tiene que pasar en silencio.
test('los umbrales de R17 exigen decidir, y la razón escrita alcanza', () => {
  const criterios = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}` }))
  const tareas = (n) => Array.from({ length: n }, (_, i) => ({ slug: `t-${i}`, criteria: [], noSplit: '' }))
  const epica = (n, noSplit = '') => ({ file: 'epic-001-x.md', criteria: criterios(n), noSplit })

  assert.deepEqual(PC.oversizedUnits({
    epics: [epica(7)], milestones: [{ slug: 'h', tasks: tareas(9), noSplit: '' }],
  }), [], 'en el umbral no dice nada: el borde entra')

  const cruzada = PC.oversizedUnits({ epics: [epica(8)] })
  assert.equal(cruzada.length, 1)
  assert.match(cruzada[0], /roadmap\/epic-001-x\.md: criterios: 8 \(umbral 7 de R17\)/, 'cuánto y contra qué')
  assert.match(cruzada[0], /sin partir: <razón>/, 'y cómo se cierra sin partir, que es la otra salida')

  // La razón escrita es lo que cierra el agujero: sin ella la escapatoria no dejaba rastro.
  assert.deepEqual(PC.oversizedUnits({ epics: [epica(8, 'el harness mide este servicio y no se entrega solo')] }),
    [], 'decidida y con la razón puesta, la unidad pasa')

  const hito = { slug: 'primero', tasks: tareas(10), noSplit: '' }
  assert.match(PC.oversizedUnits({ milestones: [hito] })[0], /hito primero: tareas: 10/)
  assert.deepEqual(PC.oversizedUnits({ milestones: [{ ...hito, noSplit: 'una sola migración' }] }), [])

  // La tarea se cuenta por los criterios que hereda, no por su aceptación en prosa.
  const larga = { slug: 'muchos', criteria: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], noSplit: '' }
  assert.match(PC.oversizedUnits({ milestones: [{ slug: 'h', tasks: [larga], noSplit: '' }] })[0],
    /BACKLOG muchos: criterios: 6 \(umbral 5 de R17\)/)
})

// Todo esto se probaba lanzando el CLI contra un planning en disco, así que cada rama costaba un
// proceso y un árbol de archivos. Extraída, `validateState` recibe el estado ya leído y se ejercita en
// memoria: es lo que la mudanza compra, y sin esto sería sólo mover código de archivo.
test('validateState juzga el estado ya leído, sin tocar disco', () => {
  const epica = (extra = {}) => ({
    file: 'epic-001-x.md', num: '001', title: 'X', status: 'open', hasContext: true,
    criteria: [{ id: 'C1', text: 'Cuando algo, alguien obtiene algo.' }],
    stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api' }],
    ...extra,
  })
  const tarea = (extra = {}) => ({
    slug: 'h-uno', tier: 'lite', cast: { build: '', review: [] }, epic: '001',
    service: 'api', acceptance: 'algo observable', criteria: ['C1'], ...extra,
  })
  const estado = (extra = {}) => ({
    epics: [epica()], milestones: [{ slug: 'h', title: 'H', tasks: [tarea()] }],
    done: { entries: [], set: new Set(), duplicates: [] }, wip: null, ...extra,
  })
  const errores = (extra) => PC.validateState(estado(extra))

  assert.deepEqual(errores(), [], 'un estado coherente no produce nada')

  // Épica: identidad, contrato y cierre.
  assert.match(errores({ epics: [epica({ num: '1' })] }).join('|'), /epic debe ser NNN/)
  assert.match(errores({ epics: [epica(), epica({ file: 'epic-001-y.md' })] }).join('|'),
    /número de épica duplicado 001/)
  assert.match(errores({ epics: [epica({ title: '' })] })[0], /falta title/)
  assert.match(errores({ epics: [epica({ status: 'vigente' })] }).join('|'), /status inválido/)
  assert.match(errores({ epics: [epica({ criteria: [] })] }).join('|'), /falta al menos un criterio/)
  assert.match(errores({ epics: [epica({ stories: [] })] }).join('|'), /falta al menos una historia/)
  assert.match(errores({ epics: [epica({ hasContext: false })] })[0], /Contexto relevante/)

  // Historias: slug, trazabilidad y servicio.
  const historia = (extra) => errores({
    epics: [epica({ stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api', ...extra }] })],
  })
  assert.match(historia({ slug: 'H Uno' }).join('|'), /slug inválido/)
  assert.match(historia({ criteria: [] }).join('|'), /no rastrea a un criterio/)
  assert.match(historia({ criteria: ['C9'] }).join('|'), /cita C9, que no existe/)
  assert.match(historia({ service: '' }).join('|'), /no declara \(service/)

  // Una épica activa sin nada pendiente tiene que cerrar.
  assert.match(errores({
    epics: [epica({ status: 'active' })], done: { entries: [], set: new Set(['h-uno']), duplicates: [] },
  }).join('|'), /active sin historias pendientes/)

  // Hitos y tareas.
  const hito = (extra) => errores({ milestones: [{ slug: 'h', title: 'H', tasks: [tarea(extra)] }] })
  assert.match(errores({ milestones: [{ slug: 'H Uno', tasks: [] }] })[0], /hito con slug inválido/)
  assert.match(errores({
    milestones: [{ slug: 'h', tasks: [] }, { slug: 'h', tasks: [] }],
  }).join('|'), /hito duplicado/)
  assert.match(hito({ service: '' }).join('|'), /falta \(service/)
  assert.match(hito({ acceptance: '', criteria: [] }).join('|'), /falta aceptación explícita/)
  assert.match(hito({ acceptance: 'Por definir.' }).join('|'), /la aceptación no está decidida/)
  assert.match(hito({ slug: 'ajena' }).join('|'), /no existe en epic-001/)
  assert.deepEqual(PC.validateState({
    ...estado(), roles: new Set(['backend-engineer']),
    milestones: [{ slug: 'h', tasks: [tarea({ cast: { build: 'inventado', review: [] } })] }],
  }).filter((error) => /cast/.test(error)),
  ['BACKLOG h-uno: el cast nombra inventado, que no está en el catálogo'])

  // WIP y evidencia.
  assert.match(errores({ wip: { task: 'ajena', complete: 1, pending: 0 } }).join('|'),
    /WIP ajena: no existe en BACKLOG ni DONE/)
  assert.match(errores({ wip: { task: 'h-uno', complete: 0, pending: 0 } }).join('|'),
    /el plan no tiene pasos que el motor pueda contar/)
  assert.match(errores({ done: { entries: [], set: new Set(), duplicates: ['h-uno'] } })[0],
    /DONE duplicado: h-uno/)

  // Acciones humanas.
  assert.match(PC.validateState({
    ...estado(), humanActions: [{ task: 'h-uno', state: 'COMPLETADO', valid: false }],
  }).join('|'), /estado "COMPLETADO" fuera de/)
})

// Cada rama de la precedencia en su propia aserción, que es lo que la extracción de arriba compra.
test('currentTask aplica la precedencia del protocolo sobre el estado ya leído', () => {
  const ST = require('../engine/planning/state')
  const tarea = (slug) => ({ slug, tier: 'lite', cast: { build: '', review: [] }, service: 'api' })
  const estado = (extra = {}) => ({
    milestones: [{ slug: 'h', tasks: [tarea('uno'), tarea('dos'), tarea('tres')] }],
    done: { set: new Set() }, wip: null, ...extra,
  })

  assert.equal(ST.currentTask(estado()).task.slug, 'uno', 'la primera del primer hito')
  assert.deepEqual(ST.currentTask(estado()).skipped, [])

  // El WIP manda aunque su tarea tenga una acción humana abierta: es el mutex.
  const conWip = ST.currentTask(estado({ wip: { task: 'dos', service: 'api' } }), [{ task: 'dos' }])
  assert.equal(conWip.task.slug, 'dos')
  assert.deepEqual(conWip.skipped, [], 'con WIP no se salta nada: hay una sola tarea posible')

  // Un WIP que apunta fuera del backlog igual se entrega, para poder cerrarlo.
  const huerfano = ST.currentTask(estado({ wip: { task: 'ajena', service: 'api' } }))
  assert.equal(huerfano.task.slug, 'ajena')
  assert.equal(huerfano.task.hito, '', 'sin hito, porque no está en la cola')

  // Sin WIP, lo bloqueado se salta y queda nombrado.
  const bloqueada = ST.currentTask(estado(), [{ task: 'uno' }])
  assert.equal(bloqueada.task.slug, 'dos')
  assert.deepEqual(bloqueada.skipped, ['uno'])

  // Lo ya terminado no vuelve a la cola.
  const hecha = ST.currentTask(estado({ done: { set: new Set(['uno', 'dos']) } }))
  assert.equal(hecha.task.slug, 'tres')

  // Todo bloqueado: no hay tarea, y las saltadas se enumeran para poder decir por qué.
  const todas = ST.currentTask(estado(), [{ task: 'uno' }, { task: 'dos' }, { task: 'tres' }])
  assert.equal(todas.task, null)
  assert.deepEqual(todas.skipped, ['uno', 'dos', 'tres'])
})
