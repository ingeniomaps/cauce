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
  const [milestone] = P.readBacklog(root)
  assert.equal(milestone.noSplit, 'es una sola migración y partirla la deja a medias')
  assert.equal(milestone.tasks[0].noSplit, 'los seis bordes son el mismo camino')

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
  const write = (body) => fs.writeFileSync(path.join(root, 'BACKLOG.md'), body)
  const errors = () => SR.validateBacklogStructure(root)

  write(`# Backlog promovido

Solo contiene trabajo aprobado y listo. Las ideas viven en \`INBOX.md\`.

- una viñeta de prosa fuera de todo hito no es una tarea

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (→ C1) (epic: 001) (service: api)
`)
  assert.deepEqual(errors(), [], 'la forma canónica pasa, y la prosa fuera de un hito no se juzga')

  write(`# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] (→ C1) (epic: 001) — Crear la cuenta. (service: api)
`)
  const refs = errors()
  assert.equal(refs.length, 1)
  assert.match(refs[0], /BACKLOG hito alta: no la lee nadie/)
  assert.match(refs[0], /alta-email-nuevo/, 'el error cita la línea que se pierde')

  write(`# Backlog promovido

## Hito alta — Alta de cuenta

- [x] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  assert.match(errors()[0], /se mueve a DONE\.md/, 'tildar en el backlog borra la tarea del sistema')

  write(`# Backlog promovido

## Hito alta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  const heading = errors()
  assert.match(heading[0], /## Hito <slug> — <T[ií]tulo>/, 'el hito sin título deja sus tareas huérfanas')

  write(`# Backlog promovido

## Hito alta — Alta de cuenta

<!--
- [ ] **slug-de-tarea** [full] — Resultado. _Aceptación: conducta observable._ (service: ruta)
-->
`)
  assert.deepEqual(errors(), [], 'el ejemplo comentado enseña el formato sin ser juzgado')
})

// Las dos mitades juntas, porque separadas cualquiera se cumple sola: cruzar el umbral sin razón tiene
// que fallar, y cruzarlo con la razón escrita tiene que pasar en silencio.
// La barra de cinco condiciones contaba sólo los criterios heredados, así que la aceptación escrita en
// la línea —la forma que el molde muestra primero— valía cero: una tarea con ocho condiciones pasaba sin
// que nada la nombrara, y la escapatoria que R17 describe no se le pedía nunca. `acceptanceConditions`
// dice hasta dónde llega la cuenta y por qué sub-cuenta.
// La condición que no se puede comprobar cuando se la comprueba. El recorrido ya la frena, pero en Verify:
// 1,2 M de tokens y once agentes para terminar con el trabajo hecho y sin poder cerrarlo (caso 140). Acá
// cuesta un regex sobre la cola, y por eso avisa en vez de fallar: el patrón es de texto y una aceptación
// legítima puede nombrar la palabra sin depender de ella.
test('una aceptación que nombra el registro se avisa antes de construir', () => {
  const judge = (acceptance) => PC.unverifiableAcceptance(
    [{ slug: 'h', tasks: [{ slug: 'tarea', acceptance }] }])

  assert.match(judge('el borrado aplicado, con las dos corridas registradas en la evidencia')[0],
    /BACKLOG tarea: una condición nombra la evidencia, que existe después de Verify/)
  assert.match(judge('con su entrada en planning/done/')[0], /nombra planning\/done\//)
  assert.match(judge('el commit apunta al sha')[0], /nombra el commit/)
  assert.match(judge('el reclamo queda liberado')[0], /nombra el reclamo/)
  // Dice qué hacer, no sólo qué está mal: esa cláusula tiene lugar, y es el registro que DONE ya exige.
  assert.match(judge('con la evidencia registrada')[0], /tests:, qa: o commit: de su entrada de DONE/)

  // Y no dispara sobre lo que se escribe de verdad: las aceptaciones reales son técnicas y nombran el
  // producto. Si marcara éstas, el aviso se apagaría el primer día.
  assert.deepEqual(judge('`make check-env` sigue frenando y nombrando la requerida que falte'), [])
  assert.deepEqual(judge('`node tools/ops.js secrets check .` termina en 0'), [])
  assert.deepEqual(judge('el test deriva el set desde `db/queries/*.sql`'), [])
  assert.deepEqual(judge(''), [], 'sin aceptación no hay nada que mirar')

  // Por qué la salida es una marca y no una frase reconocida vive en `automatization/shared/acceptance.js`.
  // Acá se fija lo que el aviso promete: que ofrece esa salida y que ponerla alcanza.
  assert.match(judge('con la evidencia registrada')[0], /declaralo con "\(fuera de verify: <razón>\)"/)
  assert.deepEqual(judge('lo comprueba quien revisa (fuera de verify: el commit no existe en Verify)'), [],
    'declarada, pasa en silencio')

  // Y se juzga condición por condición, que es el grano con el que Verify contrasta: una aceptación real
  // trae varias, y marcar el párrafo entero señalaría a las que están bien por estar al lado de la que no.
  const mixture = 'el borrado aplicado; con su entrada en planning/done/; el conteo baja'
  assert.equal(judge(mixture).length, 1, 'sólo la condición que lo nombra')
  assert.equal(
    judge('con la evidencia registrada; y con su entrada en planning/done/').length, 2,
    'dos condiciones que lo nombran son dos avisos')
  assert.deepEqual(
    judge('el borrado aplicado; el commit apunta al sha (fuera de verify: lo mira quien revisa)'), [],
    'excluir una condición no exime a las otras, pero acá la otra está limpia')
})

test('la aceptación propia de una tarea también cuenta para R17', () => {
  const sampleTask = (acceptance) => ({
    slug: 'inflada', criteria: [], noSplit: '', acceptance, conditions: P.acceptanceConditions(acceptance),
  })
  const judge = (acceptance) => SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [sampleTask(acceptance)] }] })

  assert.match(judge('(1) a; (2) b; (3) c; (4) d; (5) e; (6) f')[0],
    /BACKLOG inflada: condiciones de aceptación: 6 \(umbral 5 de R17\)/,
    'el mensaje nombra qué contó: «criterios: 6» sobre una tarea sin un (→ CN) manda a buscar seis que no existen')
  assert.deepEqual(judge('a; b; c; d; e'), [], 'cinco no cruza: el umbral es «más de»')
  assert.deepEqual(judge('una frase larga, con comas, que sigue y sigue'), [], 'sub-cuenta antes que sobre-contar')
  assert.deepEqual(judge(''), [], 'sin aceptación propia no hay nada que contar')

  // Se juzga la mayor y no la suma: una tarea que repite en prosa lo que ya citó no acumula dos veces.
  const mixed = {
    slug: 'mixta', criteria: ['C1', 'C2', 'C3'], noSplit: '',
    acceptance: 'a; b; c', conditions: P.acceptanceConditions('a; b; c'),
  }
  assert.deepEqual(SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [mixed] }] }), [],
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
  const sampleCriteria = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}` }))
  const sampleTasks = (n) => Array.from({ length: n }, (_, i) => ({ slug: `t-${i}`, criteria: [], noSplit: '' }))
  const sampleEpic = (n, noSplit = '') => ({ file: 'epic-001-x.md', criteria: sampleCriteria(n), noSplit })

  assert.deepEqual(SZ.oversizedUnits({
    epics: [sampleEpic(7)], milestones: [{ slug: 'h', tasks: sampleTasks(9), noSplit: '' }],
  }), [], 'en el umbral no dice nada: el borde entra')

  const crossed = SZ.oversizedUnits({ epics: [sampleEpic(8)] })
  assert.equal(crossed.length, 1)
  assert.match(crossed[0], /roadmap\/epic-001-x\.md: criterios: 8 \(umbral 7 de R17\)/, 'cuánto y contra qué')
  assert.match(crossed[0], /sin partir: <razón>/, 'y cómo se cierra sin partir, que es la otra salida')

  // La razón escrita es lo que cierra el agujero: sin ella la escapatoria no dejaba rastro.
  assert.deepEqual(SZ.oversizedUnits({ epics: [sampleEpic(8, 'el harness mide este servicio y no se entrega solo')] }),
    [], 'decidida y con la razón puesta, la unidad pasa')

  const milestone = { slug: 'primero', tasks: sampleTasks(10), noSplit: '' }
  assert.match(SZ.oversizedUnits({ milestones: [milestone] })[0], /hito primero: tareas: 10/)
  assert.deepEqual(SZ.oversizedUnits({ milestones: [{ ...milestone, noSplit: 'una sola migración' }] }), [])

  // La tarea se cuenta por los criterios que hereda, no por su aceptación en prosa.
  const longTask = { slug: 'muchos', criteria: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], noSplit: '' }
  assert.match(SZ.oversizedUnits({ milestones: [{ slug: 'h', tasks: [longTask], noSplit: '' }] })[0],
    /BACKLOG muchos: criterios: 6 \(umbral 5 de R17\)/)
})

// Todo esto se probaba lanzando el CLI contra un planning en disco, así que cada rama costaba un
// proceso y un árbol de archivos. Extraída, `validateState` recibe el estado ya leído y se ejercita en
// memoria: es lo que la mudanza compra, y sin esto sería sólo mover código de archivo.
test('validateState juzga el estado ya leído, sin tocar disco', () => {
  const sampleEpic = (extra = {}) => ({
    file: 'epic-001-x.md', num: '001', title: 'X', status: 'open', hasContext: true,
    criteria: [{ id: 'C1', text: 'Cuando algo, alguien obtiene algo.' }],
    stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api' }],
    ...extra,
  })
  const sampleTask = (extra = {}) => ({
    slug: 'h-uno', tier: 'lite', cast: { build: '', review: [] }, epic: '001',
    service: 'api', acceptance: 'algo observable', criteria: ['C1'], ...extra,
  })
  const sampleState = (extra = {}) => ({
    epics: [sampleEpic()], milestones: [{ slug: 'h', title: 'H', tasks: [sampleTask()] }],
    done: { entries: [], set: new Set(), duplicates: [] }, wips: [], ...extra,
  })
  const errors = (extra) => PC.validateState(sampleState(extra))

  assert.deepEqual(errors(), [], 'un estado coherente no produce nada')

  // Épica: identidad, contrato y cierre.
  assert.match(errors({ epics: [sampleEpic({ num: '1' })] }).join('|'), /epic debe ser NNN/)
  assert.match(errors({ epics: [sampleEpic(), sampleEpic({ file: 'epic-001-y.md' })] }).join('|'),
    /número de épica duplicado 001/)
  assert.match(errors({ epics: [sampleEpic({ title: '' })] })[0], /falta title/)
  assert.match(errors({ epics: [sampleEpic({ status: 'vigente' })] }).join('|'), /status inválido/)
  assert.match(errors({ epics: [sampleEpic({ criteria: [] })] }).join('|'), /falta al menos un criterio/)
  assert.match(errors({ epics: [sampleEpic({ stories: [] })] }).join('|'), /falta al menos una historia/)
  assert.match(errors({ epics: [sampleEpic({ hasContext: false })] })[0], /Contexto relevante/)

  // Historias: slug, trazabilidad y servicio.
  const storyErrors = (extra) => errors({
    epics: [sampleEpic({ stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api', ...extra }] })],
  })
  assert.match(storyErrors({ slug: 'H Uno' }).join('|'), /slug inválido/)
  assert.match(storyErrors({ criteria: [] }).join('|'), /no rastrea a un criterio/)
  assert.match(storyErrors({ criteria: ['C9'] }).join('|'), /cita C9, que no existe/)
  assert.match(storyErrors({ service: '' }).join('|'), /no declara \(service/)

  // Una épica activa sin nada pendiente tiene que cerrar.
  assert.match(errors({
    epics: [sampleEpic({ status: 'active' })], done: { entries: [], set: new Set(['h-uno']), duplicates: [] },
  }).join('|'), /active sin historias pendientes/)

  // Hitos y tareas.
  const milestone = (extra) => errors({ milestones: [{ slug: 'h', title: 'H', tasks: [sampleTask(extra)] }] })
  assert.match(errors({ milestones: [{ slug: 'H Uno', tasks: [] }] })[0], /hito con slug inválido/)
  assert.match(errors({
    milestones: [{ slug: 'h', tasks: [] }, { slug: 'h', tasks: [] }],
  }).join('|'), /hito duplicado/)
  assert.match(milestone({ service: '' }).join('|'), /falta \(service/)
  assert.match(milestone({ acceptance: '', criteria: [] }).join('|'), /falta aceptación explícita/)
  assert.match(milestone({ acceptance: 'Por definir.' }).join('|'), /la aceptación no está decidida/)
  assert.match(milestone({ slug: 'ajena' }).join('|'), /no existe en epic-001/)
  assert.deepEqual(PC.validateState({
    ...sampleState(), roles: new Set(['backend-engineer']),
    milestones: [{ slug: 'h', tasks: [sampleTask({ cast: { build: 'inventado', review: [] } })] }],
  }).filter((error) => /cast/.test(error)),
  ['BACKLOG h-uno: el cast nombra inventado, que no está en el catálogo'])

  // WIP y evidencia.
  assert.match(errors({ wips: [{ task: 'ajena', runner: 'w-uno', complete: 1, pending: 0 }] }).join('|'),
    /wip\/w-uno\.md: ajena no existe en BACKLOG ni DONE/)
  assert.match(errors({ wips: [{ task: 'h-uno', runner: 'w-uno', complete: 0, pending: 0 }] }).join('|'),
    /el plan de h-uno no tiene pasos que el motor pueda contar/)
  assert.match(errors({ done: { entries: [], set: new Set(), duplicates: ['h-uno'] } })[0],
    /DONE duplicado: h-uno/)

  // Acciones humanas.
  assert.match(PC.validateState({
    ...sampleState(), humanActions: [{ task: 'h-uno', state: 'COMPLETADO', valid: false }],
  }).join('|'), /estado "COMPLETADO" fuera de/)
})

// Cada rama de la precedencia en su propia aserción, que es lo que la extracción de arriba compra.
test('currentTask aplica la precedencia del protocolo sobre el estado ya leído', () => {
  const ST = require('../../engine/planning/state')
  const sampleTask = (slug) => ({ slug, tier: 'lite', cast: { build: '', review: [] }, service: 'api' })
  const sampleState = (extra = {}) => ({
    milestones: [{ slug: 'h', tasks: [sampleTask('uno'), sampleTask('dos'), sampleTask('tres')] }],
    done: { set: new Set() }, wips: [], ...extra,
  })

  assert.equal(ST.currentTask(sampleState()).task.slug, 'uno', 'la primera del primer hito')
  assert.deepEqual(ST.currentTask(sampleState()).skipped, [])

  // El WIP manda aunque su tarea tenga una acción humana abierta: es el mutex.
  const withWip = ST.currentTask(
    sampleState({ wips: [{ task: 'dos', runner: 'w-uno', service: 'api' }] }), [{ task: 'dos' }], '/w/uno',
  )
  assert.equal(withWip.task.slug, 'dos')
  assert.deepEqual(withWip.skipped, [], 'con WIP no se salta nada: hay una sola tarea posible')

  // Un WIP que apunta fuera del backlog igual se entrega, para poder cerrarlo.
  const orphan = ST.currentTask(
    sampleState({ wips: [{ task: 'ajena', runner: 'w-uno', service: 'api' }] }), [], '/w/uno',
  )
  assert.equal(orphan.task.slug, 'ajena')
  assert.equal(orphan.task.hito, '', 'sin hito, porque no está en la cola')

  // Sin WIP, lo bloqueado se salta y queda nombrado.
  const blocked = ST.currentTask(sampleState(), [{ task: 'uno' }])
  assert.equal(blocked.task.slug, 'dos')
  assert.deepEqual(blocked.skipped, ['uno'])

  // Lo ya terminado no vuelve a la cola.
  const finished = ST.currentTask(sampleState({ done: { set: new Set(['uno', 'dos']) } }))
  assert.equal(finished.task.slug, 'tres')

  // Todo bloqueado: no hay tarea, y las saltadas se enumeran para poder decir por qué.
  const allBlocked = ST.currentTask(sampleState(), [{ task: 'uno' }, { task: 'dos' }, { task: 'tres' }])
  assert.equal(allBlocked.task, null)
  assert.deepEqual(allBlocked.skipped, ['uno', 'dos', 'tres'])
})

// Por qué una fila que casi nombra su tarea es peor que una que no la nombra está junto a la comprobación
// que las separa (`engine/planning/contracts.js`, el recorrido de `humanActions`).
//
// Las tres formas van en la misma prueba porque el valor está en el contraste: la libertad de la primera
// columna es del contrato —el molde manda nombrar la épica o el recorrido cuando la tarea todavía no
// existe— así que una comprobación que la recortara rompería lo que el molde pide. Lo único que se marca
// es la forma que promete un bloqueo y no lo cumple.
test('una fila de acciones humanas que casi nombra su tarea se marca; una que no la nombra, no', () => {
  const sampleTask = {
    slug: 'h-uno', tier: 'lite', cast: { build: '', review: [] }, epic: '001',
    service: 'api', acceptance: 'algo observable', criteria: ['C1'],
  }
  const base = {
    epics: [], milestones: [{ slug: 'h', title: 'H', tasks: [sampleTask] }],
    done: { entries: [], set: new Set(), duplicates: [] }, wips: [],
  }
  const row = (task) => ({ task, state: 'pendiente', valid: true, resolved: false, action: 'Algo' })
  const errors = (task) => PC.validateState({ ...base, humanActions: [row(task)] })
    .filter((one) => /HUMAN_ACTIONS/.test(one))

  assert.deepEqual(errors('h-uno'), [], 'el slug exacto bloquea, que es lo que se espera de él')
  assert.deepEqual(errors('epic 001'), [], 'nombrar la épica es lo que el molde pide cuando no hay tarea')
  assert.deepEqual(errors('—'), [], 'y la raya es toda la línea de trabajo, no una tarea mal escrita')

  assert.match(errors('**h-uno: falta la credencial**').join('|'), /h-uno/,
    'la que nombra la tarea sin ser su slug promete un bloqueo que no ocurre')
})

// La descripción de una tarea es lo que la aceptación no puede decir: dónde vive un símbolo, qué queda
// fuera de alcance, con qué se produce la evidencia. Por qué tiene que salir del BACKLOG está junto al
// campo, en el parser.
//
// Las tres aserciones son las tres formas de equivocarse al recortarla, y ninguna se ve desde las otras:
// dejarle la aceptación pegada, dejarle los marcadores del contrato, o devolverla vacía cuando la línea
// no trae más que ellos.
test('la línea de una tarea entrega su descripción, sin la aceptación ni los marcadores', () => {
  const line = '- [ ] **alta-de-cliente** [full] — El padrón se consulta por documento; `normalizar` vive '
    + 'en `api/padron.js` y el rechazo de duplicado queda fuera de alcance. '
    + '_Aceptación: el alta responde 409 ante un documento repetido._ '
    + '(→ C1) (epic: 001) (service: api) (cast: backend-engineer → qa-engineer) (depende: padron-cargado)'
  const sampleTask = P.taskFromLine(line)
  assert.ok(sampleTask, 'la línea se lee')
  assert.match(sampleTask.description, /El padrón se consulta por documento/)
  assert.match(sampleTask.description, /queda fuera de alcance/, 'y llega entera, no cortada en el primer punto')
  assert.doesNotMatch(sampleTask.description, /Aceptación/, 'la aceptación viaja en su campo, no acá')
  assert.doesNotMatch(sampleTask.description, /service:|cast:|depende:|epic:/,
    'y los marcadores del contrato tampoco: cada uno ya tiene su campo')

  const bare = P.taskFromLine('- [ ] **sola** — Sin nada más. (epic: 002) (service: api)')
  assert.equal(bare.description, 'Sin nada más.', 'una línea sin aceptación igual tiene descripción')
})
