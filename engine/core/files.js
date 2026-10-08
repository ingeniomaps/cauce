'use strict'

const fs = require('node:fs')
const path = require('node:path')

function isWithin(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target))
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

function assertWithin(base, target, label = 'ruta') {
  if (!isWithin(base, target)) throw new Error(`${label} fuera de la raíz permitida: ${target}`)
  return path.resolve(target)
}

function assertNoSymlinkPath(base, target) {
  const resolvedBase = path.resolve(base)
  const resolvedTarget = assertWithin(resolvedBase, target)
  const relative = path.relative(resolvedBase, resolvedTarget)
  let current = resolvedBase
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`La ruta destino contiene un symlink: ${current}`)
    }
  }
}

// Dónde cae de verdad una escritura hecha a `raw` desde `base`: la ruta con cada enlace simbólico resuelto.
// Comparar la ruta como está escrita dejaba cruzar un límite por un enlace que vive adentro (caso 317).
//
// Se camina tramo por tramo sobre lo ya resuelto, porque el disco no lee una ruta como la junta
// `path.resolve`: un `..` detrás de un enlace sube desde donde el enlace lleva, no desde donde está escrito, y
// un enlace relativo se resuelve contra la carpeta real que lo contiene. Lo que todavía no existe se agrega
// tal cual —también detrás de un enlace colgado, que es justo donde escribir lo crea afuera—. Un ciclo se
// corta en el tope de saltos y deja el enlace sin seguir.
function landing(base, raw, budget = { hops: 40 }) {
  // Pegadas y no juntadas con `path.join`, que resolvería los `..` antes de mirar el disco.
  const target = path.isAbsolute(raw) ? raw : `${path.resolve(base)}${path.sep}${raw}`
  let at = path.parse(target).root
  for (const segment of target.split(path.sep)) {
    if (!segment || segment === '.') continue
    if (segment === '..') { at = path.dirname(at); continue }
    const next = path.join(at, segment)
    let link = false
    try { link = fs.lstatSync(next).isSymbolicLink() } catch { /* no existe: se agrega como está */ }
    if (link && budget.hops > 0) {
      budget.hops -= 1
      at = landing(at, fs.readlinkSync(next), budget)
    } else {
      at = next
    }
  }
  return at
}

function atomicWrite(file, content) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const temporary = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  )
  try {
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, file)
  } finally {
    try { fs.unlinkSync(temporary) } catch { /* renamed or never created */ }
  }
}

function atomicWriteJson(file, value) {
  atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`)
}

// Borra el archivo y, de paso, los directorios que quedaron vacíos por haberlo sacado. Nunca sube más
// allá del límite: `.claude/` puede tener cosas del usuario aunque `.claude/workflows/` quede vacío.
function removeFile(file, boundary) {
  fs.rmSync(file, { force: true })
  let dir = path.dirname(file)
  while (dir.startsWith(boundary) && dir !== boundary) {
    try { if (fs.readdirSync(dir).length) return } catch { return }
    fs.rmdirSync(dir)
    dir = path.dirname(dir)
  }
}

module.exports = {
  removeFile,
  assertNoSymlinkPath,
  assertWithin,
  atomicWrite,
  atomicWriteJson,
  landing,
}
