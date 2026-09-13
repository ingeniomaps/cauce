'use strict'

// Sujeto: `test/tools/dead-code.js`, el barrido de superficie muerta que corre en `ci`. Qué decide cada
// mitad y por qué se confirman al revés está en su encabezado; acá se fija que lo haga (caso 131).
//
// Hasta este caso no lo probaba nadie, y lo que vuelve peligrosa esa ausencia es la forma de su salida:
// sin hallazgos imprime `✓ ninguna superficie muerta` y sale 0, así que una herramienta rota y un
// repositorio limpio producen el mismo texto y el mismo código.
//
// Se ejercita sobre un árbol de juguete y no sobre este repositorio, porque `ROOT` cuelga de la ubicación
// del propio script: una copia en `<árbol>/test/tools/` lo resuelve a ese árbol sin tocar el fuente ni
// necesitar ninguna costura. Medido el 2026-09-13: el barrido entero de este repositorio —71 suites, 81
// archivos del motor, 1468 trackeados— tarda 235 ms, y el del árbol de juguete ~105 ms. El caso suponía
// que probarlo era caro por construcción; lo caro es **confirmar** un candidato, y sobre un árbol sano no
// se confirma ninguno.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempRoot, discard } = require('../support/environment')

const BARRIDO = path.resolve(__dirname, '..', 'tools', 'dead-code.js')

// `automatization/` va aunque el caso no lo use: `ENGINE` declara los dos directorios y `walk` los recorre
// sin preguntar si existen, así que sin él el script muere con `ENOENT` antes de barrer nada. Es conducta
// del producto y está fijada más abajo; acá sólo se monta la forma que el script asume.
function arbol(prefix, archivos) {
  const root = path.join(tempRoot(prefix), 'repo')
  for (const dir of ['test/tools', 'test/unidad', 'engine', 'automatization']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
  }
  fs.copyFileSync(BARRIDO, path.join(root, 'test', 'tools', 'dead-code.js'))
  fs.writeFileSync(path.join(root, 'automatization', 'nada.js'), "'use strict'\nmodule.exports = {}\n")
  for (const [relativo, texto] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(root, relativo), texto)
  }
  // Lo trackeado es el universo de `checkExports`: sin un índice de git ese barrido mide un árbol vacío.
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.email', 'a@b.c')
  git('config', 'user.name', 'P')
  git('add', 'engine', 'automatization', 'test')
  // El barrido se lanza sin `NODE_TEST_CONTEXT`, igual que hace `run()` en el arnés y por lo que `green()`
  // explica. `extra` existe para volver a ponerla: es el único caso que necesita la variable puesta.
  const limpio = { ...process.env }
  delete limpio.NODE_TEST_CONTEXT
  return { root, corrida: (extra = {}) => spawnSync(process.execPath, ['test/tools/dead-code.js'],
    { cwd: root, encoding: 'utf8', env: { ...limpio, ...extra } }) }
}

const VIVO = `'use strict'
const path = require('node:path')
function donde() { return path.join('a', 'b') }
module.exports = { donde }
`

// Que caza lo que tiene que cazar, del lado del motor: el conteo lo propone y la corrida lo confirma.
test('un import que nadie usa en el motor se acusa con su archivo y su línea', () => {
  const { root, corrida } = arbol('cauce-muerta-motor-', {
    'engine/vivo.js': `'use strict'
const path = require('node:path')
const sobra = require('node:url')
function donde() { return path.join('a', 'b') }
module.exports = { donde }
`,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
test('anda', () => { assert.ok(donde().length > 0) })
`,
  })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /✗ 1 sin uso/)
  assert.match(done.stdout, /engine\/vivo\.js:3 sobra/)
})

// Y del lado de las suites, que se confirma distinto: contra su propio archivo y no contra la suite entera.
test('un import que nadie usa en una suite se acusa contra su propia corrida', () => {
  const { root, corrida } = arbol('cauce-muerta-suite-', {
    'engine/vivo.js': VIVO,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
const sobraAqui = require('node:url')
test('anda', () => { assert.ok(donde().length > 0) })
`,
  })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /test\/unidad\/vivo\.test\.js:5 sobraAqui/)
  assert.match(done.stdout, /1 candidato\(s\) en 1 suite\(s\), 1 corrida\(s\)/)
})

// La mitad cara, y la razón por la que el conteo se equivoca sólo hacia un lado: un falso positivo manda a
// borrar código vivo. Las tres formas de «sí se usa» van juntas porque la que importa es la tercera —el
// nombre que aparece únicamente dentro de un string—, que hasta este caso vivía sólo en un comentario.
test('no acusa lo que sí se usa, ni siquiera si el nombre sólo aparece en un string', () => {
  const { root, corrida } = arbol('cauce-muerta-vivos-', {
    'engine/vivo.js': VIVO,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
const os = require('node:os')
const fs = require('node:fs')
const soloEnString = require('node:url')

test('usado varias veces', () => {
  assert.ok(donde().length > 0)
  assert.ok(os.tmpdir().length > 0)
})
test('usado una sola vez', () => { assert.equal(typeof fs.existsSync, 'function') })
test('mencionado sólo dentro de un string', () => { assert.equal('soloEnString', 'soloEnString') })
`,
  })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /✓ ninguna superficie muerta/)
})

// La otra mitad, la que decide por búsqueda y no por corrida — el porqué de ese orden está en el
// encabezado del script.
test('un export que ningún archivo nombra se acusa', () => {
  const { root, corrida } = arbol('cauce-muerta-export-', {
    'engine/vivo.js': `'use strict'
const path = require('node:path')
function donde() { return path.join('a', 'b') }
function nadieMeNombra() { return 1 }
module.exports = { donde, nadieMeNombra }
`,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
test('anda', () => { assert.ok(donde().length > 0) })
`,
  })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /engine\/vivo\.js :: nadieMeNombra/)
})

// La diferencia entre «medí y no había» y «no medí», que el script ya distingue y nadie comprobaba.
test('con la suite rota lo dice en vez de informar un barrido limpio', () => {
  const { root, corrida } = arbol('cauce-muerta-ciega-', {
    'engine/vivo.js': `'use strict'
const path = require('node:path')
function donde() { return path.join('a', 'b') }
function nadieMeNombra() { return 1 }
module.exports = { donde, nadieMeNombra }
`,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
test('anda', () => { assert.ok(donde().length > 0) })
`,
    'test/unidad/rota.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
test('falla a propósito', () => { assert.equal(1, 2) })
`,
  })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /⚠ sin confirmar: la suite no está verde/)
  assert.doesNotMatch(done.stdout, /✓ ninguna superficie muerta/)
})

// El caso que descubrió el defecto, y el que obliga a `green()` a limpiar su entorno: el porqué vive ahí.
// Acá se ejerce desde afuera —lanzando el barrido con la variable puesta, que es lo que le pasa a
// cualquier hijo de `node --test`— y se exige que siga distinguiendo una suite rota de una verde.
test('la corrida interna no hereda el contexto del runner que la lanzó', () => {
  const { root, corrida } = arbol('cauce-muerta-contexto-', {
    'engine/vivo.js': `'use strict'
const path = require('node:path')
function donde() { return path.join('a', 'b') }
function nadieMeNombra() { return 1 }
module.exports = { donde, nadieMeNombra }
`,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
test('anda', () => { assert.ok(donde().length > 0) })
`,
    'test/unidad/rota.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
test('falla a propósito', () => { assert.equal(1, 2) })
`,
  })
  const done = corrida({ NODE_TEST_CONTEXT: 'child' })
  discard(path.dirname(root))
  assert.match(done.stdout, /⚠ sin confirmar: la suite no está verde/)
  assert.doesNotMatch(done.stdout, /✗ 1 sin uso/)
})

// Y la conducta que `arbol()` da por supuesta al crear el directorio, fijada sin cambiarla: acá se mide
// que el barrido muera en vez de barrer lo que hay, para que tolerarlo alguna vez sea una decisión y no
// un descuido (caso 131).
test('si falta un directorio del universo declarado, muere en vez de barrer lo que hay', () => {
  const { root, corrida } = arbol('cauce-muerta-sin-dir-', {
    'engine/vivo.js': VIVO,
    'test/unidad/vivo.test.js': `'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { donde } = require('../../engine/vivo')
test('anda', () => { assert.ok(donde().length > 0) })
`,
  })
  discard(path.join(root, 'automatization'))
  const done = corrida()
  discard(path.dirname(root))
  assert.notEqual(done.status, 0, 'no se queda callado')
  assert.match(done.stderr, /ENOENT/)
  assert.doesNotMatch(done.stdout, /ninguna superficie muerta/)
})
