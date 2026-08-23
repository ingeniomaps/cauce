'use strict'

// Imports que nadie usa, buscados sacándolos en vez de leyéndolos.
//
// Contar apariciones del identificador con una expresión regular no sirve, y no en teoría: en este
// mismo repositorio dio `run` por usado porque `--dry-run` aparecía dentro de un string, y dio
// `spawnSync` por muerto cuando se llamaba. Acá se saca el binding y se corre el archivo: si algo lo
// usaba, el módulo revienta con ReferenceError. Un texto dentro de un string no puede engañarlo.
//
// Cubre las suites, que es donde el chequeo es barato porque cada archivo se corre solo. Para un
// módulo del motor haría falta correr la suite entera por binding, y eso ya no es una herramienta que
// alguien vaya a usar.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const DIR = path.join(__dirname)
const IMPORT_DESTRUCTURE = /^const \{ ([^}]+) \} = (require\(.*\))$/
const IMPORT_SIMPLE = /^const (\w+) = require\(.*\)$/

// Cada variante deja el módulo cargado: `./environment` limpia variables de entorno al importarse, y
// borrar la línea entera cambiaría lo que la corrida mide en vez de medir si el binding se usa.
function sinBinding(linea, id) {
  const destructure = linea.match(IMPORT_DESTRUCTURE)
  if (destructure) {
    const resto = destructure[1].split(',').map((x) => x.trim()).filter((x) => x !== id)
    return resto.length ? `const { ${resto.join(', ')} } = ${destructure[2]}` : destructure[2]
  }
  return `// ${linea}`
}

function bindings(lineas) {
  const found = []
  lineas.forEach((linea, i) => {
    const destructure = linea.match(IMPORT_DESTRUCTURE)
    if (destructure) {
      destructure[1].split(',').map((x) => x.trim()).forEach((id) => found.push({ i, id }))
      return
    }
    const simple = linea.match(IMPORT_SIMPLE)
    if (simple) found.push({ i, id: simple[1] })
  })
  return found
}

const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.test.js')).sort()
const muertos = []
let probados = 0

for (const nombre of archivos) {
  const file = path.join(DIR, nombre)
  const original = fs.readFileSync(file, 'utf8')
  const lineas = original.split('\n')
  const delArchivo = bindings(lineas)
  // Una línea por suite y no un indicador con \r: la salida se lee igual en terminal que en un log.
  console.log(`  ${nombre.padEnd(22)} ${delArchivo.length} binding(s)`)
  for (const { i, id } of delArchivo) {
    const copia = [...lineas]
    copia[i] = sinBinding(copia[i], id)
    fs.writeFileSync(file, copia.join('\n'))
    const corrida = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8' })
    fs.writeFileSync(file, original)
    probados++
    if (corrida.status === 0) muertos.push(`${nombre}:${i + 1} ${id}`)
  }
}

console.log(`${probados} binding(s) probado(s) en ${archivos.length} suite(s).`)
if (!muertos.length) {
  console.log('✓ ningún import muerto')
  process.exit(0)
}
console.log(`✗ ${muertos.length} import(s) que nadie usa:`)
for (const m of muertos) console.log(`  ${m}`)
process.exit(1)
