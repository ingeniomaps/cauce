'use strict'

// Sujeto: `test/tools/hooks-smoke.sh`, lo primero que corre `npm test`. Comprueba que los wrappers de
// guards estén y bloqueen, antes de pagar los cuarenta y cinco segundos de la suite.
//
// Lo que se mide acá son las cuatro respuestas que un guard puede dar, porque tres de ellas no son 0 y
// sólo una es «bloqueó». Las otras dos —no existe, no es ejecutable— son que el guard **no llegó a
// correr**, y una prueba negativa que mire «no salió con 0» las da por buenas (caso 132).
//
// El humo se ejercita sobre una raíz falsa con guards de mentira: montar la de verdad obligaría a
// romper los guards del repositorio para ver el rojo, que es exactamente lo que R23 manda no hacer.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempRoot, discard } = require('../support/environment')

const HUMO = path.resolve(__dirname, '..', 'tools', 'hooks-smoke.sh')

// Una raíz con la forma que el humo espera —él resuelve la suya desde su propia ubicación— y dos guards
// que contestan lo que el caso pida. `destructive` siempre deja pasar: lo que se mide es el otro.
function raiz(prefix, gitAdd) {
  const root = path.join(tempRoot(prefix), 'repo')
  const hooks = path.join(root, 'automatization', 'hooks')
  fs.mkdirSync(hooks, { recursive: true })
  fs.mkdirSync(path.join(root, 'test', 'tools'), { recursive: true })
  fs.copyFileSync(HUMO, path.join(root, 'test', 'tools', 'hooks-smoke.sh'))
  fs.writeFileSync(path.join(hooks, 'guard-destructive.sh'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  const guard = path.join(hooks, 'guard-git-add.sh')
  if (gitAdd !== null) fs.writeFileSync(guard, `#!/usr/bin/env bash\nexit ${gitAdd.code}\n`, { mode: gitAdd.mode })
  return { root, corrida: () => spawnSync('bash', [path.join(root, 'test', 'tools', 'hooks-smoke.sh')],
    { encoding: 'utf8' }) }
}

test('con el guard bloqueando, el humo pasa', () => {
  const { root, corrida } = raiz('cauce-humo-bloquea-', { code: 2, mode: 0o755 })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /wrappers de hooks ejecutables/)
})

// La mitad que el humo ya cubría: un guard que de verdad deja pasar lo que debía frenar.
test('un guard que deja pasar el comando prohibido falla', () => {
  const { root, corrida } = raiz('cauce-humo-permite-', { code: 0, mode: 0o755 })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  assert.match(`${done.stdout}${done.stderr}`, /permitió/)
})

// El caso: el guard no está. La tubería devuelve 127 y «no salió con 0» lo confunde con un bloqueo, así
// que el humo imprimía su visto bueno con el archivo borrado del disco.
test('un guard ausente falla en vez de darse por bloqueado', () => {
  const { root, corrida } = raiz('cauce-humo-ausente-', null)
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  // El mensaje específico y no el genérico: si dijera sólo «salió con 127 y se esperaba 2», la prueba
  // pasaría igual con la rama que explica la causa borrada, y quien lea el rojo no sabría qué mirar.
  assert.match(`${done.stdout}${done.stderr}`, /no se pudo ejecutar \(código 127\)/)
})

// La otra forma de no correr, y la que el caso no había medido: el archivo está y no es ejecutable. La
// tubería devuelve 126, no 127, así que comparar contra un solo código la dejaría pasando.
test('un guard sin permiso de ejecución falla en vez de darse por bloqueado', () => {
  const { root, corrida } = raiz('cauce-humo-sin-permiso-', { code: 2, mode: 0o644 })
  const done = corrida()
  discard(path.dirname(root))
  assert.equal(done.status, 1, `${done.stdout}${done.stderr}`)
  assert.match(`${done.stdout}${done.stderr}`, /no se pudo ejecutar \(código 126\)/)
})
