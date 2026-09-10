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
