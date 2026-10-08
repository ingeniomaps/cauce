'use strict'

// Cuántas vueltas de corrección admite Review y qué las compra (caso 343). Lo que Review juzga, con qué
// reglas y a dónde va cada hallazgo sigue en `autobuild-review.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runFlow, ranToEnd, KEY } = require('../support/autobuild-harness')

// La re-revisión paraba con `review-failed` ante cualquier bloqueante, también uno nuevo, comprobado y cuya
// corrección el propio revisor escribió entera —«cambiar sólo esa frase»— (caso 343). Medido sobre los
// diarios de esta máquina: 24 de 40 correcciones terminaron así, las 24 con `con-condiciones` y un
// bloqueante que la primera pasada no había visto. Un hallazgo así declara `fixable` y compra una
// corrección más, con tope de dos por tarea: lo que no lo declara, y `bloqueado`, paran como hasta ahora.
const reviewedWith = (concerns, verdict = 'con-condiciones') => ({
  verdict, consulted: ['api/alta.go'], concerns,
})
const first = {
  detail: 'un dependiente de la quita dejó de correr como dice su encabezado', blocking: true, verified: true,
}
const second = {
  detail: 'un comentario sigue diciendo que las URLs salen del entorno: cambiar sólo esa frase',
  blocking: true, verified: true, decision: false, fixable: true,
}

test('un bloqueante nuevo, comprobado y corregible en la re-revisión compra una corrección más', async () => {
  let turn = 0
  const { result, asked, written } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1 ? reviewedWith([first]) : turn === 2 ? reviewedWith([second]) : reviewedWith([], 'aprobado')
    },
  })
  ranToEnd(result)
  assert.equal(turn, 3, 'la segunda corrección también se revisa')
  assert.equal(asked.filter((key) => key === 'Review|review-fix').length, 2)
  assert.ok(written.some((text) => text.includes('cambiar sólo esa frase')),
    'la segunda corrección viaja con su hallazgo')
  const done = written.find((text) => text.includes('corregido:')) || ''
  assert.ok(done.includes('dejó de correr') && done.includes('cambiar sólo esa frase'),
    'y las dos correcciones llegan a done/, no sólo la primera')
})

test('la tercera revisión con bloqueantes frena aunque sean corregibles', async () => {
  let turn = 0
  const { result, asked } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1 ? reviewedWith([first])
        : reviewedWith([{ ...second, detail: `otra frase más, vuelta ${turn}` }])
    },
  })
  assert.equal(result.reason, 'review-failed')
  assert.equal(turn, 3)
  assert.equal(asked.filter((key) => key === 'Review|review-fix').length, 2, 'el tope son dos correcciones')
})

test('un bloqueante nuevo que no se declara corregible sigue frenando a la segunda', async () => {
  let turn = 0
  const { result } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1 ? reviewedWith([first]) : reviewedWith([{ ...second, fixable: undefined }])
    },
  })
  assert.equal(result.reason, 'review-failed')
  assert.equal(turn, 2)
  assert.match(result.detail, /cambiar sólo esa frase/)
})
