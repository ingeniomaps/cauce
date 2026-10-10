'use strict'

// Lo que la revisión del 364 encontró en el aviso de `check` sobre lo que un runner instala con la ruta de
// la carpeta escrita. El caso de base —qué entra a git y qué no— está en `lines.test.js`.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function embedded(name, folder = 'prod') {
  const repo = path.join(tempRoot(name), folder)
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  assert.equal(run(['init', repo, '--name', 'Embebida', '--mode', 'embedded', '--force']).status, 0)
  linkEngine(repo)
  const install = (dir = repo) => assert.equal(run(['automation', 'install', dir, 'claude']).status, 0)
  // La instancia anterior al 364: su `.gitignore` no trae las líneas que el molde agregó.
  const before364 = () => {
    const ignore = path.join(repo, '.gitignore')
    fs.writeFileSync(ignore, fs.readFileSync(ignore, 'utf8').split('\n')
      .filter((one) => !one.startsWith('.claude/workflows') && !one.startsWith('.agents/')).join('\n'))
  }
  return { repo, git, install, before364 }
}

const warningsAt = (planning, about) => JSON.parse(run(['check', planning, '--json']).stdout).warnings
  .filter((one) => about.test(one))
const BOUND = /ruta de esta carpeta/
const ABSENT = /no viajan por git/

test('una carpeta con acentos en la ruta no hace avisar de lo que git ya ignora', () => {
  const { repo, git, install } = embedded('cauce-ruta-acento-', 'josé')
  install()
  // La precondición: es git el que escribe la ruta con escapes, y por eso no coincidía con la nuestra.
  const quoted = git('check-ignore', '--', path.join(repo, '.claude', 'workflows', 'autobuild.js')).stdout
  assert.match(quoted, /\\303\\251/)
  assert.deepEqual(warningsAt(path.join(repo, 'planning'), BOUND), [])
})

test('por un enlace a la instancia, el aviso dicta las mismas líneas que por la ruta real', () => {
  const { repo, git, install, before364 } = embedded('cauce-ruta-enlace-')
  install()
  before364()
  git('add', '.'); git('commit', '-qm', 'recorridos en git')
  const link = path.join(path.dirname(repo), 'via-link')
  fs.symlinkSync(repo, link, 'dir')
  const [real] = warningsAt(path.join(repo, 'planning'), BOUND)
  const [linked] = warningsAt(path.join(link, 'planning'), BOUND)
  assert.match(real, /\(\.claude\/workflows\/\).*git rm -r --cached \.claude\/workflows\//s)
  assert.equal(linked, real)
})

test('un recorrido propio que lleva la ruta entra en el aviso, y la carpeta se dicta entera', () => {
  const { repo, install, before364 } = embedded('cauce-ruta-propio-')
  fs.mkdirSync(path.join(repo, 'workflows'))
  fs.writeFileSync(path.join(repo, 'workflows', 'mine.js'), "const ROOT = '{{OPS_ROOT}}'\nreturn ROOT\n")
  fs.writeFileSync(path.join(repo, 'workflows', 'plain.js'), 'return 1\n')
  install()
  before364()
  const generated = fs.readFileSync(path.join(repo, '.claude', 'workflows', 'mine.js'), 'utf8')
  assert.ok(generated.includes(`'${repo}'`), 'la precondición: el propio quedó con la ruta escrita')
  const [warning, ...rest] = warningsAt(path.join(repo, 'planning'), BOUND)
  assert.deepEqual(rest, [])
  assert.match(warning, /^10 archivo\(s\)/, 'los nueve de Cauce y el propio que lleva la ruta')
  // El propio que no la lleva también es generado, así que no impide dictar la carpeta.
  assert.match(warning, /\(\.claude\/workflows\/\)/)
  // Un archivo que no generó nadie sí impide dictar la carpeta: ignorarla lo sacaría de git a él.
  fs.writeFileSync(path.join(repo, '.claude', 'workflows', 'a-mano.js'), 'return 2\n')
  assert.match(warningsAt(path.join(repo, 'planning'), BOUND)[0], /workflows\/autobuild\.js.*workflows\/mine\.js/s)
})

test('el clon que no recibió los recorridos por git lo lee en check, con el comando que los rehace', () => {
  const { repo, git, install } = embedded('cauce-ruta-clon-')
  install()
  git('add', '.'); git('commit', '-qm', 'instancia')
  assert.deepEqual(warningsAt(path.join(repo, 'planning'), ABSENT), [], 'donde se instaló no falta nada')
  const clone = path.join(path.dirname(repo), 'clon')
  assert.equal(spawnSync('git', ['clone', '-q', repo, clone], { encoding: 'utf8' }).status, 0)
  linkEngine(clone)
  assert.ok(fs.existsSync(path.join(clone, '.claude', 'settings.json')), 'la configuración sí viajó')
  const [warning, ...rest] = warningsAt(path.join(clone, 'planning'), ABSENT)
  assert.deepEqual(rest, [])
  assert.match(warning, /claude.*9 archivo\(s\).*automation install \. claude/s)
  install(clone)
  assert.deepEqual(warningsAt(path.join(clone, 'planning'), ABSENT), [])
  assert.deepEqual(warningsAt(path.join(clone, 'planning'), BOUND), [])
})

test('una configuración de runner que Cauce no instaló no hace avisar de recorridos que faltan', () => {
  const { repo } = embedded('cauce-ruta-ajena-')
  fs.mkdirSync(path.join(repo, '.claude'))
  fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), '{}\n')
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)
  assert.deepEqual(warningsAt(path.join(repo, 'planning'), ABSENT), [])
})
