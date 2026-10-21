'use strict'

// Una línea de trabajo dentro de la carpeta de sesión (caso 394): `ops line` arma un worktree por cada
// repositorio que la línea trabaja en `lines/<línea>/<repo>/`, y nada más. Lo que se mide es lo que el caso
// encontró roto con la carpeta de al lado —que la línea nacía sin la gobernanza de la sesión— y lo que lo
// reemplaza: la declaración en `ops.config.json`, el solape entre líneas, retirarlas y migrar las de antes.

const { tempRoot, run, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
  { cwd, encoding: 'utf8' })
const ok = (cwd, ...args) => {
  const result = git(cwd, ...args)
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}
const json = (args) => {
  const result = run(args)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}
const configOf = (ops) => JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8'))

// Una carpeta de sesión con la instancia sidecar y dos repositorios del producto, más lo que la sesión tiene y
// no es de ningún repositorio: sus instrucciones, su configuración y una carpeta compartida.
function session(name) {
  const base = fs.realpathSync(tempRoot(name))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Lineas', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  // La identidad vive en el repositorio, como en una instancia real: el merge de `lines migrate` la necesita
  // para su commit, y en CI no hay una global.
  ok(ops, 'config', 'user.email', 't@t')
  ok(ops, 'config', 'user.name', 't')
  ok(ops, 'add', ...fs.readdirSync(ops).filter((one) => one !== 'node_modules' && one !== '.git'))
  ok(ops, 'commit', '-qm', 'instancia')
  for (const repo of ['pagos', 'auth']) {
    const dir = path.join(base, repo)
    fs.mkdirSync(dir)
    ok(dir, 'init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1\n')
    ok(dir, 'add', 'a.js'); ok(dir, 'commit', '-qm', 'init')
  }
  fs.mkdirSync(path.join(base, 'shared-lib'))
  fs.mkdirSync(path.join(base, '.claude'))
  fs.writeFileSync(path.join(base, 'CLAUDE.md'), 'Reglas del proyecto.\n')
  return { base, ops, tree: (line, repo) => path.join(base, 'lines', line, repo) }
}

test('una línea vive en lines/<línea>/<repo>, sin configuración propia, y la sesión es la de siempre', () => {
  const { base, ops, tree } = session('cauce-line-')
  const report = json(['line', ops, 'pagos', 'pagos', '--json'])
  assert.deepEqual(report.trees.map((one) => [one.tree, one.branch, one.from, one.reused]),
    [[tree('pagos', 'pagos'), 'line/pagos', 'main', false]])
  assert.equal(ok(tree('pagos', 'pagos'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'line/pagos')
  assert.deepEqual(configOf(ops).lines, { pagos: ['pagos'] }, 'la pertenencia se declara')
  assert.equal(report.declared, true)

  // Lo que la línea no trabaja se enlaza donde estaba, para que `../auth` resuelva igual desde su repositorio.
  assert.deepEqual(report.linked, ['auth', 'shared-lib'])
  assert.equal(fs.realpathSync(path.join(base, 'lines', 'pagos', 'auth')), path.join(base, 'auth'))

  // Lo que se quitó (R9). La línea no tiene carpeta de sesión al lado, ni configuración de runner, ni las
  // instrucciones, ni su propia instancia, ni el motor enlazado: la sesión que la lleva es la de siempre.
  assert.equal(fs.existsSync(`${base}-pagos`), false, 'armó la carpeta de sesión de al lado')
  for (const absent of ['.claude', 'CLAUDE.md', 'ops', 'node_modules']) {
    assert.equal(fs.existsSync(path.join(base, 'lines', 'pagos', absent)), false, `la línea trae ${absent}`)
  }
  assert.equal(fs.existsSync(path.join(tree('pagos', 'pagos'), 'node_modules')), false)
  const text = run(['line', ops, 'pagos'])
  assert.equal(text.status, 0, text.stderr)
  assert.doesNotMatch(text.stdout, /Abrí la sesión|runners:/, 'la salida manda a otra sesión')
  assert.match(text.stdout, /^= .*lines\/pagos\/pagos {2}\(line\/pagos\)\n/)
  assert.match(text.stdout, /desde esta misma sesión.*\/autobuild pagos/s)

  // La segunda vez reusa lo que ya está, y no vuelve a escribir la declaración.
  const again = json(['line', ops, 'pagos', '--json'])
  assert.deepEqual([again.trees[0].reused, again.linked, again.declared], [true, [], false])
  assert.equal(run(['check', path.join(ops, 'planning')]).status, 0, 'check acepta la declaración')
})

// Caso 395: el checkout suele estar en una rama de trabajo, y la línea nacía montada sobre ella.
test('la rama de una línea nueva sale de la rama viva y no del HEAD del checkout', () => {
  const { base, ops } = session('cauce-line-start-')
  const repo = path.join(base, 'pagos')
  const main = ok(repo, 'rev-parse', 'main')
  ok(repo, 'checkout', '-q', '-b', 'feature/sin-mergear'); ok(repo, 'commit', '-q', '--allow-empty', '-m', 'wip')
  const report = json(['line', ops, 'b', 'pagos', '--json'])
  assert.equal(ok(repo, 'rev-parse', 'line/b'), main, 'la línea arrastró la rama de trabajo')
  assert.equal(report.trees[0].from, 'main')
  assert.match(report.warnings.join('\n'), /pagos está en feature\/sin-mergear.*line\/b sale de main/s)

  // Con un remoto que anota otra rama por defecto, ésa es la viva, y se parte de lo último que se bajó de ella.
  ok(repo, 'branch', 'trunk', main); ok(repo, 'update-ref', 'refs/remotes/origin/trunk', main)
  ok(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk')
  ok(repo, 'branch', '-q', '-D', 'main')
  assert.equal(json(['line', ops, 'c', 'pagos', '--json']).trees[0].from, 'origin/trunk')
  assert.equal(ok(repo, 'rev-parse', 'line/c'), main)

  // La rama que ya existe se usa tal cual: es la salida para montar una línea sobre otra cosa a propósito.
  ok(repo, 'branch', 'line/d', 'feature/sin-mergear')
  assert.equal(json(['line', ops, 'd', 'pagos', '--json']).trees[0].from, '')
  assert.equal(ok(repo, 'rev-parse', 'line/d'), ok(repo, 'rev-parse', 'feature/sin-mergear'))
  assert.match(run(['line', ops, 'e', 'pagos']).stdout, /\(line\/e\)\n {2}sale de: origin\/trunk\n/)
})

// Caso 398: el árbol avisa cuando su `core.hooksPath` apunta a una carpeta que no tiene. El porqué, en `missingHooks`.
test('el árbol de una línea avisa cuando su core.hooksPath apunta a una carpeta que no tiene', () => {
  const { base, ops, tree } = session('cauce-line-hooks-')
  const repo = path.join(base, 'pagos')
  fs.mkdirSync(path.join(repo, '.husky', '_'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.husky', '.gitignore'), '_\n')
  ok(repo, 'add', '.husky/.gitignore'); ok(repo, 'commit', '-qm', 'husky')
  ok(repo, 'config', 'core.hooksPath', '.husky/_')
  const warned = (report) => report.warnings.filter((one) => /hooksPath/.test(one))
  const report = json(['line', ops, 'pagos', 'pagos', '--json'])
  assert.equal(fs.existsSync(path.join(tree('pagos', 'pagos'), '.husky', '_')), false)
  assert.match(warned(report).join('\n'), /pagos: core\.hooksPath apunta a \.husky\/_, que este árbol no tiene/)
  assert.equal(fs.existsSync(path.join(tree('pagos', 'pagos'), '.husky', '_')), false, 'el aviso no la copia')
  // Mientras falte se repite al volver a pedir la línea, y deja de decirse cuando la instalación la genera.
  assert.equal(warned(json(['line', ops, 'pagos', '--json'])).length, 1)
  fs.mkdirSync(path.join(tree('pagos', 'pagos'), '.husky', '_'))
  assert.deepEqual(warned(json(['line', ops, 'pagos', '--json'])), [])
  // Una ruta absoluta que existe, o un repositorio sin hooksPath, no dicen nada.
  ok(repo, 'config', 'core.hooksPath', path.join(repo, '.husky', '_'))
  assert.deepEqual(warned(json(['line', ops, 'otra', 'pagos', '--json'])), [])
  assert.deepEqual(warned(json(['line', ops, 'sin', 'auth', '--json'])), [])
})

test('una línea se niega sin nombre, sin repositorios, sobre lo que no es un repositorio y en embebido', () => {
  const { ops, tree } = session('cauce-line-refuse-')
  const refused = (args, pattern) => {
    const result = run(['line', ops, ...args])
    assert.notEqual(result.status, 0, args.join(' '))
    assert.match(result.stderr, pattern)
  }
  refused(['Mal Nombre', 'pagos'], /en minúsculas y con guiones/)
  refused(['x'], /Falta qué repositorios trabaja la línea x/)
  refused(['x', 'shared-lib'], /shared-lib no es la raíz de un repositorio git/)
  refused(['x', '../afuera'], /no es la raíz de un repositorio git/)
  refused(['x', 'ops'], /ops es la instancia/)
  fs.mkdirSync(tree('x', 'pagos'), { recursive: true })
  refused(['x', 'pagos'], /ya existe y no es un worktree de pagos/)
  assert.equal(configOf(ops).lines, undefined, 'una línea que no se armó no queda declarada')

  // En embebido el worktree del repositorio se llevaría una segunda instancia adentro.
  const repo = path.join(tempRoot('cauce-line-embebida-'), 'prod')
  fs.mkdirSync(repo)
  ok(repo, 'init', '-q', '-b', 'main')
  assert.equal(run(['init', repo, '--name', 'Embebida', '--mode', 'embedded', '--force', '--no-install']).status, 0)
  const embedded = run(['line', repo, 'b', '.'])
  assert.notEqual(embedded.status, 0)
  assert.match(embedded.stderr, /necesita una instancia sidecar, y ésta es embedded/)
  assert.equal(fs.existsSync(path.join(path.dirname(repo), 'prod-b')), false)
})

test('un árbol borrado a mano se vuelve a armar, y la línea pedida por un enlace cae en su lugar', () => {
  const { base, ops, tree } = session('cauce-line-paths-')
  const alias = `${base}-alias`
  fs.symlinkSync(base, alias, 'dir')
  assert.equal(json(['line', path.join(alias, 'ops'), 'b', 'pagos', '--json']).trees[0].tree, tree('b', 'pagos'))
  discard(tree('b', 'pagos'))
  const rebuilt = json(['line', ops, 'b', '--json'])
  assert.equal(rebuilt.trees[0].reused, false, 'un árbol borrado se dio por reusado')
  assert.ok(fs.existsSync(path.join(tree('b', 'pagos'), 'a.js')))
})

test('dos líneas sobre el mismo repositorio se permiten, se avisan y muestran qué archivos tocaron las dos', () => {
  const { ops, tree } = session('cauce-line-overlap-')
  assert.deepEqual(json(['line', ops, 'pagos', 'pagos', '--json']).warnings, [])
  const auth = json(['line', ops, 'auth', 'auth', 'pagos', '--json'])
  assert.match(auth.warnings.join('\n'), /pagos también es de la línea pagos, en otra rama/)
  assert.equal(ok(tree('auth', 'pagos'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'line/auth')

  const lines = () => json(['lines', ops, '--json'])
  assert.deepEqual(lines().overlaps, [{ repo: 'pagos', lines: ['pagos', 'auth'], files: [] }])
  fs.appendFileSync(path.join(tree('pagos', 'pagos'), 'a.js'), '// pagos\n')
  ok(tree('pagos', 'pagos'), 'commit', '-qam', 'pagos')
  fs.appendFileSync(path.join(tree('auth', 'pagos'), 'a.js'), '// auth\n')
  fs.writeFileSync(path.join(tree('auth', 'pagos'), 'b.js'), '\n')
  ok(tree('auth', 'pagos'), 'add', 'a.js', 'b.js'); ok(tree('auth', 'pagos'), 'commit', '-qm', 'auth')
  fs.writeFileSync(path.join(tree('auth', 'auth'), 'c.js'), '\n')
  const report = lines()
  assert.deepEqual(report.overlaps, [{ repo: 'pagos', lines: ['pagos', 'auth'], files: ['a.js'] }])
  const pagos = report.declared.find((one) => one.name === 'pagos').repos[0]
  assert.deepEqual([pagos.branch, pagos.ahead, pagos.behind, pagos.dirty], ['line/pagos', 1, 0, 0])
  assert.equal(report.declared.find((one) => one.name === 'auth').repos[0].dirty, 1)
  const text = run(['lines', ops]).stdout
  assert.match(text, /\npagos {2}\(línea declarada\)\n {2}pagos {2}.*\(line\/pagos\) {2}\+1 \/ -0\n/)
  assert.match(text, /⚠ pagos lo trabajan pagos y auth.*van a chocar al mergear: a\.js/)
})

test('retirar una línea espera a que su rama llegue a la viva, y saca sólo lo que la línea armó', () => {
  const { base, ops, tree } = session('cauce-line-join-')
  json(['line', ops, 'pagos', 'pagos', 'auth', '--json'])
  json(['line', ops, 'otra', 'auth', '--json'])
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'hp.md'), '---\norder: 10\nline: pagos\n---\n\n'
    + '## Hito hp — hp\n\n- [ ] **t-pago** — Algo. _Aceptación: se ve._ (service: pagos)\n')
  fs.appendFileSync(path.join(tree('pagos', 'pagos'), 'a.js'), '// pagos\n')
  ok(tree('pagos', 'pagos'), 'commit', '-qam', 'pagos')

  const dry = json(['lines', 'join', ops, 'pagos', '--json'])
  assert.deepEqual(dry.repos.map((one) => [one.repo, one.merged]), [['pagos', false], ['auth', true]])
  assert.deepEqual(dry.milestones, ['hp'], 'nombra los hitos que se quedarían sin quién los tome')
  const early = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(early.status, 0)
  assert.match(early.stderr, /pagos: line\/pagos no llegó a main/)
  assert.ok(fs.existsSync(tree('pagos', 'pagos')), 'retiró una línea que no había llegado')

  ok(path.join(base, 'pagos'), 'merge', '-q', '--no-ff', '-m', 'merge', 'line/pagos')
  fs.writeFileSync(path.join(tree('pagos', 'auth'), 'suelto.js'), '\n')
  const dirty = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(dirty.status, 0)
  assert.match(dirty.stderr, /auth: 1 cambio\(s\) sin commitear/)
  fs.unlinkSync(path.join(tree('pagos', 'auth'), 'suelto.js'))

  const done = json(['lines', 'join', ops, 'pagos', '--apply', '--json'])
  assert.equal(done.applied, true)
  assert.equal(fs.existsSync(path.join(base, 'lines', 'pagos')), false, 'quedó la carpeta de la línea')
  assert.equal(git(path.join(base, 'pagos'), 'rev-parse', '--verify', '--quiet', 'refs/heads/line/pagos').status, 1)
  assert.deepEqual(configOf(ops).lines, { otra: ['auth'] }, 'la declaración de la otra línea se queda')
  // Los enlaces se fueron sin llevarse lo que enlazaban, y la otra línea sigue entera.
  assert.ok(fs.existsSync(path.join(base, 'shared-lib')) && fs.existsSync(path.join(base, 'auth', 'a.js')))
  assert.ok(fs.existsSync(path.join(tree('otra', 'auth'), 'a.js')))
  json(['lines', 'join', ops, 'otra', '--apply', '--json'])
  assert.equal(configOf(ops).lines, undefined, 'sin líneas, la clave se va')
  assert.equal(fs.existsSync(path.join(base, 'lines')), false)
})

// Se arma a mano lo que `ops line` armaba hasta 0.110.0, con una nota copiada a mano en la carpeta de al lado.
function legacy(base, ops, name) {
  const home = `${base}-${name}`
  ok(ops, 'worktree', 'add', '-q', '-b', `line/${name}`, path.join(home, 'ops'))
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), 'Reglas copiadas a mano.\n')
  const planning = path.join(home, 'ops', 'planning')
  fs.writeFileSync(path.join(planning, 'backlog', 'hv.md'), `---\norder: 10\nline: ${name}\n---\n\n`
    + '## Hito hv — hv\n\n- [ ] **t-vieja** — Algo. _Aceptación: se ve._ (service: pagos)\n')
  ok(path.join(home, 'ops'), 'add', 'planning/backlog/hv.md'); ok(path.join(home, 'ops'), 'commit', '-qm', 'línea')
  return { home, planning }
}

test('una línea de antes se migra: su planning llega a la instancia y se arma la nueva', () => {
  const { base, ops, tree } = session('cauce-line-migrate-')
  const { home, planning } = legacy(base, ops, 'vieja')
  const refused = run(['line', ops, 'vieja', 'pagos'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /disposición de antes.*ops lines migrate <ops-root> vieja <repo>/s)

  // Un reclamo en vuelo lleva el id del árbol que se va: se niega hasta que se cierre.
  assert.equal(run(['claim', planning, 't-vieja'], undefined, { CAUCE_RUNNER: 'r', CAUCE_OWNER: 't@t' }).status, 0)
  const dry = json(['lines', 'migrate', ops, 'vieja', 'pagos', '--json'])
  assert.deepEqual([dry.commits, dry.claims, dry.applied, dry.home], [1, ['t-vieja'], false, home])
  const held = run(['lines', 'migrate', ops, 'vieja', 'pagos', '--apply'])
  assert.notEqual(held.status, 0)
  assert.match(held.stderr, /reclamos en vuelo \(t-vieja\)/)
  assert.equal(run(['release', planning, 't-vieja'], undefined, { CAUCE_RUNNER: 'r' }).status, 0)

  const done = run(['lines', 'migrate', ops, 'vieja', 'pagos', '--apply'])
  assert.equal(done.status, 0, done.stderr)
  assert.ok(fs.existsSync(path.join(ops, 'planning', 'backlog', 'hv.md')), 'el planning de la línea no llegó')
  assert.equal(ok(ops, 'worktree', 'list', '--porcelain').includes(home), false, 'el worktree de antes sigue')
  assert.equal(git(ops, 'rev-parse', '--verify', '--quiet', 'refs/heads/line/vieja').status, 1)
  assert.equal(ok(tree('vieja', 'pagos'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'line/vieja')
  assert.deepEqual(configOf(ops).lines, { vieja: ['pagos'] })
  // La carpeta de al lado tiene lo que alguien copió a mano: no se borra, se dice.
  assert.ok(fs.existsSync(path.join(home, 'CLAUDE.md')))
  assert.ok(done.stdout.includes(`⚠ ${home} era la carpeta de sesión de la línea y ya no se usa`), done.stdout)
  assert.match(run(['lines', 'migrate', ops, 'vieja', 'pagos']).stderr, /no hay una línea vieja de antes/)
})

// Caso 397: migrar avisa fuera de la rama viva y no frena, y una línea empujada no avisa. El porqué, en `arrival`.
test('migrar avisa si la instancia no está en su rama viva, y no por una línea empujada', () => {
  const { base, ops } = session('cauce-line-migrate-avisa-')
  legacy(base, ops, 'vieja')
  const warned = (report) => report.warnings.join('\n')
  const quiet = json(['lines', 'migrate', ops, 'vieja', 'pagos', '--json'])
  assert.deepEqual([quiet.into, quiet.live, quiet.warnings], ['main', 'main', []], 'en la viva no avisa')

  ok(ops, 'switch', '-q', '-c', 'build/upgrade')
  assert.match(warned(json(['lines', 'migrate', ops, 'vieja', 'pagos', '--json'])),
    /la instancia está en build\/upgrade; el planning de vieja va a quedar ahí y no en main/)
  // Sin commits que traer no hay planning que vaya a ningún lado, y no avisa.
  ok(ops, 'worktree', 'add', '-q', '-b', 'line/vacia', path.join(`${base}-vacia`, 'ops'))
  const empty = json(['lines', 'migrate', ops, 'vacia', 'pagos', '--json'])
  assert.deepEqual([empty.commits, empty.warnings], [0, []], 'avisa sin nada que traer')
  // Empujada y sin llegar a la viva, que es donde el aviso del 396 hablaba: ya no dice nada de eso.
  ok(ops, 'update-ref', 'refs/remotes/origin/line/vieja', 'line/vieja')
  const pushed = run(['lines', 'migrate', ops, 'vieja', 'pagos'])
  assert.equal(pushed.status, 0, pushed.stderr)
  assert.match(pushed.stdout, /⚠ la instancia está en build\/upgrade/)
  assert.doesNotMatch(pushed.stdout, /empujada|dos caminos/)

  // Con --apply el aviso sale antes de traerla, y también cuando --apply se niega.
  const tracked = path.join(ops, ok(ops, 'ls-files').split('\n')[0])
  const before = fs.readFileSync(tracked, 'utf8')
  fs.appendFileSync(tracked, '\n')
  const refused = run(['lines', 'migrate', ops, 'vieja', 'pagos', '--apply'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stdout, /⚠ la instancia está en build\/upgrade/, 'el apply que se niega no avisa')
  fs.writeFileSync(tracked, before)
  const applied = run(['lines', 'migrate', ops, 'vieja', 'pagos', '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  assert.ok(applied.stdout.indexOf('⚠ la instancia está en build/upgrade') > -1, applied.stdout)
  assert.ok(applied.stdout.indexOf('⚠ la instancia está en build/upgrade') < applied.stdout.indexOf('MIGRAR'),
    'el aviso llega después de haber traído la línea')
  assert.equal(applied.stdout.split('⚠ la instancia está en').length, 2, 'avisa dos veces')
})

// Un repositorio anidado en la carpeta de sesión: lo que se enlaza es cada nivel que lleva a él, para que `../`
// resuelva igual a cualquier profundidad. Y una carpeta de sesión que es ella misma un repositorio no ve
// `lines/` como trabajo suyo.
test('un repositorio anidado se enlaza por niveles, y lines/ no ensucia una carpeta de sesión con git', () => {
  const { base, ops, tree } = session('cauce-line-nested-')
  const web = path.join(base, 'servicios', 'web')
  fs.mkdirSync(path.join(base, 'servicios', 'docs'), { recursive: true })
  fs.mkdirSync(web)
  ok(web, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(web, 'a.js'), '\n')
  ok(web, 'add', 'a.js'); ok(web, 'commit', '-qm', 'init')
  ok(base, 'init', '-q', '-b', 'main')

  const report = json(['line', ops, 'web', 'servicios/web', '--json'])
  assert.equal(report.trees[0].tree, tree('web', path.join('servicios', 'web')))
  assert.deepEqual(report.linked, ['auth', 'pagos', 'shared-lib', path.join('servicios', 'docs')])
  assert.equal(fs.realpathSync(path.join(base, 'lines', 'web', 'servicios', 'docs')),
    path.join(base, 'servicios', 'docs'))
  assert.match(fs.readFileSync(path.join(base, '.git', 'info', 'exclude'), 'utf8'), /^\/lines\/$/m)
  assert.equal(ok(base, 'status', '--porcelain').includes('lines'), false, 'lines/ aparece como trabajo')
  json(['line', ops, 'web', '--json'])
  assert.equal(fs.readFileSync(path.join(base, '.git', 'info', 'exclude'), 'utf8').match(/\/lines\//g).length, 1)

  // Retirarla saca también los enlaces de adentro de cada nivel, y las carpetas que quedan vacías.
  const text = run(['lines', 'join', ops, 'web'])
  assert.match(text.stdout, /^RETIRAR la línea web {2}\(1 repositorio\(s\)\)\n {2}servicios\/web {2}llegó a main\n/)
  assert.match(text.stdout, /Para hacerlo: ops lines join <ops-root> web --apply/)
  const applied = run(['lines', 'join', ops, 'web', '--apply'])
  assert.match(applied.stdout, /✓ retirada: sin árboles, sin line\/web y fuera de ops\.config\.json/)
  assert.equal(fs.existsSync(path.join(base, 'lines')), false)
  assert.ok(fs.existsSync(path.join(base, 'servicios', 'docs')), 'el enlace se llevó lo que enlazaba')
})

test('la cola, los reclamos y el plan de una línea se ven en su bloque de ops lines', () => {
  const { ops } = session('cauce-line-status-')
  json(['line', ops, 'pagos', 'pagos', '--json'])
  const planning = path.join(ops, 'planning')
  fs.writeFileSync(path.join(planning, 'backlog', 'hp.md'), '---\norder: 10\nline: pagos\n---\n\n'
    + '## Hito hp — hp\n\n- [ ] **t-pago** — Algo. _Aceptación: se ve._ (service: pagos)\n')
  const as = (...args) => run(args, ops, { CAUCE_RUNNER: '', CAUCE_OWNER: 't@t' })
  assert.equal(as('claim', planning, 't-pago', '--line', 'pagos').status, 0)
  const id = JSON.parse(as('context', planning, '--line', 'pagos', '--json').stdout).wipFile
  fs.writeFileSync(path.join(planning, id), '---\ntask: t-pago\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Algo\n')
  const [pagos] = json(['lines', ops, '--json']).declared
  assert.deepEqual(pagos.milestones, [{ slug: 'hp', tasks: 1 }])
  assert.deepEqual(pagos.claims.map((one) => one.slug), ['t-pago'])
  assert.deepEqual(pagos.wips.map((one) => [one.task, one.phase]), [['t-pago', 'Build']])
  const text = run(['lines', ops]).stdout
  assert.match(text, /\npagos {2}\(línea declarada\)\n.*\n {2}cola: hp \(1\)\n/)
  assert.match(text, /\n {2}reclamos: t-pago .*\n {2}en vuelo: t-pago \[Build\]/)

  // Migrar se pide desde la instancia, no desde el árbol de una línea de antes.
  ok(ops, 'add', '-A'); ok(ops, 'commit', '-qm', 'estado')
  const away = path.join(path.dirname(ops), '..', `${path.basename(path.dirname(ops))}-vieja`, 'ops')
  ok(ops, 'worktree', 'add', '-q', '-b', 'line/vieja', away)
  assert.match(run(['lines', 'migrate', away, 'vieja', 'pagos']).stderr, /esto es el árbol de la línea vieja/)
})
