'use strict'

// Lo que este repositorio y su paquete se prometen a sí mismos: que la documentación no cite un comando
// que no existe, que el código siga sus propias convenciones y que el tarball no lleve lo que no debe.
//
// No prueba el producto sino su fábrica, y por eso no monta ninguna instancia. `ci.test.js` es el vecino
// que cubre la otra mitad de esa fábrica: la automatización de GitHub Actions.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Los archivos de código del repositorio, que dos pruebas recorren igual. Vive acá y no dentro de cada
// una porque copiado se pudre una de las dos copias —se queda sin un directorio— y nada falla.
function sourceFiles() {
  const root = path.resolve(__dirname, '..', '..')
  const below = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') below(file, out); continue }
      if (/\.(js|sh)$/.test(entry.name)) out.push(file)
    }
    return out
  }
  return ['engine', 'automatization', 'test', 'template'].flatMap((dir) => below(path.join(root, dir)))
}

// El README de un adaptador mandaba a correr `make install-antigravity` y `make doctor-antigravity`:
// ninguno de los dos existió nunca, y una instancia instalada ni siquiera tiene `Makefile`. Ya había un
// test así para la documentación de los cargos; el resto del repositorio no lo tenía, que es donde
// estaba el error. Un comando inventado en un README no rompe nada hasta que alguien lo escribe.
test('ningún documento del repositorio cita un comando make que no existe', () => {
  const root = path.resolve(__dirname, '..', '..')
  const defined = new Set()
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    for (const hit of fs.readFileSync(path.join(root, makefile), 'utf8').matchAll(/^([a-z][a-z0-9-]*):/gm)) {
      defined.add(hit[1])
    }
  }
  const invented = []
  const review = (file) => {
    for (const hit of fs.readFileSync(file, 'utf8').matchAll(/(?:^|[`\s])make ([a-z][a-z0-9-]*)/gm)) {
      if (!defined.has(hit[1])) invented.push(`${path.relative(root, file)}: make ${hit[1]}`)
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // `evaluations/results/` es la transcripción de una corrida, no un documento que alguien siga:
      // contiene comandos que el cargo propuso, y no tienen por qué existir. Misma razón que el test
      // hermano de `agents.test.js`.
      if (entry.name === 'node_modules' || entry.name === 'results' || entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.md')) review(file)
    }
  }
  for (const dir of ['automatization', 'engine', 'template', 'test', 'flows']) walk(path.join(root, dir))
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.md')) review(path.join(root, name))
  }
  assert.ok(defined.size > 5, 'los Makefiles deberían declarar varios objetivos')
  assert.deepEqual(invented, [])
})

// Sin linter —el toolkit no tiene dependencias, ni siquiera de desarrollo— una convención sólo existe
// si algo la comprueba. El prefijo no es cosmético: `require('fs')` lo puede secuestrar un paquete
// llamado `fs`, y `require('node:fs')` no. Estaba en 31 de 46 lugares, que es la peor de las mezclas.
test('los módulos de Node se importan con el prefijo node:', () => {
  const root = path.resolve(__dirname, '..', '..')
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const current = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(current)
      else if (entry.name.endsWith('.js')) files.push(current)
    }
  }
  for (const dir of ['engine', 'automatization', 'template', 'test']) walk(path.join(root, dir))

  const loose = []
  for (const file of files) {
    // Sin los comentarios: este mismo test nombra `require('fs')` para explicar por qué no va.
    const source = fs.readFileSync(file, 'utf8').split('\n')
      .filter((line) => !line.trim().startsWith('//')).join('\n')
    for (const match of source.matchAll(/require\('([a-z_]+)'\)/g)) {
      if (require('node:module').builtinModules.includes(match[1])) {
        loose.push(`${path.relative(root, file)}: require('${match[1]}')`)
      }
    }
  }
  assert.deepEqual(loose, [], 'usan `node:` delante')
  assert.ok(files.length > 30, `el recorrido encontró ${files.length} archivos`)
})

// Informes, propuestas y veredictos son lo que produjo nuestra versión del contrato, y `fork` ya se
// niega a heredarlos —`engine/agents/fork.js`—. La misma decisión vale en el borde del paquete: sin
// esto, tres cuartas partes de lo que recibe una empresa es la contabilidad de cómo probamos nuestros
// cargos, y crece una tanda entera por cada corrida de evaluación.
test('el paquete no publica la evidencia de nuestras propias corridas', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const salida = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: raiz, encoding: 'utf8' })
  assert.equal(salida.status, 0, salida.stderr)
  const archivos = JSON.parse(salida.stdout)[0].files.map((entry) => entry.path)

  for (const patron of [/evaluations\/results\//, /learning\/reports\//, /learning\/proposals\//]) {
    assert.deepEqual(archivos.filter((ruta) => patron.test(ruta)), [], `${patron} viaja en el paquete`)
  }
  // Y la negación no puede llevarse puesto lo que el consumidor sí necesita del cargo.
  for (const necesario of [/\/SKILL\.md$/, /evaluations\/cases\//, /\/references\//,
    /learning\/HISTORY\.md$/, /learning\/sources\.yaml$/, /expected-behaviors\.yaml$/]) {
    assert.ok(archivos.some((ruta) => necesario.test(ruta)), `${necesario} falta en el paquete`)
  }
  for (const pieza of ['engine/cli/ops.js', 'template/planning/PROTOCOL.md']) {
    assert.ok(archivos.includes(pieza), `${pieza} falta en el paquete`)
  }
})

// La tabla de equipos enumera lo que trae Cauce, y una enumeración afirma completitud aunque ninguna
// frase lo diga: dos recorridos entraron al catálogo y la tabla siguió diciendo tres. Se deriva del
// directorio, que es lo único que no envejece aparte.
test('el README de recorridos nombra todos los que trae el catálogo', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const readme = fs.readFileSync(path.join(raiz, 'template', 'flows', 'README.md'), 'utf8')
  const catalogo = fs.readdirSync(path.join(raiz, 'flows', 'system'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

  assert.ok(catalogo.length, 'el catálogo trae equipos')
  for (const slug of catalogo) {
    assert.ok(readme.includes(`\`system/${slug}\``), `el README no nombra ${slug}`)
  }
  const nombrados = [...new Set([...readme.matchAll(/`system\/([a-z-]+)`/g)].map((hit) => hit[1]))].sort()
  assert.deepEqual(nombrados, catalogo, 'y no nombra ninguno que ya no exista')
})

// Sin linter, un tope de largo sólo existe si algo lo cuenta, y tres líneas ya se habían pasado.
//
// Se cuentan caracteres y no bytes, que es lo que dice la convención y lo que casi hace fallar esta
// misma revisión: `awk` con locale UTF-8 cuenta bytes, y un comentario separador de 99 caracteres
// hecho con `─` mide 236. Medido en bytes, tres archivos limpios parecían estar en falta.
test('ninguna línea de código pasa los 120 caracteres que fija la convención', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const archivos = sourceFiles()
  const largas = archivos.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((linea, i) => ({ file, n: i + 1, largo: [...linea].length }))
    .filter((x) => x.largo > 120)
    .map((x) => `${path.relative(raiz, x.file)}:${x.n} (${x.largo})`))
  assert.deepEqual(largas, [], `pasan los 120 caracteres:\n  ${largas.join('\n  ')}`)
})

// Un comentario cortado a la mitad no se detecta releyendo: se lee entero y quien lo escribió ya lo da
// por bueno. Los splits de archivo del 22 de agosto dejaron siete así —la mitad de una oración en
// `catalog.js` y la otra en `io.js`, la última línea del encabezado de `providerNames` dentro del
// párrafo de otra función— y los siete pasaron esta suite en verde.
//
// Lo que se comprueba es la oración y no la ubicación: un bloque que empieza en minúscula perdió su
// principio, y uno que no cierra perdió su final. La otra forma —el comentario entero que quedó lejos
// del código que describía— tiene la misma silueta que un encabezado de sección legítimo, así que no se
// comprueba acá: este verde no dice nada sobre ella.
const PROSE_END = /[.:;!?)»`'"\]—-]$/
// Dos formas que no son prosa y por eso no cierran oración: la regla de guiones que separa actos dentro
// de una prueba larga, y el bloque de uso que muestra cómo se invoca un script. Se reconocen por su
// forma —la línea decorativa por el guion de caja, la muestra por su sangría— y no por una lista de
// archivos, que envejecería sola.
const DECORATION = /─{3,}/
const SAMPLE = /^ {3,}\S/

test('ningún comentario empieza ni termina a mitad de una oración', () => {
  const root = path.resolve(__dirname, '..', '..')
  // `npm` se escribe en minúscula y encabeza dos comentarios que están completos. La excepción se
  // declara en vez de perdonarse: un nombre propio en minúscula no es una oración empezada por la mitad.
  const LOWERCASE_NAMES = new Set(['npm'])
  const cut = []
  let seen = 0
  for (const file of sourceFiles()) {
    const mark = file.endsWith('.sh') ? /^\s*#(?!!)/ : /^\s*\/\//
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    let i = 0
    while (i < lines.length) {
      if (!mark.test(lines[i])) { i += 1; continue }
      const start = i
      const body = []
      while (i < lines.length && mark.test(lines[i])) { body.push(lines[i].replace(mark, '').trimEnd()); i += 1 }
      const prose = body.filter((line) => line.trim() && !DECORATION.test(line) && !SAMPLE.test(line))
      if (!prose.length) continue
      seen += 1
      const where = `${path.relative(root, file)}:${start + 1}`
      const first = prose[0].trim()
      const last = prose[prose.length - 1].trim()
      if (/^[a-záéíóúñ]/.test(first) && !LOWERCASE_NAMES.has(first.split(/[\s,.:]/)[0])) {
        cut.push(`${where}: empieza a mitad de una oración — «${first.slice(0, 60)}…»`)
      }
      if (!PROSE_END.test(last)) cut.push(`${where}: no cierra la oración — «…${last.slice(-60)}»`)
    }
  }
  // Cero bloques inspeccionados también da verde, y ese verde diría que no hay comentarios partidos
  // sobre un recorrido que no encontró un solo archivo. El piso está muy por debajo de los que hay.
  assert.ok(seen > 300, `sólo se inspeccionaron ${seen} bloques de comentario`)
  assert.deepEqual(cut, [], `comentarios partidos:\n  ${cut.join('\n  ')}`)
})

// La otra mitad, la que la sonda de arriba declaraba no poder cubrir: el comentario entero que quedó
// lejos del código que describía. Cuando `catalog.js` se partió en tres, seis encabezados se quedaron
// atrás y ninguno se veía roto — cada uno encabezaba la función siguiente y se leía como suyo.
//
// Lo que los separa de un encabezado de archivo legítimo no es la forma sino el lugar: el encabezado
// vive en el preámbulo —hasta el último import anterior a la primera declaración que no lo es, o hasta
// el primer bloque si el archivo no importa nada—, y de ahí en adelante un comentario está pegado a lo
// que describe. Medido contra el árbol de antes de esta tanda, la regla nombra los ocho que había y no
// inventa ninguno.
//
// Lo que sigue afuera es el fragmento que aterrizó **dentro** de otro comentario, sin blanco que lo
// delate: así llegó un párrafo del merge de `AGENTS.md` a encabezar una prueba de `destroy`. Eso lo
// encontró comparar comentarios entre sí, no mirar su forma.
const IMPORT = /require\(|^\s*import /
const DECLARATION = /^\s*(?:async function |function |const |let |var |class |module\.exports|test\(|export )/

test('ningún comentario quedó separado del código que describe', () => {
  const root = path.resolve(__dirname, '..', '..')
  const stranded = []
  let seen = 0
  for (const file of sourceFiles().filter((name) => name.endsWith('.js'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    let firstDeclaration = lines.length
    for (let n = 0; n < lines.length; n += 1) {
      if (DECLARATION.test(lines[n]) && !IMPORT.test(lines[n])) { firstDeclaration = n; break }
    }
    let preamble = -1
    for (let n = 0; n < firstDeclaration; n += 1) if (IMPORT.test(lines[n])) preamble = n
    if (preamble < 0) {
      for (let n = 0; n < firstDeclaration; n += 1) {
        if (!/^\s*\/\//.test(lines[n])) continue
        let end = n
        while (end < lines.length && /^\s*\/\//.test(lines[end])) end += 1
        preamble = end
        break
      }
    }
    let i = 0
    while (i < lines.length) {
      if (!/^\s*\/\//.test(lines[i])) { i += 1; continue }
      const start = i
      while (i < lines.length && /^\s*\/\//.test(lines[i])) i += 1
      if (start <= preamble) continue
      seen += 1
      let next = i
      while (next < lines.length && lines[next].trim() === '') next += 1
      if (next > i && next < lines.length) {
        stranded.push(`${path.relative(root, file)}:${start + 1} describe algo que no es la línea ${next + 1}`)
      }
    }
  }
  // El mismo piso que la sonda de arriba, y por la misma razón: sin bloques que mirar, el verde diría
  // que no hay ninguno suelto sobre un recorrido que no encontró un archivo.
  assert.ok(seen > 300, `sólo se inspeccionaron ${seen} bloques fuera del preámbulo`)
  assert.deepEqual(stranded, [], `comentarios separados de su código:\n  ${stranded.join('\n  ')}`)
})

// Un comentario que cita algo por su nombre promete que ese algo existe, y cuando deja de existir la
// cita no falla: manda a buscar. Pasó cuatro veces en un solo repaso — una función retirada en un
// refactor, una opción reemplazada por una lista, `evaluationBench` mudada de archivo mientras el
// puntero seguía nombrando el viejo. Van sin backticks a propósito: acá un backtick promete que la
// cosa existe, y esta misma prueba se lo cobró al nombrarlas.
//
// Se comprueban las dos formas que se pudrieron, y ninguna más. Citar una ruta a secas no entra: se
// midió contra el árbol de antes de esta tanda y no encontró nada, porque las rutas que fallaron
// seguían existiendo y lo que se había movido era la función adentro. Eso es justo lo que sí atrapa
// `\`X\` (ruta)`.
//
// El corpus son las líneas de código, nunca los comentarios: leyéndolos, cada cita se respalda a sí
// misma y el control queda verde siempre. Se aprendió midiendo — `getcwd` daba por resuelto contra el
// único lugar donde aparece, que es el comentario que lo nombra.
const CITED = /`([a-z][A-Za-z0-9]{3,})(?:\(\))?`/g
const CITED_AT = /`([A-Za-z][A-Za-z0-9]*)`\s*\(([a-z][a-zA-Z0-9_/-]*\.(?:js|sh))\)/g

test('ningún comentario cita algo que dejó de existir', () => {
  const root = path.resolve(__dirname, '..', '..')
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
  // Los registros de evaluación transcriben lo que un cargo escribió y pueden nombrar cualquier cosa,
  // así que no respaldan nada. Misma razón que en el chequeo de comandos make.
  const corpus = tracked.filter((file) => /\.(js|sh|json|ya?ml)$/.test(file) && !file.includes('/results/'))
  const defined = new Set()
  for (const file of corpus) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    const mark = file.endsWith('.sh') ? /^\s*#/ : /^\s*\/\//
    const code = /\.(js|sh)$/.test(file) ? text.split('\n').filter((line) => !mark.test(line)).join('\n') : text
    for (const word of code.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) defined.add(word)
  }
  // `getcwd` es la llamada al sistema que nombra el error de la terminal, no un identificador nuestro.
  // Se declara en vez de perdonarse: si mañana el comentario se borra, esta línea sobra y se ve.
  const FOREIGN = new Set(['getcwd'])
  const dangling = []
  let cited = 0
  for (const file of tracked.filter((name) => /\.(js|sh)$/.test(name))) {
    const mark = file.endsWith('.sh') ? /^\s*#(?!!)/ : /^\s*\/\//
    fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, i) => {
      if (!mark.test(line)) return
      for (const hit of line.matchAll(CITED)) {
        cited += 1
        if (!defined.has(hit[1]) && !FOREIGN.has(hit[1])) dangling.push(`${file}:${i + 1}: \`${hit[1]}\` no existe`)
      }
      for (const hit of line.matchAll(CITED_AT)) {
        const [, name, cita] = hit
        const target = tracked.includes(cita) ? cita : tracked.find((one) => one.endsWith(`/${cita}`))
        if (!target) { dangling.push(`${file}:${i + 1}: ${cita} no existe`); continue }
        const body = fs.readFileSync(path.join(root, target), 'utf8')
        if (!new RegExp(`\\b${name}\\b`).test(body)) dangling.push(`${file}:${i + 1}: ${name} ya no está en ${cita}`)
      }
    })
  }
  assert.ok(cited > 200, `sólo se contrastaron ${cited} citas`)
  assert.deepEqual(dangling, [], `citas que ya no resuelven:\n  ${dangling.join('\n  ')}`)
})

// Una razón repetida en dos archivos es una copia, y una de las dos se pudre sin que nada falle. En un
// solo repaso hubo cincuenta y cinco: un comentario de prueba que transcribía el porqué del código que
// cubría, dos módulos del motor con el mismo hecho escrito de dos maneras, dos suites explicando cada
// una dónde aterriza un runner. Ninguna rompió nada; simplemente dejaron de coincidir.
//
// El umbral es lo único de acá que no es un hecho, y por eso se eligió midiendo: los puntajes forman un
// continuo con saltos de milésimas salvo un hueco, entre 0.50 y 0.395. 0.45 cae adentro. Contra el árbol
// de antes del repaso nombra treinta y uno de los cincuenta y cinco; el resto vivía por debajo, donde
// vocabulario compartido y copia dejan de distinguirse solos.
//
// Y por eso el registro, con la misma forma que el piso de cobertura: un par nuevo falla hasta que
// alguien lo arregla o lo acepta **con su razón escrita**. Sin esa segunda salida el gate se apagaría el
// día que moleste, que es el día en que está funcionando; sin la razón, aceptar no dejaría rastro. Se
// cuenta cuántos pares hay entre cada dos archivos para que un segundo no entre a la sombra del primero.
const ACCEPTED_PAIRS = {
  'automatization/workflows/integrations/promote.js::automatization/workflows/integrations/sync.js':
    { pairs: 1, reason: 'Workflows gemelos: cada uno viaja y se lee solo, y difieren en el verbo que importa.' },
  'automatization/hooks/guard-files.sh::automatization/hooks/guard-shell.sh':
    { pairs: 1, reason: 'Los quince shims son una plantilla; lo que cambia es a qué guard delegan.' },
  'automatization/hooks/run-hook.sh::automatization/runners/antigravity/hook.js':
    { pairs: 1, reason: 'Los dos repiten la cascada del motor y lo declaran; ownership.js nombra a los dos.' },
}
const SIMILAR = 0.45

test('ninguna razón está escrita en dos lugares sin decir por qué', () => {
  const root = path.resolve(__dirname, '..', '..')
  const blocks = []
  for (const file of sourceFiles()) {
    const name = path.relative(root, file)
    const mark = file.endsWith('.sh') ? /^\s*#(?!!)/ : /^\s*\/\//
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    let i = 0
    while (i < lines.length) {
      if (!mark.test(lines[i])) { i += 1; continue }
      const start = i
      const body = []
      while (i < lines.length && mark.test(lines[i])) { body.push(lines[i].replace(mark, '').trim()); i += 1 }
      // Se compara párrafo por párrafo y no bloque entero: un encabezado largo diluye la copia que lleva
      // adentro, y fue así como varias transcripciones pasaron por debajo del umbral.
      for (const paragraph of body.join(' ').split(/\s{2,}/)) {
        const words = paragraph.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .match(/[a-z`][a-z`./_-]{4,}/g) || []
        if (words.length >= 8) blocks.push({ name, line: start + 1, words: new Set(words) })
      }
    }
  }
  const found = {}
  for (let a = 0; a < blocks.length; a += 1) {
    for (let b = a + 1; b < blocks.length; b += 1) {
      const one = blocks[a]
      const other = blocks[b]
      let shared = 0
      for (const word of one.words) if (other.words.has(word)) shared += 1
      if (shared / (one.words.size + other.words.size - shared) <= SIMILAR) continue
      const key = [one.name, other.name].sort().join('::')
      found[key] = found[key] || []
      found[key].push(`${one.name}:${one.line} ↔ ${other.name}:${other.line}`)
    }
  }
  const unexplained = []
  for (const [key, hits] of Object.entries(found)) {
    const accepted = ACCEPTED_PAIRS[key]
    if (!accepted) { unexplained.push(...hits.map((hit) => `${hit} — sin razón declarada`)); continue }
    if (hits.length > accepted.pairs) {
      unexplained.push(`${key}: ${hits.length} pares y el registro acepta ${accepted.pairs}`)
    }
  }
  // Un registro que nombra un par que ya no existe manda a cuidar algo que nadie escribió, y la razón
  // que lo acompaña deja de poder contrastarse. Se retira igual que un piso de cobertura huérfano.
  for (const key of Object.keys(ACCEPTED_PAIRS)) {
    if (!found[key]) unexplained.push(`${key}: aceptado en el registro y ya no existe`)
  }
  assert.ok(blocks.length > 300, `sólo se compararon ${blocks.length} párrafos`)
  assert.deepEqual(unexplained, [], `razones repetidas:\n  ${unexplained.join('\n  ')}`)
})

// Quinientas líneas por archivo de código, el número que `AGENTS.md` fija para este repositorio. R7
// deja el número al proyecto y éste es el proyecto: Node sin dependencias, donde a esa altura ya hay
// varias responsabilidades conviviendo. El umbral dispara, no decide — lo que sigue es mirar si el
// archivo mezcla dos propósitos con vidas distintas, y de ahí sale en cuál de los dos registros entra.
//
// Son dos y no uno a propósito. `JUSTIFIED` es lo que crece por diseño y va a seguir creciendo: el
// registro de guards suma uno por guard, el recorrido de `autobuild` uno por fase, y partirlos
// dispersaría lo que es una sola cosa —que R7 llama peor que el archivo largo—. `PENDING_SPLIT` es
// deuda: archivos que sí mezclan sujetos y todavía no se partieron, con la partición anotada.
//
// Escribir la deuda como si fuera justificación es lo que vuelve inútil a un registro así, porque una
// excepción sin fecha no se cierra nunca. Acá se cierra sola: una entrada de cualquiera de los dos que
// deje de pasarse del umbral **falla**, así que partir un archivo obliga a sacarlo de la lista.
const MAX_LINES = 500

const JUSTIFIED = {
  'automatization/workflows/autobuild.js':
    'Un recorrido crece de a una fase, y su schema y su paso cambian juntos: separarlos parte por la '
    + 'mitad lo que es una sola cosa.',
}

const PENDING_SPLIT = {
}

test('ningún archivo de código pasa las 500 líneas sin decir por qué', () => {
  const root = path.resolve(__dirname, '..', '..')
  const over = {}
  for (const file of sourceFiles()) {
    const name = path.relative(root, file)
    const count = fs.readFileSync(file, 'utf8').split('\n').length
    if (count > MAX_LINES) over[name] = count
  }
  const unexplained = Object.entries(over)
    .filter(([name]) => !JUSTIFIED[name] && !PENDING_SPLIT[name])
    .map(([name, count]) => `${name}: ${count} líneas y ninguna razón registrada`)
  // Una entrada que ya no hace falta manda a cuidar algo que nadie escribió, y en `PENDING_SPLIT` es
  // peor: deja la deuda anotada después de pagarla. Se retira igual que un piso de cobertura huérfano.
  for (const name of [...Object.keys(JUSTIFIED), ...Object.keys(PENDING_SPLIT)]) {
    if (!over[name]) unexplained.push(`${name}: ya no pasa las ${MAX_LINES} líneas, sacalo del registro`)
  }
  assert.ok(sourceFiles().length > 50, 'el recorrido no encontró archivos de código')
  assert.deepEqual(unexplained, [], `archivos sin razón registrada:\n  ${unexplained.join('\n  ')}`)
})

// El vecino de `workflows.test.js` ya cuida esto sobre los workflows renderizados, que es lo que recibe
// una instancia. Falta la otra mitad: el archivo tal como queda en el repositorio. Por ahí entró lo que
// nadie miraba —el prefijo de un repositorio que después se renombró, fijado en ciento setenta y cinco
// archivos—, y donde más caro sale es en `learning/proposals/`, que `agent-promote` manda leer entero
// antes de aplicar: el destino inexistente le llega a un cargo con forma de ubicación buena.
//
// No queda exento el registro de evaluación: los ciento sesenta y nueve archivos que lo tenían se
// barrieron, así que la regla es una sola y nadie tiene que recordar dónde no rige. El porqué del
// lookbehind está en el vecino y no se repite acá.
test('ningún archivo del repositorio nombra la ruta absoluta de una máquina', () => {
  const root = path.resolve(__dirname, '..', '..')
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
  // Los dos bordes son distintos porque este corpus es más ancho que el del vecino. El de la carpeta
  // personal descarta un dígito a la izquierda: la URL de ISO que citan dos cargos lleva ese tramo
  // adentro y no es la carpeta de nadie. El de la unidad no alcanza con descartar letras —`Aceptaci
  // [oó]n:` deja un corchete a la izquierda de la `n`, y `n:` seguido de barra invertida pasaba por
  // unidad—, así que enumera lo que sí puede precederla: principio de línea, espacio, comilla o
  // paréntesis.
  const ABSOLUTE = [/(?<![A-Za-z0-9])\/(?:home|Users|root)\//, /(?:^|[\s"'`(])[A-Za-z]:\\/]
  const names = (text) => ABSOLUTE.some((pattern) => pattern.test(text))
  // Dos comentarios de `workflows.test.js` cuentan qué dejaban pasar cuatro chequeos de Windows, y para
  // nombrarlo tienen que escribirlo. Se declara en vez de perdonarse.
  const DECLARED = new Set(['test/workflows/workflows.test.js'])
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  const found = []
  for (const file of tracked) {
    if (DECLARED.has(file)) continue
    read(file).split('\n').forEach((line, i) => {
      if (names(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
  }
  assert.deepEqual(found, [], `rutas absolutas:\n  ${found.join('\n  ')}`)
  // Una excepción que dejó de hacer falta manda a cuidar algo que ya nadie escribe, así que se retira
  // igual que un par aceptado que quedó huérfano.
  assert.deepEqual([...DECLARED].filter((file) => !names(read(file))), [], 'declarado y ya sin ruta')
})
