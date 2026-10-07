'use strict'

// El contraste entre lo que una entrada de DONE dice haber probado y lo que se puede comprobar sin
// creerle. Existe porque los dos lados de `tests: CN → prueba` los escribe el mismo autor en el mismo
// acto: comparar eso mide consistencia de prosa, no que la prueba exista.
//
// Son dos preguntas con alcances distintos y por eso se responden por separado:
//
// - **El artefacto existe**: se busca el nombre en las raíces declaradas. Vale para cualquier stack y
//   es lo que atrapa la prueba inventada o renombrada, que es la forma de la evidencia falsa.
// - **El gate corrió**: sale del registro que escribe `verify`, que es la única vez que el toolkit
//   ejecuta algo y ve su código de salida.
//
// Lo que NO se puede responder acá, y decirlo es parte del contraste: que la prueba nombrada haya
// corrido. Depende del runner, y no de una forma que se pueda normalizar: verificado corriendo una
// prueba que pasa en go1.26.3, donde `go test ./...` imprime `ok <paquete>` y nunca su nombre, y en
// node v24.18.0, donde `node --test` imprime `✔ <nombre>`. Una comprobación construida sobre la
// salida diría «no aparece» sobre los stacks del primer tipo, donde sí corrió.

const fs = require('node:fs')
const path = require('node:path')

const LOG = require('./trails').VERIFY
// Rodante: interesa el trabajo en curso, no la historia. Sin tope, el archivo crece con cada commit y
// nadie lo mira; con tope, lo que queda es lo que todavía se puede cruzar contra una entrada abierta.
const MAX_RUNS = 20

function logPath(root) {
  return path.join(root, LOG)
}

// Una línea por gate corrido. Nunca lanza: es un efecto de borde de un guard, y un registro que no se
// puede escribir no puede impedir el commit que estaba juzgando.
// `ms` es cuánto tardó el gate, y se guarda porque es lo que separa una suite que falló de una que
// nunca arrancó. Antes había que restar los `at` de dos líneas seguidas para estimarlo, y esa resta
// incluye lo que pasó entre gate y gate; el número propio no. Fue lo que costó diagnosticar el caso 068:
// tres gates «en rojo» a un segundo uno de otro, cuando la corrida real de ese proyecto tarda trece.
function record(root, gate, status, ms) {
  if (!root) return
  try {
    const file = logPath(root)
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
    const entry = JSON.stringify({ at: new Date().toISOString(), gate, status, ...(ms >= 0 ? { ms } : {}) })
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${[...previous, entry].slice(-MAX_RUNS).join('\n')}\n`)
  } catch { /* el registro es evidencia, no una puerta */ }
}

function runs(root) {
  try {
    return fs.readFileSync(logPath(root), 'utf8').split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

// Los rastros de una línea `tests:`, ya partidos en criterio y artefacto. `n/a — razón` no rastrea
// ninguno a propósito y sale de acá vacío, igual que en `contracts`.
function traces(tests) {
  return String(tests || '').split(/\s*;\s*/).filter(Boolean)
    .map((item) => item.match(/^(A|C\d+)\s*(?:→|->)\s*(.+)$/i))
    .filter(Boolean)
    .map((match) => ({ criterion: match[1].toUpperCase(), artifact: match[2].trim() }))
}

// Qué se puede ir a buscar. Un artefacto con espacios describe la prueba en vez de nombrarla —el molde
// admite «nombre de prueba o comando»—, y buscar una frase en el código devuelve siempre que no. Se
// declara inbuscable en vez de darlo por ausente: un contraste que confunde «no lo encontré» con «no
// existe» enseña a no leerlo.
function searchable(artifact) {
  return /^[^\s]{4,}$/.test(artifact) && /[A-Za-z]/.test(artifact)
}

// `skip` son carpetas que no se recorren: el `planning/` de la instancia. Con la raíz por defecto queda adentro
// del recorrido, y ahí la entrada que se contrasta se encontraba a sí misma: nombraba una prueba inventada
// y el nombre aparecía, en ella (caso 316).
function sourceFiles(dir, skip, found = [], depth = 0) {
  if (depth > 8 || found.length > 5000) return found
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (!entry.isDirectory()) found.push(full)
    else if (!skip.includes(full)) sourceFiles(full, skip, found, depth + 1)
  }
  return found
}

// Una traza con archivo y nombre de caso no es una frase: trae dos cosas que sí se pueden buscar. Es la
// forma que escriben las corridas —`app/test/suma.test.js — 'suma dos números'`—, y tomarla por frase dejaba
// sin contraste a todas (caso 316).
//
// El archivo es la palabra con forma de ruta. Sin barra sólo cuenta si un archivo se llama así: `node.js`
// en una frase no es un archivo. El caso es lo que va entre comillas, o los tramos separados por `›`. Lo
// demás que traiga la traza —el comando que la corre, una nota— no se toma por nombre de caso: buscarlo
// daría `parcial` sobre una traza que dice la verdad.
const PATHLIKE = /^[\w@.~-]*(?:\/[\w@.~-]+)+\.[A-Za-z]\w*$/
const FILELIKE = /^[\w@~-]+(?:\.[\w-]+)*\.[A-Za-z]\w*$/
const NESTED = /\s*›\s*|\s+>\s+/
const bare = (word) => word.replace(/\\/g, '/').replace(/^[`'"([*]+|[`'")\]*,.;:]+$/g, '')
  .replace(/(?:(?::\d+)+|#L\d+)$/, '').replace(/^\.\//, '')
const clean = (name) => name.replace(/^[\s—–:()>-]+|[\s—–:()-]+$/g, '').replace(/^(?:describe|it|test)\s+/, '')
function parts(artifact, tree) {
  const exists = (name) => tree.some((file) => file.endsWith(`/${name}`))
  const words = artifact.split(/\s+/)
  const isFile = (word) => PATHLIKE.test(bare(word)) || (FILELIKE.test(bare(word)) && exists(bare(word)))
  const files = words.filter(isFile).map(bare)
  const quoted = [...artifact.matchAll(/'([^']+)'|"([^"]+)"|`([^`]+)`/g)]
    .map((match) => match[1] || match[2] || match[3]).filter((one) => !isFile(one) && one.length > 2)
  const rest = words.filter((word) => !isFile(word)).join(' ')
  if (quoted.length || !NESTED.test(rest)) return { files, names: quoted }
  return { files, names: rest.split(NESTED).map(clean).filter((one) => one.length > 2) }
}

// El veredicto de una traza con partes. El archivo se busca por dónde termina su ruta, y el caso sólo adentro
// de los archivos que la traza nombra: que el archivo exista y el caso no es `parcial`, nunca `encontrado`
// —el archivo de pruebas suele existir desde antes, y darlo por bueno diría que la prueba nueva está—. Y
// `parcial` no es `ausente`: un nombre armado en el código con una variable no se encuentra como texto.
//
// Hasta dónde llega: el nombre se busca como texto, así que lo da por bueno si es parte de otro más largo
// o si está en un comentario, y los tramos anidados no se comprueban en orden.
function contrastParts({ files, names }, tree, read) {
  const within = files.map((file) => tree.filter((one) => one.endsWith(`/${file}`)))
  if (within.some((matching) => !matching.length)) return { verdict: 'ausente' }
  const where = files.length ? within.flat() : tree
  const missing = names.filter((name) => !where.some((file) => read(file).includes(name)))
  if (!missing.length) return { verdict: 'encontrado' }
  return files.length ? { verdict: 'parcial', missing } : { verdict: 'ausente' }
}

// El veredicto por rastro: `encontrado`, `parcial`, `ausente` o `inbuscable`. Sin raíces declaradas no se
// afirma nada — no hay dónde mirar, y decir «ausente» ahí sería inventar el hallazgo.
//
// Una sola palabra se busca como siempre: en la ruta de algún archivo o dentro del fuente de alguno, porque
// lo que un rastro así nombra suele ser la prueba —`TestAddSuma`— y no el archivo que la contiene.
function contrast(tests, roots, skip = []) {
  const tree = roots.flatMap((root) => sourceFiles(root, skip)).map((file) => `/${file.replace(/\\/g, '/')}`)
  const texts = new Map()
  const read = (file) => {
    if (texts.has(file)) return texts.get(file)
    let text = ''
    try { text = fs.readFileSync(file.slice(1), 'utf8') } catch { /* ilegible: no dice nada */ }
    texts.set(file, text)
    return text
  }
  return traces(tests).map((trace) => {
    if (!roots.length) return { ...trace, verdict: 'inbuscable' }
    if (searchable(trace.artifact)) {
      const found = tree.some((file) => file.includes(trace.artifact) || read(file).includes(trace.artifact))
      return { ...trace, verdict: found ? 'encontrado' : 'ausente' }
    }
    const found = parts(trace.artifact, tree)
    if (!found.files.length && !found.names.length) return { ...trace, verdict: 'inbuscable' }
    return { ...trace, ...found, ...contrastParts(found, tree, read) }
  })
}

module.exports = { MAX_RUNS, record, runs, traces, contrast }
