'use strict'

// La reserva compartida que evita que dos runners construyan lo mismo sin enterarse, medida como se vive:
// dos agentes contra una instancia en disco.
//
// A quién se le ofrece cada tarea antes de que nadie la reclame es de `claims-offer.test.js`.

const { tempRoot, run, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
// El CLI que se le pega a un shell: lo que imprime el rechazo se corre como lo correría una persona.
const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')

const TEMPLATE_PLANNING = path.resolve(__dirname, '..', '..', 'template', 'planning')

// El CLI hereda el entorno del proceso, así que la identidad se fija por variable y se restituye: sin
// esto, una prueba le presta su dueño a la siguiente.
//
// Son dos y no una: `owner` es la persona y `runner` el árbol donde corre el agente. Por default van
// juntas —una persona, una máquina—, y los casos que miden varios agentes las separan.
function as(email, fn, runner = email) {
  const previous = { owner: process.env.CAUCE_OWNER, runner: process.env.CAUCE_RUNNER }
  process.env.CAUCE_OWNER = email
  process.env.CAUCE_RUNNER = runner
  try { return fn() } finally {
    for (const [key, value] of [['CAUCE_OWNER', previous.owner], ['CAUCE_RUNNER', previous.runner]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

// Un planning de trabajo con tres tareas promovidas y nada tomado.
function planning(label) {
  const dir = path.join(tempRoot(label), 'planning')
  fs.cpSync(TEMPLATE_PLANNING, dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primer resultado

- [ ] **dashboard** [lite] — Grilla. _Aceptación: filtra por fecha._ (service: web)
- [ ] **boton** [lite] — Botón. _Aceptación: baja un CSV._ (service: web)
- [ ] **reportes** [lite] — Endpoint. _Aceptación: responde 200._ (service: api)
`)
  return dir
}

test('dos personas no reciben la misma tarea, y la segunda no puede pisar a la primera', () => {
  const dir = planning('cauce-claims-')

  const taken = as('ana@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(taken.status, 0, taken.stderr)
  assert.match(taken.stdout, /tomada por ana@acme\.com/)
  // Un reclamo sin empujar no reserva nada, y el comando es el único lugar donde eso se puede decir.
  assert.match(taken.stdout, /commiteá claims\/dashboard\.md/)

  const luis = as('luis@acme.com', () => run(['context', dir]))
  assert.match(luis.stdout, /^TASK {3}boton/m, 'la tomada no se le ofrece')
  assert.match(luis.stdout, /^TAKEN {2}dashboard \(ana@acme\.com\)$/m)
  assert.match(luis.stdout, /^CLAIM {2}libre/m)

  const overwrite = as('luis@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(overwrite.status, 1)
  assert.match(overwrite.stderr, /la tomó ana@acme\.com/)
  assert.match(overwrite.stderr, /borrá claims\/dashboard\.md a mano/, 'y dice cómo, sin hacerlo por vos')

  const foreign = as('luis@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(foreign.status, 1, 'soltar lo de otro tampoco')
  assert.match(foreign.stderr, /dashboard es de ana@acme\.com\. Si se abandonó, borrá claims\/dashboard\.md a mano/)

  const own = as('ana@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(own.status, 0, own.stderr)
  assert.equal(fs.existsSync(path.join(dir, 'claims', 'dashboard.md')), false)
  const later = as('luis@acme.com', () => run(['context', dir]))
  assert.match(later.stdout, /^TASK {3}dashboard/m, 'soltada, vuelve a la cola')
})

// Caso 412: el reclamo de una tarea ya en DONE lo suelta cualquiera, y uno de una tarea en curso de otro se sigue
// negando, como arriba. El porqué, en `release` de `engine/cli/claims.js`.
test('el reclamo de una tarea cerrada lo suelta quien la cerró, aunque la haya tomado otro', () => {
  const dir = planning('cauce-claims-cerrada-')
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard'])).status, 0)
  const other = { CAUCE_RUNNER: 'otro' }
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'boton'], undefined, other)).status, 0)
  const backlog = path.join(dir, 'BACKLOG.md')
  fs.writeFileSync(backlog, fs.readFileSync(backlog, 'utf8').replace(/^- \[ \] \*\*dashboard\*\*.*\n/m, ''))
  fs.writeFileSync(path.join(dir, 'done', 'dashboard.md'), '- [x] **dashboard** — Grilla\n  acept: filtra por fecha\n'
    + '  fecha: 2026-10-20\n  done: cerrada\n  qa: n/a — prueba\n  tests: A → npm test\n  commit: n/a — prueba\n'
    + '  lane: lite\n  review: aprobado por el revisor\n')
  const checked = () => { const out = run(['check', dir]); return `${out.stdout}${out.stderr}` }
  assert.match(checked(), /dashboard ya está en DONE; soltala con `ops release`/)

  const reviewer = as('luis@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(reviewer.status, 0, reviewer.stderr)
  assert.match(reviewer.stdout, /✓ dashboard soltada: ya estaba en DONE, el reclamo no reservaba nada/)
  assert.doesNotMatch(reviewer.stdout, /volvió a la cola/, 'no vuelve a ninguna cola')
  assert.equal(fs.existsSync(path.join(dir, 'claims', 'dashboard.md')), false)
  assert.doesNotMatch(checked(), /ya está en DONE/)
  // La que sigue en curso es de otro, y eso no cambió.
  const foreign = as('luis@acme.com', () => run(['release', dir, 'boton']))
  assert.equal(foreign.status, 1)
  assert.match(foreign.stderr, /boton es de ana@acme\.com/)
})

test('la cola tomada entera no se anuncia como cola vacía', () => {
  const dir = planning('cauce-tomada-')
  for (const slug of ['dashboard', 'boton', 'reportes']) {
    // Un runner lleva una tarea, así que tres tareas tomadas son tres runners.
    const taken = as('ana@acme.com', () => run(['claim', dir, slug]), `wt-${slug}`)
    assert.equal(taken.status, 0, taken.stderr)
  }
  const luis = as('luis@acme.com', () => run(['context', dir]))
  assert.match(luis.stdout, /sin tarea disponible/)
  // Sin esto, «no hay trabajo» y «el trabajo lo tiene tu compañera» se leen igual, y la respuesta
  // correcta a cada una es distinta: buscar otra cosa, o hablar con ella.
  assert.match(luis.stdout, /^TAKEN {2}dashboard \(ana@acme\.com\)$/m)
})

// El caso que motivó separar runner de owner, explicado en `runner` (engine/planning/claims.js): la misma
// persona reclama desde dos árboles y cada uno ve sólo lo suyo.
test('dos agentes en la misma máquina no se llevan la tarea del otro', () => {
  const dir = planning('cauce-dos-agentes-')
  const samePerson = 'manuel@acme.com'

  const first = as(samePerson, () => run(['claim', dir, 'dashboard']), '/w/dashboard')
  assert.equal(first.status, 0, first.stderr)

  const second = as(samePerson, () => run(['context', dir]), '/w/boton')
  assert.match(second.stdout, /^TASK {3}boton/m, 'el segundo agente no recibe lo del primero')
  assert.match(second.stdout, /^CLAIM {2}libre/m, 'y sabe que todavía no es suya')
  assert.match(second.stdout, /^TAKEN {2}dashboard/m)

  // Y compartir el id —porque nadie puso CAUCE_RUNNER— deja de ser silencioso: en vez de llevarse la
  // tarea del otro, el segundo intento choca contra el mutex del runner y el mensaje dice qué hacer.
  const sameId = as(samePerson, () => run(['claim', dir, 'boton']), '/w/dashboard')
  assert.equal(sameId.status, 1)
  assert.match(sameId.stderr, /este runner ya tiene dashboard/)
  assert.match(sameId.stderr, /CAUCE_RUNNER/)
})

// La carrera de verdad: dos procesos pidiendo la misma tarea a la vez. No se puede escenificar desde
// adentro —entre leer «libre» y escribir no hay dónde interponerse—, así que se corre de verdad y se
// asercia lo único que tiene que valer siempre: gana exactamente uno. Cuál de los dos frenos lo atrapa
// —la lectura previa o la creación exclusiva— depende de cómo caigan, y las dos respuestas son buenas.
test('dos reclamos simultáneos de la misma tarea los gana uno solo', async () => {
  const dir = planning('cauce-carrera-')
  const { spawn } = require('node:child_process')
  const cli = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')

  const ask = (runner) => new Promise((resolve) => {
    const env = { ...process.env, CAUCE_OWNER: 'manuel@acme.com', CAUCE_RUNNER: runner }
    delete env.NODE_TEST_CONTEXT
    const child = spawn(process.execPath, [cli, 'claim', dir, 'dashboard'], { env, encoding: 'utf8' })
    let err = ''
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('close', (code) => resolve({ code, err }))
  })

  const [a, b] = await Promise.all([ask('/w/uno'), ask('/w/dos')])
  const winners = [a, b].filter((one) => one.code === 0)
  assert.equal(winners.length, 1, `ganaron ${winners.length}: ${JSON.stringify([a, b])}`)

  const claim = fs.readFileSync(path.join(dir, 'claims', 'dashboard.md'), 'utf8')
  const runners = ['/w/uno', '/w/dos'].filter((one) => claim.includes(`runner: ${one}`))
  assert.equal(runners.length, 1, 'y el archivo quedó con un solo runner adentro')
})

test('sin reclamos y sin WIP en disco, check no dice nada de ninguno de los dos', () => {
  const dir = planning('cauce-sin-estado-')
  discard(path.join(dir, 'claims'))
  // Un clon nuevo no trae ningún plan: `wip/` es local y gitignoreado, y sin archivo el runner está IDLE.
  assert.equal(fs.existsSync(path.join(dir, 'wip', 'cualquiera.md')), false)

  const check = JSON.parse(run(['check', dir, '--json']).stdout)
  const theirs = (one) => /claims|WIP/.test(one)
  assert.deepEqual(check.errors.filter(theirs), [], 'la ausencia de los dos archivos no es un error')
  assert.deepEqual(check.warnings.filter(theirs), [], 'y tampoco se avisa')
})

test('solo se toma trabajo promovido, y sin identidad no se toma nada', () => {
  const dir = planning('cauce-claims-bordes-')
  const invented = as('ana@acme.com', () => run(['claim', dir, 'no-existe']))
  assert.equal(invented.status, 2)
  assert.match(invented.stderr, /no está en BACKLOG/)

  for (const command of ['claim', 'release']) {
    const withoutSlug = as('ana@acme.com', () => run([command, dir]))
    assert.equal(withoutSlug.status, 2, `${command} sin tarea`)
    assert.match(withoutSlug.stderr, /Falta el slug/)
    // Y sin decir dónde: los dos toman el directorio actual, que es como se los corre parado adentro.
    const withoutDir = as('ana@acme.com', () => run([command], dir))
    assert.equal(withoutDir.status, 2, `${command} desde adentro del planning`)
    assert.match(withoutDir.stderr, /Falta el slug/)
  }
  const releasedFree = as('ana@acme.com', () => run(['release', dir, 'dashboard']))
  assert.equal(releasedFree.status, 2)
  assert.match(releasedFree.stderr, /no está tomada por nadie/)

  // Volver a tomar lo propio no falla: un runner que reintenta después de una interrupción tiene que
  // poder correr el mismo comando sin que el segundo intento parezca un error.
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard'])).status, 0)
  const again = as('ana@acme.com', () => run(['claim', dir, 'dashboard']))
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /ya era tuya desde \d{4}-\d{2}-\d{2}/)

  // Una máquina sin identidad de git: se apagan las dos configuraciones que `git config` consultaría.
  // Es la única forma de llegar a esa rama sin depender de cómo esté configurada la máquina que corre
  // la prueba — y `CAUCE_OWNER` vacío no sirve, porque una variable vacía es una variable sin poner.
  const previous = { ...process.env }
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  delete process.env.CAUCE_OWNER
  const anonymous = run(['claim', dir, 'reportes'])
  process.env.GIT_CONFIG_GLOBAL = previous.GIT_CONFIG_GLOBAL || ''
  process.env.GIT_CONFIG_SYSTEM = previous.GIT_CONFIG_SYSTEM || ''
  assert.equal(anonymous.status, 2, anonymous.stdout)
  assert.match(anonymous.stderr, /No sé quién sos/)
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
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'modelo']), '/w/ana').status, 0)

  const luis = as('luis@acme.com', () => run(['context', dir]), '/w/luis')
  assert.match(luis.stdout, /^TASK {3}suelta/m, 'recibe la que no depende de nada')
  assert.match(luis.stdout, /^WAIT {3}pantalla: espera a modelo \(ana@acme\.com\)$/m,
    'y sabe por qué la que sigue no está disponible, y de quién es')

  // Tampoco puede reservarla saltándose el orden: reservar lo que no se puede empezar traba la cola y
  // deja a ese runner sin poder tomar otra cosa.
  const ahead = as('luis@acme.com', () => run(['claim', dir, 'pantalla']), '/w/luis')
  assert.equal(ahead.status, 1)
  assert.match(ahead.stderr, /depende de modelo, que todavía no está en DONE/)
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
  const global = as('ana@acme.com', () => run(['context', dir]), '/w/ana')
  assert.match(global.stdout, /^TASK {3}grilla/m, 'sin acotar manda la primera de la cola entera')

  const bounded = as('luis@acme.com', () => run(['context', dir, '--hito', 'backend']), '/w/luis')
  assert.match(bounded.stdout, /^TASK {3}endpoint/m)
  assert.doesNotMatch(bounded.stdout, /grilla/, 'y no cuenta lo que pasa en el otro hito')

  // Un hito mal escrito devolvería «sin tarea disponible», indistinguible de un hito terminado.
  const broken = as('luis@acme.com', () => run(['context', dir, '--hito', 'bakend']), '/w/luis')
  assert.equal(broken.status, 2)
  assert.match(broken.stderr, /el hito bakend no existe\. Hay: frontend, backend/)
})

// Encontrado corriendo un equipo de verdad, no en una prueba: `--hito` sobre otro hito le ofrecía a
// quien ya sostenía una tarea una segunda que `ops claim` después se niega a dar. El comando que dice
// qué hacer y el que lo autoriza contestaban distinto, y la contradicción sólo se veía al reclamar.
test('acotar por hito no esconde la tarea que ya tenés', () => {
  const dir = planning('cauce-hito-propio-')
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), `# Backlog promovido

## Hito backend — Servicios

- [ ] **endpoint** [lite] — Endpoint. _Aceptación: responde._ (service: api)

## Hito frontend — Pantallas

- [ ] **boton** [lite] — Botón. _Aceptación: exporta._ (service: web)
`)
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'endpoint']), '/w/ana').status, 0)

  const bounded = as('ana@acme.com', () => run(['context', dir, '--hito', 'frontend']), '/w/ana')
  assert.match(bounded.stdout, /^TASK {3}endpoint/m, 'devuelve la suya, no una del hito pedido')
  assert.match(bounded.stdout, /^HITO {3}frontend no se aplica: ya tenés endpoint tomada$/m,
    'y dice por qué el filtro no se aplicó, en vez de ignorarlo en silencio')

  // Sin reclamo abierto el filtro sí acota: lo que no puede es taparte lo que ya sostenés.
  assert.equal(as('ana@acme.com', () => run(['release', dir, 'endpoint']), '/w/ana').status, 0)
  const free = as('ana@acme.com', () => run(['context', dir, '--hito', 'frontend']), '/w/ana')
  assert.match(free.stdout, /^TASK {3}boton/m)
  assert.doesNotMatch(free.stdout, /^HITO/m)
})

// Volver al día siguiente y volver como un segundo agente se ven idénticos desde el archivo, y las dos
// salidas automáticas rompen trabajo: retomar sola le saca la tarea al otro agente, y crear un runner
// nuevo deja dos construyendo lo mismo. Lo único correcto es decir cuál es cuál y que decida una persona.
test('tu propio reclamo desde otro runner se reconoce, no se resuelve solo', () => {
  const dir = planning('cauce-retomar-')
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ayer').status, 0)

  // Ana vuelve sin reponer su id: la tarea sigue siendo suya y el mensaje lo dice, con el id que repone.
  const today = as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/hoy')
  assert.equal(today.status, 1)
  assert.match(today.stderr, /la tenés vos, tomada el \d{4}-\d{2}-\d{2} desde el runner \/w\/ayer/)
  // Y manda a preguntar, no a decidir: las dos salidas automáticas rompen trabajo.
  assert.match(today.stderr, /Preguntá si se retoma esa sesión/)
  assert.match(today.stderr, /o si es otro agente en paralelo, que toma otra tarea/)
  assert.match(today.stderr, /ops runners/, 'y dice dónde ver lo que hay abierto')

  // Soltarla desde el id de hoy frena igual, y dice lo mismo que `claim`: es tuya, y con qué id se suelta (caso 432).
  const released = as('ana@acme.com', () => run(['release', dir, 'dashboard']), '/w/hoy')
  assert.equal(released.status, 1)
  assert.match(released.stderr, /la tenés vos, tomada el \d{4}-\d{2}-\d{2} desde el runner \/w\/ayer/)
  assert.match(released.stderr, /CAUCE_RUNNER=\/w\/ayer/)
  assert.doesNotMatch(released.stderr, /es de ana@acme\.com/)

  // Un id con un espacio, y una instancia bajo una carpeta con otro: el comando que imprime sale citado y, pegado
  // entero en un shell desde donde se corrió, suelta (caso 432).
  const spaced = planning('cauce retomar espacio-')
  assert.equal(as('ana@acme.com', () => run(['claim', spaced, 'boton']), '/w/mis repos').status, 0)
  const refused = as('ana@acme.com', () => run(['release', spaced, 'boton']), '/w/hoy')
  const printed = (refused.stderr.match(/soltala con su id: (.+)$/m) || [])[1] || ''
  assert.match(printed, /^CAUCE_RUNNER='\/w\/mis repos' node tools\/ops\.js release '[^']+' boton$/)
  const pasted = spawnSync('bash', ['-c', printed.replace('node tools/ops.js', `"${process.execPath}" "${CLI}"`)],
    { cwd: path.dirname(CLI), encoding: 'utf8',
      env: { ...process.env, CAUCE_OWNER: 'ana@acme.com', NODE_TEST_CONTEXT: '' } })
  assert.equal(pasted.status, 0, pasted.stderr)

  const seen = as('ana@acme.com', () => run(['context', dir]), '/w/hoy')
  assert.match(seen.stdout, /^TAKEN {2}dashboard \(ana@acme\.com — vos, desde otro runner\)$/m)

  // Con el id repuesto, retoma sin ceremonia.
  const resumed = as('ana@acme.com', () => run(['context', dir]), '/w/ayer')
  assert.match(resumed.stdout, /^TASK {3}dashboard/m)
  assert.match(resumed.stdout, /^CLAIM {2}tuya desde el reclamo/m)

  // Y el reclamo de otra persona sigue diciéndose como lo que es.
  const foreign = as('luis@acme.com', () => run(['claim', dir, 'dashboard']), '/w/luis')
  assert.match(foreign.stderr, /la tomó ana@acme\.com/)
  assert.doesNotMatch(foreign.stderr, /vos/)
})


// Volver al día siguiente pide reponer el id, y el README del `wip/` lo dice nombrando a `ops worktree`
// como quien lo imprime. En sidecar no hay worktrees —la instancia es una sola, compartida—, así que ese
// comando no corre nunca y el id no queda escrito en ninguna parte que una persona vaya a mirar: hay que
// deducirlo del reclamo, que es justo lo que el reclamo existe para no tener que hacer.
test('claim deja escrito el id con el que se vuelve', () => {
  const dir = planning('cauce-claim-id-')
  const done = as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ana')
  assert.equal(done.status, 0)
  assert.match(done.stdout, /export CAUCE_RUNNER=\/w\/ana/, 'el id con el que se retoma esta sesión')
})

test('dos agentes en una instancia sidecar no comparten el plan', () => {
  const dir = planning('cauce-wip-sidecar-')
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ana').status, 0)
  fs.mkdirSync(path.join(dir, 'wip'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'wip', 'w-ana.md'),
    '---\ntask: dashboard\nphase: Build\nservice: web\n---\n\n## Plan aprobado\n1. [x] Uno\n2. [ ] Dos\n')

  const theirs = as('ana@acme.com', () => run(['context', dir]), '/w/ana')
  assert.match(theirs.stdout, /^TASK {3}dashboard/m)
  assert.match(theirs.stdout, /^WIP {4}Build · 1✓\/1○$/m, 'ana retoma su plan donde lo dejó')

  const other = as('luis@acme.com', () => run(['context', dir]), '/w/luis')
  assert.doesNotMatch(other.stdout, /^TASK {3}dashboard/m, 'luis no recibe la tarea que ana construye')
  assert.match(other.stdout, /^WIP {4}idle$/m, 'ni el plan de ana como si fuera suyo')
})

// Las tres respuestas que un agente necesita para preguntar bien: ninguno, varios con su tarea, y —la que
// se olvida— que lo cerrado desaparezca. Un runner que figura por una tarea ya terminada haría preguntar
// por trabajo que no existe, y esa pregunta se contesta mal sin que nada falle.
test('runners dice quién tiene trabajo abierto, y calla cuando no hay', () => {
  const dir = planning('cauce-runners-')
  assert.match(run(['runners', dir]).stdout, /ningún runner tiene trabajo abierto/)

  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/uno').status, 0)
  assert.equal(as('luis@acme.com', () => run(['claim', dir, 'boton']), '/w/dos').status, 0)

  const list = run(['runners', dir])
  assert.match(list.stdout, /^\/w\/uno\s+dashboard\s+\(ana@acme\.com, desde \d{4}-\d{2}-\d{2}; sin commits/m)
  assert.match(list.stdout, /^\/w\/dos\s+boton\s+\(luis@acme\.com/m)
  assert.match(list.stdout, /2 runner\(s\) con trabajo abierto/)

  const json = JSON.parse(run(['runners', dir, '--json']).stdout)
  assert.deepEqual(json.map((one) => one.runner).sort(), ['/w/dos', '/w/uno'])
  assert.deepEqual(json.map((one) => one.task).sort(), ['boton', 'dashboard'])

  // Cerrada la tarea, su runner deja de figurar: lo que se lista es trabajo abierto, no historia.
  fs.writeFileSync(path.join(dir, 'done', 'dashboard.md'), '- [x] **dashboard** — Hecha\n'
    + '  acept: x\n  fecha: 2026-09-08\n  done: y\n  qa: z\n'
    + '  tests: A → make test\n  commit: abc1234 feat: d\n')
  assert.deepEqual(JSON.parse(run(['runners', dir, '--json']).stdout).map((one) => one.task), ['boton'])
})

// `context` saltea la tarea con una fila pendiente en HUMAN_ACTIONS y la ofrece como la siguiente; `claim`
// no miraba la tabla y la reservaba igual, con lo que el runner quedaba con una tarea que nadie podía
// avanzar y sin poder tomar otra (caso 336). Es el mismo desacuerdo entre los dos comandos que el 239
// cerró para las líneas: lo que uno no ofrece, el otro no reserva.
test('claim no reserva una tarea con acción humana pendiente, y sí cuando la fila se resolvió', () => {
  const dir = planning('cauce-humana-')
  const table = (state) => fs.writeFileSync(path.join(dir, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| dashboard | ${state} | Ready | Elegir el proveedor de email y dejar la credencial en el entorno. |
`)
  table('pendiente')
  const context = as('ana@acme.com', () => run(['context', dir]), '/w/ana')
  assert.match(context.stdout, /^SKIP {3}dashboard/m, 'context la saltea')

  const take = as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ana')
  assert.equal(take.status, 1, take.stdout)
  assert.match(take.stderr, /dashboard espera una acción humana/)
  assert.match(take.stderr, /Elegir el proveedor de email/, 'y dice cuál')
  assert.equal(fs.existsSync(path.join(dir, 'claims', 'dashboard.md')), false, 'no quedó reservada')

  table('resuelta 2026-10-08')
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ana').status, 0)
})

// `context` honra el WIP propio aunque la tarea tenga una acción humana abierta —el plan en vuelo manda—, así
// que `claim` tiene que dejar retomarla desde ese mismo runner: negarse ahí era el desacuerdo entre los dos
// comandos que el 336 vino a cerrar, visto desde el otro lado (revisión del conjunto).
test('claim deja retomar la tarea del WIP propio aunque tenga una acción humana pendiente', () => {
  const dir = planning('cauce-humana-wip-')
  fs.writeFileSync(path.join(dir, 'HUMAN_ACTIONS.md', ), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| dashboard | pendiente | Ready | Elegir el proveedor. |
`)
  const P = require('../../engine/planning/parser')
  fs.mkdirSync(path.join(dir, 'wip'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'wip', `${P.wipName('/w/ana')}.md`), `---
task: dashboard
hito: "Hito uno — Primer resultado"
epic: ""
phase: Build
started: 2026-10-08
service: web
acceptance: "filtra por fecha"
lane: lite
---

## Plan aprobado
1. [ ] Paso
`)
  const context = as('ana@acme.com', () => run(['context', dir]), '/w/ana')
  assert.match(context.stdout, /^TASK {3}dashboard/m, 'context la ofrece: el WIP manda')
  assert.equal(as('ana@acme.com', () => run(['claim', dir, 'dashboard']), '/w/ana').status, 0,
    'y claim la deja retomar')
  assert.equal(as('luis@acme.com', () => run(['claim', dir, 'dashboard']), '/w/luis').status, 1, 'otro runner no')
})

// Sin identidad de git los dos dueños son la cadena vacía, y la vacía no es nadie: un reclamo sin dueño no es «tuyo», y
// tratarlo así invitaba a soltar la tarea de otra sesión prestándole su id. Pasa en un CI o una máquina sin
// `user.email`, con un reclamo escrito a mano.
test('sin identidad, un reclamo sin dueño no se toma por propio', () => {
  const dir = planning('cauce-sin-dueno-')
  fs.writeFileSync(path.join(dir, 'claims', 'dashboard.md'),
    '---\ntask: dashboard\nowner: \nrunner: /w/otro\nstarted: 2026-10-01\nservice: web\n---\n')
  const nobody = { CAUCE_OWNER: '', CAUCE_RUNNER: '/w/hoy', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  const released = run(['release', dir, 'dashboard'], undefined, nobody)
  assert.equal(released.status, 1)
  assert.doesNotMatch(released.stderr, /la tenés vos|soltala con su id/, released.stderr)
  assert.doesNotMatch(run(['context', dir], undefined, nobody).stdout, /vos, desde otro runner/)
})
