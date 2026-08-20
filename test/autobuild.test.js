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

require('./entorno')

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const A = require('../engine/automation')

const AUTOMATION = path.resolve(__dirname, '..', 'automatization')
const WORKFLOW = path.resolve(AUTOMATION, 'workflows', 'autobuild.js')

// El único retoque al fuente: `export` no es válido dentro de una función. El resto se ejecuta tal
// cual, para que un cambio en el recorrido rompa acá y no en una instancia.
function compilar() {
  const source = A.render(WORKFLOW, '', AUTOMATION).replace(/^export const meta =/m, 'const meta =')
  return new Function('agent', 'phase', 'log', 'parallel', 'pipeline', 'workflow', 'args', 'budget',
    `return (async () => {\n${source}\n})()`)
}

// Respuestas del camino que llega hasta el final. Cada escenario cambia una sola y asercia el efecto:
// así lo que se mide es esa pieza y no el recorrido entero.
function guionBase() {
  return {
    'Triage|contract-digest': {
      project: 'acme', workspaceRoots: ['api → ./api'], contracts: '## Contratos',
      maxTaskHours: 4, commitPerTask: true, humanCheckpoint: false, boundaries: [],
    },
    // Primera lectura: hay tarea. La segunda la sirve `siguienteContexto`, ya sin tarea, para que el
    // bucle cierre en vez de repetir la misma para siempre.
    'Triage|planning-context': {
      blocked: '', hasTask: true, wipActive: false, queued: 1, lane: 'full',
      slug: 'T-1', hito: 'H1', service: './api', acceptance: 'el alta rechaza un duplicado', epic: 'E1',
    },
    'Cast|cast': { build: 'backend-engineer', review: [], verify: [], qa: [] },
    'Ready|ready,needsHuman': { ready: true, needsHuman: false },
    'Decompose|hours,needsSplit': { hours: 2, needsSplit: false },
    'Plan|approach,steps,files,testStrategy': {
      approach: 'validar en el repositorio', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
    'Critique|approved,concerns,consulted': { approved: true, concerns: [], consulted: ['api/alta.go'] },
    'Critique|wipActive': { wipActive: true },
    'Plan|wipActive': { wipActive: true },
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'alta con rechazo de duplicado',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error, got nil' }],
      discovered: [], closedTask: false,
    },
    'Review|approved,concerns,consulted': { approved: true, concerns: [], consulted: ['api/alta.go'] },
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'go test ./...', exitCode: 0 }],
    },
    'QA|passed,evidence': { passed: true, evidence: 'alta rechaza el duplicado contra la API real' },
    'Commit|committed': { committed: true, hash: 'abc123' },
    'Pick|expanded': { expanded: false },
    'Closing|passed,details': { passed: true, details: 'check verde' },
  }
}

const SIN_TAREA = { blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '' }

// Ejecuta el recorrido y devuelve lo que devolvió, más las fases y las claves que pidió. La clave sale
// de la fase y del `label` o de los campos obligatorios del schema: es lo que distingue una crítica de
// un review, que comparten schema y sólo se diferencian por dónde ocurren.
async function correr(cambios = {}, opciones = {}) {
  const guion = { ...guionBase(), ...cambios }
  if (opciones.lane) {
    guion['Triage|planning-context'] = { ...guion['Triage|planning-context'], lane: opciones.lane }
  }
  const fases = []
  const pedidas = []
  const escritos = []
  const prompts = []
  let fase = ''
  // Cada lectura de planning devuelve el siguiente de la lista, y al agotarse ya no hay tarea. Es lo
  // que cierra el bucle, y lo que deja escribir una expansión o un cambio de hito entre dos lecturas.
  const contextos = opciones.contextos || [guion['Triage|planning-context']]
  let leidos = 0

  const agent = async (prompt, options = {}) => {
    const clave = `${fase}|${options.label || (options.schema && options.schema.required || []).join(',')}`
    pedidas.push(clave)
    prompts.push({ clave, prompt })
    if (!options.schema) { escritos.push(prompt); return { ok: true } }
    if (options.label === 'planning-context') {
      const respuesta = leidos < contextos.length ? contextos[leidos] : SIN_TAREA
      leidos += 1
      return typeof respuesta === 'function' ? respuesta() : respuesta
    }
    if (!(clave in guion)) throw new Error(`el guion no cubre ${clave}`)
    // Una respuesta puede ser una función cuando el escenario necesita contestar distinto en cada vuelta.
    const respuesta = guion[clave]
    return typeof respuesta === 'function' ? respuesta() : respuesta
  }

  const resultado = await compilar()(
    agent, (title) => { fase = title; fases.push(title) }, () => {},
    async (thunks) => Promise.all(thunks.map((t) => t())), async () => [], async () => ({}),
    {}, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { resultado, fases, pedidas, escritos, prompts }
}

// Lo primero que hay que saber es que el recorrido llega al final, porque un freno que dispara siempre
// se ve idéntico a uno que funciona si sólo se comprueban los casos que frenan.
test('autobuild cierra una tarea cuando todo está en su lugar', async () => {
  const { resultado, fases } = await correr()
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}: ${resultado.detail || ''}`)
  assert.deepEqual(resultado.done, ['T-1'])
  for (const esperada of ['Triage', 'Plan', 'Critique', 'Build', 'Review', 'Verify', 'QA', 'Commit', 'Closing']) {
    assert.ok(fases.includes(esperada), `faltó la fase ${esperada}`)
  }
})

// La fase que persiste el WIP escribe un archivo y nada más. En una corrida real hizo el trabajo entero
// —implementó, cerró la tarea y dejó el WIP en IDLE— y Build lo tomó por trabajo de una corrida anterior,
// así que Review, Verify y QA no vieron ese código. Sin WIP activo, la tarea no entra a construirse.
test('sin WIP activo no se entra a construir', async () => {
  const { resultado, pedidas } = await correr({
    'Critique|wipActive': { wipActive: false, note: 'quedó en IDLE' },
  })
  assert.equal(resultado.reason, 'wip-not-persisted')
  assert.ok(!pedidas.some((clave) => clave.startsWith('Build|')), 'y no se construye sin el WIP puesto')
})

test('una aprobación que no declara qué inspeccionó frena en su etapa', async () => {
  const critique = await correr({
    'Critique|approved,concerns,consulted': { approved: true, concerns: [], consulted: [] },
  })
  assert.equal(critique.resultado.reason, 'critique-unbacked')

  const review = await correr({
    'Review|approved,concerns,consulted': { approved: true, concerns: [], consulted: [] },
  })
  assert.equal(review.resultado.reason, 'review-unbacked')
})

test('un rojo declarado sin el fallo que lo muestra no cuenta como rojo', async () => {
  const { resultado } = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '   ' }],
    },
  })
  assert.equal(resultado.reason, 'build-unproven')
  assert.match(resultado.detail, /TestAltaDuplicada/)
})

// Construir no es cerrar. En una corrida real el plan traía «VERIFY», «QA» y «Cierre — commit» entre sus
// pasos; quien construyó los ejecutó, y la tarea salió del BACKLOG y entró a DONE sin que Review, Verify ni
// QA la miraran. El plan ya no los pide, y si ocurre igual la corrida frena en vez de seguir sobre lo cerrado.
test('una tarea cerrada en Build no sigue como si nada', async () => {
  const { resultado, pedidas } = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x', discovered: [], closedTask: true,
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
    },
  })
  assert.equal(resultado.reason, 'build-closed-task')
  assert.ok(!pedidas.some((clave) => clave.startsWith('Review|')), 'y no se revisa lo que ya se cerró')
})

// Una decisión que quedó abierta se registra y no frena lo que sí se entregó. Frenaba, y en tres corridas
// reales frenó las tres veces con la tarea completa: toda aceptación en prosa tiene un borde indefinido, así
// que el freno saltaba siempre. Lo que de verdad bloquea sigue siendo completed:false con su blocker.
test('una decisión abierta queda escrita y el recorrido sigue', async () => {
  const { resultado, escritos } = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x', redFirst: [], closedTask: false,
      discovered: [{ kind: 'open', detail: 'nadie definió qué pasa con el alta sin país' }],
    },
  })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.deepEqual(resultado.done, ['T-1'], 'lo entregado se cierra igual')
  assert.ok(
    escritos.some((texto) => texto.includes('HUMAN_ACTIONS') && texto.includes('sin país')),
    'y queda registrada con quién puede tomarla, o vuelve a aparecer sin dueño',
  )
})

// Lo que impide entregar no pasa por ese canal: el cargo no completa, y ahí sí frena.
test('lo que de verdad bloquea sigue frenando por su propio camino', async () => {
  const { resultado } = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: false, summary: 'x', redFirst: [], discovered: [], closedTask: false,
      blockers: ['sin credencial del proveedor de pagos'],
    },
  })
  assert.equal(resultado.reason, 'build-blocked')
  assert.match(resultado.detail, /credencial/)
})

test('un caso descubierto entra con su prueba, y el nombre no tiene que coincidir letra por letra', async () => {
  const suelto = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  assert.equal(suelto.resultado.reason, 'edge-unproven')

  // El mismo caso, nombrado de las dos formas en que un modelo lo escribe: no debe frenar.
  const cubierto = await correr({
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x',
      redFirst: [{ test: 'alta_test.go::TestAltaSinPais', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  assert.equal(cubierto.resultado.stopped, undefined, `frenó en ${cubierto.resultado.reason || ''}`)
})

test('un criterio sin cubrir va a una persona o vuelve a quien construye, según su causa', async () => {
  const ambiguo = await correr({
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el alta es rápida', cause: 'ambiguous' }],
    },
  })
  assert.equal(ambiguo.resultado.reason, 'acceptance-ambiguous')
  assert.ok(
    ambiguo.escritos.some((texto) => texto.includes('HUMAN_ACTIONS')),
    'una definición que falta se registra donde la lee una persona',
  )

  // Una prueba que falta la escribe el propio recorrido: rebota, Verify corre de nuevo y sigue.
  let vuelta = 0
  const rebote = await correr({
    'Verify|passed,commands,details,uncovered': () => {
      vuelta += 1
      return {
        passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
        uncovered: vuelta === 1 ? [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }] : [],
      }
    },
  })
  assert.equal(rebote.resultado.stopped, undefined, `frenó en ${rebote.resultado.reason || ''}`)
  assert.equal(vuelta, 2, 'Verify tiene que volver a correr después del rebote')
  assert.equal(
    rebote.pedidas.filter((clave) => clave === 'Verify|').length, 1,
    'y el rebote va a quien construye, en una sola vuelta',
  )
})

test('un criterio que sigue sin prueba después del rebote frena', async () => {
  const { resultado } = await correr({
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', commands: [{ cmd: 'go test ./...', exitCode: 0 }],
      uncovered: [{ criterion: 'el duplicado se rechaza', cause: 'missing-test' }],
    },
  })
  assert.equal(resultado.reason, 'verify-hollow')
  assert.match(resultado.detail, /el duplicado se rechaza/)
})

test('gates en verde que no corrieron ninguna prueba no cierran la tarea', async () => {
  const { resultado } = await correr({
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'golangci-lint run', exitCode: 0 }, { cmd: 'go build ./...', exitCode: 0 }],
    },
  })
  assert.equal(resultado.reason, 'verify-untested')

  // Y el gate cuyo nombre el patrón no conoce pasa igual si quien lo corrió dice que corrió pruebas.
  const declarado = await correr({
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'mvn verify', exitCode: 0, ranTests: true }],
    },
  })
  assert.equal(declarado.resultado.stopped, undefined, `frenó en ${declarado.resultado.reason || ''}`)
})

// Un subagente que muere devuelve `null`, y antes eso reventaba con un TypeError en la fase que fuera.
test('un subagente que no contesta corta con su etapa puesta', async () => {
  const { resultado } = await correr({ 'Build|completed,summary,redFirst,discovered,closedTask': null })
  assert.equal(resultado.reason, 'agent-unavailable')
  assert.match(resultado.detail, /Build/)
})

// Un carril baja ceremonia: saltea fases enteras. Lo que no puede bajar es la evidencia que se exige,
// y esa distinción no se ve leyendo el fuente —las dos cosas son el mismo `if`—.
test('el carril directo saltea la ceremonia y no pide un cargo para cada fase', async () => {
  const { resultado, fases } = await correr({}, { lane: 'directo' })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.deepEqual(resultado.done, ['T-1'])
  for (const ausente of ['Cast', 'Decompose', 'Critique', 'Review']) {
    assert.ok(!fases.includes(ausente), `directo no debería llegar a ${ausente}`)
  }
  for (const presente of ['Ready', 'Plan', 'Build', 'Verify', 'QA', 'Commit', 'Done']) {
    assert.ok(fases.includes(presente), `directo se saltó ${presente}`)
  }
})

test('el carril lite conserva el review y saltea el desmenuzado del plan', async () => {
  const { resultado, fases } = await correr({}, { lane: 'lite' })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  for (const ausente of ['Decompose', 'Critique']) {
    assert.ok(!fases.includes(ausente), `lite no debería llegar a ${ausente}`)
  }
  for (const presente of ['Cast', 'Review', 'Verify', 'QA']) {
    assert.ok(fases.includes(presente), `lite se saltó ${presente}`)
  }
})

// El Cast propone lo mismo en los dos carriles; lo que cambia es qué hace el recorrido con eso.
test('lite se queda con el dueño de cada fase y descarta los condicionales', async () => {
  const cast = { 'Cast|cast': { build: 'backend-engineer', review: ['security-engineer'], verify: [], qa: [] } }
  const revisorDe = ({ prompts }) => prompts.find((entrada) => entrada.clave.startsWith('Review|')).prompt

  const enLite = revisorDe(await correr(cast, { lane: 'lite' }))
  assert.match(enLite, /software-architect/, 'el dueño de la fase revisa igual')
  assert.ok(!enLite.includes('security-engineer'), 'y en lite el condicional no se suma')

  const enFull = revisorDe(await correr(cast))
  assert.match(enFull, /security-engineer/, 'en el carril completo sí, que es de lo que lite baja')
})

test('bajar ceremonia no baja la evidencia que cada carril exige', async () => {
  const sinFallo = {
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '' }],
    },
  }
  const sinPrueba = {
    'Verify|passed,commands,details,uncovered': {
      passed: true, details: 'verde', uncovered: [],
      commands: [{ cmd: 'go build ./...', exitCode: 0 }],
    },
  }
  const edgeSuelto = {
    'Build|completed,summary,redFirst,discovered,closedTask': {
      completed: true, summary: 'x', closedTask: false,
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  }
  for (const lane of ['directo', 'lite']) {
    assert.equal((await correr(sinFallo, { lane })).resultado.reason, 'build-unproven', lane)
    assert.equal((await correr(sinPrueba, { lane })).resultado.reason, 'verify-untested', lane)
    assert.equal((await correr(edgeSuelto, { lane })).resultado.reason, 'edge-unproven', lane)
  }
})

// El plan y el diff tienen una corrección y una sola. Que la segunda vuelta exista es la mitad; la otra
// es que no haya una tercera, porque un recorrido que insiste hasta que le aprueben no revisa nada.
test('un review que rechaza corrige una vez y sigue si la segunda aprueba', async () => {
  let vuelta = 0
  const { resultado, escritos } = await correr({
    'Review|approved,concerns,consulted': () => {
      vuelta += 1
      return vuelta === 1
        ? { approved: false, concerns: ['falta el caso vacío'], consulted: ['api/alta.go'] }
        : { approved: true, concerns: [], consulted: ['api/alta.go'] }
    },
  })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.equal(vuelta, 2, 'la corrección se revisa de nuevo, no se da por buena')
  assert.ok(
    escritos.some((texto) => texto.includes('falta el caso vacío')),
    'y lo que hay que corregir viaja con el hallazgo, no como "arreglalo"',
  )
})

test('un review que sigue rechazando después de corregir frena', async () => {
  const { resultado } = await correr({
    'Review|approved,concerns,consulted': {
      approved: false, concerns: ['sigue faltando el caso vacío'], consulted: ['api/alta.go'],
    },
  })
  assert.equal(resultado.reason, 'review-failed')
  assert.match(resultado.detail, /sigue faltando/)
})

test('un plan que no sobrevive a la segunda crítica no llega a construirse', async () => {
  const { resultado, pedidas } = await correr({
    'Critique|approved,concerns,consulted': {
      approved: false, concerns: ['el alcance se pasa de la aceptación'], consulted: ['api/alta.go'],
    },
    'Critique|approach,steps,files,testStrategy': {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(resultado.reason, 'plan-rejected')
  assert.ok(!pedidas.some((clave) => clave.startsWith('Build|')), 'no se construye sobre un plan rechazado')
})

test('una tarea que no entra en el tope de horas se parte y no se construye', async () => {
  const { resultado, pedidas, escritos } = await correr({
    'Decompose|hours,needsSplit': {
      hours: 12, needsSplit: true,
      subtasks: [{ title: 'alta', acceptance: 'rechaza duplicado' }, { title: 'baja', acceptance: 'borra' }],
    },
  })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.deepEqual(resultado.done, [], 'la tarea partida no se cierra: se reemplaza y se vuelve a elegir')
  assert.ok(!pedidas.some((clave) => clave.startsWith('Build|')), 'y no se construye lo que se acaba de partir')
  assert.ok(escritos.some((texto) => texto.includes('BACKLOG')), 'las subtareas reemplazan a la original')
})

test('sin tarea en cola se expande la próxima épica y se sigue con ella', async () => {
  const conTarea = guionBase()['Triage|planning-context']
  const { resultado, pedidas } = await correr(
    { 'Pick|expanded': { expanded: true, hito: 'H1' } },
    { contextos: [{ blocked: '', hasTask: false, wipActive: false, queued: 0, lane: 'full' }, conTarea] },
  )
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.deepEqual(resultado.done, ['T-1'], 'lo expandido se ejecuta en la misma corrida')
  assert.ok(pedidas.includes('Pick|expanded'), 'y pasó por la expansión, no por una tarea que ya estaba')
})

test('sin nada que expandir el recorrido termina sin inventar trabajo', async () => {
  const { resultado, pedidas } = await correr({}, { contextos: [] })
  assert.equal(resultado.stopped, undefined, `frenó en ${resultado.reason || ''}`)
  assert.deepEqual(resultado.done, [])
  assert.ok(!pedidas.some((clave) => clave.startsWith('Build|')), 'no se construye sin tarea')
})

test('un checkpoint humano sin resolver corta antes de tocar nada', async () => {
  const { resultado, pedidas } = await correr({}, {
    contextos: [{ blocked: 'hito anterior sin revisar', hasTask: true, wipActive: false, queued: 1 }],
  })
  assert.equal(resultado.reason, 'awaiting-human-review')
  assert.equal(pedidas.filter((clave) => clave.startsWith('Plan|')).length, 0)
})

test('el hito cambia y la corrida cierra en vez de seguir con el siguiente', async () => {
  const primera = guionBase()['Triage|planning-context']
  const { resultado } = await correr({}, {
    contextos: [primera, { ...primera, slug: 'T-2', hito: 'H2' }],
  })
  assert.deepEqual(resultado.done, ['T-1'], 'una corrida cierra un hito, no todos los que haya')
  assert.equal(resultado.hito, 'H1')
})

test('con checkpoint configurado el hito terminado queda esperando una firma', async () => {
  const conGate = { ...guionBase()['Triage|contract-digest'], humanCheckpoint: true }
  const { escritos } = await correr({ 'Triage|contract-digest': conGate })
  assert.ok(
    escritos.some((texto) => texto.includes('AWAITING_REVIEW')),
    'el hito terminado deja el gate escrito, que es lo que impide que la próxima corrida siga sola',
  )
  // Y apagado no lo escribe: es configuración del proyecto, no una ceremonia fija.
  const { escritos: sinGate } = await correr()
  assert.ok(!sinGate.some((texto) => texto.includes('AWAITING_REVIEW')))
})

test('una tarea que vuelve a quedar elegible para siempre corta con su motivo', async () => {
  const eterna = guionBase()['Triage|planning-context']
  const { resultado } = await correr({}, { contextos: Array.from({ length: 60 }, () => eterna) })
  assert.equal(resultado.reason, 'milestone-too-long')
  assert.match(resultado.detail, /50/)
})
