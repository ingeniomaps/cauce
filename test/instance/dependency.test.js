'use strict'

// Cómo una instancia declara el motor en su `package.json`: las respuestas de borde. Vive aparte de las
// pruebas del ciclo de vida porque `init`, `upgrade` y `destroy` sólo ejercitan el camino feliz —medido
// antes de escribir esto: 36 % de ramas—, y lo que nadie tocaba son las que deciden si el repositorio
// anfitrión conserva lo suyo: manifiesto ausente, ilegible, o sin la clave del motor.
//
// Se importa el módulo en vez de correr el comando, como hace `upgrade-report.test.js` con su vecino: lo
// que puede equivocarse es la decisión, no el comando que la imprime. La única que no se puede probar así
// es `declareEngine` sobre un manifiesto inválido, porque termina en `fail()` —`console.error` y
// `process.exit`—, así que ésa va por subproceso.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempRoot, run } = require('../support/environment')

const D = require('../../engine/cli/dependency')

function manifestWith(dir, pkg) {
  const file = path.join(dir, 'package.json')
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  return file
}
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

// Las dos ausencias, que se responden distinto: sin archivo no hay nada que reponer y sin lectura posible
// hay algo que decir. Por qué, en `pinEngine`.
test('pinEngine no inventa un package.json, y un ilegible lo dice en vez de adivinar', () => {
  const dir = tempRoot('cauce-dep-pin-')
  assert.equal(D.pinEngine(dir, '1.0.0'), null, 'sin manifiesto no hay nada que reponer')
  assert.equal(fs.existsSync(path.join(dir, 'package.json')), false, 'y no se crea uno')

  fs.writeFileSync(path.join(dir, 'package.json'), '{ esto no es json\n')
  assert.equal(D.pinEngine(dir, '1.0.0'), 'ilegible')
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), '{ esto no es json\n',
    'y el archivo roto se deja como estaba')
})

// Las tres respuestas de `pinEngine` sobre un manifiesto legible, que es donde se decide si el archivo se
// reescribe o no. Qué problema resuelve reponer el pin, en `pinEngine`.
test('pinEngine repone sólo cuando la versión declarada cambió', () => {
  const dir = tempRoot('cauce-dep-pin-rango-')
  const sinBloque = manifestWith(dir, { name: 'app' })
  assert.equal(D.pinEngine(dir, '1.0.0'), null, 'un manifiesto sin devDependencies no tiene pin que reponer')
  assert.deepEqual(read(sinBloque), { name: 'app' }, 'y no se le agrega el bloque')

  const file = manifestWith(dir, { name: 'app', devDependencies: { typescript: '^5' } })
  assert.equal(D.pinEngine(dir, '1.0.0'), null, 'sin la clave del motor no hay pin que reponer')
  assert.deepEqual(read(file).devDependencies, { typescript: '^5' }, 'y no se le agrega')

  manifestWith(dir, { name: 'app', devDependencies: { '@ingeniomaps/cauce': '1.0.0' } })
  assert.equal(D.pinEngine(dir, '1.0.0'), null, 'ya exacta: no hay nada que devolver')

  manifestWith(dir, { name: 'app', devDependencies: { '@ingeniomaps/cauce': '^1.0.0' } })
  assert.equal(D.pinEngine(dir, '1.0.0'), '^1.0.0', 'devuelve el rango que npm había dejado')
  assert.equal(read(file).devDependencies['@ingeniomaps/cauce'], '1.0.0', 'y lo clava exacto')
})

// La inversa de `declareEngine` saca su clave y nada más. Acá pesan las aserciones de ausencia: lo que hay
// que comprobar es que la clave **se fue**, no sólo que el archivo siga estando.
test('undeclareEngine no toca un manifiesto que no declaró el motor', () => {
  const dir = tempRoot('cauce-dep-undeclare-')
  assert.deepEqual(D.undeclareEngine(path.join(dir, 'package.json')), [],
    'sin manifiesto no hay nada que sacar')

  const sinDev = manifestWith(dir, { name: 'app', version: '1.4.0' })
  assert.deepEqual(D.undeclareEngine(sinDev), [], 'sin devDependencies tampoco')
  assert.deepEqual(read(sinDev), { name: 'app', version: '1.4.0' }, 'y queda intacto')

  const ajeno = manifestWith(dir, { name: 'app', devDependencies: { typescript: '^5' } })
  assert.deepEqual(D.undeclareEngine(ajeno), [], 'con dependencias ajenas y sin la nuestra, nada')
  assert.deepEqual(read(ajeno).devDependencies, { typescript: '^5' }, 'las del anfitrión no se tocan')

  fs.writeFileSync(path.join(dir, 'roto.json'), '{ esto no es json\n')
  assert.deepEqual(D.undeclareEngine(path.join(dir, 'roto.json')), [], 'un manifiesto ilegible no se toca')
})

// El otro lado del borrado: el manifiesto que queda sin dependencias pero no es el que `init` creó. Lo
// que se mide acá es que sobreviva, y con qué adentro; el criterio está en `undeclareEngine`.
test('undeclareEngine conserva el archivo cuando el anfitrión tiene algo suyo', () => {
  const dir = tempRoot('cauce-dep-conserva-')
  const file = manifestWith(dir, {
    name: 'app', version: '1.4.0', scripts: { build: 'tsc' },
    devDependencies: { '@ingeniomaps/cauce': '1.0.0' },
  })
  assert.deepEqual(D.undeclareEngine(file),
    ['package.json: se quitó la dependencia del motor y el resto queda como estaba'])

  const pkg = read(file)
  assert.equal('@ingeniomaps/cauce' in (pkg.devDependencies || {}), false, 'la clave se fue')
  assert.equal('devDependencies' in pkg, false, 'y el bloque vacío se va con ella')
  assert.deepEqual(pkg.scripts, { build: 'tsc' }, 'los scripts de alguien siguen ahí')
  assert.equal(fs.existsSync(file), true, 'el archivo es del anfitrión y no se borra')
})

// Esta rama termina en `fail()`, así que se prueba por comando y no importando: es además como la vive
// quien la encuentra.
test('declarar el motor sobre un package.json inválido lo dice y no lo pisa', () => {
  const dir = tempRoot('cauce-dep-roto-')
  const repo = path.join(dir, 'app')
  fs.mkdirSync(repo, { recursive: true })
  fs.writeFileSync(path.join(repo, 'package.json'), '{ esto no es json\n')

  const hecho = run(['init', repo, '--name', 'App', '--mode', 'embedded', '--force'])
  assert.equal(hecho.status, 1, hecho.stdout)
  assert.match(hecho.stderr + hecho.stdout, /package\.json inválido/)
  assert.equal(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), '{ esto no es json\n',
    'el archivo del anfitrión se deja como estaba')
})
