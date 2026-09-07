'use strict'

// El contrato de `RECURRING.md`: cuándo vence una fila, qué la calla y qué línea emite.
//
// Las tres primeras no tocan disco —el módulo recibe el estado y la fecha— y por eso pueden fijar el
// día: un vencimiento probado contra `new Date()` sólo vale el día que se escribió.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const RC = require('../../engine/planning/recurring')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')

// El mínimo que `status` necesita, sin pasar por el archivo: una fila y lo que DONE haya cerrado.
function fila(extra = {}) {
  return {
    id: 'deps',
    cadence: 'mensual',
    since: '2026-01-01',
    task: 'Actualizar dependencias. _Aceptación: la puerta queda verde._ (service: .)',
    ...extra,
  }
}

const done = (...slugs) => ({ entries: slugs.map((slug) => ({ slug })), set: new Set(slugs) })

test('el vencimiento rueda desde el último cierre y no desde el ancla', () => {
  const rows = [fila()]
  const sinCerrar = RC.status({ rows, postponements: [], done: done(), today: '2026-01-01' })
  assert.equal(sinCerrar[0].due, '2026-01-01', 'sin ninguna vuelta cerrada manda la fecha declarada')
  assert.equal(sinCerrar[0].last, '')

  // Y una vuelta cerrada tarde corre la próxima: lo contrario —contar desde el ancla— dejaría debiendo
  // las vueltas que no se hicieron, que es justo lo que un vencimiento rodante no hace.
  const cerrada = RC.status({
    rows, postponements: [], done: done('deps-2026-05'), today: '2026-06-02',
  })
  assert.equal(cerrada[0].last, '2026-05')
  assert.equal(cerrada[0].due, '2026-06-01')
  assert.equal(cerrada[0].overdueDays, 1)
  assert.equal(cerrada[0].overdue, true)

  // La más nueva manda, no la última escrita: DONE se lee entero, incluido lo archivado.
  const varias = RC.status({
    rows,
    postponements: [],
    // Y el slug de otra cosa no cuenta como vuelta de ésta, aunque empiece parecido.
    done: done('deps-2026-07', 'deps-2026-03', 'deps-web-2026-09', 'otra-2026-08'),
    today: '2026-07-15',
  })
  assert.equal(varias[0].last, '2026-07')
  assert.equal(varias[0].due, '2026-08-01')
  assert.equal(varias[0].overdue, false)

  // El día del vencimiento ya cuenta como vencida, y se dice distinto: «hace 0 días» se lee como un error.
  const hoy = RC.status({ rows, postponements: [], done: done('deps-2026-07'), today: '2026-08-01' })
  assert.equal(hoy[0].overdue, true)
  assert.equal(hoy[0].overdueDays, 0)
  assert.match(RC.warnings(hoy)[0], /vence hoy/)
})

test('una postergación compra un período, y la anterior al cierre ya no cuenta', () => {
  const rows = [fila()]
  const postponements = [
    { id: 'deps', date: '2026-04-10', reason: 'x' },
    { id: 'deps', date: '2026-06-10', reason: 'y' },
    { id: 'otra', date: '2026-06-11', reason: 'z' },
  ]
  const state = RC.status({ rows, postponements, done: done('deps-2026-05'), today: '2026-06-20' })
  // Cerró en mayo, así que la de abril quedó absorbida por ese cierre y sólo cuenta la de junio: el
  // vencimiento se corre de 2026-06-01 a 2026-07-01, y hoy no está vencida.
  assert.equal(state[0].postponed, 1)
  assert.equal(state[0].due, '2026-07-01')
  assert.equal(state[0].overdue, false)

  const tres = RC.status({
    rows,
    postponements: ['2026-01-05', '2026-02-05', '2026-03-05'].map((date) => ({ id: 'deps', date, reason: 'x' })),
    done: done(),
    today: '2026-04-10',
  })
  assert.equal(tres[0].postponed, 3)
  assert.match(RC.warnings(tres).join('\n'), /postergada 3 veces/, 'tres seguidas se avisan')
})

test('check rechaza la fila que no se puede leer y la que emitiría una tarea inválida', () => {
  const errors = RC.validate({
    exists: true,
    rows: [
      fila({ cadence: 'semanal' }),
      fila({ id: 'Deps Mal' }),
      fila({ id: 'accesos', since: '2026-1-1' }),
      fila({ id: 'costos', task: 'Mirar el gasto. (service: .)' }),
      fila({ id: 'inbox', task: 'Recorrerlo. _Aceptación: nada queda sin decidir._' }),
      fila({ id: 'deps' }),
    ],
    postponements: [
      { id: '', date: '', reason: '', raw: '- me olvidé de deps' },
      { id: 'fantasma', date: '2026-05-01', reason: 'x', raw: '' },
      { id: 'accesos', date: '1 de mayo', reason: 'x', raw: '' },
    ],
  })
  const dice = (pattern) => errors.some((error) => pattern.test(error))
  assert.ok(dice(/cadencia "semanal" fuera de/), 'la cadencia es vocabulario cerrado')
  assert.ok(dice(/identificador va en minúsculas/), 'el identificador es un slug')
  assert.ok(dice(/Desde debe ser AAAA-MM-DD/), 'la fecha tiene una sola forma')
  assert.ok(dice(/no declara _Aceptación/), 'sin aceptación la línea emitida no pasa BACKLOG')
  assert.ok(dice(/no declara \(service/), 'y sin service tampoco')
  assert.ok(dice(/identificador duplicado deps/), 'dos filas con el mismo nombre comparten historia')
  assert.ok(dice(/una postergación se escribe/), 'una postergación sin forma no se cuenta y hay que verlo')
  assert.ok(dice(/postergación de fantasma, que la tabla no declara/))
  assert.ok(dice(/postergación de accesos: la fecha va en AAAA-MM-DD/))

  assert.deepEqual(RC.validate({ exists: false, rows: [], postponements: [] }), [],
    'sin el archivo no hay nada que juzgar')
})

// La prueba que ata las dos mitades: lo que `--promote` emite es lo que `check` acepta. Sin esto el
// emisor puede producir para siempre una línea que la cola rechaza, y el error aparece un mes después
// con la tarea ya pegada.
test('la línea que se promueve la acepta el check de BACKLOG', () => {
  const planning = path.join(tempRoot('cauce-recurring-'), 'planning')
  fs.cpSync(MOLDE, planning, { recursive: true })
  const row = fila()
  const line = RC.taskLine(row, '2026-09')
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido\n
## Hito mantenimiento — Mantenimiento de setiembre\n\n${line}\n`)

  const errors = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /BACKLOG|deps/.test(error))
  assert.deepEqual(errors, [], `la línea emitida no pasa la cola: ${line}`)

  // Y que la lea, no sólo que no se queje: una línea que el lector descarta no produce ningún error,
  // así que un check en silencio también es lo que se ve cuando el emisor escribe algo ilegible.
  const task = JSON.parse(run(['context', planning, '--json']).stdout).task
  assert.equal(task && task.slug, 'deps-2026-09', `la cola no lee la línea emitida: ${line}`)
  assert.match(task.acceptance, /la puerta queda verde/)
})

// Las de arriba le pasan el estado al módulo; ésta comprueba que ese estado salga del archivo. Sin
// ella la forma de una postergación no está probada en ningún lado: el log se lee con su propio regex y
// una viñeta que no encaja se cuenta como fila rota, que es lo único que hace visible el error.
test('las dos listas se leen de su sección, y la viñeta que no encaja se ve', () => {
  const planning = path.join(tempRoot('cauce-recurring-lee-'), 'planning')
  fs.cpSync(MOLDE, planning, { recursive: true })
  const file = path.join(planning, RC.FILE)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace(/\|---\|---\|---\|---\|\n/,
      '|---|---|---|---|\n| deps | mensual | 2026-01-01 | Actualizar. _Aceptación: verde._ (service: .) |\n')
    .replace(/## Postergaciones/,
      '## Postergaciones\n\n- **deps** 2026-02-10 — Esperando el release.\n- me olvidé de deps\n'))

  const read = RC.read(planning)
  assert.equal(read.exists, true)
  assert.deepEqual(read.rows.map((row) => row.id), ['deps'], 'la prosa de arriba no entra como fila')
  assert.deepEqual(read.postponements.map((one) => one.id), ['deps', ''],
    'y las viñetas que explican las columnas no entran como postergaciones')
  assert.equal(read.postponements[0].reason, 'Esperando el release.')

  assert.match(RC.validate(read).join('\n'), /una postergación se escribe/)
  // La bien escrita corre el vencimiento un mes: sin leerla, deps vencía el 2026-01-01.
  const state = RC.status({ ...read, done: { entries: [], set: new Set() }, today: '2026-02-15' })
  assert.equal(state[0].postponed, 1)
  assert.equal(state[0].due, '2026-02-01')
})

// El contrato no le sirve a una empresa si sólo lo reciben las instancias nuevas, y en el mapa de
// propiedad las dos vías se ven igual de razonables. Lo que las separa es esto: una instancia anterior
// a la versión que agrega el archivo no lo tiene, y `init` no vuelve a correr nunca.
test('una instancia que ya existe recibe el contrato al actualizar', () => {
  const base = tempRoot('cauce-recurring-upgrade-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const file = path.join(target, 'planning', RC.FILE)
  fs.rmSync(file)

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.ok(fs.existsSync(file), 'la instancia anterior a esta versión lo recibe')
  assert.match(upgraded.stdout, new RegExp(`\\+ planning/${RC.FILE}`), 'y se dice, porque hay que llenarlo')

  // Llega vacío, así que no le cambia el estado a nadie: `check` sigue igual de verde que antes.
  assert.equal(JSON.parse(run(['check', path.join(target, 'planning'), '--json']).stdout).ok, true)

  // Y lo que la empresa escriba adentro sobrevive a la próxima actualización.
  fs.writeFileSync(file, '# Nuestras\n\n## Recurrencias\n\n| Qué | Cada | Desde | Tarea |\n|---|---|---|---|\n')
  assert.equal(run(['upgrade', target]).status, 0)
  assert.match(fs.readFileSync(file, 'utf8'), /Nuestras/)
})

test('sin el archivo, ni check ni context dicen una palabra', () => {
  const planning = path.join(tempRoot('cauce-recurring-mudo-'), 'planning')
  fs.cpSync(MOLDE, planning, { recursive: true })
  fs.rmSync(path.join(planning, RC.FILE))

  const check = JSON.parse(run(['check', planning, '--json']).stdout)
  assert.deepEqual([...check.errors, ...check.warnings].filter((one) => /RECURRING/.test(one)), [])
  const context = run(['context', planning])
  assert.doesNotMatch(context.stdout, /DUE/)
  assert.equal(run(['recurring', planning]).status, 0, 'y el comando propio se explica en vez de romper')
})

test('context nombra la recurrencia vencida, y sólo la vencida', () => {
  const planning = path.join(tempRoot('cauce-recurring-due-'), 'planning')
  fs.cpSync(MOLDE, planning, { recursive: true })
  const file = path.join(planning, RC.FILE)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(
    /\|---\|---\|---\|---\|\n/,
    '|---|---|---|---|\n'
      + '| deps | mensual | 2026-01-01 | Actualizar. _Aceptación: verde._ (service: .) |\n'
      + '| lejana | anual | 2999-01-01 | Mirar. _Aceptación: verde._ (service: .) |\n',
  ))

  const context = run(['context', planning])
  assert.match(context.stdout, /^DUE {4}deps: vencida hace \d+ día\(s\)$/m)
  assert.doesNotMatch(context.stdout, /lejana/, 'la que no venció no tiene nada que decir')

  const json = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.deepEqual(json.recurring.map((one) => one.id), ['deps'])

  const promote = run(['recurring', planning, '--promote', 'deps'])
  assert.match(promote.stdout, /^- \[ \] \*\*deps-\d{4}-\d{2}\*\* — Actualizar\./m)
  assert.equal(promote.status, 0)
})
