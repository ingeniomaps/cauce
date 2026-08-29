'use strict'

// Lo que el runtime le exige a cualquier recorrido, sea cual sea su trabajo: que su `meta` sea el
// literal puro que acepta, que sólo use las primitivas que le da, que no nombre nada sin declararlo
// y que ninguna ruta sea la de una máquina. Cambia cuando cambia el runtime, no cuando cambia un
// recorrido — lo que cada uno dice está en las suites hermanas.

const { CLI } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const WF = path.resolve(__dirname, '..', 'automatization', 'workflows')

function workflowFiles() {
  const found = []
  for (const entry of fs.readdirSync(WF, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) found.push(path.join(entry.parentPath, entry.name))
  }
  return found
}

function codeOnly(src) {
  let out = ''
  let i = 0
  let mode = 'code'
  // Pila explícita: `tpl` es un template abierto, `expr` una interpolación adentro de uno. Sin
  // distinguirlas, cerrar un template anidado dentro de un `${}` devolvía a modo texto cuando todavía
  // se estaba en código, y la prosa de ese tramo entraba al análisis como si fueran identificadores.
  const stack = []
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 2; continue }
      if (c === "'" || c === '"') {
        const quote = c
        i++
        while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
        i++
        out += ' '
        continue
      }
      if (c === '`') { stack.push({ type: 'tpl' }); mode = 'template'; i++; out += ' '; continue }
      const top = stack[stack.length - 1]
      if (c === '}' && top && top.type === 'expr') {
        if (top.braces === 0) { stack.pop(); mode = 'template'; i++; continue }
        top.braces--
      }
      if (c === '{' && top && top.type === 'expr') top.braces++
      out += c
      i++
      continue
    }
    if (c === '\\') { i += 2; continue }
    if (c === '`') {
      stack.pop()
      const top = stack[stack.length - 1]
      mode = top && top.type === 'tpl' ? 'template' : 'code'
      i++
      continue
    }
    if (c === '$' && d === '{') { stack.push({ type: 'expr', braces: 0 }); mode = 'code'; i += 2; out += ' '; continue }
    i++
  }
  return out
}

// El runtime exige que `meta` sea un literal puro y rechaza el archivo entero antes de la primera fase
// si no lo es. Nada lo comprobaba: `autobuild` derivaba sus catorce fases con un `.map` y no arrancaba,
// cosa que ningún test veía porque todos leen el cuerpo y el arnés lo evalúa sin pasar por esa validación.
test('el meta de cada workflow es un literal puro, que es lo que el runtime acepta', () => {
  for (const file of workflowFiles()) {
    const bloque = (fs.readFileSync(file, 'utf8').match(/export const meta = \{[\s\S]*?\n\}/) || [])[0]
    assert.ok(bloque, `${path.relative(WF, file)}: sin bloque meta`)
    // Sin comentarios ni literales de texto: adentro hay prosa con paréntesis y flechas.
    const desnudo = bloque
      .replace(/\/\/[^\n]*/g, '')
      .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
      .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
      .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    for (const [patron, queEs] of [[/\w\s*\(/, 'una llamada'], [/\.\.\./, 'un spread'], [/\$\{/, 'interpolación']]) {
      assert.equal(patron.test(desnudo), false, `${path.relative(WF, file)}: el meta tiene ${queEs}`)
    }
  }
})

// La misma comprobación estaba repartida en cuatro tests, con dos listas distintas: dos miraban rutas
// de Windows y dos no, así que un `C:\\Users\\...` pasaba por la mitad de ellas. Y entre las cuatro
// dejaban afuera los tres `agent-*.js`, que nadie miraba. Una sola, con una lista, sobre todos.
//
// Se lee renderizado: lo que incluye `{{INCLUDE:}}` también viaja a la instancia.
test('ningún workflow lleva la ruta de una máquina', () => {
  const A = require('../engine/automation')
  const automation = path.resolve(__dirname, '..', 'automatization')
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
test('un workflow no llama a nada que no exista', () => {
  // Lo que el runtime inyecta, más los built-ins del lenguaje.
  const runtime = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow'])
  const builtins = new Set([
    'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Promise', 'Set', 'Map',
    'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
  ])
  const keywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new', 'do',
  ])
  const faltantes = []
  const A = require('../engine/automation')
  const automation = path.resolve(__dirname, '..', 'automatization')
  for (const file of workflowFiles()) {
    // Renderizado: `finish`, `stop` y `ROOT` llegan por `{{INCLUDE:}}`, así que el archivo crudo no
    // los declara y cada uno parecería una llamada a algo inexistente.
    // Sin comentarios ni literales: adentro hay prosa en castellano que parece una llamada.
    const source = A.render(file, '{{OPS_DIR}}', automation)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
      .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
      .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
    const declared = new Set(
      [...source.matchAll(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((hit) => hit[1]),
    )
    for (const hit of source.matchAll(/(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/gm)) {
      const name = hit[1]
      if (runtime.has(name) || builtins.has(name) || keywords.has(name) || declared.has(name)) continue
      faltantes.push(`${path.relative(WF, file)} → ${name}`)
    }
  }
  assert.deepEqual([...new Set(faltantes)], [])
})

test('ningún workflow usa un nombre que no declaró', () => {
  // Lo que el arnés le pone a un workflow, más lo que trae el runtime. `{{INCLUDE:}}` se resuelve como
  // al instalar: lo que declara el fragmento compartido está declarado.
  const HARNESS = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'args', 'budget', 'workflow',
    'JSON', 'Math', 'Array', 'String', 'Object', 'Number', 'RegExp', 'Boolean', 'Promise', 'Date', 'Set',
    'Map', 'console', 'Error', 'process', 'require', 'module', 'exports', 'Symbol', 'globalThis'])
  const AUTOMATION = path.resolve(__dirname, '..', 'automatization')
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
  const flowsDir = path.resolve(__dirname, '..', 'flows', 'system')
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
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
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
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
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
