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
