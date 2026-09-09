'use strict'

// El recorrido de una tarea de punta a punta, corrido de verdad con los subagentes simulados, y los
// cortes que lo detienen antes de tocar nada. Leer el fuente ve que el freno existe; esto ve que
// frene cuando tiene que frenar y —lo que más importa— que deje pasar cuando no.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached } = require('../support/autobuild-harness')

// Lo primero que hay que saber es que el recorrido llega al final, porque un freno que dispara siempre
// se ve idéntico a uno que funciona si sólo se comprueban los casos que frenan.
test('autobuild cierra una tarea cuando todo está en su lugar', async () => {
  const { result, phases } = await runFlow()
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  for (const expected of ['Triage', 'Plan', 'Critique', 'Build', 'Review', 'Verify', 'QA', 'Commit', 'Closing']) {
    assert.ok(phases.includes(expected), `faltó la fase ${expected}`)
  }
})

// Dos corridas en paralelo preguntan y reservan por separado, así que entre las dos cosas otra puede
// haber tomado la tarea. Perder esa carrera no es un error del recorrido: se relee y se sigue con lo que
// quedó libre. Sin esta prueba, la rama que lo maneja se ve igual escrita bien que escrita mal — las dos
// terminan la corrida sin romper, y sólo una deja de construir lo que otro ya está construyendo.
test('perder la carrera por una tarea no rompe la corrida ni la construye igual', async () => {
  const { result, phases } = await runFlow({ [KEY.claim]: { claimed: false, details: 'la tomó otro' } })
  assert.equal(result.stopped, undefined, `frenó: ${JSON.stringify(result)}`)
  assert.deepEqual(result.done, [], 'no cerró ninguna tarea')
  assert.ok(phases.includes('Claim'), 'llegó a reservar')
  assert.ok(!phases.includes('Build'), 'y no construyó lo que otro ya tenía tomado')
})

// El cierre escribe un archivo por tarea y no agrega a uno compartido: es lo que hace que dos corridas
// en paralelo no se pisen al terminar. Y la fecha la trae el motor —un workflow no tiene reloj, hay una
// puerta que se lo impide— así que el prompt tiene que llevarla ya resuelta, no pedírsela al modelo.
test('el cierre escribe el archivo de la tarea, con la fecha que dio el motor', async () => {
  const { prompts } = await runFlow()
  const cierre = prompts.find((one) => one.key.startsWith('Done|'))
  assert.ok(cierre, 'la fase Done pidió algo')
  assert.match(cierre.prompt, /escribí \.\/planning\/done\/T-1\.md/)
  assert.match(cierre.prompt, /fecha: 2026-09-08/)
  assert.doesNotMatch(cierre.prompt, /planning\/DONE\.md/, 'y no manda a tocar el archivo compartido')
})

// El cierre le dicta a un modelo qué escribir, y lo que escriba lo juzga `check` después. Si el contrato
// gana un campo y el prompt no lo nombra, cada tarea cierra con una entrada incompleta y el error aparece
// al final, con el trabajo hecho. Los campos no se listan acá: los nombra el propio validador al quejarse
// de una entrada vacía, así que agregar uno rompe esta prueba en vez de pasar en silencio.
test('el cierre nombra todos los campos que el contrato de una entrada exige', async () => {
  const PC = require('../../engine/planning/contracts')
  const faltantes = PC.doneEntryErrors({ slug: 'T-1', source: 'done/T-1.md' }, [])
    .map((error) => (error.match(/falta (\w+):/) || [])[1]).filter(Boolean)
  assert.ok(faltantes.length >= 5, `el validador nombró pocos campos: ${faltantes.join(', ')}`)

  const { prompts } = await runFlow()
  const cierre = prompts.find((one) => one.key.startsWith('Done|'))
  const sinNombrar = faltantes.filter((campo) => !cierre.prompt.includes(campo))
  assert.deepEqual(sinNombrar, [], `el prompt de cierre no nombra: ${sinNombrar.join(', ')}`)
})

// La fase Plan pedía «el contexto de la épica» en su propio texto y nunca lo recibía: el esquema de
// `planning-context` aplanaba la épica a su número. Acá se mide el viaje entero —lo que `ops context`
// resuelve tiene que aparecer en el prompt que planifica—, porque es el único punto donde se nota que
// llegó: el ejecutor tiene prohibido abrir el roadmap para buscarlo.
test('el contexto de la épica llega al prompt que planifica', async () => {
  const guion = baseScript()
  const { prompts } = await runFlow({
    [KEY.context]: { ...guion[KEY.context], epicContext: '- Sin esa marca el ruteo no distingue.' },
  })
  const plan = prompts.find((entry) => entry.key.startsWith('Plan|')).prompt

  assert.match(plan, /Contexto de la épica: - Sin esa marca el ruteo no distingue\./)
})

// Y sin épica el prompt no cambia de forma: una tarea suelta no arrastra un rótulo vacío.
test('una tarea sin épica planifica sin contexto pegado', async () => {
  const { prompts } = await runFlow()
  const plan = prompts.find((entry) => entry.key.startsWith('Plan|')).prompt

  assert.doesNotMatch(plan, /Contexto de la épica/)
})

test('sin WIP activo no se entra a construir', async () => {
  const { result, asked } = await runFlow({
    [KEY.wip]: { wipActive: false, note: 'quedó en IDLE' },
  })
  assert.equal(result.reason, 'wip-not-persisted')
  assert.ok(!reached(asked, 'Build'), 'y no se construye sin el WIP puesto')
})

// Lo que falta para empezar no lo resuelve el recorrido: va donde lo lee una persona, en vez de quedar
// en el log de una corrida que ya terminó.
test('una tarea que no está lista no se planifica y queda pedida por escrito', async () => {
  const { result, asked, written } = await runFlow({
    [KEY.ready]: { ready: false, needsHuman: true, reason: 'la aceptación no dice qué es un duplicado' },
  })
  assert.equal(result.reason, 'not-ready')
  assert.ok(!reached(asked, 'Plan'), 'no se planifica lo que todavía no se sabe qué es')
  assert.ok(
    written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('qué es un duplicado')),
    'y lo que falta queda con su motivo donde alguien lo puede resolver',
  )
})

test('una tarea cerrada en Build no sigue como si nada', async () => {
  const { result, asked } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', discovered: [], closedTask: true,
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
    },
  })
  assert.equal(result.reason, 'build-closed-task')
  assert.ok(!reached(asked, 'Review'), 'y no se revisa lo que ya se cerró')
})

test('el check de cierre en rojo frena la corrida', async () => {
  const { result } = await runFlow({
    [KEY.closing]: { passed: false, details: 'el BACKLOG quedó con la tarea que se cerró' },
  })
  assert.equal(result.reason, 'planning-check-failed')
  assert.match(result.detail, /BACKLOG/)
})

// Cerrada una tarea, el recorrido relee el estado para decidir si sigue. Sin ese estado no hay con qué
// decidir, y elegir la próxima igual sería elegirla a ciegas.
test('si el estado no se puede releer la corrida corta en vez de seguir a ciegas', async () => {
  const { result, asked } = await runFlow({}, { contexts: [baseScript()[KEY.context], null] })
  assert.equal(result.reason, 'context-unavailable')
  assert.ok(reached(asked, 'Commit'), 'corta después de cerrar la tarea que sí terminó, no antes')
})

test('un subagente que no contesta corta con su etapa puesta', async () => {
  const { result } = await runFlow({ [KEY.build]: null })
  assert.equal(result.reason, 'agent-unavailable')
  assert.match(result.detail, /Build/)
})

// La otra forma de no contestar: sin contrato no hay límites que respetar, y el recorrido no llega
// siquiera a mirar si hay tarea.
test('sin el contrato leído no se arranca el recorrido', async () => {
  const { result, asked } = await runFlow({ [KEY.contract]: null })
  assert.equal(result.reason, 'contract-unavailable')
  assert.deepEqual(asked, [KEY.contract], 'no se pide nada más')
})

test('una tarea que no entra en el tope de horas se parte y no se construye', async () => {
  const { result, asked, written } = await runFlow({
    [KEY.decompose]: {
      hours: 12, needsSplit: true,
      subtasks: [{ title: 'alta', acceptance: 'rechaza duplicado' }, { title: 'baja', acceptance: 'borra' }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, [], 'la tarea partida no se cierra: se reemplaza y se vuelve a elegir')
  assert.ok(!reached(asked, 'Build'), 'y no se construye lo que se acaba de partir')
  assert.ok(written.some((text) => text.includes('BACKLOG')), 'las subtareas reemplazan a la original')
})

test('sin tarea en cola se expande la próxima épica y se sigue con ella', async () => {
  const withTask = baseScript()[KEY.context]
  const { result, asked } = await runFlow(
    { [KEY.pick]: { expanded: true, hito: 'H1' } },
    { contexts: [{ blocked: '', hasTask: false, wipActive: false, queued: 0, lane: 'full', readOk: true }, withTask] },
  )
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'lo expandido se ejecuta en la misma corrida')
  assert.ok(asked.includes(KEY.pick), 'y pasó por la expansión, no por una tarea que ya estaba')
})

test('sin nada que expandir el recorrido termina sin inventar trabajo', async () => {
  const { result, asked } = await runFlow({}, { contexts: [] })
  ranToEnd(result)
  assert.deepEqual(result.done, [])
  assert.ok(!reached(asked, 'Build'), 'no se construye sin tarea')
})

// Un planning que no se pudo leer contesta lo mismo que uno terminado —sin tarea, cola en cero— y sobre
// esa confusión la expansión escribe en el BACKLOG, que es lo único de este recorrido que no se revierte
// con un `git checkout`. Pasó el 2026-09-08: seis historias que nadie aprobó, y el `check` posterior en
// verde porque once tareas en cola es un estado válido.
test('una lectura fallida no se toma como cola vacía ni expande nada', async () => {
  const { result, asked } = await runFlow(
    { [KEY.pick]: { expanded: true, hito: 'H1' } },
    { contexts: [{ blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '', readOk: false }] },
  )
  assert.equal(result.reason, 'context-unavailable', `tenía que frenar: ${JSON.stringify(result)}`)
  assert.ok(!asked.includes(KEY.pick), 'y no llegar a la expansión, que es lo que escribe')
  assert.ok(!reached(asked, 'Build'), 'ni construir sobre un estado que no se leyó')
})

test('un checkpoint humano sin resolver corta antes de tocar nada', async () => {
  const { result, asked } = await runFlow({}, {
    contexts: [{ blocked: 'hito anterior sin revisar', hasTask: true, wipActive: false, queued: 1, readOk: true }],
  })
  assert.equal(result.reason, 'awaiting-human-review')
  assert.ok(!reached(asked, 'Plan'), 'ni se planifica')
})

test('el hito cambia y la corrida cierra en vez de seguir con el siguiente', async () => {
  const first = baseScript()[KEY.context]
  const { result } = await runFlow({}, {
    contexts: [first, { ...first, slug: 'T-2', hito: 'H2' }],
  })
  assert.deepEqual(result.done, ['T-1'], 'una corrida cierra un hito, no todos los que haya')
  assert.equal(result.hito, 'H1')
})

test('con checkpoint configurado el hito terminado queda esperando una firma', async () => {
  const withGate = { ...baseScript()[KEY.contract], humanCheckpoint: true }
  const { written } = await runFlow({ [KEY.contract]: withGate })
  assert.ok(
    written.some((text) => text.includes('AWAITING_REVIEW')),
    'el hito terminado deja el gate escrito, que es lo que impide que la próxima corrida siga sola',
  )
  // Y apagado no lo escribe: es configuración del proyecto, no una ceremonia fija.
  const { written: withoutGate } = await runFlow()
  assert.ok(!withoutGate.some((text) => text.includes('AWAITING_REVIEW')))
})

test('una tarea que vuelve a quedar elegible para siempre corta con su motivo', async () => {
  // Sesenta porque el tope del recorrido son cincuenta tareas —`MAX_TASKS` en `autobuild.js`—: hay que
  // pasarlo para que corte, y el detalle tiene que nombrar el número en vez de cortar sin decir cuál.
  const forever = baseScript()[KEY.context]
  const { result } = await runFlow({}, { contexts: Array.from({ length: 60 }, () => forever) })
  assert.equal(result.reason, 'milestone-too-long')
  assert.match(result.detail, /50/)
})

// La corrida corta cuando la tarea que sigue es de otro hito —el corte que evita encadenar hitos sin que
// nadie mire—, y expandía justo antes de llegar ahí: escribía el hito siguiente en el BACKLOG y acto
// seguido decidía no tocarlo. Escribir en el BACKLOG es lo único de este recorrido que no se revierte con
// un `git checkout`, así que hacerlo para descartarlo deja trabajo cuyo autor nadie puede reconstruir.
test('terminar el hito no expande el siguiente para descartarlo', async () => {
  const conTarea = baseScript()[KEY.context]
  const vacio = {
    blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '', readOk: true,
    cast: { build: '', review: [] },
  }
  const { result, asked, written } = await runFlow(
    { [KEY.pick]: { expanded: true, hito: 'H2' } },
    { contexts: [conTarea, vacio, { ...conTarea, slug: 'T-9', hito: 'H2' }] },
  )
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'la tarea del hito propio sí se construye')
  assert.ok(!asked.includes(KEY.pick), 'y al quedarse sin cola no se expande lo que no va a usar')
  // Por el texto del prompt de expansión y no por «BACKLOG»: Classify y Done lo nombran de forma
  // legítima, así que buscar la palabra mide otra cosa y pasa a rojo por el motivo equivocado.
  assert.equal(written.some((text) => text.includes('Expandí sólo la próxima épica')), false,
    'ninguna escritura fue la expansión')

// Se afirma sobre el prompt y no sobre un BACKLOG resultante porque quien escribe es el modelo: lo único
// que este recorrido controla es qué le pide. Que la marca no rompa el parser se comprobó aparte,
// corriendo `check` sobre un BACKLOG con ella puesta.
test('lo que el runner expande queda firmado en el BACKLOG', async () => {
  const { prompts } = await runFlow(
    { [KEY.pick]: { expanded: true, hito: 'H1' } },
    {
      contexts: [
        { blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '', readOk: true,
          cast: { build: '', review: [] } },
        baseScript()[KEY.context],
      ],
    },
  )
  const expansion = prompts.find((one) => one.prompt.includes('Expandí sólo la próxima épica'))
  assert.ok(expansion, 'la corrida pasó por la expansión')
  assert.match(expansion.prompt, /debajo del encabezado del hito/i, 'la marca va donde el parser la ignora')
  assert.match(expansion.prompt, /expandió autobuild/i, 'y dice quién la escribió')
  assert.match(expansion.prompt, /fecha de hoy/i, 'con cuándo')
  assert.match(expansion.prompt, /épica de la que sale|número de la épica/i, 'y de dónde sale')
})
