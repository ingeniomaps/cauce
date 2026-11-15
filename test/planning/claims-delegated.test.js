'use strict'

// Lo que `ops claim` aconseja al terminar: a una sesión delegada, y dónde va el plan y quién empuja el reclamo. El
// resto del reclamo es de `claims.test.js`.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

function planning(nombre) {
  const dir = path.join(tempRoot(nombre), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primer resultado

- [ ] **dashboard** [lite] — Grilla. _Aceptación: filtra por fecha._ (service: web)
- [ ] **boton** [lite] — Botón. _Aceptación: baja un CSV._ (service: web)
- [ ] **reportes** [lite] — Endpoint. _Aceptación: responde 200._ (service: api)
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

// De la corrida a ciegas del 2026-11-15: `claim` pedía «commiteá y empujá» sin remoto y con `allowPush` apagado, y no
// decía dónde va el plan, así que dos corridas leyeron el motor para saber el nombre del archivo.
test('claim dice dónde va el plan y si empujar el reclamo es cosa del agente', () => {
  const dir = planning('cauce-claims-empujar-')
  const ops = path.dirname(dir)
  // Un runner por tarea: uno tiene una sola a la vez.
  const take = (slug) => withEnv({ CAUCE_OWNER: 'ana@acme.com', CAUCE_RUNNER: `/w/${slug}` },
    () => run(['claim', dir, slug]))
  const sinRemoto = take('dashboard')
  assert.match(sinRemoto.stdout, /commiteá claims\/dashboard\.md: sin remoto, el reclamo vale sólo en esta copia/)
  assert.doesNotMatch(sinRemoto.stdout, /empujá/)
  assert.match(sinRemoto.stdout, /plan: .*planning\/wip\/w-dashboard\.md$/m)

  spawnSync('git', ['init', '-q'], { cwd: ops })
  spawnSync('git', ['remote', 'add', 'origin', 'https://example.invalid/acme/ops.git'], { cwd: ops })
  const apagado = take('boton')
  assert.match(apagado.stdout, /hay que empujarlo, y con runner\.allowPush apagado ese push lo pide una persona/)
  assert.doesNotMatch(apagado.stdout, /commiteá y empujá/)

  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ runner: { allowPush: true } }))
  assert.match(take('reportes').stdout, /commiteá y empujá claims\/reportes\.md para que el equipo lo vea/)
})
