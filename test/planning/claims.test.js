'use strict'

// Quién tomó qué: la reserva compartida que evita que dos runners construyan lo mismo sin enterarse.
//
// Las primeras no tocan disco —el selector recibe el estado— y por eso pueden fijar quién es quién.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const CL = require('../../engine/planning/claims')
const ST = require('../../engine/planning/state')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const done = (...slugs) => ({ entries: slugs.map((slug) => ({ slug })), set: new Set(slugs) })
const cola = (...slugs) => [{ slug: 'uno', tasks: slugs.map((slug) => ({ slug })) }]

// El CLI hereda el entorno del proceso, así que la identidad se fija por variable y se restituye: sin
// esto, una prueba le presta su dueño a la siguiente.
function como(email, fn) {
  const previo = process.env.CAUCE_OWNER
  process.env.CAUCE_OWNER = email
  try { return fn() } finally {
    if (previo === undefined) delete process.env.CAUCE_OWNER
    else process.env.CAUCE_OWNER = previo
  }
}

// Un planning de trabajo con tres tareas promovidas y nada tomado.
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

// El plazo del aviso está en el motor y escrito en palabras en el contrato que lee una persona. Es la
// misma atadura que la de los lanes y por el mismo motivo: la copia en prosa se pudre sin que nada falle,
// y quien lee el contrato es justamente quien no va a mirar el código.
test('el plazo que el contrato promete es el que el motor aplica', () => {
  const readme = fs.readFileSync(path.join(MOLDE, 'claims', 'README.md'), 'utf8')
  const palabras = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']
  assert.match(readme, new RegExp(`a los ${palabras[CL.STALE_DAYS]} días`),
    `el README no promete los ${CL.STALE_DAYS} días que avisa \`warnings\``)
})

test('lo reclamado por otro no se ofrece, y lo propio va antes que lo libre', () => {
  const state = {
    milestones: cola('a', 'b', 'c'),
    done: done(),
    wip: null,
    claims: [{ slug: 'a', owner: 'luis@x' }, { slug: 'b', owner: 'ana@x' }],
  }

  const ana = ST.currentTask(state, [], 'ana@x')
  assert.equal(ana.task.slug, 'b', 'lo que ya reclamé va antes que la primera libre')
  assert.equal(ana.claimed, true)
  assert.deepEqual(ana.taken, [{ slug: 'a', owner: 'luis@x' }])

  const tercero = ST.currentTask(state, [], 'otro@x')
  assert.equal(tercero.task.slug, 'c', 'las dos tomadas se saltean')
  assert.equal(tercero.claimed, false, 'y la que recibe está libre, que no es lo mismo que ser suya')

  // Sin reclamos la conducta es la de siempre: esto no cambia nada para quien trabaja solo.
  assert.equal(ST.currentTask({ ...state, claims: [] }, [], 'ana@x').task.slug, 'a')
})

test('check rechaza el reclamo que miente y el que reserva algo que no existe', () => {
  const errors = CL.validate({
    claims: [
      { slug: 'a', task: 'otra-tarea', owner: 'ana@x', started: '2026-09-01', at: 'claims/a.md' },
      { slug: 'b', task: 'b', owner: '', started: '2026-09-01', at: 'claims/b.md' },
      { slug: 'c', task: 'c', owner: 'ana@x', started: 'ayer', at: 'claims/c.md' },
      { slug: 'fantasma', task: 'fantasma', owner: 'ana@x', started: '2026-09-01', at: 'claims/fantasma.md' },
    ],
    milestones: cola('a', 'b', 'c'),
    done: done(),
  })
  const dice = (pattern) => errors.some((error) => pattern.test(error))
  // El nombre del archivo es lo que reserva, así que un `task` distinto bloquea una tarea y nombra otra.
  assert.ok(dice(/declara task "otra-tarea" y el archivo reserva a/))
  assert.ok(dice(/claims\/b\.md: falta owner/))
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
  assert.match(lines, /tomada hace 9 días por ana@x/)
  assert.match(lines, /2 tareas tomadas sobre web/)
  assert.doesNotMatch(lines, /sobre api/, 'una sola tarea en un servicio no es un aviso')

  // Terminada, el reclamo sobra: avisa una sola vez y no vuelve a contar su antigüedad.
  const cerrada = CL.warnings({ claims, done: done('a'), today: '2026-09-10' }).join('\n')
  assert.match(cerrada, /a ya está en DONE/)
  assert.doesNotMatch(cerrada, /tomada hace/)
})

test('dos personas no reciben la misma tarea, y la segunda no puede pisar a la primera', () => {
  const dir = planning('cauce-claims-')

  const tomada = como('ana@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(tomada.status, 0, tomada.stderr)
  assert.match(tomada.stdout, /tomada por ana@acme\.com/)
  // Un reclamo sin empujar no reserva nada, y el comando es el único lugar donde eso se puede decir.
  assert.match(tomada.stdout, /commiteá y empujá/)

  const luis = como('luis@acme.com', () => run(['context', dir]))
  assert.match(luis.stdout, /^TASK {3}boton/m, 'la tomada no se le ofrece')
  assert.match(luis.stdout, /^TAKEN {2}dashboard \(ana@acme\.com\)$/m)
  assert.match(luis.stdout, /^CLAIM {2}libre/m)

  const pisar = como('luis@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(pisar.status, 1)
  assert.match(pisar.stderr, /la tomó ana@acme\.com/)
  assert.match(pisar.stderr, /borrá claims\/dashboard\.md a mano/, 'y dice cómo, sin hacerlo por vos')

  const ajeno = como('luis@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(ajeno.status, 1, 'soltar lo de otro tampoco')

  const propio = como('ana@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(propio.status, 0, propio.stderr)
  assert.equal(fs.existsSync(path.join(dir, 'claims', 'dashboard.md')), false)
  const despues = como('luis@acme.com', () => run(['context', dir]))
  assert.match(despues.stdout, /^TASK {3}dashboard/m, 'soltada, vuelve a la cola')
})

test('sin reclamos y sin WIP en disco, check no dice nada de ninguno de los dos', () => {
  const dir = planning('cauce-sin-estado-')
  fs.rmSync(path.join(dir, 'claims'), { recursive: true })
  // Un clon nuevo no trae el WIP: es local y gitignoreado, y ausente significa IDLE.
  fs.rmSync(path.join(dir, 'WIP.md'))

  const check = JSON.parse(run(['check', dir, '--json']).stdout)
  const suyo = (one) => /claims|WIP/.test(one)
  assert.deepEqual(check.errors.filter(suyo), [], 'la ausencia de los dos archivos no es un error')
  assert.deepEqual(check.warnings.filter(suyo), [], 'y tampoco se avisa')
})

test('solo se toma trabajo promovido, y sin identidad no se toma nada', () => {
  const dir = planning('cauce-claims-bordes-')
  const inventada = como('ana@acme.com', () => run(['claim', dir, 'no-existe']))
  assert.equal(inventada.status, 2)
  assert.match(inventada.stderr, /no está en BACKLOG/)

  for (const comando of ['claim', 'release']) {
    const sinSlug = como('ana@acme.com', () => run([comando, dir]))
    assert.equal(sinSlug.status, 2, `${comando} sin tarea`)
    assert.match(sinSlug.stderr, /Falta el slug/)
  }
  const sueltaLibre = como('ana@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(sueltaLibre.status, 2)
  assert.match(sueltaLibre.stderr, /no está tomada por nadie/)

  // Volver a tomar lo propio no falla: un runner que reintenta después de una interrupción tiene que
  // poder correr el mismo comando sin que el segundo intento parezca un error.
  assert.equal(como('ana@acme.com', () => run(['claim', dir, 'dashboard'])).status, 0)
  const otraVez = como('ana@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(otraVez.status, 0, otraVez.stderr)
  assert.match(otraVez.stdout, /ya era tuya desde \d{4}-\d{2}-\d{2}/)

  // Una máquina sin identidad de git: se apagan las dos configuraciones que `git config` consultaría.
  // Es la única forma de llegar a esa rama sin depender de cómo esté configurada la máquina que corre
  // la prueba — y `CAUCE_OWNER` vacío no sirve, porque una variable vacía es una variable sin poner.
  const previo = { ...process.env }
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  delete process.env.CAUCE_OWNER
  const anonima = run(['claim', dir, 'reportes'])
  process.env.GIT_CONFIG_GLOBAL = previo.GIT_CONFIG_GLOBAL || ''
  process.env.GIT_CONFIG_SYSTEM = previo.GIT_CONFIG_SYSTEM || ''
  assert.equal(anonima.status, 2, anonima.stdout)
  assert.match(anonima.stderr, /No sé quién sos/)
})
