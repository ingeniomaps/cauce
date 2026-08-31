'use strict'

// Los carriles y quién los asigna: qué fases saltea cada uno, qué conserva, y qué pasa cuando la
// tarea llega sin clasificar. Bajar ceremonia no puede bajar la evidencia, y ése es el caso que
// separa un carril barato de uno que no mide nada.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

// Un carril baja ceremonia: saltea fases enteras. Lo que no puede bajar es la evidencia que se exige,
// y esa distinción no se ve leyendo el fuente —las dos cosas son el mismo `if`—.
// Lo mecánico no se planifica ni se pregunta si está listo: el clasificador ya leyó la aceptación y
// dijo que nombra un valor literal. Lo que separa a `directo` de `express` es un solo ojo más, el que
// mira la superficie que cambió; lo que no cambia en ningún carril es Verify, que es la evidencia.
test('el carril directo entrega y lo revisa quien nombra la línea', async () => {
  const { result, phases } = await runFlow({}, { lane: 'directo' })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  for (const absent of ['Ready', 'Decompose', 'Plan', 'Critique', 'QA']) {
    assert.ok(!phases.includes(absent), `directo no debería llegar a ${absent}`)
  }
  for (const present of ['Build', 'Review', 'Verify', 'Commit', 'Done']) {
    assert.ok(phases.includes(present), `directo se saltó ${present}`)
  }
})

test('el carril express entrega sin que nadie mire, porque no hay nada que mirar', async () => {
  const { result, phases } = await runFlow({}, { lane: 'express' })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  for (const absent of ['Ready', 'Decompose', 'Plan', 'Critique', 'Review', 'QA']) {
    assert.ok(!phases.includes(absent), `express no debería llegar a ${absent}`)
  }
  for (const present of ['Build', 'Verify', 'Commit', 'Done']) {
    assert.ok(phases.includes(present), `express se saltó ${present}`)
  }
})

// El WIP es el mutex y la recuperación: sin él, una corrida interrumpida no sabe por dónde seguir y
// dos runners pueden tomar la misma tarea. Bajar ceremonia nunca lo alcanza.
test('todo carril persiste el WIP antes del primer cambio', async () => {
  for (const lane of ['express', 'directo', 'lite', 'full']) {
    const { asked, phases } = await runFlow({}, { lane })
    assert.ok(phases.includes('WIP'), `${lane} entró a construir sin persistir el WIP`)
    assert.ok(asked.indexOf('WIP|wipActive') < asked.indexOf(KEY.build), `${lane} lo escribió tarde`)
  }
})

test('el carril lite conserva el review y saltea el desmenuzado del plan', async () => {
  const { result, phases } = await runFlow({}, { lane: 'lite' })
  ranToEnd(result)
  for (const absent of ['Decompose', 'Critique']) {
    assert.ok(!phases.includes(absent), `lite no debería llegar a ${absent}`)
  }
  for (const present of ['Review', 'Verify', 'QA']) {
    assert.ok(phases.includes(present), `lite se saltó ${present}`)
  }
})

// Los revisores los nombró quien clasificó la tarea, que ya sabía cuál era su carril. Descartarlos
// después por carril sería un segundo filtro contradiciendo al primero: el clasificador dijo que esa
// superficie necesita esos ojos, y bajar ceremonia nunca bajó la revisión.
test('el revisor que nombra la línea revisa en todos los carriles', async () => {
  const conCast = { [KEY.context]: {
    ...baseScript()[KEY.context], cast: { build: 'backend-engineer', review: ['security-engineer'] },
  } }
  const reviewerOf = ({ prompts }) => prompts.find((entrada) => entrada.key.startsWith('Review|')).prompt

  const inLite = reviewerOf(await runFlow(conCast, { lane: 'lite' }))
  assert.match(inLite, /software-architect/, 'el dueño de la fase revisa igual')
  assert.match(inLite, /security-engineer/, 'y el que nombró la clasificación también')

  const inFull = reviewerOf(await runFlow(conCast))
  assert.match(inFull, /security-engineer/, 'lo mismo en el carril completo')
})

// Ver la tarea, y si no está clasificada clasificarla. Es lo primero que pasa, antes de gastar
// cualquier otra cosa en ella.
test('una tarea sin clasificar se clasifica y la clasificación se escribe donde vive la tarea', async () => {
  const sinClasificar = { ...baseScript()[KEY.context], lane: '', cast: { build: '', review: [] } }
  const yaClasificada = baseScript()[KEY.context]
  const { result, phases, asked, prompts } = await runFlow({}, {
    contexts: [sinClasificar, yaClasificada],
  })
  ranToEnd(result)
  assert.ok(phases.includes('Classify'), 'la tarea sin lane pasa por el clasificador')
  assert.ok(asked.indexOf('Classify|classified') < asked.indexOf('Ready|ready,needsHuman'),
    'y antes de que nada más se gaste en ella')
  const orden = prompts.find((entry) => entry.key === 'Classify|classified').prompt
  assert.match(orden, /BACKLOG\.md/, 'la clasificación se escribe donde vive la tarea')
  assert.match(orden, /\(cast:/, 'con el reparto en la línea, no sólo el carril')
})

test('una tarea ya clasificada no vuelve a clasificarse', async () => {
  const { result, phases, asked } = await runFlow()
  ranToEnd(result)
  assert.ok(!phases.includes('Classify'), 'lo que ya está decidido no se vuelve a decidir')
  assert.ok(!asked.includes('Classify|classified'))
})

// Lo que se fija no es el carril sino que la corrida llegue al final: sin clasificación las cuatro
// fases caras tienen que correr igual, y ninguna se saltea. Por qué no frena, en `autobuild`.
test('una clasificación que no escribió nada deja la tarea en el carril completo', async () => {
  const sinClasificar = { ...baseScript()[KEY.context], lane: '', cast: { build: '', review: [] } }
  const { result, phases } = await runFlow({ [KEY.classify]: { classified: [] } }, {
    contexts: [sinClasificar, sinClasificar],
  })
  ranToEnd(result)
  for (const present of ['Decompose', 'Critique', 'Review', 'QA']) {
    assert.ok(phases.includes(present), `sin clasificar debería correr ${present}`)
  }
})

// El caso arranca con el WIP ya activo, que es la única forma de distinguir «no reclasifica» de «no
// clasifica»: sin WIP las dos se ven igual. Por qué no se reclasifica, en `autobuild`.
test('un WIP activo no se reclasifica', async () => {
  const enVuelo = {
    ...baseScript()[KEY.context], lane: '', cast: { build: '', review: [] }, wipActive: true,
  }
  const { phases } = await runFlow({}, { contexts: [enVuelo, enVuelo] })
  assert.ok(!phases.includes('Classify'), 'lo que ya está en vuelo no cambia de carril')
})

test('bajar ceremonia no baja la evidencia que cada carril exige', async () => {
  const withoutFailure = {
    [KEY.build]: {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '' }],
    },
  }
  const withoutTest = {
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'go build ./...', exitCode: 0 }],
    },
  }
  const looseEdge = {
    [KEY.build]: {
      completed: true, summary: 'x', closedTask: false,
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  }
  for (const lane of ['directo', 'lite']) {
    assert.equal((await runFlow(withoutFailure, { lane })).result.reason, 'build-unproven', lane)
    assert.equal((await runFlow(withoutTest, { lane })).result.reason, 'verify-untested', lane)
    assert.equal((await runFlow(looseEdge, { lane })).result.reason, 'edge-unproven', lane)
  }
})

// El cargo llega al prompt por su slug, y el contrato que ese slug nombra vive en el paquete: el catálogo
// no se copia a la instancia, así que no hay `agents/` en la raíz. La instrucción anterior mandaba a leer
// ahí, y el agente que la siguiera al pie de la letra no encontraba nada. El workflow tampoco puede
// resolver la ruta —su runtime no lee archivos—, así que lo que viaja es el comando que la da.
test('el prompt que trabaja dice dónde está el contrato del cargo, no dónde no está', async () => {
  const { prompts } = await runFlow({}, { lane: 'directo' })
  const build = prompts.find((one) => /Implementá sólo/.test(one.prompt))
  assert.ok(build, 'no se encontró el prompt de Build')

  assert.match(build.prompt, /Actuá como /, 'nombra el cargo')
  // Lo que decide todo: que lo lea. Sin esta línea el agente actúa por lo que el slug le sugiere, y un
  // nombre de cargo se parece bastante a su contrato sin serlo.
  assert.match(build.prompt, /Leé ese contrato antes de empezar/, 'pide leerlo, no suponerlo')
  assert.match(build.prompt, /agents list .* --json/, 'y con qué comando se resuelve su ruta')
  assert.match(build.prompt, /campo `path` del slug/, 'diciendo qué campo leer')
  assert.match(build.prompt, /`<path>\/SKILL\.md`/, 'y dónde está el contrato dentro de esa ruta')

  // Lo que no puede volver: mandar a una carpeta que en una instancia no existe.
  assert.equal(/SKILL\.md bajo agents\//.test(build.prompt), false,
    'no manda a `agents/`, que el catálogo no copia')
})

// Descubrir con qué se verifica un servicio es una respuesta que no cambia entre tareas, y hasta acá se
// pagaba en cada una: el prompt mandaba leer las instrucciones del repositorio y adivinar el gestor. El
// proyecto puede declararlo en `verify`, y entonces deja de adivinarse. Sin declaración se descubre
// igual, porque un proyecto que todavía no lo dijo tiene que poder correr.
test('el proyecto que declara su puerta no la hace descubrir de nuevo', async () => {
  const script = baseScript()
  script[KEY.contract] = { ...script[KEY.contract], gates: ['./api → npm test'] }
  const { prompts } = await runFlow(script, { lane: 'directo' })
  const verify = prompts.find((one) => /exit codes de verdad/.test(one.prompt))
  assert.ok(verify, 'no se encontró el prompt de Verify')

  assert.match(verify.prompt, /\.\/api → npm test/, 'le llega la puerta declarada, con su raíz')
  assert.match(verify.prompt, /no hay que descubrirlas/, 'y se le dice que no la busque')
  assert.equal(/descubrilo: primero las instrucciones/.test(verify.prompt), false,
    'no le quedan las dos instrucciones a la vez, que sería peor que ninguna')

  // Las dos mitades que el harness no puede ver, porque finge la respuesta del contrato en vez de
  // validarla: el esquema tiene `additionalProperties: false`, así que sin el campo una respuesta real
  // que lo traiga se rechaza entera, y sin la cláusula del prompt nadie lo llena. Van sobre el fuente
  // porque no hay dónde más mirarlas.
  const src = require('../../engine/automation').render(
    path.join(__dirname, '..', '..', 'automatization', 'workflows', 'autobuild.js'), '',
    path.join(__dirname, '..', '..', 'automatization'))
  assert.match(src, /gates: \{ type: 'array', items: \{ type: 'string' \} \}/, 'el contrato acepta el campo')
  assert.match(src, /por cada workspaceRoot que declare/, 'y se le pide llenarlo desde el config')
})

test('el proyecto que no la declara sigue descubriéndola', async () => {
  const { prompts } = await runFlow({}, { lane: 'directo' })
  const verify = prompts.find((one) => /exit codes de verdad/.test(one.prompt))
  assert.match(verify.prompt, /descubrilo: primero las instrucciones/,
    'sin declaración se descubre: un proyecto que no lo dijo tiene que poder correr igual')
})
