'use strict'

// El rol de la sesión cuando una tarea la construye una y la revisa otra (caso 430). Qué corre cada rol lo dice el paso
// 12 de PROTOCOL.md, y por qué cada desvío del recorrido, `automatization/workflows/autobuild.js`, junto a cada uno.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, NO_TASK } = require('../support/autobuild-harness')

const base = () => baseScript()[KEY.context]
// El WIP que deja quien construye: la tarea reclamada, los pasos tildados y la fase que la entrega.
const inPhase = (phase, pending = 0) => ({ ...base(), claimed: true, wipActive: true,
  wip: { phase, complete: 1, pending } })
// El WIP que deja quien revisa al devolver: en Build y con el paso que nombra los hallazgos sin tildar.
const RETURNED_WIP = inPhase('Build', 1)
const REBUILT = 'Build (reanudado)'
const FOUND = {
  [`${REBUILT}|commit-found`]: { committed: true, hash: 'abc123', branch: 'task/T-1' },
  [`${REBUILT}|build-evidence`]: { completed: true, closedTask: false, summary: 'construida en otra sesión',
    redFirst: [{ id: 'r1', test: 'TestAltaDuplicada', failure: 'want error, got nil' }], discovered: [] },
}
const reviewing = (changes = {}, contexts = [inPhase('Review'), RETURNED_WIP]) =>
  runFlow({ ...FOUND, ...changes }, { args: '--role review', contexts })
const FINDING = {
  detail: 'el alta acepta un duplicado con mayúsculas', blocking: true, verified: true, decision: false, fixable: true,
}
const returnedBy = (run, label) => {
  assert.equal(run.result.reason, 'review-returned', JSON.stringify(run.result).slice(0, 200))
  const prompt = run.prompts.find((one) => one.key.endsWith(`|${label}`))
  assert.ok(prompt, `no devolvió por ${label}: ${run.asked.join(', ')}`)
  assert.match(prompt.prompt, /## Bloqueos/)
  assert.match(prompt.prompt, /un paso sin tildar.*Corregir los hallazgos de ## Bloqueos/)
  assert.match(prompt.prompt, /phase de su frontmatter en Build/)
  return prompt
}

test('quien construye verifica y commitea, no se revisa, y entrega con su evidencia en el WIP', async () => {
  for (const args of ['--role build', { role: 'build' }]) {
    const run = await runFlow({}, { args, contexts: [base(), inPhase('Review')] })
    assert.equal(run.result.reason, 'review-pending', JSON.stringify(run.result).slice(0, 200))
    assert.match(run.result.detail, /commiteada \(abc123\).*--role review/)
    for (const phase of ['Build', 'Verify', 'Commit']) assert.ok(run.phases.includes(phase), `${phase}: ${run.phases}`)
    for (const phase of ['Review', 'QA', 'Done']) assert.ok(!run.phases.includes(phase), `${phase}: ${run.phases}`)
    const handoff = run.prompts.find((one) => one.key === 'Commit|handoff')
    assert.match(handoff.prompt, /en Review el phase del frontmatter/)
    assert.match(handoff.prompt, /## Evidencia de Build.*"test":"TestAltaDuplicada"/)
    assert.match(handoff.prompt, /Si ya hay una .* queda una sola/)
    assert.ok(!run.asked.some((key) => key.startsWith('release:') || key.endsWith('|release:T-1')), 'soltó la reserva')
    assert.ok(!run.prompts.some((one) => /pidió.*--role/.test(one.prompt)), 'el rol viajó como pedido')
  }
})

test('quien construye no da por entregado un WIP que no quedó en Review, ni retoma uno ya entregado', async () => {
  const lost = await runFlow({}, { args: '--role build', contexts: [base(), inPhase('Build')] })
  assert.equal(lost.result.reason, 'wip-not-persisted')
  const again = await runFlow({}, { args: '--role build', contexts: [inPhase('Review')] })
  assert.equal(again.result.reason, 'review-pending')
  assert.ok(!again.asked.includes(KEY.build) && !again.asked.includes(KEY.commit), again.asked.join(', '))
})

// Sin rol tampoco: la entregó una sesión para que la revise otra, y retomarla como propia revisaría un árbol limpio sin
// el commit de quien la construyó.
test('una corrida sin rol no retoma una tarea entregada para revisar', async () => {
  const run = await runFlow({}, { contexts: [inPhase('Review')] })
  assert.equal(run.result.reason, 'review-pending', JSON.stringify(run.result).slice(0, 200))
  assert.match(run.result.detail, /--role review/)
  for (const key of [KEY.build, KEY.review, KEY.commit]) assert.ok(!run.asked.includes(key), key)
})

test('con commitPerTask apagado, quien construye no dice que commiteó', async () => {
  const off = { [KEY.contract]: { ...baseScript()[KEY.contract], commitPerTask: false } }
  const run = await runFlow(off, { args: '--role build', contexts: [base(), inPhase('Review')] })
  assert.equal(run.result.reason, 'review-pending')
  assert.match(run.result.detail, /sin commit \(runner\.commitPerTask está apagado\)/)
})

test('quien revisa juzga el commit de quien construyó, con su evidencia, y la cierra', async () => {
  const run = await reviewing({}, [inPhase('Review'), NO_TASK])
  ranToEnd(run.result)
  for (const phase of ['Review', 'Verify', 'QA', 'Done']) assert.ok(run.phases.includes(phase), phase)
  for (const key of [KEY.claim, KEY.plan, KEY.build, KEY.commit]) assert.ok(!run.asked.includes(key), key)
  // Git filtra por texto fijo y la salida trae el valor de cada trailer, que se compara exacto. Por qué así, junto a la
  // búsqueda, en `autobuild.js`.
  const found = run.prompts.find((one) => one.key === `${REBUILT}|commit-found`).prompt
  assert.match(found,
    /git log --reverse -F --grep='Task: T-1' --format='%h %\(trailers:key=Task,valueonly,separator=%x2C\)'/)
  assert.match(found, /entre sus valores separados por coma, uno es exactamente T-1/)
  // Un slug con apóstrofo va citado para el shell.
  const quoted = await reviewing({}, [{ ...inPhase('Review'), slug: "fix-user's-login" }, NO_TASK])
  assert.match(quoted.prompts.find((one) => one.key === `${REBUILT}|commit-found`).prompt,
    /--grep='Task: fix-user'\\''s-login'/)
  assert.match(run.prompts.find((one) => one.key === KEY.review).prompt,
    /el diff es el de abc123.*git show de cada uno/)
  assert.match(run.prompts.find((one) => one.key === 'Done|done').prompt, /commit=abc123/)

  // Aunque quien construyó haya dejado un paso sin tildar: completarlo es construir, y no es de quien revisa.
  const left = await reviewing({}, [inPhase('Review', 1), NO_TASK])
  assert.ok(!left.asked.includes(KEY.build), left.asked.join(', '))
  // Y la evidencia que trajo pesa en sus puertas: si declara pruebas en rojo y ningún gate corre una, se devuelve.
  const untested = await reviewing({ [KEY.verify]: { passed: true, details: 'lint', uncovered: [],
    commands: [{ cmd: 'eslint .', exitCode: 0 }] } })
  assert.match(returnedBy(untested, 'verify-return').prompt, /declara pruebas en rojo y ningún gate corrió una/)
})

// Después de una devolución la tarea tiene dos commits: se revisan los dos y `done/` cita los dos, cada uno con su
// sufijo, como pide R8.
test('quien revisa una tarea devuelta mira y cita todos sus commits', async () => {
  const twice = { [`${REBUILT}|commit-found`]: { committed: true, hash: 'abc123; def456', branch: 'task/T-1' } }
  const run = await reviewing(twice, [inPhase('Review'), NO_TASK])
  ranToEnd(run.result)
  assert.match(run.prompts.find((one) => one.key === `${REBUILT}|commit-found`).prompt, /--reverse/)
  assert.match(run.prompts.find((one) => one.key === KEY.review).prompt, /el diff es el de abc123; def456/)
  assert.match(run.prompts.find((one) => one.key === 'Done|done').prompt,
    /commit=abc123 \(\S+@task\/T-1\); def456 \(\S+@task\/T-1\), con cada sufijo copiado tal cual/)
})

test('la evidencia de quien construyó que no se sostiene vuelve a quien la construyó', async () => {
  const hollow = { [`${REBUILT}|build-evidence`]: { completed: true, closedTask: false, summary: 'otra sesión',
    redFirst: [{ id: 'r1', test: 'TestAltaDuplicada', failure: '' }], discovered: [] } }
  assert.match(returnedBy(await reviewing(hollow), 'build-return').prompt, /se declara en rojo sin el fallo/)
  const loose = { [`${REBUILT}|build-evidence`]: { completed: true, closedTask: false, summary: 'otra sesión',
    redFirst: [{ id: 'r1', test: 'TestAltaDuplicada', failure: 'want error, got nil' }],
    discovered: [{ kind: 'edge', detail: 'el alta con espacios', test: 'TestEspacios', red: 'r9' }] } }
  assert.match(returnedBy(await reviewing(loose), 'build-return').prompt, /su prueba no es ningún rojo declarado/)
})

test('sin el commit de quien construyó, quien revisa no revisa el árbol', async () => {
  for (const found of [{ committed: false, reason: 'git log no devolvió nada' }, { committed: true, hash: ' ' }]) {
    const run = await reviewing({ [`${REBUILT}|commit-found`]: found })
    assert.equal(run.result.reason, 'review-not-ready', JSON.stringify(found))
    assert.ok(!run.asked.includes(KEY.review))
  }
  const off = await reviewing({ [KEY.contract]: { ...baseScript()[KEY.contract], commitPerTask: false } },
    [inPhase('Review'), NO_TASK])
  ranToEnd(off.result)
  assert.ok(!off.asked.includes(`${REBUILT}|commit-found`))
  assert.match(off.prompts.find((one) => one.key === KEY.review).prompt, /el diff es el del árbol/)
})

test('quien revisa no corrige: devuelve con los hallazgos y un paso pendiente', async () => {
  const rejected = { [KEY.review]: { verdict: 'con-condiciones', consulted: ['api/alta.go'], concerns: [FINDING] } }
  const run = await reviewing(rejected)
  assert.match(returnedBy(run, 'review-return').prompt, /mayúsculas/)
  assert.ok(!run.asked.some((key) => key.endsWith('|review-fix')), 'corrigió el código')
  for (const phase of ['Verify', 'QA', 'Done']) assert.ok(!run.phases.includes(phase), phase)
  // Y si el WIP no quedó devuelto con su paso pendiente, no lo da por devuelto: la vuelta siguiente no construiría.
  const stuck = await reviewing(rejected, [inPhase('Review'), inPhase('Build')])
  assert.equal(stuck.result.reason, 'wip-not-persisted')
})

// Por qué lo que no bloquea sigue y una revisión bloqueada para, en vez de devolverse: junto a las dos ramas, en
// `autobuild.js`.
test('quien revisa no devuelve lo que no bloquea, y una revisión bloqueada para diciendo cómo se retoma', async () => {
  const noted = { [KEY.review]: { verdict: 'con-condiciones', consulted: ['api/alta.go'], rules: [], critical: '',
    concerns: [{ ...FINDING, blocking: false, proposes: true, ref: 'criterio' }] } }
  const run = await reviewing(noted, [inPhase('Review'), NO_TASK])
  ranToEnd(run.result)
  assert.ok(!run.asked.some((key) => key.endsWith('|review-return')), 'devolvió sin nada que corregir')

  const blocked = await reviewing({ [KEY.review]: { verdict: 'bloqueado', consulted: ['api/alta.go'], rules: [],
    critical: '', concerns: [{ ...FINDING, ref: 'criterio', proposes: false, fixable: false }] } })
  assert.equal(blocked.result.reason, 'review-blocked', JSON.stringify(blocked.result).slice(0, 200))
  assert.match(blocked.result.detail, /mayúsculas/)
  assert.match(blocked.result.detail, /volvé a correr \/autobuild --role review/)
  assert.ok(!blocked.asked.some((key) => key.endsWith('|review-return')), 'devolvió una revisión bloqueada')
})

test('quien revisa tampoco escribe la prueba que falta ni arregla un gate: devuelve', async () => {
  const missing = await reviewing({ [KEY.verify]: { passed: true, details: 'verde',
    uncovered: [{ criterion: 'el alta rechaza un duplicado', cause: 'missing-test' }],
    commands: [{ cmd: 'go test ./...', exitCode: 0 }] } })
  assert.match(returnedBy(missing, 'verify-return').prompt, /sin prueba que lo codifique: el alta rechaza un duplicado/)
  assert.ok(!missing.asked.some((key) => key.endsWith('|missing-tests')), 'escribió pruebas')
  const red = await reviewing({ [KEY.verify]: { passed: false, details: 'go test: 1 failed', uncovered: [],
    commands: [{ cmd: 'go test ./...', exitCode: 1 }] } })
  assert.match(returnedBy(red, 'verify-return').prompt, /los gates no pasan sobre lo commiteado: go test: 1 failed/)
  // Con los dos a la vez, tampoco: el bucle que escribe pruebas no llega a correr.
  const both = await reviewing({ [KEY.verify]: { passed: false, details: 'go test: 1 failed',
    uncovered: [{ criterion: 'el alta rechaza un duplicado', cause: 'missing-test' }],
    commands: [{ cmd: 'go test ./...', exitCode: 1 }] } })
  const back = returnedBy(both, 'verify-return').prompt
  assert.match(back, /los gates no pasan/)
  assert.match(back, /sin prueba que lo codifique: el alta rechaza un duplicado/)
  assert.ok(!both.asked.some((key) => key.endsWith('|missing-tests')), 'escribió pruebas con los gates en rojo')
  const qa = await reviewing({ [KEY.qa]: { passed: false, evidence: 'el alta acepta el duplicado' } })
  assert.match(returnedBy(qa, 'qa-return').prompt, /QA en rojo: el alta acepta el duplicado/)
})

test('quien revisa no toma una tarea que nadie entregó', async () => {
  for (const context of [base(), inPhase('Build')]) {
    const run = await runFlow({}, { args: '--role review', contexts: [context] })
    assert.equal(run.result.reason, 'review-not-ready', JSON.stringify(run.result).slice(0, 200))
    assert.ok(!run.asked.includes(KEY.claim), 'reclamó una tarea para construirla')
  }
})

test('un rol que no existe para antes de gastar un agente, en vez de correr entero', async () => {
  const run = await runFlow({}, { args: '--role reveiw' })
  assert.equal(run.result.reason, 'role-unknown')
  assert.deepEqual(run.asked, [])
})
