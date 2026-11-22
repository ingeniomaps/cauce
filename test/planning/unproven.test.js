'use strict'

// Caso 534: una entrada de done/ cuyo `done:` y `qa:` no pegan ningún resultado de verificar —un exit code, un N/M o
// un número de pruebas— ni lo justifican con `n/a — razón` se avisa en `check`. Rige desde la primera entrada de la
// instancia que lo pega: lo anterior se cuenta y no se nombra, y lo adoptado no cuenta.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const DE = require('../../engine/planning/done-entry')

const entry = (slug, fecha, done, qa = '') => ({ slug, fecha, done, qa })

test('cuenta como resultado un exit code, un N/M, un número de pruebas o un n/a justificado', () => {
  const pasted = ['npm test → exit 0', 'go test ./... exit=0', 'exit code 1 y después 0', 'código de salida 0',
    'pnpm run test pasó 916/916', '41 passed',
    'ℹ pass 41, ℹ fail 0', 'exit status 0', '12 pruebas en verde', '3 tests', 'n/a — razón: es una regla de texto']
  const told = ['verifiqué que las pruebas pasan; todo en verde', 'probado a mano, funciona', 'la suite pasa',
    'n/a', 'exit']
  for (const done of pasted) assert.deepEqual(DE.unprovenWarnings({ entries: [entry('a', '2026-01-01', done)] }), [])
  const later = (done) => DE.unprovenWarnings({ entries: [entry('a', '2026-01-01', 'exit 0'),
    entry('b', '2026-02-01', done)] })
  for (const done of told) assert.match(later(done).join('\n'), /^planning\/done: b no pega\(n\)/, done)
  // En `qa:` también vale.
  assert.deepEqual(DE.unprovenWarnings({ entries: [entry('a', '2026-01-01', 'hecho', 'curl → exit 0')] }), [])
})

test('lo anterior a la primera entrada que pega un resultado se cuenta, lo posterior se nombra', () => {
  const done = { entries: [entry('vieja', '2026-01-01', 'listo'), entry('otra', '2026-01-02', 'hecho'),
    entry('primera', '2026-02-01', 'exit 0'), entry('nueva', '2026-03-01', 'todo en verde'),
    entry('adoptada', '2026-03-02', 'listo')] }
  const warnings = DE.unprovenWarnings(done, new Set(['adoptada']))
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /^planning\/done: 2 entrada\(s\) sin un resultado pegado .*quedan como están$/)
  assert.match(warnings[1], /^planning\/done: nueva no pega\(n\)/)
  assert.doesNotMatch(warnings.join('\n'), /adoptada|vieja|otra/)
  // Una instancia que nunca pegó uno sólo cuenta.
  assert.match(DE.unprovenWarnings({ entries: [entry('x', '2026-01-01', 'listo')] }).join('\n'), /1 entrada\(s\)/)
})

test('check lo avisa sobre una instancia, sin volverlo error', () => {
  const ops = path.join(tempRoot('cauce-sin-resultado-'), 'ops')
  assert.equal(run(['init', ops, '--name', 'Banco', '--no-install']).status, 0)
  const done = path.join(ops, 'planning', 'done')
  fs.mkdirSync(done, { recursive: true })
  const write = (slug, fecha, verified) => fs.writeFileSync(path.join(done, `${slug}.md`), `- [x] **${slug}** — Tarea
  acept: la tarea queda hecha
  fecha: ${fecha}
  done: ${verified}
  qa: n/d
  tests: n/a — razón: la prueba no tiene código
  commit: n/a — razón: la prueba no tiene repositorio de producto
  lane: lite
  review: skipped (lite)
  critique: skipped (lite)
`)
  write('pegada', '2026-11-20', 'node --test → exit 0, 41 passed')
  write('contada', '2026-11-21', 'implementé la validación y verifiqué que las pruebas pasan; todo en verde')
  const out = run(['check', path.join(ops, 'planning')])
  assert.equal(out.status, 0, 'es aviso: lo cerrado no se arregla editándolo')
  assert.match(out.stdout + out.stderr, /planning\/done: contada no pega\(n\) en done: ni qa: el resultado/)
})
