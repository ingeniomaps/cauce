'use strict'

// Lo que el recorrido hace con el estado de planning al cerrar una tarea, y lo que le pasa a quien revisa
// cuando la corrida retoma. Las dos cosas quedaban para alguien: el commit de planning para la persona, y
// las condiciones de la crítica para un Review que no las recibía.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const promptOf = (prompts, key) => prompts.filter((one) => one.key === key).map((one) => one.prompt).join('\n')
const contract = (changes) => ({ [KEY.contract]: { ...baseScript()[KEY.contract], ...changes } })

// Caso 266. El cierre dejaba la cola, `done/` y el INBOX escritos y sin commitear. La rama es una sola que
// se acumula, que es lo que la separa del commit del producto, donde hay una por tarea.
test('al cerrar una tarea se commitea su estado de planning, en una sola rama de trabajo', async () => {
  const { result, prompts, asked } = await runFlow()
  ranToEnd(result)
  const prompt = promptOf(prompts, KEY.planningCommit)
  assert.match(prompt, /chore\(planning\): close T-1/)
  assert.match(prompt, /nunca archivos del producto/)
  assert.match(prompt, /la rama de trabajo de planning que ya exista/)
  assert.match(prompt, /nunca una por tarea/)
  assert.match(prompt, /Nunca amend ni push/)
  assert.ok(asked.indexOf(KEY.planningCommit) > asked.indexOf('Done|done'), 'después de escribir el cierre')

  const allowed = await runFlow(contract({ commitToLiveBranch: true }))
  ranToEnd(allowed.result)
  assert.match(promptOf(allowed.prompts, KEY.planningCommit), /Commiteá en la rama en la que esté ese repositorio/)
  assert.doesNotMatch(promptOf(allowed.prompts, KEY.planningCommit), /work\/planning/)
})

test('sin commit por tarea, tampoco se commitea planning', async () => {
  const { result, asked } = await runFlow(contract({ commitPerTask: false }))
  ranToEnd(result)
  assert.equal(asked.includes(KEY.planningCommit), false)
})

// La tarea ya se entregó: que el commit de planning no salga se dice, y no se reporta como una parada.
test('un commit de planning que no sale se dice y no frena la entrega', async () => {
  const failed = await runFlow({ [KEY.planningCommit]: { committed: false, reason: 'no hay rama de trabajo' } })
  ranToEnd(failed.result)
  assert.deepEqual(failed.result.done, ['T-1'])
  assert.ok(failed.said.some((line) => /planning de T-1 quedó sin commitear: no hay rama de trabajo/.test(line)),
    JSON.stringify(failed.said))

  const live = await runFlow({ [KEY.planningCommit]: { committed: true, hash: 'def456', branch: 'main', live: true } })
  ranToEnd(live.result)
  assert.ok(live.said.some((line) => /planning de T-1 quedó commiteado en la rama viva main/.test(line)))

  const fine = await runFlow()
  assert.ok(!fine.said.some((line) => /estado de planning/.test(line)), 'cuando sale bien no hay nada que avisar')
  const asked = await runFlow({ ...contract({ commitToLiveBranch: true }),
    [KEY.planningCommit]: { committed: true, hash: 'def456', branch: 'main', live: true } })
  assert.ok(!asked.said.some((line) => /rama viva/.test(line)), 'ni cuando el proyecto pidió commitear ahí')
})

// Caso 267. Al retomar no se pasa por la crítica, así que sus condiciones no están en memoria: Review
// recibe dónde leerlas. En una corrida que sí criticó el plan, las recibe escritas y no hace falta.
test('una corrida que retoma le dice a Review dónde están las condiciones de la crítica', async () => {
  const context = baseScript()[KEY.context]
  const resumed = await runFlow({}, { contexts: [
    { ...context, wipActive: true, wip: { phase: 'Build', complete: 1, pending: 2 } },
    { ...context, hasTask: false, wipActive: false, queued: 0 },
  ] })
  ranToEnd(resumed.result)
  const review = promptOf(resumed.prompts, KEY.review)
  assert.match(review, /retomó desde el WIP/)
  assert.ok(review.includes(`planning/${context.wipFile}`), 'nombra el archivo del WIP')
  assert.match(review, /comprobá sobre el diff que cada una se cumplió/)

  const fresh = await runFlow()
  assert.doesNotMatch(promptOf(fresh.prompts, KEY.review), /retomó desde el WIP/, 'sin retomar no se agrega nada')

  const NAMES = 'los identificadores nuevos van en inglés'
  const criticized = await runFlow({ [KEY.critique]: { verdict: 'con-condiciones', consulted: ['api/alta.go'],
    concerns: [{ detail: NAMES, blocking: true, replan: false }] } })
  const direct = promptOf(criticized.prompts, KEY.review)
  assert.ok(direct.includes(NAMES) && !/retomó desde el WIP/.test(direct),
    'con las condiciones en memoria van escritas')
})

// Caso 271. El checkpoint del hito se escribe después del último commit de planning, así que quedaba
// suelto en la instancia. Se commitea con la misma regla, y sólo si el proyecto commitea por tarea.
test('el checkpoint del hito también se commitea, con la regla de rama de planning', async () => {
  const gate = (prompts) => promptOf(prompts, 'Closing|human-checkpoint') || prompts
    .filter((one) => one.key.endsWith('|human-checkpoint')).map((one) => one.prompt).join('\n')
  const on = await runFlow(contract({ humanCheckpoint: true }))
  assert.match(gate(on.prompts), /chore\(planning\): await review of H1/)
  assert.match(gate(on.prompts), /y sólo ése/)
  assert.match(gate(on.prompts), /la rama de trabajo de planning que ya exista/)

  const off = await runFlow(contract({ humanCheckpoint: true, commitPerTask: false }))
  assert.ok(gate(off.prompts).includes('AWAITING_REVIEW'), 'el checkpoint se escribe igual')
  assert.doesNotMatch(gate(off.prompts), /await review of/, 'pero no se commitea')
})

// Caso 272. Lo que Review anota se recorta porque sigue entero en `done/`. La deuda de Build no queda en
// ningún otro lado: recortada, la entrada del INBOX terminaba en «…» y nadie tenía el resto.
test('la deuda que anota Build llega entera al INBOX', async () => {
  const long = `el módulo de informes no tiene pruebas ${'y sigue sin tenerlas '.repeat(20)}hasta el final`
  assert.ok(long.length > 300)
  const { prompts } = await runFlow({ [KEY.build]: { ...baseScript()[KEY.build],
    discovered: [{ kind: 'debt', detail: `${long}\nuna segunda línea que no viaja` }] } })
  const debt = prompts.filter((one) => one.key.endsWith('|build-debt')).map((one) => one.prompt).join('\n')
  assert.ok(debt.includes(`${long} (autobuild · T-1 · 2026-09-08)`), 'entera y con su remitente')
  assert.doesNotMatch(debt, /…/, 'sin recortar')
  assert.doesNotMatch(debt, /segunda línea/, 'y en una sola línea')
})

const BLOCKED = { [KEY.critique]: { verdict: 'bloqueado', consulted: ['api/alta.go'],
  concerns: [{ detail: 'falta decidir quién escribe las pruebas', blocking: true, replan: true }] } }

test('una parada que registra su fila commitea el estado de planning que dejó (caso 279)', async () => {
  const { result, asked, prompts } = await runFlow(BLOCKED)
  assert.equal(result.reason, 'plan-blocked')
  const key = 'Critique|planning-block'
  // Después de soltar el reclamo: en una corrida real el commit iba antes, llevaba el reclamo adentro y
  // soltarlo dejaba el árbol sucio otra vez.
  assert.ok(asked.indexOf(key) > asked.indexOf('Critique|release:T-1'), `después de soltar: ${asked}`)
  const prompt = promptOf(prompts, key)
  assert.match(prompt, /chore\(planning\): block T-1/)
  assert.match(prompt, /nunca archivos del producto/)
  assert.match(prompt, /work\/planning/, 'con la misma regla de ramas que el cierre')

  const off = await runFlow({ ...contract({ commitPerTask: false }), ...BLOCKED })
  assert.equal(off.result.reason, 'plan-blocked')
  assert.equal(off.asked.includes(key), false, 'mismo interruptor que el commit del cierre')

  // Las paradas que conservan el reclamo también dejan su fila commiteada.
  const ambiguous = await runFlow({ [KEY.verify]: { passed: true, details: 'verde',
    commands: [{ cmd: 'go test ./...', exitCode: 0 }],
    uncovered: [{ criterion: 'el alta es rápida', cause: 'ambiguous' }] } })
  assert.equal(ambiguous.result.reason, 'acceptance-ambiguous')
  assert.ok(ambiguous.asked.includes('Verify|planning-block'), ambiguous.asked)

  // Si no se pudo, la parada sigue siendo la que era y lo que quedó sin commitear se dice.
  const failed = await runFlow({ ...BLOCKED, [key]: { committed: false, reason: 'índice ocupado' } })
  assert.equal(failed.result.reason, 'plan-blocked')
  assert.ok(failed.said.some((line) => /parada de T-1 quedó sin commitear: índice ocupado/.test(line)), failed.said)
})

test('un plan frenado en la primera crítica no se registra como dos planes rechazados (caso 278)', async () => {
  const first = await runFlow(BLOCKED)
  const row = first.written.find((text) => text.includes('HUMAN_ACTIONS'))
  assert.doesNotMatch(row, /nadie pudo escribir un plan/, 'hubo un plan y una crítica')
  assert.match(row, /si es una decisión, tomarla/)
  assert.match(row, /Es una sola fila/, 'la crítica pudo haberla anotado ya')

  const second = await runFlow({
    [KEY.critique]: { verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'sigue mezclando dos resultados', blocking: true, replan: true }] },
    [KEY.replan]: { approach: 'otro intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit' },
  })
  assert.equal(second.result.reason, 'plan-rejected')
  assert.match(second.written.find((text) => text.includes('HUMAN_ACTIONS')), /nadie pudo escribir un plan/)
})
