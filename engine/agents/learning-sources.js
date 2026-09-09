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
  return [...sourcesBody(text).matchAll(/tier:\s*([A-Za-z-]+)/g)].map((hit) => hit[1])
}

// El cuerpo de `sources:` termina donde empieza `pending:`. Sin este corte, una pendiente entraba como
// fuente declarada y el chequeo semanal la reportaba rota todas las semanas — que es exactamente el
// aviso permanente que la lista existe para no producir.
function sourcesBody(text) {
  if (!text.includes('sources:')) return ''
  const body = text.slice(text.indexOf('sources:'))
  const corte = body.search(/^pending:/m)
  return corte === -1 ? body : body.slice(0, corte)
}

// Una entrada escrita en una sola línea: seis cargos del catálogo la escriben así y cuarenta y siete la
// reparten en varias. Leyendo sólo la segunda forma, esos seis no tenían el chequeo de URL duplicada que
// hay más abajo, y nada lo decía porque no encontrar duplicados y no mirar se ven igual.
const FLOW_ENTRY = /^\s*-\s*\{[^}]*\bname:\s*([^,}]+?)\s*,[^}]*\burl:\s*"?([^",}\s]+)/
const quitar = (value) => value.replace(/^['"]|['"]$/g, '')

// Las fuentes de un cargo, por su URL. La misma URL con dos nombres es una sola fuente contada dos
// veces: el catálogo llegó a tener la especificación OpenAPI bajo tres —`OpenAPI Specification`,
// `...latest published` y `...3.2.0`— así que arreglarle el `tier` a un cargo no se lo arreglaba a los
// otros, y quien leyera el informe vería la misma página citada como si fueran tres.
function sourceUrls(text) {
  const body = sourcesBody(text)
  const out = []
  let name = ''
  for (const line of body.split('\n')) {
    const flow = line.match(FLOW_ENTRY)
    if (flow) { out.push({ name: quitar(flow[1]), url: flow[2].replace(/\/+$/, '') }); continue }
    const declared = line.match(/^\s*-\s*name:\s*(.+?)\s*$/)
    if (declared) { name = quitar(declared[1]); continue }
    const url = line.match(/^\s*url:\s*(\S+)/)
    if (url && name) out.push({ name, url: url[1].replace(/\/+$/, '') })
  }
  return out
}

// Todo lo que un cargo cita y alguien va a abrir. `sources.yaml` es lo que investiga; `references/` y
// `SKILL.md` son el método que sigue, y hasta 0.71.0 nadie las miraba: 29 de las 207 URLs de esos
// documentos no servían, entre ellas dos 404 de páginas que se habían movido.
//
// `evaluations/` queda afuera y no por costo: los casos adversariales **inventan** dominios a propósito
// —veintiuna URLs bajo `.example` y marcas que no existen— y comprobarlas reportaría rotas las que están
// bien escritas. `learning/reports` y `learning/proposals` también, por lo contrario: son evidencia
// fechada de que algo dio 403 el día que se consultó, y eso no se arregla.
const DOC_URL = /https?:\/\/[^\s)>"`\]]+/g
function documentUrls(dir) {
  const out = []
  const seen = new Set()
  const add = (raw, origin) => {
    const url = raw.replace(/[.,;:]+$/, '')
    if (seen.has(url)) return
    seen.add(url)
    out.push({ url, origin })
  }
  const below = (base, relative) => {
    let entries = []
    try { entries = fs.readdirSync(path.join(base, relative), { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const next = `${relative}/${entry.name}`
      if (entry.isDirectory()) { below(base, next); continue }
      if (!entry.name.endsWith('.md')) continue
      for (const hit of fs.readFileSync(path.join(base, next), 'utf8').match(DOC_URL) || []) add(hit, next)
    }
  }
  below(dir, 'references')
  const skill = path.join(dir, 'SKILL.md')
  if (fs.existsSync(skill)) {
    for (const hit of fs.readFileSync(skill, 'utf8').match(DOC_URL) || []) add(hit, 'SKILL.md')
  }
  return out
}

// Lo que el cargo probó, no pudo abrir y va a volver a necesitar. Cinco cargos lo escribían ya como
// comentario en su propio archivo —el steward hasta puso «Registrar cuando exista una ficha legible»,
// que es un recordatorio que nadie iba a revisar—, así que la forma existía y lo que faltaba era que
// alguien la mirara.
//
// `url` es opcional a propósito: la mitad de esas entradas están pendientes **porque no hay ninguna URL
// que responda** —ISO/IEC/IEEE 24765, la ley federal mexicana—, y exigirla habría dejado fuera
// justamente las que más cuesta resolver. Lo que no es opcional es `why`: sin la razón, la lista es un
// cementerio de enlaces que nadie sabe por qué están.
//
// La continuación de línea se une en vez de prohibirse: `why` es una frase y una frase se envuelve. La
// primera versión la cortaba en el primer salto y **no avisaba** —cuatro razones quedaron a media
// oración sin que nada fallara—, y prohibir la forma no evita que la próxima persona la escriba.
const PENDING_FIELD = /^\s{4}(name|url|why|since):\s*(.+?)\s*$/
function pendingSources(text) {
  const corte = text.search(/^pending:/m)
  if (corte === -1) return []
  const out = []
  let one = null
  let last = ''
  for (const line of text.slice(corte).split('\n').slice(1)) {
    if (/^\S/.test(line)) break
    if (/^\s{2}-\s/.test(line)) {
      if (one) out.push(one)
      one = {}
      last = ''
      const primero = line.match(/^\s{2}-\s*(name|url|why|since):\s*(.+?)\s*$/)
      if (primero) { one[primero[1]] = quitar(primero[2]); last = primero[1] }
      continue
    }
    const campo = line.match(PENDING_FIELD)
    if (campo && one) { one[campo[1]] = quitar(campo[2]); last = campo[1]; continue }
    const sigue = line.match(/^\s{6,}(\S.*?)\s*$/)
    if (sigue && one && last) one[last] += ` ${sigue[1]}`
  }
  if (one) out.push(one)
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
    // Una pendiente sin razón es un enlace muerto con fecha, y sin fecha no se puede ver que lleva
    // meses ahí. Los dos campos son la mitad del valor de la lista: lo que la vuelve revisable.
    for (const one of pendingSources(fs.readFileSync(sourcesFile, 'utf8'))) {
      const falta = ['name', 'why', 'since'].filter((campo) => !one[campo])
      if (falta.length) {
        errors.push(`sources.yaml: una pendiente no declara ${falta.join(' ni ')}`
          + `${one.name ? ` (${one.name})` : ''}`)
      }
      // Declarada y pendiente a la vez es una contradicción que el chequeo semanal no puede resolver:
      // la reportaría rota como fuente y recuperada como pendiente en la misma corrida.
      if (one.url && byUrl.has(one.url)) {
        errors.push(`sources.yaml: ${one.url} está declarada como fuente y también como pendiente`)
      }
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

module.exports = {
  SOURCE_TIERS, cadence, documentUrls, evaluate, evaluateTeam, pendingSources, sourceUrls,
}
