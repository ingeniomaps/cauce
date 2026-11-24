'use strict'

// Caso 532: `doctor` de Claude dice cuánto carga una sesión entera —usuario, proyecto y Cauce—, en caracteres, contra
// el piso del aviso de Claude Code. Del archivo del usuario sólo se cuenta el largo.

const { tempRoot, linkEngine } = require('../support/environment')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const SL = require('../../engine/automation/session-load')

function world() {
  const base = tempRoot('cauce-carga-')
  const home = path.join(base, 'home')
  const dir = path.join(base, 'proyecto', 'sesion')
  const ops = path.join(dir, 'ops')
  const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
  write(path.join(home, '.claude', 'CLAUDE.md'), `SECRETO-DEL-USUARIO ${'u'.repeat(100)}\n@~/.claude/extra.md\n`)
  write(path.join(home, '.claude', 'extra.md'), 'e'.repeat(50))
  write(path.join(base, 'proyecto', 'CLAUDE.md'), `${'a'.repeat(30)}<!-- ${'z'.repeat(500)} -->`)
  // El de la empresa, con el bloque de reglas que `doctor` le pide marcar: lo de alrededor es de ella.
  write(path.join(dir, 'CLAUDE.md'), `${'k'.repeat(70)}\n<!-- cauce:reglas inicio — lo reescribe install -->\n`
    + '@ops/AGENTS.md\n@ops/planning/rules/system/process.md\n<!-- cauce:reglas fin -->\n'
    + '```md\n@ops/no-se-carga.md\n```\n'
    + 'Ver `@ops/tampoco.md` y escribí a a@ops/tampoco.md.\n@ops/AGENTS.md\n@ops/README @ops/Mi\\ Guia.md\n'
    + '@ops/compartido.md\n@ops/enlace.md\n')
  write(path.join(ops, 'AGENTS.md'), `${'p'.repeat(200)}\n@./uno.md\n`)
  const chain = ['uno', 'dos', 'tres', 'cuatro', 'cinco']
  chain.slice(0, -1).forEach((name, n) =>
    write(path.join(ops, `${name}.md`), `${'x'.repeat(10)}\n@./${chain[n + 1]}.md\n`))
  write(path.join(ops, 'cinco.md'), 'demasiado hondo')
  // Alcanzado en el salto 1 y en el 4: cuenta en el 1, así que lo que importa también entra.
  write(path.join(ops, 'tres.md'), `${'x'.repeat(10)}\n@./cuatro.md\n@./compartido.md\n`)
  write(path.join(ops, 'compartido.md'), '@./hoja.md\n')
  write(path.join(ops, 'hoja.md'), 'h')
  fs.symlinkSync(path.join(ops, 'hoja.md'), path.join(ops, 'enlace.md'))
  write(path.join(ops, 'README'), 'r'.repeat(20))
  write(path.join(ops, 'Mi Guia.md'), 'g'.repeat(5))
  write(path.join(ops, 'no-se-carga.md'), 'n')
  write(path.join(ops, 'tampoco.md'), 't')
  write(path.join(ops, 'planning', 'rules', 'system', 'process.md'), 'r'.repeat(400))
  write(path.join(dir, '.claude', 'rules', 'sin-paths.md'), '# Regla\n')
  write(path.join(dir, '.claude', 'rules', 'sub', 'honda.md'), '# Honda\n')
  write(path.join(dir, '.claude', 'rules', 'con-paths.md'), '---\npaths: src/**\n---\n# Regla\n')
  // Lo que `init` anota de lo que entregó: el `AGENTS.md` es de Cauce mientras siga como se anotó.
  const M = require('../../engine/core/manifest')
  M.write(ops, M.recordPaths(ops, ['AGENTS.md']), {}, {})
  return { home, dir, ops, base }
}

test('cuenta lo que carga Claude Code al arrancar, una vez cada archivo y en su salto más corto', () => {
  const { home, dir, ops, base } = world()
  const files = SL.loadedFiles(dir, { home, opsRoot: ops })
  const names = files.map((one) => path.relative(base, one.file))
  for (const one of [path.join('home', '.claude', 'extra.md'), path.join('proyecto', 'CLAUDE.md')]) {
    assert.ok(names.includes(one), one)
  }
  for (const one of ['tres.md', 'hoja.md', 'README', 'Mi Guia.md', 'sin-paths.md', 'honda.md']) {
    assert.ok(names.some((name) => name.endsWith(one)), one)
  }
  for (const gone of ['no-se-carga.md', 'tampoco.md', 'cuatro.md', 'con-paths.md', 'enlace.md']) {
    assert.ok(!names.some((name) => name.endsWith(gone)), gone)
  }
  assert.equal(names.filter((one) => one.endsWith('AGENTS.md')).length, 1, 'un archivo importado dos veces cuenta una')
  const of = (name) => files.find((one) => path.basename(one.file) === name)
  assert.equal(of('extra.md').user, 50)
  assert.equal(files.find((one) => one.file === path.join(base, 'proyecto', 'CLAUDE.md')).project, 30,
    'el comentario HTML no cuenta')
  assert.equal(of('AGENTS.md').cauce, of('AGENTS.md').chars, 'el AGENTS.md de la instancia es de Cauce')
  assert.equal(of('process.md').cauce, 400)
  const shared = files.find((one) => one.file === path.join(dir, 'CLAUDE.md'))
  assert.ok(shared.project > 70 && shared.cauce > 40, 'el compartido se parte por el bloque de Cauce')
})

test('un archivo del sistema es de Cauce mientras siga como se anotó, con su bloque; editado, se parte', () => {
  const { home, dir, ops } = world()
  const M = require('../../engine/core/manifest')
  const agents = path.join(ops, 'AGENTS.md')
  const of = () => SL.loadedFiles(dir, { home, opsRoot: ops }).find((one) => one.file === fs.realpathSync(agents))
  // `install` mete su bloque y vuelve a anotar el archivo: sigue siendo todo de Cauce.
  fs.appendFileSync(agents, '<!-- cauce:codex inicio -->\nbloque\n<!-- cauce:codex fin -->\n')
  M.write(ops, M.recordPaths(ops, ['AGENTS.md']), {}, {})
  assert.deepEqual([of().project || 0, of().cauce], [0, of().chars])
  // La empresa le agrega lo suyo: eso es del proyecto, y el bloque sigue siendo de Cauce.
  fs.appendFileSync(agents, `${'e'.repeat(40)}\n`)
  assert.deepEqual([of().project, of().cauce], [of().chars - '\nbloque\n'.length, '\nbloque\n'.length])
  // Sin anotar —el que la empresa ya tenía y `init --force` conservó— tampoco es de Cauce.
  M.write(ops, {}, {}, {})
  assert.equal(of().cauce, '\nbloque\n'.length)
})

test('el CLAUDE.md que install entregó y nadie tocó es de Cauce entero, con su bloque de reglas adentro', () => {
  const { home, dir, ops } = world()
  const file = path.join(dir, 'CLAUDE.md')
  const delivered = new Set([fs.realpathSync(file)])
  const runner = SL.loadedFiles(dir, { home, opsRoot: ops, delivered })
    .find((one) => one.file === fs.realpathSync(file))
  assert.deepEqual([runner.project || 0, runner.cauce], [0, runner.chars])
})

test('la línea da el total, las tres partes y los dos pisos, y nunca el contenido del usuario', () => {
  const { home, dir, ops } = world()
  const line = SL.loadLine(dir, { home, opsRoot: ops })
  assert.match(line, /carga [\d.]+ caracteres de instrucciones en \d+ archivo\(s\): [\d.]+ del usuario, /)
  assert.match(line, /[\d.]+ del proyecto y [\d.]+ de Cauce\. Claude Code avisa pasado 120\.000; con una ventana/)
  assert.doesNotMatch(line, /SECRETO-DEL-USUARIO|ya lo pasa|de a uno/)
  // Un archivo que pasa su propio piso se avisa aparte y no suma al total.
  fs.writeFileSync(path.join(ops, 'AGENTS.md'), 'p'.repeat(SL.FLOOR + 1))
  const alone = SL.loadLine(dir, { home, opsRoot: ops })
  assert.match(alone, /; 1 archivo\(s\) pasan los 40\.000 de a uno, que avisa aparte y no suma al total;/)
  assert.doesNotMatch(alone, /ya lo pasa/)
  fs.writeFileSync(path.join(ops, 'AGENTS.md'), 'p')
  for (const rule of ['sin-paths.md', path.join('sub', 'honda.md')]) {
    fs.writeFileSync(path.join(dir, '.claude', 'rules', rule), 'q'.repeat(39000))
  }
  fs.writeFileSync(path.join(ops, 'compartido.md'), 'q'.repeat(39000))
  fs.writeFileSync(path.join(ops, 'planning', 'rules', 'system', 'process.md'), 'q'.repeat(39000))
  assert.match(SL.loadLine(dir, { home, opsRoot: ops }), /avisa pasado 120\.000, y esto ya lo pasa;/)
})

test('doctor de Claude imprime la línea, y el de otro runner no', () => {
  const base = tempRoot('cauce-carga-doctor-')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  const home = path.join(base, 'home')
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'SECRETO-DEL-USUARIO\n')
  fs.mkdirSync(workspace)
  const env = { ...process.env, HOME: home }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const cli = (args) => spawnSync(process.execPath, [path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js'),
    ...args], { encoding: 'utf8', env })
  assert.equal(spawnSync('git', ['init', '-q', workspace]).status, 0)
  assert.equal(cli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  for (const runner of ['claude', 'gemini']) {
    assert.equal(cli(['automation', 'install', target, runner]).status, 0, runner)
  }
  const claude = cli(['automation', 'doctor', target, 'claude'])
  assert.match(claude.stdout, /una sesión abierta en la carpeta del runner carga [\d.]+ caracteres de instrucciones/)
  assert.match(claude.stdout, /archivo\(s\): 20 del usuario,/, 'sólo el largo del archivo del usuario')
  assert.match(claude.stdout, /20 del usuario, 0 del proyecto y [\d.]+ de Cauce/,
    'una instancia recién instalada no trae instrucciones propias: todo lo demás es de Cauce')
  assert.doesNotMatch(claude.stdout + claude.stderr, /SECRETO-DEL-USUARIO/)
  const gemini = cli(['automation', 'doctor', target, 'gemini'])
  assert.equal(gemini.status, 0, 'el doctor de Gemini llega al final')
  assert.doesNotMatch(gemini.stdout, /caracteres de instrucciones/)
})

test('en una instancia embebida, lo que la empresa escribió en su CLAUDE.md cuenta como del proyecto', () => {
  const base = tempRoot('cauce-carga-embebida-')
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(home, '.codex'))
  const env = { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const cli = (args) => spawnSync(process.execPath, [path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js'),
    ...args], { encoding: 'utf8', env })
  fs.mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0)
  assert.equal(cli(['init', repo, '--name', 'P', '--mode', 'embedded', '--no-install']).status, 0)
  linkEngine(repo)
  const own = `# Nuestro proyecto\n\n${'n'.repeat(300)}\n`
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), own)
  // Codex mete su bloque en el `AGENTS.md` que entregó Cauce: lo de alrededor sigue siendo de Cauce.
  for (const runner of ['claude', 'codex']) assert.equal(cli(['automation', 'install', repo, runner]).status, 0, runner)
  const doctor = cli(['automation', 'doctor', repo, 'claude'])
  const project = Number((doctor.stdout.match(/ ([\d.]+) del proyecto/) || [])[1].replace(/\./g, ''))
  assert.equal(project, own.length, 'del proyecto es exactamente lo que escribió la empresa')
})

test('en una embebida sin CLAUDE.md propio, el AGENTS.md entregado sigue siendo de Cauce con dos runners', () => {
  const base = tempRoot('cauce-carga-embebida-sola-')
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true })
  const env = { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const cli = (args) => spawnSync(process.execPath, [path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js'),
    ...args], { encoding: 'utf8', env })
  fs.mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0)
  assert.equal(cli(['init', repo, '--name', 'P', '--mode', 'embedded', '--no-install']).status, 0)
  linkEngine(repo)
  for (const runner of ['claude', 'codex']) assert.equal(cli(['automation', 'install', repo, runner]).status, 0, runner)
  const line = cli(['automation', 'doctor', repo, 'claude']).stdout
  assert.match(line, / 0 del usuario, 0 del proyecto y [\d.]+ de Cauce/,
    'el AGENTS.md entregado no pasa al proyecto')
  assert.match(line, /en [3-9]\d* archivo\(s\)/, 'la sesión carga el AGENTS.md, así que la prueba lo mira')
})
