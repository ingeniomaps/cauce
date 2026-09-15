'use strict'

// Sujeto: `test/tools/coverage-files.js`, la herramienta que juzga el piso de cobertura de cada archivo.
// Acá se mide qué hace con la **distancia** entre un piso y lo que el archivo mide: un piso muy por
// debajo de lo real deja pasar la pérdida de pruebas enteras y la puerta sigue en verde, que es
// exactamente lo que la puerta existía para evitar (caso 129).
//
// Nada de esto corre la suite ni mide cobertura de verdad. El lcov se arma acá dándole a cada archivo
// **exactamente su piso**, así que la única diferencia entre una corrida y otra es el número que mueve
// el caso. Medir de verdad costaría noventa segundos por caso y traería la varianza de V8 adentro de la
// aserción, que es lo contrario de lo que una prueba de esta regla necesita.
//
// Los cinco casos del final son las conductas que la herramienta ya tenía cuando el 129 le puso su
// primera prueba, y que esa prueba no aserciaba: se podían silenciar las cuatro con la suite en verde
// (caso 130). La razón no era el olvido de un caso suelto sino la forma de este arnés —cada archivo mide
// exactamente su piso, así que ninguna de esas situaciones ocurre por construcción—, y por eso `corrida`
// tiene dos mitades: `cambiar` mueve el piso después de escribir el lcov, y `medir` mueve lo medido antes.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempRoot, discard } = require('../support/environment')

const ROOT = path.resolve(__dirname, '..', '..')
const TOOL = path.join(ROOT, 'test', 'tools', 'coverage-files.js')
const REAL = path.join(ROOT, 'test', 'tools', 'coverage-baseline.json')

const floors = () => JSON.parse(fs.readFileSync(REAL, 'utf8'))

// Un lcov que hace medir a cada archivo su propio piso. Con cien como denominador el porcentaje sale
// exacto —`Math.floor(hit / 100 * 100)`—, así que no hay redondeo que confunda un caso con otro.
function lcovOf(registro) {
  const record = (file, metrics) => `SF:${file}\nLF:100\nLH:${metrics.lines}\n`
    + `BRF:100\nBRH:${metrics.branches}\nFNF:100\nFNH:${metrics.functions}\nend_of_record\n`
  return Object.entries(registro).map(([file, metrics]) => record(file, metrics)).join('')
}

// `cambiar` toca el registro **después** de escribir el lcov, así que mueve el piso y no lo medido, que
// es lo que hace aparecer una distancia. `medir` es la otra mitad y corre antes: lo que saque de ahí deja
// de estar en el lcov sin dejar de tener piso, que es el único caso que no se puede montar con el primero.
function corrida(cambiar, medir = () => {}) {
  const dir = tempRoot('cauce-pisos-')
  const registro = floors()
  const medido = floors()
  medir(medido)
  const lcov = path.join(dir, 'medido.info')
  fs.writeFileSync(lcov, lcovOf(medido))
  cambiar(registro)
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(registro, null, 2)}\n`)
  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`], { encoding: 'utf8' })
  discard(dir)
  return { code: done.status, out: `${done.stdout || ''}${done.stderr || ''}` }
}

test('con cada archivo en su piso exacto, la puerta pasa', () => {
  const { code, out } = corrida(() => {})
  assert.equal(code, 0, out)
  assert.match(out, /cobertura por archivo/)
})

// El lado que falla. Qué pérdida concreta quedaba pasando con un piso así de lejos —y con qué archivo se
// midió— está en el encabezado de `coverage-files.js`, donde vive el umbral.
test('un piso muy por debajo de lo que el archivo mide falla, y dice cuánto', () => {
  const { code, out } = corrida((registro) => { registro['engine/cli/ops.js'].branches -= 30 })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/cli\/ops\.js: branches/)
  assert.match(out, /30 puntos por encima de su piso/)
})

// El borde, que es la mitad que nadie escribe: una prueba que sólo mirara el lado que falla dejaría pasar
// una puerta que frena de más, y ésa se apaga igual de rápido que la que no frena nunca. De dónde sale el
// número y contra qué se midió está en el encabezado de `coverage-files.js`, al lado de la constante.
test('una distancia de exactamente el umbral todavía pasa', () => {
  const { code, out } = corrida((registro) => { registro['engine/cli/ops.js'].branches -= 25 })
  assert.equal(code, 0, out)
})

// La distancia que tiene una causa conocida —subprocesos, `fail()`— no se cierra escribiendo pruebas, y
// obligarlo sería mandar a trabajar sobre algo que no va a moverse. Se acepta a mano y por escrito, al
// lado del piso que excusa, igual que `JUSTIFIED` en `repo.test.js`.
test('una razón escrita acepta la distancia', () => {
  const { code, out } = corrida((registro) => {
    registro['engine/cli/ops.js'].branches -= 30
    registro['engine/cli/ops.js'].far = { branches: 'sus ramas de error sólo se ejercitan lanzando el comando' }
  })
  assert.equal(code, 0, out)
})

// Por qué la razón escrita tiene que sobrevivir a `coverage:update` lo explica el propio `--update`, en
// `coverage-files.js`. Acá se fija esa conducta, que es lo único que aquel comentario no puede hacer: da
// por hecho que alguien la va a notar si se rompe, y el diff de un archivo generado no la delata.
test('actualizar el registro no se lleva puesta la razón escrita', () => {
  const dir = tempRoot('cauce-pisos-update-')
  const registro = floors()
  const lcov = path.join(dir, 'medido.info')
  fs.writeFileSync(lcov, lcovOf(registro))
  registro['engine/cli/ops.js'].far = { branches: 'sus ramas de error sólo se ejercitan lanzando el comando' }
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(registro, null, 2)}\n`)

  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`, '--update'], { encoding: 'utf8' })
  assert.equal(done.status, 0, `${done.stdout || ''}${done.stderr || ''}`)
  const after = JSON.parse(fs.readFileSync(baseline, 'utf8'))
  discard(dir)
  assert.deepEqual(after['engine/cli/ops.js'].far,
    { branches: 'sus ramas de error sólo se ejercitan lanzando el comando' })
  assert.equal(after['engine/cli/ops.js'].branches, registro['engine/cli/ops.js'].branches,
    'el piso no se movió: lo único que esta prueba mira es que la razón sobreviva')
})

// Y se cierra sola, por lo mismo que el registro de archivos largos retira una entrada que dejó de hacer
// falta —la razón está en `repo.test.js`, sobre `JUSTIFIED`, y ahí nombra a este registro como el caso
// análogo—. Acá se prueba esa conducta para el piso, que es lo que aquel comentario da por existente.
test('una razón que ya no hace falta falla, para que no quede anotada después de pagarla', () => {
  const { code, out } = corrida((registro) => {
    registro['engine/cli/ops.js'].far = { branches: 'una razón que quedó vieja' }
  })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/cli\/ops\.js: branches/)
  assert.match(out, /sacá la razón del registro/)
})

// La razón de existir del archivo: una regresión de cobertura. `SLACK` vale 1, así que la caída tiene que
// pasarse de la holgura para contar.
test('un piso que baja más que la holgura falla, nombrando el archivo y los dos números', () => {
  const { code, out } = corrida(() => {}, (medido) => { medido['engine/cli/ops.js'].branches -= 2 })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/cli\/ops\.js: branches bajó de \d+% a \d+%/)
})

// La otra mitad del borde, y la que nadie escribe: dentro de la holgura **pasa**. Sin este caso, subir
// `SLACK` a diez no rompería nada y la puerta dejaría de ver una regresión de nueve puntos.
test('una caída de exactamente la holgura todavía pasa', () => {
  const { code, out } = corrida(() => {}, (medido) => { medido['engine/cli/ops.js'].branches -= 1 })
  assert.equal(code, 0, out)
})

// Lo que evita que un módulo nuevo entre sin una sola prueba: está en el disco y nadie le registró piso.
test('un archivo del motor sin piso registrado falla', () => {
  const { code, out } = corrida((registro) => { delete registro['engine/cli/ops.js'] })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/cli\/ops\.js: sin piso registrado/)
})

// Tiene piso y no aparece en la medición: o nadie lo carga, o el lcov se generó sobre otro árbol. Las dos
// son razones para frenar, porque un piso que nadie mide no protege nada.
test('un piso cuyo archivo no aparece en el lcov falla', () => {
  const { code, out } = corrida(() => {}, (medido) => { delete medido['engine/cli/ops.js'] })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/cli\/ops\.js: tiene piso pero ningún test lo carga/)
})

// Y el huérfano: el archivo se borró y su piso quedó. `onDisk()` sólo devuelve `.js` bajo `engine/` y
// `automatization/`, así que este nombre no puede aparecer ahí por accidente.
test('un piso de un archivo que ya no existe falla', () => {
  const { code, out } = corrida((registro) => {
    registro['engine/borrado-hace-tiempo.js'] = { lines: 90, branches: 90, functions: 90 }
  })
  assert.equal(code, 1, out)
  assert.match(out, /engine\/borrado-hace-tiempo\.js: tiene piso y ya no existe/)
})

// El 149, cuya razón vive en `coverage-files.js` junto al guard. Acá sólo lo que el caso mide: se saca
// **un** archivo del lcov y se deja todo lo demás intacto, porque con la cantidad como criterio un
// registro de 68 que baja a 67 pasaría y el defecto seguiría entrando por ahí.
test('actualizar con un archivo sin medir se niega en vez de borrarlo del registro', () => {
  const dir = tempRoot('cauce-pisos-perdido-')
  const registro = floors()
  const medido = floors()
  const perdido = 'engine/cli/ops.js'
  delete medido[perdido]
  const lcov = path.join(dir, 'medido.info')
  fs.writeFileSync(lcov, lcovOf(medido))
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(registro, null, 2)}\n`)

  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`, '--update'], { encoding: 'utf8' })
  const out = `${done.stdout || ''}${done.stderr || ''}`
  const after = JSON.parse(fs.readFileSync(baseline, 'utf8'))
  discard(dir)

  assert.equal(done.status, 1, out)
  assert.match(out, new RegExp(perdido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'y nombra el archivo perdido')
  assert.doesNotMatch(out, /✓ piso registrado/, 'sin anunciar un registro que habría perdido pisos')
  // Lo que de verdad importa: el registro sigue entero. Negarse y escribir igual sería peor que no mirar.
  assert.equal(Object.keys(after).length, Object.keys(registro).length,
    'el registro no se tocó: la negativa ocurre antes de escribir')
})

// La otra mitad del guard, y la que decide que no necesite escapatoria: un archivo que tenía piso y ya
// **no está en disco** es un retiro legítimo, así que registrar tiene que seguir funcionando. Sin el
// filtro por `onDisk()` esta negativa se volvería imposible de satisfacer al borrar un archivo del motor.
test('actualizar tras retirar un archivo del motor sigue registrando', () => {
  const dir = tempRoot('cauce-pisos-retiro-')
  const registro = floors()
  // Un piso de un archivo que no existe en `engine/` ni en `automatization/`: el retiro ya ocurrido.
  registro['engine/se-retiro-de-verdad.js'] = { lines: 90, branches: 80, functions: 90 }
  const medido = floors()
  const lcov = path.join(dir, 'medido.info')
  fs.writeFileSync(lcov, lcovOf(medido))
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(registro, null, 2)}\n`)

  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`, '--update'], { encoding: 'utf8' })
  const out = `${done.stdout || ''}${done.stderr || ''}`
  const after = JSON.parse(fs.readFileSync(baseline, 'utf8'))
  discard(dir)
  assert.equal(done.status, 0, out)
  assert.equal(after['engine/se-retiro-de-verdad.js'], undefined,
    'y el piso huérfano sale del registro, que es para lo que se corre --update tras un retiro')
})

// El contraste, que es lo que separa una negativa útil de una que molesta siempre: una corrida completa
// —cada archivo del registro medido— sigue registrando sin ruido.
test('actualizar con todo medido sigue registrando', () => {
  const dir = tempRoot('cauce-pisos-completo-')
  const registro = floors()
  const lcov = path.join(dir, 'medido.info')
  fs.writeFileSync(lcov, lcovOf(registro))
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(registro, null, 2)}\n`)

  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`, '--update'], { encoding: 'utf8' })
  const out = `${done.stdout || ''}${done.stderr || ''}`
  discard(dir)
  assert.equal(done.status, 0, out)
  assert.match(out, /✓ piso registrado/, 'la corrida sana no se ve afectada por el guard nuevo')
})

// Que `--update` se niegue cuando no midió nada. Por qué esa negativa existe lo explica `coverage-files.js`,
// junto al `if` que la aplica; acá se fija que ocurra, con el lcov vacío que la dispara.
test('actualizar sobre un lcov sin archivos se niega en vez de anunciar éxito', () => {
  const dir = tempRoot('cauce-pisos-vacio-')
  const lcov = path.join(dir, 'vacio.info')
  fs.writeFileSync(lcov, '')
  const baseline = path.join(dir, 'baseline.json')
  fs.writeFileSync(baseline, `${JSON.stringify(floors(), null, 2)}\n`)
  const done = spawnSync(process.execPath, [TOOL, lcov, `--baseline=${baseline}`, '--update'], { encoding: 'utf8' })
  const out = `${done.stdout || ''}${done.stderr || ''}`
  discard(dir)
  assert.equal(done.status, 1, out)
  assert.match(out, /ningún archivo/, 'dice por qué se niega')
  assert.doesNotMatch(out, /✓ piso registrado/, 'y no se felicita sobre cero archivos')
})

// La otra mitad del 144, en el script: al **registrar** un piso las corridas existen para producir el
// lcov y su veredicto no decide, pero eso no puede volverse «ignorar el exit y seguir». Lo que se
// comprueba es el contenido, que es lo único que distingue una suite que falló de una que no llegó a
// correr.
//
// Esta prueba miraba el texto del script y por eso no vio el 148: exigía el `|| true` escrito, que es
// justo lo que dejaba `npm run ci` en verde con la suite en rojo. Lo que se mira ahora es que la
// tolerancia esté **acotada al modo que la necesita**; que el veredicto sea el correcto en cada uno lo
// mide la prueba de abajo, ejecutando el script.
test('coverage.sh mide por el contenido del lcov, y sólo al registrar ignora el exit', () => {
  const script = fs.readFileSync(path.join(ROOT, 'test', 'tools', 'coverage.sh'), 'utf8')
  assert.match(script, /\|\|\s*estado=\$\?|set \+e/, 'el exit de node --test se captura en vez de cortar')
  assert.match(script, /-s\s+"\$lcov"|\[ -s /, 'y se exige que el lcov traiga contenido')
  assert.match(script, /-z "\$registrando" \] && \[ "\$estado" -ne 0/,
    'y fuera de --update una suite en rojo corta la corrida')
  // El `trap` se lleva los lcov al abortar, así que hoy ni siquiera queda el material para reintentar a
  // mano desde donde murió. Lo que se conserva es lo que ya se midió.
  assert.doesNotMatch(script, /trap limpiar EXIT/, 'la limpieza deja de correr en el camino de error')
})

// Lo que se controla es el exit de la suite, que es la única variable que este arreglo mira. Un `node`
// interpuesto en el `PATH` lo finge y escribe un lcov mínimo; todo lo que no es `--test` lo delega al
// node real, así que la puerta de pisos que corre después sigue siendo la de verdad y no una maqueta.
//
// La otra forma era un banco de juguete, y se descartó con números: `coverage.sh` abre con
// `hooks-smoke.sh`, que baja por `run-hook.sh` a `engine/hooks/run.js` y sus seis módulos —unas 1.900
// líneas del motor— sólo para que la línea 9 no reviente. Mediría peor y costaría más.
const conSuite = (repo, salida) => {
  const bin = path.join(repo, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'node'), [
    '#!/usr/bin/env bash',
    'for a in "$@"; do [ "$a" = "--test" ] && suite=1; done',
    `if [ -z "\${suite:-}" ]; then exec ${JSON.stringify(process.execPath)} "$@"; fi`,
    'dest=""; prev=""',
    'for a in "$@"; do',
    '  case "$prev" in --test-reporter-destination) dest="$a";; esac',
    '  case "$a" in --test-reporter-destination=*) dest="${a#*=}";; esac',
    '  prev="$a"',
    'done',
    // El lcov tiene que cubrir **todo** el registro, no un archivo suelto: desde el 149, registrar con
    // archivos sin medir se niega, y un lcov corto haría fallar a `--update` por esa otra razón. Lo que
    // esta prueba controla es el exit de la suite, así que todo lo demás se deja sano.
    `[ -n "$dest" ] && cat > "$dest" <<'LCOV'`,
    lcovOf(floors()).trimEnd(),
    'LCOV',
    `exit ${salida}`,
    '',
  ].join('\n'), { mode: 0o755 })
  return `${bin}${path.delimiter}${process.env.PATH}`
}

// El 148: `npm run ci` salía en verde con seis pruebas en rojo, porque la suite entra a la puerta sólo
// por acá y el `|| true` la tapaba. Esto ejecuta el script en vez de leerlo — el defecto no era el texto
// sino lo que ese texto hace, y otra redacción igual de ciega volvería a pasar.
//
// Se distingue por el **mensaje** y no por el código de salida: con la suite en verde el script sigue de
// largo hasta la puerta de pisos, que sobre un lcov de un solo archivo falla por su cuenta. Los dos
// caminos terminan en 1 y lo que los separa es cuál de los dos rojos se anuncia.
test('una prueba en rojo frena la puerta, y al registrar un piso no', { skip: process.platform === 'win32' }, () => {
  // Se corre dentro de una copia y no sobre el árbol de trabajo (R23): el script resuelve todo por rutas
  // relativas al cwd y sólo propaga su primer argumento, así que no hay forma de apuntarle un registro
  // desechable desde acá y `--update` escribiría el del repositorio. Sin la copia, esta prueba mutila
  // `coverage-baseline.json` de 68 archivos a 1 y las otras cuatro de este archivo empiezan a fallar por
  // un registro que nadie tocó a mano.
  //
  // Y la copia se arma con `git ls-files`, que es lo que define el árbol, así que hace falta un `.git`:
  // corrida dentro de una copia que no lo tenga no hay de dónde copiar, y el salto lo dice en vez de
  // fallar por el entorno. Son **siete** las suites de este repositorio que no corren sin `.git`, ésta
  // incluida, y es la única que lo declara: las otras seis fallan con un mensaje que habla de otra cosa.
  const enRepo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' })
  if (enRepo.status !== 0) return
  const repo = tempRoot('cauce-148-')
  const copiado = spawnSync('bash', ['-c',
    `cd ${JSON.stringify(enRepo.stdout.trim())} && git ls-files -z | xargs -0 tar cf - `
    + `| (cd ${JSON.stringify(repo)} && tar xf -)`],
  { encoding: 'utf8' })
  assert.equal(copiado.status, 0, `no se pudo copiar el árbol trackeado: ${copiado.stderr}`)
  const correr = (salida, ...args) => spawnSync('bash', ['test/tools/coverage.sh', ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: conSuite(repo, salida) },
  })
  const salida = (hecho) => `${hecho.stdout || ''}${hecho.stderr || ''}`

  // Suite en rojo, comprobando: corta antes de mirar cobertura, y dice de qué es el rojo.
  const rojo = correr(1)
  assert.notEqual(rojo.status, 0, 'con la suite en rojo la puerta tiene que frenar')
  assert.match(salida(rojo), /pruebas en rojo/, 'y nombrar la suite, no la cobertura')
  assert.doesNotMatch(salida(rojo), /piso de cobertura/, 'sin llegar a juzgar pisos sobre una suite rota')

  // Suite en verde: el corte nuevo no se mete en el camino y la puerta de pisos decide como siempre.
  const verde = correr(0)
  assert.doesNotMatch(salida(verde), /pruebas en rojo/, 'una suite verde no dispara el corte')
  assert.match(salida(verde), /cobertura por archivo/, 'y el veredicto vuelve a ser el de los pisos')
  assert.equal(verde.status, 0, `con la suite verde y los pisos en su lugar, la puerta pasa: ${salida(verde)}`)

  // La mitad que el 144 ganó y que este arreglo no puede perder: registrar sigue siendo posible con la
  // suite en rojo, que es justo cuando hace falta —al agregar un archivo sin piso—.
  const registrando = correr(1, '--update')
  assert.equal(registrando.status, 0, `registrar un piso con la suite en rojo: ${salida(registrando)}`)
  assert.match(salida(registrando), /piso registrado/, 'y el registro ocurre de verdad')
  discard(repo)
})
