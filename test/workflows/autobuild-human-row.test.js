'use strict'

// La fila que una parada registra bloquea por su `task` exacto (caso 349), y va en su propio archivo (caso
// 351). `LONG` es la forma que salió en una corrida real: la tarea, la épica y la decisión juntas en la clave.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, runFlow } = require('../support/autobuild-harness')

const NOT_READY = { [KEY.ready]: { ready: false, needsHuman: true, reason: 'falta la cota' } }
const LONG = '`T-1` (épica 024, `front`) — **Decidir cómo carga el CSS**'
const promptsOf = (out, key) => out.prompts.filter((one) => one.key === key).map((one) => one.prompt)
// La relectura contesta distinto en cada vuelta: lo que quedó escrito, y lo que quedó después de corregir.
const reads = (...answers) => {
  let turn = 0
  return () => {
    const tasks = answers[Math.min(turn, answers.length - 1)]
    turn += 1
    return { readOk: true, tasks }
  }
}

test('el pedido de la fila dice dónde va y cuál es su clave, y la relectura sólo transcribe', async () => {
  const out = await runFlow(NOT_READY)
  assert.equal(out.result.reason, 'not-ready')
  const [ask] = promptsOf(out, 'Ready|ready-human')
  assert.match(ask, /En task va T-1 solo, sin formato ni nada más/)
  assert.match(ask, /El archivo se llama T-1\.md, o T-1-2\.md si ése ya existe/, 'un bloqueo anterior no se pisa')
  assert.match(ask, /"status: pendiente"/, 'el estado va escrito, no sólo el nombre del campo')
  assert.match(ask, /Registrá T-1 en \S+planning\/human\/ con el motivo/)
  assert.match(ask, /Cada fila va en su propio archivo en \S+planning\/human\/, terminado en \.md, con un frontmatter/)
  // Lo que se quita: escribir en la tabla que todas las líneas comparten.
  assert.match(ask, /No edites HUMAN_ACTIONS\.md/)
  assert.doesNotMatch(ask, /en \S+HUMAN_ACTIONS\.md/)
  assert.match(ask, /es la clave con la que el motor bloquea/)
  const [read] = promptsOf(out, KEY.readyRow)
  assert.match(read, /Copiá en tasks el campo task de cada fila de humanActions, entero y tal cual/)
  // Lo que se quita: que un modelo decida si la fila es la de la tarea.
  assert.doesNotMatch(read, /pending/)
  assert.doesNotMatch(read, /sólo si humanActions trae una fila cuya task sea/)
  assert.doesNotMatch(out.result.detail, /no bloquea|no quedó pendiente/, 'con la fila bien escrita no avisa nada')
  assert.equal(promptsOf(out, KEY.readyRow).length, 1, 'ni la vuelve a leer')
})

test('una fila que nombra la tarea sin ser su slug se manda a corregir una vez y se relee', async () => {
  const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: reads([LONG], ['T-1']) })
  const [fix] = promptsOf(out, 'Ready|ready-human-key')
  assert.ok(fix, 'pidió la corrección')
  assert.ok(fix.includes(LONG), 'nombra la celda tal como quedó')
  assert.match(fix, /Dejá T-1 solo en ese campo/)
  assert.match(fix, /nace con estado `pendiente`/, 'y la corrección tampoco resuelve la fila')
  assert.equal(promptsOf(out, KEY.readyRow).length, 2)
  assert.doesNotMatch(out.result.detail, /no bloquea|no quedó pendiente/, 'corregida, no hay nada que avisar')
})

test('si después de corregir sigue sin bloquear, la parada lo dice con la celda que quedó', async () => {
  const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: reads([LONG]) })
  assert.equal(out.result.reason, 'not-ready', 'el motivo sigue siendo el de la parada')
  assert.match(out.result.detail, /la fila de T-1 en \S+planning\/human\/ no bloquea la tarea/)
  assert.ok(out.result.detail.includes(LONG))
  assert.equal(promptsOf(out, 'Ready|ready-human-key').length, 1, 'una sola corrección')
  assert.equal(promptsOf(out, KEY.readyRow).length, 2)
})

test('la fila de otra tarea cuyo slug empieza igual no se toma por la propia', async () => {
  const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: reads(['T-10', 'T-1-bis', 'pre-T-1']) })
  assert.equal(promptsOf(out, 'Ready|ready-human-key').length, 0, 'no manda a reescribir una fila ajena')
  assert.match(out.result.detail, /la fila de T-1 en .* no quedó pendiente/)
})

// La corrección reescribe una fila, así que sólo alcanza a la que empieza por el slug: una que lo nombra más
// adelante, o la de una tarea cuyo slug sigue con un punto, es de otro.
test('sólo se manda a corregir la celda que empieza por el slug', async () => {
  for (const cell of ['T-1.1', 'T-1/api', 'épica 024 (decisión de T-1)', 'T-1x']) {
    const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: reads([cell]) })
    assert.equal(promptsOf(out, 'Ready|ready-human-key').length, 0, cell)
  }
  for (const cell of ['**T-1: decidir el CSS**', '`T-1`', 'T-1 — decidir']) {
    const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: reads([cell], ['T-1']) })
    assert.equal(promptsOf(out, 'Ready|ready-human-key').length, 1, cell)
  }
})

test('si la relectura después de corregir no se puede leer, no se afirma nada sobre la fila', async () => {
  let turn = 0
  const blind = () => (turn++ ? { readOk: false, tasks: [] } : { readOk: true, tasks: [LONG] })
  const out = await runFlow({ ...NOT_READY, [KEY.readyRow]: blind })
  assert.match(out.result.detail, /no se pudo comprobar la fila de T-1/)
  assert.doesNotMatch(out.result.detail, /no bloquea la tarea/)
})