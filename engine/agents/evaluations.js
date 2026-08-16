'use strict'

// Los casos adversariales de un cargo, ejecutables.
//
// Cada caso es una tentación escrita: un pedido razonable en la superficie que cruza una línea del
// contrato, más los comportamientos que el cargo debería exhibir. Hasta acá existían y nadie los
// corría —`evaluate` los contaba—, que es como tener una suite que sólo comprueba que los archivos
// `.test.js` existan.
//
// Ejecutarlos exige un modelo, y eso no puede vivir dentro de un CLI determinista que corre en CI sin
// red ni credenciales. Así que el reparto es el mismo que en el ciclo de aprendizaje: el CLI expone
// los casos y valida el resultado; quien los ejecuta es un agente, y el veredicto queda escrito.
//
// El cargo que responde nunca ve los comportamientos esperados: si los viera, el caso mediría su
// capacidad de repetirlos y no su criterio.

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')

const RESULTS = ['evaluations', 'results']

function caseFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  } catch { return [] }
}

// Un caso, partido en lo que ve quien responde y lo que ve quien juzga.
function parseCase(text) {
  const request = (text.match(/#\s*Solicitud\s*\n([\s\S]*?)(?=\n#\s|$)/) || [])[1] || ''
  const block = (text.match(/#\s*Comportamientos esperados\s*\n([\s\S]*?)(?=\n#\s|$)/) || [])[1] || ''
  // Una viñeta puede ocupar varias líneas. Contar líneas en vez de viñetas hacía que un caso con
  // cuatro comportamientos declarara siete, y ese número es el denominador de toda la evaluación.
  // No se veía en el catálogo del sistema porque ahí las viñetas entran en una línea.
  const expected = []
  for (const line of block.split('\n')) {
    const bullet = line.match(/^\s*-\s+(.*)$/)
    if (bullet) expected.push(bullet[1].trim())
    else if (expected.length && line.trim()) {
      expected[expected.length - 1] = `${expected[expected.length - 1]} ${line.trim()}`
    }
  }
  return { request: request.trim(), expected }
}

function list(root, agent) {
  const dir = path.join(catalog.resolve(root, agent), 'evaluations', 'cases')
  return caseFiles(dir).map((name) => ({
    id: name.replace(/\.md$/, ''),
    ...parseCase(fs.readFileSync(path.join(dir, name), 'utf8')),
  }))
}

function resultsDir(root, agent) {
  return path.join(catalog.resolve(root, agent), ...RESULTS)
}

// El último resultado registrado, para que `evaluate` pueda decir si el cargo se corrió alguna vez y
// cómo le fue. No es un error no tenerlo: correrlo cuesta, y exigirlo en CI sería exigir red.
function latest(root, agent) {
  const dir = resultsDir(root, agent)
  const names = caseFiles(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort()
  if (!names.length) return null
  const file = path.join(dir, names[names.length - 1])
  const text = fs.readFileSync(file, 'utf8')
  const verdicts = [...text.matchAll(/^-\s*Veredicto:\s*(pasa|no pasa)\s*$/gim)].map((hit) => hit[1].toLowerCase())
  return {
    file,
    date: names[names.length - 1].replace(/\.md$/, ''),
    total: verdicts.length,
    passed: verdicts.filter((verdict) => verdict === 'pasa').length,
  }
}

// Coherencia entre lo que hay y lo que se corrió. Todo sale como advertencia y ninguno afecta el
// código de salida, y no es blandura: correr los casos exige un modelo, y CI no lo tiene. Un `evaluate`
// que fallara por un resultado viejo obligaría a pagar una corrida para poder integrar, y volvería a
// fallar cada vez que el contrato cambie. Quien falla fuerte es el recorrido que sí los ejecuta.
function validate(root, agent) {
  const warnings = []
  const total = list(root, agent).length
  const last = latest(root, agent)
  if (!last) {
    warnings.push(`sin resultados de casos: corré el recorrido de evaluación para los ${total} casos`)
    return { warnings, cases: total, last: null }
  }
  if (last.total !== total) {
    warnings.push(`${path.basename(last.file)} cubre ${last.total} de ${total} caso(s): el resultado no vale`)
  }
  if (last.passed < last.total) {
    warnings.push(`${last.total - last.passed} caso(s) no pasaron en ${last.date}: volvé a correrlos`)
  }
  return { warnings, cases: total, last }
}

module.exports = { list, latest, parseCase, validate, resultsDir }
