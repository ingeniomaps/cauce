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
//
// Son dos y no una: `owner` es la persona y `runner` el árbol donde corre el agente. Por default van
// juntas —una persona, una máquina—, y los casos que miden varios agentes las separan.
function como(email, fn, runner = email) {
  const previo = { owner: process.env.CAUCE_OWNER, runner: process.env.CAUCE_RUNNER }
  process.env.CAUCE_OWNER = email
  process.env.CAUCE_RUNNER = runner
  try { return fn() } finally {
    for (const [clave, valor] of [['CAUCE_OWNER', previo.owner], ['CAUCE_RUNNER', previo.runner]]) {
      if (valor === undefined) delete process.env[clave]
      else process.env[clave] = valor
    }
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
    wip: null,
    claims: [
      { slug: 'a', owner: 'luis@x', runner: 'wt-luis' },
      { slug: 'b', owner: 'ana@x', runner: 'wt-ana' },
    ],
  }

  const ana = ST.currentTask(state, [], 'wt-ana')
  assert.equal(ana.task.slug, 'b', 'lo que ya reclamé va antes que la primera libre')
  assert.equal(ana.claimed, true)
  assert.deepEqual(ana.taken, [{ slug: 'a', owner: 'luis@x' }])

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
    wip: null,
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

test('la cola tomada entera no se anuncia como cola vacía', () => {
  const dir = planning('cauce-tomada-')
  for (const slug of ['dashboard', 'boton', 'reportes']) {
    // Un runner lleva una tarea, así que tres tareas tomadas son tres runners.
    const tomada = como('ana@acme.com', () => run(['claim', dir, slug]), `wt-${slug}`)
    assert.equal(tomada.status, 0, tomada.stderr)
  }
  const luis = como('luis@acme.com', () => run(['context', dir]))
  assert.match(luis.stdout, /sin tarea disponible/)
  // Sin esto, «no hay trabajo» y «el trabajo lo tiene tu compañera» se leen igual, y la respuesta
  // correcta a cada una es distinta: buscar otra cosa, o hablar con ella.
  assert.match(luis.stdout, /^TAKEN {2}dashboard \(ana@acme\.com\)$/m)
})

// El caso que motivó separar runner de owner. Dos sesiones en la misma máquina resuelven el mismo
// `git config user.email`, así que si lo que decidiera «esto es mío» fuera la persona, el segundo agente
// recibiría la tarea del primero como propia y los dos construirían lo mismo — sin que nada falle.
test('dos agentes en la misma máquina no se llevan la tarea del otro', () => {
  const dir = planning('cauce-dos-agentes-')
  const mismaPersona = 'manuel@acme.com'

  const primera = como(mismaPersona, () => run(['claim', dir, 'dashboard']), '/w/dashboard')
  assert.equal(primera.status, 0, primera.stderr)

  const segundo = como(mismaPersona, () => run(['context', dir]), '/w/boton')
  assert.match(segundo.stdout, /^TASK {3}boton/m, 'el segundo agente no recibe lo del primero')
  assert.match(segundo.stdout, /^CLAIM {2}libre/m, 'y sabe que todavía no es suya')
  assert.match(segundo.stdout, /^TAKEN {2}dashboard/m)

  // Y compartir el id —porque nadie puso CAUCE_RUNNER— deja de ser silencioso: en vez de llevarse la
  // tarea del otro, el segundo intento choca contra el mutex del runner y el mensaje dice qué hacer.
  const mismoId = como(mismaPersona, () => run(['claim', dir, 'boton']), '/w/dashboard')
  assert.equal(mismoId.status, 1)
  assert.match(mismoId.stderr, /este runner ya tiene dashboard/)
  assert.match(mismoId.stderr, /CAUCE_RUNNER/)
})

// La carrera de verdad: dos procesos pidiendo la misma tarea a la vez. No se puede escenificar desde
// adentro —entre leer «libre» y escribir no hay dónde interponerse—, así que se corre de verdad y se
// asercia lo único que tiene que valer siempre: gana exactamente uno. Cuál de los dos frenos lo atrapa
// —la lectura previa o la creación exclusiva— depende de cómo caigan, y las dos respuestas son buenas.
test('dos reclamos simultáneos de la misma tarea los gana uno solo', async () => {
  const dir = planning('cauce-carrera-')
  const { spawn } = require('node:child_process')
  const cli = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')

  const pedir = (runner) => new Promise((resolve) => {
    const env = { ...process.env, CAUCE_OWNER: 'manuel@acme.com', CAUCE_RUNNER: runner }
    delete env.NODE_TEST_CONTEXT
    const hijo = spawn(process.execPath, [cli, 'claim', dir, 'dashboard'], { env, encoding: 'utf8' })
    let err = ''
    hijo.stderr.on('data', (chunk) => { err += chunk })
    hijo.on('close', (code) => resolve({ code, err }))
  })

  const [a, b] = await Promise.all([pedir('/w/uno'), pedir('/w/dos')])
  const ganadores = [a, b].filter((one) => one.code === 0)
  assert.equal(ganadores.length, 1, `ganaron ${ganadores.length}: ${JSON.stringify([a, b])}`)

  const reclamo = fs.readFileSync(path.join(dir, 'claims', 'dashboard.md'), 'utf8')
  const runners = ['/w/uno', '/w/dos'].filter((one) => reclamo.includes(`runner: ${one}`))
  assert.equal(runners.length, 1, 'y el archivo quedó con un solo runner adentro')
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

// Lo que sigue a una tarea en vuelo es trabajo de quien la tiene. El orden del BACKLOG lo decía solo
// mientras hubiera un runner; con dos, el segundo toma la que sigue y las dos ramas se pisan al integrar.
test('lo que depende de una tarea en vuelo no se le ofrece a otro runner', () => {
  const dir = planning('cauce-depende-')
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primero

- [ ] **modelo** [lite] — Modelo. _Aceptación: guarda._ (service: web)
- [ ] **pantalla** [lite] — Pantalla. _Aceptación: muestra._ (service: web) (depende: modelo)
- [ ] **suelta** [lite] — Otra. _Aceptación: anda._ (service: api)
`)
  assert.equal(como('ana@acme.com', () => run(['claim', dir, 'modelo']), '/w/ana').status, 0)

  const luis = como('luis@acme.com', () => run(['context', dir]), '/w/luis')
  assert.match(luis.stdout, /^TASK {3}suelta/m, 'recibe la que no depende de nada')
  assert.match(luis.stdout, /^WAIT {3}pantalla: espera a modelo \(ana@acme\.com\)$/m,
    'y sabe por qué la que sigue no está disponible, y de quién es')

  // Tampoco puede reservarla saltándose el orden: reservar lo que no se puede empezar traba la cola y
  // deja a ese runner sin poder tomar otra cosa.
  const adelantarse = como('luis@acme.com', () => run(['claim', dir, 'pantalla']), '/w/luis')
  assert.equal(adelantarse.status, 1)
  assert.match(adelantarse.stderr, /depende de modelo, que todavía no está en DONE/)
})

test('check nombra la dependencia que no existe y el ciclo entero', () => {
  const dir = planning('cauce-ciclos-')
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primero

- [ ] **a** [lite] — A. _Aceptación: x._ (service: web) (depende: b)
- [ ] **b** [lite] — B. _Aceptación: x._ (service: web) (depende: a)
- [ ] **c** [lite] — C. _Aceptación: x._ (service: web) (depende: fantasma)
`)
  const errors = JSON.parse(run(['check', dir, '--json']).stdout).errors.join('\n')
  assert.match(errors, /BACKLOG c: depende de fantasma, que no existe en BACKLOG ni DONE/)
  // El ciclo se nombra entero: decir sólo que hay uno deja el trabajo de encontrarlo del otro lado.
  assert.match(errors, /ciclo de dependencias a → b → a/)
})

// Repartir por hito es la forma más barata de que dos agentes no se crucen, y sin esto había que
// coordinarlo por fuera: `context` entregaba la primera tarea libre de toda la cola, viniera del hito que
// viniera.
test('context puede acotarse a un hito, y avisa si el hito no existe', () => {
  const dir = planning('cauce-hitos-')
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito frontend — Pantallas

- [ ] **grilla** [lite] — Grilla. _Aceptación: filtra._ (service: web)

## Hito backend — Servicios

- [ ] **endpoint** [lite] — Endpoint. _Aceptación: responde._ (service: api)
`)
  const global = como('ana@acme.com', () => run(['context', dir]), '/w/ana')
  assert.match(global.stdout, /^TASK {3}grilla/m, 'sin acotar manda la primera de la cola entera')

  const acotado = como('luis@acme.com', () => run(['context', dir, '--hito', 'backend']), '/w/luis')
  assert.match(acotado.stdout, /^TASK {3}endpoint/m)
  assert.doesNotMatch(acotado.stdout, /grilla/, 'y no cuenta lo que pasa en el otro hito')

  // Un hito mal escrito devolvería «sin tarea disponible», indistinguible de un hito terminado.
  const roto = como('luis@acme.com', () => run(['context', dir, '--hito', 'bakend']), '/w/luis')
  assert.equal(roto.status, 2)
  assert.match(roto.stderr, /el hito bakend no existe\. Hay: frontend, backend/)
})
