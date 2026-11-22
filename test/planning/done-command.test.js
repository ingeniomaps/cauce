'use strict'

// `ops done` de punta a punta sobre una copia del molde (caso 537): valida antes de escribir y deja la cola, la
// épica, el WIP y el reclamo como pide Done.

const { tempRoot, run, writeWip, opsConfig, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../../engine/planning/parser')
const CL = require('../../engine/planning/claims')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const TASK = '- [ ] **sumar** [lite] — Exportar sum. _Aceptación: sum(2, 3) da 5._ (epic: 001) (service: api)\n'
const EPIC = `---
epic: 001
title: Sumas
status: active
service: api
---

# Épica 001 — Sumas

## Resultado

Se puede sumar.

## Criterios

- **C1** — Cuando se llama a sum con 2 y 3, la API devuelve 5.

## Contexto relevante

- api/sum.js es el único punto.

## Historias

- [ ] **sumar** (→ C1) — Exportar sum. _Aceptación: sum(2, 3) da 5._ (service: api)

## Riesgos y decisiones humanas

- Ninguno
`
const FIELDS = `done: api/sum.js exporta sum; npm test → exit 0, 1 passed
qa: sum(2, 3) devolvió 5 por el camino del consumidor
tests: C1 → api/sum.test.js › «suma dos números» — 2 + 3
decisions: ninguna no obvia [fuente: api/sum.js]
commit: n/a — prueba sin repositorio
review: n/a — prueba sin revisor
critique: n/a — lite no corre crítica
`

function instance(name, { queueIn = 'BACKLOG.md' } = {}) {
  const root = tempRoot(name)
  const dir = path.join(root, 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  fs.cpSync(path.join(MOLDE, '..', 'integrations'), path.join(root, 'integrations'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(opsConfig()))
  fs.writeFileSync(path.join(dir, 'roadmap', 'epic-001-sumas.md'), EPIC)
  const queue = '## Hito h — Sumas\n\n' + TASK + '  nota indentada de la tarea\n'
  if (queueIn === 'BACKLOG.md') fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog\n\n${queue}`)
  else fs.writeFileSync(path.join(dir, 'backlog', 'h.md'), `---\norder: 10\n---\n\n${queue}`)
  fs.mkdirSync(path.join(dir, CL.DIR), { recursive: true })
  fs.writeFileSync(CL.file(dir, 'sumar'), CL.content({ task: 'sumar', owner: 'a@b', runner: process.env.CAUCE_RUNNER,
    started: '2026-11-20', service: 'api' }))
  writeWip(dir, '---\ntask: sumar\nphase: Build\nlane: lite\n---\n\n## Plan aprobado\n1. [x] paso\n')
  const fields = path.join(root, 'campos.txt')
  fs.writeFileSync(fields, FIELDS)
  return { dir, fields }
}

test('ops done cierra en una llamada: entrada con su slug, cola, épica, WIP y reclamo', () => {
  const { dir, fields } = instance('cauce-done-cmd-')
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.match(closed.stdout, /✓ planning válido: 1 épica\(s\), 0 tarea\(s\) en cola, 1 terminada\(s\)/)

  const entry = P.readDone(dir).entries.find((one) => one.slug === 'sumar')
  assert.ok(entry, 'la viñeta lleva el slug de la cola')
  assert.equal(entry.source, path.join('done', 'sumar.md'))
  assert.equal(entry.acceptance, 'sum(2, 3) da 5.', 'acept sale de la tarea, no de los campos')
  assert.equal(entry.lane, 'lite')
  assert.match(entry.fecha, /^\d{4}-\d{2}-\d{2}$/)
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'BACKLOG.md'), 'utf8'), /sumar|nota indentada/)
  assert.match(fs.readFileSync(path.join(dir, 'roadmap', 'epic-001-sumas.md'), 'utf8'), /^status: closed$/m)
  assert.equal(P.readWip(dir, process.env.CAUCE_RUNNER), null, 'el WIP queda en IDLE')
  const wip = path.join(dir, 'wip', `${P.wipName(process.env.CAUCE_RUNNER)}.md`)
  assert.ok(fs.existsSync(wip), 'el WIP no se borra (R28)')
  assert.ok(!fs.existsSync(CL.file(dir, 'sumar')), 'el reclamo se suelta')

  // Otra vez: la evidencia ya escrita no se pisa, y lo que falta —nada— no falla.
  const before = fs.readFileSync(path.join(dir, 'done', 'sumar.md'), 'utf8')
  fs.writeFileSync(fields, FIELDS.replace('sum(2, 3) devolvió 5', 'OTRA COSA'))
  const again = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /ya tiene su entrada en done\/; no se reescribe/)
  assert.equal(fs.readFileSync(path.join(dir, 'done', 'sumar.md'), 'utf8'), before)
})

test('un campo mal escrito o faltante sale con 1 y el disco queda como estaba', () => {
  const { dir, fields } = instance('cauce-done-bad-')
  const snapshot = () => ['BACKLOG.md', 'roadmap/epic-001-sumas.md', `wip/${P.wipName(process.env.CAUCE_RUNNER)}.md`]
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('|')
  const before = snapshot()

  fs.writeFileSync(fields, FIELDS.replace(/^tests: .*$/m, 'tests: corrí las pruebas'))
  const bad = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /tests debe rastrear/)
  fs.writeFileSync(fields, FIELDS.replace(/^qa: .*$\n/m, '').replace(/^review: .*$\n/m, ''))
  const missing = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /faltan campos: qa, review/)

  assert.ok(!fs.existsSync(path.join(dir, 'done', 'sumar.md')), 'no se escribió la entrada')
  assert.ok(fs.existsSync(CL.file(dir, 'sumar')), 'ni se soltó el reclamo')
  assert.equal(snapshot(), before, 'ni la cola, ni la épica, ni el WIP')
})

test('un hito de backlog/ que se queda sin tareas se borra, y una tarea que no existe no se cierra', () => {
  const { dir, fields } = instance('cauce-done-split-', { queueIn: 'backlog' })
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.ok(!fs.existsSync(path.join(dir, 'backlog', 'h.md')))

  const unknown = run(['done', dir, 'no-existe', '--fields', fields])
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /no-existe no está en la cola ni en done\//)
  assert.ok(!fs.existsSync(path.join(dir, 'done', 'no-existe.md')))
})

test('lo que no se puede cerrar desde acá se dice, y no escribe nada', () => {
  const { dir, fields } = instance('cauce-done-edges-')
  const noFields = run(['done', dir, 'sumar'])
  assert.equal(noFields.status, 2)
  assert.match(noFields.stderr, /Falta --fields <archivo>/)
  const unreadable = run(['done', dir, 'sumar', '--fields', path.join(dir, 'no-existe.txt')])
  assert.equal(unreadable.status, 2)
  assert.match(unreadable.stderr, /No se pudo leer/)
  assert.equal(run(['done', dir]).status, 2, 'sin tarea')

  // Un archivo con ese nombre que cierra otra tarea es evidencia ajena: no se pisa.
  const foreign = path.join(dir, 'done', 'sumar.md')
  fs.writeFileSync(foreign, '- [x] **otra-cosa** — X\n  acept: a\n')
  const collision = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(collision.status, 1)
  assert.match(collision.stderr, /existe y no cierra sumar/)
  assert.equal(fs.readFileSync(foreign, 'utf8'), '- [x] **otra-cosa** — X\n  acept: a\n')
  fs.rmSync(foreign)

  // El WIP de otra sesión que apunta a la misma tarea no se toca; se avisa.
  const otherWip = '---\ntask: sumar\nphase: Review\n---\n\n## Plan aprobado\n1. [x] paso\n'
  fs.writeFileSync(path.join(dir, 'wip', 'otra-sesion.md'), otherWip)
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.match(closed.stderr, /wip\/otra-sesion\.md también apunta a sumar: es de otra sesión/)
  assert.equal(fs.readFileSync(path.join(dir, 'wip', 'otra-sesion.md'), 'utf8'), otherWip)
})

test('la aceptación heredada y el carril de quien construyó llegan a la entrada', () => {
  const { dir, fields } = instance('cauce-done-inherit-')
  // Hereda la aceptación del criterio y no declara carril: el carril lo tiene el WIP de quien la construyó.
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), '# Backlog\n\n## Hito h — Sumas\n\n'
    + '- [ ] **sumar** — Exportar sum. (→ C1) (epic: 001) (service: api)\n')
  discard(path.join(dir, 'wip'))
  fs.mkdirSync(path.join(dir, 'wip'))
  fs.writeFileSync(path.join(dir, 'wip', 'constructor.md'),
    '---\ntask: sumar\nphase: Review\nlane: full\n---\n\n## Plan aprobado\n1. [x] paso\n')
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  const entry = P.readDone(dir).entries.find((one) => one.slug === 'sumar')
  assert.equal(entry.acceptance, 'Cuando se llama a sum con 2 y 3, la API devuelve 5.')
  assert.equal(entry.lane, 'full', 'el carril del WIP de la otra sesión, no «sin clasificar»')
})

test('un campo que no se juzga, o un renglón suelto, frenan antes de escribir', () => {
  const { dir, fields } = instance('cauce-done-unknown-')
  for (const [extra, said] of [['lane: full\n', /campos que no se pasan: lane/],
    ['revew: n/a — typo\n', /campos que no se pasan: revew/], ['un renglón suelto\n', /renglones que no son/]]) {
    fs.writeFileSync(fields, FIELDS + extra)
    const refused = run(['done', dir, 'sumar', '--fields', fields])
    assert.equal(refused.status, 1, extra)
    assert.match(refused.stderr, said)
    assert.ok(!fs.existsSync(path.join(dir, 'done', 'sumar.md')), extra)
  }
})

test('la épica con otra historia abierta no se cierra, y la tarea de otra línea no se cierra desde acá', () => {
  const { dir, fields } = instance('cauce-done-epic-')
  const epicFile = path.join(dir, 'roadmap', 'epic-001-sumas.md')
  fs.writeFileSync(epicFile, EPIC.replace('## Riesgos',
    '- [ ] **restar** (→ C1) — Exportar resta. _Aceptación: resta(3, 2) da 1._ (service: api)\n\n## Riesgos'))
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.match(fs.readFileSync(epicFile, 'utf8'), /^status: active$/m, 'le queda restar')

  const lined = instance('cauce-done-line-', { queueIn: 'backlog' })
  const queue = path.join(lined.dir, 'backlog', 'h.md')
  fs.writeFileSync(queue, fs.readFileSync(queue, 'utf8').replace('order: 10', 'order: 10\nline: pagos'))
  const refused = run(['done', lined.dir, 'sumar', '--fields', lined.fields])
  assert.equal(refused.status, 1)
  assert.ok(!fs.existsSync(path.join(lined.dir, 'done', 'sumar.md')))
})

test('un hito de backlog/ con borradores comentados no se borra al quedarse sin tareas', () => {
  const { dir, fields } = instance('cauce-done-drafts-', { queueIn: 'backlog' })
  const queue = path.join(dir, 'backlog', 'h.md')
  const draft = '<!-- - [ ] **borrador** — Después. _Aceptación: algo._ (service: api) -->\n'
  fs.writeFileSync(queue, fs.readFileSync(queue, 'utf8') + draft)
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.ok(fs.readFileSync(queue, 'utf8').includes(draft), 'el borrador sigue ahí')
  assert.match(closed.stderr, /guarda borradores comentados: no se borra/)
})

test('sin decisions, que el PROTOCOL deja opcional, cierra igual y la entrada no la nombra', () => {
  const { dir, fields } = instance('cauce-done-nodecision-')
  fs.writeFileSync(fields, FIELDS.replace(/^decisions:.*\n/m, ''))
  const closed = run(['done', dir, 'sumar', '--fields', fields])
  assert.equal(closed.status, 0, closed.stderr + closed.stdout)
  assert.doesNotMatch(closed.stdout + closed.stderr, /faltan campos/)
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'done', 'sumar.md'), 'utf8'), /decisions:/)
  discard(path.dirname(dir))
})
