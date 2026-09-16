'use strict'

// A quién se le ofrece cada tarea, y de qué avisa `check`. Es lo que decide el selector y lo único que
// no se puede leer del disco después: lo que queda escrito es el reclamo, no a quién se le ofreció.
//
// Se mide en memoria, sobre el estado que el motor recibe, y por eso vive aparte: lo que pasa cuando dos
// agentes de verdad compiten por la misma tarea es de `claims.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const CL = require('../../engine/planning/claims')
const ST = require('../../engine/planning/state')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const done = (...slugs) => ({ entries: slugs.map((slug) => ({ slug })), set: new Set(slugs) })
const cola = (...slugs) => [{ slug: 'uno', tasks: slugs.map((slug) => ({ slug })) }]

// El plazo del aviso está en el motor y escrito en palabras en el contrato que lee una persona. Es la
// misma atadura que la de los lanes y por el mismo motivo: la copia en prosa se pudre sin que nada falle,
// y quien lee el contrato es justamente quien no va a mirar el código.
test('el plazo que el contrato promete es el que el motor aplica', () => {
  const readme = fs.readFileSync(path.join(MOLDE, 'claims', 'README.md'), 'utf8')
  const palabras = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']
  assert.match(readme, new RegExp(`a los ${palabras[CL.STALE_DAYS]} días`),
    `el README no promete los ${CL.STALE_DAYS} días que avisa \`warnings\``)
})

test('el runner sale de la variable y, sin ella, del árbol donde corre el proceso', () => {
  const previo = process.env.CAUCE_RUNNER
  process.env.CAUCE_RUNNER = '/w/propio'
  assert.equal(CL.runner(), '/w/propio')
  // Sin variable se deduce, y lo que importa es que devuelva algo: un runner sin id no distingue a nadie
  // de nadie, y ahí el reclamo deja de reservar sin que nada falle.
  delete process.env.CAUCE_RUNNER
  assert.match(CL.runner(), /^\/.+/)
  if (previo === undefined) delete process.env.CAUCE_RUNNER
  else process.env.CAUCE_RUNNER = previo
})

test('lo reclamado por otro no se ofrece, y lo propio va antes que lo libre', () => {
  const state = {
    milestones: cola('a', 'b', 'c'),
    done: done(),
    wips: [],
    claims: [
      { slug: 'a', owner: 'luis@x', runner: 'wt-luis' },
      { slug: 'b', owner: 'ana@x', runner: 'wt-ana' },
    ],
  }

  const ana = ST.currentTask(state, [], 'wt-ana')
  assert.equal(ana.task.slug, 'b', 'lo que ya reclamé va antes que la primera libre')
  assert.equal(ana.claimed, true)
  assert.deepEqual(ana.taken, [{ slug: 'a', owner: 'luis@x', runner: 'wt-luis', wip: '' }])

  const tercero = ST.currentTask(state, [], 'wt-otro')
  assert.equal(tercero.task.slug, 'c', 'las dos tomadas se saltean')
  assert.equal(tercero.claimed, false, 'y la que recibe está libre, que no es lo mismo que ser suya')

  // Sin reclamos la conducta es la de siempre: esto no cambia nada para quien trabaja solo.
  assert.equal(ST.currentTask({ ...state, claims: [] }, [], 'wt-ana').task.slug, 'a')
})

test('una tarea que espera algo que nadie tomó espera igual, y sin dueño', () => {
  const state = {
    milestones: [{ slug: 'uno', tasks: [{ slug: 'cabeza', depends: [] }, { slug: 'sigue', depends: ['cabeza'] }] }],
    done: done(),
    wips: [],
    claims: [],
  }
  const libre = ST.currentTask(state, [], 'wt-uno')
  assert.equal(libre.task.slug, 'cabeza', 'se ofrece la que no espera nada')
  // Sin nadie que la tenga, el dueño va vacío: no está reservada para otro, está sin empezar.
  assert.deepEqual(libre.waiting, [{ slug: 'sigue', dep: 'cabeza', owner: '' }])

  // Y con la cabeza cerrada deja de esperar.
  const cerrada = ST.currentTask({ ...state, done: done('cabeza') }, [], 'wt-uno')
  assert.equal(cerrada.task.slug, 'sigue')
  assert.deepEqual(cerrada.waiting, [])
})

test('check rechaza el reclamo que miente y el que reserva algo que no existe', () => {
  const errors = CL.validate({
    claims: [
      { slug: 'a', task: 'otra-tarea', owner: 'ana@x', runner: 'w', started: '2026-09-01', at: 'claims/a.md' },
      { slug: 'b', task: 'b', owner: '', runner: '', started: '2026-09-01', at: 'claims/b.md' },
      { slug: 'c', task: 'c', owner: 'ana@x', runner: 'w', started: 'ayer', at: 'claims/c.md' },
      {
        slug: 'fantasma', task: 'fantasma', owner: 'ana@x', runner: 'w',
        started: '2026-09-01', at: 'claims/fantasma.md',
      },
    ],
    milestones: cola('a', 'b', 'c'),
    done: done(),
  })
  const dice = (pattern) => errors.some((error) => pattern.test(error))
  // El nombre del archivo es lo que reserva, así que un `task` distinto bloquea una tarea y nombra otra.
  assert.ok(dice(/declara task "otra-tarea" y el archivo reserva a/))
  assert.ok(dice(/claims\/b\.md: falta owner/))
  assert.ok(dice(/claims\/b\.md: falta runner/))
  assert.ok(dice(/started debe ser AAAA-MM-DD/))
  assert.ok(dice(/fantasma no existe en BACKLOG ni DONE/))
})

test('check avisa lo viejo, lo terminado y dos tareas sobre el mismo servicio', () => {
  const claims = [
    { slug: 'a', owner: 'ana@x', started: '2026-09-01', service: 'web', at: 'claims/a.md' },
    { slug: 'b', owner: 'luis@x', started: '2026-09-10', service: 'web', at: 'claims/b.md' },
    { slug: 'c', owner: 'ana@x', started: '2026-09-10', service: 'api', at: 'claims/c.md' },
  ]
  const lines = CL.warnings({ claims, done: done(), today: '2026-09-10' }).join('\n')
  assert.match(lines, /a sin avanzar hace 9 días \(ana@x, tomada hace 9; la rama de la tarea no tiene commits\)/)
  assert.match(lines, /2 tareas tomadas sobre web/)
  assert.doesNotMatch(lines, /sobre api/, 'una sola tarea en un servicio no es un aviso')

  // El tiempo desde que se tomó no distingue una tarea larga de una abandonada; la rama sí. Con commits
  // de ayer no hay nada que avisar, aunque la tarea lleve nueve días tomada.
  const viva = CL.warnings({
    claims, done: done(), today: '2026-09-10', activity: new Map([['a', '2026-09-09']]),
  }).join('\n')
  assert.doesNotMatch(viva, /sin avanzar/, 'una tarea que avanza no se apura')

  // Y una que se movió hace tiempo avisa con ese número, no con el de cuándo se tomó.
  const quieta = CL.warnings({
    claims, done: done(), today: '2026-09-10', activity: new Map([['a', '2026-09-02']]),
  }).join('\n')
  assert.match(quieta, /a sin avanzar hace 8 días \(ana@x, tomada hace 9; último commit hace 8 días\)/)

  // Terminada, el reclamo sobra: avisa una sola vez y no vuelve a contar su antigüedad.
  const cerrada = CL.warnings({ claims, done: done('a'), today: '2026-09-10' }).join('\n')
  assert.match(cerrada, /a ya está en DONE/)
  assert.doesNotMatch(cerrada, /tomada hace/)
})


// El bug que apareció preguntando qué pasa al volver al día siguiente: con `mode: sidecar` hay un solo
// `planning/` por máquina, así que un plan compartido lo escriben todos los agentes que corren ahí. El
// segundo recibía la tarea que el primero estaba construyendo, con el plan ajeno adentro y diciéndole
// que estaba libre. Ninguna prueba lo veía porque todas corrían con un solo runner.
test('el plan de otro runner no se lee como propio', () => {
  const state = {
    milestones: [{ slug: 'uno', tasks: [{ slug: 'modelo', depends: [] }, { slug: 'grilla', depends: [] }] }],
    done: done(),
    wips: [{ task: 'modelo', runner: 'w-ana', phase: 'Build', complete: 1, pending: 1 }],
    claims: [{ slug: 'modelo', owner: 'ana@x', runner: '/w/ana' }],
  }

  const ana = ST.currentTask(state, [], '/w/ana')
  assert.equal(ana.task.slug, 'modelo', 'ana continúa el suyo, que es lo que el WIP existe para permitir')

  const luis = ST.currentTask(state, [], '/w/luis')
  assert.equal(luis.task.slug, 'grilla', 'y luis recibe otra, no la que ana está construyendo')
  assert.deepEqual(luis.taken, [{ slug: 'modelo', owner: 'ana@x', runner: '/w/ana', wip: 'w-ana.md' }],
    'con el reclamo de ana a la vista, y el plan que ese id dejó escrito')
})
