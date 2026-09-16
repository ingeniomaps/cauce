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
  const { result } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [grande, grande, grande] },
  )
  assert.equal(result.reason, 'split-not-applied', `no frenó: ${JSON.stringify(result).slice(0, 160)}`)
  assert.match(result.detail, /la escritura no ocurrió como se pidió/)
})