'use strict'

// Caso 535: un WIP activo que apunta a una tarea ya en done/ es un cierre que quedó a medias. `check` lo avisa,
// `context` no la ofrece como la tarea en curso ni manda a reclamarla, y su JSON —que es lo que lee `/autobuild`—
// la trae sin WIP, así que el recorrido no la retoma como reanudación.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RUNNER = 'banco'
const DONE = `- [x] **alta-de-cliente** — Alta de cliente
  acept: el alta rechaza un duplicado
  fecha: 2026-11-20
  done: el alta rechaza un duplicado
  qa: probado a mano
  tests: n/a — razón: la prueba no tiene código
  commit: n/a — razón: la prueba no tiene repositorio de producto
  lane: lite
  review: skipped (lite)
  critique: skipped (lite)
`
const wip = (task, status = '') => `---\ntask: ${task}\n${status}phase: Build\nstarted: 2026-11-20\nlane: lite\n---\n\n`
  + '## Plan aprobado\n1. [x] Validar duplicado\n2. [ ] Correr la suite\n'

function instance(prefix) {
  const ops = path.join(tempRoot(prefix), 'ops')
  assert.equal(run(['init', ops, '--name', 'Banco', '--no-install']).status, 0)
  const planning = path.join(ops, 'planning')
  fs.mkdirSync(path.join(planning, 'done'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'done', 'alta-de-cliente.md'), DONE)
  return planning
}
const said = (out) => out.stdout + out.stderr
const context = (planning, ...args) => run(['context', planning, ...args], undefined, { CAUCE_RUNNER: RUNNER })

test('un WIP sobre una tarea cerrada se avisa en check y no se ofrece en context', () => {
  const planning = instance('cauce-wip-rancio-')
  fs.writeFileSync(path.join(planning, 'wip', `${RUNNER}.md`), wip('alta-de-cliente'))
  const checked = run(['check', planning])
  assert.equal(checked.status, 0, 'es aviso y no error: el WIP no viaja por git')
  assert.match(said(checked),
    /wip\/banco\.md: alta-de-cliente ya está en done\/\. El cierre quedó a medias: dejá el WIP en status: IDLE/)
  const text = context(planning)
  assert.match(text.stdout, /^STALE {2}wip\/banco\.md apunta a alta-de-cliente, que ya está en done\//m)
  assert.doesNotMatch(text.stdout, /^TASK {3}alta-de-cliente/m, 'no la presenta como la tarea en curso')
  assert.doesNotMatch(text.stdout, /ops claim <planning> alta-de-cliente/, 'ni manda a reclamarla')
  const report = JSON.parse(context(planning, '--json').stdout)
  assert.equal(report.task, null)
  assert.equal(report.wip, null, '/autobuild deriva wipActive de esto: sin WIP no la retoma')
  assert.equal(report.staleWip, 'alta-de-cliente')
  // Con trabajo en la cola, se ofrece ése, y con un reclamo propio sobre otra tarea, ése.
  fs.appendFileSync(path.join(planning, 'BACKLOG.md'), '\n## Hito h1 — Uno\n\n'
    + '- [ ] **baja-de-cliente** [lite] — Baja de cliente. _Aceptación: la baja borra el cliente._\n')
  const queued = JSON.parse(context(planning, '--json').stdout)
  assert.deepEqual([queued.task.slug, queued.wip, queued.staleWip], ['baja-de-cliente', null, 'alta-de-cliente'])
  assert.equal(run(['claim', planning, 'baja-de-cliente'], undefined, { CAUCE_RUNNER: RUNNER }).status, 0)
  const claimed = JSON.parse(context(planning, '--json').stdout)
  assert.deepEqual([claimed.task.slug, claimed.claimed, claimed.wip], ['baja-de-cliente', true, null])
})

test('un WIP en IDLE, o uno sobre una tarea abierta, sigue como siempre', () => {
  const planning = instance('cauce-wip-sano-')
  fs.writeFileSync(path.join(planning, 'wip', `${RUNNER}.md`), wip('alta-de-cliente', 'status: IDLE\n'))
  assert.doesNotMatch(said(run(['check', planning])), /cierre quedó a medias/)
  assert.doesNotMatch(context(planning).stdout, /^STALE/m)
  fs.appendFileSync(path.join(planning, 'BACKLOG.md'), '\n## Hito h1 — Uno\n\n'
    + '- [ ] **baja-de-cliente** [lite] — Baja de cliente. _Aceptación: la baja borra el cliente._\n')
  fs.writeFileSync(path.join(planning, 'wip', `${RUNNER}.md`), wip('baja-de-cliente'))
  const report = JSON.parse(context(planning, '--json').stdout)
  assert.equal(report.task.slug, 'baja-de-cliente')
  assert.deepEqual(report.wip, { phase: 'Build', complete: 1, pending: 1 })
  assert.equal(report.staleWip, '')
})
