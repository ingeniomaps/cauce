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
