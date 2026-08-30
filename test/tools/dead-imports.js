'use strict'

// Imports que nadie usa, buscados sacándolos en vez de leyéndolos.
//
// Contar apariciones con una expresión regular no alcanza para decidir, y no en teoría: en este mismo
// repositorio dio `run` por usado porque `--dry-run` lleva la palabra adentro. Por eso acá el conteo no
// decide nada —propone candidatos— y quien confirma es siempre la corrida, que es lo único que un texto
// dentro de un string no puede engañar.
//
// Los dos modos existen porque confirmar cuesta distinto de cada lado.
//
// Una suite se corre sola, así que un binding cuesta una corrida chica: se saca uno, se corre ese
// archivo, se repite. Son 332 corridas hoy, varios minutos, y por eso este modo queda fuera de `ci`.
//
// Un módulo del motor no tiene suite propia —cualquier archivo de `test/` puede ejercerlo—, así que
// confirmar exige la suite entera: 21 s por binding y 192 bindings, más de una hora. De ahí el lote.
// Si sacar todos los candidatos juntos deja la suite verde, entonces cada uno por separado también,
// porque sacar menos es un subconjunto de sacar todos: una corrida en vez de doscientas.
//
// Y en el caso normal no hay ninguna. Sin candidatos no hay nada que confirmar, y el escaneo estático
// del motor termina en milisegundos. Ése es el caso que corre en cada `ci`, y el que hace que meterlo
// ahí no cueste nada.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..', '..')
const SUITES = 'test'
const SUITE_GLOB = 'test/**/*.test.js'
const ENGINE = ['engine', 'automatization']

const IMPORT_DESTRUCTURE = /^const \{ ([^}]+) \} = (require\(.*\))$/
const IMPORT_SIMPLE = /^const (\w+) = require\(.*\)$/

// Cada variante deja el módulo cargado: `./environment` limpia variables de entorno al importarse, y
// borrar la línea entera cambiaría lo que la corrida mide en vez de medir si el binding se usa.
//
// Comentarla tampoco sirve, y es lo que se hacía: además de descargar el módulo, deja un comentario a
// mitad de oración, que es justo lo que `repo.test.js` prohíbe. Con una suite sola de por medio no se
// notaba —esa prueba no corría—; con la suite entera daba por vivo todo `const X = require(...)`.
function withoutBinding(line, id) {
  const destructure = line.match(IMPORT_DESTRUCTURE)
  if (!destructure) return line.replace(/^const \w+ = /, '')
  const rest = destructure[1].split(',').map((x) => x.trim()).filter((x) => x !== id)
  return rest.length ? `const { ${rest.join(', ')} } = ${destructure[2]}` : destructure[2]
}

// `id` es lo que hay que sacar del destructure; `local` es el nombre que el archivo usa. Difieren sólo
// cuando el import renombra —`{ frontmatter: fields }`—, y confundirlos haría que el conteo buscara un
// nombre que no está escrito en ninguna parte y diera el binding por muerto siempre.
function bindings(lines) {
  const found = []
  lines.forEach((line, i) => {
    const destructure = line.match(IMPORT_DESTRUCTURE)
    if (destructure) {
      for (const id of destructure[1].split(',').map((x) => x.trim())) {
        found.push({ i, id, local: id.includes(':') ? id.split(':')[1].trim() : id })
      }
      return
    }
    const simple = line.match(IMPORT_SIMPLE)
    if (simple) found.push({ i, id: simple[1], local: simple[1] })
  })
  return found.filter((binding) => /^\w+$/.test(binding.local))
}

// Las suites cuelgan de una carpeta por frontera, así que se recorre en vez de listar.
function walk(dir, keep) {
  const found = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(relative, keep))
    else if (keep(entry.name)) found.push(relative)
  }
  return found.sort()
}

// Sacar un binding deja el árbol editado mientras corre la suite —hasta 21 s, y en lote con decenas de
// archivos tocados a la vez—. Un Ctrl-C ahí dejaría el motor corchado, así que el original se guarda
// antes de escribir y la restauración corre también por señal y al salir.
const pending = new Map()

function write(file, text) {
  if (!pending.has(file)) pending.set(file, fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, text)
}

function restoreAll() {
  for (const [file, original] of pending) fs.writeFileSync(file, original)
  pending.clear()
}

process.on('exit', restoreAll)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { restoreAll(); process.exit(130) })
}

// Saca los bindings pedidos, agrupando por archivo: dos del mismo destructure se aplican uno tras otro
// sobre la línea ya editada, que sigue siendo un destructure hasta que se va el último.
function strip(list) {
  const byFile = new Map()
  for (const { file, i, id } of list) {
    if (!byFile.has(file)) byFile.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n'))
    const lines = byFile.get(file)
    lines[i] = withoutBinding(lines[i], id)
  }
  for (const [file, lines] of byFile) write(path.join(ROOT, file), lines.join('\n'))
}

function green(target) {
  return spawnSync(process.execPath, ['--test', target], { cwd: ROOT, encoding: 'utf8' }).status === 0
}

const label = ({ file, i, local }) => `${file}:${i + 1} ${local}`

// Un binding que aparece una sola vez en su archivo es esa misma línea: nadie lo nombra después. El
// conteo se equivoca sólo hacia el lado seguro —da por vivo lo que aparece dentro de un string—, así
// que propone de menos y nunca de más, y lo que propone lo confirma la corrida igual.
function candidates(files) {
  const found = []
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const binding of bindings(source.split('\n'))) {
      const uses = source.match(new RegExp(`\\b${binding.local}\\b`, 'g')) || []
      if (uses.length <= 1) found.push({ file, ...binding })
    }
  }
  return found
}

function checkSuites() {
  const files = walk(SUITES, (name) => name.endsWith('.test.js'))
  const dead = []
  let runs = 0
  for (const file of files) {
    const found = bindings(fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n'))
    // Una línea por suite y no un indicador con \r: la salida se lee igual en terminal que en un log.
    console.log(`  ${file.padEnd(34)} ${found.length} binding(s)`)
    for (const binding of found) {
      strip([{ file, ...binding }])
      const ok = green(path.join(ROOT, file))
      restoreAll()
      runs++
      if (ok) dead.push(label({ file, ...binding }))
    }
  }
  return { dead, runs, scope: `${runs} binding(s) en ${files.length} suite(s)` }
}

function checkEngine() {
  const files = ENGINE.flatMap((dir) => walk(dir, (name) => name.endsWith('.js')))
  const found = candidates(files)
  const scope = `${found.length} candidato(s) en ${files.length} archivo(s)`
  if (!found.length) return { dead: [], runs: 0, scope }

  strip(found)
  const batch = green(SUITE_GLOB)
  restoreAll()
  if (batch) return { dead: found.map(label), runs: 1, scope }

  // El lote en rojo dice que alguno estaba vivo, no cuál. Recién ahí se paga de a uno, y sale barato
  // porque los candidatos son pocos: es el conteo el que ya descartó todo lo demás.
  const dead = []
  let runs = 1
  for (const binding of found) {
    strip([binding])
    const ok = green(SUITE_GLOB)
    restoreAll()
    runs++
    if (ok) dead.push(label(binding))
  }
  return { dead, runs, scope }
}

const engineOnly = process.argv.includes('--engine')
const results = engineOnly ? [checkEngine()] : [checkSuites(), checkEngine()]
const dead = results.flatMap((result) => result.dead)
for (const result of results) console.log(`${result.scope}, ${result.runs} corrida(s).`)
if (!dead.length) {
  console.log('✓ ningún import muerto')
  process.exit(0)
}
console.log(`✗ ${dead.length} import(s) que nadie usa:`)
for (const line of dead) console.log(`  ${line}`)
process.exit(1)
