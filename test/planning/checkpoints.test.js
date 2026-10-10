'use strict'

// El checkpoint de un hito es un archivo por hito y frena a la línea que lo escribió (caso 347). Las pruebas
// usan ramas `line/<nombre>` de verdad y las juntan: lo que este caso encontró no se ve leyendo un archivo,
// se ve fusionando dos.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function instance(prefix) {
  const root = path.join(tempRoot(prefix), 'demo-ops')
  assert.equal(run(['init', root, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const git = (...args) => {
    const out = spawnSync('git', ['-C', root, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout.trim()
  }
  const planning = path.join(root, 'planning')
  const write = (hito, { status = 'pendiente', line, legacy = false } = {}) => {
    const file = legacy ? path.join(planning, 'AWAITING_REVIEW.md') : path.join(planning, 'checkpoints', `${hito}.md`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const front = [`status: ${status}`, legacy ? '' : `hito: ${hito}`, line === undefined ? '' : `line: ${line}`]
    fs.writeFileSync(file, `---\n${front.filter(Boolean).join('\n')}\n---\n\n# Checkpoint: hito ${hito}\n\n`
      + `Revisar el hito ${hito}.\n`)
    return path.relative(root, file)
  }
  const context = () => JSON.parse(run(['context', planning, '--json']).stdout)
  const check = () => JSON.parse(run(['check', planning, '--json']).stdout)
  git('init', '-q', '-b', 'main')
  return { root, planning, git, write, context, check }
}

test('un checkpoint frena a la línea que lo escribió y a ninguna otra', () => {
  const { git, write, context, planning } = instance('cauce-checkpoint-linea-')
  write('auth-uno', { line: 'auth' })
  assert.equal(context().blocked, '', 'el árbol principal no es la línea auth')

  git('checkout', '-q', '-b', 'line/auth')
  const mine = context()
  assert.equal(mine.blocked, 'awaiting-review')
  assert.equal(mine.checkpoint, 'checkpoints/auth-uno.md', 'y dice cuál lo frena')

  git('checkout', '-q', '-b', 'line/admin')
  assert.equal(context().blocked, '', 'la otra línea sigue')
  assert.match(run(['tree', planning, '--no-color']).stdout, /^CHECKPOINT\s+checkpoints\/auth-uno\.md · línea auth$/m,
    'y lo ve: no la frena, pero alguien lo tiene que revisar')
  write('admin-uno', { line: 'admin' })
  assert.equal(context().checkpoint, 'checkpoints/admin-uno.md')
  write('sin-linea')
  assert.deepEqual(context().checkpoints, ['checkpoints/admin-uno.md', 'checkpoints/sin-linea.md'],
    'todos los que la frenan, no sólo el primero')
  fs.unlinkSync(path.join(planning, 'checkpoints', 'sin-linea.md'))
  write('admin-uno', { line: 'admin', status: 'resuelta' })
  assert.equal(context().blocked, '', 'resuelta destraba, con el archivo todavía ahí')
})

// Cerrado por defecto (R27): lo que no dice de quién es frena a todos, y lo que no dice que está resuelto,
// frena. El archivo de siempre es además la forma de parar la instancia entera a propósito.
test('sin línea declarada, y el archivo de siempre, frenan a todas las líneas', () => {
  const { git, write, context, planning } = instance('cauce-checkpoint-global-')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-q', '-b', 'line/admin')
  write('suelto')
  assert.equal(context().blocked, 'awaiting-review', 'un checkpoint sin `line:` es de todos')
  fs.rmSync(path.join(planning, 'checkpoints', 'suelto.md'))

  // `line:` vacío es el árbol principal, que no es lo mismo que no decirlo.
  write('base-uno', { line: '' })
  assert.equal(context().blocked, '', 'el del árbol principal no frena a una línea')
  git('checkout', '-q', '-b', 'otra')
  assert.equal(context().blocked, 'awaiting-review', 'y sí al árbol que no es de ninguna')
  write('base-uno', { line: '', status: 'resuelta' })

  git('checkout', '-q', 'line/admin')
  write('viejo', { legacy: true })
  const held = context()
  assert.equal(held.blocked, 'awaiting-review', '`AWAITING_REVIEW.md` sigue frenando a todos')
  assert.equal(held.checkpoint, 'AWAITING_REVIEW.md')
  assert.match(run(['context', planning]).stdout,
    /^BLOCKED\s+awaiting-review — AWAITING_REVIEW\.md: Revisar el hito viejo\.$/m)

  // El archivo de siempre se lee como siempre, también el que no trae frontmatter.
  const legacy = path.join(planning, 'AWAITING_REVIEW.md')
  fs.writeFileSync(legacy, '# Checkpoint\n\nstatus: resuelta\n')
  assert.equal(context().blocked, '', 'uno viejo, resuelto en el cuerpo, sigue destrabando')
  fs.writeFileSync(legacy, '# Checkpoint\n\nstatus: no resuelta\n')
  assert.equal(context().blocked, 'awaiting-review')
  fs.rmSync(legacy)
})

// Ante la duda frena: lo que el motor no puede leer como «resuelta», o como una línea, no abre nada.
test('un checkpoint mal escrito frena a todas las líneas en vez de a ninguna', () => {
  const { git, context, planning } = instance('cauce-checkpoint-dudoso-')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-q', '-b', 'line/admin')
  const dir = path.join(planning, 'checkpoints')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'raro.md')
  const holds = (front, body = '# x\n') => {
    fs.writeFileSync(file, `---\n${front}\n---\n\n${body}`)
    return context().blocked === 'awaiting-review'
  }
  assert.ok(holds('hito: raro\nline: admin'), 'sin status')
  assert.ok(holds('status: listo\nhito: raro\nline: admin'), 'con una palabra que no es del vocabulario')
  assert.ok(holds('hito: raro\nline: admin', 'Se destraba poniendo\nstatus: resuelta\n'),
    'el status del cuerpo son las instrucciones, no el estado')
  // Una línea que no es un nombre de línea no es de nadie, así que es de todos.
  for (const line of ['Otra Línea', 'line/auth', 'auth # la de ana']) {
    assert.ok(holds(`status: pendiente\nhito: raro\nline: ${line}`), line)
  }
  // Entre comillas es el mismo nombre: la de admin frena a admin, y la de auth no.
  assert.ok(holds('status: pendiente\nhito: raro\nline: "admin"'), 'comillas dobles')
  assert.ok(holds("status: pendiente\nhito: raro\nline: 'admin'"), 'comillas simples')
  assert.ok(!holds('status: pendiente\nhito: raro\nline: "auth"'), 'la de otra línea sigue siendo ajena')
  assert.ok(!holds('status: pendiente\nhito: raro\nline: ""'), 'vacío entre comillas es el árbol principal')
})

// Lo que deja un editor de Windows al guardar: el mismo archivo, con otro fin de línea y un BOM adelante.
test('un checkpoint guardado con fin de línea de Windows se lee igual', () => {
  const { context, check, planning } = instance('cauce-checkpoint-crlf-')
  const file = path.join(planning, 'checkpoints', 'uno.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const saved = (status) => fs.writeFileSync(file,
    `\uFEFF---\r\nstatus: ${status}\r\nhito: uno\r\nline:\r\n---\r\n\r\n# Checkpoint\r\n`)
  saved('pendiente')
  assert.equal(context().blocked, 'awaiting-review')
  assert.deepEqual(check().errors.filter((one) => /checkpoints\//.test(one)), [], 'check no le encuentra nada')
  saved('resuelta 2026-10-09')
  assert.equal(context().blocked, '', 'resuelto en el editor, deja de frenar')
})

test('check no juzga el archivo de siempre con las reglas de la carpeta nueva', () => {
  const { planning, check } = instance('cauce-checkpoint-viejo-')
  fs.writeFileSync(path.join(planning, 'AWAITING_REVIEW.md'), '# Checkpoint\n\nRevisar el hito demo.\n')
  assert.deepEqual(check().errors.filter((one) => /AWAITING_REVIEW|checkpoints\//.test(one)), [])
})

// La secuencia que con un solo archivo abría el checkpoint ajeno: cada línea cierra su hito, una resuelve el
// suyo, y se traen la rama una a la otra.
test('juntar dos líneas no resuelve el checkpoint de ninguna', () => {
  const { git, write, context } = instance('cauce-checkpoint-fusion-')
  git('add', '.')
  git('commit', '-qm', 'base')
  const commit = (file, message) => { git('add', file); git('commit', '-qm', message) }

  git('checkout', '-q', '-b', 'line/auth')
  commit(write('auth-uno', { line: 'auth' }), 'await review of auth-uno')
  git('checkout', '-q', '-b', 'line/admin')
  commit(write('admin-uno', { line: 'admin' }), 'await review of admin-uno')
  git('checkout', '-q', 'line/auth')
  commit(write('auth-uno', { line: 'auth', status: 'resuelta' }), 'resolve auth-uno')
  git('merge', '-q', 'line/admin', '-m', 'trae admin')

  assert.equal(context().blocked, '', 'auth resolvió lo suyo y el pendiente de admin no la frena')
  git('checkout', '-q', 'line/admin')
  git('merge', '-q', 'line/auth', '-m', 'trae auth')
  const held = context()
  assert.equal(held.blocked, 'awaiting-review', 'el de admin sigue pendiente después de juntar')
  assert.equal(held.checkpoint, 'checkpoints/admin-uno.md')
})

test('check rechaza un checkpoint que no dice lo que el motor lee', () => {
  const { planning, write, check } = instance('cauce-checkpoint-check-')
  write('bien', { line: 'auth' })
  const mine = (report) => report.errors.filter((one) => /checkpoints\//.test(one))
  assert.deepEqual(mine(check()), [])

  const dir = path.join(planning, 'checkpoints')
  fs.writeFileSync(path.join(dir, 'otro-nombre.md'), '---\nstatus: pendiente\nhito: distinto\n---\n')
  fs.writeFileSync(path.join(dir, 'sin-estado.md'), '---\nhito: sin-estado\n---\n')
  fs.writeFileSync(path.join(dir, 'estado-raro.md'), '---\nstatus: listo\nhito: estado-raro\n---\n')
  fs.writeFileSync(path.join(dir, 'linea-rara.md'), '---\nstatus: pendiente\nhito: linea-rara\nline: Mi Línea\n---\n')
  const errors = mine(check()).join('\n')
  assert.match(errors, /otro-nombre\.md: hito «distinto» no es el nombre del archivo/)
  assert.match(errors, /sin-estado\.md: falta `status`/)
  assert.match(errors, /estado-raro\.md: status «listo» no es `pendiente` ni `resuelta`/)
  assert.match(errors, /linea-rara\.md: line «Mi Línea» no es un nombre de línea/)
  assert.doesNotMatch(errors, /bien\.md|README/)
})

// El aviso sale donde la regla falta y hay líneas, y sólo ahí; el porqué está en `engine/planning/lines.js`.
test('con líneas en uso, check avisa si la tabla de acciones humanas no fusiona por unión', () => {
  const { root, planning, git, check } = instance('cauce-checkpoint-union-')
  const about = () => check().warnings.filter((one) => /merge=union/.test(one))
  git('checkout', '-q', '-b', 'line/auth')
  assert.deepEqual(about(), [], 'el molde ya trae la regla')

  fs.writeFileSync(path.join(root, '.gitattributes'), '# el del producto\n*.png binary\n')
  const [warning, ...rest] = about()
  assert.deepEqual(rest, [])
  assert.match(warning, /planning\/HUMAN_ACTIONS\.md merge=union/, 'trae la línea que hay que agregar')
  assert.match(warning, /\.gitattributes/)

  git('checkout', '-q', '-b', 'otra')
  assert.deepEqual(about(), [], 'sin líneas no hay dos ramas escribiendo la tabla, y no se avisa')
  fs.mkdirSync(path.join(planning, 'backlog'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'backlog', 'auth-uno.md'), '---\norder: 10\nline: auth\n---\n\n'
    + '## Hito auth-uno — Uno\n\n- [ ] **t-uno** [lite] — R. _Aceptación: observable._ (service: app)\n')
  assert.equal(about().length, 1, 'un hito declarado de una línea alcanza')
})
