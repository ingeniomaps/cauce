'use strict'

// El aviso OPS-001: commits desde la última tarea cerrada que ninguna entrada de DONE nombra. Su daño es
// el que el caso 082 midió —trabajo que no está en `planning/`— y hasta acá no lo cubría ninguna prueba,
// que es cómo pudo quedarse mudo un año sin que nadie lo notara (caso 169).

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const R = require('../../engine/core/repos')

// Un repositorio con un commit y la instancia al lado, que es el layout que `reposFor` recorre.
function instancia(prefijo, { abbrev }) {
  const base = tempRoot(prefijo)
  const repo = path.join(base, 'producto')
  fs.mkdirSync(repo, { recursive: true })
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-q')
  git('config', 'user.email', 'x@y.z')
  git('config', 'user.name', 'x')
  // `core.abbrev` decide cuántos caracteres mide `%h`, y git lo elige solo según el tamaño del
  // repositorio: por eso el aviso no puede depender de una posición fija.
  git('config', 'core.abbrev', String(abbrev))
  // La instancia primero: lo que se commitea antes de que exista no es trabajo que ella deba nombrar.
  const ops = path.join(base, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'producto', path: '../producto' }] }))
  fs.writeFileSync(path.join(repo, 'a.txt'), 'uno\n')
  git('add', 'a.txt')
  git('commit', '-q', '-m', 'feat: algo que nadie anotó')
  return { base, ops }
}

// El `%h` de git mide 7 por default y **sube solo** cuando el repositorio crece: en este mismo
// repositorio mide 8. El filtro leía la fecha por columna fija —`line.slice(8, 18)`—, así que con 8 leía
// un espacio y una fecha corta, que no compara igual, y con 9 o más leía la fecha corrida. El aviso
// quedaba mudo sin decirlo: cero commits sobre un repositorio lleno.
test('el aviso de commits sin anotar no depende de cuánto mida el hash abreviado', () => {
  const done = {
    entries: [{ fecha: '2000-01-01', commit: '' }],
    set: new Set(),
  }
  for (const abbrev of [7, 8, 12]) {
    const { ops } = instancia(`ops-cobertura-${abbrev}-`, { abbrev })
    const avisos = R.coverageWarnings(ops, done)
    assert.equal(avisos.length, 1, `con abbrev=${abbrev} el aviso no salió: ${JSON.stringify(avisos)}`)
    assert.match(avisos[0], /1 commit\(s\) desde 2000-01-01/, `abbrev=${abbrev}`)
  }
})

// Y la otra mitad: el commit que una entrada sí nombra no se cuenta. Sin esto, «el aviso sale» se
// cumpliría con un filtro que no filtra nada.
test('un commit que una entrada de DONE nombra no entra en el aviso', () => {
  const { ops } = instancia('ops-cobertura-anotado-', { abbrev: 8 })
  const repo = path.join(path.dirname(ops), 'producto')
  const sha = spawnSync('git', ['-C', repo, 'log', '-1', '--format=%H'], { encoding: 'utf8' }).stdout.trim()
  const done = { entries: [{ fecha: '2000-01-01', commit: sha }], set: new Set() }
  assert.deepEqual(R.coverageWarnings(ops, done), [])
})

// Caso 270. En una instancia embebida el planning vive en el repositorio del producto, y el recorrido
// commitea su estado al cerrar cada tarea: ese commit no es trabajo que el planning tenga que nombrar. El
// que toca además código sí lo es, que es lo que impide cumplir esto dejando de contar todo.
test('un commit que sólo toca el planning no cuenta como trabajo sin anotar', () => {
  const repo = tempRoot('ops-cobertura-embebida-')
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
  }
  git('init', '-q')
  git('config', 'user.email', 'x@y.z')
  git('config', 'user.name', 'x')
  fs.mkdirSync(path.join(repo, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  fs.writeFileSync(path.join(repo, 'planning', 'done', 'una.md'), 'slug: una\n')
  git('add', 'ops.config.json', 'planning/done/una.md')
  git('commit', '-q', '-m', 'chore(planning): close una')
  const done = { entries: [{ fecha: '2000-01-01', commit: '' }], set: new Set() }
  assert.deepEqual(R.coverageWarnings(repo, done), [], 'el que instala la instancia no cuenta')

  fs.writeFileSync(path.join(repo, 'planning', 'done', 'otra.md'), 'slug: otra\n')
  fs.mkdirSync(path.join(repo, 'organization'))
  fs.writeFileSync(path.join(repo, 'organization', 'company.md'), '# Empresa\n')
  git('add', 'planning/done/otra.md', 'organization/company.md')
  git('commit', '-q', '-m', 'chore(planning): close otra')
  assert.deepEqual(R.coverageWarnings(repo, done), [], 'ni el que sólo toca lo de la instancia, organization/ incluido')

  fs.writeFileSync(path.join(repo, 'a.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(repo, 'planning', 'done', 'otra.md'), 'slug: otra\nnota: x\n')
  git('add', 'a.js', 'planning/done/otra.md')
  git('commit', '-q', '-m', 'feat: algo con planning al lado')
  assert.match(R.coverageWarnings(repo, done)[0], /1 commit\(s\)/, 'el que toca código además sí')
})

// El aviso nombra los commits que cuenta, con su asunto, hasta cinco, y dice cuántos más hay: sin eso, quien lo leía
// tenía que buscarlos a mano en `git log` (caso 504).
test('el aviso nombra hasta cinco commits sin anotar y cuenta el resto', () => {
  const { ops } = instancia('ops-cobertura-nombra-', { abbrev: 7 })
  const repo = path.join(path.dirname(ops), 'producto')
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).stdout.trim()
  const done = { entries: [{ fecha: '2000-01-01', commit: '' }], set: new Set() }
  fs.writeFileSync(path.join(repo, 'b.txt'), 'dos\n')
  git('add', 'b.txt')
  git('commit', '-q', '-m', 'fix: el segundo')
  const two = R.coverageWarnings(ops, done)[0]
  for (const line of git('log', '--format=%h %s').split('\n')) assert.ok(two.includes(line), `falta «${line}»: ${two}`)
  assert.doesNotMatch(two, /más$/)
  for (const n of [3, 4, 5, 6, 7]) {
    fs.writeFileSync(path.join(repo, `${n}.txt`), `${n}\n`)
    git('add', `${n}.txt`)
    git('commit', '-q', '-m', `feat: el ${n}`)
  }
  const seven = R.coverageWarnings(ops, done)[0]
  assert.match(seven, /7 commit\(s\)/)
  assert.match(seven, /; y 2 más$/)
  const named = git('log', '--format=%h %s').split('\n')
  for (const line of named.slice(0, 5)) assert.ok(seven.includes(line), `falta «${line}»: ${seven}`)
  for (const line of named.slice(5)) assert.ok(!seven.includes(line), `sobra «${line}»: ${seven}`)
  // Un commit sin asunto se nombra por su hash, sin la fecha.
  git('commit', '-q', '--allow-empty', '--allow-empty-message', '-m', '')
  assert.match(R.coverageWarnings(ops, done)[0], new RegExp(`: ${git('log', '-1', '--format=%h')}; `))
})

// El porqué está en `bornAt`. Se mide con sus dos fuentes: el archivo sin commitear y el commit que lo agregó.
test('un commit anterior a la instancia no cuenta, aunque sea del mismo día', () => {
  const repo = tempRoot('ops-cobertura-antes-')
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).stdout.trim()
  const at = (when, ...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } })
  git('init', '-q')
  git('config', 'user.email', 'x@y.z')
  git('config', 'user.name', 'x')
  const today = new Date().toISOString().slice(0, 10)
  fs.writeFileSync(path.join(repo, 'a.js'), '1\n')
  git('add', 'a.js')
  at(`${today}T00:00:01Z`, 'commit', '-q', '-m', 'chore: initial')
  fs.mkdirSync(path.join(repo, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  const done = { entries: [{ fecha: today, commit: '' }], set: new Set() }
  assert.deepEqual(R.coverageWarnings(repo, done), [], 'sin commitear la instancia, cuenta desde su archivo')

  // Como lo deja `init` en embebido: también toca archivos del producto.
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"@ingeniomaps/cauce":"0.121.0"}}\n')
  git('add', 'ops.config.json', 'package.json')
  at(`${today}T00:00:02Z`, 'commit', '-q', '-m', 'chore: install cauce')
  fs.writeFileSync(path.join(repo, 'b.js'), '2\n')
  git('add', 'b.js')
  at(`${today}T00:00:03Z`, 'commit', '-q', '-m', 'feat: lo de después')
  const [aviso] = R.coverageWarnings(repo, done)
  assert.match(aviso, /1 commit\(s\)/, 'lo de después de instalar sí, y el que la instala no')
  assert.match(aviso, /feat: lo de después/)
  assert.doesNotMatch(aviso, /initial/, 'y el anterior no')
})

// En sidecar dentro del repositorio, la carpeta de la instancia entera es su propio estado: antes sólo se salteaba
// `ops/planning`, y un commit de `ops/organization` salía como trabajo sin registrar.
test('en sidecar dentro del repositorio, un commit que sólo toca la instancia no cuenta', () => {
  const repo = tempRoot('ops-cobertura-sidecar-adentro-')
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).stdout.trim()
  git('init', '-q')
  git('config', 'user.email', 'x@y.z')
  git('config', 'user.name', 'x')
  const ops = path.join(repo, 'ops')
  fs.mkdirSync(path.join(ops, 'organization'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }] }))
  git('add', 'ops/ops.config.json')
  git('commit', '-q', '-m', 'chore: install cauce')
  fs.writeFileSync(path.join(ops, 'organization', 'company.md'), '# Empresa\n')
  git('add', 'ops/organization/company.md')
  git('commit', '-q', '-m', 'docs(ops): onboard')
  const done = { entries: [{ fecha: '2000-01-01', commit: '' }], set: new Set() }
  assert.deepEqual(R.coverageWarnings(ops, done), [])
  fs.writeFileSync(path.join(repo, 'app.js'), '1\n')
  git('add', 'app.js')
  git('commit', '-q', '-m', 'feat: producto')
  assert.match(R.coverageWarnings(ops, done)[0], /1 commit\(s\).*feat: producto/)
})
