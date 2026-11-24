'use strict'

// El registro de un archivo del sistema que lleva el bloque de un runner —hoy `AGENTS.md`—. `install` y `uninstall`
// escriben el bloque y vuelven a anotar el archivo, para que el `upgrade` siguiente no le eche a la empresa la edición
// que hizo el comando. Pero sólo si la empresa no lo había editado: anotar uno editado blanqueaba su edición, y el
// `upgrade` lo reemplazaba entero (caso 546). Editado se mide sin los bloques de los runners, así que un archivo que la
// empresa devolvió al molde, con un bloque adentro, vuelve a ser del molde.

const fs = require('node:fs')
const path = require('node:path')
const M = require('../core/manifest')
const { SYSTEM_FILES } = require('../core/ownership')
const { withoutBlock } = require('./config')
const { RUNNER_NAMES } = require('./runners')

// Un archivo sin anotar da editado: ninguna de las dos cuentas coincide con un digest que no existe.
function editedByCompany(root, own) {
  const recorded = M.read(root)[own]
  const body = fs.readFileSync(path.join(root, own), 'utf8')
  if (M.digestText(body) === recorded) return false
  const bare = RUNNER_NAMES.reduce((text, name) => withoutBlock(text, name), body)
  return M.digestText(`${bare.trimEnd()}\n`) !== recorded
}

// Corre la escritura del bloque y, si el archivo es del sistema y no estaba editado, lo vuelve a anotar.
function writeShared(root, file, write) {
  const own = path.relative(root, file).split(path.sep).join('/')
  const tracked = SYSTEM_FILES.includes(own) && fs.existsSync(file)
  const edited = tracked && editedByCompany(root, own)
  write()
  if (tracked && !edited) M.write(root, M.recordPaths(root, [own], M.read(root)))
}

module.exports = { writeShared }
