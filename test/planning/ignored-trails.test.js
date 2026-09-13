'use strict'

// Qué avisa `check` sobre los rastros locales que Cauce escribe en la instancia. Por qué la línea que
// los cubre no llega a una instancia que ya existe, y por qué se pregunta por el efecto en vez del
// texto, está en `core/trails.js`.
//
// Las cuatro respuestas que se miden son: sin repositorio, cubierto, sin cubrir, y la topología sidecar
// —el `.gitignore` en la instancia y el repositorio una carpeta más arriba—, que es la que rompería un
// aviso que resolviera mal la raíz.
//
// Y una quinta: **a quién no le toca la pregunta**. `check` recibe un directorio de planning y mira a su
// padre, que en una instancia es la instancia y en el molde de este repositorio es `template/`. Cuáles son
// las raíces a las que no les toca, y por qué se decide por el modo declarado en vez de por el nombre de
// la carpeta, está en `core/trails.js` junto a la constante que lo implementa. Acá se mide una por caso,
// porque una conducta nombrada en un comentario y no fijada por una prueba es lo que el 130 destapó.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Se reconoce el aviso por su forma y no por las rutas que nombra. Filtrar por la ruta deja pasar el
// mensaje degenerado —«0 rastro(s) … ()»—, que es lo que un aviso roto produce cuando avisa de nada: la
// prueba de «se calla» pasaba creyendo que no hubo aviso, y la mutación que avisa siempre sobrevivía.
const RASTROS = /rastro\(s\) local\(es\)/
const avisos = (planning) => JSON.parse(run(['check', planning, '--json']).stdout)
  .warnings.filter((one) => RASTROS.test(one))
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

function instancia(prefix, modo = 'sidecar') {
  const target = path.join(tempRoot(prefix), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', modo, '--no-install']).status, 0)
  return { target, planning: path.join(target, 'planning') }
}

// Una raíz que **no** es una instancia, montada desde una que sí lo es: así el `planning/` es el real y lo
// único que cambia es lo que la raíz declara de sí misma, que es justo lo que se está midiendo. `tocar`
// recibe la ruta del `ops.config.json` y lo deja como el caso necesite.
function sinModoReal(prefix, tocar) {
  const { target, planning } = instancia(prefix)
  tocar(path.join(target, 'ops.config.json'))
  fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules/\n')
  git(target, 'init', '-q')
  return planning
}

// Las dos formas de callarse, juntas porque se confunden: no tener a quién preguntarle, y preguntarle y
// que conteste que sí. Sin esta prueba, un aviso que saltara siempre daría el mismo verde que el correcto.
test('el aviso se calla sin repositorio, y también cuando la línea está', () => {
  const { target, planning } = instancia('cauce-rastros-cubiertos-')
  fs.writeFileSync(path.join(target, '.gitignore'), '')
  assert.deepEqual(avisos(planning), [], 'sin repositorio no se inventa un aviso')

  // Con repositorio y con las líneas que el molde trae, tampoco hay nada que decir.
  fs.copyFileSync(path.resolve(__dirname, '..', '..', 'template', 'gitignore'),
    path.join(target, '.gitignore'))
  git(target, 'init', '-q')
  assert.deepEqual(avisos(planning), [], 'cubiertos por el .gitignore que trae el molde')
})

// El caso: una instancia creada antes de que el rastro existiera no tiene su línea, y `upgrade` no se la
// va a traer nunca. Lo que se mide es que `check` lo diga nombrando la ruta, que es lo que hay que pegar.
test('check nombra el rastro que git no está ignorando', () => {
  const { target, planning } = instancia('cauce-rastros-sin-linea-')
  fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules/\n')
  git(target, 'init', '-q')

  const dichos = avisos(planning)
  assert.equal(dichos.length, 1, `un solo aviso, con los tres adentro: ${JSON.stringify(dichos)}`)
  for (const rastro of ['planning/.verify-log', 'planning/.push-log', 'planning/.grant-log']) {
    assert.match(dichos[0], new RegExp(rastro.replace(/[.*]/g, '\\$&')), `nombra ${rastro}`)
  }

  // Y es advertencia, no error: el archivo es de la empresa y `check` no lo arregla.
  assert.equal(JSON.parse(run(['check', planning, '--json']).stdout).ok, true)

  // Cubrir uno solo deja de nombrarlo y sigue nombrando a los otros dos: el aviso mira el efecto, no el
  // texto del molde, así que una regla propia de la empresa alcanza.
  fs.appendFileSync(path.join(target, '.gitignore'), 'planning/.push-log\n')
  const quedan = avisos(planning)
  assert.doesNotMatch(quedan[0], /planning\/\.push-log/, 'cubierto por su regla, ya no se nombra')
  assert.match(quedan[0], /planning\/\.grant-log/, 'y los que siguen sin cubrir se siguen nombrando')
})

// El molde de este repositorio: `ops.config.json` existe y su modo es el marcador que `init` sustituye.
// Es la raíz que recibe el aviso cuando la puerta corre `check template/planning`, y la que lo hacía
// hablar de tres rastros que ahí no pueden existir.
test('el aviso calla sobre el molde, donde el modo todavía no está renderizado', () => {
  const molde = path.resolve(__dirname, '..', '..', 'template', 'ops.config.json')
  const planning = sinModoReal('cauce-rastros-molde-', (config) => fs.copyFileSync(molde, config))
  assert.deepEqual(avisos(planning), [], 'el molde no es una instancia: no hay rastros de los que hablar')
})

// Y la otra forma de no ser una instancia: `check` apuntado a un planning cuyo padre no declara nada. Sin
// configuración no hay a quién atribuirle los rastros, y avisar ahí es inventar lo mismo que sin repositorio.
test('el aviso calla en una raíz que no declara ninguna configuración', () => {
  const planning = sinModoReal('cauce-rastros-sin-config-', (config) => fs.rmSync(config))
  assert.deepEqual(avisos(planning), [], 'sin configuración no hay instancia a la que avisarle')
})

// La tercera: este repositorio, donde se fabrica Cauce y el único `planning/` es el molde. Es la forma que
// el caso perseguía, y la que quedaría sin fijar si sólo se midieran las otras dos.
test('el aviso calla en el toolkit, donde se fabrica Cauce y no se lo consume', () => {
  const planning = sinModoReal('cauce-rastros-toolkit-', (config) => {
    const declarado = JSON.parse(fs.readFileSync(config, 'utf8'))
    fs.writeFileSync(config, `${JSON.stringify({ ...declarado, mode: 'toolkit' }, null, 2)}\n`)
  })
  assert.deepEqual(avisos(planning), [], 'en el toolkit no hay instancia que pueda escribir un rastro')
})

// Un `ops.config.json` que no se puede leer deja el modo sin establecer, y establecerlo **lanza** a
// propósito —`ownership.mode` distingue ausente de ilegible—. Acá eso tiene que quedar en silencio y no en
// una corrida caída: el config roto ya lo denuncia el validador como error, con su propio mensaje y su
// salida en 1. Que `avisos()` parsee la respuesta es la mitad de la aserción: si `check` se hubiera caído,
// no habría JSON que leer.
test('un config ilegible calla el aviso en vez de tumbar la corrida', () => {
  const planning = sinModoReal('cauce-rastros-config-roto-',
    (config) => fs.writeFileSync(config, '{ esto no es json'))
  assert.deepEqual(avisos(planning), [], 'sin poder establecer el modo, se calla')
})

// En sidecar el `.gitignore` queda dentro de la instancia y el repositorio es el workspace de arriba.
// Es la topología que el caso no preveía, y la que rompería un aviso que resolviera mal la raíz.
test('en sidecar el aviso mira el repositorio del workspace, no la instancia', () => {
  const base = tempRoot('cauce-rastros-sidecar-')
  const workspace = path.join(base, 'mono')
  fs.mkdirSync(workspace, { recursive: true })
  git(workspace, 'init', '-q')
  const target = path.join(workspace, 'ops')
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')

  assert.deepEqual(avisos(planning), [], 'el .gitignore de la instancia cubre sus rutas igual')

  fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules/\n')
  assert.match(avisos(planning)[0] || '', /planning\/\.push-log/,
    'y sin las líneas avisa, con el repositorio una carpeta más arriba')
})
