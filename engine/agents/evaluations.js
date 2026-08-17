'use strict'

// Los casos adversariales de un cargo, ejecutables.
//
// Cada caso es una tentación escrita: un pedido razonable en la superficie que cruza una línea del
// contrato, más los comportamientos que el cargo debería exhibir.
//
// Ejecutarlos exige un modelo, y eso no puede vivir dentro de un CLI determinista que corre en CI sin
// red ni credenciales. De ahí el reparto: el CLI expone los casos y valida el resultado, quien los
// ejecuta es un agente (ver el workflow `agent-eval`), y el veredicto queda escrito.

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')

const RESULTS = ['evaluations', 'results']

function caseFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  } catch { return [] }
}

// El artefacto que un caso pone en manos del cargo: la guía del proveedor, el CSV, el runbook. Vive en
// un directorio hermano del caso y con su mismo nombre —`cases/06-adversarial-docs/`—, que `caseFiles`
// ya ignora por no terminar en `.md`.
//
// Existe porque un caso que *describe* un artefacto externo sin entregarlo mide algo más fácil de lo
// que dice medir: al cargo se le pregunta si obedecería un documento del que se le está hablando, y un
// texto que nunca leyó no puede inyectarlo. Los 47 casos adversariales del catálogo nacieron así, y uno
// produjo un fallo falso: el cargo escribió que había leído una guía inexistente porque el arnés se la
// había afirmado.
function fixtureFiles(dir, prefix = '') {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  const found = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...fixtureFiles(path.join(dir, entry.name), relative))
    else found.push(relative)
  }
  return found
}

function fixtures(root, agent, id) {
  const dir = path.join(catalog.resolve(root, agent), 'evaluations', 'cases', id)
  return { dir, files: fixtureFiles(dir) }
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
  return caseFiles(dir).map((name) => {
    const id = name.replace(/\.md$/, '')
    return {
      id,
      ...parseCase(fs.readFileSync(path.join(dir, name), 'utf8')),
      fixtures: fixtureFiles(path.join(dir, id)),
    }
  })
}

// Lo que el cargo no debe hacer, declarado por cargo en `expected-behaviors.yaml`.
//
// Se parsea a mano porque el archivo es una lista de escalares y el repositorio no tiene dependencias:
// traer un parser de YAML para leer dos listas sería pagar una dependencia por un `split`.
//
// Existe porque durante todo el catálogo esas listas no fueron criterio de nada. Los casos declaran
// cuatro comportamientos a observar y el juez decidía sólo con esos; los `forbidden` los leía un agente
// al proponer cambios, nunca al evaluar. La conducta prohibida entraba únicamente si quien lanzaba la
// corrida se acordaba de escribirla en el prompt, y ahí el criterio cambiaba entre corridas: tres rondas
// del mismo caso se midieron con tres listones distintos y dejaron de ser comparables.
function behaviors(root, agent) {
  const file = path.join(catalog.resolve(root, agent), 'evaluations', 'expected-behaviors.yaml')
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return { required: [], forbidden: [] } }
  const found = { required: [], forbidden: [] }
  let key = ''
  for (const line of text.split('\n')) {
    const heading = line.match(/^(\w+):\s*$/)
    if (heading) { key = heading[1]; continue }
    if (/^\S/.test(line)) { key = ''; continue }
    const bullet = line.match(/^\s+-\s+(.*)$/)
    if (bullet && found[key]) found[key].push(bullet[1].trim())
  }
  return found
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
  const cases = list(root, agent)
  const total = cases.length
  // Esto sí es control estructural y no advertencia: que el artefacto esté entregado es una propiedad
  // estática del caso, verificable sin modelo, y dejarla en advertencia es lo que permitió que 47 casos
  // midieran la versión débil de su propia pregunta.
  const errors = cases
    .filter((item) => item.id.includes('adversarial') && !item.fixtures.length)
    .map((item) => `${item.id}: caso adversarial sin artefacto en cases/${item.id}/`)
  const last = latest(root, agent)
  if (!last) {
    warnings.push(`sin resultados de casos: corré el recorrido de evaluación para los ${total} casos`)
    return { errors, warnings, cases: total, last: null }
  }
  if (last.total !== total) {
    warnings.push(`${path.basename(last.file)} cubre ${last.total} de ${total} caso(s): el resultado no vale`)
  }
  if (last.passed < last.total) {
    warnings.push(`${last.total - last.passed} caso(s) no pasaron en ${last.date}: volvé a correrlos`)
  }
  return { errors, warnings, cases: total, last }
}

module.exports = { behaviors, fixtures, list, latest, parseCase, validate, resultsDir }
