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
