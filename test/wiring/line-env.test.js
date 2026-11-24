'use strict'

// Caso 543: el árbol de una línea no trae los `.env*` que git ignora. `ops line` los nombra, `--env` los copia sin
// pisar ninguno y con el nombre de proyecto de la línea, y `ops lines env` dice cuál envejeció, por clave y nunca
// por valor.

const { tempRoot, run, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ok = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`)
}
const SECRET = 's3cr3t-valor'

// Una instancia sidecar y un producto con `.env` y `.env.local` ignorados, una plantilla versionada y, si se pide,
// un compose.
function product(prefix, { compose = false, repo = 'app' } = {}) {
  const base = fs.realpathSync(tempRoot(prefix))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Env', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  ok(ops, 'add', ...fs.readdirSync(ops).filter((one) => one !== 'node_modules' && one !== '.git'))
  ok(ops, 'commit', '-qm', 'instancia')
  const app = path.join(base, repo)
  fs.mkdirSync(app)
  ok(app, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(app, '.gitignore'), '.env\n.env.local\n')
  fs.writeFileSync(path.join(app, '.env.example'), 'API_KEY=\n')
  fs.writeFileSync(path.join(app, '.env.defaults'), 'PORT=3000\n')
  if (compose) fs.writeFileSync(path.join(app, 'compose.yaml'), 'services:\n  web:\n    image: node:24\n')
  ok(app, 'add', '.'); ok(app, 'commit', '-qm', 'producto')
  fs.writeFileSync(path.join(app, '.env'), `API_KEY=${SECRET}\nCOMPOSE_PROJECT_NAME=app\n`)
  fs.writeFileSync(path.join(app, '.env.local'), 'LOCAL=1\n')
  fs.chmodSync(path.join(app, '.env'), 0o600)
  return { base, ops, app, tree: path.join(base, 'lines', 'pagos', repo) }
}
const envWarning = (report) => report.warnings.filter((one) => /git ignora/.test(one))

test('ops line nombra los .env* que el árbol no trae, sin leerlos, y calla cuando están', () => {
  const { ops, tree } = product('cauce-line-env-aviso-')
  const report = JSON.parse(run(['line', ops, 'pagos', 'app', '--json']).stdout)
  assert.equal(envWarning(report).length, 1)
  assert.match(envWarning(report)[0], /^app: el checkout de siempre tiene \.env y \.env\.local, que git ignora/)
  assert.match(envWarning(report)[0], /ops line <ops-root> pagos --env/)
  assert.doesNotMatch(JSON.stringify(report), new RegExp(SECRET), 'no muestra ningún valor')
  assert.equal(fs.existsSync(path.join(tree, '.env')), false, 'sin --env no escribe nada')
  assert.ok(fs.existsSync(path.join(tree, '.env.example')), 'la plantilla versionada la trae el árbol solo')
  fs.writeFileSync(path.join(tree, '.env'), 'PROPIO=1\n')
  fs.writeFileSync(path.join(tree, '.env.local'), 'PROPIO=1\n')
  assert.deepEqual(envWarning(JSON.parse(run(['line', ops, 'pagos', '--json']).stdout)), [])
})

test('--env copia lo que falta, no pisa lo que está y deja el nombre de proyecto de la línea', () => {
  const { ops, tree } = product('cauce-line-env-copia-', { compose: true })
  const out = run(['line', ops, 'pagos', 'app', '--env'])
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /copiados del checkout de siempre: \.env, \.env\.local \(no se muestra su contenido\)/)
  assert.doesNotMatch(out.stdout, new RegExp(SECRET))
  assert.doesNotMatch(out.stdout, /su compose, desde este árbol/, 'con el nombre propio, el aviso de compose calla')
  const env = fs.readFileSync(path.join(tree, '.env'), 'utf8')
  assert.match(env, new RegExp(`API_KEY=${SECRET}`))
  assert.match(env, /^COMPOSE_PROJECT_NAME=app-pagos$/m)
  assert.doesNotMatch(env, /^COMPOSE_PROJECT_NAME=app$/m, 'el nombre del original no se queda')
  assert.equal(fs.statSync(path.join(tree, '.env')).mode & 0o777, 0o600, 'con los permisos del original')
  fs.writeFileSync(path.join(tree, '.env.local'), 'EDITADO=1\n')
  assert.equal(run(['line', ops, 'pagos', '--env']).status, 0)
  assert.equal(fs.readFileSync(path.join(tree, '.env.local'), 'utf8'), 'EDITADO=1\n', 'no pisa el que ya está')
})

test('sin compose, --env copia el .env tal cual, sin nombre de proyecto', () => {
  const { ops, app, tree } = product('cauce-line-env-sin-compose-')
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  assert.equal(fs.readFileSync(path.join(tree, '.env'), 'utf8'), fs.readFileSync(path.join(app, '.env'), 'utf8'))
})

test('ops lines env dice qué clave envejeció, y con --apply copia el original y guarda el anterior', () => {
  const { base, ops, app, tree } = product('cauce-line-env-deriva-', { compose: true })
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  const same = run(['lines', 'env', ops, 'pagos'])
  assert.equal(same.status, 0, same.stdout)
  assert.match(same.stdout, /^app\/\.env {2}igual al original$/m, 'el nombre de proyecto de la línea no cuenta')
  fs.writeFileSync(path.join(app, '.env'), 'API_KEY=rotada\nCOMPOSE_PROJECT_NAME=app\nNUEVA=1\n')
  fs.chmodSync(path.join(tree, '.env'), 0o644)
  fs.appendFileSync(path.join(tree, '.env'), 'VIEJA=1\n')
  const drifted = run(['lines', 'env', ops, 'pagos'])
  assert.equal(drifted.status, 1)
  assert.match(drifted.stdout,
    /app\/\.env {2}el original tiene NUEVA; sólo el árbol tiene VIEJA; cambió el valor de API_KEY/)
  assert.doesNotMatch(drifted.stdout, /rotada|s3cr3t/, 'nombra claves, nunca valores')
  assert.match(drifted.stdout, /--apply/)
  const applied = run(['lines', 'env', ops, 'pagos', '--apply'])
  assert.equal(applied.status, 0, applied.stdout)
  const prev = path.join(base, 'lines', 'pagos', '.env-prev', 'app')
  const kept = fs.readdirSync(prev)
  assert.equal(kept.length, 1)
  assert.match(kept[0], /^\.env\.\d{4}-/, 'con la hora en el nombre')
  assert.match(fs.readFileSync(path.join(prev, kept[0]), 'utf8'), /VIEJA=1/, 'el anterior queda fuera de los repos')
  const env = fs.readFileSync(path.join(tree, '.env'), 'utf8')
  assert.match(env, /API_KEY=rotada/)
  assert.match(env, /^COMPOSE_PROJECT_NAME=app-pagos$/m, 'y vuelve a llevar el nombre de la línea')
  assert.equal(fs.statSync(path.join(tree, '.env')).mode & 0o777, 0o600, 'con los permisos del original')
  assert.doesNotMatch(drifted.stdout, /\.env\.(?:example|defaults)/, 'lo versionado no se compara')
  assert.equal(run(['lines', 'env', ops, 'pagos']).status, 0)
})

test('ops lines env con un árbol que falta lo dice, y con una línea sin declarar se niega', () => {
  const { ops, tree } = product('cauce-line-env-falta-')
  assert.equal(run(['line', ops, 'pagos', 'app']).status, 0)
  const absent = run(['lines', 'env', ops, 'pagos'])
  assert.match(absent.stdout, /app\/\.env {2}falta en el árbol/)
  discard(tree)
  assert.match(run(['lines', 'env', ops, 'pagos']).stdout, /app {2}el árbol no está: ops line lo arma/)
  const undeclared = run(['lines', 'env', ops, 'otra'])
  assert.equal(undeclared.status, 2)
  assert.match(undeclared.stderr, /la línea otra no está declarada/)
})

// La copia la hace el motor y el agente no ve el contenido, así que el guard que frena leer un `.env` no la frena.
test('secrets-shell deja correr la copia y la comparación, y sigue frenando leer el .env', () => {
  const H = require('../support/hooks-harness')
  const { executeAll } = require('../../engine/hooks/run')
  const root = H.pushRoot('cauce-line-env-guard-')
  // Declarada, como la deja quien la pidió: armar una línea nueva la frena `line-command` (caso 551), no esto.
  const config = path.join(root, 'ops.config.json')
  fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), lines: { pagos: [] } }))
  const shell = (command) => ({ cwd: root, hook_event_name: 'PreToolUse', permission_mode: 'dontAsk',
    tool_input: { command } })
  for (const command of ['node tools/ops.js line . pagos --env', 'npm run ops -- lines env . pagos --apply']) {
    assert.doesNotThrow(() => executeAll(['pre-shell'], shell(command)), command)
  }
  H.blocked('secrets-shell', shell('cat app/.env'), /\.env/)
})

// Caso 544: el retiro no desarma lo del producto, y lo dice antes de hacerlo. Con un nombre propio dice cómo bajarlo;
// sin él no lo aconseja, porque el proyecto es el del checkout de siempre.
test('el retiro en seco avisa el proyecto de compose y los .env* que deja o se lleva', () => {
  const { ops } = product('cauce-line-retiro-', { compose: true })
  assert.equal(run(['line', ops, 'pagos', 'app']).status, 0)
  const shared = run(['lines', 'join', ops, 'pagos'])
  assert.match(shared.stdout, /app: su compose, desde este árbol, es el mismo proyecto que el del checkout de siempre/)
  assert.doesNotMatch(shared.stdout, /docker compose -p/, 'no aconseja bajar el proyecto del checkout de siempre')
  assert.doesNotMatch(shared.stdout, /se lleva/, 'sin .env* en el árbol no hay nada que se lleve')
  // Un `.env` copiado a mano trae el nombre del original, y ése es el proyecto del checkout de siempre.
  const { tree } = product('cauce-line-retiro-copia-', { compose: true })
  const opsCopy = path.join(path.dirname(path.dirname(path.dirname(tree))), 'ops')
  assert.equal(run(['line', opsCopy, 'pagos', 'app']).status, 0)
  fs.writeFileSync(path.join(tree, '.env'), 'COMPOSE_PROJECT_NAME=app\n')
  assert.doesNotMatch(run(['lines', 'join', opsCopy, 'pagos']).stdout, /docker compose -p/)
  assert.equal(run(['line', ops, 'pagos', '--env']).status, 0)
  const own = run(['lines', 'join', ops, 'pagos'])
  assert.match(own.stdout, /app: su compose corría como el proyecto app-pagos, .*docker compose -p app-pagos down/)
  assert.match(own.stdout, /app: el retiro se lleva \.env y \.env\.local del árbol, que git ignora/)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  assert.doesNotMatch(applied.stdout, /docker compose/, 'una vez retirada ya no hay nada que hacer antes')
})

test('sin compose, el retiro sólo avisa los .env* del árbol', () => {
  const { ops } = product('cauce-line-retiro-sin-compose-')
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  const out = run(['lines', 'join', ops, 'pagos'])
  assert.doesNotMatch(out.stdout, /compose/)
  assert.match(out.stdout, /app: el retiro se lleva \.env y \.env\.local del árbol/)
})

test('el nombre de proyecto se agrega a un .env que no lo tiene, y lines env también habla en JSON', () => {
  const LE = require('../../engine/cli/line-env')
  assert.equal(LE.withProject('A=1', 'app-pagos'), 'A=1\nCOMPOSE_PROJECT_NAME=app-pagos\n')
  assert.equal(LE.withProject('', 'app-pagos'), 'COMPOSE_PROJECT_NAME=app-pagos\n')
  assert.equal(LE.withProject('export COMPOSE_PROJECT_NAME=app\n', 'app-pagos'), 'COMPOSE_PROJECT_NAME=app-pagos\n')
  const { ops, app } = product('cauce-line-env-json-', { compose: true })
  fs.writeFileSync(path.join(app, '.env'), 'API_KEY=x')
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  const report = JSON.parse(run(['lines', 'env', ops, 'pagos', '--json']).stdout)
  assert.deepEqual(report.repos[0].files.map((one) => [one.file, one.added, one.removed, one.changed]),
    [['.env', [], [], []], ['.env.local', [], [], []]])
  for (const file of ['.env', '.env.local']) fs.unlinkSync(path.join(app, file))
  assert.match(run(['lines', 'env', ops, 'pagos']).stdout, /app {2}el checkout de siempre no tiene \.env\* ignorados/)
})

// Lo que encontró la revisión del caso 543: los enlaces, el CRLF, la clave repetida y los respaldos.
test('un .env que es un enlace o una carpeta no se sigue ni se pisa, de ningún lado', () => {
  const { base, ops, app, tree } = product('cauce-line-env-enlace-')
  assert.equal(run(['line', ops, 'pagos', 'app']).status, 0)
  const outside = path.join(base, 'outside.env')
  fs.writeFileSync(outside, 'OTHER=1\n')
  fs.symlinkSync(outside, path.join(tree, '.env'))
  fs.mkdirSync(path.join(tree, '.env.local'))
  const out = run(['lines', 'env', ops, 'pagos', '--apply'])
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /app\/\.env {2}no es un archivo \(un enlace o una carpeta\): no se compara ni se toca/)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'OTHER=1\n', 'el archivo de afuera no se escribe')
  assert.ok(fs.statSync(path.join(tree, '.env.local')).isDirectory())
  // Del lado del original, un enlace no se copia: podría llevar al árbol un archivo de cualquier lado.
  const other = product('cauce-line-env-enlace-origen-')
  fs.unlinkSync(path.join(other.app, '.env'))
  fs.symlinkSync(outside, path.join(other.app, '.env'))
  assert.equal(run(['line', other.ops, 'pagos', 'app', '--env']).status, 0)
  assert.equal(fs.existsSync(path.join(other.tree, '.env')), false)
  assert.ok(fs.existsSync(path.join(app, '.env')))
})

test('un .env con CRLF se compara igual, y una clave de proyecto repetida queda una sola vez', () => {
  const { ops, app, tree } = product('cauce-line-env-crlf-', { compose: true })
  fs.writeFileSync(path.join(app, '.env'), 'COMPOSE_PROJECT_NAME=x\r\nA=1\r\nCOMPOSE_PROJECT_NAME=app\r\n')
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  const env = fs.readFileSync(path.join(tree, '.env'), 'utf8')
  assert.equal(env, 'COMPOSE_PROJECT_NAME=app-pagos\r\nA=1\r\n')
  fs.writeFileSync(path.join(app, '.env'), 'A=2\r\nB=1\r\n')
  assert.match(run(['lines', 'env', ops, 'pagos']).stdout, /el original tiene B; cambió el valor de A/)
})

test('el retiro no aconseja bajar el proyecto del checkout de siempre, escrito como sea', () => {
  for (const [original, own] of [['', 'app'], ['COMPOSE_PROJECT_NAME=app\n', '"app"'], ['', 'app # el mismo']]) {
    const { ops, app, tree } = product('cauce-line-retiro-mismo-', { compose: true })
    fs.writeFileSync(path.join(app, '.env'), original)
    assert.equal(run(['line', ops, 'pagos', 'app']).status, 0)
    fs.writeFileSync(path.join(tree, '.env'), `COMPOSE_PROJECT_NAME=${own}\n`)
    const out = run(['lines', 'join', ops, 'pagos']).stdout
    assert.doesNotMatch(out, /docker compose -p/, `${JSON.stringify(original)} y ${own}`)
    assert.match(out, /es el mismo proyecto que el del checkout de siempre/)
  }
})

test('dos --apply guardan dos respaldos, y el retiro los nombra antes y después', () => {
  const { ops, app, tree } = product('cauce-line-env-respaldos-')
  assert.equal(run(['line', ops, 'pagos', 'app', '--env']).status, 0)
  for (const value of ['1', '2']) {
    fs.appendFileSync(path.join(tree, '.env'), `LOCAL_${value}=1\n`)
    assert.equal(run(['lines', 'env', ops, 'pagos', '--apply']).status, 0)
  }
  const prev = path.join(path.dirname(tree), '.env-prev', 'app')
  assert.equal(fs.readdirSync(prev).length, 2, 'el segundo no pisa el primero')
  assert.match(run(['lines', 'join', ops, 'pagos']).stdout, /quedan en .*\.env-prev los \.env que reemplazó/)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.match(applied.stdout, /quedan en .*\.env-prev los \.env que reemplazó/)
  assert.ok(fs.existsSync(app))
})

// Lo que encontró la segunda revisión, contrastado con Docker Compose 2.29.2: el nombre de la carpeta pierde los `_` y
// `-` de adelante, y un nombre que sale de una variable no se sabe.
test('el retiro compara el proyecto como lo normaliza Compose, y no adivina uno que sale de una variable', () => {
  const under = product('cauce-line-retiro-guion-', { compose: true, repo: '_app' })
  fs.writeFileSync(path.join(under.app, '.env'), 'A=1\n')
  assert.equal(run(['line', under.ops, 'pagos', '_app']).status, 0)
  fs.writeFileSync(path.join(under.tree, '.env'), 'COMPOSE_PROJECT_NAME=app\n')
  const out = run(['lines', 'join', under.ops, 'pagos']).stdout
  assert.doesNotMatch(out, /docker compose -p/)
  assert.match(out, /es el mismo proyecto que el del checkout de siempre/)
  const variable = product('cauce-line-retiro-variable-', { compose: true })
  fs.writeFileSync(path.join(variable.app, '.env'), 'COMPOSE_PROJECT_NAME=${X:-app}\n')
  assert.equal(run(['line', variable.ops, 'pagos', 'app']).status, 0)
  fs.writeFileSync(path.join(variable.tree, '.env'), 'COMPOSE_PROJECT_NAME=app\n')
  const unknown = run(['lines', 'join', variable.ops, 'pagos']).stdout
  assert.doesNotMatch(unknown, /docker compose -p/)
  assert.match(unknown, /no se sabe con qué proyecto corre su compose/)
  // El `name:` del compose va antes que la carpeta y no se lee; un nombre que Compose rechaza no corrió nunca.
  const named = product('cauce-line-retiro-name-', { compose: true })
  fs.writeFileSync(path.join(named.app, 'compose.yaml'), 'name: shop\nservices: {}\n')
  fs.writeFileSync(path.join(named.app, '.env'), 'A=1\n')
  assert.equal(run(['line', named.ops, 'pagos', 'app']).status, 0)
  fs.writeFileSync(path.join(named.tree, 'compose.yaml'), 'name: shop\nservices: {}\n')
  for (const own of ['shop', '"web "', '" app"']) {
    fs.writeFileSync(path.join(named.tree, '.env'), `COMPOSE_PROJECT_NAME=${own}\n`)
    const out = run(['lines', 'join', named.ops, 'pagos']).stdout
    assert.doesNotMatch(out, /docker compose -p/, own)
    assert.match(out, /no se sabe con qué proyecto corre su compose/, own)
  }
})

test('--apply no escribe a través de un hardlink del .env del árbol', () => {
  const { base, ops, tree } = product('cauce-line-env-hardlink-')
  assert.equal(run(['line', ops, 'pagos', 'app']).status, 0)
  const outside = path.join(base, 'outside.env')
  fs.writeFileSync(outside, 'OTHER=1\n')
  fs.linkSync(outside, path.join(tree, '.env'))
  assert.equal(run(['lines', 'env', ops, 'pagos', '--apply']).status, 0)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'OTHER=1\n', 'el archivo de afuera queda como estaba')
  assert.match(fs.readFileSync(path.join(tree, '.env'), 'utf8'), /API_KEY=/)
})
