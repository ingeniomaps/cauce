'use strict'

// Las escrituras de `ops done` como funciones de texto (caso 537): sin disco; el comando sólo las aplica.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const CL = require('../../engine/planning/close')
const P = require('../../engine/planning/parser')

test('parseFields lee campo: valor y sigue los renglones indentados', () => {
  const text = 'done: cambió src/sum.js\n  y su prueba\nqa: 2 + 3 → 5\n\n# nota\ntests: A → npm test\n'
  assert.deepEqual(CL.parseFields(text), { stray: [],
    fields: { done: 'cambió src/sum.js y su prueba', qa: '2 + 3 → 5', tests: 'A → npm test' } })
  const loose = CL.parseFields('done: algo\nsin indentar se perdía\nLane: full\n')
  assert.deepEqual(loose.stray, ['sin indentar se perdía'], 'lo que no encaja vuelve, no se descarta')
  assert.deepEqual(CL.unknownFields({ ...loose.fields, acept: 'x' }), ['Lane', 'acept'])
})

test('missingFields pide lo que juzga quien cierra, y nada de lo que se lee del disco', () => {
  assert.deepEqual(CL.missingFields({ done: 'x', qa: 'y' }), ['tests', 'commit', 'review', 'critique'],
    'decisions es opcional')
  assert.deepEqual(CL.missingFields({ done: 'x', qa: 'y', tests: 'A → t', decisions: 'd [fuente: f]', commit: 'n/a — r',
    review: 'n/a — r', critique: 'n/a — r', acept: 'no se pide' }), [])
})

test('entryText arma una entrada que el parser lee con el slug de la cola', () => {
  const text = CL.entryText({
    task: { slug: 'sumar', epic: '001', description: 'Exportar sum.', acceptance: 'sum(2, 3) da 5' },
    fecha: '2026-11-21', lane: 'lite',
    fields: { done: 'src/sum.js; npm test → exit 0, 1 passed', qa: 'sum(2, 3) → 5', tests: 'A → npm test',
      decisions: 'ninguna [fuente: src/sum.js]', commit: 'n/a — prueba', review: 'n/a — prueba',
      critique: 'n/a — lite no corre crítica' },
  })
  assert.match(text, /^- \[x\] \*\*sumar\*\* \(epic: 001\) — Exportar sum\n/)
  assert.match(text, /\n {2}acept: sum\(2, 3\) da 5\n {2}fecha: 2026-11-21\n/)
  const forged = CL.entryText({ task: { slug: 'sumar', acceptance: 'la de la cola' }, fecha: '2026-11-21', lane: 'lite',
    fields: { acept: 'otra', fecha: '1999-01-01', lane: 'full', done: 'x' } })
  assert.match(forged, /acept: la de la cola\n {2}fecha: 2026-11-21\n/, 'lo que sale del disco no se pide ni se pisa')
  assert.match(forged, /lane: lite\n/)
  const order = ['acept', 'fecha', 'done', 'qa', 'tests', 'decisions', 'commit', 'lane', 'review', 'critique']
  assert.deepEqual([...text.matchAll(/^ {2}([a-z]+):/gm)].map((one) => one[1]), order)
  const bare = CL.entryText({ task: { slug: 'sumar', acceptance: 'a' }, fecha: '2026-11-21', lane: 'lite',
    fields: { done: 'x', decisions: '  ' } })
  assert.doesNotMatch(bare, /decisions:/, 'sin decisión no queda una línea vacía que lo parezca')
})

test('withoutTask saca la línea y sus notas indentadas, y nada más', () => {
  const queue = '## Hito h — H\n\n- [ ] **otra** — A. _Aceptación: a._ (service: api)\n'
    + '- [ ] **sumar** — B. _Aceptación: b._ (service: api)\n  nota de la tarea\n    otra nota\n'
    + '- [ ] **tercera** — C. _Aceptación: c._ (service: api)\n'
  const left = CL.withoutTask(queue, 'sumar')
  assert.equal(left, '## Hito h — H\n\n- [ ] **otra** — A. _Aceptación: a._ (service: api)\n'
    + '- [ ] **tercera** — C. _Aceptación: c._ (service: api)\n')
  assert.equal(CL.withoutTask(queue, 'no-esta'), queue, 'sin la tarea el texto no cambia')
  const addMore = '## Hito h — H\n\n- [ ] **sumar-mas** — B. _Aceptación: b._ (service: api)\n'
  assert.equal(CL.withoutTask(addMore, 'sumar'), addMore, 'un slug que empieza igual no es la tarea')
  // Lo que la cola no lee no se toca: el hito de ejemplo comentado del molde y una sección que no es un hito.
  const real = '- [ ] **sumar** — B. _Aceptación: b._ (service: api)\n'
  const commented = `<!--\n## Hito ejemplo — E\n\n${real}-->\n\n## Notas\n\n${real}\n## Hito h — H\n\n${real}`
  assert.equal(CL.withoutTask(commented, 'sumar'), `<!--\n## Hito ejemplo — E\n\n${real}-->\n\n## Notas\n\n${real}\n`
    + '## Hito h — H\n\n')
  // Dentro de un hito real, el borrador comentado se queda y sale la tarea viva.
  assert.equal(CL.withoutTask(`## Hito h — H\n\n<!-- borrador:\n${real}-->\n${real}`, 'sumar'),
    `## Hito h — H\n\n<!-- borrador:\n${real}-->\n`)
  // La línea que abre un comentario que sigue abajo.
  const opens = `## Hito h — H\n\n- [ ] **sumar** — B. _Aceptación: b._ (service: api) <!-- después:\n${real}-->\n`
  assert.equal(CL.withoutTask(opens, 'sumar'), `## Hito h — H\n\n<!-- después:\n${real}-->\n`)
  // Un comentario al final de la propia línea no la esconde: la cola la lee sin él.
  const noted = '## Hito h — H\n\n- [ ] **sumar** — B. _Aceptación: b._ (service: api) <!-- ver con pagos -->\n'
  assert.equal(CL.withoutTask(noted, 'sumar'), '## Hito h — H\n\n')
  assert.equal(CL.hasTaskLines(`---\norder: 1\n---\n\n## Hito h — H\n\n<!-- ${real}-->\n`), true, 'el borrador cuenta')
  assert.equal(CL.hasTaskLines('---\norder: 1\n---\n\n## Hito h — H\n\n'), false)
})

test('closedEpic y idleWip cambian sólo el frontmatter', () => {
  const epic = '---\nepic: 001\nstatus: active\n---\n\n## Historias\n\nstatus: active en el cuerpo\n'
  assert.equal(CL.closedEpic(epic),
    '---\nepic: 001\nstatus: closed\n---\n\n## Historias\n\nstatus: active en el cuerpo\n')
  const wip = '---\ntask: sumar\nphase: Build\n---\n\n## Plan aprobado\n1. [x] paso\n'
  const idle = CL.idleWip(wip)
  assert.match(idle, /^---\nstatus: IDLE\ntask: sumar\n/)
  const dir = tempRoot('cauce-close-wip-')
  fs.mkdirSync(path.join(dir, 'wip'))
  fs.writeFileSync(path.join(dir, 'wip', 'r.md'), idle)
  assert.equal(P.readWip(dir, 'r'), null, 'el parser ya no la lee como tarea en curso')
  assert.equal(CL.idleWip(idle), idle, 'dos veces da lo mismo')
  // Las cercas con espacios y el `status:` repetido.
  assert.equal(CL.closedEpic('--- \nstatus: open\nstatus: active\n---'), '---\nstatus: closed\nstatus: closed\n---\n')
  assert.match(CL.idleWip('---\nstatus: Build\ntask: t\nstatus: Review\n---\n'),
    /^---\nstatus: IDLE\ntask: t\nstatus: IDLE\n/)
})
