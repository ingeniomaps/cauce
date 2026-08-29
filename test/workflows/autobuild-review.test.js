'use strict'

// Lo que hace el recorrido con un veredicto: cuándo corrige, cuándo frena y cuándo sólo anota. Un
// hallazgo que no impide entregar no puede costar una vuelta de código, y uno que sí no puede
// pasar — las dos mitades se miden acá porque cualquiera sola deja pasar la otra.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, ranToEnd, runFlow, reached, writesTo } = require('../support/autobuild-harness')

// Una decisión que quedó abierta se registra y no frena lo que sí se entregó. Frenaba, y en tres corridas
// reales frenó las tres veces con la tarea completa: toda aceptación en prosa tiene un borde indefinido, así
// que el freno saltaba siempre. Lo que de verdad bloquea sigue siendo completed:false con su blocker.
test('una decisión abierta queda escrita y el recorrido sigue', async () => {
  const { result, written } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', redFirst: [], closedTask: false,
      discovered: [{ kind: 'open', detail: 'nadie definió qué pasa con el alta sin país' }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'lo entregado se cierra igual')
  assert.ok(
    written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('sin país')),
    'y queda registrada con quién puede tomarla, o vuelve a aparecer sin dueño',
  )
})

// Lo que impide entregar no pasa por ese canal: el cargo no completa, y ahí sí frena.
test('lo que de verdad bloquea sigue frenando por su propio camino', async () => {
  const { result } = await runFlow({
    [KEY.build]: {
      completed: false, summary: 'x', redFirst: [], discovered: [], closedTask: false,
      blockers: ['sin credencial del proveedor de pagos'],
    },
  })
  assert.equal(result.reason, 'build-blocked')
  assert.match(result.detail, /credencial/)
})

// El plan y el diff tienen una corrección y una sola. Que la segunda vuelta exista es la mitad; la otra
// es que no haya una tercera, porque un recorrido que insiste hasta que le aprueben no revisa nada.
test('un review que rechaza corrige una vez y sigue si la segunda aprueba', async () => {
  let turn = 0
  const { result, written } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] }
    },
  })
  ranToEnd(result)
  assert.equal(turn, 2, 'la corrección se revisa de nuevo, no se da por buena')
  assert.ok(
    written.some((text) => text.includes('falta el caso vacío')),
    'y lo que hay que corregir viaja con el hallazgo, no como "arreglalo"',
  )
})

// El caso mira las dos fases con el mismo veredicto: el estado del medio entró por separado en Critique
// y en Review, y cubrir una sola deja pasar la otra sin que nada lo diga.
test('un veredicto bloqueado frena sin gastar una corrección', async () => {
  const review = await runFlow({
    [KEY.review]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'la aceptación pide un contrato que el diseño no define', blocking: true }],
    },
  })
  assert.equal(review.result.reason, 'review-blocked')
  assert.equal(writesTo(review.asked, 'Review'), 0, 'no se manda a corregir lo que la corrección no arregla')

  const critique = await runFlow({
    [KEY.critique]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el plan depende de una decisión que nadie tomó', blocking: true }],
    },
  })
  assert.equal(critique.result.reason, 'plan-blocked')
  assert.ok(!reached(critique.asked, 'Build'), 'y no se construye')
})

// Y un hallazgo que no impide entregar deja de costar una vuelta de código: se anota y la tarea cierra.
test('lo que no bloquea se anota y no manda a tocar código', async () => {
  const { result, written, asked } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el nombre del handler podría ser más claro', blocking: false }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  assert.equal(writesTo(asked, 'Review'), 1, 'una sola escritura en Review: la del registro, no una corrección')
  assert.ok(
    written.some((text) => text.includes('INBOX') && text.includes('nombre del handler')),
    'lo anotado queda donde alguien lo decide después, sin promover',
  )
})

test('un review que sigue rechazando después de corregir frena', async () => {
  const { result } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'sigue faltando el caso vacío', blocking: true }],
    },
  })
  assert.equal(result.reason, 'review-failed')
  assert.match(result.detail, /sigue faltando/)
})

// Un veredicto bloqueado nombra lo que lo bloquea, pero puede llegar sin nombrar nada. En la segunda
// pasada eso frenaba con el detalle vacío: el motivo es lo único que queda para leer cuando la corrida
// terminó, y la primera pasada ya tenía este respaldo.
test('un bloqueo sin condiciones nombradas frena igual y lo dice', async () => {
  let reviewTurn = 0
  const review = await runFlow({
    [KEY.review]: () => {
      reviewTurn += 1
      return reviewTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
  })
  assert.equal(review.result.reason, 'review-failed')
  assert.equal(review.result.detail, 'sin condiciones nombradas')

  let critiqueTurn = 0
  const critique = await runFlow({
    [KEY.critique]: () => {
      critiqueTurn += 1
      return critiqueTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(critique.result.reason, 'plan-rejected')
  assert.equal(critique.result.detail, 'sin condiciones nombradas')
})

test('un plan que no sobrevive a la segunda crítica no llega a construirse', async () => {
  const { result, asked } = await runFlow({
    [KEY.critique]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(result.reason, 'plan-rejected')
  assert.ok(!reached(asked, 'Build'), 'no se construye sobre un plan rechazado')
})
