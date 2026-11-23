'use strict'

// Cuántas vueltas de corrección admite Review y qué las compra (caso 343): un bloqueante nuevo que declara
// fixable compra una más, con tope de dos por tarea; sin fixable, o con bloqueado, la corrida para. El porqué
// y la medición están en automatization/workflows/autobuild.js. Lo que Review juzga, con qué reglas y a dónde
// va cada hallazgo sigue en `autobuild-review.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runFlow, ranToEnd, KEY } = require('../support/autobuild-harness')

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
      // Cada re-revisión confirma lo que se mandó a corregir en la vuelta anterior (caso 484).
      return turn === 1 ? reviewedWith([first])
        : turn === 2 ? { ...reviewedWith([second]), previous: [{ id: 'r1-B1', fixed: true, evidence: 'x.js:1' }] }
          : { ...reviewedWith([], 'aprobado'), previous: [{ id: 'r2-B1', fixed: true, evidence: 'x.js:2' }] }
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

// Caso 511: las notas de Build van a `decisions:` de DONE como supuestos. La corrección cambiaba el código y no las
// notas, así que DONE afirmaba la versión que Review había mandado a deshacer. La corrección contesta qué notas dejó
// sin efecto y cuáles agrega, y DONE recibe eso.
test('las notas que la corrección deja sin efecto no llegan a done/, y las nuevas sí', async () => {
  let turn = 0
  const run = await runFlow({
    [KEY.build]: { completed: true, summary: 'ok', closedTask: false, redFirst: [{ test: 'TestAltaDuplicada',
      failure: 'want error, got nil' }], discovered: [
      { kind: 'note', detail: 'el subtotal ahora se redondea antes del impuesto' },
      { kind: 'note', detail: 'el servidor sigue llamando a total sin cupón' }] },
    [KEY.review]: () => {
      turn += 1
      return turn === 1 ? reviewedWith([first])
        : { ...reviewedWith([], 'aprobado'), previous: [{ id: 'r1-B1', fixed: true, evidence: 'x.js:1' }] }
    },
    'Review|review-fix': { dropped: [0], added: ['sin cupón se usa la fórmula de antes'] },
  })
  ranToEnd(run.result)
  const fix = run.prompts.find((one) => one.key === 'Review|review-fix').prompt
  assert.match(fix, /0: el subtotal ahora se redondea/, 'la corrección recibe las notas con su número')
  const done = run.written.find((text) => text.includes('notas-de-build=')) || ''
  assert.doesNotMatch(done, /se redondea antes del impuesto/, 'la que la corrección dejó sin efecto no llega')
  assert.match(done, /sigue llamando a total sin cupón/, 'la que sigue valiendo, sí')
  assert.match(done, /sin cupón se usa la fórmula de antes/, 'y la nueva también')
})
