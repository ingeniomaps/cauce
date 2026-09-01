'use strict'

// El contrato de fuentes de un cargo y la validación que lo mide: qué tipos hay, cada cuánto le toca
// investigar a quien las declara, y qué está mal escrito. Su reloj es el del contrato —un tipo nuevo,
// otra cadencia—, no el del ciclo que produce informes y propuestas.

const fs = require('node:fs')
const path = require('node:path')
const catalog = require('./catalog')
const evaluations = require('./evaluations')
const {
  REQUIRED_SECTIONS, SUMMARY_MAX, frontmatterState, proposalFiles, proposalState, reportFiles,
} = require('./learning-files')

// Una propuesta firmada y sin aplicar no espera lo mismo que una sin firmar: en la primera la decisión
// ya se tomó y el trabajo quedó detenido; la segunda está bien quieta hasta que alguien la lea.
// `proposalState` no las distingue —mira el frontmatter, y la firma la escribe `sign-proposal.yml` en
// el cuerpo—, así que las dos caían en el mismo `pending` y la que ya tenía autoridad para avanzar se
// veía igual que la que no. Sin este aviso hay que acordarse, y dos propuestas firmadas el 2026-09-01
// se habrían quedado ahí sin que nada lo dijera.
const SIGNED = /^-[ \t]*Estado:[ \t]*aprobada[ \t]*$/mi
// Los dos destinos que cierran una propuesta. `archived` es «se miró y no cambia nada»: no espera
// trabajo, así que contarla como pendiente deja al cargo reportando deuda que nadie va a pagar — el
// mismo defecto que el comentario de abajo describe para una aplicada.
const CLOSED = new Set(['applied', 'archived'])

// No es un error: firmar y aplicar son actos separados a propósito —OPS-004— y entre uno y otro puede
// pasar tiempo legítimamente. Lo que no puede es no verse.
function signedWarning(signed) {
  if (!signed.length) return []
  return [`${signed.length} propuesta(s) firmada(s) sin aplicar (${signed.join(', ')}): `
    + 'la autorización ya está, falta `agent-promote`']
}

function evaluateTeam(root, slug) {
  const dir = path.dirname(require('../flows/registry').read(root, slug).file)
  const errors = []
  const warnings = []
  if (!fs.existsSync(path.join(dir, 'learning', 'HISTORY.md'))) {
    warnings.push('sin learning/HISTORY.md: lo que se le cambie al recorrido no queda registrado')
  }
  const proposals = proposalFiles(path.join(dir, 'learning', 'proposals'))
  let pending = 0
  const signed = []
  for (const name of proposals) {
    const text = fs.readFileSync(path.join(dir, 'learning', 'proposals', name), 'utf8')
    if (!/^automatic_apply:\s*false$/m.test(text)) errors.push(`${name}: automatic_apply debe ser false`)
    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(`## ${section}`)) errors.push(`${name}: falta sección ${section}`)
    }
    if (!CLOSED.has(proposalState(text))) {
      pending += 1
      if (SIGNED.test(text)) signed.push(name)
    }
  }
  warnings.push(...signedWarning(signed))
  return { errors, warnings, proposals: proposals.length, pending, cases: 0 }
}

// Qué publica una fuente, que es lo único que decide cada cuánto vale la pena volver a mirarla. No
// dice si es primaria —eso lo exige `rules.require_primary_source`— ni si sigue vigente: lo que se
// aparta del default lo declara la fuente con `authority:` o `status:`, y por eso son dos campos y no
// un nombre compuesto. Cuando eran uno solo el catálogo llegó a 51 etiquetas para estas seis.
const SOURCE_TIERS = ['advisory', 'platform', 'project', 'regulation', 'standard', 'profession']

// Cada cuánto vale la pena volver a mirar cada tipo. Un aviso publica todos los días y llegar un mes
// tarde es llegar tarde; una norma se revisa por edición y mirarla cada lunes devuelve el mismo texto.
// La cadencia de un cargo la fija su fuente más rápida: basta una que corra para que la semana traiga
// algo, y ninguna otra pierde nada por mirarse antes.
const TIER_CADENCE = {
  advisory: 'semanal', platform: 'semanal', project: 'semanal',
  regulation: 'mensual', standard: 'mensual', profession: 'trimestral',
}
const CADENCES = ['semanal', 'mensual', 'trimestral']

// Sale del árbol y no de una lista escrita a mano, por la misma razón que la matriz del cron sale del
// árbol: una lista paralela se pudre el día que un cargo cambia sus fuentes y nadie la toca.
function cadence(root, agent) {
  const file = path.join(catalog.resolve(root, agent), 'learning', 'sources.yaml')
  if (!fs.existsSync(file)) return ''
  const tiers = sourceTiers(fs.readFileSync(file, 'utf8')).filter((one) => TIER_CADENCE[one])
  if (!tiers.length) return ''
  return CADENCES[Math.min(...tiers.map((one) => CADENCES.indexOf(TIER_CADENCE[one])))]
}

// Basta con las líneas `tier:`: el archivo es del catálogo, no de un tercero, y agregar un parser de
// YAML por un campo rompería la regla de cero dependencias.
function sourceTiers(text) {
  const body = text.includes('sources:') ? text.slice(text.indexOf('sources:')) : ''
  return [...body.matchAll(/tier:\s*([A-Za-z-]+)/g)].map((hit) => hit[1])
}

// Las fuentes de un cargo, por su URL. La misma URL con dos nombres es una sola fuente contada dos
// veces: el catálogo llegó a tener la especificación OpenAPI bajo tres —`OpenAPI Specification`,
// `...latest published` y `...3.2.0`— así que arreglarle el `tier` a un cargo no se lo arreglaba a los
// otros, y quien leyera el informe vería la misma página citada como si fueran tres.
function sourceUrls(text) {
  const body = text.includes('sources:') ? text.slice(text.indexOf('sources:')) : ''
  const out = []
  let name = ''
  for (const line of body.split('\n')) {
    const declared = line.match(/^\s*-\s*name:\s*(.+?)\s*$/)
    if (declared) { name = declared[1].replace(/^['"]|['"]$/g, ''); continue }
    const url = line.match(/^\s*url:\s*(\S+)/)
    if (url && name) out.push({ name, url: url[1].replace(/\/+$/, '') })
  }
  return out
}

function evaluate(root, agent) {
  const target = catalog.resolve(root, agent)
  const errors = []
  const warnings = []
  const requiredFiles = [
    'learning/sources.yaml',
    'learning/HISTORY.md',
    'evaluations/expected-behaviors.yaml',
  ]
  // `AUTOMATION.md` documenta cómo corre la automatización de aprendizaje del toolkit. Exigírselo
  // a una empresa que escribe un cargo propio era pedirle contabilidad interna nuestra: su cargo debe
  // tener contrato, fuentes e historia, no nuestro andamiaje.
  if (catalog.find(root, agent).system) requiredFiles.push('learning/AUTOMATION.md')
  for (const relative of requiredFiles) {
    if (!fs.existsSync(path.join(target, relative))) errors.push(`falta ${relative}`)
  }
  const sourcesFile = path.join(target, 'learning', 'sources.yaml')
  if (fs.existsSync(sourcesFile)) {
    const tiers = sourceTiers(fs.readFileSync(sourcesFile, 'utf8'))
    // Sin fuentes el ciclo semanal no tiene literatura que leer y devuelve un informe vacío cada
    // semana. Avisa y no bloquea: un cargo que se está escribiendo todavía no las tiene.
    if (!tiers.length) warnings.push('sources.yaml sin fuentes: la investigación no tiene qué leer')
    for (const tier of tiers) {
      if (!SOURCE_TIERS.includes(tier)) {
        errors.push(`sources.yaml: tier "${tier}" fuera de ${SOURCE_TIERS.join(' | ')}`)
      }
    }
    // Dos nombres para una URL. Es error y no aviso: la cadencia sale del `tier` de cada entrada, así
    // que dos copias de la misma fuente pueden decir cosas distintas sobre cada cuánto publica, y la
    // más rápida gana sin que nadie lo haya decidido.
    const byUrl = new Map()
    for (const one of sourceUrls(fs.readFileSync(sourcesFile, 'utf8'))) {
      const previous = byUrl.get(one.url)
      if (previous && previous !== one.name) {
        errors.push(`sources.yaml: ${one.url} está dos veces, como "${previous}" y como "${one.name}"`)
      }
      byUrl.set(one.url, one.name)
    }
  }
  const skill = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').toLowerCase()
  for (const phrase of ['no inventar', 'autorización', 'evidencia observable']) {
    if (!skill.includes(phrase)) errors.push(`SKILL.md no conserva el control: ${phrase}`)
  }
  // Sin su línea, el cargo existe pero no se encuentra: quien tiene una tarea tendría que abrir la
  // carpeta para saber si es éste. Se exige acá y no como advertencia porque es estático y de una línea.
  const summary = catalog.summary(target)
  if (!summary) errors.push('SKILL.md no declara summary: la línea con la que se elige este cargo')
  else if (summary.length > SUMMARY_MAX) {
    errors.push(`summary tiene ${summary.length} caracteres y el máximo es ${SUMMARY_MAX}: `
      + 'si no entra en una línea, no sirve para elegir de un vistazo')
  }
  const proposals = proposalFiles(path.join(target, 'learning', 'proposals'))
  let pending = 0
  const signed = []
  for (const name of proposals) {
    const text = fs.readFileSync(path.join(target, 'learning', 'proposals', name), 'utf8')
    if (!/^automatic_apply:\s*false$/m.test(text)) errors.push(`${name}: automatic_apply debe ser false`)
    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(`## ${section}`)) errors.push(`${name}: falta sección ${section}`)
    }
    // Contar sólo las que esperan algo. Una propuesta aplicada contada como propuesta deja al cargo
    // reportando trabajo pendiente para siempre, y es la misma confusión que permitía reaplicarla.
    if (!CLOSED.has(proposalState(text))) {
      pending += 1
      if (SIGNED.test(text)) signed.push(name)
    }
  }
  warnings.push(...signedWarning(signed))
  // Los hallazgos que todavía no llegaron al contrato. No es un error —la propuesta que los tome
  // puede no haberse abierto aún—, pero sin decirlo un informe escrito y olvidado se ve igual que uno
  // ya incorporado: los dos son un archivo en `reports/`.
  const reportDir = path.join(target, 'learning', 'reports')
  const unconsolidated = reportFiles(reportDir).filter((name) =>
    frontmatterState(fs.readFileSync(path.join(reportDir, name), 'utf8'), 'draft') !== 'consolidated')
  if (unconsolidated.length) {
    warnings.push(`${unconsolidated.length} informe(s) sin consolidar (${unconsolidated.join(', ')}): `
      + 'entran en la próxima propuesta')
  }
  let cases = 0
  try {
    cases = fs.readdirSync(path.join(target, 'evaluations', 'cases'))
      .filter((name) => name.endsWith('.md')).length
  } catch { /* vacío */ }
  return { errors, warnings, proposals: proposals.length, pending, cases }
}

module.exports = { SOURCE_TIERS, cadence, evaluate, evaluateTeam }
