'use strict'

// El arnés con el que se corre `autobuild` de verdad, con los subagentes simulados. El runtime de
// workflows no es del toolkit —`agent`, `phase`, `log` los inyecta el harness del runner—, así que acá
// se inyectan a mano sobre el archivo renderizado: lo que se ejecuta es el mismo texto que recibe una
// instancia, con `{{INCLUDE:}}` ya resuelto.
//
// Vive aparte porque lo usan las cuatro suites del recorrido. Copiado, el guion base de una se
// despegaría del de otra y las dos seguirían en verde midiendo recorridos distintos.

const assert = require('node:assert/strict')
const { compileWorkflow } = require('./workflow')

// Las claves del guion, tal como las arma `runFlow`: la fase y, sin `label`, los campos obligatorios
// del schema. Nombrarlas es lo que hace que un tipeo se note: escrita a mano y mal, la clave se suma
// sin pisar nada y el guion base contesta el camino feliz, así que un escenario que espera que el
// recorrido siga queda verde sin haber cambiado lo que dice cambiar.
const KEY = {
  contract: 'Triage|contract-digest',
  context: 'Triage|planning-context',
  classify: 'Classify|classified',
  ready: 'Ready|ready,needsHuman',
  decompose: 'Decompose|hours,needsSplit',
  plan: 'Plan|approach,steps,files,testStrategy',
  critique: 'Critique|verdict,concerns,consulted',
  wip: 'WIP|wipActive',
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
    // Primera lectura: hay tarea. La segunda sale de `options.contexts`, ya sin tarea, para que el
    // bucle cierre en vez de repetir la misma para siempre.
    [KEY.context]: {
      blocked: '', hasTask: true, wipActive: false, queued: 1, lane: 'full',
      cast: { build: 'backend-engineer', review: [] },
      slug: 'T-1', hito: 'H1', service: './api', acceptance: 'el alta rechaza un duplicado', epic: 'E1',
    },
    [KEY.classify]: { classified: [{ slug: 'T-1', lane: 'full', build: 'backend-engineer', review: [] }] },
    [KEY.ready]: { ready: true, needsHuman: false },
    [KEY.decompose]: { hours: 2, needsSplit: false },
    [KEY.plan]: {
      approach: 'validar en el repositorio', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
    [KEY.critique]: { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] },
    [KEY.wip]: { wipActive: true },
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

const NO_TASK = { blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '', cast: { build: '', review: [] } }

// Ejecuta el recorrido y devuelve lo que devolvió, más las fases y las claves que pidió. La clave sale
// de la fase y del `label` o de los campos obligatorios del schema: es lo que distingue una crítica de
// un review, que comparten schema y sólo se diferencian por dónde ocurren.
async function runFlow(changes = {}, options = {}) {
  const script = { ...baseScript(), ...changes }
  if (options.lane) {
    script[KEY.context] = { ...script[KEY.context], lane: options.lane }
  }
  // Un carril llega de dos formas y el recorrido las distingue: escrito a mano en la línea de la tarea,
  // o puesto por el clasificador, que para ponerlo leyó la aceptación. `vouched` monta la segunda —una
  // primera lectura sin lane, el clasificador contestando ese carril, y la relectura ya con él—, que es
  // la única en la que saltear Ready tiene quien lo respalde. Vive acá y no en cada caso porque el
  // montaje es de tres piezas que tienen que coincidir entre sí.
  if (options.vouched) {
    const lane = options.lane || script[KEY.context].lane
    const build = script[KEY.context].cast.build
    script[KEY.classify] = { classified: [{ slug: script[KEY.context].slug, lane, build, review: [] }] }
    options = {
      ...options,
      contexts: options.contexts || [
        { ...script[KEY.context], lane: '', cast: { build: '', review: [] } },
        { ...script[KEY.context], lane },
      ],
    }
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

module.exports = { KEY, baseScript, ranToEnd, NO_TASK, runFlow, reached, writesTo }
