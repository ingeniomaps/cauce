'use strict'

// Qué entregó Cauce y con qué contenido. Sin este registro no se puede distinguir un archivo que
// la empresa editó de uno que cambió río arriba: los dos se ven igual comparando la instancia
// contra el paquete, y `upgrade` terminaría negándose ante cualquier mejora del toolkit.
//
// Se guarda junto a la configuración porque es estado de la instalación, no del producto, y se
// commitea: todo el equipo tiene que ver lo mismo.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const FILE = path.join('.cauce', 'manifest.json')

function digest(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
  } catch { return '' }
}

function read(root) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8'))
    return data && typeof data.files === 'object' ? data.files : {}
  } catch { return {} }
}

function write(root, files) {
  const target = path.join(root, FILE)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const ordered = Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))
  fs.writeFileSync(target, `${JSON.stringify({ version: 1, files: ordered }, null, 2)}\n`)
}

// Registra lo entregado en una ruta, relativo a la raíz de la instancia.
function record(root, relative, files) {
  const current = read(root)
  for (const file of files) current[`${relative}/${file}`] = digest(path.join(root, relative, file))
  return current
}

// Archivos que la empresa modificó después de recibirlos. Un archivo sin registro previo no
// cuenta: llegó con una versión anterior a este mecanismo, o lo agregó el proyecto.
function edited(root, relative, files) {
  const recorded = read(root)
  return files.filter((file) => {
    const key = `${relative}/${file}`
    if (!recorded[key]) return false
    return recorded[key] !== digest(path.join(root, relative, file))
  })
}

module.exports = { FILE, digest, edited, read, record, write }
