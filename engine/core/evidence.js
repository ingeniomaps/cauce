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

const LOG = path.join('planning', '.verify-log')
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

function sourceFiles(dir, found = [], depth = 0) {
  if (depth > 8 || found.length > 5000) return found
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, found, depth + 1)
    else found.push(full)
  }
  return found
}

// Si el nombre aparece en el árbol: como parte de una ruta de archivo o dentro del fuente de alguno.
// Se mira el contenido y no sólo los nombres porque lo que un rastro nombra suele ser la prueba
// —`TestAddSuma`— y no el archivo que la contiene.
function findsArtifact(roots, artifact) {
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      if (file.replace(/\\/g, '/').includes(artifact)) return true
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      if (text.includes(artifact)) return true
    }
  }
  return false
}

// El veredicto por rastro: `encontrado`, `ausente` o `inbuscable`. Sin raíces declaradas no se afirma
// nada — no hay dónde mirar, y decir «ausente» ahí sería inventar el hallazgo.
function contrast(tests, roots) {
  return traces(tests).map((trace) => {
    if (!searchable(trace.artifact)) return { ...trace, verdict: 'inbuscable' }
    if (!roots.length) return { ...trace, verdict: 'inbuscable' }
    return { ...trace, verdict: findsArtifact(roots, trace.artifact) ? 'encontrado' : 'ausente' }
  })
}

module.exports = { MAX_RUNS, record, runs, traces, contrast }
