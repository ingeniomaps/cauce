'use strict'

// Caso 513: el bloque de Cauce por init, install, upgrade y destroy, en embebido y en sidecar. Qué es y por qué
// existe, en el encabezado de `engine/core/ignore-block.js`.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const IB = require('../../engine/core/ignore-block')

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const ignored = (cwd, ...files) => (git(cwd, 'check-ignore', ...files).stdout || '').split('\n').filter(Boolean)
const LOCAL = ['.env', 'planning/wip/r.md', 'integrations/jira/staging/sync-state.json', 'ops.config.local.json',
  'planning/.verify-log']

test('en embebido, init suma al .gitignore del producto lo que es de la instancia, y destroy lo saca', () => {
  const repo = path.join(tempRoot('cauce-ignore-emb-'), 'app')
  fs.mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q')
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\ndist/\n')
  const init = run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install'])
  assert.equal(init.status, 0, init.stderr)
  assert.match(init.stdout, /\.gitignore: .* al bloque de Cauce/)
  const text = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')
  assert.ok(text.startsWith('node_modules/\ndist/\n'), 'lo del producto queda primero y como estaba')
  assert.deepEqual(ignored(repo, ...LOCAL), LOCAL, 'todo lo local queda ignorado')
  assert.deepEqual(ignored(repo, '.env.example', 'planning/wip/README.md'), [], 'y lo que viaja, no')
  assert.doesNotMatch(IB.split(text).inside.join('\n'), /^\*\.tgz$|DS_Store|\.claude/m,
    'lo genérico y el wiring no entran')

  // Rehacerlo no repite nada, y una instancia anterior a 0.121.0, sin bloque, lo recibe en el upgrade.
  linkEngine(repo)
  assert.equal(run(['automation', 'install', repo, 'claude']).status, 0)
  assert.deepEqual(ignored(repo, '.claude/workflows/autobuild.js'), ['.claude/workflows/autobuild.js'],
    'el wiring lo ignora install, que sabe qué generó')
  const installed = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')
  assert.equal(run(['upgrade', repo, '--force']).status, 0)
  assert.equal(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), installed, 'upgrade no duplica el bloque')
  IB.remove(path.join(repo, '.gitignore'))
  assert.equal(run(['upgrade', repo, '--force']).status, 0)
  assert.deepEqual(ignored(repo, ...LOCAL), LOCAL, 'upgrade lo vuelve a escribir')

  const gone = run(['destroy', repo, '--force'])
  assert.equal(gone.status, 0, gone.stderr)
  assert.equal(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n',
    'destroy devuelve el archivo del producto como estaba')
})

test('en sidecar, install ignora en el repositorio lo que el runner escribe afuera de la instancia', () => {
  const repo = path.join(tempRoot('cauce-ignore-side-'), 'app')
  fs.mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q')
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n')
  const target = path.join(repo, 'ops')
  assert.equal(run(['init', target, '--name', 'App', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.equal(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), 'node_modules/\n', 'init no toca el de afuera')
  linkEngine(target)
  const install = run(['automation', 'install', target, 'claude'])
  assert.equal(install.status, 0, install.stderr)
  assert.match(install.stdout, /\.claude\/workflows\/ al bloque de Cauce de .*\.gitignore/)
  assert.deepEqual(ignored(repo, '.claude/workflows/autobuild.js'), ['.claude/workflows/autobuild.js'])
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stderr + run(['check',
    path.join(target, 'planning')]).stdout, /llevan escrita la ruta/, 'y el aviso ya no sale')

  assert.equal(run(['destroy', target, '--force']).status, 0)
  assert.equal(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), 'node_modules/\n')
})

// Caso 555: en sidecar el `.gitignore` de la instancia se copia del molde una vez, en init. Lo que el molde ignoró
// después llega por el bloque, y el staging de una instancia con Jira anterior a 0.100.0, que versiona su README y su
// .gitkeep, queda ignorado sin dejar de versionarlos.
test('en sidecar, upgrade suma al .gitignore de la instancia lo que el molde ignoró después', () => {
  const target = path.join(tempRoot('cauce-ignore-side-old-'), 'ops')
  assert.equal(run(['init', target, '--name', 'App', '--mode', 'sidecar', '--no-install']).status, 0)
  git(target, 'init', '-q')
  const file = path.join(target, '.gitignore')
  const old = fs.readFileSync(file, 'utf8').split('\n')
    .filter((one) => !/^!?integrations\/\*\/staging|^planning\/\.(?:grant-log|ops-approval)$/.test(one)).join('\n')
  fs.writeFileSync(file, old)
  const staging = path.join(target, 'integrations', 'jira', 'staging')
  fs.mkdirSync(staging, { recursive: true })
  for (const one of ['README.md', '.gitkeep']) fs.writeFileSync(path.join(staging, one), '')
  git(target, 'add', '-f', '.gitignore', 'integrations/jira/staging/README.md', 'integrations/jira/staging/.gitkeep')
  git(target, '-c', 'user.email=b@x.invalid', '-c', 'user.name=Banco', 'commit', '-qm', 'anterior')
  linkEngine(target)
  const LATER = ['integrations/jira/staging/X-1.json', 'planning/.grant-log', 'planning/.ops-approval']
  assert.deepEqual(ignored(target, ...LATER), [], 'la instancia anterior no los ignora')

  const upgrade = run(['upgrade', target, '--force'])
  assert.equal(upgrade.status, 0, upgrade.stderr)
  assert.match(upgrade.stdout, /\.gitignore: .*planning\/\.grant-log.* al bloque de Cauce/)
  const text = fs.readFileSync(file, 'utf8')
  assert.ok(text.startsWith(old), 'lo que estaba queda primero y como estaba')
  assert.deepEqual(ignored(target, ...LATER), LATER)
  assert.deepEqual(ignored(target, 'integrations/jira/staging/README.md', 'integrations/jira/staging/.gitkeep'), [],
    'el README y el .gitkeep versionados siguen viajando')
  assert.equal(run(['upgrade', target, '--force']).status, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'un segundo upgrade no cambia nada')
})

test('una sidecar recién creada no recibe bloque: su .gitignore ya trae todo', () => {
  const target = path.join(tempRoot('cauce-ignore-side-new-'), 'ops')
  assert.equal(run(['init', target, '--name', 'App', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.equal(IB.split(fs.readFileSync(path.join(target, '.gitignore'), 'utf8')).inside.length, 0)
})

test('el bloque conserva lo de afuera, no repite lo que la persona ya escribió y se saca entero', () => {
  const file = path.join(tempRoot('cauce-ignore-unit-'), '.gitignore')
  fs.writeFileSync(file, '# mío\n.env\n')
  assert.deepEqual(IB.add(file, ['.env', 'planning/wip/*.md']).added, ['planning/wip/*.md'])
  assert.deepEqual(IB.add(file, ['planning/wip/*.md']).added, [], 'la segunda vez no agrega nada')
  assert.deepEqual(IB.split(fs.readFileSync(file, 'utf8')).inside, ['planning/wip/*.md'])
  assert.equal(IB.remove(file), true)
  assert.equal(fs.readFileSync(file, 'utf8'), '# mío\n.env\n')
  assert.equal(IB.remove(file), false, 'sin bloque no hay nada que sacar')
  // Un `.gitignore` enlazado apunta a algo que no es de este repositorio: no se escribe a través de él.
  const elsewhere = path.join(tempRoot('cauce-ignore-enlace-'), 'ajeno')
  fs.writeFileSync(elsewhere, 'ajeno\n')
  const linked = path.join(path.dirname(file), 'enlazado', '.gitignore')
  fs.mkdirSync(path.dirname(linked))
  fs.symlinkSync(elsewhere, linked)
  assert.deepEqual(IB.add(linked, ['planning/wip/*.md']).added, [])
  assert.equal(fs.readFileSync(elsewhere, 'utf8'), 'ajeno\n')
})

// De la revisión del 513: el bloque no puede dejar afuera de git lo que el producto ya versiona —un `.env.production`,
// un recorrido propio en `.claude/workflows/`—, y lo dice en vez de callarlo.
test('en embebido, una línea que ignoraría algo versionado no entra, y se dice', () => {
  const repo = path.join(tempRoot('cauce-ignore-versionado-'), 'app')
  fs.mkdirSync(path.join(repo, '.claude', 'workflows'), { recursive: true })
  git(repo, 'init', '-q')
  fs.writeFileSync(path.join(repo, '.env.production'), 'API=https://api\n')
  fs.writeFileSync(path.join(repo, '.claude', 'workflows', 'release.js'), '// propio\n')
  git(repo, 'add', '.env.production', '.claude/workflows/release.js')
  const init = run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install'])
  assert.equal(init.status, 0, init.stderr)
  assert.match(init.stdout,
    /\.env\.\* no se agregó: ignoraría 1 archivo\(s\) que el repositorio versiona \(\.env\.production\)/)
  fs.writeFileSync(path.join(repo, '.claude', 'workflows', 'deploy.js'), '// propio, nuevo\n')
  assert.deepEqual(ignored(repo, '.env.staging', '.claude/workflows/deploy.js'), [], 'nada del producto queda afuera')
  assert.deepEqual(ignored(repo, '.env', 'planning/wip/r.md'), ['.env', 'planning/wip/r.md'], 'lo local, sí')
  assert.doesNotMatch(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^!\.env\.example$/m,
    'sin su línea, la negación sobra')
})

test('install no escribe en el .gitignore de un repositorio de más arriba', () => {
  const above = tempRoot('cauce-ignore-arriba-')
  git(above, 'init', '-q')
  fs.writeFileSync(path.join(above, '.gitignore'), 'secreto\n')
  const workspace = path.join(above, 'proyectos', 'app')
  fs.mkdirSync(workspace, { recursive: true })
  const target = path.join(workspace, 'ops')
  assert.equal(run(['init', target, '--name', 'App', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(fs.readFileSync(path.join(above, '.gitignore'), 'utf8'), 'secreto\n', 'el de arriba no es del proyecto')
})

// De la segunda revisión del 513: una línea se juzga con sus negaciones. En una embebida anterior a 0.121.0, el
// `planning/wip/README.md` del molde ya está versionado y `!planning/wip/README.md` lo exceptúa: saltar la línea por él
// dejaba los planes del runner listos para commitear. Lo mismo `.env.*` con un `.env.example` versionado. Y una línea
// que la persona escribió afuera se respeta sin sumarle negaciones.
test('una línea se juzga con sus negaciones, y la que escribió la persona no recibe las nuestras', () => {
  const repo = path.join(tempRoot('cauce-ignore-negaciones-'), 'app')
  fs.mkdirSync(path.join(repo, 'planning', 'wip'), { recursive: true })
  git(repo, 'init', '-q')
  fs.writeFileSync(path.join(repo, 'planning', 'wip', 'README.md'), '# WIP\n')
  fs.writeFileSync(path.join(repo, '.env.example'), 'API=\n')
  fs.writeFileSync(path.join(repo, '.gitignore'), 'dist/\n')
  git(repo, 'add', 'planning/wip/README.md', '.env.example', '.gitignore')
  const file = path.join(repo, '.gitignore')
  const lines = ['.env', '.env.*', '!.env.example', 'planning/wip/*.md', '!planning/wip/README.md']
  const { added, skipped } = IB.add(file, lines, repo)
  assert.deepEqual(skipped, [])
  assert.deepEqual(added, lines)
  assert.deepEqual(ignored(repo, 'planning/wip/r.md', '.env.local'), ['planning/wip/r.md', '.env.local'])
  assert.deepEqual(ignored(repo, 'planning/wip/README.md', '.env.example'), [])

  const own = path.join(tempRoot('cauce-ignore-suya-'), 'app')
  fs.mkdirSync(own, { recursive: true })
  git(own, 'init', '-q')
  fs.writeFileSync(path.join(own, '.gitignore'), '.env.*\n')
  assert.deepEqual(IB.add(path.join(own, '.gitignore'), lines, own).added, ['.env', 'planning/wip/*.md',
    '!planning/wip/README.md'], 'su .env.* queda como lo escribió, sin el !.env.example nuestro')
})

// De la tercera revisión del 513: la app vive en `apps/tienda` y versiona archivos que sus líneas ignorarían.
test('en una subcarpeta de un monorepo, una línea que ignoraría algo versionado ahí tampoco entra', () => {
  const mono = path.join(tempRoot('cauce-ignore-mono-'), 'mono')
  const app = path.join(mono, 'apps', 'tienda')
  fs.mkdirSync(path.join(app, 'planning', 'wip'), { recursive: true })
  git(mono, 'init', '-q')
  fs.writeFileSync(path.join(app, '.env.production'), 'API=\n')
  fs.writeFileSync(path.join(app, 'planning', 'wip', 'README.md'), '# WIP\n')
  fs.writeFileSync(path.join(mono, '.env.staging'), 'otro\n')
  fs.mkdirSync(path.join(app, 'integrations', 'jira', 'staging'), { recursive: true })
  fs.writeFileSync(path.join(app, 'integrations', 'jira', 'staging', 'fixture.json'), '{}\n')
  git(mono, 'add', 'apps/tienda/.env.production', 'apps/tienda/planning/wip/README.md', '.env.staging',
    'apps/tienda/integrations/jira/staging/fixture.json')
  const lines = ['.env', '.env.*', '!.env.example', 'planning/wip/*.md', '!planning/wip/README.md',
    'integrations/*/staging/']
  const { added, skipped } = IB.add(path.join(app, '.gitignore'), lines, app)
  assert.deepEqual(skipped.map((one) => one.line), ['.env.*', 'integrations/*/staging/'],
    'lo versionado en esta carpeta cuenta, también con un patrón con barra')
  assert.deepEqual(added, ['.env', 'planning/wip/*.md', '!planning/wip/README.md'])
})
