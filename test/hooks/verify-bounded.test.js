'use strict'

// El costo y el alcance de `verify` (caso 240, R26): un gate tiene tope y se corta con todo lo que lanzó,
// corre uno por vez en la máquina, y lo que escribe no corre sobre el árbol de quien commitea.

const { tempRoot } = require('../support/environment')
const { git, initRepo, messageOf } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')
const { holdMachine, lockFile } = require('../../engine/hooks/machine-lock')
const C = require('../../engine/config/validate')

// Un repositorio embedded con todo staged y nada suelto, que es lo que hace correr los gates en el árbol;
// `planning/.verify-log` va ignorado como en el molde, porque si no la segunda corrida ya iría a la copia.
function repo(name, scripts, root = {}, runner = {}) {
  const dir = tempRoot(name)
  initRepo(dir)
  fs.mkdirSync(path.join(dir, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'planning/.verify-log\n')
  fs.writeFileSync(path.join(dir, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'app', path: '.', ...root }],
    runner: { allowPush: false, ...runner },
  }))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts }))
  fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1\n')
  git(['add', '-A'], dir)
  return dir
}
const commit = (dir) => ({ cwd: dir, tool_input: { command: 'git commit -m x' } })
const gates = (dir) => fs.readFileSync(path.join(dir, 'planning', '.verify-log'), 'utf8')
  .split('\n').filter(Boolean).map((line) => JSON.parse(line).gate)

test('un gate que pasa el tope se corta con lo que lanzó, y el bloqueo nombra el tope', () => {
  // Un nieto deja una marca a los 2,5 s. npm le reenvía el corte a su `sh`, no al nieto, así que si el tope
  // matara sólo a npm el nieto quedaría huérfano y la marca aparecería después.
  const late = 'node -e "setTimeout(() => require(\'fs\').writeFileSync(\'TARDE\', \'\'), 2500)"; true'
  const dir = repo('cauce-verify-tope-', { test: late }, {}, { gateTimeoutMinutes: 0.02 })
  // Lo que se mide es lo que duró el gate, no el reloj: con la suite entera, parte de la espera es el
  // candado que tiene otra prueba.
  const message = messageOf('verify', commit(dir))
  assert.match(message, /test \(cortado, [\d.]+ s\): pasó el tope de 0\.02 min \(runner\.gateTimeoutMinutes/)
  assert.ok(Number(message.match(/cortado, ([\d.]+) s/)[1]) < 2.5, 'cortó antes de que el gate terminara solo')
  spawnSync('sleep', ['3'])
  assert.equal(fs.existsSync(path.join(dir, 'TARDE')), false, 'no quedó nada del gate corriendo')
})

test('sobre el árbol no corren build ni un lint con --fix; el resto sí', () => {
  const dir = repo('cauce-verify-arbol-', {
    test: 'node -e 0', lint: 'touch LINT && true --fix', typecheck: 'node -e 0', build: 'touch BUILD',
  })
  assert.doesNotThrow(() => execute('verify', commit(dir)))
  assert.deepEqual(gates(dir), ['test', 'typecheck'])
  assert.equal(fs.existsSync(path.join(dir, 'BUILD')), false)
  assert.equal(fs.existsSync(path.join(dir, 'LINT')), false)
})

test('un build que la raíz declara en su verify corre también sobre el árbol', () => {
  const dir = repo('cauce-verify-declarado-', { test: 'node -e 0', build: 'touch BUILD' },
    { verify: 'npm test && npm run build' })
  assert.doesNotThrow(() => execute('verify', commit(dir)))
  assert.deepEqual(gates(dir), ['test', 'build'])
  assert.ok(fs.existsSync(path.join(dir, 'BUILD')))
})

test('sobre la copia del índice corren todos, y el árbol no se entera', () => {
  const dir = repo('cauce-verify-copia-', { lint: 'touch LINT && true --fix', build: 'touch BUILD' })
  fs.writeFileSync(path.join(dir, 'suelto.txt'), 'dispara la copia\n')
  assert.doesNotThrow(() => execute('verify', commit(dir)))
  assert.deepEqual(gates(dir), ['lint', 'build'])
  assert.equal(fs.existsSync(path.join(dir, 'BUILD')), false)
})

test('el candado espera a quien lo tiene vivo, toma el de un proceso muerto y suelta sólo el suyo', () => {
  const lock = path.join(tempRoot('cauce-verify-candado-'), 'verify.lock')
  const holder = spawn('sleep', ['30'])
  try {
    fs.writeFileSync(lock, String(holder.pid))
    const started = Date.now()
    assert.throws(() => holdMachine(600, lock), (error) => error.blocked
      && new RegExp(`otro verify corre en esta máquina \\(pid ${holder.pid}\\)`).test(error.message))
    assert.ok(Date.now() - started >= 600, 'esperó antes de rendirse')
  } finally { holder.kill() }

  const dead = spawnSync('node', ['-e', '0']).pid
  fs.writeFileSync(lock, String(dead))
  const release = holdMachine(600, lock)
  assert.equal(fs.readFileSync(lock, 'utf8'), String(process.pid), 'tomó el abandonado')
  fs.writeFileSync(lock, '1')
  release()
  assert.equal(fs.readFileSync(lock, 'utf8'), '1', 'no borra el de otro')
})

test('runner.gateTimeoutMinutes se valida, y check avisa un lint con --fix', () => {
  const config = (runner) => ({ project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'a', path: '.' }],
    runner: { maxTaskHours: 4, humanCheckpointBetweenMilestones: true, commitPerTask: true, allowPush: false,
      ...runner } })
  assert.ok(C.validateOpsConfig(config({ gateTimeoutMinutes: 0 }))
    .includes('ops.config.json: runner.gateTimeoutMinutes debe ser mayor que cero'))
  assert.ok(!C.validateOpsConfig(config({ gateTimeoutMinutes: 15 })).some((one) => /gateTimeout/.test(one)))

  const { run } = require('../support/environment')
  const target = path.join(tempRoot('cauce-verify-check-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const product = path.resolve(target, '..')
  const warned = () => JSON.parse(run(['check', path.join(target, 'planning'), '--json']).stdout).warnings
    .some((one) => /corre lint con --fix, y verify no lo corre sobre el árbol/.test(one))
  assert.equal(warned(), false, 'sin package.json no hay nada que avisar')
  fs.writeFileSync(path.join(product, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }))
  assert.equal(warned(), false, 'un lint que sólo revisa no avisa')
  fs.writeFileSync(path.join(product, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint . --fix' } }))
  assert.equal(warned(), true)
})

test('sin CAUCE_VERIFY_LOCK el candado es el de la máquina', () => {
  const previous = process.env.CAUCE_VERIFY_LOCK
  try {
    delete process.env.CAUCE_VERIFY_LOCK
    assert.equal(lockFile(), path.join(require('node:os').tmpdir(), 'cauce-verify.lock'))
  } finally { process.env.CAUCE_VERIFY_LOCK = previous }
})

test('verify usa el candado que fija CAUCE_VERIFY_LOCK, no el de la máquina', () => {
  const lock = path.join(tempRoot('cauce-verify-candado-propio-'), 'verify.lock')
  const holder = spawn('sleep', ['30'])
  const previous = process.env.CAUCE_VERIFY_LOCK
  try {
    fs.writeFileSync(lock, String(holder.pid))
    process.env.CAUCE_VERIFY_LOCK = lock
    const dir = repo('cauce-verify-candado-env-', { test: 'node -e 0' }, {}, { gateTimeoutMinutes: 0.005 })
    const message = messageOf('verify', commit(dir))
    assert.ok(message.includes(`otro verify corre en esta máquina (pid ${holder.pid})`), message)
    assert.ok(message.includes(lock), 'nombra el archivo que espera')
  } finally {
    holder.kill()
    process.env.CAUCE_VERIFY_LOCK = previous
  }
})

// Un monorepo con el manifiesto de cada servicio en su carpeta —el ejemplo del README, y lo que `/onboard`
// configura solo— no tenía gate: `verify` buscaba `package.json` únicamente en la raíz git del commit y
// el commit salía en verde con la suite roja, sin decirlo (caso 333). Ahora corre los gates de cada raíz
// declarada que el commit toca, desde la raíz del repo o desde adentro de la raíz, y sólo ésas.
test('verify corre los gates de cada raíz declarada que el commit toca, no sólo los de la raíz git', () => {
  const dir = tempRoot('cauce-verify-monorepo-')
  initRepo(dir)
  fs.mkdirSync(path.join(dir, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'planning/.verify-log\n')
  fs.writeFileSync(path.join(dir, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', runner: { allowPush: false },
    workspaceRoots: [{ name: 'api', path: 'apps/api' }, { name: 'web', path: 'apps/web' }],
  }))
  for (const [service, test] of [['api', 'node -e "process.exit(1)"'], ['web', 'node -e 0']]) {
    fs.mkdirSync(path.join(dir, 'apps', service), { recursive: true })
    fs.writeFileSync(path.join(dir, 'apps', service, 'package.json'), JSON.stringify({ scripts: { test } }))
    fs.writeFileSync(path.join(dir, 'apps', service, 'app.js'), 'module.exports = 1\n')
  }
  git(['add', '-A'], dir)
  git(['commit', '-qm', 'base'], dir)

  // Sólo web: su suite pasa y la de api, que está roja, no se toca.
  fs.writeFileSync(path.join(dir, 'apps', 'web', 'app.js'), 'module.exports = 2\n')
  git(['add', 'apps/web/app.js'], dir)
  assert.doesNotThrow(() => execute('verify', commit(dir)))
  assert.deepEqual(gates(dir), ['test'])

  // La raíz api, desde la raíz del repo y desde adentro: el gate corre y nombra la raíz, no el repo.
  fs.writeFileSync(path.join(dir, 'apps', 'api', 'app.js'), 'module.exports = 2\n')
  git(['add', 'apps/api/app.js'], dir)
  for (const cwd of [dir, path.join(dir, 'apps', 'api')]) {
    assert.throws(() => execute('verify', { cwd, tool_input: { command: 'git commit -m x' } }),
      (error) => /Verify falló en api: test/.test(error.message))
  }

  // Y sobre la copia del índice, que es a donde va un árbol con algo suelto: la raíz se busca en su espejo
  // dentro del temporal, no en el árbol vivo.
  fs.writeFileSync(path.join(dir, 'suelto.txt'), 'dispara la copia\n')
  assert.throws(() => execute('verify', commit(dir)), (error) => /Verify falló en api: test/.test(error.message))
})

// Dos huecos que la revisión del conjunto encontró en el 333. Tocar una raíz declarada dejaba de correr la
// puerta del repositorio para lo staged fuera de toda raíz, que antes sí corría; y la copia del índice se
// materializaba desde el cwd del comando —`git -C apps/api checkout-index` escribe sólo `apps/api/`—, así que
// desde adentro de una raíz el espejo de la otra no existía y su gate se salteaba en silencio.
test('verify conserva la puerta del repo para lo que queda fuera de toda raíz, y copia el índice entero', () => {
  const dir = tempRoot('cauce-verify-fuera-')
  initRepo(dir)
  fs.mkdirSync(path.join(dir, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'planning/.verify-log\n')
  fs.writeFileSync(path.join(dir, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', runner: { allowPush: false },
    workspaceRoots: [{ name: 'api', path: 'apps/api' }, { name: 'web', path: 'apps/web' }],
  }))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  for (const [service, test] of [['api', 'node -e 0'], ['web', 'node -e "process.exit(1)"']]) {
    fs.mkdirSync(path.join(dir, 'apps', service), { recursive: true })
    fs.writeFileSync(path.join(dir, 'apps', service, 'package.json'), JSON.stringify({ scripts: { test } }))
    fs.writeFileSync(path.join(dir, 'apps', service, 'app.js'), 'module.exports = 1\n')
  }
  fs.mkdirSync(path.join(dir, 'packages', 'shared'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'packages', 'shared', 'index.js'), 'module.exports = 1\n')
  git(['add', '-A'], dir)
  git(['commit', '-qm', 'base'], dir)

  // Con api verde y algo fuera de toda raíz, la puerta del repo, que está roja, sigue corriendo.
  fs.writeFileSync(path.join(dir, 'apps', 'api', 'app.js'), 'module.exports = 2\n')
  fs.writeFileSync(path.join(dir, 'packages', 'shared', 'index.js'), 'module.exports = 2\n')
  git(['add', 'apps/api/app.js', 'packages/shared/index.js'], dir)
  assert.throws(() => execute('verify', commit(dir)),
    (error) => /Verify falló en cauce-verify-fuera.*: test/.test(error.message))

  // Desde adentro de api, con web staged y algo suelto que fuerza la copia: el espejo de web existe y frena.
  git(['reset', '-q'], dir)
  git(['checkout', '-q', '--', '.'], dir)
  fs.writeFileSync(path.join(dir, 'apps', 'web', 'app.js'), 'module.exports = 2\n')
  git(['add', 'apps/web/app.js'], dir)
  fs.writeFileSync(path.join(dir, 'suelto.txt'), 'dispara la copia\n')
  const inside = { cwd: path.join(dir, 'apps', 'api'), tool_input: { command: 'git commit -m x' } }
  assert.throws(() => execute('verify', inside), (error) => /Verify falló en web: test/.test(error.message))
})
