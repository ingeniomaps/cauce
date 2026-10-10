'use strict'

// Una acción humana por archivo, en `human/` (caso 351). Se prueba con ramas de verdad y juntándolas, que es
// donde la tabla única fallaba: una fila resuelta volvía a `pendiente` sin conflicto.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function instance(prefix) {
  const root = path.join(tempRoot(prefix), 'demo-ops')
  assert.equal(run(['init', root, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(root, 'planning')
  const git = (...args) => {
    const out = spawnSync('git', ['-C', root, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
  }
  const file = (name) => path.join(planning, 'human', `${name}.md`)
  const write = (name, { task = name, status = 'pendiente', origin = 'Ready', action = `decidir ${name}` } = {}) => {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true })
    const front = [task === null ? '' : `task: ${task}`, status === null ? '' : `status: ${status}`,
      `origin: ${origin}`].filter(Boolean)
    fs.writeFileSync(file(name), `---\n${front.join('\n')}\n---\n\n${action}\n`)
    return `planning/human/${name}.md`
  }
  const queue = (...slugs) => fs.appendFileSync(path.join(planning, 'BACKLOG.md'), `\n## Hito uno — Uno\n\n${slugs
    .map((slug) => `- [ ] **${slug}** [lite] — R. _Aceptación: conducta observable._ (service: app)`).join('\n')}\n`)
  const context = () => JSON.parse(run(['context', planning, '--json']).stdout)
  const pending = () => context().humanActions.map((one) => one.task).sort()
  const check = () => JSON.parse(run(['check', planning, '--json']).stdout)
  git('init', '-q', '-b', 'main')
  return { root, planning, git, file, write, queue, context, pending, check }
}

test('una acción humana escrita en su archivo bloquea a su tarea hasta que diga resuelta', () => {
  const { planning, write, queue, context, pending } = instance('cauce-human-archivo-')
  queue('t-uno', 't-dos')
  assert.equal(context().task.slug, 't-uno')
  write('t-uno', { action: 'Crear la cuenta\ndel proveedor.' })
  assert.equal(context().task.slug, 't-dos', 'la tarea bloqueada se saltea, como con una fila de la tabla')
  assert.deepEqual(context().humanActions,
    [{ task: 't-uno', state: 'pendiente', action: 'Crear la cuenta del proveedor.' }])
  assert.match(run(['claim', planning, 't-uno']).stderr, /espera una acción humana/)

  write('t-uno', { status: 'resuelta 2026-10-09' })
  assert.deepEqual(pending(), [])
  assert.equal(context().task.slug, 't-uno')

  // La clave es `task:`, no el nombre: una fila de una épica o de un recorrido se llama como haga falta.
  write('decidir-el-proveedor', { task: 't-dos' })
  write('epica-024-formato', { task: 'épica 024' })
  assert.deepEqual(pending(), ['t-dos', 'épica 024'])
  // Y la tabla se sigue leyendo, junto a los archivos.
  fs.appendFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), '| t-uno | pendiente | QA | falta la cuenta |\n')
  assert.deepEqual(pending(), ['t-dos', 't-uno', 'épica 024'])
})

test('lo que el motor no puede leer bloquea, y check dice qué le falta', () => {
  const { write, queue, pending, check } = instance('cauce-human-dudoso-')
  queue('t-uno')
  write('sin-estado', { task: 't-uno', status: null })
  assert.deepEqual(pending(), ['t-uno'], 'sin status no está resuelta')
  write('sin-estado', { task: 't-uno', status: 'listo' })
  assert.deepEqual(pending(), ['t-uno'], 'ni con una palabra de fuera del vocabulario')
  // Lo que empieza como un estado y no lo es tampoco resuelve, ni la palabra escrita en el cuerpo.
  write('sin-estado', { task: 't-uno', status: 'resuelta?' })
  assert.deepEqual(pending(), ['t-uno'])
  write('sin-estado', { task: 't-uno', status: 'pendiente', action: 'Se destraba poniendo\nstatus: resuelta' })
  assert.deepEqual(pending(), ['t-uno'], 'el cuerpo son las instrucciones, no el estado')
  write('sin-estado', { task: 't-uno', status: 'listo' })
  write('sin-tarea', { task: null })
  const errors = check().errors.join('\n')
  assert.match(errors, /human\/sin-estado\.md: status «listo» no es `pendiente` ni `resuelta`/, 'nombra el archivo')
  assert.match(errors, /human\/sin-tarea\.md: falta `task`/)
  assert.doesNotMatch(errors, /README|HUMAN_ACTIONS t-uno/)
})

test('lo que en human/ no se lee como una acción no pasa en silencio', () => {
  const { planning, file, write, queue, pending, check } = instance('cauce-human-ajeno-')
  queue('t-uno')
  const dir = path.join(planning, 'human')
  const body = '---\ntask: t-uno\nstatus: pendiente\norigin: Ready\n---\n\ndecidir\n'
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true })
  for (const name of ['t-uno.MD', 't-uno.markdown', 't-uno', path.join('sub', 't-uno.md')]) {
    fs.writeFileSync(path.join(dir, name), body)
  }
  assert.deepEqual(pending(), [], 'la precondición: ninguno de estos bloquea')
  const errors = check().errors.filter((one) => /no se lee como acción/.test(one)).join('\n')
  for (const name of ['t-uno.MD', 't-uno.markdown', 'human/t-uno:', 'human/sub:']) {
    assert.ok(errors.includes(name), `check nombra ${name}`)
  }
  // Lo que deja el sistema o git no es una acción mal escrita, y no se rechaza.
  for (const name of ['.DS_Store', '.gitkeep']) fs.writeFileSync(path.join(dir, name), '')
  assert.doesNotMatch(check().errors.join('\n'), /DS_Store|gitkeep/)
  fs.writeFileSync(path.join(dir, 'README.md'), body)
  assert.match(check().errors.join('\n'), /human\/README\.md: trae un frontmatter/)

  // Con otro fin de línea, o entre comillas, es la misma acción. Y un campo escrito dos veces —lo que deja
  // un conflicto resuelto con los dos lados— no decide nada: bloquea y se dice.
  fs.writeFileSync(file('crlf'), `\uFEFF${body.replace(/\n/g, '\r\n')}`)
  assert.deepEqual(pending(), ['t-uno'])
  write('crlf', { task: '"t-uno"', status: "'pendiente'" })
  assert.deepEqual(pending(), ['t-uno'])
  fs.writeFileSync(file('crlf'), '---\ntask: t-uno\nstatus: resuelta\nstatus: pendiente\norigin: x\n---\n\nd\n')
  assert.deepEqual(pending(), ['t-uno'], 'dos status no resuelven')
  assert.match(check().errors.join('\n'), /human\/crlf\.md: `status` está dos veces/)
  fs.writeFileSync(file('crlf'), ' ---\n task: t-uno\n---\n')
  assert.match(check().errors.join('\n'), /human\/crlf\.md: no arranca con un frontmatter que el motor pueda leer/)
})

// La secuencia que con la tabla dejaba la fila resuelta también como pendiente.
test('juntar dos líneas no cambia el estado de ninguna acción humana', () => {
  const { git, write, pending, check } = instance('cauce-human-fusion-')
  git('add', '.')
  git('commit', '-qm', 'base')
  const commit = (relative, message) => { git('add', relative); git('commit', '-qm', message) }

  commit(write('t-auth'), 'block t-auth')
  git('checkout', '-q', '-b', 'line/admin')
  commit(write('t-admin'), 'block t-admin')
  git('checkout', '-q', 'main')
  commit(write('t-auth', { status: 'resuelta 2026-10-09' }), 'resolve t-auth')
  git('merge', '-q', 'line/admin', '-m', 'junta')
  assert.deepEqual(pending(), ['t-admin'], 'la resuelta sigue resuelta')
  git('checkout', '-q', 'line/admin')
  git('merge', '-q', 'main', '-m', 'junta')
  assert.deepEqual(pending(), ['t-admin'])
  assert.deepEqual(check().errors.filter((one) => /HUMAN|human\//.test(one)), [])
})

test('una acción resuelta sin commit se avisa, y archivar la mueve entera a human/done/', () => {
  const { planning, git, file, write, check } = instance('cauce-human-archivar-')
  git('add', '.')
  git('commit', '-qm', 'base')
  write('t-uno')
  git('add', 'planning/human/t-uno.md')
  git('commit', '-qm', 'block t-uno')
  write('t-dos')
  const unrecorded = () => check().warnings.filter((one) => /ningún commit la registró/.test(one))

  const body = 'Aprobar el gasto | plan pago.\n\n- primero la cuenta\n- después el token\n'
  write('t-uno', { status: 'resuelta 2026-10-09', action: body })
  assert.deepEqual(unrecorded(), ['human/t-uno.md: t-uno figura resuelta y ningún commit la registró'])
  // La que nace resuelta, sin haber estado nunca en un commit, es la misma aprobación autoservida.
  write('t-tres', { status: 'resuelta' })
  assert.equal(unrecorded().length, 2)
  fs.rmSync(file('t-tres'))
  git('add', 'planning/human/t-uno.md')
  git('commit', '-qm', 'resolve t-uno')
  assert.deepEqual(unrecorded(), [])

  const before = fs.readFileSync(file('t-uno'), 'utf8')
  const archived = path.join(planning, 'human', 'done', 't-uno.md')
  assert.match(run(['archive', planning, 'human-actions']).stdout, /1 fila\(s\) archivadas/)
  assert.equal(fs.existsSync(file('t-uno')), false, 'la resuelta se fue de las que se leen')
  assert.equal(fs.existsSync(file('t-dos')), true, 'la pendiente se queda')
  assert.equal(fs.readFileSync(archived, 'utf8'), before, 'y llegó entera: el cuerpo, los campos y el nombre')
  assert.deepEqual(check().errors.filter((one) => /human\//.test(one)), [], 'el archivo no es una acción ajena')
  assert.match(run(['archive', planning, 'human-actions']).stdout, /no hay filas resueltas/)

  // Un segundo bloqueo de la misma tarea, resuelto con el mismo nombre, no pisa al primero.
  write('t-uno', { status: 'resuelta 2026-10-10', action: 'otra decisión' })
  run(['archive', planning, 'human-actions'])
  assert.equal(fs.readFileSync(archived, 'utf8'), before)
  assert.match(fs.readFileSync(path.join(planning, 'human', 'done', 't-uno-2.md'), 'utf8'), /otra decisión/)
})

test('ops human imprime la tabla entera, de las dos fuentes y con las pendientes primero', () => {
  const { planning, write } = instance('cauce-human-tabla-')
  assert.match(run(['human', planning]).stdout, /no hay acciones humanas registradas/)
  fs.appendFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), '| vieja | resuelta 2026-08-01 | QA | se aprobó |\n')
  write('t-uno', { action: 'elegir a \\| b | c' })
  const listed = JSON.parse(run(['human', planning, '--json']).stdout)
  assert.deepEqual(listed.map((one) => [one.task, one.file]),
    [['t-uno', 'human/t-uno.md'], ['vieja', 'HUMAN_ACTIONS.md']])
  const table = run(['human', planning]).stdout
  assert.match(table, /^\| t-uno \| pendiente \| Ready \| elegir a \\\| b \\\| c \| human\/t-uno\.md \|$/m,
    'un pipe se escapa una vez, también el que ya venía escapado')
  assert.match(table, /^\| vieja \| resuelta 2026-08-01 \| QA \| se aprobó \| HUMAN_ACTIONS\.md \|$/m)
})
