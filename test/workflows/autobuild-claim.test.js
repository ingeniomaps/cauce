'use strict'

// Elegir una tarea y reservarla, que es todo lo que pasa antes de planificar nada: la carrera con otra
// corrida, el reclamo que falla sobre el mismo slug, y la partición. Vive aparte de `autobuild.test.js`
// porque tiene otro reloj: allá se mide qué hace el recorrido construyendo y cerrando, y acá qué hace
// para conseguir —o soltar— una reserva, que cambia cuando cambian `claim` y `release`.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, runFlow } = require('../support/autobuild-harness')

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

// La mitad cara de perder la carrera: quedarse pegado sobre el mismo slug. El porqué del corte está en el
// recorrido, al lado de la condición; lo que se fija acá es que corte **a la primera** —una sola fase
// Claim— y que la parada arrastre lo que contestó el reclamo, que después es lo único que queda para
// diagnosticar.
//
// Las dos direcciones van juntas porque separadas no dicen nada: la prueba de arriba fija que perder la
// carrera **no** frena, y ésta que quedarse pegado **sí**. Un recorrido que frena siempre pasaría la
// segunda, y uno que no frena nunca pasaría la primera.
test('un reclamo que falla sobre la misma tarea para, en vez de reintentar sin fin', async () => {
  const pegado = { ...baseScript()[KEY.context], claimed: false }
  const { result, phases } = await runFlow(
    { [KEY.claim]: { claimed: false, details: 'T-1 no está en BACKLOG: sólo se toma trabajo ya promovido.' } },
    { contexts: [pegado, pegado, pegado] },
  )
  assert.equal(result.reason, 'claim-stuck', `no frenó: ${JSON.stringify(result).slice(0, 160)}`)
  assert.match(result.detail, /no está en BACKLOG/,
    'y la parada lleva lo que contestó el reclamo, que es lo que dice cuál de los dos defectos fue')
  assert.equal(phases.filter((one) => one === 'Claim').length, 1, 'reclamó una sola vez')
})

// Y la carrera perdida con la cola **todavía con trabajo**, que es la forma en que ocurre de verdad:
// quien la tomó ya la reclamó, así que `context` la saltea y ofrece la siguiente. Ahí el recorrido tiene
// que seguir, no frenar. Sin esta prueba, la condición que separa «perdí la carrera» de «me quedé
// pegado» se puede escribir de más y nada lo nota: el escenario de arriba deja la cola vacía, así que
// una parada que frenara siempre pasaría igual.
test('perder la carrera con cola pendiente sigue con la tarea que quedó libre', async () => {
  const base = baseScript()[KEY.context]
  const otra = { ...base, slug: 'T-2', claimed: false }
  const vacio = { ...base, hasTask: false, queued: 0 }
  const { result, phases } = await runFlow(
    { [KEY.claim]: { claimed: false, details: 'la tomó otro' }, 'Claim|claim:T-2': { claimed: true } },
    // La primera lectura es la que arranca la corrida: T-1. La segunda es la de después del reclamo
    // perdido, y ahí la cola ya ofrece la que quedó libre.
    { contexts: [base, otra, vacio, vacio] },
  )
  assert.equal(result.reason, undefined, `frenó: ${JSON.stringify(result).slice(0, 140)}`)
  assert.equal(phases.filter((one) => one === 'Claim').length, 2,
    'reclamó la que perdió y después la que quedó libre')
})

// Cambiar de tarea a mitad de corrida es correcto —la cola es la fuente de verdad— y no puede ser mudo:
// quien autorizó la corrida pidió un hito y va a recibir el cierre de una tarea que no eligió. Las dos
// vueltas que lo hacen lo dicen, y por eso se miden juntas: cubrir una sola deja la otra en silencio.
test('cambiar de tarea a mitad de corrida se dice, en las dos vueltas que lo hacen', async () => {
  const base = baseScript()[KEY.context]
  const otra = { ...base, slug: 'T-2', claimed: false }
  const vacio = { ...base, hasTask: false, queued: 0 }

  const carrera = await runFlow(
    { [KEY.claim]: { claimed: false, details: 'la tomó otro' }, 'Claim|claim:T-2': { claimed: true } },
    { contexts: [base, otra, vacio, vacio] },
  )
  assert.ok(carrera.said.some((text) => text.includes('T-1') && text.includes('sigue con T-2')),
    `la carrera perdida no dijo con qué sigue: ${JSON.stringify(carrera.said)}`)

  const partida = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, { ...otra, claimed: true }, vacio, vacio] },
  )
  assert.ok(partida.said.some((text) => text.includes('T-1') && text.includes('sigue con T-2')),
    `la partición no dijo con qué sigue: ${JSON.stringify(partida.said)}`)
})

// Por qué una tarea partida tiene que soltar su reserva está en la rama que la parte
// (automatization/workflows/autobuild.js). Lo que se fija acá son las dos cosas que ahí no se ven: que
// suelta **la partida** y no una subtarea —`T-1a` contiene a `T-1`, así que la aserción va por palabra
// entera—, y que lo hace después del reemplazo. La mitad de ausencia vive en la prueba de
// `split-not-applied`, que es donde el reemplazo no ocurre (caso 163).
test('una tarea partida suelta su reclamo antes de seguir', async () => {
  const base = baseScript()[KEY.context]
  const otra = { ...base, slug: 'T-2', claimed: true }
  const vacio = { ...base, hasTask: false, queued: 0 }

  const { prompts, asked } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, otra, vacio, vacio] },
  )

  const soltar = prompts.find((one) => one.key.startsWith('Decompose|') && /\brelease\b/.test(one.prompt))
  assert.ok(soltar, `la partición no soltó el reclamo: ${JSON.stringify(asked)}`)
  assert.match(soltar.prompt, /\bT-1\b/, 'y suelta la tarea partida, no otra')

  // El orden se compara sobre `asked` y no sobre el fuente: las dos llamadas se leen seguidas en el
  // archivo y eso no dice cuál corrió primero si una queda dentro de una rama que no se tomó.
  assert.ok(asked.indexOf('Decompose|split') < asked.indexOf(soltar.key),
    `soltó antes de reemplazar el BACKLOG: ${JSON.stringify(asked)}`)
})

// Por qué la épica tiene que moverse con la partición está junto a la consigna que la parte
// (automatization/workflows/autobuild.js). Acá se fija lo que ahí no se ve: que la épica se nombra por su
// id y no en abstracto —el agente tiene que saber cuál abrir— y, en el espejo de abajo, que una tarea
// suelta no reciba una instrucción sobre un roadmap que no la contiene (caso 169).
test('partir una tarea de una épica actualiza también sus historias', async () => {
  const base = baseScript()[KEY.context]
  const vacio = { ...base, hasTask: false, queued: 0 }
  const { prompts } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, { ...base, slug: 'T-2', claimed: true }, vacio, vacio] },
  )
  const split = prompts.find((one) => one.key === 'Decompose|split').prompt
  assert.match(split, /E1/, 'la consigna nombra la épica de la tarea que parte')
  assert.match(split, /[Hh]istoria/, 'y manda a reemplazar su historia, no sólo la línea del BACKLOG')
})

// Y el espejo, que es el que evita que la consigna mande a tocar una épica que no existe: una tarea
// suelta se parte sin nombrar ninguna.
test('partir una tarea sin épica no manda a tocar ningún roadmap', async () => {
  const base = { ...baseScript()[KEY.context], epic: '' }
  const vacio = { ...base, hasTask: false, queued: 0 }
  const { prompts } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, { ...base, slug: 'T-2', claimed: true }, vacio, vacio] },
  )
  const split = prompts.find((one) => one.key === 'Decompose|split').prompt
  assert.doesNotMatch(split, /[Hh]istoria/, 'sin épica no hay lista de historias que arreglar')
})

// Y la tercera lectura posible del mismo slug: la reserva **es nuestra** y quien la pidió contestó que
// no. Ahí frenar sería tirar una corrida por un error de reporte, y el estado lo desmiente — comprobado
// contra el motor: `context` devuelve `claimed: true` para el runner que reclamó, y otro slug para el que
// perdió la carrera. Por eso la parada mira las dos cosas y no sólo el slug.
test('un reclamo mal reportado no frena si el estado dice que la tarea es nuestra', async () => {
  const base = baseScript()[KEY.context]
  const nuestra = { ...base, claimed: true }
  const vacio = { ...base, hasTask: false, queued: 0 }
  const { result, phases } = await runFlow(
    { [KEY.claim]: { claimed: false, details: 'no supe leer el exit code' } },
    { contexts: [{ ...base, claimed: false }, nuestra, vacio] },
  )
  assert.equal(result.reason, undefined, `frenó: ${JSON.stringify(result).slice(0, 160)}`)
  assert.ok(phases.includes('Build'), 'y construyó la tarea que ya tenía reservada')
})

// Lo que se mide es la cola, no la escritura. Una escritura pedida a un agente siempre «sale bien», así
// que un corte escrito sobre ella pasaría en verde sin comprobar nada; el porqué está en el recorrido.
test('si el BACKLOG no cambió tras partir la tarea, el recorrido para', async () => {
  const grande = { ...baseScript()[KEY.context], claimed: true }
  const { result, prompts } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [grande, grande, grande] },
  )
  assert.equal(result.reason, 'split-not-applied', `no frenó: ${JSON.stringify(result).slice(0, 160)}`)
  assert.match(result.detail, /la escritura no ocurrió como se pidió/)

  // Y no suelta el reclamo: la tarea sigue viva, así que su reserva sigue siendo la correcta. Es la
  // mitad de ausencia del caso 163 — soltar antes de comprobar que el reemplazo ocurrió deja la tarea
  // en la cola y sin reservar, que se lee igual de bien y es el estado contrario al que hace falta.
  assert.deepEqual(prompts.filter((one) => /\brelease\b/.test(one.prompt)).map((one) => one.key), [],
    'soltó una reserva sobre una tarea que sigue en la cola')
})