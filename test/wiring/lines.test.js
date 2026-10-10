'use strict'

// Una línea de trabajo con su propia carpeta de sesión (caso 218). Lo que se mide es lo que el caso mostró roto:
// que la sesión de una línea corra los guards de su árbol, que armarla no toque la configuración de la otra, y
// que instalar desde un worktree no mueva los guards de todas las sesiones sin avisar.

const { tempRoot, run, linkEngine, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { layout } = require('../../engine/cli/lines')

const shellHook = (home) => (fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')
  .match(/\$CLAUDE_PROJECT_DIR\/[^"]*guard-shell\.sh/) || [''])[0]

// Una instancia sidecar en su repositorio, con Claude instalado y commiteado: el punto de partida del caso.
function instance(name) {
  const base = tempRoot(name)
  const target = path.join(base, 'ops')
  assert.equal(run(['init', target, '--name', 'Lineas', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: target, encoding: 'utf8' })
  if (!fs.existsSync(path.join(target, '.git'))) git('init', '-q', '-b', 'main')
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  git('add', '.'); git('commit', '-qm', 'instancia')
  return { base, target, git }
}

test('una línea tiene su carpeta de sesión, con su worktree, su motor y sus guards', () => {
  const { base, target } = instance('cauce-line-')
  const before = shellHook(base)
  const made = run(['line', target, 'b', '--json'])
  assert.equal(made.status, 0, made.stderr)
  const report = JSON.parse(made.stdout)
  assert.equal(report.home, path.join(path.dirname(base), `${path.basename(base)}-b`))
  assert.equal(report.branch, 'line/b')
  assert.deepEqual(report.runners, ['claude'])
  assert.ok(fs.existsSync(path.join(report.tree, 'node_modules', '@ingeniomaps', 'cauce', 'engine')), 'sin motor')
  assert.equal(shellHook(report.home), '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-shell.sh')
  assert.equal(shellHook(base), before, 'armar la línea tocó la configuración de la otra')

  // Lo que el caso pedía en el fondo: el guard de la sesión de la línea corre, sobre el árbol de la línea.
  const hook = path.join(report.home, 'ops', 'automatization', 'hooks', 'guard-shell.sh')
  const blocked = spawnSync(hook, [], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: report.home },
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }) })
  assert.equal(blocked.status, 2, blocked.stderr)
  assert.match(blocked.stderr, /catastrófico/)

  // Caso 275: la línea nace limpia. Ni el manifiesto, que viaja por git, ni el enlace al motor aparecen como
  // cambios que nadie hizo.
  const dirty = spawnSync('git', ['-C', report.tree, 'status', '--porcelain'], { encoding: 'utf8' }).stdout
  assert.equal(dirty, '', `el árbol de la línea recién armada no tiene nada que commitear: ${dirty}`)

  const again = run(['line', target, 'b', '--json'])
  assert.equal(JSON.parse(again.stdout).reused, true, 'la segunda vez la reusa')
  const text = run(['line', target, 'b'])
  assert.match(text.stdout, /^= .*\(line\/b\)\n {2}runners: claude\nAbrí la sesión de esta línea en /)
})

test('instalar desde un worktree no mueve los guards de la carpeta compartida sin avisar', () => {
  const { base, target, git } = instance('cauce-line-foreign-')
  const before = shellHook(base)
  git('worktree', 'add', '-q', path.join(base, 'ops-b'), '-b', 'work/b')
  linkEngine(path.join(base, 'ops-b'))
  const moved = run(['automation', 'install', path.join(base, 'ops-b'), 'claude'])
  assert.notEqual(moved.status, 0, 'se instaló sobre la configuración de otro árbol')
  assert.match(moved.stderr, /tiene los guards de Cauce apuntando a \$CLAUDE_PROJECT_DIR\/ops\/.*ops line/s)
  assert.equal(shellHook(base), before, 'los movió igual')
  const forced = run(['automation', 'install', path.join(base, 'ops-b'), 'claude', '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(shellHook(base), /\/ops-b\//, 'con --force se mueven, que es la salida declarada')
})

test('la línea de una instancia embebida es un worktree hermano del repo entero', () => {
  const where = layout('/w/producto/ops', '/w/producto', 'b')
  assert.equal(where.tree, '/w/producto-b')
  assert.equal(where.ops, '/w/producto-b/ops')
  assert.equal(where.branch, 'line/b')
})

// En sidecar el producto vive al lado de la instancia: la línea tiene que encontrarlo donde su configuración
// lo busca, o cada ruta del producto se resolvería a una carpeta vacía.
test('los repositorios del producto fuera de la instancia se enlazan en la carpeta de la línea', () => {
  const { base, target, git } = instance('cauce-line-product-')
  fs.mkdirSync(path.join(base, 'producto'))
  const configFile = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.workspaceRoots = [{ name: 'producto', path: '../producto' }]
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  git('add', 'ops.config.json'); git('commit', '-qm', 'producto al lado')
  const report = JSON.parse(run(['line', target, 'b', '--json']).stdout)
  assert.deepEqual(report.linked, ['../producto'])
  assert.equal(fs.realpathSync(path.join(report.home, 'producto')), fs.realpathSync(path.join(base, 'producto')))
})

test('una línea se niega sin nombre válido, sin repositorio o sobre una carpeta que no es suya', () => {
  const { base, target } = instance('cauce-line-refuse-')
  assert.match(run(['line', target, 'Mal Nombre']).stderr, /en minúsculas y con guiones/)
  fs.mkdirSync(path.join(`${base}-c`, 'ops'), { recursive: true })
  const taken = run(['line', target, 'c'])
  assert.notEqual(taken.status, 0)
  assert.match(taken.stderr, /ya existe y no es un worktree de esta instancia/)

  const loose = path.join(tempRoot('cauce-line-nogit-'), 'ops')
  assert.equal(run(['init', loose, '--name', 'Suelta', '--mode', 'sidecar']).status, 0)
  discard(path.join(loose, '.git'))
  assert.match(run(['line', loose, 'b']).stderr, /no está en un repositorio git/)
})

// Revisión de la rama: un hook propio con comillas escapadas rompía cualquier instalación, porque la
// configuración se leía con una regex sobre el texto.
test('un hook propio con comillas escapadas no rompe la reinstalación', () => {
  const { base, target } = instance('cauce-line-quotes-')
  const file = path.join(base, '.claude', 'settings.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.hooks.Stop.push({ hooks: [{ type: 'command', command: 'bash -c "echo hola"' }] })
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  const again = run(['automation', 'install', target, 'claude'])
  assert.equal(again.status, 0, again.stderr)
})

test('el freno también vale para Codex, que escribe la ruta absoluta del árbol', () => {
  const { base, target, git } = instance('cauce-line-codex-')
  assert.equal(run(['automation', 'install', target, 'codex']).status, 0)
  git('worktree', 'add', '-q', path.join(base, 'ops-b'), '-b', 'work/b')
  linkEngine(path.join(base, 'ops-b'))
  const moved = run(['automation', 'install', path.join(base, 'ops-b'), 'codex'])
  assert.notEqual(moved.status, 0, 'movió los guards de Codex a otro árbol')
  assert.match(moved.stderr, /ops line/)
})

test('una línea pedida por un enlace, o borrada a mano, se arma igual en su lugar', () => {
  const { base, target } = instance('cauce-line-paths-')
  const alias = `${base}-alias`
  fs.symlinkSync(base, alias, 'dir')
  const report = JSON.parse(run(['line', path.join(alias, path.basename(target)), 'b', '--json']).stdout)
  assert.equal(report.home, `${fs.realpathSync(base)}-b`, 'por el enlace la línea cayó en otro lugar')

  // Otro árbol de la instancia que hoy no está —un volumen desmontado— no pierde su registro por esto.
  const away = path.join(fs.realpathSync(base), 'en-otro-volumen')
  const git = (...args) => spawnSync('git', ['-C', target, ...args], { encoding: 'utf8' })
  assert.equal(git('worktree', 'add', '-q', '-b', 'otra', away).status, 0)
  fs.renameSync(away, `${away}-desmontado`)

  discard(report.home)
  const rebuilt = run(['line', target, 'b', '--json'])
  assert.equal(rebuilt.status, 0, rebuilt.stderr)
  assert.equal(JSON.parse(rebuilt.stdout).reused, false, 'una línea borrada se dio por reusada')
  assert.ok(fs.existsSync(path.join(report.home, 'ops', 'automatization', 'hooks')), 'quedó a medias')
  assert.match(git('worktree', 'list', '--porcelain').stdout, /en-otro-volumen\n/, 'el otro sigue registrado')
})

// Caso 263. La raíz declarada es la carpeta que contiene a la instancia, con un repositorio por servicio
// adentro. Su lugar en la línea es la propia carpeta de la línea, así que enlazarla entera no enlazaba nada:
// la línea quedaba con el worktree de la instancia y sin producto.
test('una raíz que es la carpeta de sesión lleva sus hijos a la carpeta de la línea', () => {
  const { base, target, git } = instance('cauce-line-container-')
  fs.mkdirSync(path.join(base, 'api', 'src'), { recursive: true })
  fs.writeFileSync(path.join(base, 'NOTAS.md'), 'de la carpeta, no de una rama\n')
  // La configuración de un runner que la instancia no tiene instalado: está en la carpeta y no viaja.
  fs.mkdirSync(path.join(base, '.gemini'))
  fs.writeFileSync(path.join(base, '.gemini', 'nota.txt'), 'x\n')
  const configFile = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.workspaceRoots = [{ name: 'main', path: '..' }]
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  git('add', 'ops.config.json'); git('commit', '-qm', 'la raíz es la carpeta de sesión')

  const report = JSON.parse(run(['line', target, 'b', '--json']).stdout)
  const real = (...parts) => fs.realpathSync(path.join(...parts))
  assert.equal(real(report.home, 'api'), real(base, 'api'), 'el repositorio del servicio viaja')
  assert.equal(real(report.home, 'NOTAS.md'), real(base, 'NOTAS.md'), 'y lo que la sesión lee de esa carpeta')
  assert.ok(report.linked.includes(path.join('..', 'api')), JSON.stringify(report.linked))

  // La instancia y la configuración del runner no se enlazan: la línea tiene las suyas, y es por eso que su
  // sesión corre los guards de su árbol y no los del original.
  for (const own of ['ops', '.claude']) {
    assert.equal(fs.lstatSync(path.join(report.home, own)).isSymbolicLink(), false, `${own} es de la línea`)
  }
  assert.equal(shellHook(report.home), '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-shell.sh')
  assert.notEqual(real(report.home, '.claude'), real(base, '.claude'))
  assert.equal(fs.existsSync(path.join(report.home, '.gemini')), false, 'ni la de un runner sin instalar')

  // Y armarla de nuevo no duplica ni rompe nada.
  const again = JSON.parse(run(['line', target, 'b', '--json']).stdout)
  assert.equal(again.reused, true)
  assert.deepEqual(again.linked, [], 'lo que ya está enlazado no se vuelve a enlazar')
})

// Una instancia creada antes del caso 275 ignora `node_modules/`, con barra, que no cubre un enlace. La
// línea lo anota por su cuenta en el `exclude` del repositorio, así que su `.gitignore` no hace falta tocarlo.
test('el enlace al motor no ensucia la línea de una instancia con el .gitignore de antes', () => {
  const { target, git } = instance('cauce-line-ignore-')
  const ignore = path.join(target, '.gitignore')
  fs.writeFileSync(ignore, fs.readFileSync(ignore, 'utf8').replace(/^node_modules$/m, 'node_modules/'))
  assert.match(fs.readFileSync(ignore, 'utf8'), /^node_modules\/$/m)
  git('add', '.gitignore'); git('commit', '-qm', 'el gitignore de antes')
  const report = JSON.parse(run(['line', target, 'b', '--json']).stdout)
  assert.ok(fs.lstatSync(path.join(report.tree, 'node_modules')).isSymbolicLink(), 'el motor es un enlace')
  const dirty = spawnSync('git', ['-C', report.tree, 'status', '--porcelain'], { encoding: 'utf8' }).stdout
  assert.equal(dirty, '', dirty)
})

// Caso 358. Con el producto anidado y registrado como enlace de git, la carpeta nace vacía en la línea.
// `check` ya lo avisaba; armar la línea contestaba `✓` y nada más.
test('armar una línea dice si alguna raíz quedó vacía por ser un enlace de git', () => {
  const { target, git } = instance('cauce-line-nested-')
  const clean = JSON.parse(run(['line', target, 'a', '--json']).stdout)
  assert.deepEqual(clean.warnings, [], 'sin nada anidado no hay qué avisar')

  const product = path.join(target, 'app')
  fs.mkdirSync(path.join(product, 'src'), { recursive: true })
  fs.writeFileSync(path.join(product, 'src', 'a.js'), 'module.exports = 1\n')
  const inner = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: product, encoding: 'utf8' })
  inner('init', '-q', '-b', 'main'); inner('add', 'src/a.js'); inner('commit', '-qm', 'producto')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: 'app' }]
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  git('add', 'ops.config.json', 'app'); git('commit', '-qm', 'producto anidado')

  const made = run(['line', target, 'b', '--json'])
  assert.equal(made.status, 0, 'avisa, no se niega')
  const report = JSON.parse(made.stdout)
  assert.deepEqual(fs.readdirSync(path.join(report.tree, 'app')), [], 'la precondición: la carpeta quedó vacía')
  assert.equal(report.warnings.length, 1)
  assert.match(report.warnings[0], /workspaceRoots: app .*esa carpeta queda vacía.*git rm --cached "app"/s)
  const text = run(['line', target, 'b'])
  assert.match(text.stdout, /^= .*\n(?:.*\n)*⚠ workspaceRoots: app /, 'y en la salida de texto también')
})

// Caso 363. En una instancia embebida la configuración del runner vive en el repositorio. Si está en git, la
// línea nace con los recorridos de la carpeta original, que llevan su ruta escrita.
function embedded(name, runner = 'claude') {
  const repo = path.join(tempRoot(name), 'prod')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  assert.equal(run(['init', repo, '--name', 'Embebida', '--mode', 'embedded', '--force']).status, 0)
  linkEngine(repo)
  assert.equal(run(['automation', 'install', repo, runner]).status, 0)
  git('add', '.'); git('commit', '-qm', 'instancia embebida con su runner')
  const rootOf = (dir) => (fs.readFileSync(path.join(dir, '.claude', 'workflows', 'autobuild.js'), 'utf8')
    .match(/^const ROOT = '([^']*)'/m) || [])[1]
  return { repo, git, rootOf }
}

test('la línea de una instancia embebida recibe sus recorridos apuntando a ella', () => {
  const { repo, rootOf } = embedded('cauce-line-embebida-')
  assert.equal(rootOf(repo), fs.realpathSync(repo), 'la precondición: el original apunta a sí mismo')
  const made = run(['line', repo, 'b', '--json'])
  assert.equal(made.status, 0, made.stderr)
  const line = JSON.parse(made.stdout).tree
  assert.equal(rootOf(line), line, 'la línea quedó con los recorridos de la carpeta original')
  assert.equal(rootOf(repo), fs.realpathSync(repo), 'y armarla no tocó los del original')
})

// Lo que una persona editó de verdad no se pisa, y la línea no se da por armada: se dice.
test('si el runner no se puede instalar en la línea, ops line lo dice y no contesta que quedó', () => {
  const { repo, git, rootOf } = embedded('cauce-line-embebida-editada-')
  const file = path.join(repo, '.claude', 'workflows', 'autobuild.js')
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n// un cambio a mano\n`)
  git('add', '.'); git('commit', '-qm', 'recorrido editado a mano')
  const made = run(['line', repo, 'b'])
  assert.notEqual(made.status, 0)
  assert.match(made.stderr, /fueron editados y se perderían/, 'la razón de siempre')
  assert.match(made.stderr, /la línea .* quedó sin su runner/s, 'y qué significa para la línea')
  assert.doesNotMatch(made.stdout, /^✓/m)
  assert.equal(rootOf(repo), fs.realpathSync(repo))
})

// Lo mismo que le pasa a la línea le pasa al clon de un compañero: trae por git lo que se instaló en la
// carpeta de otro. La raíz escrita se lee del archivo, así que no hace falta saber de dónde vino.
test('un clon en otra ruta instala su runner sin que lo de la otra carpeta cuente como editado', () => {
  const { repo, rootOf } = embedded('cauce-line-embebida-clon-')
  const clone = path.join(path.dirname(repo), 'clon')
  assert.equal(spawnSync('git', ['clone', '-q', repo, clone], { encoding: 'utf8' }).status, 0)
  linkEngine(clone)
  assert.equal(rootOf(clone), fs.realpathSync(repo), 'la precondición: nace apuntando a la carpeta original')
  const installed = run(['automation', 'install', clone, 'claude'])
  assert.equal(installed.status, 0, installed.stderr)
  assert.equal(rootOf(clone), fs.realpathSync(clone))

  // Y lo editado de verdad sigue sin pisarse, venga de la carpeta que venga.
  const file = path.join(clone, '.claude', 'workflows', 'flow.js')
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n// un cambio a mano\n`)
  const again = run(['automation', 'install', clone, 'claude'])
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /1 archivo\(s\) que mantiene Cauce fueron editados/)
})

// Con Codex lo que lleva la ruta escrita es su configuración de hooks, que también viaja por git. La línea
// es una carpeta propia: mover ahí los guards no se los saca a ninguna otra sesión.
test('la línea de una instancia embebida con Codex también se arma, con sus guards apuntando a ella', () => {
  const { repo } = embedded('cauce-line-embebida-codex-', 'codex')
  const hooksOf = (dir) => fs.readFileSync(path.join(dir, '.codex', 'hooks.json'), 'utf8')
  assert.ok(hooksOf(repo).includes(fs.realpathSync(repo)), 'la precondición: la ruta va escrita')
  const made = run(['line', repo, 'b', '--json'])
  assert.equal(made.status, 0, made.stderr)
  const line = JSON.parse(made.stdout).tree
  assert.ok(hooksOf(line).includes(`${line}/`), 'los guards de la línea apuntan a la línea')
  assert.ok(!hooksOf(line).includes(`${fs.realpathSync(repo)}/`), 'y ninguno quedó apuntando al original')
  assert.ok(!hooksOf(repo).includes(`${line}/`), 'ni los del original se movieron')
})
