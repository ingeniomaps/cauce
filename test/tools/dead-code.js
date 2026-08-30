'use strict'

// Superficie que nadie usa: imports que ningún archivo lee y exports que nadie importa.
//
// Las dos mitades se confirman al revés, y conviene saber cuál manda en cada una.
//
// Un import se usa dentro de su propio archivo, así que contarlo con una expresión regular no alcanza:
// en este mismo repositorio dio `run` por usado porque `--dry-run` lleva la palabra adentro. Ahí el
// conteo sólo propone y **la corrida decide**, que es lo único que un texto dentro de un string no
// puede engañar.
//
// Un export se usa desde otro archivo y tiene que nombrarlo, así que buscarlo en el repositorio entero
// **decide**, y la corrida queda de confirmación. Tiene que ser en ese orden: sacar un export no
// revienta, deja un `undefined` que se calla hasta que alguien lo llama, y una suite que no ejercite
// ese camino lo daría por muerto estando vivo.
//
// La regla de los exports es que un nombre que nada del repositorio menciona —ni el código ni la
// documentación— no es superficie de nadie. Se sostiene sola: lo que se quiere público se documenta, y
// documentarlo es justo lo que lo salva de este barrido. Hoy cubre los cuatro consumos que existen —el
// CLI, el runtime que ejecutan los guards, los schemas y las tres funciones del contrato de proveedor,
// todos nombrados en un README— sin una lista aparte que mantener y que se pudriría.
//
// `evaluations/results/` queda afuera de esa búsqueda: es la transcripción de una corrida, no un
// documento que alguien siga, y nombra de paso lo que el cargo leyó. Misma razón por la que
// `repo.test.js` lo excluye de su propio barrido.
//
// Y el costo, que es lo que decide qué entra en `ci`. Una suite se corre sola, así que un import suyo
// cuesta una corrida chica: 332 corridas, varios minutos, y por eso ese modo queda fuera. El motor no
// tiene suite propia —cualquier archivo de `test/` puede ejercerlo—, así que confirmar exige la suite
// entera: 21 s por binding y 192 bindings, más de una hora. De ahí el lote: si sacar todos los
// candidatos juntos deja la suite verde, entonces cada uno por separado también, porque sacar menos es
// un subconjunto de sacar todos.
//
// En el caso normal no hay ninguna corrida. Sin candidatos no hay nada que confirmar y los dos escaneos
// terminan en milisegundos: ése es el caso que corre en cada `ci`.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..', '..')
const SUITES = 'test'
const SUITE_GLOB = 'test/**/*.test.js'
const ENGINE = ['engine', 'automatization']
const EXPORTS_BLOCK = /module\.exports\s*=\s*\{([\s\S]*?)\n?\}/
// Un namespace indexado o enumerado usa exports que no están escritos en ninguna parte. Lo que sigue
// al alias tiene que cerrar el argumento: `Object.keys(M)` enumera el módulo, `Object.keys(M.forks())`
// enumera un dato y no dice nada de la superficie. Sin esa distinción se abstenía de dos módulos que sí
// se pueden analizar, que es abstenerse de más y deja exports muertos sin mirar.
const dynamicUse = (alias) => new RegExp(`Object\\.\\w+\\(\\s*${alias}\\s*[),]|\\b${alias}\\[`)

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

// Los nombres que un módulo publica, sin el renombre: lo que se busca es el nombre exportado.
function exportNames(source) {
  const block = source.match(EXPORTS_BLOCK)
  if (!block) return []
  return block[1].split(',').map((x) => x.trim().split(':')[0].trim()).filter((n) => /^\w+$/.test(n))
}

// El bloque se reescribe entero y envuelto a 100: dejarlo en una línea sola pasaría los 120 que
// `repo.test.js` exige, y la suite fallaría por el formato en vez de por el export que se sacó.
function withoutExports(source, drop) {
  const block = source.match(EXPORTS_BLOCK)
  const kept = block[1].split(',').map((x) => x.trim()).filter(Boolean)
    .filter((entry) => !drop.includes(entry.split(':')[0].trim()))
  const lines = []
  let line = ''
  for (const name of kept) {
    if (line.length + name.length + 3 > 100) { lines.push(line); line = '' }
    line += `${line ? ' ' : '  '}${name},`
  }
  if (line) lines.push(line)
  const rendered = kept.length ? `module.exports = {\n${lines.join('\n')}\n}` : 'module.exports = {}'
  return source.slice(0, block.index) + rendered + source.slice(block.index + block[0].length)
}

// A qué archivo del motor apunta un `require` relativo, probando las tres formas que resuelve Node.
function engineTarget(from, spec) {
  if (!spec.startsWith('.')) return ''
  const base = path.join(path.dirname(from), spec)
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    const relative = candidate.split(path.sep).join('/')
    if (relative.startsWith('engine/') && relative.endsWith('.js') && fs.existsSync(path.join(ROOT, relative))) {
      return relative
    }
  }
  return ''
}

// Módulos que no se pueden analizar por nombre. Se dicen en vez de proponer que se borre algo vivo.
function opaqueModules(sources) {
  const opaque = new Set()
  for (const [file, source] of sources) {
    if (!file.endsWith('.js')) continue
    for (const line of source.split('\n')) {
      const simple = line.match(IMPORT_SIMPLE)
      const spec = simple && line.match(/require\('([^']+)'\)/)
      if (!spec) continue
      const target = engineTarget(file, spec[1])
      if (target && dynamicUse(simple[1]).test(source)) opaque.add(target)
    }
  }
  return opaque
}

function checkExports(sources) {
  const opaque = opaqueModules(sources)
  const engine = [...sources.keys()].filter((f) => f.startsWith('engine/') && f.endsWith('.js'))
  const found = []
  for (const file of engine) {
    if (opaque.has(file)) continue
    for (const name of exportNames(sources.get(file))) {
      const re = new RegExp(`\\b${name}\\b`)
      let used = false
      for (const [other, source] of sources) { if (other !== file && re.test(source)) { used = true; break } }
      if (!used) found.push({ file, name })
    }
  }
  const scope = `${found.length} export(s) sin mención en ${sources.size} archivo(s)`
    + (opaque.size ? `, ${opaque.size} módulo(s) opaco(s) sin analizar` : '')
  if (!found.length) return { dead: [], runs: 0, scope }

  const byFile = new Map()
  for (const { file, name } of found) byFile.set(file, [...(byFile.get(file) || []), name])
  for (const [file, names] of byFile) {
    write(path.join(ROOT, file), withoutExports(fs.readFileSync(path.join(ROOT, file), 'utf8'), names))
  }
  const batch = green(SUITE_GLOB)
  restoreAll()
  const dead = found.map(({ file, name }) => `${file} :: ${name}`)
  // El escaneo ya decidió; la corrida confirma. En rojo no se afirma nada y se dice por qué.
  if (!batch) return { dead: [], runs: 1, scope, inconclusive: true }
  return { dead, runs: 1, scope }
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

// Lo trackeado es el universo: lo que git no ve no es superficie de nadie. Se lee una vez y se pasa,
// porque los dos escaneos recorren lo mismo y leerlo dos veces cuesta el doble sin decir nada nuevo.
function repoSources() {
  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n')
  const sources = new Map()
  for (const file of tracked) {
    if (file.includes('/results/')) continue
    try { sources.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8')) } catch { /* binario o ausente */ }
  }
  return sources
}

const engineOnly = process.argv.includes('--engine')
const results = engineOnly
  ? [checkEngine(), checkExports(repoSources())]
  : [checkSuites(), checkEngine(), checkExports(repoSources())]
const dead = results.flatMap((result) => result.dead)
for (const result of results) console.log(`${result.scope}, ${result.runs} corrida(s).`)
if (!dead.length) {
  // Un ✓ cuando no se pudo medir se lee igual que uno limpio, y es la suite rota lo que hay que ver
  // primero. No falla acá: el mismo rojo lo levanta `coverage`, dos pasos más adelante en `ci`.
  const blind = results.some((result) => result.inconclusive)
  console.log(blind ? '⚠ sin confirmar: la suite no está verde' : '✓ ninguna superficie muerta')
  process.exit(0)
}
console.log(`✗ ${dead.length} sin uso:`)
for (const line of dead) console.log(`  ${line}`)
process.exit(1)
