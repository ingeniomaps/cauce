'use strict'

// Instalar un runner en una carpeta de sesión que otro árbol comparte (caso 218): no mueve los guards de todas
// las sesiones sin avisar, y lo que lleva la ruta escrita de una carpeta no se cuenta como editado en otra.
// Vivía con las líneas de trabajo porque una línea tenía su propia carpeta de sesión; desde el caso 394 no la
// tiene, y lo que queda es de la instalación.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

test('instalar desde un worktree no mueve los guards de la carpeta compartida sin avisar', () => {
  const { base, target, git } = instance('cauce-line-foreign-')
  const before = shellHook(base)
  git('worktree', 'add', '-q', path.join(base, 'ops-b'), '-b', 'work/b')
  linkEngine(path.join(base, 'ops-b'))
  const moved = run(['automation', 'install', path.join(base, 'ops-b'), 'claude'])
  assert.notEqual(moved.status, 0, 'se instaló sobre la configuración de otro árbol')
  assert.match(moved.stderr, /tiene los guards de Cauce apuntando a \$CLAUDE_PROJECT_DIR\/ops\/.*/s)
  // La salida que nombra ya no es armar una línea con carpeta propia, que desde el caso 394 no existe.
  assert.match(moved.stderr, /línea de trabajo no necesita su propia instalación.*ops line <ops-root> <nombre> <repo>/s)
  assert.doesNotMatch(moved.stderr, /propia carpeta de sesión/)
  assert.equal(shellHook(base), before, 'los movió igual')
  const forced = run(['automation', 'install', path.join(base, 'ops-b'), 'claude', '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(shellHook(base), /\/ops-b\//, 'con --force se mueven, que es la salida declarada')
})

// Revisión de la rama del caso 394: un hook propio con comillas escapadas rompía cualquier instalación, porque la
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

// Una instancia embebida con su runner instalado y commiteado. Ahí la configuración del runner vive en el
// repositorio, y lo que lleva la ruta de la carpeta escrita viaja por git a cualquier otra (caso 363).
function embedded(name, runner = 'claude', { committed = false } = {}) {
  const repo = path.join(tempRoot(name), 'prod')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  assert.equal(run(['init', repo, '--name', 'Embebida', '--mode', 'embedded', '--force']).status, 0)
  linkEngine(repo)
  assert.equal(run(['automation', 'install', repo, runner]).status, 0)
  git('add', '.')
  // La instancia anterior al 364, que tiene en git lo que el runner instaló con su ruta.
  if (committed) git('add', '-f', '.claude/workflows')
  git('commit', '-qm', 'instancia embebida con su runner')
  const rootOf = (dir) => (fs.readFileSync(path.join(dir, '.claude', 'workflows', 'autobuild.js'), 'utf8')
    .match(/^const ROOT = '([^']*)'/m) || [])[1]
  return { repo, git, rootOf }
}

// El clon de un compañero trae por git lo que se instaló en la carpeta de otro. La raíz escrita se lee del
// archivo, así que no hace falta saber de dónde vino.
test('un clon en otra ruta instala su runner sin que lo de la otra carpeta cuente como editado', () => {
  const { repo, rootOf } = embedded('cauce-line-embebida-clon-', 'claude', { committed: true })
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

// Caso 364. Lo que un runner instala con la ruta de la carpeta escrita es de esa carpeta: en git, cada clon
// lo ve modificado. El molde lo ignora, y `check` se lo dice a la instancia que nació antes.
test('lo que el runner instala con la ruta escrita no entra a git, y check avisa donde sí entra', () => {
  const { repo, git, rootOf } = embedded('cauce-line-embebida-ignorado-')
  const tracked = () => git('ls-files', '.claude/workflows').stdout.trim().split('\n').filter(Boolean)
  const status = (dir) => spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout
  const about = () => JSON.parse(run(['check', path.join(repo, 'planning'), '--json']).stdout).warnings
    .filter((one) => /ruta de esta carpeta/.test(one))
  assert.deepEqual(tracked(), [], 'el `git add .` de una instancia nueva no los lleva')
  assert.ok(git('ls-files', '.claude/settings.json').stdout.trim(), 'lo que no lleva ruta sí viaja')
  assert.deepEqual(about(), [])

  // Un clon instala los suyos y queda limpio.
  const clone = path.join(path.dirname(repo), 'clon')
  assert.equal(spawnSync('git', ['clone', '-q', repo, clone], { encoding: 'utf8' }).status, 0)
  linkEngine(clone)
  assert.equal(run(['automation', 'install', clone, 'claude']).status, 0)
  assert.equal(rootOf(clone), fs.realpathSync(clone))
  assert.equal(status(clone), '', 'el clon nace sin nada modificado')

  // Una instancia anterior no tiene la línea en su .gitignore: check dice cuál agregar.
  const ignore = path.join(repo, '.gitignore')
  fs.writeFileSync(ignore, fs.readFileSync(ignore, 'utf8').split('\n')
    .filter((one) => !one.startsWith('.claude/workflows') && !one.startsWith('.agents/')).join('\n'))
  const [missing, ...rest] = about()
  assert.deepEqual(rest, [])
  assert.match(missing, /9 archivo\(s\).*\.claude\/workflows\/.*agregá esa/s)
  assert.doesNotMatch(missing, /git rm/)
  // Y si ya los commiteó, cómo sacarlos.
  git('add', '.claude/workflows'); git('commit', '-qm', 'recorridos en git')
  assert.match(about()[0], /ya están en git.*git rm -r --cached \.claude\/workflows\//s)
  // Agregar la línea no alcanza si ya están adentro: git sigue lo que ya tiene, lo ignore o no.
  fs.appendFileSync(ignore, '\n.claude/workflows/\n')
  assert.match(about()[0], /ya están en git/)
  git('rm', '-r', '-q', '--cached', '.claude/workflows/')
  assert.deepEqual(about(), [], 'sacados del índice y con la línea puesta, no queda nada que avisar')
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'workflows', 'autobuild.js')), 'y siguen en disco')
})
