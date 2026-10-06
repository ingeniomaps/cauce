'use strict'

// Lo que la crítica del plan deja para después de aprobarlo. Un bloqueante dice si pide otro plan o si es
// una condición para quien construye, y lo que no bloquea viaja igual: hasta 0.100.0 nada de la crítica
// pasaba de la crítica, así que lo que resolvía se perdía y lo que condicionaba paraba el recorrido.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, ranToEnd, runFlow, reached } = require('../support/autobuild-harness')

const NAMES = 'los dos identificadores nuevos van en inglés'
const REDS = 'la secuencia de rojos no ocurre como el plan la describe'
const REPLAN = { approach: 'corregido', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit' }
const critiqued = (...concerns) => ({ verdict: 'con-condiciones', consulted: ['api/alta.go'], concerns })
const promptOf = (prompts, key) => prompts.filter((one) => one.key === key).map((one) => one.prompt).join('\n')

// La forma de la corrida que originó el caso 248: la primera crítica pide corregir la secuencia de rojos
// y anota los nombres sin bloquear; la segunda bloquea por los nombres y dice que se corrigen al escribir.
const twoCritiques = (second) => {
  let turn = 0
  return {
    [KEY.critique]: () => (++turn === 1
      ? critiqued({ detail: REDS, blocking: true, replan: true },
        { detail: `${NAMES}; se decide inglés`, blocking: false, replan: false })
      : second),
    [KEY.replan]: REPLAN,
  }
}

test('una condición para quien construye no rechaza el plan: viaja a WIP, Build y Review', async () => {
  const { result, prompts } = await runFlow(twoCritiques(
    critiqued({ detail: NAMES, blocking: true, replan: false })))
  ranToEnd(result)
  for (const key of [KEY.wip, KEY.build, KEY.review]) {
    assert.ok(promptOf(prompts, key).includes(NAMES), `${key} no recibió la condición`)
  }
  assert.match(promptOf(prompts, KEY.review), /comprobá sobre el diff que cada una se cumplió/,
    'y Review sabe que tiene que comprobarla, no sólo que existe')
})

test('lo que cambia el plan sigue rechazándolo en la segunda crítica, aunque venga con una condición', async () => {
  const { result, asked } = await runFlow(twoCritiques(critiqued(
    { detail: 'sigue mezclando dos resultados', blocking: true, replan: true },
    { detail: NAMES, blocking: true, replan: false })))
  assert.equal(result.reason, 'plan-rejected')
  assert.match(result.detail, /sigue mezclando dos resultados/)
  assert.doesNotMatch(result.detail, /identificadores/, 'el motivo de la parada es lo que pide otro plan')
  assert.ok(!reached(asked, 'Build'), 'no se construye sobre un plan rechazado')
})

test('una condición sola en la primera crítica no compra corrección ni segunda crítica', async () => {
  const { result, asked, prompts } = await runFlow({
    [KEY.critique]: critiqued({ detail: NAMES, blocking: true, replan: false }),
  })
  ranToEnd(result)
  assert.ok(!asked.includes(KEY.replan), 'el plan no cambia, así que no se corrige')
  assert.equal(asked.filter((key) => key === KEY.critique).length, 1, 'ni se vuelve a criticar')
  assert.ok(promptOf(prompts, KEY.build).includes(NAMES), 'y la condición llega igual a quien construye')
})

test('una condición de la primera crítica sobrevive a la corrección aunque la segunda no la repita', async () => {
  let turn = 0
  const { result, prompts } = await runFlow({
    [KEY.critique]: () => (++turn === 1
      ? critiqued({ detail: REDS, blocking: true, replan: true }, { detail: NAMES, blocking: true, replan: false })
      : { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [] }),
    [KEY.replan]: REPLAN,
  })
  ranToEnd(result)
  assert.ok(!promptOf(prompts, KEY.replan).includes(NAMES), 'no va a la corrección: no cambia el plan')
  for (const key of [KEY.wip, KEY.build, KEY.review]) {
    assert.ok(promptOf(prompts, key).includes(NAMES), `${key} no recibió la condición`)
  }
})

test('lo que la primera crítica anotó sin bloquear llega a la corrección, con su límite', async () => {
  const { prompts } = await runFlow(twoCritiques({ verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [] }))
  const replan = promptOf(prompts, KEY.replan)
  assert.ok(replan.includes(REDS), 'lo que pide la corrección sigue llegando')
  assert.ok(replan.includes('se decide inglés'), 'y lo anotado también')
  assert.match(replan, /no amplíes el plan por el resto/, 'sin volverse una orden de ampliar')
})

test('lo que la crítica que aprueba anotó sin bloquear queda en el WIP, y no manda a tocar código', async () => {
  const noted = 'el aviso de éxito sobre una tarjeta desconectada es deuda de copy'
  const { result, prompts } = await runFlow({
    [KEY.critique]: critiqued({ detail: noted, blocking: false, replan: false }),
  })
  ranToEnd(result)
  const wip = promptOf(prompts, KEY.wip)
  assert.ok(wip.includes(noted), 'el WIP lo registra')
  assert.match(wip, /sin bloquear, que no manda a tocar\s+código/)
  assert.ok(!promptOf(prompts, KEY.build).includes(noted), 'a Build le llega por el WIP, no como condición')
  assert.ok(!promptOf(prompts, KEY.review).includes(noted), 'y Review no lo recibe como algo que comprobar')
})

// El pedido de quien lanzó la corrida llega a las dos críticas, no sólo a la primera: la segunda juzga un
// plan que sigue apoyándose en él.
test('las dos críticas reciben lo que se pidió al lanzar la corrida', async () => {
  const { prompts } = await runFlow(
    twoCritiques({ verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [] }),
    { args: 'los mensajes de error van en inglés' })
  const critiques = prompts.filter((one) => one.key === KEY.critique)
  assert.equal(critiques.length, 2)
  for (const one of critiques) assert.match(one.prompt, /Para que lo contrastes: [^.]*«los mensajes de error/)
})
