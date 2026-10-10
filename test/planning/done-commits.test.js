'use strict'

// El commit que cita una entrada de done/ tiene que existir (caso 243). Lo que se mide: que se avise por
// entrada el sha que su repositorio no tiene —también el de un blob—, que el repositorio nombrado se busque
// dentro de una raíz que no es un repositorio, que lo que no se puede mirar vaya en una sola línea, y que
// `check` lo muestre sin fallar.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const R = require('../../engine/core/repos')
const DC = require('../../engine/planning/done-commits')

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
  { cwd, encoding: 'utf8' })

// Como en una instancia real: la raíz declarada es una carpeta con repositorios adentro, y no es uno.
function instance(name) {
  const base = tempRoot(name)
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const api = path.join(base, 'api')
  fs.mkdirSync(api)
  git(api, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(api, 'archivo.txt'), 'x\n')
  git(api, 'add', 'archivo.txt')
  git(api, 'commit', '-qm', 'base')
  const sha = git(api, 'rev-parse', '--short', 'HEAD').stdout.trim()
  const blob = git(api, 'rev-parse', '--short', 'HEAD:archivo.txt').stdout.trim()
  return { target, sha, blob }
}
const entry = (slug, commit) => ({ slug, source: `done/${slug}.md`, commit })

test('se avisa por entrada el sha que su repositorio no tiene, y sólo ése', () => {
  const { target, sha, blob } = instance('cauce-commits-')
  const warnings = DC.unknownCommitWarnings([
    entry('real', `${sha} feat: algo (api@main)`),
    entry('inventado', 'deadbee feat: algo (api@main)'),
    entry('blob', `${blob} feat: algo (api@main)`),
    entry('varios', `${sha} feat: uno (api@main); deadbee fix: otro (api@main)`),
    entry('sin-commit', 'n/a — no hubo cambio'),
  ], (items) => R.commitStatus(target, items))
  assert.deepEqual(warnings.map((one) => one.split(':')[0]), [
    'done/inventado.md inventado', 'done/blob.md blob', 'done/varios.md varios'])
  assert.match(warnings[0], /el commit deadbee no está en su repositorio/)
})

// Caso 254, del lado de `check`: con una raíz por repositorio, `(api@main)` nombra a la raíz y no a una
// carpeta adentro. Buscando sólo adentro, el commit quedaba «sin comprobar» teniendo el repositorio al lado.
test('un repositorio nombrado como su raíz declarada se encuentra', () => {
  const { target, sha } = instance('cauce-commits-raiz-')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'api', path: '../api' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  const status = R.commitStatus(target, [{ sha, repo: 'api' }, { sha: 'deadbee', repo: 'api' }])
  assert.deepEqual(status, ['found', 'missing'])
})

test('lo que no se puede mirar va en una sola línea, con los repositorios que faltan', () => {
  const { target, sha } = instance('cauce-commits-ausente-')
  const warnings = DC.unknownCommitWarnings([
    entry('real', `${sha} feat: algo (api@main)`),
    entry('otro-repo', 'abc1234 feat: algo (web@main)'),
    entry('otro-mas', 'abc1235 feat: algo (web@main)'),
    entry('sin-nombre', 'abc1236 feat: algo'),
  ], (items) => R.commitStatus(target, items))
  assert.deepEqual(warnings, ['done/: 3 commit(s) no se comprobaron porque su repositorio no está en esta '
    + 'máquina (web, sin repositorio nombrado)'])
})

test('check lo muestra como aviso y sigue en verde', () => {
  const { target } = instance('cauce-commits-check-')
  fs.writeFileSync(path.join(target, 'planning', 'done', 'inventado.md'), '- [x] **inventado** — Algo\n'
    + '  acept: se observa\n  fecha: 2026-10-02\n  done: hecho y `make test` salió 0\n  qa: observado\n'
    + '  tests: n/a — sin superficie\n  commit: deadbee feat: algo (api@main)\n')
  const result = JSON.parse(run(['check', path.join(target, 'planning'), '--json']).stdout)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.ok(result.warnings.some((one) => /inventado: el commit deadbee no está en su repositorio/.test(one)),
    JSON.stringify(result.warnings))
})

// Caso 273. En la carpeta de una línea de trabajo el repositorio del producto es un enlace al original.
test('un repositorio que se alcanza por un enlace se encuentra igual', () => {
  const { target, sha } = instance('cauce-commits-enlace-')
  const base = path.dirname(target)
  fs.renameSync(path.join(base, 'api'), path.join(base, 'api-original'))
  fs.symlinkSync(path.join(base, 'api-original'), path.join(base, 'api'), 'dir')
  assert.deepEqual(R.commitStatus(target, [{ sha, repo: 'api' }, { sha: 'deadbee', repo: 'api' }]),
    ['found', 'missing'])
})

// Caso 283; el porqué está en `commitsAmong`. El sandbox no se puede montar acá, así que se mide la causa.
test('los shas se le pasan a git como argumentos, nunca por stdin', () => {
  const { target, sha, blob } = instance('cauce-commits-stdin-')
  const cp = require('node:child_process')
  const real = cp.spawnSync
  const fed = []
  const file = require.resolve('../../engine/core/repos')
  cp.spawnSync = (command, args, options = {}) => {
    if (options.input !== undefined) fed.push([command, ...args].join(' '))
    return real(command, args, options)
  }
  delete require.cache[file]
  try {
    const status = require(file).commitStatus(target, [
      { sha, repo: 'api' }, { sha: 'deadbee', repo: 'api' }, { sha: blob, repo: 'api' }])
    assert.deepEqual(status, ['found', 'missing', 'missing'], 'con uno falso se pregunta de a uno')
    assert.deepEqual(fed, [])
  } finally {
    cp.spawnSync = real
    delete require.cache[file]
  }
})

// Caso 356. Una tarea de planning o de documentos commitea en el repositorio de la instancia, que en sidecar
// vive al lado de las raíces de código y no es una de ellas.
test('el commit que vive en el repositorio de la propia instancia se encuentra', () => {
  const { target, sha } = instance('cauce-commits-instancia-')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'api', path: '../api' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  git(target, 'init', '-q', '-b', 'main')
  git(target, 'add', 'ops.config.json')
  git(target, 'commit', '-qm', 'instancia')
  const own = git(target, 'rev-parse', '--short', 'HEAD').stdout.trim()
  const status = (items, from = target) => R.commitStatus(from, items)

  assert.deepEqual(status([{ sha: own }, { sha: own, repo: 'demo-ops' }]), ['found', 'found'])
  // Lo que no existe sigue faltando en los dos, y el de código no se da por bueno en la instancia.
  assert.deepEqual(status([{ sha: 'deadbee' }, { sha: 'deadbee', repo: 'demo-ops' }, { sha, repo: 'demo-ops' }]),
    ['missing', 'missing', 'missing'])
  assert.deepEqual(status([{ sha, repo: 'api' }, { sha: own, repo: 'api' }, { sha: own, repo: 'otro' }]),
    ['found', 'missing', 'unchecked'], 'un nombre que es de una raíz sigue siendo de la raíz')

  // Y si una raíz se llama como la instancia, el nombre es de la raíz: es lo que el proyecto declaró.
  config.workspaceRoots = [{ name: 'demo-ops', path: '../api' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  assert.deepEqual(status([{ sha, repo: 'demo-ops' }, { sha: own, repo: 'demo-ops' }]), ['found', 'missing'])
  config.workspaceRoots = [{ name: 'api', path: '../api' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))

  // Desde una línea de trabajo la carpeta se llama distinto y el repositorio es el mismo.
  const line = `${target}-auth`
  assert.equal(git(target, 'worktree', 'add', '-q', '-b', 'line/auth', line).status, 0)
  assert.deepEqual(status([{ sha: own }, { sha: own, repo: 'demo-ops' }], line), ['found', 'found'])
})

// La forma es `<sha> <asunto> (<repo>@<rama>)`, y hay quien sigue escribiendo después del paréntesis.
test('el repositorio de una cita se lee aunque el texto siga después', () => {
  const cited = (commit) => DC.citedCommits(commit).map((one) => one.repo)
  assert.deepEqual(cited('abc1234 docs: algo (demo-ops@main) — n/a para el archivo: vive en la raíz'), ['demo-ops'])
  assert.deepEqual(cited('abc1234 fix(mail): accept (user@host) addresses (api@main)'), ['api'])
  assert.deepEqual(cited('abc1234 feat: uno (api@main; sin footer); abc1235 fix: otro'), ['api', undefined])
  // Un paréntesis con arroba en el medio del asunto no es un repositorio: lo que sigue es más asunto.
  assert.deepEqual(cited('abc1234 chore(deps): bump (lodash@4.17.21) and fix types'), [undefined])
  assert.deepEqual(cited('abc1234 fix: accept (user@example.com) addresses in login'), [undefined])
  assert.deepEqual(cited('abc1234 docs: algo (demo-ops@main): vive en la raíz'), ['demo-ops'])
})

// Con la raíz en la carpeta que contiene a los repositorios, una cita sin repositorio no se puede buscar en
// el producto. Que no esté en la instancia no dice que no exista: sigue sin poder comprobarse.
test('no encontrar en la instancia un commit sin repositorio no lo da por inexistente', () => {
  const { target, sha } = instance('cauce-commits-contenedora-')
  git(target, 'init', '-q', '-b', 'main')
  git(target, 'add', 'ops.config.json')
  git(target, 'commit', '-qm', 'instancia')
  const own = git(target, 'rev-parse', '--short', 'HEAD').stdout.trim()
  // El del producto se encuentra: los repositorios que la carpeta contiene se miran. El inventado no está
  // en ninguno de los que se miraron, y con una carpeta de por medio eso no alcanza para darlo por inexistente.
  assert.deepEqual(R.commitStatus(target, [{ sha: own }, { sha }, { sha: 'deadbee' }]),
    ['found', 'found', 'unchecked'])
  const warnings = DC.unknownCommitWarnings([entry('del-producto', `${sha} feat: algo`)],
    (items) => R.commitStatus(target, items))
  assert.deepEqual(warnings, [])
  // Un paréntesis del asunto no vuelve nombrada a la cita: sigue siendo de las que no se pueden dar por
  // inexistentes acá.
  assert.deepEqual(R.commitStatus(target, DC.citedCommits('deadbee chore(deps): bump (lodash@4.17.21) and fix')),
    ['unchecked'])

  // Con una raíz que es un repositorio y otra que es una carpeta, vale lo mismo para lo de la carpeta.
  const base = path.dirname(target)
  const group = path.join(base, 'servicios')
  fs.mkdirSync(path.join(group, 'pagos'), { recursive: true })
  git(path.join(group, 'pagos'), 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(group, 'pagos', 'p.txt'), 'x\n')
  git(path.join(group, 'pagos'), 'add', 'p.txt')
  git(path.join(group, 'pagos'), 'commit', '-qm', 'pagos')
  const paid = git(path.join(group, 'pagos'), 'rev-parse', '--short', 'HEAD').stdout.trim()
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [{ name: 'api', path: '../api' }, { name: 'servicios', path: '../servicios' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  assert.deepEqual(R.commitStatus(target, [{ sha: paid }, { sha }, { sha: 'deadbee' }]),
    ['found', 'found', 'unchecked'])
})

// Lo que sigue al paréntesis no siempre es un separador. Cuando no lo es, la cita no nombra un repositorio y
// se busca en todos los del proyecto: es lo que no esconde un hash fabricado.
test('un paréntesis que no cierra la cita no nombra un repositorio', () => {
  const { target, sha } = instance('cauce-commits-seguido-')
  const file = path.join(target, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  const base = path.dirname(target)
  fs.mkdirSync(path.join(base, 'web'))
  git(path.join(base, 'web'), 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(base, 'web', 'w.txt'), 'x\n')
  git(path.join(base, 'web'), 'add', 'w.txt')
  git(path.join(base, 'web'), 'commit', '-qm', 'web')
  const other = git(path.join(base, 'web'), 'rev-parse', '--short', 'HEAD').stdout.trim()
  config.workspaceRoots = [{ name: 'api', path: '../api' }, { name: 'web', path: '../web' }]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  // Por el mismo camino que `check`, que es quien lo usa.
  const status = (commit) => {
    let seen
    DC.unknownCommitWarnings([entry('una', commit)], (items) => (seen = R.commitStatus(target, items)))
    return seen
  }
  assert.deepEqual(DC.citedCommits(`${sha} fix: algo (api@main).`).map((one) => one.repo), ['api'])
  for (const tail of ['(revertido luego)', 'n/a parcial', '→ nota']) {
    assert.deepEqual(status(`${sha} fix: algo (api@main) ${tail}`), ['found'], tail)
    assert.deepEqual(status(`deadbee fix: algo (api@main) ${tail}`), ['missing'], tail)
  }
  // Un paréntesis del asunto que se llama como un repositorio de acá no acota la búsqueda a ése.
  assert.deepEqual(status(`${other} chore: sync client (api@v2) types`), ['found'])
  assert.deepEqual(status(`${sha} chore(deps): bump (lodash@4.17.21) and fix types`), ['found'])
  assert.deepEqual(status('deadbee chore(deps): bump (lodash@4.17.21) and fix types'), ['missing'])
  // Y el que sí la cierra, sí: el commit de otro repositorio no vale por el de `api`.
  assert.deepEqual(status(`${other} fix: algo (api@main)`), ['missing'])
})

// Una tanda con shas que no existen no manda a preguntar de a uno: se contesta con un solo proceso.
test('comprobar varios shas con ausentes en el medio cuesta un proceso, no uno por sha', () => {
  const { target, sha, blob } = instance('cauce-commits-tanda-')
  const cp = require('node:child_process')
  const real = cp.spawnSync
  let calls = 0
  const file = require.resolve('../../engine/core/repos')
  cp.spawnSync = (command, args, options) => {
    if (args.includes('rev-list') || args.includes('cat-file')) calls += 1
    return real(command, args, options)
  }
  delete require.cache[file]
  try {
    const status = require(file).commitStatus(target, [{ sha, repo: 'api' }, { sha: 'deadbee', repo: 'api' },
      { sha: blob, repo: 'api' }, { sha: 'c0ffee1', repo: 'api' }])
    assert.deepEqual(status, ['found', 'missing', 'missing', 'missing'])
    assert.equal(calls, 1)
  } finally {
    cp.spawnSync = real
    delete require.cache[file]
  }
})

// Caso 362. En una instancia embebida el servicio suele ser una carpeta del repositorio, y la entrada cita
// su commit con ese nombre: `(src@rama)`. La carpeta no es un repositorio, pero es de uno.
test('un commit citado por el nombre de un servicio que es una carpeta se busca en su repositorio', () => {
  const base = tempRoot('cauce-commits-servicio-')
  const repo = path.join(base, 'prod')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'planning'))
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'x\n')
  fs.writeFileSync(path.join(repo, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', 'src/a.js', 'ops.config.json')
  git(repo, 'commit', '-qm', 'base')
  const sha = git(repo, 'rev-parse', '--short', 'HEAD').stdout.trim()
  assert.deepEqual(R.commitStatus(repo, [{ sha, repo: 'src' }, { sha: 'deadbee', repo: 'src' }]),
    ['found', 'missing'])
  // Lo que no es ni un repositorio ni un servicio de acá sigue sin poder comprobarse.
  assert.deepEqual(R.commitStatus(repo, [{ sha, repo: 'otro-servicio' }]), ['unchecked'])
  // Tampoco una carpeta que existe y no trae nada de este repositorio: es el lugar de otro que no está
  // —sin clonar, o un repositorio anidado que una línea dejó vacío—, y no encontrar ahí su commit no dice
  // que no exista.
  fs.mkdirSync(path.join(repo, 'api'))
  assert.deepEqual(R.commitStatus(repo, [{ sha: 'abc1234', repo: 'api' }]), ['unchecked'])
  const nested = path.join(repo, 'web')
  fs.mkdirSync(nested)
  git(nested, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(nested, 'w.txt'), 'x\n')
  git(nested, 'add', 'w.txt')
  git(nested, 'commit', '-qm', 'web')
  git(repo, 'add', 'web')
  git(repo, 'commit', '-qm', 'web como enlace')
  fs.renameSync(path.join(nested, '.git'), path.join(base, 'web.git'))
  assert.deepEqual(R.commitStatus(repo, [{ sha: 'abc1234', repo: 'web' }]), ['unchecked'], 'un enlace de git vacío')
  // Y `evidence` lee del commit lo que ya no está en disco.
  const sources = R.commitSources(repo, [{ sha, repo: 'src' }], [])
  assert.equal(sources.length, 1)
  assert.match(sources[0].read(sources[0].scan.find((file) => file.endsWith('src/a.js'))), /^x/)
})
