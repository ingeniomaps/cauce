'use strict'

// Dónde cae un commit escrito dentro de un bloque, y lo que dos formas de comillas le hacían a un heredoc (caso 474).

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { tempRoot } = require('../support/environment')
const I = require('../../engine/hooks/input')
const { directoriesOf } = require('../../engine/hooks/commit-repo')

// Lo que hay detrás de una palabra de bloque también corre, y una función puede correr en cualquier carpeta (caso 474).
test('un commit dentro de un bloque o una función se juzga donde puede caer', () => {
  const root = tempRoot('ops-bloque-')
  const other = tempRoot('ops-bloque-otro-')
  const at = (command) => directoriesOf(command, root)
  for (const opener of ['then', 'else', 'elif', 'do', '{', '!']) {
    assert.equal(I.isCommit(`x; ${opener} git commit -m y`), true, opener)
  }
  assert.equal(I.isCommit('if git commit -m y; then :; fi'), true)
  assert.equal(I.isCommit('f() { git commit -m y; }'), true)
  assert.equal(I.isCommit('function f { git commit -m y; }'), true)
  assert.equal(I.isCommit('echo then git commit'), false)
  assert.equal(I.isCommit('# 2) git commit\nls'), false, 'un paréntesis suelto es prosa')
  assert.equal(I.isCommit('echo "=== (2/3) git commit ==="'), false)
  assert.equal(I.isCommit('git status; then-git commit'), false)
  assert.deepEqual(at(`cd ${root} && cd ${other} && if [ -f a ]; then git commit -m x; fi`), [other])
  assert.deepEqual(at(`if cd ${other}; then git commit -m x; fi`), [other])
  assert.deepEqual(at(`while cd ${other}; do git commit -m x; done`), [other])
  assert.deepEqual(at(`pushd ${other}; if true; then git commit -m x; fi; popd`), [other])
  assert.deepEqual(at(`commit() { git commit -m x; }; cd ${other}; commit`), [root, other], 'una función duda')
  assert.deepEqual(at(`function commit { git commit -m x; }; cd ${other}; commit`), [root, other])
  assert.deepEqual(at(`if true; then git commit -m x; fi; cd ${other}`), [root], 'sin función, un cd posterior no')
  assert.deepEqual(at(`git commit -m "f() { git commit; }"; cd ${other}`), [root], 'una función citada no cuenta')
  assert.deepEqual(at(`r() { echo x; }; git commit -m x; cd ${other}`), [root], 'ni una que no commitea')
  assert.deepEqual(at(`r() { x commit; git status; }; git commit -m x; cd ${other}`), [root], 'commit antes del git')
})

// Sin un comando que la cree de verdad, un `mkdir` cualquiera no vuelve seguro que el `cd` entre (caso 477).
test('crear otra carpeta no da por entrado un cd a una que no existe', () => {
  const root = tempRoot('ops-cd-crea-')
  const missing = path.join(tempRoot('ops-cd-crea-otro-'), 'no')
  const at = (command) => directoriesOf(command, root)
  assert.ok(at(`mkdir -p dist; cd ${missing} && make; git commit -m x`).includes(root))
  assert.deepEqual(at(`mkdir -p ${missing}; cd ${missing} && make; git commit -m x`), [missing])
  assert.deepEqual(at(`mkdir -p "$S/z"; cd ${missing} && make; git commit -m x`), [missing], 'con variable, puede')
  assert.deepEqual(at(`git clone u no; cd ${missing} && make; git commit -m x`), [missing])
  assert.ok(at(`git clone u otra; cd ${missing} && make; git commit -m x`).includes(root))
})

test('leer una función con muchos git no vuelve atrás', () => {
  const started = Date.now()
  directoriesOf(`git commit -m x; ${'f() { git '.repeat(1600)}`, tempRoot('ops-costo-'))
  assert.ok(Date.now() - started < 3000)
})

test('un cd que no entra y deja correr el commit no se da por movido', () => {
  const root = tempRoot('ops-cd-falla-')
  const other = tempRoot('ops-cd-falla-otro-')
  const missing = path.join(other, 'no')
  const at = (command) => directoriesOf(command, root)
  assert.ok(at(`cd ${missing} && git status; git commit -m x`).includes(root), 'el commit corre en la de antes')
  assert.deepEqual(at(`cd ${other} && git status; git commit -m x`), [other], 'si existe, entra')
  assert.deepEqual(at(`cd ${missing} && git commit -m x`), [missing], 'encadenado, si no entra no corre')
  assert.deepEqual(at(`mkdir ${missing} && cd ${missing} && git status; git commit -m x`), [missing], 'lo crea antes')
  const braces = `mkdir -p ${other}/{no,b} && cd ${missing} && git status; git commit -m x`
  assert.deepEqual(at(braces), [missing], 'con otra forma')
  const unknown = 'cd "$X" && git status; git commit -m x'
  assert.deepEqual(at(unknown), [path.join(root, '$X')], 'una variable se da por hecha')
  assert.deepEqual(at(`git init -q ${missing}; cd ${missing} && git status; git commit -m x`), [missing])
})

// Sin `$'…'`, el `\'` abría una comilla que se llevaba el heredoc. Sin cierre el cuerpo sigue a la vista: leer hasta
// el final escondería lo que sigue a un `$((1 << n))`, que se ve igual.
test('una cadena $ no desfasa el heredoc, y uno sin cerrar no esconde nada', () => {
  const read = (command) => I.commandOf({ tool_input: { command } })
  assert.doesNotMatch(read(`printf $'don\\'t' > m\ncat > n <<'EOF'\ncita git push -f\nEOF`), /git push/)
  assert.doesNotMatch(read(`echo "$'x" > m\ncat > n <<'EOF'\ncita git push -f\nEOF`), /git push/)
  assert.match(read(`printf $'a' <<'EOF'\nx\nEOF\ngit push -f`), /git push -f/)
  assert.match(read(`x=$((1 << n))\ngit push -f origin b`), /git push -f/)
  assert.match(read(`git commit -F - <<'EOF'\ngit push -f`), /git push -f/)
})

test('una carpeta sin repositorio no es candidata, y un sh -c decide dónde cae', () => {
  const root = tempRoot('ops-for-')
  const session = tempRoot('ops-for-sesion-')
  const { execFileSync } = require('node:child_process')
  const repo = path.join(root, 'app')
  require('node:fs').mkdirSync(repo)
  execFileSync('git', ['init', '-q', repo])
  const at = (command) => directoriesOf(command, root)
  assert.deepEqual(at('for r in a b; do git -C $r commit -m x; done'), [path.join(root, '$r')], 'un for no se expande')
  assert.deepEqual(at('bash -c "git -C /otro commit -m x"'), ['/otro'], 'lo de un sh -c decide')
  assert.deepEqual(directoriesOf(`bash -c "cd ${repo} && git commit -m x"`, session), [repo])
  const nueva = path.join(session, 'nueva')
  assert.ok(directoriesOf(`{ cd ${repo}; cd ${nueva}; }; git commit -m x`, session).includes(nueva), 'la nueva queda')
  assert.deepEqual(at('for r in $L; do git -C $r commit -m x; done'), [path.join(root, '$r')], 'esa lista no se lee')
  assert.deepEqual(directoriesOf(`{ cd ${repo}; }; git commit -m x`, session), [repo])
  assert.deepEqual(directoriesOf('git commit -m x', session), [session], 'sin otra, la de la sesión')
})

// Lo que no toca el índice de la instancia no arrastra hasta ella el juicio de un commit que cae en otro lado.
test('un git que sólo lee o publica no vuelve candidata a la carpeta de la sesión', () => {
  const root = tempRoot('ops-lee-')
  const other = tempRoot('ops-lee-otro-')
  const at = (command) => directoriesOf(command, root)
  for (const first of ['git archive HEAD', 'git merge-base a b', 'git ls-remote origin', 'git for-each-ref',
    'git reflog', 'git show-ref', 'git cherry', 'git symbolic-ref HEAD', 'git count-objects', 'git name-rev HEAD',
    'git merge-tree a b', 'git format-patch -1', 'git pull', 'git push', `git worktree add ${other}`]) {
    assert.deepEqual(at(`${first} && cd ${other} && git commit -m x`), [other], first)
  }
  assert.ok(at(`git add a && cd ${other} && git commit -m x`).includes(root), 'el que stagea sí')
  assert.ok(at(`git reset --hard && cd ${other} && git commit -m x`).includes(root), 'el que toca el índice sí')
})

test('un commit sin argumentos termina donde termina su comando', () => {
  for (const command of ['git commit; ls', 'git commit && ls', 'git commit | tee x', '(git commit)',
    'f() { git commit; }']) {
    assert.equal(I.isCommit(command), true, command)
  }
  for (const command of ['git commit-tree x', 'git commit.sh']) assert.equal(I.isCommit(command), false, command)
})

test('la ruta con espacios de un git detrás de un prefijo se lee entera', () => {
  const root = tempRoot('ops-espacio-')
  const at = (command) => directoriesOf(command, root)
  for (const command of ['if a; then git -C "mi carpeta" commit -m x; fi', 'timeout 60 git -C "mi carpeta" commit -m x',
    'time -p git -C "mi carpeta" commit -m x']) {
    assert.deepEqual(at(command), [path.join(root, 'mi carpeta')], command)
    assert.equal(I.isCommit(command), true, command)
  }
  assert.match(I.withoutGitGlobals(`eval git -C 'x push -f'`), /push -f/, 'lo que otro vuelve a leer, no')
})
