'use strict'

// La cola y el estado que sale de ella: qué línea se puede leer, qué umbral obliga a decidir y con
// qué precedencia se elige la tarea que toca. Se juzga sobre el estado ya leído, sin tocar disco.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../../engine/planning/contracts')
const SR = require('../../engine/planning/structure')
const SZ = require('../../engine/planning/sizing')
const P = require('../../engine/planning/parser')

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
  const errores = () => SR.validateBacklogStructure(root)

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
// La barra de cinco condiciones contaba sólo los criterios heredados, así que la aceptación escrita en
// la línea —la forma que el molde muestra primero— valía cero: una tarea con ocho condiciones pasaba sin
// que nada la nombrara, y la escapatoria que R17 describe no se le pedía nunca. `acceptanceConditions`
// dice hasta dónde llega la cuenta y por qué sub-cuenta.
test('la aceptación propia de una tarea también cuenta para R17', () => {
  const tarea = (acceptance) => ({
    slug: 'inflada', criteria: [], noSplit: '', acceptance, conditions: P.acceptanceConditions(acceptance),
  })
  const juzgar = (acceptance) => SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [tarea(acceptance)] }] })

  assert.match(juzgar('(1) a; (2) b; (3) c; (4) d; (5) e; (6) f')[0],
    /BACKLOG inflada: condiciones de aceptación: 6 \(umbral 5 de R17\)/,
    'el mensaje nombra qué contó: «criterios: 6» sobre una tarea sin un (→ CN) manda a buscar seis que no existen')
  assert.deepEqual(juzgar('a; b; c; d; e'), [], 'cinco no cruza: el umbral es «más de»')
  assert.deepEqual(juzgar('una frase larga, con comas, que sigue y sigue'), [], 'sub-cuenta antes que sobre-contar')
  assert.deepEqual(juzgar(''), [], 'sin aceptación propia no hay nada que contar')

  // Se juzga la mayor y no la suma: una tarea que repite en prosa lo que ya citó no acumula dos veces.
  const mixta = {
    slug: 'mixta', criteria: ['C1', 'C2', 'C3'], noSplit: '',
    acceptance: 'a; b; c', conditions: P.acceptanceConditions('a; b; c'),
  }
  assert.deepEqual(SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [mixta] }] }), [],
    'tres heredados y tres propios son tres, no seis')
})

// Las dos formas de marcar y las tres de no marcar nada, en la misma corrida: es lo único que separa
// contar de leer, y el día que alguien haga que un paréntesis suelto o una coma valgan una condición,
// dos de estos casos se ponen rojos. `acceptanceConditions` dice por qué el orden es ése.
test('las condiciones de una aceptación se cuentan como el autor las marcó', () => {
  assert.equal(P.acceptanceConditions(''), 0)
  assert.equal(P.acceptanceConditions('conducta observable.'), 1)
  assert.equal(P.acceptanceConditions('(1) una; (2) dos; (3) tres.'), 3)
  assert.equal(P.acceptanceConditions('una cosa; otra cosa; una tercera.'), 3)
  assert.equal(P.acceptanceConditions('(1) sólo una marcada y nada más.'), 1, 'un marcador suelto no es una lista')
  assert.equal(P.acceptanceConditions('(1) primero; con su detalle; (2) segundo.'), 2,
    'con marcadores mandan ellos: el `;` de adentro de una condición no la parte en dos')
  assert.equal(P.acceptanceConditions('se ordena por fecha (ver ADR 3) y no rompe la paginación.'), 1,
    'un número entre paréntesis que no marca una condición no la inventa')
})

test('los umbrales de R17 exigen decidir, y la razón escrita alcanza', () => {
  const criterios = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}` }))
  const tareas = (n) => Array.from({ length: n }, (_, i) => ({ slug: `t-${i}`, criteria: [], noSplit: '' }))
  const epica = (n, noSplit = '') => ({ file: 'epic-001-x.md', criteria: criterios(n), noSplit })

  assert.deepEqual(SZ.oversizedUnits({
    epics: [epica(7)], milestones: [{ slug: 'h', tasks: tareas(9), noSplit: '' }],
  }), [], 'en el umbral no dice nada: el borde entra')

  const cruzada = SZ.oversizedUnits({ epics: [epica(8)] })
  assert.equal(cruzada.length, 1)
  assert.match(cruzada[0], /roadmap\/epic-001-x\.md: criterios: 8 \(umbral 7 de R17\)/, 'cuánto y contra qué')
  assert.match(cruzada[0], /sin partir: <razón>/, 'y cómo se cierra sin partir, que es la otra salida')

  // La razón escrita es lo que cierra el agujero: sin ella la escapatoria no dejaba rastro.
  assert.deepEqual(SZ.oversizedUnits({ epics: [epica(8, 'el harness mide este servicio y no se entrega solo')] }),
    [], 'decidida y con la razón puesta, la unidad pasa')

  const hito = { slug: 'primero', tasks: tareas(10), noSplit: '' }
  assert.match(SZ.oversizedUnits({ milestones: [hito] })[0], /hito primero: tareas: 10/)
  assert.deepEqual(SZ.oversizedUnits({ milestones: [{ ...hito, noSplit: 'una sola migración' }] }), [])

  // La tarea se cuenta por los criterios que hereda, no por su aceptación en prosa.
  const larga = { slug: 'muchos', criteria: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], noSplit: '' }
  assert.match(SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [larga], noSplit: '' }] })[0],
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
    done: { entries: [], set: new Set(), duplicates: [] }, wips: [], ...extra,
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
  assert.match(errores({ wips: [{ task: 'ajena', runner: 'w-uno', complete: 1, pending: 0 }] }).join('|'),
    /wip\/w-uno\.md: ajena no existe en BACKLOG ni DONE/)
  assert.match(errores({ wips: [{ task: 'h-uno', runner: 'w-uno', complete: 0, pending: 0 }] }).join('|'),
    /el plan de h-uno no tiene pasos que el motor pueda contar/)
  assert.match(errores({ done: { entries: [], set: new Set(), duplicates: ['h-uno'] } })[0],
    /DONE duplicado: h-uno/)

  // Acciones humanas.
  assert.match(PC.validateState({
    ...estado(), humanActions: [{ task: 'h-uno', state: 'COMPLETADO', valid: false }],
  }).join('|'), /estado "COMPLETADO" fuera de/)
})

// Cada rama de la precedencia en su propia aserción, que es lo que la extracción de arriba compra.
test('currentTask aplica la precedencia del protocolo sobre el estado ya leído', () => {
  const ST = require('../../engine/planning/state')
  const tarea = (slug) => ({ slug, tier: 'lite', cast: { build: '', review: [] }, service: 'api' })
  const estado = (extra = {}) => ({
    milestones: [{ slug: 'h', tasks: [tarea('uno'), tarea('dos'), tarea('tres')] }],
    done: { set: new Set() }, wips: [], ...extra,
  })

  assert.equal(ST.currentTask(estado()).task.slug, 'uno', 'la primera del primer hito')
  assert.deepEqual(ST.currentTask(estado()).skipped, [])

  // El WIP manda aunque su tarea tenga una acción humana abierta: es el mutex.
  const conWip = ST.currentTask(
    estado({ wips: [{ task: 'dos', runner: 'w-uno', service: 'api' }] }), [{ task: 'dos' }], '/w/uno',
  )
  assert.equal(conWip.task.slug, 'dos')
  assert.deepEqual(conWip.skipped, [], 'con WIP no se salta nada: hay una sola tarea posible')

  // Un WIP que apunta fuera del backlog igual se entrega, para poder cerrarlo.
  const huerfano = ST.currentTask(estado({ wips: [{ task: 'ajena', runner: 'w-uno', service: 'api' }] }), [], '/w/uno')
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
