'use strict'

// El cierre de una corrida: qué dice `check`, quién repara cuando sale en rojo y qué llega al registro.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

// Caso 310. Si el planning quedó válido lo dice `check`, y lo trae quien corre comandos. Quien carga las
// reglas entra sólo cuando hay algo que reparar, y si quedó en verde lo vuelve a decir el comando.
const REPAIR = 'Closing|closing-repair'
const COMMIT = 'Closing|closing-commit'
const ROW = 'Closing|closing-human'
const BLOCK = 'Closing|planning-block'
const GREEN = { ok: true, errors: [], warnings: [], lessons: [] }
const RED = { ok: false, errors: ['done/T-0.md T-0: tests debe rastrear A/CN → prueba'], warnings: [], lessons: [] }
const STUCK = { ok: false, errors: ['done/T-0.md T-0: falta commit'], warnings: [], lessons: [] }
const FIXED = { fixed: ['planning/done/T-0.md'] }
const committed = { committed: true, hash: 'def456', branch: 'work/planning', live: false }
// `check` se lee dos veces cuando hay reparación: antes y después. Cada lectura contesta lo suyo.
const readings = (...answers) => { let at = 0; return () => answers[Math.min(at++, answers.length - 1)] }
const closed = (after, changes = {}, options) => runFlow(
  { [KEY.closing]: readings(RED, after), [REPAIR]: FIXED, [COMMIT]: committed, ...changes }, options)
const count = (run, key) => run.asked.filter((one) => one === key).length

test('con check en verde el cierre no llama a nadie más, y lo que check avisa llega al registro', async () => {
  const green = await runFlow()
  ranToEnd(green.result)
  assert.equal(count(green, KEY.closing), 1, 'una sola lectura')
  assert.ok(!green.asked.includes(REPAIR), 'en verde no hay nada que reparar')
  const prompt = green.prompts.find((one) => one.key === KEY.closing)
  assert.equal(prompt.agentType, 'cauce-clerk', 'correr check y copiar su salida es un paso de oficina')
  assert.match(prompt.prompt, /check \S+ --json" desde \S+ y copiá de su salida ok, errors y warnings tal cual/)
  assert.match(prompt.prompt, /No arregles nada/)
  assert.ok(!green.said.some((line) => /check avisa/.test(line)), 'sin avisos no se inventa ninguno')

  const warnings = ['.ops-approval: 1 ruta aprobada y sin borrar', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
  const warned = await runFlow({ [KEY.closing]: { ...GREEN, warnings } })
  ranToEnd(warned.result)
  assert.ok(warned.said.includes('check avisa: .ops-approval: 1 ruta aprobada y sin borrar'), 'textual')
  const shown = warned.said.filter((line) => line.startsWith('check avisa: ')).length
  assert.ok(shown < warnings.length, 'con tope')
  assert.ok(warned.said.includes(`check avisa ${warnings.length - shown} cosa(s) más`), 'y lo que no entra, contado')
})

test('con check en rojo repara quien carga las reglas, y el comando dice si quedó', async () => {
  const after = { ...GREEN, warnings: ['queda un aviso'] }
  const repaired = await closed(after)
  ranToEnd(repaired.result)
  const repair = repaired.prompts.find((one) => one.key === REPAIR)
  assert.equal(repair.agentType, '', 'reparar es juzgar: lleva las reglas del proyecto')
  assert.match(repair.prompt, /con estos errores: done\/T-0\.md T-0: tests debe rastrear A\/CN → prueba\./)
  assert.match(repair.prompt, /nunca reescribas aceptación, evidencia ni decisiones para forzar el verde/)
  // El veredicto de después es otra lectura del comando, hecha por quien no reparó.
  assert.equal(count(repaired, KEY.closing), 2)
  assert.ok(repaired.asked.indexOf(REPAIR) < repaired.asked.lastIndexOf(KEY.closing))
  const commit = repaired.prompts.find((one) => one.key === COMMIT)
  assert.equal(commit.agentType, 'cauce-scribe')
  assert.match(commit.prompt, /lo que cambió bajo \S+ —la reparación dice haber tocado planning\/done\/T-0\.md—/)
  assert.match(commit.prompt, /"chore\(planning\): repair closing state"/)
  assert.ok(repaired.said.some((line) => /check salió en rojo al cerrar y se reparó: done\/T-0\.md/.test(line)))
  assert.ok(repaired.said.includes('check avisa: queda un aviso'), 'los avisos son los de después de reparar')
  assert.ok(!repaired.asked.includes(ROW), 'reparado, no hay nada que pedirle a nadie')

  // Sin nada tocado no se llama al commit; un commit que no entra o que cae en la rama viva se dice.
  const untouched = await closed(GREEN, { [REPAIR]: { fixed: [] } })
  ranToEnd(untouched.result)
  assert.ok(!untouched.asked.includes(COMMIT))
  const loose = await closed(GREEN, { [COMMIT]: { committed: false, reason: 'un guard lo frenó' } })
  ranToEnd(loose.result)
  assert.ok(loose.said.includes('la reparación del cierre quedó sin commitear: un guard lo frenó'))
  const live = await closed(GREEN, { [COMMIT]: { ...committed, branch: 'main', live: true } })
  assert.ok(live.said.includes('la reparación del cierre quedó commiteada en la rama viva main: movela'))

  // Donde el proyecto no commitea por tarea, tampoco acá: se dice qué quedó tocado.
  const manual = await closed(GREEN,
    { [KEY.contract]: { ...baseScript()[KEY.contract], commitPerTask: false } })
  ranToEnd(manual.result)
  assert.ok(!manual.asked.includes(COMMIT))
  assert.ok(manual.said.some((line) => /tocó planning\/done\/T-0\.md y quedó sin commitear: el proyecto no/.test(line)))
})

test('las lecciones son las de después de reparar', async () => {
  const lesson = { name: 'reforzar-commits-r8', ref: 'planning/rules/system/commits.md#R8', tasks: ['alta', 'baja'] }
  const run = await closed({ ...GREEN, lessons: [lesson] })
  ranToEnd(run.result)
  assert.ok(run.written.some((one) => one.includes('reforzar-commits-r8')), 'la lección llega a anotarse')
})

test('lo que la reparación no deja en verde frena la corrida con lo que check dice, y deja una fila', async () => {
  const stuck = await closed(STUCK)
  assert.equal(stuck.result.reason, 'planning-check-failed')
  assert.match(stuck.result.detail, /falta commit/, 'el error es el de después de intentar, no el de antes')
  assert.doesNotMatch(stuck.result.detail, /tests debe rastrear/)
  assert.ok(!stuck.asked.includes(COMMIT))
  // Una fila para una persona, que no nombra a ninguna tarea ni al hito, y un solo commit de la parada.
  const row = stuck.prompts.find((one) => one.key === ROW).prompt
  assert.match(row, /La fila nace con estado `pendiente`/)
  assert.match(row, /Los errores, textuales: done\/T-0\.md T-0: falta commit\./)
  assert.match(row, /La primera columna es autobuild, nunca una tarea/)
  assert.equal(count(stuck, BLOCK), 1, 'la parada se commitea una vez')
  assert.ok(stuck.asked.indexOf(ROW) < stuck.asked.indexOf(BLOCK), 'la fila se escribe antes de commitear')
  const block = stuck.prompts.find((one) => one.key === BLOCK).prompt
  assert.match(block, /"chore\(planning\): record a closing check left red"/)

  const unwritten = await closed(STUCK, {}, { silent: ['closing-human'] })
  assert.match(unwritten.result.detail, /falta commit — la fila en \S+ no se pudo registrar: escribila a mano/)
  // Un rojo que no dice por qué no deja el mensaje vacío.
  const mute = await closed({ ...STUCK, errors: [] })
  assert.match(mute.result.detail, /check salió en rojo sin decir por qué/)
  const blank = await runFlow({ [KEY.closing]: readings({ ...RED, errors: [] }, GREEN), [REPAIR]: FIXED,
    [COMMIT]: committed })
  assert.match(blank.prompts.find((one) => one.key === REPAIR).prompt, /check salió en rojo sin decir por qué/)
})

test('un cierre o una reparación que no contestan frenan en vez de darse por buenos', async () => {
  assert.equal((await runFlow({ [KEY.closing]: null })).result.reason, 'agent-unavailable')
  assert.equal((await closed(GREEN, { [REPAIR]: null })).result.reason, 'agent-unavailable')
  const gone = await runFlow({ [KEY.closing]: readings(RED, null), [REPAIR]: FIXED, [COMMIT]: committed })
  assert.equal(gone.result.reason, 'agent-unavailable')
  assert.match(gone.result.detail, /después de reparar/)
})
