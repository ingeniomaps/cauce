'use strict'

// Los guards de Claude Code en una sesión abierta en una subcarpeta del proyecto. Por qué van en
// `.claude/settings.local.json`, en `engine/automation/subfolder-hooks.js`. `HOME` y `XDG_CONFIG_HOME` van a un
// temporal: el `.gitignore` global de quien corre la prueba puede ignorar ya ese archivo, y entonces el bloque no lo
// repetiría (R23).

const { tempRoot, linkEngine } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')

function project(name, withGit = true) {
  const base = tempRoot(name)
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(path.join(base, 'home'), { recursive: true })
  fs.mkdirSync(path.join(workspace, 'portal'), { recursive: true })
  const env = { ...process.env, HOME: path.join(base, 'home'), XDG_CONFIG_HOME: path.join(base, 'home', '.config') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDECODE']) delete env[key]
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  if (withGit) assert.equal(spawnSync('git', ['init', '-q', workspace], { env }).status, 0)
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  return { workspace, target, env, runCli, local: path.join(workspace, '.claude', 'settings.local.json') }
}

const said = (result) => `${result.stdout}${result.stderr}`
const commands = (file) => Object.values(JSON.parse(fs.readFileSync(file, 'utf8')).hooks || {})
  .flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)))

test('install lleva los guards de Claude a una sesión abierta en una subcarpeta, y los apaga en la raíz', () => {
  const { workspace, target, env, runCli, local } = project('cauce-subcarpeta-')
  // Lo que la persona ya tenía en su archivo local queda.
  fs.mkdirSync(path.dirname(local), { recursive: true })
  const mine = { type: 'command', command: 'echo mio' }
  const own = { permissions: { allow: ['Bash(ls)'] }, hooks: { Stop: [{ hooks: [mine] }] } }
  fs.writeFileSync(local, JSON.stringify(own))
  const installed = runCli(['automation', 'install', target, 'claude'])
  assert.equal(installed.status, 0, said(installed))
  assert.match(installed.stdout, /settings\.local\.json lleva los guards a una sesión abierta en una subcarpeta/)
  assert.match(installed.stdout, /no en un repo de producto con git propio/)
  assert.doesNotMatch(installed.stdout, /subcarpeta sin git/)

  const written = JSON.parse(fs.readFileSync(local, 'utf8'))
  assert.deepEqual(written.permissions, own.permissions)
  const all = commands(local)
  assert.ok(all.includes('echo mio'))
  const shell = all.find((one) => one.includes('guard-shell.sh'))
  assert.equal(shell, `case "$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P)" in '${workspace}'/*) `
    + `CAUCE_SUBFOLDER_OF='${workspace}' '${workspace}'/ops/automatization/hooks/guard-shell.sh ;; esac`)
  assert.match(fs.readFileSync(path.join(workspace, '.gitignore'), 'utf8'), /^\.claude\/settings\.local\.json$/m)
  assert.doesNotMatch(said(runCli(['automation', 'doctor', target, 'claude'])), /subcarpeta/)

  // Corrido como lo corre Claude Code: desde la subcarpeta frena una credencial, desde la raíz no hace nada.
  fs.writeFileSync(path.join(workspace, 'credentials.json'), '{}')
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 's',
    cwd: path.join(workspace, 'portal'), tool_input: { command: 'grep -c x ../credentials.json' } })
  const run = (dir) => spawnSync('sh', ['-c', shell], { input, encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: dir } })
  const inside = run(path.join(workspace, 'portal'))
  assert.equal(inside.status, 2, inside.stderr)
  assert.match(inside.stderr, new RegExp(`lee ${path.join(workspace, 'credentials.json')}`))
  assert.equal(run(workspace).status, 0)
  // Y en la raíz frena el de `settings.json`: retirarse es sólo de los que llegan desde el archivo local.
  const rootShell = commands(path.join(workspace, '.claude', 'settings.json'))
    .find((one) => one.endsWith('guard-shell.sh'))
  const atRoot = spawnSync('sh', ['-c', rootShell], { input, encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: workspace } })
  assert.equal(atRoot.status, 2, atRoot.stderr)
  // Por un enlace a la subcarpeta, también: se compara la ruta real.
  fs.symlinkSync(path.join(workspace, 'portal'), path.join(path.dirname(workspace), 'atajo'))
  assert.equal(run(path.join(path.dirname(workspace), 'atajo')).status, 2)

  // Reinstalar no duplica; sin las entradas, doctor lo dice; uninstall saca sólo las de Cauce.
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(commands(local).filter((one) => one.includes('guard-shell.sh')).length, 1)
  fs.writeFileSync(local, JSON.stringify(own))
  assert.match(said(runCli(['automation', 'doctor', target, 'claude'])),
    /guards de una sesión abierta en una subcarpeta/)
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(runCli(['automation', 'uninstall', target, 'claude']).status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(local, 'utf8')), own)
})

test('sin git no hay dónde dejar los guards de una subcarpeta, y el aviso lo sigue diciendo', () => {
  const { target, runCli, local } = project('cauce-subcarpeta-sin-git-', false)
  const installed = runCli(['automation', 'install', target, 'claude'])
  assert.equal(installed.status, 0, said(installed))
  assert.match(installed.stdout, /no en una subcarpeta sin git ni en un repo de producto con git propio/)
  assert.equal(fs.existsSync(local), false)
})

test('un settings.local.json que sólo tenía los guards de Cauce se va con uninstall', () => {
  const { target, runCli, local } = project('cauce-subcarpeta-uninstall-')
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.ok(fs.existsSync(local))
  assert.equal(runCli(['automation', 'uninstall', target, 'claude']).status, 0)
  assert.equal(fs.existsSync(local), false)
})

// Una instalación que no es la raíz de su repositorio no escribe en el de más arriba, con el criterio del bloque del
// `.gitignore` (caso 513): ese repositorio no es del proyecto.
test('una instalación debajo de la raíz git no escribe en el repositorio de más arriba', () => {
  const base = tempRoot('cauce-subcarpeta-arriba-')
  const repo = path.join(base, 'mono')
  const env = { ...process.env, HOME: path.join(base, 'home'), XDG_CONFIG_HOME: path.join(base, 'home', '.config') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDECODE']) delete env[key]
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  fs.mkdirSync(path.join(base, 'home'), { recursive: true })
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(spawnSync('git', ['init', '-q', repo], { env }).status, 0)
  const target = path.join(repo, 'uno', 'ops')
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  const installed = runCli(['automation', 'install', target, 'claude'])
  assert.equal(installed.status, 0, said(installed))
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'settings.local.json')), false)
  assert.equal(fs.existsSync(path.join(repo, '.gitignore')), false)
  assert.match(installed.stdout, /no en una subcarpeta sin git ni en un repo de producto/)
  assert.doesNotMatch(said(runCli(['automation', 'doctor', target, 'claude'])), /settings\.local\.json/)
})

// Donde escribir dañaría más de lo que cubre: un repositorio que contiene el home, un archivo versionado, una forma
// que no es la que Claude Code lee. Se dice y no se toca.
test('no escribe en un repositorio que contiene el home, en un archivo versionado ni en una forma rara', () => {
  const base = tempRoot('cauce-subcarpeta-home-')
  const home = path.join(base, 'home')
  const target = path.join(home, 'ops')
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDECODE']) delete env[key]
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  fs.mkdirSync(home, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', home], { env }).status, 0)
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  const atHome = runCli(['automation', 'install', target, 'claude'])
  assert.equal(atHome.status, 0, said(atHome))
  assert.match(atHome.stdout, /su raíz git contiene tu home/)
  assert.match(atHome.stdout, /no en una subcarpeta sin git ni en un repo de producto/)
  assert.equal(fs.existsSync(path.join(home, '.claude', 'settings.local.json')), false)
  // No escribirlo es la decisión, no una falta: doctor no manda a reinstalar.
  assert.doesNotMatch(said(runCli(['automation', 'doctor', target, 'claude'])), /settings\.local\.json/)

  const { target: other, runCli: inRepo, local, workspace, env: repoEnv } = project('cauce-subcarpeta-rara-')
  fs.mkdirSync(path.dirname(local), { recursive: true })
  const shapes = ['{"hooks":{"Stop":{}}}', '{"hooks":[]}', '// nota\n{}', '{"hooks":{"Stop":[{"hooks":[null]}]}}']
  for (const shape of shapes) {
    fs.writeFileSync(local, shape)
    const odd = inRepo(['automation', 'install', other, 'claude'])
    assert.equal(odd.status, 0, said(odd))
    assert.match(odd.stdout, /y no lo toco: una sesión abierta en una subcarpeta corre sin guards/)
    assert.equal(fs.readFileSync(local, 'utf8'), shape)
    assert.match(said(inRepo(['automation', 'doctor', other, 'claude'])), /corregilo y reinstalá/)
  }
  fs.writeFileSync(local, '{}')
  const added = spawnSync('git', ['-C', workspace, 'add', '-f', '.claude/settings.local.json'], { env: repoEnv })
  assert.equal(added.status, 0)
  const tracked = inRepo(['automation', 'install', other, 'claude'])
  assert.match(tracked.stdout, /está versionado/)
  assert.equal(fs.readFileSync(local, 'utf8'), '{}')
})

// Instalada por un enlace, la condición lleva la ruta real: la que da `pwd -P` en la sesión.
test('instalada por un enlace, los guards de una subcarpeta comparan la ruta real', () => {
  const { workspace, runCli, local } = project('cauce-subcarpeta-enlace-')
  const link = path.join(path.dirname(workspace), 'enlace')
  fs.symlinkSync(workspace, link)
  assert.equal(runCli(['automation', 'install', path.join(link, 'ops'), 'claude']).status, 0)
  const shell = commands(local).find((one) => one.includes('guard-shell.sh'))
  assert.ok(shell.includes(`in '${workspace}'/*)`), shell)
  assert.ok(!shell.includes(link), shell)
})

function bare(name) {
  const base = tempRoot(name)
  const env = { ...process.env, HOME: path.join(base, 'home'), XDG_CONFIG_HOME: path.join(base, 'home', '.config') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDECODE']) delete env[key]
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  fs.mkdirSync(path.join(base, 'home'), { recursive: true })
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  const place = (target) => {
    assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
    linkEngine(target)
    assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  }
  return { base, env, runCli, place }
}

// Una instancia dentro de otra: en la carpeta de la de adentro corren sus guards, y los de la de afuera se retiran
// aunque su `case` la alcance (`engine/hooks/nearer-install.js`). Debajo de ella, la de adentro no tiene entradas en el
// archivo local —su carpeta no es la raíz del repositorio—, así que juzga la de afuera.
test('con una instancia dentro de otra, en la carpeta de la de adentro no juzgan los guards de la de afuera', () => {
  const { base, env, place } = bare('cauce-subcarpeta-anidadas-')
  const repo = path.join(base, 'mono')
  assert.equal(spawnSync('git', ['init', '-q', repo], { env }).status, 0)
  place(path.join(repo, 'ops'))
  fs.mkdirSync(path.join(repo, 'pkg', 'src'), { recursive: true })
  place(path.join(repo, 'pkg', 'ops'))
  const shells = commands(path.join(repo, '.claude', 'settings.local.json'))
    .filter((one) => one.includes('guard-shell'))
  assert.equal(shells.length, 1, 'sólo la de la raíz escribe en el archivo local')
  const [outer] = shells
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 's',
    cwd: path.join(repo, 'pkg'), tool_input: { command: 'cat ../credentials.json' } })
  const run = (dir) => spawnSync('sh', ['-c', outer], { input, encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: dir } })
  assert.equal(run(path.join(repo, 'pkg')).status, 0, 'en la carpeta de la de adentro, se retira')
  assert.equal(run(path.join(repo, 'pkg', 'src')).status, 2, 'debajo, juzga')
  // Un `settings.json` que nombra los guards sin poder correrlos —copiado de la raíz, o en un permiso— no es una
  // instalación: retirarse ahí dejaba la sesión sin ninguno. Tampoco el de la de adentro sin su instancia.
  for (const [dir, text] of [['copia', fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')],
    ['permiso', JSON.stringify({ permissions: { deny: ['Edit(ops/automatization/hooks/guard-*)'] } })]]) {
    fs.mkdirSync(path.join(repo, dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(repo, dir, '.claude', 'settings.json'), text)
    assert.equal(run(path.join(repo, dir)).status, 2, dir)
  }
  fs.renameSync(path.join(repo, 'pkg', 'ops'), path.join(repo, 'pkg', 'ops-ida'))
  assert.equal(run(path.join(repo, 'pkg')).status, 2, 'sin la instancia, juzga la de afuera')
  // Una embebida en la carpeta misma apunta a sus guards sin prefijo, y también cubre.
  const flat = path.join(repo, 'plana')
  fs.mkdirSync(path.join(flat, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(flat, 'automatization', 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(flat, 'automatization', 'hooks', 'guard-shell.sh'), '')
  fs.writeFileSync(path.join(flat, '.claude', 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
    { type: 'command', command: '$CLAUDE_PROJECT_DIR/automatization/hooks/guard-shell.sh' }] }] } }))
  assert.equal(run(flat).status, 0, 'embebida sin prefijo')
})

// Un `$` en la ruta es texto: como patrón de reemplazo, `$$` o `$&` armaban otra ruta y el hook salía con 127, que en
// Claude Code no frena.
test('una ruta de instalación con $ arma el comando que corre', () => {
  const { base, env, place } = bare('cauce-subcarpeta-pesos-')
  const repo = path.join(base, 'a$$b$&c')
  assert.equal(spawnSync('git', ['init', '-q', repo], { env }).status, 0)
  place(path.join(repo, 'ops'))
  fs.mkdirSync(path.join(repo, 'src'))
  const shell = commands(path.join(repo, '.claude', 'settings.local.json')).find((one) => one.includes('guard-shell'))
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 's',
    cwd: path.join(repo, 'src'), tool_input: { command: 'cat ../credentials.json' } })
  const ran = spawnSync('sh', ['-c', shell], { input, encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: path.join(repo, 'src') } })
  assert.equal(ran.status, 2, ran.stderr)
})

// Sacar lo de Cauce no se lleva lo que ya estaba vacío en el archivo de la persona.
test('install y uninstall dejan los grupos y eventos vacíos de la persona', () => {
  const { target, runCli, local } = project('cauce-subcarpeta-vacios-')
  fs.mkdirSync(path.dirname(local), { recursive: true })
  const own = { hooks: { Notification: [], PreToolUse: [{ matcher: 'Edit' }] } }
  fs.writeFileSync(local, JSON.stringify(own))
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  const written = JSON.parse(fs.readFileSync(local, 'utf8'))
  assert.deepEqual(written.hooks.Notification, [])
  assert.deepEqual(written.hooks.PreToolUse[0], { matcher: 'Edit' })
  assert.equal(runCli(['automation', 'uninstall', target, 'claude']).status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(local, 'utf8')), own)
})

