'use strict'

// Qué avisa `check` sobre los rastros locales que Cauce escribe en la instancia. Por qué la línea que
// los cubre no llega a una instancia que ya existe, y por qué se pregunta por el efecto en vez del
// texto, está en `core/trails.js`.
//
// Las cuatro respuestas que se miden son: sin repositorio, cubierto, sin cubrir, y la topología sidecar
// —el `.gitignore` en la instancia y el repositorio una carpeta más arriba—, que es la que rompería un
// aviso que resolviera mal la raíz.

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
