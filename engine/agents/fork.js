'use strict'

// Llevarse un cargo del catálogo a la carpeta de la empresa para mantenerlo desde ahí.
//
// Existe porque copiar a mano sale mal de una forma que no se nota: quien copia agarra el `SKILL.md`
// —que es lo que se ve— y deja atrás los casos adversariales, las fuentes de aprendizaje y el modelo
// operativo. Queda un cargo que responde igual y ya no se puede evaluar, sin ningún aviso.
//
// Se hereda el contrato entero y todo lo que lo hace verificable —casos, conductas esperadas,
// fuentes, referencias—, así la empresa recibe un cargo evaluable desde el primer minuto. Qué queda
// afuera y por qué, en `inherited()`.

const fs = require('node:fs')
const path = require('node:path')

const catalog = require('./catalog')
const manifest = require('../core/manifest')
const ownership = require('../core/ownership')
const { atomicWrite } = require('../core/files')

// Informes, propuestas y veredictos no viajan: son lo que produjo nuestra versión del contrato, y el
// fork nace para dejar de ser ese contrato. Heredar un veredicto le daría a la copia una garantía que
// no rindió; heredar una propuesta pendiente la haría firmar una decisión que era nuestra.
function inherited(relative) {
  if (/^learning\/(reports|proposals)\//.test(relative)) return false
  if (relative.startsWith('evaluations/results/')) return false
  return true
}

const TEXT = /\.(md|ya?ml|json|txt)$/i

// El mismo recorrido que usa `upgrade`: un cargo es un árbol de archivos como cualquier otro.
const tree = ownership.treeFiles

// La misma resolución que usa todo lo demás —paquete primero, toolkit después— en vez de deducirla
// del directorio del motor: la versión que interesa es la del catálogo del que sale la copia.
function packageVersion(root) {
  const file = ownership.packagePath(root, 'package.json')
  if (!file) return ''
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).version || '' } catch { return '' }
}

// La fila deja el límite por escrito: arriba, cómo llegó el contrato a ser lo que es —decisiones que
// tomamos nosotros—; abajo, lo que decida la empresa. Sin ese renglón, la primera fila propia parece
// continuación de una conversación ajena.
function markHistory(target, slug, version, date) {
  const file = path.join(target, 'learning', 'HISTORY.md')
  if (!fs.existsSync(file)) return
  const provenance = version ? `del catálogo de Cauce ${version}` : 'del catálogo de Cauce'
  const row = `| ${date} | — | Copiado ${provenance} | — | ${slug} pasa a mantenerlo esta empresa |\n`
  const content = fs.readFileSync(file, 'utf8')
  atomicWrite(file, content.endsWith('\n') ? content + row : `${content}\n${row}`)
}

// `date` entra por parámetro en vez de leerse acá: la salida tiene que ser reproducible en una prueba.
function fork(root, slug, date) {
  // En el toolkit no hay a quién copiarle: el catálogo se mantiene acá, directo. Dejarlo pasar creaba
  // un duplicado en `agents/roles/` que tapaba al original, y el trabajo siguiente se hacía sobre la
  // copia mientras la versión que se publica quedaba quieta.
  if (ownership.mode(root) === 'toolkit') {
    throw new Error(`${slug} vive acá: en el toolkit se edita el catálogo, no se lo copia`)
  }

  const found = catalog.find(root, slug)
  if (!found.system) {
    throw new Error(`${slug} ya lo mantiene esta empresa: ${path.relative(root, found.dir)}`)
  }
  const type = path.basename(path.dirname(path.dirname(found.dir)))
  const target = path.join(root, 'agents', type, slug)
  if (fs.existsSync(target)) throw new Error(`${path.relative(root, target)} ya existe`)

  const all = tree(found.dir)
  const files = all.filter(inherited)
  if (!files.includes('SKILL.md')) throw new Error(`${slug} no tiene SKILL.md: no hay contrato que copiar`)

  // El digest sale del origen, no de la copia: es contra lo que el catálogo tenía al forkear que
  // después se responde «esto mejoró río arriba». Medirlo sobre la copia lo ataría a nuestras propias
  // ediciones, la reescritura de rutas incluida — y esa reescritura no es cosmética: sin ella el
  // aprendizaje del fork apuntaría al paquete, que el guard bloquea y npm borra en el próximo install.
  const fromPath = `agents/${type}/system/${slug}`
  const toPath = `agents/${type}/${slug}`
  const digests = {}
  for (const relative of files) {
    const from = path.join(found.dir, relative)
    const to = path.join(target, relative)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    if (TEXT.test(relative)) fs.writeFileSync(to, fs.readFileSync(from, 'utf8').split(fromPath).join(toPath))
    else fs.copyFileSync(from, to)
    digests[relative] = manifest.digest(from)
  }

  const version = packageVersion(root)
  markHistory(target, slug, version, date)

  const forks = { ...manifest.readForks(root) }
  forks[slug] = { type, version, files: digests }
  manifest.write(root, null, null, forks)

  return { slug, type, dir: target, files, version, skipped: all.filter((one) => !inherited(one)) }
}

// Qué cambió en el catálogo desde que la empresa se llevó su copia.
//
// El fork es legítimo, pero deja de recibir las mejoras del toolkit y eso no puede pasar en silencio:
// la empresa decidió mantener un cargo, no quedarse sin enterarse de que el original mejoró.
//
// Se compara contra los digests guardados al forkear, nunca contra la copia: la copia está editada a
// propósito, así que medir contra ella devolvería «todo cambió» desde el primer ajuste. El aviso no
// dice qué hacer —integrar o no es decisión de la empresa—, sólo que hay algo que mirar.
function drift(root) {
  const forks = manifest.readForks(root)
  const catalogDir = ownership.packageDir(root, 'agents')
  const found = []
  for (const [slug, record] of Object.entries(forks)) {
    if (!record || !record.files) continue
    // Sin copia no hay deriva. Devolver a un cargo al catálogo es tan legítimo como adoptarlo, y el
    // registro sobrevive a esa vuelta: sin este corte, `check` avisaba «tu copia no recibe mejoras»
    // sobre una copia que ya no existe, y mandaba a mirar un directorio borrado.
    if (!fs.existsSync(path.join(root, 'agents', record.type || 'roles', slug))) continue
    const source = catalogDir ? path.join(catalogDir, record.type || 'roles', 'system', slug) : ''
    if (!source || !fs.existsSync(source)) continue
    const current = tree(source).filter(inherited)
    const changed = []
    const removed = []
    for (const [relative, recorded] of Object.entries(record.files)) {
      if (!current.includes(relative)) { removed.push(relative); continue }
      if (manifest.digest(path.join(source, relative)) !== recorded) changed.push(relative)
    }
    const added = current.filter((relative) => !(relative in record.files))
    if (changed.length || added.length || removed.length) {
      found.push({ slug, version: record.version || '', changed, added, removed })
    }
  }
  return found.sort((left, right) => left.slug.localeCompare(right.slug))
}

// Una línea por fork, para que `check` y `upgrade` digan lo mismo con las mismas palabras.
function driftLine(entry) {
  const parts = []
  if (entry.changed.length) parts.push(`${entry.changed.length} archivo(s) cambiaron`)
  if (entry.added.length) parts.push(`${entry.added.length} nuevo(s)`)
  if (entry.removed.length) parts.push(`${entry.removed.length} retirado(s)`)
  const since = entry.version ? ` desde ${entry.version}` : ''
  return `${entry.slug}: tu copia no recibe mejoras del catálogo y ahí${since} ${parts.join(', ')}`
}

module.exports = { drift, driftLine, fork, inherited }
