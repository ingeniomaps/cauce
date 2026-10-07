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
}
