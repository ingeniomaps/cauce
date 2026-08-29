'use strict'

// Cerrar: qué se lleva `archive` cuando una épica termina y qué conserva de las filas de acción
// humana. Es el único comando de la familia que mueve lo que ya pasó, así que lo que se mide es qué
// queda en pie después.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('valida y archiva el ciclo completo de una épica', () => {
  const base = tempRoot('cauce-cycle-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Cycle', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const config = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: 'app' }]
  fs.writeFileSync(path.join(target, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar ciclo
status: active
service: app
---

# Épica 001 — Demostrar ciclo

## Criterios

- **C1** — El resultado se observa.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **demostrar-ciclo** (→ C1) — Entregar resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **demostrar-ciclo** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
`)
  assert.equal(run(['check', planning]).status, 0)

  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(planning, 'DONE.md'), `# Done

## Hito demo — Demo

- [x] **demostrar-ciclo** (epic: 001) — Entregado
  acept: el resultado se observa
  done: node --test terminó con exit code 0
  qa: recorrido real observado con exit code 0
  tests: C1 → node --test test/demo.test.js
  commit: abc1234 feat(app): demonstrate cycle (app@feat/demo)
`)
  const epicPath = path.join(planning, 'roadmap', 'epic-001-demo.md')
  fs.writeFileSync(epicPath, fs.readFileSync(epicPath, 'utf8').replace('status: active', 'status: closed'))
  assert.equal(run(['check', planning]).status, 0)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.equal(fs.existsSync(path.join(planning, 'done', 'epic-001.md')), true)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)

  const archived = fs.readFileSync(path.join(planning, 'done', 'epic-001.md'), 'utf8')
  const recoveredEntry = archived.match(/- \[x\] \*\*demostrar-ciclo\*\*[\s\S]*$/m)[0]
  fs.appendFileSync(path.join(planning, 'DONE.md'), `\n${recoveredEntry}\n`)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)
})

// Las filas resueltas nunca llegan a un modelo —`ops context` ya las excluye—, así que archivarlas no
// ahorra contexto: mantiene legible el archivo que una persona tiene que curar. Por eso el disparador
// es el estado y no una fecha, y por eso el destino es el mismo `done/` que ya guarda evidencia.
test('archive human-actions saca las filas resueltas y conserva todo lo demás', () => {
  const base = tempRoot('cauce-archive-ha-')
  const planning = path.join(base, 'planning')
  fs.cpSync(path.resolve(__dirname, '..', '..', 'template', 'planning'), planning, { recursive: true })
  const archivo = path.join(planning, 'HUMAN_ACTIONS.md')
  const original = fs.readFileSync(archivo, 'utf8')
  fs.writeFileSync(archivo, original.replace(
    /(\|---\|---\|---\|---\|\n)/,
    '$1| alta-smtp | resuelta 2026-08-17 | Ready | Se creó la cuenta. |\n'
    + '| pago-plan | pendiente | QA | Aprobar el gasto del plan pago. |\n'
    + '| dns-staging | resuelta | Verify | Se apuntó el registro. |\n',
  ))

  const result = run(['archive', planning, 'human-actions'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /2 fila\(s\) archivadas/)

  const quedo = fs.readFileSync(archivo, 'utf8')
  assert.match(quedo, /^\| pago-plan \| pendiente \|/m, 'la pendiente se queda')
  assert.doesNotMatch(quedo, /alta-smtp|dns-staging/, 'las resueltas se van')
  assert.ok(quedo.includes('| Tarea | Estado | Origen |'), 'el encabezado de la tabla sobrevive')
  assert.ok(quedo.includes('vocabulario cerrado'), 'y la prosa que explica el archivo también')
  assert.ok(quedo.includes('slug-de-tarea'), 'y el ejemplo comentado, que no es una fila real')

  const historial = fs.readFileSync(path.join(planning, 'done', 'human-actions.md'), 'utf8')
  assert.match(historial, /^\| alta-smtp \| resuelta 2026-08-17 \| Ready \| Se creó la cuenta\. \|$/m)
  assert.match(historial, /^\| dns-staging \| resuelta \| Verify \|/m)
  assert.ok(historial.includes('| Tarea | Estado | Origen |'), 'el historial se lee solo')

  // Segunda corrida: no hay nada que mover y no se toca ningún archivo.
  const otra = run(['archive', planning, 'human-actions'])
  assert.equal(otra.status, 0, otra.stderr)
  assert.match(otra.stdout, /no hay filas resueltas/)
  assert.equal(fs.readFileSync(archivo, 'utf8'), quedo)

  // Y lo archivado se acumula en vez de reemplazarse.
  fs.appendFileSync(archivo, '| cuenta-meta | resuelta | Ready | Se habilitó el acceso. |\n')
  assert.equal(run(['archive', planning, 'human-actions']).status, 0)
  const segundo = fs.readFileSync(path.join(planning, 'done', 'human-actions.md'), 'utf8')
  for (const slug of ['alta-smtp', 'dns-staging', 'cuenta-meta']) {
    assert.ok(segundo.includes(slug), `${slug} sigue en el historial`)
  }
  assert.equal((segundo.match(/^\| Tarea \| Estado/gm) || []).length, 1, 'un solo encabezado')
  // Una copia pelada de `planning/` no es una instancia —le falta `integrations/config.json`—, así que
  // se juzga lo que este comando toca y no el exit code entero.
  const validacion = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.deepEqual(
    validacion.errors.filter((error) => /HUMAN_ACTIONS|human-actions/.test(error)), [],
    'lo que quedó y lo que se archivó siguen siendo válidos',
  )
})
