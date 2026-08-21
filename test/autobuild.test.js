'use strict'

// Corre `autobuild` de verdad, con los subagentes simulados. Los demás tests del recorrido leen su
// fuente y comprueban que una línea esté escrita; eso ve que el freno existe, no que frene cuando
// tiene que frenar ni —lo que más importa— que deje pasar cuando no. Dos defectos que ningún `match`
// atrapó salieron de acá: un patrón de comandos que no reconocía `mvn verify`, y una comparación de
// nombres de test por igualdad exacta entre dos campos que escribe la misma respuesta por separado.
//
// El runtime de workflows no es del toolkit: `agent`, `phase`, `log` y compañía los inyecta el
// harness. Acá se inyectan a mano sobre el archivo renderizado, así que lo que se ejecuta es el mismo
// texto que recibe una instancia, con `{{INCLUDE:}}` ya resuelto.

require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileWorkflow } = require('./workflow')

// Las claves del guion, tal como las arma `runFlow`: la fase y, sin `label`, los campos obligatorios
// del schema. Nombrarlas es lo que hace que un tipeo se note: escrita a mano y mal, la clave se suma
// sin pisar nada y el guion base contesta el camino feliz, así que un escenario que espera que el
// recorrido siga queda verde sin haber cambiado lo que dice cambiar.
const KEY = {
  contract: 'Triage|contract-digest',
  context: 'Triage|planning-context',
  cast: 'Cast|cast',
  ready: 'Ready|ready,needsHuman',
  decompose: 'Decompose|hours,needsSplit',
  plan: 'Plan|approach,steps,files,testStrategy',
  planWip: 'Plan|wipActive',
  critique: 'Critique|verdict,concerns,consulted',
  critiqueWip: 'Critique|wipActive',
  replan: 'Critique|approach,steps,files,testStrategy',
  build: 'Build|completed,summary,redFirst,discovered,closedTask',
  review: 'Review|verdict,concerns,consulted',
  verify: 'Verify|passed,commands,details,uncovered',
  qa: 'QA|passed,evidence',
  commit: 'Commit|committed',
  pick: 'Pick|expanded',
  closing: 'Closing|passed,details',
}

// Respuestas del camino que llega hasta el final. Cada escenario cambia una sola y asercia el efecto:
// así lo que se mide es esa pieza y no el recorrido entero.
function baseScript() {
  return {
    [KEY.contract]: {
      project: 'acme', workspaceRoots: ['api → ./api'], contracts: '## Contratos',
      maxTaskHours: 4, commitPerTask: true, humanCheckpoint: false, boundaries: [],
    },
    // Primera lectura: hay tarea. La segunda la sirve `siguienteContexto`, ya sin tarea, para que el
    // bucle cierre en vez de repetir la misma para siempre.
    [KEY.context]: {
      blocked: '', hasTask: true, wipActive: false, queued: 1, lane: 'full',
      slug: 'T-1', hito: 'H1', service: './api', acceptance: 'el alta rechaza un duplicado', epic: 'E1',
    },
    [KEY.cast]: { build: 'backend-engineer', review: [], verify: [], qa: [] },
    [KEY.ready]: { ready: true, needsHuman: false },
    [KEY.decompose]: { hours: 2, needsSplit: false },
    [KEY.plan]: {
      approach: 'validar en el repositorio', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
    [KEY.critique]: { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] },
    [KEY.critiqueWip]: { wipActive: true },
    [KEY.planWip]: { wipActive: true },
    [KEY.build]: {
      completed: true, summary: 'alta con rechazo de duplicado',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error, got nil' }],
      discovered: [], closedTask: false,
    },
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] },
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'go test ./...', exitCode: 0 }],
    },
    [KEY.qa]: { passed: true, evidence: 'alta rechaza el duplicado contra la API real' },
    [KEY.commit]: { committed: true, hash: 'abc123' },
    [KEY.pick]: { expanded: false },
    [KEY.closing]: { passed: true, details: 'check verde' },
  }
}

// Las dos preguntas que se le hacen a `asked`. Una llamada con schema deja `Fase|<campos>`; una
// escritura, que no lleva schema ni label, deja `Fase|` a secas — por eso una se busca por prefijo y
// la otra por igualdad, y confundirlas cuenta las escrituras como si fueran consultas.
const reached = (asked, phase) => asked.some((key) => key.startsWith(`${phase}|`))
const writesTo = (asked, phase) => asked.filter((key) => key === `${phase}|`).length

// Un escenario que espera que el recorrido llegue al final. Si frenó, lo que hay que ver es dónde.
function ranToEnd(result) {
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}: ${result.detail || ''}`)
}

const NO_TASK = { blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '' }

// Ejecuta el recorrido y devuelve lo que devolvió, más las fases y las claves que pidió. La clave sale
// de la fase y del `label` o de los campos obligatorios del schema: es lo que distingue una crítica de
// un review, que comparten schema y sólo se diferencian por dónde ocurren.
async function runFlow(changes = {}, options = {}) {
  const script = { ...baseScript(), ...changes }
  if (options.lane) {
    script[KEY.context] = { ...script[KEY.context], lane: options.lane }
  }
  const phases = []
  const asked = []
  const written = []
  const prompts = []
  let phase = ''
  // Cada lectura de planning devuelve el siguiente de la lista, y al agotarse ya no hay tarea. Es lo
  // que cierra el bucle, y lo que deja escribir una expansión o un cambio de hito entre dos lecturas.
  const contexts = options.contexts || [script[KEY.context]]
  let reads = 0

  const agent = async (prompt, options = {}) => {
    const key = `${phase}|${options.label || (options.schema && options.schema.required || []).join(',')}`
    asked.push(key)
    prompts.push({ key, prompt })
    if (!options.schema) { written.push(prompt); return { ok: true } }
    if (options.label === 'planning-context') {
      const answer = reads < contexts.length ? contexts[reads] : NO_TASK
      reads += 1
      return typeof answer === 'function' ? answer() : answer
    }
    if (!(key in script)) throw new Error(`el guion no cubre ${key}`)
    // Una respuesta puede ser una función cuando el escenario necesita contestar distinto en cada vuelta.
    const answer = script[key]
    return typeof answer === 'function' ? answer() : answer
  }

  const result = await compileWorkflow('autobuild')(
    agent, (title) => { phase = title; phases.push(title) }, () => {},
    async (thunks) => Promise.all(thunks.map((t) => t())), async () => [], async () => ({}),
    {}, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { result, phases, asked, written, prompts }
}

// Lo primero que hay que saber es que el recorrido llega al final, porque un freno que dispara siempre
// se ve idéntico a uno que funciona si sólo se comprueban los casos que frenan.
test('autobuild cierra una tarea cuando todo está en su lugar', async () => {
  const { result, phases } = await runFlow()
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  for (const expected of ['Triage', 'Plan', 'Critique', 'Build', 'Review', 'Verify', 'QA', 'Commit', 'Closing']) {
    assert.ok(phases.includes(expected), `faltó la fase ${expected}`)
  }
})

test('sin WIP activo no se entra a construir', async () => {
  const { result, asked } = await runFlow({
    [KEY.critiqueWip]: { wipActive: false, note: 'quedó en IDLE' },
  })
  assert.equal(result.reason, 'wip-not-persisted')
  assert.ok(!reached(asked, 'Build'), 'y no se construye sin el WIP puesto')
})

// Lo que falta para empezar no lo resuelve el recorrido: va donde lo lee una persona, en vez de quedar
// en el log de una corrida que ya terminó.
test('una tarea que no está lista no se planifica y queda pedida por escrito', async () => {
  const { result, asked, written } = await runFlow({
    [KEY.ready]: { ready: false, needsHuman: true, reason: 'la aceptación no dice qué es un duplicado' },
  })
  assert.equal(result.reason, 'not-ready')
  assert.ok(!reached(asked, 'Plan'), 'no se planifica lo que todavía no se sabe qué es')
  assert.ok(
    written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('qué es un duplicado')),
    'y lo que falta queda con su motivo donde alguien lo puede resolver',
  )
})

test('una aprobación que no declara qué inspeccionó frena en su etapa', async () => {
  const critique = await runFlow({
    [KEY.critique]: { verdict: 'aprobado', concerns: [], consulted: [] },
  })
  assert.equal(critique.result.reason, 'critique-unbacked')

  const review = await runFlow({
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: [] },
  })
  assert.equal(review.result.reason, 'review-unbacked')
})

test('un rojo declarado sin el fallo que lo muestra no cuenta como rojo', async () => {
  const { result } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '   ' }],
    },
  })
  assert.equal(result.reason, 'build-unproven')
  assert.match(result.detail, /TestAltaDuplicada/)
})

test('una tarea cerrada en Build no sigue como si nada', async () => {
  const { result, asked } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', discovered: [], closedTask: true,
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
    },
  })
  assert.equal(result.reason, 'build-closed-task')
  assert.ok(!reached(asked, 'Review'), 'y no se revisa lo que ya se cerró')
})

// Una decisión que quedó abierta se registra y no frena lo que sí se entregó. Frenaba, y en tres corridas
// reales frenó las tres veces con la tarea completa: toda aceptación en prosa tiene un borde indefinido, así
// que el freno saltaba siempre. Lo que de verdad bloquea sigue siendo completed:false con su blocker.
test('una decisión abierta queda escrita y el recorrido sigue', async () => {
  const { result, written } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', redFirst: [], closedTask: false,
      discovered: [{ kind: 'open', detail: 'nadie definió qué pasa con el alta sin país' }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'lo entregado se cierra igual')
  assert.ok(
    written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('sin país')),
    'y queda registrada con quién puede tomarla, o vuelve a aparecer sin dueño',
  )
})

// Lo que impide entregar no pasa por ese canal: el cargo no completa, y ahí sí frena.
test('lo que de verdad bloquea sigue frenando por su propio camino', async () => {
  const { result } = await runFlow({
    [KEY.build]: {
      completed: false, summary: 'x', redFirst: [], discovered: [], closedTask: false,
      blockers: ['sin credencial del proveedor de pagos'],
    },
  })
  assert.equal(result.reason, 'build-blocked')
  assert.match(result.detail, /credencial/)
})

test('un caso descubierto entra con su prueba, y el nombre no tiene que coincidir letra por letra', async () => {
  const loose = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  assert.equal(loose.result.reason, 'edge-unproven')

  // El mismo caso, nombrado de las dos formas en que un modelo lo escribe: no debe frenar.
  const covered = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x',
      redFirst: [{ test: 'alta_test.go::TestAltaSinPais', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  ranToEnd(covered.result)
})

test('un criterio sin cubrir va a una persona o vuelve a quien construye, según su causa', async () => {
  const ambiguous = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el alta es rápida', cause: 'ambiguous' }],
    },
  })
  assert.equal(ambiguous.result.reason, 'acceptance-ambiguous')
  assert.ok(
    ambiguous.written.some((text) => text.includes('HUMAN_ACTIONS')),
    'una definición que falta se registra donde la lee una persona',
  )

  // Una prueba que falta la escribe el propio recorrido: rebota, Verify corre de nuevo y sigue.
  let turn = 0
  const bounce = await runFlow({
    [KEY.verify]: () => {
      turn += 1
      return {
        passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
        uncovered: turn === 1 ? [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }] : [],
      }
    },
  })
  ranToEnd(bounce.result)
  assert.equal(turn, 2, 'Verify tiene que volver a correr después del rebote')
  assert.equal(writesTo(bounce.asked, 'Verify'), 1, 'y el rebote va a quien construye, en una sola vuelta')
})

test('un criterio que sigue sin prueba después del rebote frena', async () => {
  const { result } = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }],
    },
  })
  assert.equal(result.reason, 'verify-hollow')
  assert.match(result.detail, /el duplicado se rechaza/)
})

// Verify corta por tres motivos distintos y el más simple —un gate que sale en rojo— era el único sin
// caso: los otros dos miran el verde, así que ninguno lo habría atrapado.
test('un gate en rojo frena aunque los criterios estén cubiertos', async () => {
  const { result, asked } = await runFlow({
    [KEY.verify]: {
      passed: false, details: 'go test ./... salió en 1', uncovered: [],
      commands: [{ cmd: 'go test ./...', exitCode: 1, ranTests: true }],
    },
  })
  assert.equal(result.reason, 'verify-failed')
  assert.match(result.detail, /salió en 1/)
  assert.ok(!reached(asked, 'QA'), 'y no se hace QA sobre un gate en rojo')
})

test('gates en verde que no corrieron ninguna prueba no cierran la tarea', async () => {
  const { result } = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'golangci-lint run', exitCode: 0 }, { cmd: 'go build ./...', exitCode: 0 }],
    },
  })
  assert.equal(result.reason, 'verify-untested')

  // Y el gate cuyo nombre el patrón no conoce pasa igual si quien lo corrió dice que corrió pruebas.
  const declared = await runFlow({
    [KEY.verify]: {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'mvn verify', exitCode: 0, ranTests: true }],
    },
  })
  ranToEnd(declared.result)
})

test('QA en rojo no cierra la tarea aunque los gates estén verdes', async () => {
  const { result, asked } = await runFlow({
    [KEY.qa]: { passed: false, evidence: 'el alta acepta el duplicado contra la API real' },
  })
  assert.equal(result.reason, 'qa-failed')
  assert.match(result.detail, /acepta el duplicado/)
  assert.ok(!reached(asked, 'Commit'), 'y no se commitea lo que no pasó QA')
})

// El commit es parte del artefacto y no un trámite: darlo por hecho cierra la tarea sobre un árbol que
// quedó como estaba.
test('un commit que no se hizo no se da por hecho', async () => {
  const { result } = await runFlow({
    [KEY.commit]: { committed: false, reason: 'quedaron archivos ajenos a la tarea sin stagear' },
  })
  assert.equal(result.reason, 'commit-failed')
  assert.match(result.detail, /sin stagear/)
})

test('el check de cierre en rojo frena la corrida', async () => {
  const { result } = await runFlow({
    [KEY.closing]: { passed: false, details: 'el BACKLOG quedó con la tarea que se cerró' },
  })
  assert.equal(result.reason, 'planning-check-failed')
  assert.match(result.detail, /BACKLOG/)
})

// Cerrada una tarea, el recorrido relee el estado para decidir si sigue. Sin ese estado no hay con qué
// decidir, y elegir la próxima igual sería elegirla a ciegas.
test('si el estado no se puede releer la corrida corta en vez de seguir a ciegas', async () => {
  const { result, asked } = await runFlow({}, { contexts: [baseScript()[KEY.context], null] })
  assert.equal(result.reason, 'context-unavailable')
  assert.ok(reached(asked, 'Commit'), 'corta después de cerrar la tarea que sí terminó, no antes')
})

test('un subagente que no contesta corta con su etapa puesta', async () => {
  const { result } = await runFlow({ [KEY.build]: null })
  assert.equal(result.reason, 'agent-unavailable')
  assert.match(result.detail, /Build/)
})

// La otra forma de no contestar: sin contrato no hay límites que respetar, y el recorrido no llega
// siquiera a mirar si hay tarea.
test('sin el contrato leído no se arranca el recorrido', async () => {
  const { result, asked } = await runFlow({ [KEY.contract]: null })
  assert.equal(result.reason, 'contract-unavailable')
  assert.deepEqual(asked, [KEY.contract], 'no se pide nada más')
})

// Un carril baja ceremonia: saltea fases enteras. Lo que no puede bajar es la evidencia que se exige,
// y esa distinción no se ve leyendo el fuente —las dos cosas son el mismo `if`—.
test('el carril directo saltea la ceremonia y no pide un cargo para cada fase', async () => {
  const { result, phases } = await runFlow({}, { lane: 'directo' })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  for (const absent of ['Cast', 'Decompose', 'Critique', 'Review']) {
    assert.ok(!phases.includes(absent), `directo no debería llegar a ${absent}`)
  }
  for (const present of ['Ready', 'Plan', 'Build', 'Verify', 'QA', 'Commit', 'Done']) {
    assert.ok(phases.includes(present), `directo se saltó ${present}`)
  }
})

test('el carril lite conserva el review y saltea el desmenuzado del plan', async () => {
  const { result, phases } = await runFlow({}, { lane: 'lite' })
  ranToEnd(result)
  for (const absent of ['Decompose', 'Critique']) {
    assert.ok(!phases.includes(absent), `lite no debería llegar a ${absent}`)
  }
  for (const present of ['Cast', 'Review', 'Verify', 'QA']) {
    assert.ok(phases.includes(present), `lite se saltó ${present}`)
  }
})

// El Cast propone lo mismo en los dos carriles; lo que cambia es qué hace el recorrido con eso.
test('lite se queda con el dueño de cada fase y descarta los condicionales', async () => {
  const cast = { [KEY.cast]: { build: 'backend-engineer', review: ['security-engineer'], verify: [], qa: [] } }
  const reviewerOf = ({ prompts }) => prompts.find((entrada) => entrada.key.startsWith('Review|')).prompt

  const inLite = reviewerOf(await runFlow(cast, { lane: 'lite' }))
  assert.match(inLite, /software-architect/, 'el dueño de la fase revisa igual')
  assert.ok(!inLite.includes('security-engineer'), 'y en lite el condicional no se suma')

  const inFull = reviewerOf(await runFlow(cast))
  assert.match(inFull, /security-engineer/, 'en el carril completo sí, que es de lo que lite baja')
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

// El plan y el diff tienen una corrección y una sola. Que la segunda vuelta exista es la mitad; la otra
// es que no haya una tercera, porque un recorrido que insiste hasta que le aprueben no revisa nada.
test('un review que rechaza corrige una vez y sigue si la segunda aprueba', async () => {
  let turn = 0
  const { result, written } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] }
    },
  })
  ranToEnd(result)
  assert.equal(turn, 2, 'la corrección se revisa de nuevo, no se da por buena')
  assert.ok(
    written.some((text) => text.includes('falta el caso vacío')),
    'y lo que hay que corregir viaja con el hallazgo, no como "arreglalo"',
  )
})

// El caso mira las dos fases con el mismo veredicto: el estado del medio entró por separado en Critique
// y en Review, y cubrir una sola deja pasar la otra sin que nada lo diga.
test('un veredicto bloqueado frena sin gastar una corrección', async () => {
  const review = await runFlow({
    [KEY.review]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'la aceptación pide un contrato que el diseño no define', blocking: true }],
    },
  })
  assert.equal(review.result.reason, 'review-blocked')
  assert.equal(writesTo(review.asked, 'Review'), 0, 'no se manda a corregir lo que la corrección no arregla')

  const critique = await runFlow({
    [KEY.critique]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el plan depende de una decisión que nadie tomó', blocking: true }],
    },
  })
  assert.equal(critique.result.reason, 'plan-blocked')
  assert.ok(!reached(critique.asked, 'Build'), 'y no se construye')
})

// Y un hallazgo que no impide entregar deja de costar una vuelta de código: se anota y la tarea cierra.
test('lo que no bloquea se anota y no manda a tocar código', async () => {
  const { result, written, asked } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el nombre del handler podría ser más claro', blocking: false }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  assert.equal(writesTo(asked, 'Review'), 1, 'una sola escritura en Review: la del registro, no una corrección')
  assert.ok(
    written.some((text) => text.includes('INBOX') && text.includes('nombre del handler')),
    'lo anotado queda donde alguien lo decide después, sin promover',
  )
})

test('un review que sigue rechazando después de corregir frena', async () => {
  const { result } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'sigue faltando el caso vacío', blocking: true }],
    },
  })
  assert.equal(result.reason, 'review-failed')
  assert.match(result.detail, /sigue faltando/)
})

// Un veredicto bloqueado nombra lo que lo bloquea, pero puede llegar sin nombrar nada. En la segunda
// pasada eso frenaba con el detalle vacío: el motivo es lo único que queda para leer cuando la corrida
// terminó, y la primera pasada ya tenía este respaldo.
test('un bloqueo sin condiciones nombradas frena igual y lo dice', async () => {
  let reviewTurn = 0
  const review = await runFlow({
    [KEY.review]: () => {
      reviewTurn += 1
      return reviewTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
  })
  assert.equal(review.result.reason, 'review-failed')
  assert.equal(review.result.detail, 'sin condiciones nombradas')

  let critiqueTurn = 0
  const critique = await runFlow({
    [KEY.critique]: () => {
      critiqueTurn += 1
      return critiqueTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(critique.result.reason, 'plan-rejected')
  assert.equal(critique.result.detail, 'sin condiciones nombradas')
})

test('un plan que no sobrevive a la segunda crítica no llega a construirse', async () => {
  const { result, asked } = await runFlow({
    [KEY.critique]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(result.reason, 'plan-rejected')
  assert.ok(!reached(asked, 'Build'), 'no se construye sobre un plan rechazado')
})

test('una tarea que no entra en el tope de horas se parte y no se construye', async () => {
  const { result, asked, written } = await runFlow({
    [KEY.decompose]: {
      hours: 12, needsSplit: true,
      subtasks: [{ title: 'alta', acceptance: 'rechaza duplicado' }, { title: 'baja', acceptance: 'borra' }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, [], 'la tarea partida no se cierra: se reemplaza y se vuelve a elegir')
  assert.ok(!reached(asked, 'Build'), 'y no se construye lo que se acaba de partir')
  assert.ok(written.some((text) => text.includes('BACKLOG')), 'las subtareas reemplazan a la original')
})

test('sin tarea en cola se expande la próxima épica y se sigue con ella', async () => {
  const withTask = baseScript()[KEY.context]
  const { result, asked } = await runFlow(
    { [KEY.pick]: { expanded: true, hito: 'H1' } },
    { contexts: [{ blocked: '', hasTask: false, wipActive: false, queued: 0, lane: 'full' }, withTask] },
  )
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'lo expandido se ejecuta en la misma corrida')
  assert.ok(asked.includes(KEY.pick), 'y pasó por la expansión, no por una tarea que ya estaba')
})

test('sin nada que expandir el recorrido termina sin inventar trabajo', async () => {
  const { result, asked } = await runFlow({}, { contexts: [] })
  ranToEnd(result)
  assert.deepEqual(result.done, [])
  assert.ok(!reached(asked, 'Build'), 'no se construye sin tarea')
})

test('un checkpoint humano sin resolver corta antes de tocar nada', async () => {
  const { result, asked } = await runFlow({}, {
    contexts: [{ blocked: 'hito anterior sin revisar', hasTask: true, wipActive: false, queued: 1 }],
  })
  assert.equal(result.reason, 'awaiting-human-review')
  assert.ok(!reached(asked, 'Plan'), 'ni se planifica')
})

test('el hito cambia y la corrida cierra en vez de seguir con el siguiente', async () => {
  const first = baseScript()[KEY.context]
  const { result } = await runFlow({}, {
    contexts: [first, { ...first, slug: 'T-2', hito: 'H2' }],
  })
  assert.deepEqual(result.done, ['T-1'], 'una corrida cierra un hito, no todos los que haya')
  assert.equal(result.hito, 'H1')
})

test('con checkpoint configurado el hito terminado queda esperando una firma', async () => {
  const withGate = { ...baseScript()[KEY.contract], humanCheckpoint: true }
  const { written } = await runFlow({ [KEY.contract]: withGate })
  assert.ok(
    written.some((text) => text.includes('AWAITING_REVIEW')),
    'el hito terminado deja el gate escrito, que es lo que impide que la próxima corrida siga sola',
  )
  // Y apagado no lo escribe: es configuración del proyecto, no una ceremonia fija.
  const { written: withoutGate } = await runFlow()
  assert.ok(!withoutGate.some((text) => text.includes('AWAITING_REVIEW')))
})

test('una tarea que vuelve a quedar elegible para siempre corta con su motivo', async () => {
  const forever = baseScript()[KEY.context]
  const { result } = await runFlow({}, { contexts: Array.from({ length: 60 }, () => forever) })
  assert.equal(result.reason, 'milestone-too-long')
  assert.match(result.detail, /50/)
})
