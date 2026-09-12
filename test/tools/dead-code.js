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
// Y el costo, que es lo que decide qué entra en `ci`. Los dos modos de import cuentan primero y confirman
// después: el conteo propone y la corrida decide, así que en un repositorio sano no se paga ninguna.
// Medido el 2026-09-12 sobre las suites: **522 bindings, 0 candidatos**. Confirmar uno cuesta distinto de
// cada lado y por eso el motor va en lote: una suite se corre sola —0,88 s—, mientras que el motor no
// tiene suite propia y confirmar un binding suyo exige la entera, 45 s. De ahí el lote: si sacar todos los
// candidatos juntos deja la suite verde, entonces cada uno por separado también, porque sacar menos es
// un subconjunto de sacar todos.
//
// Hasta 0.86.0 el modo de suites confirmaba **los 522** y por eso quedaba fuera de `ci`: seis minutos que
// nadie iba a pagar en cada corrida. El precio de que quedara fuera era que no corría nunca, y así
// entraron tres imports muertos que se encontraron a mano (caso 128). Contar antes lo vuelve gratis.
//
// Lo que se cede, y conviene saberlo: el conteo es una expresión regular, así que un nombre escrito
// dentro de un string lo da por usado —pasó con `run` adentro de `--dry-run`— y ese import muerto se
// escapa. Es un barrido que corre siempre y puede perder alguno, en vez de uno exhaustivo que no corre:
// contrastado contra el árbol anterior al arreglo del 128, el conteo marca los tres que había.

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

const label = ({ file, i, local, name }) => (name ? `${file} :: ${name}` : `${file}:${i + 1} ${local}`)

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

// Los usos de cada módulo del motor, resueltos a su destino. Contar el nombre suelto en todo el
// repositorio daba por vivo cualquier `read` porque hay cinco módulos que exportan `read`: 61 de los
// 229 exports comparten nombre con otro, y ninguno de esos se podía mirar. Acá el `require` dice a qué
// archivo apunta cada mención, así que `catalog.read` ya no salva al `read` de `changelog`.
//
// Se recorre el texto y no las líneas: `engine/automation/index.js` abre su destructure en una línea y
// lo cierra tres más abajo, y un parser por línea no ve ninguno de sus trece nombres. Con eso quedaban
// 48 exports vivos propuestos como muertos, que es justo lo que la corrida frenó.
//
// Un archivo con un `require` de especificador armado en runtime no puede dar un mapa confiable —no se
// sabe qué módulo cargó—, así que vuelve entero al conteo por nombre suelto. Son tres hoy, y perder
// precisión ahí es el lado seguro: propone de menos.
function resolvedUses(sources) {
  const uses = new Map()
  const loose = []
  const add = (target, name) => {
    if (!uses.has(target)) uses.set(target, new Set())
    uses.get(target).add(name)
  }
  const namesIn = (list) => list.split(',').map((id) => id.trim().split(':')[0].trim())
  for (const [file, source] of sources) {
    if (!file.endsWith('.js') || /require\([^')]/.test(source)) { loose.push([file, source]); continue }
    const alias = new Map()
    // Con sangría: un `require` dentro de una función es un alias igual, y `ownership.js` y
    // `context.test.js` los usan así. Anclar en `^const` los perdía y daba tres exports vivos por muertos.
    for (const hit of source.matchAll(/^\s*const (\w+) = require\('([^']+)'\)$/gm)) {
      const target = engineTarget(file, hit[2])
      if (target) alias.set(hit[1], target)
    }
    for (const hit of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('([^']+)'\)/g)) {
      const target = engineTarget(file, hit[2])
      if (target) for (const name of namesIn(hit[1])) add(target, name)
    }
    for (const [local, target] of alias) {
      for (const hit of source.matchAll(new RegExp(`\\b${local}\\.(\\w+)`, 'g'))) add(target, hit[1])
      // `const { a, b } = I`, con `I` ya importado más arriba: el destructure no nombra al `require`.
      for (const hit of source.matchAll(new RegExp(`const\\s*\\{([^}]+)\\}\\s*=\\s*${local}\\b`, 'g'))) {
        for (const name of namesIn(hit[1])) add(target, name)
      }
    }
    for (const hit of source.matchAll(/require\('([^']+)'\)\.(\w+)/g)) {
      const target = engineTarget(file, hit[1])
      if (target) add(target, hit[2])
    }
  }
  return { uses, loose }
}

function checkExports(sources) {
  const opaque = opaqueModules(sources)
  const { uses, loose } = resolvedUses(sources)
  const engine = [...sources.keys()].filter((f) => f.startsWith('engine/') && f.endsWith('.js'))
  const found = []
  for (const file of engine) {
    if (opaque.has(file)) continue
    const resolved = uses.get(file) || new Set()
    for (const name of exportNames(sources.get(file))) {
      if (resolved.has(name)) continue
      // Un README no puede decir de qué módulo habla, así que una mención en prosa salva por nombre.
      // Es la regla de siempre: lo que se quiere público se documenta, y documentarlo es lo que salva.
      const re = new RegExp(`\\b${name}\\b`)
      if (loose.some(([other, source]) => other !== file && re.test(source))) continue
      found.push({ file, name })
    }
  }
  const scope = `${found.length} export(s) sin uso en ${sources.size} archivo(s)`
    + (opaque.size ? `, ${opaque.size} módulo(s) opaco(s) sin analizar` : '')
  if (!found.length) return { dead: [], runs: 0, scope }

  const byFile = new Map()
  for (const { file, name } of found) byFile.set(file, [...(byFile.get(file) || []), name])
  for (const [file, names] of byFile) {
    write(path.join(ROOT, file), withoutExports(fs.readFileSync(path.join(ROOT, file), 'utf8'), names))
  }
  const batch = green(SUITE_GLOB)
  restoreAll()
  if (batch) return { dead: found.map(label), runs: 1, scope }

  // El lote en rojo tiene dos causas y hay que separarlas: que alguno estuviera vivo, o que la suite ya
  // viniera rota. Preguntarlo cuesta una corrida y ahorra las N de abajo, que sobre una suite rota no
  // pueden confirmar nada; y sin esto el resultado sería un ✓ que se lee igual que uno limpio.
  if (!green(SUITE_GLOB)) return { dead: [], runs: 2, scope, inconclusive: true }

  // Entonces alguno estaba vivo y el escaneo no vio cómo lo usan. Se separa de a uno, igual que del
  // lado de los imports, para no devolver un «no sé» cuando se puede decir cuál.
  const dead = []
  let runs = 2
  for (const one of found) {
    write(path.join(ROOT, one.file), withoutExports(fs.readFileSync(path.join(ROOT, one.file), 'utf8'), [one.name]))
    const ok = green(SUITE_GLOB)
    restoreAll()
    runs++
    if (ok) dead.push(label(one))
  }
  return { dead, runs, scope }
}

// Cada candidato se confirma contra **su propia suite** y no contra todas: es lo que separa este modo del
// del motor, donde un binding puede usarlo cualquier archivo de `test/`. Acá el consumidor es el archivo
// mismo, así que la corrida que decide es la suya y cuesta menos de un segundo.
function checkSuites() {
  const files = walk(SUITES, (name) => name.endsWith('.test.js'))
  const found = candidates(files)
  const scope = `${found.length} candidato(s) en ${files.length} suite(s)`
  if (!found.length) return { dead: [], runs: 0, scope }

  const dead = []
  let runs = 0
  for (const binding of found) {
    strip([binding])
    const ok = green(path.join(ROOT, binding.file))
    restoreAll()
    runs++
    if (ok) dead.push(label(binding))
  }
  return { dead, runs, scope }
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

// Los tres barridos, siempre. Hubo un modo `--engine` que salteaba las suites, y existía porque ésas
// costaban seis minutos; con el conteo por delante la diferencia quedó en once milisegundos —medido—, así
// que mantener dos caminos ya no compraba nada.
const results = [checkSuites(), checkEngine(), checkExports(repoSources())]
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
