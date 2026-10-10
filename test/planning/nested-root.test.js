'use strict'

// El aviso de `check` para un repositorio anidado que el de la instancia registra como enlace de git (caso
// 352): cuándo sale, cuándo no, y qué ruta nombra. Por qué importa está en `nestedRootWarnings`.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function instance(prefix, rootPath = 'app') {
  const base = tempRoot(prefix)
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Acme', '--mode', 'sidecar', '--no-install']).status, 0)
  const git = (cwd, ...args) => {
    const out = spawnSync('git', ['-C', cwd, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout
  }
  const product = path.resolve(ops, rootPath === '..' ? path.join('..', 'app') : rootPath)
  fs.mkdirSync(path.join(product, 'src'), { recursive: true })
  fs.writeFileSync(path.join(product, 'src', 'app.js'), 'module.exports = 1\n')
  git(product, 'init', '-q', '-b', 'main')
  git(product, 'add', 'src/app.js')
  git(product, 'commit', '-qm', 'producto')
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: rootPath }]
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  git(ops, 'init', '-q', '-b', 'main')
  const warnings = () => JSON.parse(run(['check', path.join(ops, 'planning'), '--json']).stdout).warnings
    .filter((one) => /enlace de git/.test(one))
  return { ops, git, warnings }
}

test('check avisa la raíz anidada que el repositorio de la instancia registra como enlace', () => {
  const { ops, git, warnings } = instance('cauce-352-registrada-')
  assert.deepEqual(warnings(), [], 'sin commitear todavía no hay nada registrado')
  git(ops, 'add', 'ops.config.json', 'app')
  git(ops, 'commit', '-qm', 'instancia')
  assert.match(git(ops, 'ls-files', '-s', 'app'), /^160000 /, 'la precondición: quedó como enlace')

  const [warning, ...rest] = warnings()
  assert.deepEqual(rest, [])
  assert.match(warning, /workspaceRoots: app /, 'nombra la raíz')
  assert.match(warning, /en una línea de trabajo esa carpeta queda vacía/, 'dice qué va a pasar')
  assert.match(warning, /git rm --cached "app"/, 'y con qué se corrige')

  // Un submódulo de verdad sí se puebla —`git submodule update`— y no es este defecto.
  fs.writeFileSync(path.join(ops, '.gitmodules'), '[submodule "app"]\n\tpath = app\n\turl = ../app\n')
  assert.deepEqual(warnings(), [])
})

test('la raíz anidada pero ignorada, y la que vive al lado, no se avisan', () => {
  const ignored = instance('cauce-352-ignorada-')
  fs.appendFileSync(path.join(ignored.ops, '.gitignore'), '\n/app/\n')
  ignored.git(ignored.ops, 'add', 'ops.config.json', '.gitignore')
  ignored.git(ignored.ops, 'commit', '-qm', 'instancia')
  assert.deepEqual(ignored.warnings(), [])

  const sibling = instance('cauce-352-hermana-', '..')
  sibling.git(sibling.ops, 'add', 'ops.config.json')
  sibling.git(sibling.ops, 'commit', '-qm', 'instancia')
  assert.deepEqual(sibling.warnings(), [])
})

// Lo que decide es que sea un enlace de git, no que esté adentro: una carpeta del propio repositorio es la
// forma de una instancia embebida, y ahí una línea la trae entera.
test('una raíz que es una carpeta del propio repositorio no se avisa', () => {
  const { ops, git, warnings } = instance('cauce-352-carpeta-', '..')
  fs.mkdirSync(path.join(ops, 'src'))
  fs.writeFileSync(path.join(ops, 'src', 'a.js'), 'module.exports = 1\n')
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'src', path: 'src' }]
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  git(ops, 'add', 'ops.config.json', 'src/a.js')
  git(ops, 'commit', '-qm', 'instancia')
  assert.deepEqual(warnings(), [])
})

test('el aviso nombra cada enlace por su ruta, esté en la raíz, debajo o por encima de ella', () => {
  const base = tempRoot('cauce-352-varios-')
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Acme', '--mode', 'sidecar', '--no-install']).status, 0)
  const git = (cwd, ...args) => {
    const out = spawnSync('git', ['-C', cwd, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
  }
  const nested = (relative) => {
    const dir = path.join(ops, relative)
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'module.exports = 1\n')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'add', 'src/a.js')
    git(dir, 'commit', '-qm', 'producto')
  }
  for (const one of ['repos/api', 'repos/web', 'servicios/pagos', 'mi app', 'con modulo']) nested(one)
  fs.writeFileSync(path.join(ops, 'repos', 'README.md'), '# repos\n')
  // Uno declarado como submódulo de verdad, con espacios en el nombre y en la ruta: ése no se avisa.
  fs.writeFileSync(path.join(ops, '.gitmodules'), '[submodule "el modulo"]\n\tpath = con modulo\n\turl = ../x\n')
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'repos', path: 'repos' }, { name: 'pagos', path: 'servicios/pagos/src' },
    { name: 'app', path: 'mi app' }, { name: 'modulo', path: 'con modulo' }]
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  git(ops, 'init', '-q', '-b', 'main')
  git(ops, 'add', 'ops.config.json', '.gitmodules', 'repos', 'servicios', 'mi app', 'con modulo')
  git(ops, 'commit', '-qm', 'instancia')

  const check = (planning) => JSON.parse(run(['check', planning, '--json']).stdout).warnings
    .filter((one) => /enlace de git/.test(one))
  const named = check(path.join(ops, 'planning')).map((one) => (one.match(/git rm --cached "([^"]+)"/) || [])[1]).sort()
  assert.deepEqual(named, ['mi app', 'repos/api', 'repos/web', 'servicios/pagos'])
  // Y nombrada por un enlace simbólico es la misma instancia.
  fs.symlinkSync(base, `${base}-enlace`, 'dir')
  assert.equal(check(path.join(`${base}-enlace`, 'ops', 'planning')).length, 4)
  fs.unlinkSync(`${base}-enlace`)
})


// La raíz más común de una instancia embebida es el repositorio entero —`.`, o `..` cuando la instancia vive
// en una carpeta suya—. Ahí todo enlace queda debajo de la raíz, y era justo donde el aviso no salía.
test('la raíz que es el repositorio entero, o que lo contiene, avisa sus enlaces', () => {
  for (const rootPath of ['.', '..']) {
    const base = tempRoot('cauce-352-entero-')
    const ops = path.join(base, 'ops')
    assert.equal(run(['init', ops, '--name', 'Acme', '--mode', 'sidecar', '--no-install']).status, 0)
    const git = (cwd, ...args) => {
      const out = spawnSync('git', ['-C', cwd, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
        ...args], { encoding: 'utf8' })
      assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    }
    const product = path.join(ops, 'app')
    fs.mkdirSync(path.join(product, 'src'), { recursive: true })
    fs.writeFileSync(path.join(product, 'src', 'a.js'), 'module.exports = 1\n')
    git(product, 'init', '-q', '-b', 'main')
    git(product, 'add', 'src/a.js')
    git(product, 'commit', '-qm', 'producto')
    const file = path.join(ops, 'ops.config.json')
    const config = JSON.parse(fs.readFileSync(file, 'utf8'))
    config.workspaceRoots = [{ name: 'todo', path: rootPath }]
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
    git(ops, 'init', '-q', '-b', 'main')
    git(ops, 'add', 'ops.config.json', 'app')
    git(ops, 'commit', '-qm', 'instancia')
    const warnings = JSON.parse(run(['check', path.join(ops, 'planning'), '--json']).stdout).warnings
      .filter((one) => /enlace de git/.test(one))
    assert.equal(warnings.length, 1, `con la raíz ${rootPath}`)
    assert.match(warnings[0], /git rm --cached "app"/)
  }
})
