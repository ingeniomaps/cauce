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
  // eslint-disable-next-line no-new-func
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
    'Build|completed,summary,redFirst,discovered': {
      completed: true, summary: 'alta con rechazo de duplicado',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error, got nil' }],
      discovered: [],
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
  const fases = []
  const pedidas = []
  const escritos = []
  let fase = ''
  let contextos = 0

  const agent = async (prompt, options = {}) => {
    const clave = `${fase}|${options.label || (options.schema && options.schema.required || []).join(',')}`
    pedidas.push(clave)
    if (!options.schema) { escritos.push(prompt); return { ok: true } }
    if (options.label === 'planning-context') {
      contextos += 1
      if (contextos > 1) return opciones.siguienteContexto || SIN_TAREA
      return guion['Triage|planning-context']
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
  return { resultado, fases, pedidas, escritos }
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
    'Build|completed,summary,redFirst,discovered': {
      completed: true, summary: 'x', discovered: [],
      redFirst: [{ test: 'TestAltaDuplicada', failure: '   ' }],
    },
  })
  assert.equal(resultado.reason, 'build-unproven')
  assert.match(resultado.detail, /TestAltaDuplicada/)
})

test('un hueco de diseño para el recorrido y queda escrito antes de parar', async () => {
  const { resultado, escritos } = await correr({
    'Build|completed,summary,redFirst,discovered': {
      completed: true, summary: 'x', redFirst: [],
      discovered: [{ kind: 'gap', detail: 'nadie definió qué pasa con el alta sin país' }],
    },
  })
  assert.equal(resultado.reason, 'design-gap')
  assert.ok(
    escritos.some((texto) => texto.includes('HUMAN_ACTIONS') && texto.includes('sin país')),
    'el hueco tiene que quedar registrado antes del stop, o vuelve a aparecer sin dueño',
  )
})

test('un caso descubierto entra con su prueba, y el nombre no tiene que coincidir letra por letra', async () => {
  const suelto = await correr({
    'Build|completed,summary,redFirst,discovered': {
      completed: true, summary: 'x',
      redFirst: [{ test: 'TestAltaDuplicada', failure: 'want error' }],
      discovered: [{ kind: 'edge', detail: 'alta sin país', test: 'TestAltaSinPais' }],
    },
  })
  assert.equal(suelto.resultado.reason, 'edge-unproven')

  // El mismo caso, nombrado de las dos formas en que un modelo lo escribe: no debe frenar.
  const cubierto = await correr({
    'Build|completed,summary,redFirst,discovered': {
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
  const { resultado } = await correr({ 'Build|completed,summary,redFirst,discovered': null })
  assert.equal(resultado.reason, 'agent-unavailable')
  assert.match(resultado.detail, /Build/)
})
