'use strict'

// El consejo de `ops claim` a una sesión delegada. El resto del reclamo es de `claims.test.js`.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

function planning(nombre) {
  const dir = path.join(tempRoot(nombre), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primer resultado

- [ ] **dashboard** [lite] — Grilla. _Aceptación: filtra por fecha._ (service: web)
`)
  return dir
}

// El CLI hereda el entorno, así que lo que la prueba fija lo tiene que devolver.
function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  try { return fn() } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const IDENTITY = { CAUCE_OWNER: 'ana@acme.com', CAUCE_RUNNER: 'ana@acme.com' }

// El consejo es para quien puede seguirlo: una sesión delegada tiene quien la lanzó para eso (caso 471).
test('una sesión delegada no recibe la orden de empujar su reclamo', () => {
  const dir = planning('cauce-claims-delegada-')
  const tomada = withEnv({ ...IDENTITY, CAUCE_DELEGATED: '1' }, () => run(['claim', dir, 'dashboard']))
  assert.equal(tomada.status, 0, tomada.stderr)
  assert.doesNotMatch(tomada.stdout, /empujá/)
  assert.match(tomada.stdout, /export CAUCE_RUNNER=/, 'con qué id volver sigue haciendo falta')
})
