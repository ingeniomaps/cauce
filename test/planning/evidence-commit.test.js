'use strict'

// `ops evidence` cuando la prueba no está en disco (caso 353). En una línea de trabajo el producto es un
// enlace al original y la tarea se commitea en su rama, con el árbol retirado después: la prueba nueva sólo
// existe en ese commit, y la que ya estaba vive detrás del enlace.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// La carpeta de una línea, como la deja `ops line`: la instancia, y el producto enlazado al original, que
// sigue en su rama de siempre. La tarea se commiteó en una rama y esa rama no está puesta en ningún lado.
function line(prefix) {
  const base = tempRoot(prefix)
  const repo = path.join(base, 'original', 'api')
  fs.mkdirSync(path.join(repo, 'test'), { recursive: true })
  const git = (...args) => {
    const out = spawnSync('git', ['-C', repo, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout.trim()
  }
  const commit = (file, text, message) => {
    fs.writeFileSync(path.join(repo, file), text)
    git('add', file)
    git('commit', '-qm', message)
    return git('rev-parse', '--short=12', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  fs.mkdirSync(path.join(repo, 'docs'))
  commit('docs/RIESGOS.md', '# Riesgos\n', 'docs')
  commit('test/base.test.js', "test('devuelve el cuerpo del pedido', () => {})\n", 'base')
  git('switch', '-q', '-c', 'feat/t-uno')
  commit('docs/RIESGOS.md', '# Riesgos\n\n| bloqueo por marca sin auditar | aceptado |\n', 'docs: riesgo')
  const sha = commit('test/handler.test.js', "test('rechaza con 403 el pedido marcado', () => {})\n", 'feat: 403')
  git('switch', '-q', 'main')

  const home = path.join(base, 'linea')
  const ops = path.join(home, 'ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.symlinkSync(repo, path.join(home, 'api'), 'dir')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }] }))
  const entry = (tests, cited = `${sha} feat: 403 (api@feat/t-uno)`) => fs.writeFileSync(
    path.join(ops, 'planning', 'done', 't-uno.md'),
    `- [x] **t-uno** — Rechazo\n  acept: responde 403\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n`
    + `  qa: probado\n  tests: ${tests}\n  commit: ${cited}\n  lane: lite\n  review: aprobado\n`)
  const report = () => JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
  const text = () => run(['evidence', path.join(ops, 'planning')]).stdout
  return { ops, sha, entry, report, text }
}

const NEW = 'A → api/test/handler.test.js › «rechaza con 403 el pedido marcado» — asercia el estado'
const OLD = 'A → api/test/base.test.js › «devuelve el cuerpo del pedido» — caso existente'

test('la prueba que quedó en la rama de la tarea se encuentra en su commit, y se dice de dónde salió', () => {
  const { sha, entry, report, text } = line('cauce-353-commit-')
  entry(`${NEW}; ${OLD}`)
  const [fresh, old] = report()
  assert.equal(fresh.verdict, 'encontrado')
  assert.equal(fresh.commit, sha, 'salió del commit que la entrada nombra')
  // La que ya estaba se ve en disco, detrás del enlace al producto: no hace falta ningún commit.
  assert.equal(old.verdict, 'encontrado')
  assert.equal(old.commit, undefined)
  const shown = text()
  assert.match(shown, new RegExp(`rechaza con 403.*\\[encontrado\\].*en el commit ${sha}, no en disco`))
  assert.doesNotMatch(shown, /devuelve el cuerpo.*en el commit/)
})

// El archivo ya estaba y lo que la tarea le agregó no: en disco el contraste lo da por encontrado y avisa que
// lo citado no aparece. Eso también lo contesta el commit.
test('lo que la traza cita y el disco no tiene se busca en el commit, aunque el archivo exista', () => {
  const { entry, report } = line('cauce-353-citado-')
  entry('A → n/a — se cumple en api/docs/RIESGOS.md: «bloqueo por marca sin auditar»')
  const [doc] = report()
  assert.equal(doc.verdict, 'encontrado')
  assert.deepEqual(doc.absent, [], 'la fila está en el commit de la tarea')
  assert.match(doc.commit, /^[0-9a-f]{12}$/)

  entry('A → n/a — se cumple en api/docs/RIESGOS.md: «una fila que nadie escribió»')
  const [missing] = report()
  assert.deepEqual(missing.absent, ['una fila que nadie escribió'])
  assert.equal(missing.commit, undefined, 'y lo que tampoco está ahí se sigue diciendo, sin atribuírselo a un commit')
})

test('lo que no está en disco ni en el commit sigue ausente, y un commit que nadie conoce no inventa nada', () => {
  const { entry, report } = line('cauce-353-ausente-')
  const invented = 'A → api/test/handler.test.js › «una prueba que nadie escribió» — asercia algo'
  const nowhere = 'A → api/test/otro.test.js › «rechaza con 403 el pedido marcado» — asercia el estado'
  entry(`${invented}; ${nowhere}`)
  const [partial, absent] = report()
  assert.equal(partial.verdict, 'parcial', 'el archivo está en el commit y la prueba no')
  assert.deepEqual(partial.missing, ['una prueba que nadie escribió'])
  assert.equal(absent.verdict, 'ausente')
  assert.equal(absent.commit, undefined)

  entry(NEW, 'deadbeef1234 feat: uno que no existe (api@feat/t-uno)')
  assert.equal(report()[0].verdict, 'ausente')
  entry(NEW, 'n/a — sin commit')
  assert.equal(report()[0].verdict, 'ausente')
})

test('con varios commits en la entrada, la prueba puede estar en cualquiera', () => {
  const { sha, entry, report } = line('cauce-353-varios-')
  entry(NEW, `deadbeef1234 chore: otro; ${sha} feat: 403 (api@feat/t-uno)`)
  const [fresh] = report()
  assert.equal(fresh.verdict, 'encontrado')
  assert.equal(fresh.commit, sha)
})

// Lo que el contraste existe para atrapar es la prueba inventada, y mirar más lugares abre más formas de
// encontrarla donde no está: en el `planning/` de la propia instancia, por un commit o por un enlace.
function embedded(prefix) {
  const repo = path.join(tempRoot(prefix), 'producto')
  const ops = path.join(repo, 'ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'src'))
  const git = (...args) => {
    const out = spawnSync('git', ['-C', repo, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout.trim()
  }
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '..' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'),
    "# Backlog\n\nPendiente: escribir TestInventada y 'rechaza el pedido inventado'.\n")
  fs.writeFileSync(path.join(repo, 'src', 'b.js'), 'module.exports = 1\n')
  git('init', '-q', '-b', 'main')
  git('add', 'ops/ops.config.json', 'ops/planning/BACKLOG.md', 'src/b.js')
  git('commit', '-qm', 'feat: b')
  const sha = git('rev-parse', '--short=12', 'HEAD')
  const entry = (tests) => fs.writeFileSync(path.join(ops, 'planning', 'done', 't-uno.md'),
    `- [x] **t-uno** — B\n  acept: x\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n  qa: probado\n`
    + `  tests: ${tests}\n  commit: ${sha} feat: b\n  lane: lite\n  review: aprobado\n`)
  const verdicts = () => JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
    .map((trace) => trace.verdict)
  return { repo, ops, entry, verdicts }
}

const INVENTED = "A → TestInventada; C1 → 'rechaza el pedido inventado' y nada más"

test('una prueba inventada no se encuentra en el planning que el propio commit trae', () => {
  const { entry, verdicts } = embedded('cauce-353-planning-')
  entry(INVENTED)
  assert.deepEqual(verdicts(), ['ausente', 'ausente'])
})

test('un enlace no lleva el contraste al planning ni fuera del producto', () => {
  const { repo, ops, entry, verdicts } = embedded('cauce-353-enlaces-')
  entry(INVENTED)
  // Por otro nombre al planning, a la instancia entera, y a la raíz misma: los tres entraban.
  fs.symlinkSync(path.join(ops, 'planning'), path.join(repo, 'notas'), 'dir')
  fs.symlinkSync(ops, path.join(repo, 'instancia'), 'dir')
  fs.symlinkSync(repo, path.join(repo, 'src', 'arriba'), 'dir')
  assert.deepEqual(verdicts(), ['ausente', 'ausente'])

  // A una parte del planning, colgando directo de la raíz, y a un archivo de él.
  fs.symlinkSync(path.join(ops, 'planning', 'done'), path.join(repo, 'atajo'), 'dir')
  fs.symlinkSync(path.join(ops, 'planning', 'BACKLOG.md'), path.join(repo, 'pendientes.md'), 'file')
  assert.deepEqual(verdicts(), ['ausente', 'ausente'])

  // Y sólo se sigue el enlace que cuelga de la raíz y lleva a un repositorio, que es lo que arma `ops line`:
  // ni uno más abajo, ni uno a una carpeta cualquiera.
  const outside = path.join(path.dirname(repo), 'afuera')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'x.test.js'), "test('TestInventada', () => {})\n")
  fs.symlinkSync(outside, path.join(repo, 'src', 'vendor'), 'dir')
  fs.symlinkSync(outside, path.join(repo, 'suelta'), 'dir')
  assert.deepEqual(verdicts(), ['ausente', 'ausente'])
})

// El repositorio nombrado por un enlace, que es como lo ve la sesión de una línea: el `planning/` que el
// commit trae se reconoce igual, por su ruta real.
test('nombrado por un enlace, el planning del commit tampoco cuenta', () => {
  const { repo, ops, entry } = embedded('cauce-353-alias-')
  const alias = `${repo}-alias`
  fs.symlinkSync(repo, alias, 'dir')
  const sha = spawnSync('git', ['-C', repo, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
  entry(INVENTED)
  for (const suffix of ['', ' (main@main)', ' (producto-alias@main)']) {
    const file = path.join(ops, 'planning', 'done', 't-uno.md')
    const cited = `  commit: ${sha} feat: b${suffix}`
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^ {2}commit: .*$/m, cited))
    const seen = JSON.parse(run(['evidence', path.join(alias, 'ops', 'planning'), '--json']).stdout).traces
    assert.deepEqual(seen.map((trace) => trace.verdict), ['ausente', 'ausente'], suffix || 'sin sufijo')
  }
})

test('del commit queda afuera lo mismo que del disco, y un merge dice qué trajo', () => {
  const base = tempRoot('cauce-353-merge-')
  const repo = path.join(base, 'api')
  const ops = path.join(base, 'ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'test'), { recursive: true })
  fs.mkdirSync(path.join(repo, '.github'))
  const git = (...args) => {
    const out = spawnSync('git', ['-C', repo, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid',
      ...args], { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
    return out.stdout.trim()
  }
  const write = (file, text) => { fs.writeFileSync(path.join(repo, file), text); git('add', file) }
  git('init', '-q', '-b', 'main')
  write('README.md', '# api\n')
  git('commit', '-qm', 'base')
  git('switch', '-q', '-c', 'feat/x')
  write('test/x.test.js', "test('TestRealUnica', () => {})\n")
  write('.github/nota.md', 'Falta escribir TestInventada.\n')
  git('commit', '-qm', 'feat: x')
  git('switch', '-q', 'main')
  write('otro.md', 'x\n')
  git('commit', '-qm', 'docs: otro')
  git('merge', '-q', '--no-ff', 'feat/x', '-m', 'merge feat/x')
  const merge = git('rev-parse', '--short=12', 'HEAD')
  git('switch', '-q', '--detach', 'HEAD~1')
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'api', path: '../api' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 't.md'),
    '- [x] **t** — X\n  acept: x\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n  qa: probado\n'
    + `  tests: A → TestRealUnica; C1 → TestInventada\n  commit: ${merge} merge feat/x\n  lane: lite\n`
    + '  review: aprobado\n')
  const [real, hidden] = JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
  assert.deepEqual([real.verdict, real.commit], ['encontrado', merge], 'lo que el merge trajo se busca')
  assert.equal(hidden.verdict, 'ausente', 'una nota en una carpeta con punto no es una prueba, tampoco en el commit')
})

// Sin enlaces de por medio: una carpeta con más archivos que el tope, y las pruebas adentro. El tope se mira
// al entrar a cada carpeta, no archivo por archivo, así que la carpeta en la que ya se entró se lee entera.
test('una carpeta con más archivos que el tope se sigue leyendo entera', () => {
  const base = tempRoot('cauce-353-plana-')
  const ops = path.join(base, 'ops')
  const flat = path.join(base, 'api', 'fixtures')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.mkdirSync(flat, { recursive: true })
  for (let n = 0; n < 5200; n += 1) fs.writeFileSync(path.join(flat, `f${n}.json`), '')
  fs.writeFileSync(path.join(flat, 'zz.test.js'), "test('TestAlFinal', () => {})\n")
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'api', path: '../api' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 't.md'),
    '- [x] **t** — X\n  acept: x\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n  qa: probado\n'
    + '  tests: A → TestAlFinal\n  commit: n/a — sin commit\n  lane: lite\n  review: aprobado\n')
  const [trace] = JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
  assert.equal(trace.verdict, 'encontrado')
})

// Un enlace a un repositorio enorme llenaba el tope de archivos antes de llegar al que tiene la prueba, y la
// prueba que estaba salía ausente.
test('un repositorio enlazado grande no deja sin ver la prueba que está en otro', () => {
  const base = tempRoot('cauce-353-grande-')
  const ops = path.join(base, 'ops')
  const big = path.join(tempRoot('cauce-353-grande-destino-'), 'muchos')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  // Los dos son enlaces a un repositorio, como en la carpeta de una línea.
  const product = path.join(path.dirname(big), 'zeta')
  fs.mkdirSync(path.join(product, 'test'), { recursive: true })
  fs.mkdirSync(path.join(product, '.git'))
  fs.mkdirSync(path.join(big, '.git'), { recursive: true })
  for (let n = 0; n < 5200; n += 1) fs.writeFileSync(path.join(big, `f${n}.txt`), '')
  fs.symlinkSync(big, path.join(base, 'aaa-grande'), 'dir')
  fs.symlinkSync(product, path.join(base, 'zeta'), 'dir')
  fs.writeFileSync(path.join(product, 'test', 'a.test.js'), "test('existe', () => {})\n")
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ project: 'Demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 't.md'),
    '- [x] **t** — B\n  acept: x\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n  qa: probado\n'
    + '  tests: A → zeta/test/a.test.js › «existe» — x\n  commit: n/a — sin commit\n  lane: lite\n'
    + '  review: aprobado\n')
  const [trace] = JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
  assert.equal(trace.verdict, 'encontrado')
})

test('una palabra suelta se busca en lo que el commit tocó, no en todo su árbol', () => {
  const { sha, entry, report } = line('cauce-353-palabra-')
  // `rechaza` está en la prueba que el commit agregó; `devuelve`, en una que ya estaba y se ve en disco.
  entry('A → rechaza; C1 → devuelve; C2 → Riesgos; C3 → aceptado')
  const [touched, onDisk, untouched, elsewhere] = report()
  assert.deepEqual([touched.verdict, touched.commit], ['encontrado', sha])
  assert.deepEqual([onDisk.verdict, onDisk.commit], ['encontrado', undefined])
  assert.equal(untouched.verdict, 'encontrado', 'el archivo que el commit no tocó está en disco, detrás del enlace')
  // `aceptado` está en el árbol del commit citado, en un archivo que agregó otro commit de la rama: una
  // palabra que aparece en algún lado del repositorio no dice que esta tarea la haya escrito.
  assert.equal(elsewhere.verdict, 'ausente')
})

test('la nota del commit acompaña a todo veredicto que salió de él', () => {
  const { sha, entry, text } = line('cauce-353-nota-')
  entry('A → api/test/handler.test.js › «una prueba que nadie escribió» — x; C1 → rechaza')
  const shown = text()
  assert.match(shown, new RegExp(`\\[parcial\\].*en el commit ${sha}, no en disco`))
  assert.match(shown, new RegExp(`rechaza {2}\\[encontrado\\].*en el commit ${sha}, no en disco`))
})

test('sin repositorio nombrado, el commit se busca en las raíces que lo conocen', () => {
  const base = tempRoot('cauce-353-dos-repos-')
  const ops = path.join(base, 'ops')
  fs.mkdirSync(path.join(ops, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), '# Backlog\n')
  const make = (name, file, text) => {
    const repo = path.join(base, name)
    fs.mkdirSync(path.join(repo, 'test'), { recursive: true })
    const git = (...args) => spawnSync('git', ['-C', repo, '-c', 'user.name=P', '-c',
      'user.email=prueba@ejemplo.invalid', ...args], { encoding: 'utf8' }).stdout.trim()
    git('init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(repo, 'README.md'), `# ${name}\n`)
    git('add', 'README.md')
    git('commit', '-qm', 'base')
    git('switch', '-q', '-c', 'feat/x')
    fs.writeFileSync(path.join(repo, file), text)
    git('add', file)
    git('commit', '-qm', 'feat: x')
    const sha = git('rev-parse', '--short=12', 'HEAD')
    git('switch', '-q', 'main')
    return sha
  }
  make('api', 'test/a.test.js', "test('otra cosa', () => {})\n")
  const sha = make('web', 'test/w.test.js', "test('pinta el botón', () => {})\n")
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ project: 'Demo', mode: 'sidecar',
    workspaceRoots: [{ name: 'api', path: '../api' }, { name: 'web', path: '../web' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'done', 't.md'),
    `- [x] **t** — W\n  acept: x\n  fecha: 2026-10-09\n  done: npm test (exit 0)\n  qa: probado\n`
    + `  tests: A → web/test/w.test.js › «pinta el botón» — x\n  commit: ${sha} feat: x\n  lane: lite\n`
    + '  review: aprobado\n')
  const [trace] = JSON.parse(run(['evidence', path.join(ops, 'planning'), '--json']).stdout).traces
  assert.deepEqual([trace.verdict, trace.commit], ['encontrado', sha])
})
