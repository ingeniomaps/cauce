'use strict'

// La cola partida por hito (caso 212), del lado de quien escribe en ella: clasificar, cerrar y partir una tarea
// se hace en el archivo donde vive, que `context` dice cuál es; proteger la cola mira todos.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const inFile = (file) => ({ [KEY.context]: { ...baseScript()[KEY.context], file } })
const doneOf = ({ written }) => written.find((one) => one.includes('Cerrá T-1 de forma atómica')) || ''

test('Done cierra la tarea en el archivo de su hito y borra el archivo si el hito queda vacío', async () => {
  const run = await runFlow(inFile('backlog/h1.md'))
  ranToEnd(run.result)
  assert.match(doneOf(run), /sacala junto con sus notas indentadas de \.\/planning\/backlog\/h1\.md/)
  assert.match(doneOf(run), /su hito queda sin tareas, borrá ese archivo/)
})

test('sin archivo declarado, la tarea vive en BACKLOG.md como siempre', async () => {
  const run = await runFlow({})
  assert.match(doneOf(run), /sacala junto con sus notas indentadas de \.\/planning\/BACKLOG\.md/)
})

// Clasificar toda la cola escribía en los hitos de otra línea (caso 239): lo que se mide es que el prompt nombre
// el archivo de la tarea y ya no la cola entera, y que proteger la siga mirando entera.
test('clasificar mira el archivo del hito, y proteger la cola mira BACKLOG.md y backlog/', async () => {
  const run = await runFlow(inFile('backlog/h1.md'), { lane: 'full', vouched: true })
  const prompt = (key) => (run.prompts.find((one) => one.key === key) || {}).prompt || ''
  assert.match(prompt(KEY.classify), /Clasificá en \.\/planning\/backlog\/h1\.md todas las tareas/)
  assert.doesNotMatch(prompt(KEY.classify), /los archivos de \.\/planning\/backlog\//)
  assert.match(prompt(KEY.build), /ni \.\/planning\/BACKLOG\.md y los archivos de \.\/planning\/backlog\//)
})

// Una fase que cambia la cola la reescribe, o lo que cambió no existe para nadie más (casos 376 y 378). Por
// qué el dependiente espera a todas las partes y no a la última está junto a la consigna que parte, en
// `autobuild.js`; acá se fija que la consigna lo pida.
test('partir una tarea reapunta a quien dependía de ella, a todas las partes', async () => {
  const base = baseScript()[KEY.context]
  const other = { ...base, slug: 'T-2', claimed: true }
  const empty = { ...base, hasTask: false, queued: 0 }
  const { prompts } = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, other, empty, empty] },
  )
  const split = prompts.find((one) => one.key === 'Decompose|split')
  assert.ok(split, 'no hubo partición')
  assert.match(split.prompt,
    /toda tarea de la cola .*que declare \(depende: …\) nombrando a T-1 pasa a depender de todas las subtareas/)

  // Y si la relectura muestra a alguien esperando todavía a T-1, la consigna no se cumplió entera: la corrida
  // para ahí, no en el check del final.
  const dangling = await runFlow(
    { [KEY.decompose]: { hours: 12, needsSplit: true, subtasks: ['T-1a', 'T-1b'] } },
    { contexts: [{ ...base, claimed: true }, { ...other, waiting: [{ slug: 'T-2', dep: 'T-1', owner: '' }] }] },
  )
  assert.equal(dangling.result.reason, 'split-left-dependents', JSON.stringify(dangling.result))
  assert.match(dangling.result.detail, /T-2.*T-1/)
})

// Lo mismo con la aceptación que Ready corrige: por qué se escribe en la línea y se relee está junto a ese
// paso. Acá se fija la escritura, la relectura que la confirma y que plan y replan reciban la corregida.
test('la aceptación que Ready corrige se escribe en la línea de la tarea y la corrida sigue con ella', async () => {
  const base = baseScript()[KEY.context]
  const refined = 'el alta rechaza un email duplicado'
  const ready = { [KEY.ready]: { ready: true, needsHuman: false, refinedAcceptance: refined } }
  // Con el punto final que un agente real le agregó al escribirla: sigue siendo la corregida.
  const run = await runFlow(ready, { contexts: [base, { ...base, acceptance: `${refined}.` }] })
  ranToEnd(run.result)
  const refine = run.prompts.find((one) => one.key === 'Ready|refine')
  assert.ok(refine, `no se escribió la corrección: ${JSON.stringify(run.asked)}`)
  assert.match(refine.prompt, /en la línea de T-1/)
  assert.match(refine.prompt, /_Aceptación:/)
  assert.ok(refine.prompt.includes(refined))
  assert.ok(run.prompts.find((one) => one.key === KEY.plan).prompt.includes(refined), 'el plan recibe la corregida')

  // Y el replan también: recibía sólo los motivos de la crítica y el plan, y corregía contra el criterio viejo.
  let turn = 0
  const replanned = await runFlow({
    ...ready,
    [KEY.critique]: () => (++turn === 1
      ? { verdict: 'con-condiciones', consulted: ['api/alta.go'],
        concerns: [{ detail: 'el plan sigue con el criterio viejo', blocking: true, replan: true }] }
      : baseScript()[KEY.critique]),
    [KEY.replan]: { approach: 'corregido', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit' },
  }, { contexts: [base, { ...base, acceptance: refined }] })
  ranToEnd(replanned.result)
  const replan = replanned.prompts.find((one) => one.key === KEY.replan)
  assert.ok(replan, 'no hubo replan')
  assert.match(replan.prompt, new RegExp(`La aceptación que rige es: ${refined}`))

  // Si la relectura sigue trayendo la vieja, la escritura no ocurrió y seguir sería planificar contra dos textos.
  const stuck = await runFlow(ready, { contexts: [base, base] })
  assert.equal(stuck.result.reason, 'refine-not-applied', JSON.stringify(stuck.result))
  assert.match(stuck.result.detail, /T-1/)
  // Y si la cola ya no ofrece la misma tarea, se dice eso y no «sigue con la anterior».
  const mangled = await runFlow(ready, { contexts: [base, { ...base, slug: 'T-2', acceptance: refined }] })
  assert.equal(mangled.result.reason, 'refine-not-applied')
  assert.match(mangled.result.detail, /ofrece T-2/)
  // Un texto que la línea no puede llevar —un `_` suelto cierra la aceptación— no se dicta: se para antes.
  const unwritable = await runFlow(
    { [KEY.ready]: { ready: true, needsHuman: false, refinedAcceptance: 'rechaza en `users_` y loguea' } },
    { contexts: [base, base] },
  )
  assert.equal(unwritable.result.reason, 'refine-unwritable', JSON.stringify(unwritable.result))
  assert.equal(unwritable.prompts.some((one) => one.key === 'Ready|refine'), false, 'no se escribió nada')
  // La primera crítica también juzga contra la aceptación que rige, como ya hacía la segunda.
  assert.match(run.prompts.find((one) => one.key === KEY.critique).prompt, new RegExp(`contra ${refined}`))
})

// Caso 382: Ready escribe lo que no se puede probar con la marca del 140. El porqué, en la consigna de Ready.
test('Ready escribe lo que no se puede probar como un tramo fuera de verify, no como condición', async () => {
  const run = await runFlow({})
  const ready = run.prompts.find((one) => one.key === KEY.ready)
  assert.ok(ready, 'no hubo Ready')
  assert.match(ready.prompt, /fuera de alcance o depende de algo que todavía no existe/)
  assert.match(ready.prompt, /tramo propio, separado por «;», con la marca \(fuera de verify: <razón>\)/)
})
