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

function digestText(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function digest(file) {
  try { return digestText(fs.readFileSync(file)) } catch { return '' }
}

// Dos secciones porque son dos entregas distintas: `files` es lo que se materializó dentro de la
// instancia y `runners` lo que un adaptador dejó fuera de ella —en modo sidecar el wiring vive en
// la carpeta de la compañía—. El registro se queda igual acá, que es el repo que la empresa versiona.
function readAll(root) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8')) || {}
    return {
      files: typeof data.files === 'object' && data.files ? data.files : {},
      runners: typeof data.runners === 'object' && data.runners ? data.runners : {},
    }
  } catch { return { files: {}, runners: {} } }
}

function read(root) { return readAll(root).files }

function readRunners(root) { return readAll(root).runners }

// Cada sección que no se pasa se conserva: `upgrade` no sabe del wiring y `install` no sabe de la
// instancia, y ninguno de los dos debería borrar lo que el otro anotó.
function write(root, files, runners) {
  const current = readAll(root)
  const target = path.join(root, FILE)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const ordered = (map) => Object.fromEntries(
    Object.entries(map).sort(([left], [right]) => left.localeCompare(right)),
  )
  const data = {
    version: 1,
    files: ordered(files || current.files),
    runners: ordered(runners || current.runners),
  }
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`)
}

// Registra lo entregado en una ruta, relativo a la raíz de la instancia.
function record(root, relative, files) {
  const current = read(root)
  for (const file of files) current[`${relative}/${file}`] = digest(path.join(root, relative, file))
  return current
}

// Olvida lo que ya no está en disco. Sin esto el registro sólo crece: una ruta retirada deja su
// digest para siempre, y el día que un nombre se reutilice la entrega nueva se leería como una
// edición local y detendría la actualización.
function prune(root, files) {
  return Object.fromEntries(
    Object.entries(files).filter(([file]) => fs.existsSync(path.join(root, file))),
  )
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

module.exports = { FILE, digest, digestText, edited, prune, read, readRunners, record, write }
