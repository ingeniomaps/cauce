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
    { contexts: [{ blocked: '', hasTask: false, wipActive: false, queued: 0, lane: 'full' }, withTask] },
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

test('un checkpoint humano sin resolver corta antes de tocar nada', async () => {
  const { result, asked } = await runFlow({}, {
    contexts: [{ blocked: 'hito anterior sin revisar', hasTask: true, wipActive: false, queued: 1 }],
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
