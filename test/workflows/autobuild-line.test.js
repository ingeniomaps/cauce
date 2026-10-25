'use strict'

// Dónde trabaja el recorrido (caso 274): se mide que el árbol por tarea aparezca sólo en una línea, que
// cada fase reciba la ruta, y que a planning siga viajando el servicio como lo nombra la tarea.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached } = require('../support/autobuild-harness')

const TREE = { ok: true, path: '/linea/api-T-1', work: '/linea/api-T-1/src', branch: 'task/T-1', repo: '/original/api' }
const WORKTREE = 'Worktree|worktree:T-1'
const inLine = (changes = {}, context = {}) => ({
  [KEY.context]: { ...baseScript()[KEY.context], line: 'admin', ...context },
  [KEY.contract]: { ...baseScript()[KEY.contract], gates: ['.. → npm --prefix api test'] },
  [WORKTREE]: TREE,
  [KEY.commit]: { committed: true, hash: 'abc123', branch: 'feat/T-1', live: false },
  ...changes,
})
const promptOf = (prompts, key) => prompts.filter((one) => one.key === key).map((one) => one.prompt).join('\n')

test('fuera de una línea no se arma ningún árbol: se trabaja en la carpeta que está', async () => {
  const { result, asked, prompts } = await runFlow({ [KEY.contract]: inLine()[KEY.contract] })
  ranToEnd(result)
  assert.ok(!reached(asked, 'Worktree'), `no hay con quién pisarse: ${asked}`)
  for (const key of [KEY.build, KEY.review, KEY.verify, KEY.qa, KEY.commit]) {
    assert.doesNotMatch(promptOf(prompts, key), /árbol de trabajo/, key)
  }
  assert.doesNotMatch(promptOf(prompts, KEY.verify), /ruta cambiada/, 'la puerta corre tal cual')
  assert.match(promptOf(prompts, KEY.commit), /git switch -c <tipo>\/T-1/, 'la rama se corta en el lugar')
})

test('en una línea la tarea se construye en un árbol propio, y todas las fases lo saben', async () => {
  const { result, asked, prompts } = await runFlow(inLine())
  ranToEnd(result)
  assert.ok(asked.indexOf(WORKTREE) < asked.indexOf(KEY.plan), 'antes de planificar, que ya inspecciona el código')
  assert.match(promptOf(prompts, WORKTREE), /ops\.js worktree \S+ T-1 --json/)
  for (const key of [KEY.build, KEY.review, KEY.verify, KEY.qa]) {
    const prompt = promptOf(prompts, key)
    assert.ok(prompt.includes(TREE.work), `${key} no sabe dónde está el trabajo`)
    assert.match(prompt, /no en el checkout compartido/, key)
  }
  assert.ok(promptOf(prompts, KEY.plan).includes(`dentro de ${TREE.work}`), 'el plan mira el árbol de la tarea')
  assert.ok(promptOf(prompts, KEY.verify).includes(`esa ruta cambiada por ${TREE.work}`),
    'la puerta declarada apunta al checkout compartido, que no tiene la tarea (caso 276)')

  // Commit: en el árbol, sin cortar otra rama; la renombra a la forma de siempre y saca el árbol.
  const commit = promptOf(prompts, KEY.commit)
  assert.ok(commit.includes(`el árbol de trabajo ${TREE.path}`))
  assert.match(commit, /git branch -m <tipo>\/T-1/)
  assert.ok(commit.includes(`git -C ${TREE.repo} worktree remove ${TREE.path}`), 'la rama queda, el árbol no')
  assert.doesNotMatch(commit, /git switch -c/, 'no corta una rama en el checkout que comparten las líneas')

  // Lo que viaja a planning sigue nombrando el servicio como lo declara la tarea, no una ruta de un árbol
  // que al cerrar ya no existe.
  assert.match(promptOf(prompts, KEY.wip), /service=\.\/api,/)
  assert.match(promptOf(prompts, 'Done|done'), /commit=abc123 \(\.\/api@/)
})

test('si el árbol no se puede armar, la corrida para antes de planificar', async () => {
  const { result, asked } = await runFlow(inLine({ [WORKTREE]: { ok: false, details: 'la tomó otro' } }))
  assert.equal(result.reason, 'worktree-failed')
  assert.match(result.detail, /T-1: la tomó otro/)
  assert.ok(!reached(asked, 'Plan') && !reached(asked, 'Build'), 'sin gastar en lo que no va a poder construir')

  const sinRuta = await runFlow(inLine({ [WORKTREE]: { ok: true } }))
  assert.equal(sinRuta.result.reason, 'worktree-failed', 'un sí sin dónde trabajar tampoco alcanza')
})

test('al retomar en una línea se vuelve al mismo árbol', async () => {
  const context = { ...baseScript()[KEY.context], line: 'admin' }
  const { result, asked, prompts } = await runFlow({ [WORKTREE]: TREE }, { contexts: [
    { ...context, wipActive: true, wip: { phase: 'Build', complete: 1, pending: 2 } },
    { ...context, hasTask: false, wipActive: false, queued: 0 },
  ] })
  ranToEnd(result)
  assert.ok(asked.includes(WORKTREE), 'el comando reusa el árbol que ya existe')
  assert.ok(!reached(asked, 'Plan'), 'y no vuelve a planificar')
  assert.ok(promptOf(prompts, KEY.build).includes(TREE.work))
})

test('a done/ no viaja ni la rama provisional ni la ruta de un árbol que ya no existe', async () => {
  const seen = `git diff en ${TREE.work} (rama ${TREE.branch})`
  const { result, prompts } = await runFlow(inLine({
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: [seen] },
    [KEY.verify]: { passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: `npm --prefix ${TREE.path} test`, exitCode: 0 }] },
    [KEY.qa]: { passed: true, evidence: `require del módulo en ${TREE.work}` },
  }))
  ranToEnd(result)
  const done = promptOf(prompts, 'Done|done')
  assert.ok(!done.includes(TREE.path) && !done.includes(TREE.branch), done)
  assert.match(done, /git diff en \.\/api \(rama feat\/T-1\)/, 'la revisión queda sobre lo que hay')
  assert.match(done, /npm --prefix \.\/api test/)

  // Fuera de una línea no hay nada que traducir: lo que la revisión cita llega como lo citó.
  const plain = await runFlow({ [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: [seen] } })
  assert.ok(promptOf(plain.prompts, 'Done|done').includes(seen))
})

// Caso 347. El checkpoint del hito dice qué línea lo escribió, y eso es lo que hace que frene sólo a ésa.
test('en una línea el checkpoint del hito lleva el nombre de la línea', async () => {
  const withGate = { ...inLine()[KEY.contract], humanCheckpoint: true }
  const { result, written } = await runFlow(inLine({ [KEY.contract]: withGate }))
  ranToEnd(result)
  const gate = written.find((text) => text.includes('planning/checkpoints/H1.md')) || ''
  assert.match(gate, /"hito: H1" y "line: admin"/)
  assert.doesNotMatch(gate, /"line:" a secas/)
})

// El archivo lo escribe un agente, y un `line:` mal escrito deja el checkpoint pendiente sin frenar a su
// línea. Por eso se relee `context` después de escribirlo: lo que cuenta es que frene, no que exista.
test('el checkpoint recién escrito se relee, y si no frena se corrige una vez y se dice', async () => {
  const withGate = { ...inLine()[KEY.contract], humanCheckpoint: true }
  const held = (...answers) => {
    let turn = 0
    return () => answers[Math.min(turn++, answers.length - 1)]
  }
  const run = (answers) => runFlow(inLine({ [KEY.contract]: withGate, 'Closing|checkpoint-held': held(...answers) }))
  const open = { readOk: true, blocked: '', checkpoints: [] }
  const closed = { readOk: true, blocked: 'awaiting-review', checkpoints: ['checkpoints/H1.md'] }
  const fixes = (out) => out.prompts.filter((one) => one.key === 'Closing|human-checkpoint-fix')

  const fine = await run([closed])
  assert.equal(fixes(fine).length, 0)
  assert.equal(fine.result.checkpoint, undefined, 'frenando, no hay nada que avisar')

  const repaired = await run([open, closed])
  assert.equal(fixes(repaired).length, 1)
  assert.match(fixes(repaired)[0].prompt, /status: pendiente.*hito: H1.*line: admin/s)
  assert.equal(repaired.result.checkpoint, undefined)
  assert.deepEqual(repaired.result.done, ['T-1'], 'la tarea se entregó igual')

  const stuck = await run([open])
  assert.equal(fixes(stuck).length, 1, 'una sola corrección')
  assert.match(stuck.result.checkpoint, /checkpoints\/H1\.md no quedó frenando a esta línea/)
  // Frenada por otro —el archivo de siempre, el de otro hito— no es frenada por éste: resuelto aquél, la
  // corrida siguiente arrancaría sin esta revisión.
  const other = { readOk: true, blocked: 'awaiting-review', checkpoints: ['AWAITING_REVIEW.md', 'checkpoints/H0.md'] }
  const elsewhere = await run([other])
  assert.equal(fixes(elsewhere).length, 1)
  assert.match(elsewhere.result.checkpoint, /checkpoints\/H1\.md no quedó frenando a esta línea/)
  const both = await run([{ ...other, checkpoints: [...other.checkpoints, '"checkpoints/H1.md"'] }])
  assert.equal(fixes(both).length, 0, 'con el propio entre los que frenan, está bien')
  const blind = await run([{ readOk: false, blocked: '', checkpoints: [] }])
  assert.match(blind.result.checkpoint, /no se pudo comprobar/)
  assert.equal(fixes(blind).length, 0, 'sin lectura no se reescribe nada')
})

// La línea llega transcripta por un agente, y un valor vacío a veces llega con sus comillas escritas.
test('una línea que llega entre comillas o no es un nombre no se escribe en el checkpoint', async () => {
  const withGate = { ...inLine()[KEY.contract], humanCheckpoint: true }
  const gateOf = async (line) => {
    const out = await runFlow(inLine({ [KEY.contract]: withGate }, { line }))
    return out.written.find((text) => text.includes('planning/checkpoints/H1.md')) || ''
  }
  assert.match(await gateOf('"admin"'), /"line: admin"/)
  assert.match(await gateOf("'admin'"), /"line: admin"/)
})


// Caso 394: la sesión dice su línea al lanzar, `/autobuild pagos`. Cuándo el nombre solo es la línea, junto a
// `LINE_FLAG` en `autobuild.js`.
const declared = (changes = {}) => ({ [KEY.contract]: { ...baseScript()[KEY.contract], lines: ['pagos'] },
  ...changes })
const asked = (prompts, pattern) => prompts.filter((one) => pattern.test(one.prompt)).map((one) => one.prompt)

test('la línea sale del argumento, y los comandos que contestan por la sesión la llevan', async () => {
  for (const args of ['pagos', '--line pagos', { line: 'pagos' }]) {
    const { result, prompts } = await runFlow(declared(), { args })
    ranToEnd(result)
    const commands = asked(prompts, /tools\/ops\.js (context|claim|release) /)
    assert.ok(commands.length > 1, JSON.stringify(args))
    for (const prompt of commands) {
      assert.match(prompt, /tools\/ops\.js (context|claim|release) \S+( T-1)? --line pagos[" ]/, JSON.stringify(args))
    }
    assert.doesNotMatch(prompts.map((one) => one.prompt).join('\n'), /pidió[^»]*«pagos»/,
      'el nombre de la línea se tomó por un pedido')
  }

  // Con la bandera, lo demás del texto sigue siendo el pedido.
  const both = await runFlow(declared(), { args: '--line pagos sólo esta tarea' })
  assert.match(promptOf(both.prompts, KEY.build), /pidió, para todas sus tareas: «sólo esta tarea»/)

  // El nombre solo que no está declarado es un pedido, y ningún comando lleva --line.
  const loose = await runFlow({}, { args: 'pagos' })
  assert.doesNotMatch(loose.prompts.map((one) => one.prompt).join('\n'), /--line/)
  assert.match(promptOf(loose.prompts, KEY.build), /pidió, para todas sus tareas: «pagos»/)
})

test('en una línea declarada se construye y se commitea en el árbol de la línea, sin retirarlo', async () => {
  const LINE_TREE = { ok: true, path: '/s/lines/pagos/api', work: '/s/lines/pagos/api', branch: 'line/pagos',
    repo: '/s/api', line: 'pagos' }
  const { result, prompts } = await runFlow(inLine({ ...declared(), [WORKTREE]: LINE_TREE }, { line: 'pagos' }),
    { args: 'pagos' })
  ranToEnd(result)
  assert.match(promptOf(prompts, WORKTREE), /ops\.js worktree \S+ T-1 --line pagos --json/)
  assert.ok(promptOf(prompts, KEY.build).includes(LINE_TREE.work))
  const commit = promptOf(prompts, KEY.commit)
  assert.match(commit, /árbol de la línea pagos, \/s\/lines\/pagos\/api, en la rama line\/pagos/)
  assert.match(commit, /sin cortar otra ni renombrarla\. El árbol no se saca/)
  // Lo del árbol de una tarea no corre acá: renombrar la rama le quitaría su nombre a la línea, y retirar el
  // árbol la dejaría sin checkout para la tarea siguiente.
  assert.doesNotMatch(commit, /git branch -m|worktree remove|git switch -c/)
})

// Caso 448. Quien escribe la fila de una decisión de Review no sabía que había un árbol: completó una ruta de app con
// la del checkout principal, y la persona aprobó un archivo que el commit no toca.
test('en una línea, la fila que deja Review sabe dónde está el trabajo', async () => {
  const decision = { detail: 'el manifiesto queda sin su lockfile', blocking: false, decision: true }
  const { prompts } = await runFlow(inLine({
    [KEY.review]: { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [decision] },
  }))
  const filed = promptOf(prompts, 'Review|review-human')
  assert.ok(filed.includes(TREE.work), filed)
  assert.match(filed, /no en el checkout compartido/)
})

// Caso 450. La instancia es una sola para la línea y la sesión principal, y `line-scope` frena todo checkout ahí: el
// recorrido le mandaba a la línea cortar `work/planning` cuando la instancia estaba en su rama viva, y el cierre
// quedaba suelto con un bloqueo que pedía aprobar la instancia entera.
test('en una línea, con la instancia en su rama viva, el recorrido no cambia de rama y para dicho', async () => {
  const { result, prompts } = await runFlow(inLine({
    [KEY.planningCommit]: { committed: false, branch: 'main', live: true, reason: 'la instancia está en main' },
    [KEY.contract]: { ...inLine()[KEY.contract], humanCheckpoint: true },
  }))
  assert.match(promptOf(prompts, KEY.planningCommit),
    /lleva la línea admin: si el repositorio está en una rama viva no/)
  assert.equal(result.reason, 'planning-uncommitted')
  assert.match(result.detail, /sesión principal/)
  assert.match(result.detail, /T-1/)
  // Para al final y no a mitad: el hito cierra con su revisión humana, como cerraba antes.
  assert.ok(prompts.some((one) => one.key === 'Closing|human-checkpoint'), 'el checkpoint del hito se escribe')

  // Fuera de una línea sigue como estaba: la rama de planning se corta, y lo que no se commitea se anota sin parar.
  const loose = await runFlow({ [KEY.planningCommit]: { committed: false, branch: 'main', live: true, reason: 'x' } })
  ranToEnd(loose.result)
  assert.doesNotMatch(promptOf(loose.prompts, KEY.planningCommit), /lleva la línea/)
})
