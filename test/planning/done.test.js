'use strict'

// La evidencia de una tarea cerrada vive en su propio archivo dentro de `done/`. Lo que se comprueba acá
// es que el lector la encuentre, que el contrato la juzgue, y que el `DONE.md` de antes —que ya no se
// lee— no desaparezca en silencio si alguien lo tiene todavía.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../../engine/planning/parser')
const { spawnSync } = require('node:child_process')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

const entrada = (slug, extra = '') => `- [x] **${slug}** — Resultado
  acept: el resultado se observa
  fecha: 2026-09-08
  done: se construyó y \`make test\` salió 0
  qa: observado por el camino real
  tests: A → make test
  commit: abc1234 feat: ${slug}
${extra}`

function planning(nombre) {
  const dir = path.join(tempRoot(nombre), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  return dir
}

test('una tarea cerrada se lee desde su propio archivo', () => {
  const dir = planning('cauce-done-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta'))
  fs.writeFileSync(path.join(dir, 'done', 'baja.md'), entrada('baja'))

  const done = P.readDone(dir)
  assert.deepEqual(done.entries.map((one) => one.slug).sort(), ['alta', 'baja'])
  const alta = done.entries.find((one) => one.slug === 'alta')
  assert.equal(alta.fecha, '2026-09-08')
  // Un campo vale hasta el próximo campo **conocido**, así que `fecha` tiene que estar en el vocabulario
  // o el que lo precede se lo traga como parte de su propio texto — y la aceptación deja de ser la que
  // alguien escribió sin que nada falle.
  assert.equal(alta.acceptance, 'el resultado se observa')
  // El nombre del archivo no manda: el slug de adentro es el que identifica la tarea, igual que en
  // `DONE.md` mandaba el de la viñeta y no el del hito que la agrupaba.
  fs.renameSync(path.join(dir, 'done', 'alta.md'), path.join(dir, 'done', 'otro-nombre.md'))
  assert.ok(P.readDone(dir).set.has('alta'))
})

test('lo que hay en done/ y no es una entrada no se lee como una', () => {
  const dir = planning('cauce-done-tabla-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta'))
  // `archive human-actions` escribe una tabla en este directorio, y el README explica el formato. Ni una
  // ni otro traen entradas; leerlos como si las trajeran es lo que rompería el recorrido del directorio.
  fs.writeFileSync(path.join(dir, 'done', 'human-actions.md'),
    '| Tarea | Estado | Origen | Acción |\n|---|---|---|---|\n| algo | resuelta | QA | se aprobó |\n')
  fs.writeFileSync(path.join(dir, 'done', 'README.md'), '# Cómo se cierra\n\n- [x] **no-soy-una-tarea**\n')

  assert.deepEqual(P.readDone(dir).entries.map((one) => one.slug), ['alta'])
})

test('check exige la fecha, y nombra el DONE.md que quedó en vez de ignorarlo', () => {
  const dir = planning('cauce-done-check-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta'))
  const verde = JSON.parse(run(['check', dir, '--json']).stdout).errors.filter((one) => /alta/.test(one))
  assert.deepEqual(verde, [], 'una entrada completa en su archivo pasa')

  // Sin fecha no hay forma de saber cuál se cerró antes: con un archivo por tarea, el orden dejó de
  // estar en la posición dentro del archivo y no quedó nada que lo reemplace.
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta').replace(/ {2}fecha: .*\n/, ''))
  const sinFecha = JSON.parse(run(['check', dir, '--json']).stdout).errors.filter((one) => /alta/.test(one))
  assert.equal(sinFecha.length, 1, JSON.stringify(sinFecha))
  assert.match(sinFecha[0], /done\/alta\.md alta: falta fecha: AAAA-MM-DD/)

  // Un `DONE.md` que sobrevivió a la mudanza ya no lo lee nadie, y ésa es la forma cara del error: sus
  // épicas no pueden cerrar y sus historias figuran sin evidencia, igual que si nunca se hubieran hecho.
  fs.writeFileSync(path.join(dir, 'DONE.md'), `# Done activo\n\n${entrada('vieja')}`)
  const errors = JSON.parse(run(['check', dir, '--json']).stdout).errors
  assert.ok(errors.some((one) => /DONE\.md ya no se lee/.test(one)), JSON.stringify(errors))
  assert.equal(P.readDone(dir).set.has('vieja'), false, 'y efectivamente no cuenta como cerrada')
})

test('la misma tarea cerrada dos veces sigue siendo un error, ahora entre archivos', () => {
  const dir = planning('cauce-done-dup-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta'))
  fs.writeFileSync(path.join(dir, 'done', 'alta-otra-vez.md'), entrada('alta'))

  const errors = JSON.parse(run(['check', dir, '--json']).stdout).errors
  assert.ok(errors.some((one) => /DONE duplicado: alta/.test(one)), JSON.stringify(errors))
})

// El orden de cierre no lo puede dar el recorrido del directorio: es alfabético, y la respuesta
// equivocada se lee igual de bien que la correcta. Por eso la entrada declara su fecha.
test('sin --task, la más reciente la decide la fecha y no el nombre del archivo', () => {
  const dir = planning('cauce-done-orden-')
  // Alfabéticamente `alta` va antes que `baja`; por fecha es al revés.
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta').replace('2026-09-08', '2026-09-10'))
  fs.writeFileSync(path.join(dir, 'done', 'baja.md'), entrada('baja').replace('2026-09-08', '2026-09-09'))

  assert.equal(JSON.parse(run(['evidence', dir, '--json']).stdout).task, 'alta')
})

// El carril decide qué fases corre una tarea y su línea del BACKLOG se borra al cerrar, así que sin este
// campo la pregunta «¿recibió la ceremonia que le tocaba?» sólo la contesta quien estuvo en la sesión
// (caso 074). Las tres mitades van juntas porque cualquiera sola deja pasar a las otras dos: se lee, se
// avisa cuando falta y se falla cuando está mal.
test('el carril con el que corrió la tarea sobrevive en su entrada de DONE', () => {
  const dir = planning('cauce-done-lane-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta', '  lane: express'))
  const alta = P.readDone(dir).entries.find((one) => one.slug === 'alta')
  assert.equal(alta.lane, 'express', 'el campo se lee')
  // Y no se lo come el de arriba. Un campo vale hasta el próximo campo **conocido**, así que agregar uno
  // sin sumarlo al vocabulario lo deja adentro del valor anterior: `commit:` leía «abc1234 feat: alta
  // lane: express» y nada fallaba, porque sigue siendo texto no vacío. Es el mismo borde que la prueba de
  // `fecha:` fija más arriba, y se rompió al agregar este campo.
  assert.equal(alta.commit, 'abc1234 feat: alta', 'y el campo de arriba no se lo traga')

  const salida = JSON.parse(run(['check', dir, '--json']).stdout)
  assert.deepEqual(salida.errors.filter((one) => /alta/.test(one)), [], 'y el contrato la acepta')
  assert.deepEqual(salida.warnings.filter((one) => /sin lane:/.test(one)), [],
    'con el campo puesto no avisa nada')
})

// Falta y avisa; no falla — el porqué está en `doneEntryErrors`, junto a la decisión. Lo que se fija acá
// es que las dos mitades no se confundan: que el aviso exista **y** que el `check` siga pasando. Una sola
// de las dos deja pasar el error opuesto, y los dos ya ocurrieron en este repositorio: un aviso que en
// realidad frenaba, y una comprobación que se convirtió en aviso y nadie notó que había dejado de frenar.
test('una entrada sin carril avisa con su cuenta y no frena el check', () => {
  const dir = planning('cauce-done-sin-lane-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta'))
  fs.writeFileSync(path.join(dir, 'done', 'baja.md'), entrada('baja'))

  const salida = JSON.parse(run(['check', dir, '--json']).stdout)
  assert.deepEqual(salida.errors.filter((one) => /lane "/.test(one)), [], 'avisar no es fallar')
  assert.equal(salida.warnings.filter((one) => /2 entrada\(s\) sin lane:/.test(one)).length, 1,
    `dice cuántas son, que es lo que se mira bajar: ${JSON.stringify(salida.warnings)}`)
})

// Escrito mal sí frena, porque eso es un valor que alguien puso y de él depende leer si la ceremonia fue
// la que correspondía. Es el mismo trato que recibe un lane inventado en la línea del BACKLOG.
test('un carril que no existe en la entrada de DONE frena el check', () => {
  const dir = planning('cauce-done-lane-mal-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'), entrada('alta', '  lane: rapido'))

  const errors = JSON.parse(run(['check', dir, '--json']).stdout).errors.filter((one) => /lane "/.test(one))
  assert.equal(errors.length, 1, JSON.stringify(errors))
  assert.match(errors[0], /lane "rapido" no existe/)
  assert.match(errors[0], /sin clasificar/,
    'y nombra el vocabulario entero, incluido el que dice que la línea no lo declaraba')
})

// El carril dice cuánta ceremonia **merecía** la tarea; `review:` dice cuánta **recibió**. Es la dimensión
// que la propia ADR nombra como la que falta —«se sabría comparando hallazgos de review por carril, y hoy
// no se registra esa dimensión en DONE»—, así que sin ella el campo del 074 sabe con qué carril corrió y
// no si le correspondía (caso 076).
test('la entrada dice qué pasó con la revisión, y su ausencia se cuenta', () => {
  const dir = planning('cauce-done-review-')
  fs.writeFileSync(path.join(dir, 'done', 'alta.md'),
    entrada('alta', '  lane: full\n  review: aprobado por tech-lead, sobre api/alta.go'))
  const alta = P.readDone(dir).entries.find((one) => one.slug === 'alta')
  assert.equal(alta.review, 'aprobado por tech-lead, sobre api/alta.go', 'el campo se lee')

  const conCampo = JSON.parse(run(['check', dir, '--json']).stdout)
  assert.deepEqual(conCampo.warnings.filter((one) => /sin review:/.test(one)), [], 'con el campo no avisa')

  fs.writeFileSync(path.join(dir, 'done', 'baja.md'), entrada('baja', '  lane: full'))
  const sinCampo = JSON.parse(run(['check', dir, '--json']).stdout)
  assert.equal(sinCampo.warnings.filter((one) => /1 entrada\(s\) sin review:/.test(one)).length, 1,
    `cuenta las que no lo traen: ${JSON.stringify(sinCampo.warnings)}`)
})

// El cruce que el campo habilita, medido en sus dos direcciones dentro del mismo `check`: sin la segunda,
// un aviso que saltara siempre pasaría la primera y estaría marcando como incumplimiento el carril que
// hace lo que tiene que hacer. Contra qué se cruza y por qué esos tres carriles, en `CONVOCAN_REVISOR`.
test('un carril que convoca revisor y no la tuvo se avisa; express no', () => {
  const dir = planning('cauce-done-cruce-')
  fs.writeFileSync(path.join(dir, 'done', 'saltada.md'),
    entrada('saltada', '  lane: lite\n  review: n/a — nadie la miró'))
  fs.writeFileSync(path.join(dir, 'done', 'mecanica.md'),
    entrada('mecanica', '  lane: express\n  review: n/a — el carril express no convoca revisor'))

  const salida = JSON.parse(run(['check', dir, '--json']).stdout)
  const cruce = salida.warnings.filter((one) => /convoca revisor/.test(one))
  assert.equal(cruce.length, 1, `un solo aviso: ${JSON.stringify(salida.warnings)}`)
  assert.match(cruce[0], /saltada/, 'y nombra la tarea, que es la pregunta concreta para una persona')
  assert.doesNotMatch(cruce[0], /mecanica/, 'express no convoca revisor: ahí n/a es lo correcto')
  // Y que sea aviso se asercia, no se supone: es la diferencia entre esto y `doneEntryErrors`, y quien
  // mueva el cruce de lugar puede convertirlo en error sin notarlo. Por qué avisa, en `doneCeremonyWarnings`.
  assert.deepEqual(salida.errors.filter((one) => /revisor/.test(one)), [])
})

// Cuánto del trabajo que entró al repositorio quedó registrado. Se mide sobre un repositorio de verdad
// porque lo que se cruza son shas: un doble de git no probaría el cruce, que es lo único que puede
// fallar. Las dos direcciones van juntas: sin la segunda, un aviso que saltara siempre pasaría la
// primera y volvería inútil el número (caso 082).
test('check avisa por los commits que ninguna entrada de DONE nombra', () => {
  const ops = tempRoot('cauce-cobertura-')
  const repo = path.join(ops, 'app')
  fs.mkdirSync(repo, { recursive: true })
  fs.cpSync(MOLDE, path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'sidecar', workspaceRoots: [{ name: 'app', path: 'app' }],
  }))
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a@b')
  git('config', 'user.name', 'a')
  const commitear = (nombre) => {
    fs.writeFileSync(path.join(repo, nombre), 'x')
    git('add', nombre)
    git('commit', '-q', '-m', `feat: ${nombre}`)
    return git('rev-parse', '--short', 'HEAD').stdout.trim()
  }
  const registrado = commitear('uno.js')
  commitear('dos.js')
  commitear('tres.js')

  const cerrar = (sha) => fs.writeFileSync(path.join(ops, 'planning', 'done', 'alta.md'),
    `${entrada('alta').replace(/commit: .*/, `commit: ${sha} feat: uno.js`)}`)

  cerrar(registrado)
  const salida = JSON.parse(run(['check', path.join(ops, 'planning'), '--json']).stdout)
  const aviso = salida.warnings.filter((one) => /entrada de DONE nombra/.test(one))
  assert.equal(aviso.length, 1, `los dos que nadie nombra se cuentan: ${JSON.stringify(salida.warnings)}`)
  assert.match(aviso[0], /2 commit\(s\)/)
  assert.match(aviso[0], /app/, 'y dice en qué repositorio')
  assert.deepEqual(salida.errors.filter((one) => /entrada de DONE nombra/.test(one)), [],
    'avisa y no falla: es un hecho del pasado que no se arregla editando nada')

  // La ventana arranca en la entrada **más reciente** y no en la primera: contar toda la historia da una
  // deuda que nunca baja. Un commit anterior a la última tarea cerrada queda afuera, y eso no se ve con
  // una sola entrada — con una, las dos anclas son la misma fecha y la diferencia es inobservable.
  const antiguo = { ...process.env, GIT_AUTHOR_DATE: '2021-01-01T00:00:00', GIT_COMMITTER_DATE: '2021-01-01T00:00:00' }
  fs.writeFileSync(path.join(repo, 'viejo.js'), 'x')
  spawnSync('git', ['-C', repo, 'add', 'viejo.js'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'commit', '-q', '-m', 'feat: viejo'], { encoding: 'utf8', env: antiguo })
  // Una entrada vieja, para que la primera y la última fecha dejen de ser la misma: con una sola, las dos
  // anclas coinciden y elegir mal cuál se usa es inobservable.
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'vieja.md'),
    entrada('vieja').replace(/fecha: .*/, 'fecha: 2020-01-01'))
  // Y un merge sin registrar: no es trabajo, es la forma de integrarlo, así que no cuenta.
  spawnSync('git', ['-C', repo, 'checkout', '-q', '-b', 'rama'], { encoding: 'utf8' })
  fs.writeFileSync(path.join(repo, 'rama.js'), 'x')
  git('add', 'rama.js')
  git('commit', '-q', '-m', 'feat: rama')
  git('checkout', '-q', 'main')
  git('merge', '--no-ff', '-q', '-m', 'merge: rama', 'rama')
  const conViejo = JSON.parse(run(['check', path.join(ops, 'planning'), '--json']).stdout)
    .warnings.filter((one) => /entrada de DONE nombra/.test(one))
  assert.match(conViejo[0] || '(sin aviso)', /3 commit\(s\)/,
    `dos.js, tres.js y rama.js — el de 2021 queda fuera de la ventana y el merge no es trabajo: `
    + `${JSON.stringify(conViejo)}`)

  // La otra dirección: con todo registrado, el aviso desaparece. Sin esto, un aviso que contara mal —o
  // que contara siempre— pasaría la mitad de arriba igual.
  const todos = git('log', '--format=%h').stdout.trim().split('\n').join(' ; ')
  fs.writeFileSync(path.join(ops, 'planning', 'done', 'alta.md'),
    entrada('alta').replace(/commit: .*/, `commit: ${todos}`))
  const limpio = JSON.parse(run(['check', path.join(ops, 'planning'), '--json']).stdout)
  assert.deepEqual(limpio.warnings.filter((one) => /entrada de DONE nombra/.test(one)), [],
    'con todo registrado no dice nada')
})
