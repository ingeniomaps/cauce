'use strict'

// Caso 317. Los dos guards de límites comparaban la ruta como está escrita. Un enlace simbólico que vive
// adentro de una raíz y apunta afuera dejaba cruzarla: la ruta escrita cae adentro y la escritura, afuera.
// Los enlaces de estas pruebas apuntan a una carpeta que no existe, así que no se crea nada fuera del
// temporal.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')
const { landing } = require('../../engine/core/files')

const realPath = (file) => landing(path.sep, file)

const OUTSIDE = path.join(os.homedir(), 'fuera-de-las-raices')

function project(name) {
  const base = tempRoot(name)
  const root = path.join(base, 'repo')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'service', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'service', path: 'service' }] }))
  const link = (name, target) => fs.symlinkSync(target, path.join(root, 'service', name))
  link('enlace', OUTSIDE)
  link('colgado.js', path.join(OUTSIDE, 'archivo.js'))
  link('dentro', 'src')
  link('vuelta', path.join('..', 'service', 'src'))
  // Un enlace que lleva a otro que lleva afuera, y uno que se muerde la cola.
  link('salto', 'enlace')
  link('ciclo-a', 'ciclo-b')
  link('ciclo-b', 'ciclo-a')
  fs.symlinkSync(root, path.join(base, 'alias'))
  return { base, root }
}
const shell = (cwd, command) => execute('shell-boundary', { cwd, tool_input: { command } })
// El guard de shell deja pasar lo que cae en el temporal, y estas pruebas viven ahí: para ver qué decide
// sobre una raíz que no es el temporal se lo corre en otro proceso, con el temporal apuntado a otra carpeta.
function shellElsewhere(base, opsRoot, cwd, command, extra = {}) {
  const fake = path.join(base, 'otro-temporal')
  fs.mkdirSync(fake, { recursive: true })
  const run = path.join(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
  const out = spawnSync(process.execPath, [run, 'shell-boundary'], { encoding: 'utf8',
    input: JSON.stringify({ cwd, tool_input: { command } }),
    env: { ...process.env, TMPDIR: fake, OPS_ROOT: opsRoot, ...extra } })
  return { status: out.status, said: out.stderr }
}
const file = (cwd, target) => execute('workspace-boundary', { cwd, tool_input: { file_path: target } })

test('la ruta real resuelve cada enlace del camino, exista o no lo que sigue', () => {
  const { base, root } = project('cauce-enlaces-ruta-')
  const service = path.join(root, 'service')
  const real = fs.realpathSync(service)
  assert.equal(realPath(path.join(service, 'src', 'nuevo', 'a.js')), path.join(real, 'src', 'nuevo', 'a.js'))
  assert.equal(realPath(path.join(service, 'dentro', 'a.js')), path.join(real, 'src', 'a.js'))
  assert.equal(realPath(path.join(service, 'enlace', 'sub', 'a.js')), path.join(OUTSIDE, 'sub', 'a.js'))
  assert.equal(realPath(path.join(service, 'colgado.js')), path.join(OUTSIDE, 'archivo.js'))
  assert.equal(realPath(path.join(service, 'salto', 'a.js')), path.join(OUTSIDE, 'a.js'))
  assert.equal(realPath(path.join(base, 'alias', 'service', 'src')), path.join(real, 'src'))
  // Un ciclo no cuelga ni revienta: queda donde dejó de poder seguir. Y una cadena larga se sigue entera.
  assert.match(realPath(path.join(service, 'ciclo-a', 'a.js')), /ciclo-[ab]\/a\.js$/)
  for (let at = 1; at <= 6; at += 1) fs.symlinkSync(at === 6 ? 'src' : `c${at + 1}`, path.join(service, `c${at}`))
  assert.equal(realPath(path.join(service, 'c1', 'a.js')), path.join(real, 'src', 'a.js'))

  // El disco no lee una ruta como la junta `path.resolve`. Un `..` detrás de un enlace sube desde donde el
  // enlace lleva, y un enlace relativo se resuelve contra la carpeta real que lo contiene.
  assert.equal(landing(service, 'enlace/../a.js'), path.join(path.dirname(OUTSIDE), 'a.js'))
  assert.equal(landing(path.join(service, 'enlace'), '../a.js'), path.join(path.dirname(OUTSIDE), 'a.js'))
  assert.equal(landing(service, 'dentro/../src/a.js'), path.join(real, 'src', 'a.js'))
  fs.mkdirSync(path.join(service, 'deep', 'x', 'y'), { recursive: true })
  fs.mkdirSync(path.join(service, 'shared'))
  fs.symlinkSync(path.join('deep', 'x', 'y'), path.join(service, 'kin'))
  fs.symlinkSync(path.join('..', '..', '..', 'shared'), path.join(service, 'deep', 'x', 'y', 'back'))
  assert.equal(landing(service, 'kin/back/a.js'), path.join(real, 'shared', 'a.js'))
  assert.equal(landing(path.join(base, 'alias', 'service'), './src//a.js'), path.join(real, 'src', 'a.js'))
  // Una barra invertida es un carácter más del nombre, no un separador.
  fs.symlinkSync(OUTSIDE, path.join(service, 'a\\b'))
  assert.equal(landing(service, 'a\\b/x.js'), path.join(OUTSIDE, 'x.js'))
})

test('un enlace que vive adentro y apunta afuera no cruza el límite, por ninguno de los dos guards', () => {
  const { root } = project('cauce-enlaces-cruce-')
  const service = path.join(root, 'service')
  for (const command of ['echo x > enlace/a.js', 'mkdir -p enlace/sub && echo x > enlace/sub/a.js',
    'cd enlace && echo x > a.js', 'cp src/a.js enlace/b.js', 'echo x > colgado.js', 'echo x > salto/a.js',
    // Un `..` detrás del enlace sube desde afuera, escrito de una vez o después de un `cd`.
    'echo x > enlace/../a.js', 'cd enlace && echo x > ../a.js']) {
    blocked('shell-boundary', { cwd: service, tool_input: { command } }, /fuera de las raíces/)
  }
  for (const target of ['enlace/a.js', 'colgado.js', 'salto/sub/a.js', 'enlace/../a.js']) {
    blocked('workspace-boundary', { cwd: service, tool_input: { file_path: target } }, /fuera de las raíces/)
  }
  // El freno dice dónde cae y por dónde se llegó.
  const where = new RegExp(`escribe en ${path.join(OUTSIDE, 'a.js')} \\(a donde lleva ${path.join(service, 'enlace')}`)
  blocked('shell-boundary', { cwd: service, tool_input: { command: 'echo x > enlace/a.js' } }, where)
  const landed =
    new RegExp(`^${path.join(OUTSIDE, 'archivo.js')} \\(a donde lleva ${path.join(service, 'colgado.js')}\\) está`)
  blocked('workspace-boundary', { cwd: service, tool_input: { file_path: 'colgado.js' } }, landed)
})

test('un enlace que se queda adentro, o la raíz alcanzada por uno, siguen pasando', () => {
  const { base, root } = project('cauce-enlaces-adentro-')
  const service = path.join(root, 'service')
  for (const command of ['echo x > src/a.js', 'echo x > dentro/a.js', 'echo x > vuelta/nuevo/a.js',
    'cd dentro && echo x > a.js', 'echo x > /dev/null', 'echo x > /dev/stdout', 'echo x 2> /dev/stderr',
    `echo x > ${path.join(os.tmpdir(), 'cauce-317-zz')}`]) {
    assert.doesNotThrow(() => shell(service, command), command)
  }
  for (const target of ['src/a.js', 'dentro/a.js', 'vuelta/nuevo/a.js']) {
    assert.doesNotThrow(() => file(service, target), target)
  }
  // La misma carpeta, entrando por un enlace: es como se llega a un servicio desde una línea de trabajo.
  const through = path.join(base, 'alias', 'service')
  process.env.OPS_ROOT = path.join(base, 'alias')
  try {
    assert.doesNotThrow(() => shell(through, 'echo x > src/a.js'))
    assert.doesNotThrow(() => file(through, 'src/a.js'))
    blocked('shell-boundary', { cwd: through, tool_input: { command: 'echo x > enlace/a.js' } }, /fuera de las raíces/)
    blocked('workspace-boundary', { cwd: through, tool_input: { file_path: 'enlace/a.js' } }, /fuera de las raíces/)
  } finally {
    delete process.env.OPS_ROOT
  }
  // Y con la raíz fuera del temporal, que es como vive una instancia: por la carpeta y por el enlace.
  for (const [opsRoot, cwd] of [[root, service], [path.join(base, 'alias'), through]]) {
    assert.equal(shellElsewhere(base, opsRoot, cwd, 'echo x > src/a.js').status, 0, cwd)
    assert.equal(shellElsewhere(base, opsRoot, cwd, 'echo x > dentro/nuevo/a.js').status, 0, cwd)
    const out = shellElsewhere(base, opsRoot, cwd, 'echo x > enlace/a.js')
    assert.equal(out.status, 2, cwd)
    assert.match(out.said, /fuera de las raíces/)
  }
})

// Lo que ya frenaba sigue frenando: una ruta escrita afuera no pasa por llegar adentro por un enlace.
test('un enlace de afuera que apunta adentro no abre el límite', () => {
  const { base, root } = project('cauce-enlaces-atajo-')
  const service = path.join(root, 'service')
  fs.symlinkSync(path.join(service, 'src'), path.join(base, 'atajo'))
  blocked('workspace-boundary', { cwd: service, tool_input: { file_path: path.join(base, 'atajo', 'a.js') } },
    /fuera de las raíces/)
  const out = shellElsewhere(base, root, service, `echo x > ${path.join(base, 'atajo', 'a.js')}`)
  assert.equal(out.status, 2)
  assert.match(out.said, /fuera de las raíces/)
})

// Una línea de trabajo es un árbol aparte de la instancia, con el producto enlazado desde la original. Con la
// raíz por defecto de un sidecar —`..`— la línea no enlaza la raíz sino sus hijos, así que lo que se escribe
// en ellos cae en la instancia de la que salió: es del proyecto y no frena. Lo que desde ahí lleve afuera, sí.
test('desde una línea de trabajo se escribe en el producto de la instancia de la que salió', () => {
  const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  // Con la raíz por defecto y con el servicio declarado por su carpeta: en la segunda la raíz es el enlace.
  for (const declared of ['..', '../app']) {
    const base = tempRoot('cauce-enlaces-linea-')
    const ops = path.join(base, 'side', 'ops')
    fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
    fs.mkdirSync(path.join(ops, 'cache'))
    fs.mkdirSync(path.join(base, 'side', 'app', 'src'), { recursive: true })
    fs.writeFileSync(path.join(ops, 'ops.config.json'),
      JSON.stringify({ workspaceRoots: [{ name: 'main', path: declared }] }))
    fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
    git(ops, 'init', '-q', '-b', 'main')
    git(ops, 'add', 'ops.config.json', 'planning/BACKLOG.md')
    git(ops, '-c', 'user.email=a@b.test', '-c', 'user.name=A', 'commit', '-q', '-m', 'base')
    const line = path.join(base, 'side-rev')
    const lineOps = path.join(line, 'ops')
    assert.equal(git(ops, 'worktree', 'add', '-q', '-b', 'line/rev', lineOps).status, 0)
    fs.symlinkSync(path.join(base, 'side', 'app'), path.join(line, 'app'))
    // Lo que la línea comparte con la instancia sin que sea una raíz declarada, como `node_modules`.
    fs.symlinkSync(path.join(ops, 'cache'), path.join(lineOps, 'cache'))
    fs.symlinkSync(OUTSIDE, path.join(base, 'side', 'app', 'enlace'))

    for (const [cwd, command] of [[line, 'echo x > app/src/b.js'], [path.join(line, 'app'), 'echo x > src/b.js'],
      [lineOps, 'echo x > planning/INBOX.md'], [lineOps, 'echo x > cache/a']]) {
      assert.equal(shellElsewhere(base, lineOps, cwd, command).status, 0, `${declared}: ${command}`)
    }
    process.env.OPS_ROOT = lineOps
    try {
      assert.doesNotThrow(() => file(line, 'app/src/b.js'), declared)
      assert.doesNotThrow(() => file(lineOps, 'cache/a'), declared)
      blocked('workspace-boundary', { cwd: line, tool_input: { file_path: 'app/enlace/a.js' } }, /fuera de las raíces/)
    } finally {
      delete process.env.OPS_ROOT
    }
    assert.equal(shellElsewhere(base, lineOps, line, 'echo x > app/enlace/a.js').status, 2, declared)
  }
})

// El temporal puede ser él mismo un enlace, como en macOS: vale escrito de las dos formas.
test('el temporal vale por donde cae, se lo nombre por su enlace o por su ruta real', () => {
  const { base, root } = project('cauce-enlaces-temporal-')
  const service = path.join(root, 'service')
  const realTemp = path.join(base, 'temporal-real')
  fs.mkdirSync(realTemp)
  fs.symlinkSync(realTemp, path.join(base, 'temporal'))
  const run = path.join(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
  const at = (target) => spawnSync(process.execPath, [run, 'shell-boundary'], { encoding: 'utf8',
    input: JSON.stringify({ cwd: service, tool_input: { command: `echo x > ${target}` } }),
    env: { ...process.env, TMPDIR: path.join(base, 'temporal'), OPS_ROOT: root } }).status
  assert.equal(at(path.join(base, 'temporal', 'a.txt')), 0)
  assert.equal(at(path.join(realTemp, 'a.txt')), 0)
  assert.equal(at(path.join(base, 'otro', 'a.txt')), 2)
})

// El canal por el que la persona aprueba se juzga también por dónde cae la escritura: un enlace hacia él no
// lo vuelve un archivo más del servicio.
test('la aprobación de la persona no se escribe por un enlace', () => {
  const { base, root } = project('cauce-enlaces-aprobacion-')
  const service = path.join(root, 'service')
  fs.symlinkSync(path.join(root, 'planning', '.ops-approval'), path.join(service, 'aprob'))
  assert.throws(() => file(service, 'aprob'))
  assert.equal(shellElsewhere(base, root, service, 'echo x > aprob').status, 2)
  assert.doesNotThrow(() => file(service, 'src/aprob'))
})

// De qué instancia salió un árbol se le pregunta a git sobre ese árbol, no sobre el que nombre el entorno.
test('una variable de git en el entorno no cambia cuál es la instancia de origen', () => {
  const { base, root } = project('cauce-enlaces-entorno-')
  const service = path.join(root, 'service')
  const victim = path.join(base, 'victima')
  fs.mkdirSync(path.join(victim, 'service'), { recursive: true })
  spawnSync('git', ['-C', victim, 'init', '-q'])
  spawnSync('git', ['-C', root, 'init', '-q'])
  fs.symlinkSync(path.join(victim, 'service'), path.join(service, 'hacia'))
  assert.equal(shellElsewhere(base, root, service, 'echo x > hacia/a.js').status, 2)
  const env = { GIT_DIR: path.join(victim, '.git') }
  assert.equal(shellElsewhere(base, root, service, 'echo x > hacia/a.js', env).status, 2)
})
