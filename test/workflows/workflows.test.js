'use strict'

// Lo que el runtime le exige a cualquier recorrido, sea cual sea su trabajo: que su `meta` sea el
// literal puro que acepta, que sólo use las primitivas que le da, que no nombre nada sin declararlo
// y que ninguna ruta sea la de una máquina. Cambia cuando cambia el runtime, no cuando cambia un
// recorrido — lo que cada uno dice está en las suites hermanas.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { compileWorkflow } = require('../support/workflow')

const WF = path.resolve(__dirname, '..', '..', 'automatization', 'workflows')

const { codeOnly } = require('../support/lexer')

function workflowFiles() {
  const found = []
  for (const entry of fs.readdirSync(WF, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) found.push(path.join(entry.parentPath, entry.name))
  }
  return found
}


// Lo primero que el runtime le pide a un recorrido, y lo único que nadie comprobaba: que compile. El
// render es sustitución de texto, así que un archivo roto se escribe igual en `.claude/workflows/` y el
// cargador lo **descarta sin decir nada** — el comando simplemente no existe, y desde afuera se ve
// idéntico a haber abierto la sesión antes de renderizarlo.
//
// `agent-promote` llevaba dos `const PERIOD` en el mismo alcance y nunca fue invocable. Sólo se vio al
// querer usarlo: la suite compilaba dos de siete recorridos, y los otros cinco podían estar rotos sin
// que nada fallara. Se compila como lo hace el runtime, con el mismo arnés.
test('todos los workflows compilan, que es lo primero que el runtime les pide', () => {
  // El nombre es la ruta relativa y no el basename: dos recorridos viven en `integrations/`, y con el
  // basename `compileWorkflow` buscaba `workflows/promote.js`, que no existe.
  const nombres = workflowFiles()
    .map((file) => path.relative(WF, file).replace(/\\/g, '/').slice(0, -3)).sort()
  assert.ok(nombres.length >= 6, `se esperaban los workflows del repositorio y aparecieron ${nombres.length}`)
  for (const nombre of nombres) {
    assert.doesNotThrow(() => compileWorkflow(nombre), `${nombre}.js no compila: el cargador lo descarta`)
  }
})

// El runtime exige que `meta` sea un literal puro y rechaza el archivo entero antes de la primera fase
// si no lo es. Nada lo comprobaba: `autobuild` derivaba sus catorce fases con un `.map` y no arrancaba,
// cosa que ningún test veía porque todos leen el cuerpo y el arnés lo evalúa sin pasar por esa validación.
// La barra entra a la lista en vez de enseñarle a leer regex a este desnudado: en un literal puro no
// hay división, así que la única barra posible abre uno. Y el lexer compartido no sirve acá porque se
// come el `${` que esta lista busca —lo lee como interpolación, que es su trabajo—. Caso 084.
const META_PROHIBIDO = [
  [/\w\s*\(/, 'una llamada'], [/\.\.\./, 'un spread'], [/\$\{/, 'interpolación'],
  [/\//, 'una barra, que en un literal puro sólo abre un regex'],
]

// Sin comentarios ni literales de texto: adentro hay prosa con paréntesis y flechas.
const bareMeta = (block) => block
  .replace(/\/\/[^\n]*/g, '')
  .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
  .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
  // El `${` sobrevive al recorte del template porque es lo único que se busca adentro de uno, y el
  // orden lo escondía: hasta 0.78.0 el template se iba entero y la regla de interpolación no podía
  // dispararse nunca —`${` sólo existe adentro de uno—. Lo encontró la prueba de detectores de abajo,
  // que es exactamente lo que R9 dice de una aserción que nadie vio en rojo. Caso 084.
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, (t) => `\`\`${(t.match(/\$\{/g) || []).join('')}`)

const metaOffences = (block) => META_PROHIBIDO
  .filter(([patron]) => patron.test(bareMeta(block))).map(([, queEs]) => queEs)

test('el meta de cada workflow es un literal puro, que es lo que el runtime acepta', () => {
  for (const file of workflowFiles()) {
    const bloque = (fs.readFileSync(file, 'utf8').match(/export const meta = \{[\s\S]*?\n\}/) || [])[0]
    assert.ok(bloque, `${path.relative(WF, file)}: sin bloque meta`)
    assert.deepEqual(metaOffences(bloque), [], `${path.relative(WF, file)}: el meta tiene lo que no va`)
  }
})

// Una lista de patrones se lee bien esté vacía o llena, así que se le pasa lo que tiene que atrapar. El
// del regex es el que este caso agrega y el que nadie iba a escribir: hasta 0.78.0 un `meta` con un
// literal de regex pasaba en verde, porque las tres reglas de antes no lo nombraban.
test('los detectores del meta ven lo que tienen que ver', () => {
  const limpio = 'export const meta = {\n  name: \'x\',\n  description: \'hace algo (y algo más)\',\n}'
  assert.deepEqual(metaOffences(limpio), [], 'la prosa entrecomillada no dispara nada')
  assert.deepEqual(metaOffences(limpio.replace('\'x\'', 'slug(1)')), ['una llamada'])
  assert.deepEqual(metaOffences(limpio.replace('\'x\'', '...otros')), ['un spread'])
  assert.deepEqual(metaOffences(limpio.replace('\'x\'', '`${n}`')), ['interpolación'])
  assert.deepEqual(metaOffences(limpio.replace('\'x\'', '/re/')),
    ['una barra, que en un literal puro sólo abre un regex'])
})

// La misma comprobación estaba repartida en cuatro tests, con dos listas distintas: dos miraban rutas
// de Windows y dos no, así que un `C:\\Users\\...` pasaba por la mitad de ellas. Y entre las cuatro
// dejaban afuera los tres `agent-*.js`, que nadie miraba. Una sola, con una lista, sobre todos.
//
// Se lee renderizado: lo que incluye `{{INCLUDE:}}` también viaja a la instancia.
test('ningún workflow lleva la ruta de una máquina', () => {
  const A = require('../../engine/automation')
  const automation = path.resolve(__dirname, '..', '..', 'automatization')
  // La unidad de Windows no se ancla con \b: en prosa española `ó` no es carácter de palabra, así
  // que `intención:\n` ofrecía un límite entre la `ó` y la `n`, y `n:\` pasaba por `C:\`. El
  // lookbehind pide que antes de la letra no haya otra, que es lo que distingue una unidad de la
  // última letra de una palabra.
  const DE_UNA_MAQUINA = [/\/home\//, /\/Users\//, /(?<![A-Za-zÀ-ÿ])[A-Za-z]:\\/]
  const filtradas = []
  for (const file of workflowFiles()) {
    const source = A.render(file, '{{OPS_DIR}}', automation, '{{OPS_ROOT}}')
    for (const patron of DE_UNA_MAQUINA) {
      if (patron.test(source)) filtradas.push(`${path.relative(WF, file)} → ${patron}`)
    }
  }
  assert.ok(workflowFiles().length >= 8, 'el recorrido encontró los workflows')
  assert.deepEqual(filtradas, [])
})

test('un workflow sólo usa lo que el runtime le da', () => {
  const prohibidas = /\b(process\.|require\(|Date\.now|new Date\(|Math\.random|__dirname|__filename)/g
  const encontradas = []
  for (const file of workflowFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const hit of source.matchAll(prohibidas)) {
      encontradas.push(`${path.relative(WF, file)} → ${hit[1]}`)
    }
  }
  assert.deepEqual(encontradas, [])
})

// Un identificador que el runtime no da y el archivo no define revienta el workflow, y lo hace en el
// momento en que se lo llama: `finish` estaba en la línea de cierre, así que el recorrido gastaba
// cada etapa y moría al final. Leer estos archivos como texto no alcanza para verlo.
// Lo que el runtime inyecta, más los built-ins y las palabras del lenguaje que van seguidas de `(`.
const RUNTIME = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow'])
const BUILTINS = new Set([
  'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Promise', 'Set', 'Map',
  'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
])
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new', 'do',
])

// Recibe el fuente ya renderizado y devuelve los nombres que se llaman sin existir. Se desnuda con el
// lexer compartido y no con una cadena de `.replace()`, que hasta 0.78.0 leía cada clase de literal por
// separado: `['\'', '"']` le hacía casar la comilla simple desde la primera hasta la tercera, por
// encima de la doble, y `finish` —declarado en un `{{INCLUDE:}}`— aparecía como inexistente. Caso 084.
function undeclaredCalls(rendered) {
  const source = codeOnly(rendered)
  const declared = new Set(
    [...source.matchAll(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((hit) => hit[1]),
  )
  const missing = []
  for (const hit of source.matchAll(/(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/gm)) {
    const name = hit[1]
    if (RUNTIME.has(name) || BUILTINS.has(name) || KEYWORDS.has(name) || declared.has(name)) continue
    missing.push(name)
  }
  return [...new Set(missing)]
}

test('un workflow no llama a nada que no exista', () => {
  const faltantes = []
  const A = require('../../engine/automation')
  const automation = path.resolve(__dirname, '..', '..', 'automatization')
  for (const file of workflowFiles()) {
    // Renderizado: `finish`, `stop` y `ROOT` llegan por `{{INCLUDE:}}`, así que el archivo crudo no
    // los declara y cada uno parecería una llamada a algo inexistente.
    const rendered = A.render(file, '{{OPS_DIR}}', automation)
    faltantes.push(...undeclaredCalls(rendered).map((name) => `${path.relative(WF, file)} → ${name}`))
  }
  assert.deepEqual([...new Set(faltantes)], [])
})

// Sobre los nueve recorridos de hoy la puerta da verde con cualquier lexer, así que ese verde no dice
// que lea bien: hay que pasarle lo que tiene que atrapar. Las dos formas de abajo son las que la cadena
// de `.replace()` dejaba pasar, y las dos son silenciosas —se comía el resto de la línea, así que la
// llamada inexistente desaparecía en vez de reportarse—.
test('la puerta de llamadas ve lo que se esconde detrás de un literal', () => {
  assert.deepEqual(undeclaredCalls('const x = noExiste(1)\n'), ['noExiste'], 'el caso simple')
  assert.deepEqual(undeclaredCalls("const p = u.replace(/x\\//g, '') + noExiste(1)\n"), ['noExiste'],
    'detrás de un regex con // adentro, que es la forma que hoy tienen dos recorridos')
  assert.deepEqual(undeclaredCalls('const Q = [\'\\\'\', \'"\']\nconst y = noExiste(2)\n'), ['noExiste'],
    'y detrás de un arreglo que mezcla los dos estilos de comilla')
  assert.deepEqual(undeclaredCalls('const y = String(1) + agent(2)\n'), [],
    'lo que el runtime da y los built-ins no se reportan')
})

test('ningún workflow usa un nombre que no declaró', () => {
  // Lo que el arnés le pone a un workflow, más lo que trae el runtime. `{{INCLUDE:}}` se resuelve como
  // al instalar: lo que declara el fragmento compartido está declarado.
  const HARNESS = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'args', 'budget', 'workflow',
    'JSON', 'Math', 'Array', 'String', 'Object', 'Number', 'RegExp', 'Boolean', 'Promise', 'Date', 'Set',
    'Map', 'console', 'Error', 'process', 'require', 'module', 'exports', 'Symbol', 'globalThis'])
  const AUTOMATION = path.resolve(__dirname, '..', '..', 'automatization')
  for (const file of workflowFiles()) {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/\{\{INCLUDE:([^}]+)\}\}/g, (_, rel) =>
        fs.readFileSync(path.resolve(AUTOMATION, rel.trim()), 'utf8'))
    const code = codeOnly(source)
    const declared = new Set()
    for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1])
    for (const m of code.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/^\.{0,3}([A-Za-z_$][\w$]*)/)
        if (name) declared.add(name[1])
      }
    }
    for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1])
    for (const m of code.matchAll(/(?:\(|,|^|\s)\s*([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1])
    for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/^\.{0,3}([A-Za-z_$][\w$]*)/)
        if (name) declared.add(name[1])
      }
    }
    for (const m of code.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/([A-Za-z_$][\w$]*)\s*$/)
        if (name) declared.add(name[1])
      }
    }
    // Sólo la cabeza de cada cadena: en `context.items.length` el que tiene que existir es `context`.
    const free = new Set()
    for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\./g)) {
      if (!declared.has(m[1]) && !HARNESS.has(m[1])) free.add(m[1])
    }
    assert.deepEqual([...free], [], `${path.relative(WF, file)}: usa un nombre que no declaró`)
  }
})

// El manifiesto que `flow` transcribe sale de un `flow.json` real, y su schema es
// `additionalProperties: false`. Cuando el schema no acepta un campo que el contrato sí tiene, el
// agente lo copia —le pedimos que reporte lo que el comando imprimió—, el runtime lo rechaza y el
// reintento vuelve a copiarlo: se acaba el retry cap y la corrida muere sin haber hecho nada. Pasó con
// `dependsOn`, que está en las etapas de los seis contratos, en dos de cuatro corridas — dos, porque
// depende de que el agente adivine que tiene que tirar un campo que está en la fuente.
// El mismo par, un recorrido más abajo: `autobuild` lee el estado de planning por `planning.<campo>` y
// lo recibe validado contra un schema con `additionalProperties: false`, así que un campo que el código
// lee y el schema no declara llega siempre vacío. El arnés no valida —le entrega la respuesta armada—,
// de modo que un olvido ahí pasa entero por la suite: éste es el único lugar donde se ve.
test('el schema de planning-context declara los campos que autobuild le lee', () => {
  const source = fs.readFileSync(path.join(WF, 'autobuild.js'), 'utf8')
  const block = source.slice(source.indexOf('const CONTEXT'), source.indexOf('const EXPANSION'))
  const declared = new Set([...block.matchAll(/([a-zA-Z]+): \{/g)].map((hit) => hit[1]))
  const read = [...new Set([...source.matchAll(/planning\.([a-zA-Z]+)/g)].map((hit) => hit[1]))]

  assert.ok(read.length > 5, 'no se leyó ningún campo del contexto')
  assert.deepEqual(read.filter((field) => !declared.has(field)), [],
    'autobuild lee un campo que el schema no acepta, y lo va a recibir vacío para siempre')
})

test('el schema del manifiesto acepta los campos que los contratos de recorrido tienen', () => {
  const flowWf = fs.readFileSync(path.join(WF, 'flow.js'), 'utf8')
  const stageBlock = flowWf.match(/stages: \{ type: 'array', items: \{[\s\S]*?\n {4}\} \} \},/)
  assert.ok(stageBlock, 'no se encontró el bloque de etapas del schema')
  const accepted = new Set([...stageBlock[0].matchAll(/([a-zA-Z]+): \{ type:/g)].map((m) => m[1]))

  // A las dos alturas. La primera versión de esta prueba miraba sólo las claves de las etapas, así que
  // `completion` y `conditionalAgents` —dos campos reales de todo contrato— siguieron reventando el
  // retry cap después de haberla escrito. Un caso de `feasibility-review` quedó sin medir por eso.
  const manifest = flowWf.slice(flowWf.indexOf('const MANIFEST'), flowWf.indexOf('const STAGE'))
  const topLevel = new Set([...manifest.matchAll(/([a-zA-Z]+): \{ type:/g)].map((hit) => hit[1]))
  const flowsDir = path.resolve(__dirname, '..', '..', 'flows', 'system')
  const real = new Set()
  for (const slug of fs.readdirSync(flowsDir)) {
    const file = path.join(flowsDir, slug, 'flow.json')
    if (!fs.existsSync(file)) continue
    for (const stage of JSON.parse(fs.readFileSync(file, 'utf8')).stages || []) {
      for (const key of Object.keys(stage)) real.add(key)
    }
  }
  assert.ok(real.size, 'no se leyó ningún contrato de equipo')

  const missing = [...real].filter((key) => !accepted.has(key))
  assert.deepEqual(missing, [], 'el schema rechaza un campo de etapa que el contrato trae')

  const arriba = new Set()
  for (const slug of fs.readdirSync(flowsDir)) {
    const file = path.join(flowsDir, slug, 'flow.json')
    if (!fs.existsSync(file)) continue
    for (const key of Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')))) arriba.add(key)
  }
  // `schemaVersion` y `slug` no viajan: el recorrido ya sabe cuál es. `decisionOwners` viaja aplanado
  // en `owners`, que es lo que el prompt pide.
  const fuera = [...arriba].filter((key) => !topLevel.has(key)
    && !['schemaVersion', 'slug', 'decisionOwners'].includes(key))
  assert.deepEqual(fuera, [], 'el schema rechaza un campo de contrato que el manifiesto trae')
})

// Un runner que sólo lee instrucciones cumple el contrato a medias, y falla siempre del mismo lado: se
// salta lo que no deja un archivo visible. La lista de salida existe para lo que se comprueba mirando el
// disco, y por eso viaja con cada arranque que no es un workflow ejecutable.
//
// Se lee del archivo que cada uno instala de verdad, resuelto desde su manifest: gemini la llevaba en
// `GEMINI.md` de cuando el arranque le llegaba sólo como prosa, quedó copiada palabra por palabra de la
// de codex, y las dos se pudrieron igual. Preguntarle al manifest evita elegir el archivo a mano.
test('los runners sin workflow llevan la lista de lo que se comprueba al final', () => {
  const A = require('../../engine/automation')
  const REPO = path.resolve(__dirname, '..', '..')
  const automation = path.join(REPO, 'automatization')
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    // La distinción real no es tener recorrido sino de qué está hecho: un workflow JS es un programa
    // con fases y esquemas, y el resto es prosa enmarcada, que es la que tiene que llevar la lista.
    const arranque = (runner.artifacts || []).find((item) => /onboard/.test(item.source))
    if (!arranque || arranque.source.endsWith('.js')) continue
    const dir = path.join(automation, 'runners', name)
    const text = A.render(path.resolve(dir, arranque.source), '', automation)
    for (const marca of [/Por definir/, /\(supuesto\)/, /epic-NNN-<slug>\.md/, /HUMAN_ACTIONS\.md/,
      /formulario/, /molde/]) {
      assert.match(text, marca, `${name}: ${marca} falta en ${arranque.source}`)
    }
  }
})

test('cada runner ofrece el arranque en el formato que entiende', () => {
  const A = require('../../engine/automation')
  const REPO = path.resolve(__dirname, '..', '..')
  const nativos = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const artefactos = (runner.artifacts || []).map((item) => item.source)
    if (artefactos.some((source) => /onboard/.test(source))) { nativos.push(name); continue }
    // Sin artefacto nativo, el recorrido tiene que estar escrito en las instrucciones del runner:
    // Codex y Gemini operan el protocolo a mano y no tienen dónde ejecutarlo.
    const instrucciones = (runner.instructions || []).map(
      (item) => fs.readFileSync(path.resolve(REPO, 'automatization', 'runners', name, item.source), 'utf8'),
    ).join('\n')
    assert.match(instrucciones, /## El arranque/, `${name} no dice cómo arranca una instancia vacía`)
  }
  // Los cuatro instalan su arranque. Codex fue el último: su adaptador lo daba por incapaz de skills
  // desde 0.39.0, así que le llegaba sólo como prosa dentro de AGENTS.md mientras el CLI ya las leía.
  assert.deepEqual(nativos.sort(), [...A.RUNNER_NAMES].sort())
})
