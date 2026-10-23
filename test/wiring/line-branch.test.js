'use strict'

// El árbol de una línea fuera de su rama (caso 438). El motor deducía la rama del nombre de la línea y nunca miraba
// en cuál estaba el árbol: con el árbol en otra, el retiro daba por mergeado un commit que no lo estaba y lo
// desarmaba, y `ops lines` listaba una rama que el árbol no tenía y culpaba a la rama viva de no poder contar.

const { tempRoot, run, discard } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ok = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}
const json = (args) => {
  const result = run(args)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}
const linesOf = (ops) => JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8')).lines

// La instancia sidecar con un repositorio y la línea `pagos` armada sobre él, y su árbol ya pasado a otra rama con
// un commit que la viva no tiene. `drop` borra `line/pagos`, que es la forma en que la deja un renombre.
function moved(name, { drop = false } = {}) {
  const base = fs.realpathSync(tempRoot(name))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Lineas', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  const repo = path.join(base, 'pagos')
  fs.mkdirSync(repo)
  ok(repo, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(repo, 'a.js'), '\n')
  ok(repo, 'add', 'a.js'); ok(repo, 'commit', '-qm', 'init')
  json(['line', ops, 'pagos', 'pagos', '--json'])
  const tree = path.join(base, 'lines', 'pagos', 'pagos')
  ok(tree, 'switch', '-q', '-c', 'line/ana-pagos')
  fs.writeFileSync(path.join(tree, 'b.js'), '\n')
  ok(tree, 'add', 'b.js'); ok(tree, 'commit', '-qm', 'sin mergear')
  if (drop) ok(repo, 'branch', '-D', 'line/pagos')
  return { base, ops, repo, tree }
}

for (const drop of [false, true]) {
  test(`el retiro se niega con trabajo sin mergear en otra rama del árbol (${drop ? 'sin' : 'con'} line/pagos)`, () => {
    const { ops, repo, tree } = moved(`cauce-line-branch-${drop ? 'sin' : 'con'}-`, { drop })
    const dry = json(['lines', 'join', ops, 'pagos', '--json'])
    assert.deepEqual(dry.repos.map((one) => [one.merged, one.head]), [[false, 'line/ana-pagos']])
    assert.doesNotMatch(run(['lines', 'join', ops, 'pagos']).stdout, /pagos {2}llegó a/)

    const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
    assert.notEqual(applied.status, 0)
    assert.match(applied.stderr, /pagos: el árbol .* está en line\/ana-pagos, que no llegó a main/)
    assert.ok(fs.existsSync(tree), 'retiró el árbol de una línea que no había llegado')
    assert.deepEqual(linesOf(ops), { pagos: ['pagos'] }, 'sacó la declaración')
    assert.equal(ok(repo, 'branch', '--list', 'line/pagos'), drop ? '' : 'line/pagos')
  })
}

test('un árbol en HEAD separado con trabajo sin mergear tampoco se retira', () => {
  const { ops, tree } = moved('cauce-line-branch-detached-')
  ok(tree, 'switch', '-q', '--detach')
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /está en HEAD separado, que no llegó a main/)
})

// Lo que se comprueba es lo que tiene el árbol: una rama renombrada que ya llegó se retira sin volver a la de la
// línea, y la rama que queda se nombra, porque el retiro sólo borra `line/<línea>`.
test('una rama renombrada que ya llegó se retira, y la rama que queda se nombra', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-merged-', { drop: true })
  ok(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'line/ana-pagos')
  const done = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.equal(done.status, 0, done.stderr)
  assert.match(done.stdout, /pagos {2}llegó a main/)
  assert.match(done.stdout, /queda line\/ana-pagos en pagos: no es de la línea, y el retiro no la borra/)
  assert.equal(fs.existsSync(tree), false)
  assert.equal(linesOf(ops), undefined)
  assert.equal(ok(repo, 'branch', '--list', 'line/ana-pagos'), 'line/ana-pagos')
})

test('ops lines cuenta lo que tiene el árbol y dice en qué rama está', () => {
  const { ops } = moved('cauce-line-branch-list-', { drop: true })
  const repo = json(['lines', ops, '--json']).declared[0].repos[0]
  assert.deepEqual([repo.branch, repo.head, repo.ahead, repo.behind], ['line/pagos', 'line/ana-pagos', 1, 0])
  const text = run(['lines', ops]).stdout
  assert.match(text, /\(line\/pagos\) {2}el árbol está en line\/ana-pagos, no en line\/pagos {2}\+1 \/ -0/)
  assert.doesNotMatch(text, /sin rama viva contra qué contar/)
})

test('dos líneas sobre el mismo repositorio ven el solape aunque una esté en otra rama', () => {
  const { ops, tree } = moved('cauce-line-branch-overlap-', { drop: true })
  json(['line', ops, 'otra', 'pagos', '--json'])
  const other = path.join(path.dirname(path.dirname(tree)), 'otra', 'pagos')
  fs.writeFileSync(path.join(other, 'b.js'), '// otra\n')
  ok(other, 'add', 'b.js'); ok(other, 'commit', '-qm', 'otra')
  assert.deepEqual(json(['lines', ops, '--json']).overlaps,
    [{ repo: 'pagos', lines: ['pagos', 'otra'], files: ['b.js'] }])
})

test('ops line avisa cuando reusa un árbol que está en otra rama', () => {
  const { ops } = moved('cauce-line-branch-reuse-')
  const again = json(['line', ops, 'pagos', 'pagos', '--json'])
  assert.match(again.warnings.join('\n'), /pagos: el árbol está en line\/ana-pagos, no en line\/pagos/)
})

// Una carpeta que quedó sin su `.git` no es un árbol, y `git -C` sube hasta el repositorio que la contiene: con la
// carpeta de sesión versionada, contestaba con la rama de ése y el retiro mandaba a crear ramas ahí.
test('una carpeta de la línea que ya no es un árbol no se retira ni se lee como el repositorio de arriba', () => {
  const { base, ops, tree } = moved('cauce-line-branch-broken-')
  ok(base, 'init', '-q', '-b', 'sesion')
  fs.rmSync(path.join(tree, '.git'))
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /pagos: git no dice qué commit tiene .*: no es un árbol, o no tiene commits/)
  assert.doesNotMatch(applied.stderr, /sesion/)
  const text = run(['lines', ops]).stdout
  assert.match(text, /git no dice qué commit tiene/)
  assert.doesNotMatch(text, /sesion/)
})

// La segunda revisión del caso 438. Una carpeta borrada sigue registrada en git con su HEAD, y ese HEAD es lo que el
// retiro tiene que mirar: borrarla no puede volver a dejar pasar el trabajo de otra rama.
test('con la carpeta del árbol borrada, el retiro mira el HEAD que git tiene registrado', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-gone-')
  discard(tree)
  const early = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(early.status, 0)
  assert.match(early.stderr, /está en line\/ana-pagos, que no llegó a main/)
  ok(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'line/ana-pagos')
  const done = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.equal(done.status, 0, done.stderr)
  assert.match(done.stdout, /queda line\/ana-pagos en pagos/)
  assert.doesNotMatch(ok(repo, 'worktree', 'list'), /lines\/pagos\/pagos/, 'quedó registrado el árbol borrado')
})

test('el rechazo dice qué hacer con la rama del árbol', () => {
  const { ops } = moved('cauce-line-branch-advice-', { drop: true })
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.match(applied.stderr, /mergeá line\/ana-pagos a main —por PR, como cualquier rama— y volvé a retirarla/)
})

test('lo que la rama de la línea tiene sin mergear sigue contando para el solape aunque el árbol se haya ido', () => {
  const { ops, tree } = moved('cauce-line-branch-left-')
  ok(tree, 'switch', '-q', 'line/pagos')
  fs.writeFileSync(path.join(tree, 'c.js'), '\n')
  ok(tree, 'add', 'c.js'); ok(tree, 'commit', '-qm', 'en la rama de la línea')
  ok(tree, 'switch', '-q', '-c', 'foo', 'main')
  json(['line', ops, 'otra', 'pagos', '--json'])
  const other = path.join(path.dirname(path.dirname(tree)), 'otra', 'pagos')
  fs.writeFileSync(path.join(other, 'c.js'), '// otra\n')
  ok(other, 'add', 'c.js'); ok(other, 'commit', '-qm', 'otra')
  assert.deepEqual(json(['lines', ops, '--json']).overlaps,
    [{ repo: 'pagos', lines: ['pagos', 'otra'], files: ['c.js'] }])
})

test('ops line avisa al reusar una carpeta que ya no es un árbol, y un árbol sin commits no se retira', () => {
  const { ops, tree } = moved('cauce-line-branch-unreadable-')
  ok(tree, 'switch', '-q', '--orphan', 'vacia')
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /pagos: git no dice qué commit tiene .*: no es un árbol, o no tiene commits/)
  fs.rmSync(path.join(tree, '.git'))
  const again = json(['line', ops, 'pagos', 'pagos', '--json'])
  assert.match(again.warnings.join('\n'), /pagos: git no dice qué commit tiene/)
})

// Las dos lecturas, en el mismo proceso: las pruebas de arriba las ejercen por el CLI.
test('treeAt y registeredAt leen rama y commit, y no contestan por otra carpeta', () => {
  const LN = require('../../engine/planning/lines')
  const base = fs.realpathSync(tempRoot('cauce-line-branch-unit-'))
  const repo = path.join(base, 'repo')
  fs.mkdirSync(repo)
  ok(repo, 'init', '-q', '-b', 'main')
  ok(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
  const commit = ok(repo, 'rev-parse', 'HEAD')
  ok(repo, 'worktree', 'add', '-q', '-b', 'line/pagos', path.join(base, 'pagos'))
  ok(repo, 'worktree', 'add', '-q', '--detach', path.join(base, 'suelto'))
  assert.deepEqual(LN.treeAt(path.join(base, 'pagos')), { branch: 'line/pagos', commit })
  assert.deepEqual(LN.treeAt(path.join(base, 'suelto')), { branch: '', commit })
  fs.mkdirSync(path.join(repo, 'adentro'))
  assert.equal(LN.treeAt(path.join(repo, 'adentro')), null, 'contestó por el repositorio de arriba')
  assert.equal(LN.treeAt(path.join(base, 'no-esta')), null)

  discard(path.join(base, 'pagos'))
  discard(path.join(base, 'suelto'))
  assert.deepEqual(LN.registeredAt(repo, path.join(base, 'pagos')),
    { branch: 'line/pagos', commit, path: path.join(base, 'pagos') })
  assert.deepEqual(LN.registeredAt(repo, path.join(base, 'suelto')),
    { branch: '', commit, path: path.join(base, 'suelto') })
  assert.equal(LN.registeredAt(repo, path.join(base, 'otro')), null)
  assert.equal(LN.registeredAt(path.join(base, 'no-esta'), path.join(base, 'pagos')), null)
  assert.equal(LN.ownRoot(path.join(base, 'no-esta'), path.join(base, 'no-esta')), true)
})

// La tercera revisión del caso 438: el camino de un árbol cuya carpeta se borró y que git sigue teniendo registrado.
test('ops line no rearma un árbol borrado si su registro tiene trabajo que no llegó', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-replant-')
  ok(tree, 'switch', '-q', '--detach')
  const commit = ok(tree, 'rev-parse', 'HEAD')
  discard(tree)
  const again = run(['line', ops, 'pagos', 'pagos'])
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, new RegExp(`estaba en el commit ${commit.slice(0, 12)}, que no llegó a main`))
  assert.match(ok(repo, 'worktree', 'list', '--porcelain'), new RegExp(`HEAD ${commit}`), 'se perdió el registro')
})

test('con la carpeta borrada y en HEAD separado, el rechazo nombra el commit', () => {
  const { ops, tree } = moved('cauce-line-branch-sha-')
  ok(tree, 'switch', '-q', '--detach')
  const commit = ok(tree, 'rev-parse', 'HEAD')
  discard(tree)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, new RegExp(`mergeá el commit ${commit.slice(0, 12)} a main`))
})

test('si git no deja sacar el registro de un árbol borrado, el retiro no se da por hecho', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-locked-', { drop: true })
  ok(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'line/ana-pagos')
  ok(repo, 'worktree', 'lock', tree)
  discard(tree)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /git worktree remove falló en pagos/)
  assert.deepEqual(linesOf(ops), { pagos: ['pagos'] }, 'sacó la declaración con el árbol todavía registrado')
})

test('un árbol borrado sin commits no tiene nada que perder, y no se manda a mergear', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-orphan-gone-')
  ok(tree, 'switch', '-q', '--orphan', 'vacia')
  discard(tree)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  assert.doesNotMatch(applied.stdout + applied.stderr, /mergeá vacia/)
  assert.doesNotMatch(ok(repo, 'worktree', 'list'), /lines\/pagos\/pagos/)
})

// La cuarta revisión: lo que se le dice a quien tiene un árbol borrado tiene que llevarlo a algo que funcione.
test('ops line no se da por hecho si git no suelta el registro del árbol borrado', () => {
  const { ops, repo, tree } = moved('cauce-line-branch-plant-locked-')
  ok(tree, 'switch', '-q', 'line/pagos')
  ok(repo, 'worktree', 'lock', tree)
  discard(tree)
  const again = run(['line', ops, 'pagos', 'pagos'])
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /git worktree remove falló en pagos/)
})

test('el rechazo de ops line dice una salida que funciona, con la ruta citada', () => {
  const { ops, tree } = moved('cauce-line-branch-plant-advice-')
  ok(tree, 'switch', '-q', '--detach')
  discard(tree)
  const again = run(['line', ops, 'pagos', 'pagos'])
  assert.match(again.stderr, /guardalo en una rama y mergeala a main/)
  assert.match(again.stderr, /worktree remove -f -f /)
})

test('ops lines dice en qué estaba un árbol borrado, en vez de mandar a rearmarlo', () => {
  const { ops, tree } = moved('cauce-line-branch-list-gone-')
  discard(tree)
  const text = run(['lines', ops]).stdout
  assert.match(text, /falta el árbol, que estaba en line\/ana-pagos sin llegar a main: mergealo antes de rearmarlo/)
  assert.doesNotMatch(text, /falta el árbol: ops line lo vuelve a armar/)
})

test('un árbol sin commits retirado no nombra una rama que no existe', () => {
  const { ops, tree } = moved('cauce-line-branch-orphan-name-')
  ok(tree, 'switch', '-q', '--orphan', 'vacia')
  discard(tree)
  const applied = run(['lines', 'join', ops, 'pagos', '--apply'])
  assert.equal(applied.status, 0, applied.stderr)
  assert.doesNotMatch(applied.stdout, /queda vacia/)
})

test('sin rama viva, ops line no manda a mergear a una rama que no hay', () => {
  const base = fs.realpathSync(tempRoot('cauce-line-branch-nolive-'))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Lineas', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  const repo = path.join(base, 'pagos')
  fs.mkdirSync(repo)
  ok(repo, 'init', '-q', '-b', 'trunk')
  ok(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
  json(['line', ops, 'pagos', 'pagos', '--json'])
  const tree = path.join(base, 'lines', 'pagos', 'pagos')
  ok(tree, 'switch', '-q', '-c', 'feature')
  ok(tree, 'commit', '-q', '--allow-empty', '-m', 'trabajo')
  discard(tree)
  const again = run(['line', ops, 'pagos', 'pagos'])
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /no hay rama viva contra qué comprobarlo/)
  assert.doesNotMatch(again.stderr, /mergeá/)
})
