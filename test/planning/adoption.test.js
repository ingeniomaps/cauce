'use strict'

// Adoptar Cauce en un proyecto que ya tiene historia. Lo que se mide es el contrato del perdón: a qué
// alcanza, qué sigue juzgando, y que la lista no pueda envejecer sin que nadie se entere.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const AD = require('../../engine/planning/adoption')
const PC = require('../../engine/planning/contracts')

const vieja = (slug) => ({ source: `done/${slug}.md`, slug, done: 'lo único que aquel proceso registraba' })
const estado = (entries, adopted) => ({
  epics: [],
  milestones: [{ slug: 'h', title: 'H', tasks: [] }],
  done: { entries, set: new Set(entries.map((entry) => entry.slug)), duplicates: [] },
  wip: null,
  adopted: new Set(adopted),
})

test('el baseline se lee por renglón y descarta lo que no es un slug', () => {
  const root = tempRoot('ops-adoption-read-')
  fs.writeFileSync(path.join(root, AD.BASELINE), '# Entradas anteriores (2026-09-03)\n'
    + 'tarea-de-2024\n\n  otra-de-2024  \nultima  # con nota al margen\n')

  assert.deepEqual(AD.read(root), ['tarea-de-2024', 'otra-de-2024', 'ultima'])
  assert.deepEqual(AD.read(tempRoot('ops-adoption-none-')), [], 'sin archivo no hay nada exento')
})

// La entrada del fixture trae un `commit:` con formato ajeno, así que falla por lo que no escribió y
// también por lo que sí. Las dos mitades tienen que callarse juntas; `validateState` dice por qué.
test('una entrada exenta no la juzga ninguna de las cinco comprobaciones', () => {
  const conCommitAjeno = { ...vieja('tarea-de-2024'), commit: 'r4521 · migración de cobros' }

  const sinExentar = PC.validateState(estado([conCommitAjeno], []))
  assert.ok(sinExentar.some((one) => /falta acept:/.test(one)), 'falla por lo que no escribió')
  assert.ok(sinExentar.some((one) => /commit debe apuntar/.test(one)), 'y por lo que sí escribió')

  assert.deepEqual(PC.validateState(estado([conCommitAjeno], ['tarea-de-2024'])), [])
})

test('exentar una entrada no exenta a las demás', () => {
  const errores = PC.validateState(estado([vieja('tarea-de-2024'), vieja('nueva')], ['tarea-de-2024']))

  assert.ok(errores.length, 'la que no está en la lista sigue respondiendo por sí misma')
  assert.deepEqual(errores.filter((error) => error.includes('tarea-de-2024')), [])
})

// Las tres salidas del informe en una sola corrida, incluida la que no aparece: la exención que
// todavía hace falta no dice nada. Qué gana cada aviso lo cuenta `report`.
test('el informe señala la exención que sobra y la que nombra a un fantasma', () => {
  const cumple = {
    source: 'done/ya-reescrita.md',
    slug: 'ya-reescrita',
    acceptance: 'el resultado se observa',
    fecha: '2026-09-08',
    done: 'se reescribió bajo el contrato completo',
    qa: 'observado por el camino real',
    tests: 'A → make test',
    commit: 'abc1234 chore(hist): backfill',
  }
  const done = { entries: [vieja('sigue-vieja'), cumple], set: new Set(), duplicates: [] }

  const avisos = AD.report({ done, adopted: ['sigue-vieja', 'ya-reescrita', 'nunca-existio'] })

  assert.ok(avisos.some((one) => /ya-reescrita ya cumple el contrato/.test(one)))
  assert.ok(avisos.some((one) => /nunca-existio no está en done\//.test(one)))
  assert.deepEqual(avisos.filter((one) => /sigue-vieja/.test(one)), [], 'la que todavía hace falta no molesta')
  assert.match(avisos[avisos.length - 1], /3 entrada\(s\) exenta\(s\)/, 'y la cuenta se ve siempre')
  assert.deepEqual(AD.report({ done, adopted: [] }), [], 'sin exenciones no hay nada que mostrar')
})

// El recorrido entero contra una instancia de verdad: rojo, `adopt`, verde con la exención a la vista.
// Y la segunda corrida, que `adopt` explica por qué se niega.
test('adopt exenta la historia que llegó con el proyecto, y sólo se corre una vez', () => {
  const base = tempRoot('cauce-adopt-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  fs.writeFileSync(path.join(planning, 'done', 'tarea-de-2024.md'),
    '- [x] **tarea-de-2024** — Lo que se construyó entonces.\n'
    + '  done: lo único que aquel proceso registraba\n')

  assert.equal(run(['check', planning]).status, 1, 'una entrada vieja deja el planning en rojo')

  const adoptado = run(['adopt', planning])
  assert.equal(adoptado.status, 0, adoptado.stderr)
  const escrito = fs.readFileSync(path.join(planning, AD.BASELINE), 'utf8')
  assert.match(escrito, /^tarea-de-2024$/m)
  assert.match(escrito, /^# Entradas anteriores a la adopción de Cauce \(\d{4}-\d{2}-\d{2}\)/)

  const verde = run(['check', planning])
  assert.equal(verde.status, 0, verde.stderr)
  assert.match(verde.stdout + verde.stderr, /1 entrada\(s\) exenta\(s\)/, 'la exención se ve en cada corrida')

  const otraVez = run(['adopt', planning])
  assert.equal(otraVez.status, 1, 'regenerarlo perdonaría de nuevo lo que alguien ya arregló')
  assert.match(otraVez.stderr, /ya existe/)
})

test('adopt no escribe nada cuando no hay historia que exentar', () => {
  const base = tempRoot('cauce-adopt-limpio-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')

  const result = run(['adopt', planning])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /no hay nada que exentar/)
  assert.equal(fs.existsSync(path.join(planning, AD.BASELINE)), false, 'ni siquiera vacío')
})

// La tercera propiedad que el caso 021 enunció y no implementó: la lista no admite entradas nuevas, y
// nada lo comprobaba. Agregar un slug a mano perdonaba esa entrada para siempre y `check` sólo mostraba
// una cuenta más alta, que nadie recuerda.
//
// La huella se calcula sobre el conjunto **generado**, y por eso retirar un renglón no la rompe: lo que
// ya cumple el contrato se marca con `#~` en vez de borrarse. Sin eso la huella no distinguiría «creció»
// de «se achicó» —achicar es el camino que el propio `check` recomienda— y el aviso de una cosa
// contradiría al de la otra. El precio es un archivo que no se acorta; es un registro histórico, y para
// eso está bien.
test('la huella distingue una lista que creció de una que se achicó', () => {
  const root = tempRoot('ops-adoption-huella-')
  const escribir = (cuerpo) => fs.writeFileSync(path.join(root, AD.BASELINE), cuerpo)
  const sellar = (...slugs) => `# Entradas anteriores a la adopción de Cauce (2026-09-07).\n`
    + `# huella: ${slugs.length} entradas · sha256:${AD.digest(slugs)}\n${slugs.join('\n')}\n`

  escribir(sellar('vieja-a', 'vieja-b'))
  assert.deepEqual(AD.sealWarnings(root), [], 'intacta no dice nada')

  // Retirar es el camino recomendado y no puede sonar a alarma.
  escribir(sellar('vieja-a', 'vieja-b').replace('\nvieja-b', '\n#~ vieja-b'))
  assert.deepEqual(AD.sealWarnings(root), [], 'retirar un renglón deja la huella intacta')
  assert.deepEqual(AD.read(root), ['vieja-a'], 'y lo retirado deja de estar exento')

  // Lo que este caso vino a cerrar: un slug que nadie generó.
  escribir(`${sellar('vieja-a', 'vieja-b')}nueva\n`)
  const crecio = AD.sealWarnings(root)
  assert.equal(crecio.length, 1)
  assert.match(crecio[0], /creció/)
  assert.match(crecio[0], /nueva/, 'nombra la entrada que sobra')

  // Reordenar no es cambiar: la huella va sobre el conjunto y no sobre el texto, así que una
  // herramienta que ordene los renglones no puede disparar un aviso sobre algo que nadie hizo.
  escribir(sellar('vieja-a', 'vieja-b').replace('vieja-a\nvieja-b', 'vieja-b\nvieja-a'))
  assert.deepEqual(AD.sealWarnings(root), [], 'reordenar deja la huella intacta')

  // Cambiar un slug por otro conserva la cuenta y rompe la huella igual.
  escribir(sellar('vieja-a', 'vieja-b').replace('vieja-b', 'otra-cosa'))
  assert.match(AD.sealWarnings(root).join(' '), /no coincide/)

  // La lista sin huella se avisa en vez de callarse: no hay con qué comprobarla.
  escribir('# Entradas anteriores (2026-09-03)\nvieja-a\n')
  assert.match(AD.sealWarnings(root).join(' '), /sin huella/)
  assert.deepEqual(AD.sealWarnings(tempRoot('ops-adoption-vacio-')), [], 'sin archivo no hay nada que decir')
})

// El recorrido del sellado por el CLI, que es donde se ve si sirve: `adopt` deja la huella, `check`
// avisa cuando alguien agrega un renglón, y un baseline de una versión anterior tiene una salida.
test('la huella viaja en el archivo y check la comprueba', () => {
  const base = tempRoot('cauce-adopt-huella-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const baseline = path.join(planning, AD.BASELINE)
  fs.writeFileSync(path.join(planning, 'done', 'tarea-de-2024.md'),
    '- [x] **tarea-de-2024** — Lo que se construyó entonces.\n'
    + '  done: lo único que aquel proceso registraba\n')
  assert.equal(run(['adopt', planning]).status, 0)
  assert.match(fs.readFileSync(baseline, 'utf8'), /^# huella: 1 entradas · sha256:[0-9a-f]{12}$/m)
  assert.equal(run(['check', planning]).status, 0, 'recién sellado no dice nada de la huella')

  // Lo que este caso vino a cerrar. Se agrega una entrada de verdad y su slug a mano: sin la huella,
  // `check` quedaba verde y sólo subía una cuenta que nadie recuerda.
  fs.writeFileSync(path.join(planning, 'done', 'agregada-a-mano.md'),
    '- [x] **agregada-a-mano** — Trabajo de hoy.\n  done: a medias\n')
  fs.appendFileSync(baseline, 'agregada-a-mano\n')
  const crecido = run(['check', planning])
  assert.match(crecido.stdout + crecido.stderr, /la lista creció/)
  assert.match(crecido.stdout + crecido.stderr, /agregada-a-mano/)

  // Y la salida de ese aviso, que es la mitad que importa: sin ella el aviso no tendría qué hacer.
  // Por qué `adopt` acepta sellar y sigue negándose a regenerar, en `adopt`.
  fs.writeFileSync(baseline, '# Entradas anteriores (2026-09-03)\ntarea-de-2024\nagregada-a-mano\n')
  const sinHuella = run(['check', planning])
  assert.match(sinHuella.stdout + sinHuella.stderr, /sin huella/)
  const sellado = run(['adopt', planning])
  assert.equal(sellado.status, 0, sellado.stderr)
  assert.match(sellado.stdout, /sellado con 2 entrada\(s\)/)
  assert.match(fs.readFileSync(baseline, 'utf8'), /^tarea-de-2024$/m, 'la lista quedó como estaba')
  assert.equal(run(['check', planning]).status, 0)
  assert.match(run(['adopt', planning]).stderr, /ya existe/, 'con huella se sigue negando')
})
