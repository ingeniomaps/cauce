'use strict'

// Sacar la instancia sin llevarse el repositorio: qué se cuenta antes de borrar, qué se conserva en
// modo embebido y qué queda del `package.json` del anfitrión.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Borrar una instancia era una lista de pasos a mano, y una lista se ejecuta a medias: si la carpeta se
// va antes que el wiring, cada llamada de herramienta del runner queda ejecutando un guard que no está.
test('destroy avisa qué se pierde y no borra hasta que se lo pidan dos veces', () => {
  const base = tempRoot('cauce-destroy-')
  const workspace = path.join(base, 'mono')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  fs.writeFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), '// mío\n')

  // Una instancia recién creada no perdió nada todavía, y decir lo contrario es exagerar: los moldes
  // traen ejemplos comentados que una cuenta a mano lee como trabajo real.
  const warning = run(['destroy', target])
  assert.equal(warning.status, 1, 'sin --force no borra')
  assert.match(warning.stdout, /nada escrito todavía/)
  assert.match(warning.stdout, /saca el wiring de: claude/)
  assert.equal(fs.existsSync(path.join(target, 'planning')), true)

  // Con trabajo escrito, lo enumera antes de tocar nada.
  fs.appendFileSync(path.join(target, 'planning', 'HUMAN_ACTIONS.md'), '| algo | pendiente | onboard | x |\n')
  assert.match(run(['destroy', target]).stdout, /1 acción\(es\) humana\(s\)/)

  const done = run(['destroy', target, '--force'])
  assert.equal(done.status, 0, done.stderr)
  assert.equal(fs.existsSync(target), false, 'la instancia se fue')
  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'workflows', 'autobuild.js')), false, 'y su wiring')
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), 'utf8'), '// mío\n')

  // Y no se lo puede apuntar a cualquier cosa.
  const foreign = run(['destroy', workspace])
  assert.equal(foreign.status, 2)
  assert.match(foreign.stderr, /no es una instancia de Cauce/)
})

// En modo embebido la instancia **es** el repositorio, así que borrar la carpeta se lleva el código del
// producto. Pasó de verdad sobre un caso de prueba: `destroy --force` dejó el directorio vacío.
test('destroy no se lleva el repositorio en modo embebido', () => {
  const base = tempRoot('cauce-emb-destroy-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src', 'main.rs'), 'fn main() {}\n')
  fs.writeFileSync(path.join(repo, 'Cargo.toml'), '[package]\nname = "app"\n')
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)

  const warning = run(['destroy', repo])
  assert.equal(warning.status, 1)
  assert.match(warning.stdout, /Sacar Cauce de/)
  assert.match(warning.stdout, /el código del repositorio no se toca/)

  assert.equal(run(['destroy', repo, '--force']).status, 0)
  assert.equal(fs.existsSync(path.join(repo, 'src', 'main.rs')), true, 'el código sigue')
  assert.equal(fs.readFileSync(path.join(repo, 'Cargo.toml'), 'utf8').includes('app'), true)
  assert.equal(fs.existsSync(path.join(repo, 'planning')), false, 'y lo de Cauce se fue')
  assert.equal(fs.existsSync(path.join(repo, 'ops.config.json')), false)

  // Lo que `init` escribió en npm también es de Cauce. Sobre un repo Rust dejaba un `package.json`
  // cuya única dependencia era el motor, y la salida decía «tu repositorio queda donde está» sin
  // nombrarlo: basura conspicua que nadie avisaba. Lo encontró el banco de pruebas, rehaciendo el caso.
  assert.equal(fs.existsSync(path.join(repo, 'package.json')), false,
    'el manifiesto que creó init se va con él')
})

// La inversa de `declareEngine` saca su clave y nada más: el manifiesto del repo anfitrión es suyo
// aunque hoy tenga poco, y borrarlo por venir vacío se lleva los scripts de alguien.
test('destroy respeta el package.json del repositorio y sólo saca su dependencia', () => {
  const base = tempRoot('cauce-emb-pkg-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo, { recursive: true })
  fs.writeFileSync(path.join(repo, 'package.json'), `${JSON.stringify({
    name: 'app', version: '1.4.0', scripts: { build: 'tsc' }, devDependencies: { typescript: '^5' },
  }, null, 2)}\n`)
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  assert.match(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), /@ingeniomaps\/cauce/)

  const done = run(['destroy', repo, '--force'])
  assert.equal(done.status, 0, done.stderr)
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
  assert.equal('@ingeniomaps/cauce' in (pkg.devDependencies || {}), false, 'la dependencia del motor se va')
  assert.deepEqual(pkg.devDependencies, { typescript: '^5' }, 'y las del proyecto quedan')
  assert.deepEqual(pkg.scripts, { build: 'tsc' })
  assert.equal(pkg.version, '1.4.0')
})

// Un manifiesto que no parsea no frena el destroy: quitar Cauce es lo que se pidió, y negarse por un
// archivo roto —que además puede haberlo roto otra cosa— deja la instancia a medio sacar.
test('destroy sigue aunque el package.json esté roto', () => {
  const base = tempRoot('cauce-emb-pkg-roto-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo, { recursive: true })
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  fs.writeFileSync(path.join(repo, 'package.json'), '{ esto no es json\n')

  const done = run(['destroy', repo, '--force'])
  assert.equal(done.status, 0, done.stderr)
  assert.equal(fs.existsSync(path.join(repo, 'planning')), false, 'lo de Cauce se fue igual')
  assert.equal(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), '{ esto no es json\n',
    'y el archivo roto se deja como estaba, sin adivinar qué quiso decir')
})
