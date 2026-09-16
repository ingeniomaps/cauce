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
const { inRepo, sourceFiles } = require('../support/environment')

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
  'automatization/workflows/flow.js':
    'Un recorrido de equipo crece de a una salida —épica, informe, investigar— y cada una arma su '
    + 'destino al lado del schema que la valida, así que partirlo por salida separa el manifiesto de '
    + 'quien lo consume. Cruzó las 500 con la procedencia del INBOX (caso 115), estando en 498, y '
    + 'partirlo bien es un cambio propio y no la cola de otro.',
  'test/wiring/hooks.test.js':
    'El registro de guards suma un caso por guard, y cada caso prueba los dos lados de la misma '
    + 'decisión: qué bloquea y qué deja pasar. Partirlo por grupo separaría casos que comparten el '
    + 'montaje de una raíz ops y el helper que exige el motivo del bloqueo.',
  'test/wiring/runners.test.js':
    'Suma un caso por runner y, al lado, los que recorren los cuatro a la vez —que ningún comando de hook '
    + 'quede relativo al workspace, que ninguna ruta dé por sentado dónde se instala—. Partirla por runner '
    + 'rompe justo ésos, que existen para valer también sobre el adaptador que se agregue después, y todos '
    + 'los casos comparten el montaje de una raíz ops instalada. Cruzó las 500 con el aviso de sidecar del '
    + 'caso 138, estando en 491, y el 145 lo llevó a 550 con la razón medida de lo que el guard de rutas '
    + 'se saltea.',
  'test/planning/claims.test.js':
    'La coordinación de un equipo suma un caso por conducta y las comparte todas: una instancia con su '
    + 'cola, dos runners y un reclamo entre ellos. Partirla por tema separaría el reclamo de lo que el '
    + 'reclamo decide —a quién se le ofrece cada tarea—, que son las dos mitades de la misma decisión y '
    + 'que en esta rama cambiaron siempre juntas.',
  'test/agents/learning.test.js':
    'Las pruebas de un ciclo suman una por conducta y comparten el montaje —un cargo con su propuesta '
    + 'aplicada y su registro sin sellar—. Partirlas por tema separaría de qué material se abre una '
    + 'propuesta de qué pasa al aplicarla, que son las dos mitades del mismo recorrido.',
}

const PENDING_SPLIT = {}


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
test('ningún archivo del repositorio nombra la ruta absoluta de una máquina',
  { skip: !inRepo() && 'sin `.git` no hay corpus trackeado que recorrer' }, () => {
  const root = path.resolve(__dirname, '..', '..')
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
  // Los dos bordes son distintos porque este corpus es más ancho que el del vecino. El de la carpeta
  // personal descarta un dígito a la izquierda: la URL de ISO que citan dos cargos lleva ese tramo
  // adentro y no es la carpeta de nadie. El de la unidad no alcanza con descartar letras —`Aceptaci
  // [oó]n:` deja un corchete a la izquierda de la `n`, y `n:` seguido de barra invertida pasaba por
  // unidad—, así que enumera lo que sí puede precederla: principio de línea, espacio, comilla o
  // paréntesis.
  //
  // El temporal se nombra con el prefijo del harness y no con `/tmp/` a secas: los casos de evaluación
  // inventan `/tmp/ng-orphans.json` y `/tmp/cobros-tarifas.db`, que es justo lo que un caso tiene que
  // poder escribir. Lo que no es dato inventado es el directorio de una sesión, que lleva el proyecto
  // y el identificador de la corrida adentro del nombre.
  const ABSOLUTE = [
    /(?<![A-Za-z0-9])\/(?:home|Users|root)\//,
    /(?<![A-Za-z0-9])\/tmp\/claude-/,
    /(?:^|[\s"'`(])[A-Za-z]:\\/,
  ]
  const names = (text) => ABSOLUTE.some((pattern) => pattern.test(text))
  // Dos comentarios de `workflows.test.js` cuentan qué dejaban pasar cuatro chequeos de Windows, y para
  // nombrarlo tienen que escribirlo. Se declara en vez de perdonarse. El caso 050 documenta esta misma
  // prueba y pega la línea que la disparó, así que cae por lo mismo.
  const DECLARED = new Set([
    'test/workflows/workflows.test.js',
    'docs/issues/050-la-puerta-de-rutas-absolutas-corre-sobre-informes-generados.md',
  ])
  // El informe semanal es prosa que escribe un cargo, no fuente del proyecto, y uno que cita una ruta
  // para explicar su hallazgo rompía el PR de su propio informe: el arreglo era editar la evidencia por
  // una razón ajena a lo que investigó. Lo que esta prueba cuida sigue cubierto —el ciclo corre en un
  // runner efímero, así que la carpeta de nadie se escribe ahí—, y se exime el directorio y no cada
  // archivo porque crece solo, una vez por semana y por cargo. Los casos de `docs/issues/` no se eximen:
  // los escribe alguien que elige qué pegar.
  const GENERADO = /^agents\/roles\/system\/[^/]+\/learning\/reports\//
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  const found = []
  for (const file of tracked) {
    if (DECLARED.has(file) || GENERADO.test(file)) continue
    read(file).split('\n').forEach((line, i) => {
      if (names(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
  }
  assert.deepEqual(found, [], `rutas absolutas:\n  ${found.join('\n  ')}`)
  // Una excepción que dejó de hacer falta manda a cuidar algo que ya nadie escribe, así que se retira
  // igual que un par aceptado que quedó huérfano.
  assert.deepEqual([...DECLARED].filter((file) => !names(read(file))), [], 'declarado y ya sin ruta')
  // La exención se mide contra el árbol: un patrón que dejó de coincidir con dónde viven los informes
  // se ve igual que uno que funciona, porque las dos formas terminan sin eximir nada.
  const eximidos = tracked.filter((file) => GENERADO.test(file))
  assert.ok(eximidos.length > 0, 'el patrón ya no alcanza ningún informe: la exención quedó huérfana')
  assert.deepEqual(eximidos.filter((one) => !/\/reports\/[\d-]+\.md$/.test(one)), [], 'sólo informes')
})

// Ninguna prueba borra por su cuenta. El 2026-09-10 una lo hizo sobre la raíz de este repositorio —
// resolvió contra ella una salida que vino vacía y se la pasó a `rmSync` recursivo— y el repositorio
// entero desapareció de la máquina. Lo que se salvó estaba empujado; lo gitignoreado, no.
//
// Se comprueba la forma y no la intención, porque la intención era correcta: aquella prueba creía estar
// borrando su banco. Lo que falló fue de dónde salió la ruta, y eso no se ve leyendo la línea del
// borrado. `discard` es el único que borra, y sólo dentro de lo desechable.
//
// Dos archivos quedan afuera del barrido, por razones distintas: `environment.js` implementa `discard` y
// desmonta sus raíces al salir, y este mismo archivo escribe las líneas de ejemplo con las que se prueban
// los detectores. El costo de la segunda exención es nulo hoy y conviene decirlo: acá no hay una sola
// llamada real que escriba o borre — sólo se lee y se compara.
const SIN_BARRER = [path.join('test', 'support', 'environment.js'), path.join('test', 'repo', 'repo.test.js')]

// El argumento de un borrado puede traer paréntesis —`path.join(...)`— así que el corte no puede ser el
// primer `)`: con esa forma, la primera versión de este detector veía tres de siete.
const BORRA_RECURSIVO = /\brmSync\(.*recursive\s*:\s*true/

test('ninguna prueba borra recursivamente por su cuenta', () => {
  const root = path.resolve(__dirname, '..', '..')
  const propias = []
  for (const file of sourceFiles().filter((one) => one.includes(`${path.sep}test${path.sep}`))) {
    const name = path.relative(root, file)
    if (SIN_BARRER.includes(name)) continue
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (BORRA_RECURSIVO.test(line)) propias.push(`${name}:${index + 1}`)
    })
  }
  assert.deepEqual(propias, [], `usan \`discard\` de test/support/environment.js:\n  ${propias.join('\n  ')}`)
})

// Ninguna prueba **crea** nada bajo el home de quien la corre. Por qué eso importa lo dice el banco de
// `environment.js`, que es donde se decidió; acá se comprueba que nadie vuelva a abrirlo por su cuenta.
//
// Nombrar el home no es escribir en él: cuatro pruebas se lo pasan a un guard para que decida sobre esa
// ruta, y ninguna la crea. Por eso la condición mira las dos cosas juntas —la casa y una función que
// escribe— en vez de prohibir la palabra, que habría marcado lo correcto y enseñado a apagar la puerta.
const CREA = /\b(?:mkdtempSync|mkdirSync|cpSync|writeFileSync|copyFileSync)\s*\(/
test('ninguna prueba crea su banco bajo el home de quien la corre', () => {
  const root = path.resolve(__dirname, '..', '..')
  const caseros = []
  for (const file of sourceFiles().filter((one) => one.includes(`${path.sep}test${path.sep}`))) {
    const name = path.relative(root, file)
    if (SIN_BARRER.includes(name)) continue
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (/\bhomedir\(\)/.test(line) && CREA.test(line) && !/^\s*\/\//.test(line)) {
        caseros.push(`${name}:${index + 1}`)
      }
    })
  }
  assert.deepEqual(caseros, [], `crean su banco en el home:\n  ${caseros.join('\n  ')}`)
})

// Los dos detectores de arriba, contra líneas fabricadas. Un detector que deja de detectar convierte a su
// puerta en decorado sin que nada lo diga, y acá ya pasó: la primera versión de `BORRA_RECURSIVO` cortaba
// en el primer paréntesis y veía tres de las siete que había. Las dos direcciones van juntas porque un
// detector que marca todo pasaría la primera mitad y volvería inútil a la puerta.
test('los detectores de borrado y de home ven lo que tienen que ver', () => {
  const borran = [
    "fs.rmSync(dir, { recursive: true, force: true })",
    "fs.rmSync(path.join(target, 'flows'), { recursive: true, force: true })",
    "  await fs.promises.rmSync(x, { force: true, recursive: true })",
  ]
  for (const line of borran) assert.ok(BORRA_RECURSIVO.test(line), `no vio: ${line}`)
  for (const line of ["fs.rmSync(archivo)", "discard(path.join(dir, 'claims'))", "// habla de rmSync"]) {
    assert.equal(BORRA_RECURSIVO.test(line), false, `marcó de más: ${line}`)
  }

  assert.ok(CREA.test("const base = fs.mkdtempSync(path.join(os.homedir(), '.cache'))"))
  assert.ok(CREA.test("fs.writeFileSync(path.join(os.homedir(), 'x'), 'y')"))
  assert.equal(CREA.test("assert.ok(salida.includes(path.join(os.homedir(), '.claude')))"), false,
    'nombrar la casa para que un guard decida sobre ella no es crear nada ahí')
})

// El nombre de un banco decide si una prueba pasa, porque la suite aísla lo que cada una mide filtrando
// la salida de `check` por substring y esa salida empieza con la ruta absoluta del banco. Con el sufijo
// aleatorio que agregaba mkdtemp esa decisión era del azar: `/adr\//` casó `…-w1cadr/` y un error de
// `integrations` entró a una prueba de ADR (caso 085). Lo que se comprueba es la propiedad que lo
// impide —el nombre es el pedido más un número y nada más—, no la ausencia de aquel fallo, que no se
// puede volver a provocar a voluntad.
test('el nombre de un banco no trae nada que la prueba no haya pedido', () => {
  const { tempRoot, outsideTempRoot } = require('../support/environment')
  for (const [donde, hacer] of [['tempRoot', tempRoot], ['outsideTempRoot', outsideTempRoot]]) {
    const uno = hacer('cauce-nombre-de-banco-')
    const otro = hacer('cauce-nombre-de-banco-')
    for (const dir of [uno, otro]) {
      assert.match(path.basename(dir), /^cauce-nombre-de-banco-\d+$/,
        `${donde}: el nombre trae algo que nadie pidió — ${path.basename(dir)}`)
    }
    assert.notEqual(uno, otro, `${donde}: dos bancos con el mismo prefijo tienen que ser distintos`)
    assert.ok(fs.existsSync(uno) && fs.existsSync(otro), `${donde}: el banco existe en disco`)
  }

  // Y la forma concreta que costó una corrida: el filtro que una prueba de ADR usa para quedarse con lo
  // suyo no puede casar el nombre del banco.
  assert.equal(/adr\//.test(`${tempRoot('cauce-plantilla-adr-')}/integrations/config.json`), false,
    'un error ajeno no puede entrar por el nombre del banco')
})
