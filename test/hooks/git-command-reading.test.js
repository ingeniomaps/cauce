'use strict'

// Cómo se lee un comando de git: sus opciones, el repositorio de un commit y lo que un commit ejecuta (casos 464, 468 y
// 469). Lo demás de la lectura de comandos es de `command-reading.test.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempRoot } = require('../support/environment')
const I = require('../../engine/hooks/input')

// Lo entrecomillado de un commit se vacía porque es el mensaje, y eso se llevaba también la ruta: quedaba `<cwd>/\0`,
// y Node lanzaba al pasársela a git (caso 464).
test('la ruta entrecomillada de un commit se lee, y la que cita el mensaje no', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('git -C "/otro" commit -m x'), '/otro')
  assert.equal(at("git -C '/otro' commit -m x"), '/otro')
  assert.equal(at('cd "/otro" && git commit -m x'), '/otro')
  assert.equal(at('git -c "a=b" -C "/otro" commit -m x'), '/otro')
  assert.equal(at('git -C "/mi carpeta" commit -m x'), '/mi carpeta')
  assert.equal(at('cd "/mi carpeta" && git commit -m x'), '/mi carpeta')
  assert.equal(at('git commit -m "cd /otro && git -C /otro commit"'), '/sesion')
  assert.equal(at("git commit -m 'git -C \"/otro\" commit'"), '/sesion')
  assert.equal(at('git commit -C "HEAD"'), '/sesion')
  assert.equal(at('git commit -m "a" -C "HEAD"'), '/sesion')
})

// El valor es la palabra entera del shell: leerlo hasta la primera comilla dejaba `git/. add -A`, y ningún guard
// reconocía ese verbo.
test('un valor de git con comillas y algo más pegado se lee entero', () => {
  const clean = I.withoutGitGlobals
  assert.equal(clean('git -C "/r"/. add -A'), 'git add -A')
  assert.equal(clean('git -C "/r"/. push --force origin main'), 'git push --force origin main')
  assert.equal(clean("git -C /r/'a b'/c reset --hard"), 'git reset --hard')
  assert.equal(clean('git --git-dir "/r"/.git commit -m x'), 'git commit -m x')
  assert.equal(I.isCommit('git -C "/a\\"b" commit -m x'), true)
  assert.equal(I.gitDirectory('git -C "/r"/. commit -m x', '/sesion'), '/r')
  assert.equal(I.gitDirectory("cd '/r'/'a b' && git commit -m x", '/sesion'), '/r/a b')
})

// Una palabra que el shell ejecuta por dentro no se salta entera: lo que lleva adentro tiene que verse (caso 464).
test('lo que corre dentro del valor de una opción de git queda a la vista', () => {
  const clean = I.withoutGitGlobals
  assert.match(clean('git -C "$(git push --force origin main; echo .)" status'), /git push --force/)
  assert.match(clean('git -C "`git push -f origin main`" status'), /git push -f/)
  assert.match(clean('git -c x="$(git reset --hard)" status'), /git reset --hard/)
  assert.match(clean('git -C "sin cerrar add -A'), /add -A/)
  assert.match(clean("git -C 'sin cerrar add -A"), /add -A/)
})

test('una continuación de línea después del valor no esconde el verbo', () => {
  assert.equal(I.withoutGitGlobals('git -C a\\\n push -f origin main'), 'git push -f origin main')
  assert.equal(I.withoutGitGlobals('git -C "a"\\\n add -A'), 'git add -A')
})

test('las opciones que no van antes del subcomando, o no son de git, quedan como estaban', () => {
  const clean = I.withoutGitGlobals
  assert.equal(clean('git commit -C HEAD'), 'git commit -C HEAD')
  assert.equal(clean('git -C a'), 'git')
  assert.equal(clean('git -C'), 'git -C')
  assert.equal(clean('git -C '), 'git -C ')
  assert.equal(clean('git -pfoo status'), 'git -pfoo status')
  assert.equal(clean('git --exec-path=/x status && git -P log'), 'git status && git log')
  assert.equal(clean('/tmp/.git -C a push'), '/tmp/.git push')
})

test('leer las opciones de git cuesta lineal, con muchas opciones o mucho texto', () => {
  const started = Date.now()
  I.gitDirectory(`git${' -C .'.repeat(2000)} commit -m "x"`, '/sesion')
  I.withoutGitGlobals(`git${' -c a=1'.repeat(2000)} status`)
  I.gitDirectory(`git commit -m ${'"a" '.repeat(20000)}`, '/sesion')
  const spent = Date.now() - started
  assert.ok(spent < 1000, `tardó ${spent} ms`)
})

// La palabra termina donde termina para el shell: `ruta;` se leía como un repositorio ajeno y los guards se abstenían.
test('el valor de una opción de git termina en un separador sin comillas', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('git -C /r;git commit -m x'), '/sesion', 'ese -C es de otro git')
  assert.equal(at('git -C /r&&git commit -m x'), '/sesion')
  assert.equal(at('git -C "/r"; git status'), '/r')
  assert.equal(at('git -C /r|git status'), '/r')
  assert.match(I.withoutGitGlobals('git -C a;git push -f'), /git push -f/)
  assert.equal(I.isCommit('git -C /r;git commit -m x'), true)
})

test('lo que corre sin comillas dentro de un valor, o tras abrir un comentario, queda a la vista', () => {
  const clean = I.withoutGitGlobals
  assert.match(clean("git -C $(sh<<<'git push -f') status"), /push -f/)
  assert.match(clean("git -C x$(sh<<<'git add -A') status"), /add -A/)
  assert.match(clean("git -C `sh<<<'git reset --hard'` status"), /reset --hard/)
  assert.match(clean("git -C #'\ngit push -f\n'"), /git push -f/)
  assert.match(clean("git -C a;sh<<<'git push -f'"), /git push -f/)
  assert.match(clean("git -C $'a' push -f"), /push -f/)
})

test('una ruta entre comillas se lee como la recibe git', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('git -C "/a\\b" commit -m x'), '/a\\b')
  assert.equal(at('git -C "/a\\"b" commit -m x'), '/a"b')
})

test('las opciones que git admite antes del subcomando no esconden el verbo', () => {
  const clean = I.withoutGitGlobals
  assert.equal(clean('git --no-advice push -f'), 'git push -f')
  assert.equal(clean('git --no-lazy-fetch push -f'), 'git push -f')
  assert.equal(clean('git --attr-source=HEAD push -f'), 'git push -f')
  assert.equal(clean('git --attr-source HEAD push -f'), 'git push -f')
})

// `git -c alias.p='!orden' p` ejecuta la orden: el valor de `-c` no se salta entero.
test('lo que un alias de -c ejecuta queda a la vista', () => {
  const clean = I.withoutGitGlobals
  assert.match(clean("git -c alias.p='!git push --force origin main' p"), /git push --force/)
  assert.match(clean('git -c alias.r="!git reset --hard" r'), /git reset --hard/)
  assert.match(clean("git -c alias.a='!git add -A' a"), /git add -A/)
})

test('fuera de un commit, lo entrecomillado que opera sobre otro repositorio se sigue leyendo', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('bash -c "true; git -C /otro add -A"'), '/otro')
  assert.equal(at('eval "true; git -C /otro add ."'), '/otro')
  assert.equal(at('git -C "/a b" status'), '/a b')
  assert.equal(at("cd 'a b' && git status"), '/sesion', 'fuera de un commit, el cd se lee como antes')
})

// La comilla de cierre de un texto que nombra `git -C` no abre un valor: leída así, se tragaba la orden siguiente.
test('un valor entre comillas no se traga lo que el shell interpreta', () => {
  const clean = I.withoutGitGlobals
  assert.match(clean("foo 'git -C ' ; git push -f origin main ; foo ' x'"), /git push -f/)
  assert.match(clean('foo "git --git-dir " ; git reset --hard ; foo " x"'), /git reset --hard/)
  assert.match(clean(`sh -c "git -C '$(git push -f origin main)' status"`), /git push -f/)
  assert.match(clean('sh -c "git --git-dir=\'`git push -f origin main`\' status"'), /git push -f/)
})

test('con git como argumento de otro, lo entrecomillado se vuelve a leer y queda a la vista', () => {
  const clean = I.withoutGitGlobals
  assert.match(clean("eval git -C 'x push -f'"), /push -f/)
  assert.match(clean('eval git -C "x reset --hard"'), /reset --hard/)
  assert.match(clean("echo git -C 'x push -f' | bash"), /push -f/)
  assert.match(clean("ssh h git -C 'x push -f'"), /push -f/)
  assert.equal(clean('A=1 git -C "a b" push -f'), 'A=1 git push -f')
  assert.equal(clean('sudo env git -C "a b" push -f'), 'sudo env git push -f')
  assert.equal(clean('true; git -C "a b" push -f'), 'true; git push -f')
  assert.match(clean("eval true \\; git -C 'x push -f origin b'"), /push -f/)
  assert.match(clean("eval \\( git -C 'x clean -fd' \\)"), /clean -fd/)
  assert.match(clean("ssh h true \\; git -C 'x reset --hard'"), /reset --hard/)
  assert.match(clean("echo a\\; git -C 'x add -A' | bash"), /add -A/)
  assert.match(clean("A=x;eval git -C 'x push -f'"), /push -f/)
  assert.equal(I.gitDirectory('time git -C /r;git status', '/sesion'), '/r')
  assert.notEqual(I.gitDirectory("eval git -C '/tmp -C /inst' add -A", '/sesion'), '/tmp -C /inst')
})

// El repositorio de un commit es el del `git` que commitea: leer el primer `cd` del comando lo daba por ajeno
// (caso 468).
test('el repositorio de un commit se lee de su propio segmento', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('git commit -m x && cd /etc'), '/sesion')
  assert.equal(at('git commit -m x; cd "/etc"'), '/sesion')
  assert.equal(at('(cd "/o" && git commit -m x)'), '/o', 'el subshell lleva su propia carpeta')
  assert.equal(at('git commit -m "a; cd /etc"'), '/sesion', 'un separador entre comillas no separa')
  assert.equal(at('echo a\\; cd /etc && git commit -m x'), '/sesion', 'uno escapado tampoco')
})

test('un commit después de otra orden se reconoce con la ruta entre comillas', () => {
  assert.equal(I.isCommit('true; git -C "a b" commit -m x'), true)
  assert.equal(I.isCommit('cd /r && git -C "a b" commit -m x'), true)
  assert.equal(I.isCommit('(git -C "a b" commit -m x)'), true)
  assert.equal(I.isCommit('eval true \\; git -C "a b" push -f'), false)
  assert.match(I.withoutGitGlobals("eval true \\; git -C 'x push -f'"), /push -f/)
  assert.match(I.withoutGitGlobals("ssh h 'true; git -C \"x push -f\"'"), /push -f/)
})

// Lo que un commit ejecuta no es su mensaje (caso 469). El heredoc con el delimitador entre comillas sí lo es:
// no expande.
test('lo que un commit ejecuta queda a la vista, y su mensaje no', () => {
  const run = I.asRun
  assert.match(run('git commit -m "$(git push -f origin main)"'), /git push -f/)
  assert.match(run('git commit -m "`git push -f origin main`"'), /git push -f/)
  assert.match(run("git commit -m x; sh -c 'git reset --hard'"), /git reset --hard/)
  assert.match(run("true; git -C 'a b' commit -m x; echo 'git push -f' | sh"), /git push -f/)
  assert.match(I.withoutGitGlobals(run('git commit -m x && git -c "a=b c" push -f')), /git push -f/)
  assert.match(I.withoutGitGlobals(run('git commit -m x; git -C . -c "u=A B" push -f')), /git push -f/)
  assert.match(I.withoutGitGlobals(run('git commit -m x; git -c u=A -c "e=a b" reset --hard')), /git reset --hard/)
  for (const value of ['user.name="A B"', 'http.extraHeader="X: y"', '"user.name=A B"',
    '"user.name=\\"A B\\""']) {
    assert.equal(I.withoutGitGlobals(`git -c ${value} push -f origin b`), 'git push -f origin b', value)
    const chained = `git commit -m x && GIT_TRACE=1 git -c ${value} reset --hard`
    assert.match(I.withoutGitGlobals(run(chained)), /git reset --hard/)
  }
  assert.equal(I.isCommit('git -c user.name="Git Bot" commit -m x'), true, 'un nombre no es una orden')
  assert.match(I.withoutGitGlobals("git -c alias.p='push -f' p"), /git push -f/, 'lo que corre el alias se ve')
  assert.match(I.withoutGitGlobals("git -c alias.a='!git reset --hard' a"), /git reset --hard/)
  assert.equal(I.withoutGitGlobals("git -c alias.p='push -f' commit -m x"), 'git commit -m x', 'sin usar no corre')
  assert.equal(I.withoutGitGlobals("git -c alias.a='!rm -rf x' a"), 'rm -rf x ; git a', 'con `!` lo corre el shell')
  assert.match(I.withoutGitGlobals("git -c core.sshCommand='rm -rf x' fetch"), /rm -rf x/)
  assert.match(I.withoutGitGlobals('git -c core.pager="git push -f" log'), /git push -f/)
  assert.equal(I.isCommit("git -c alias.c='commit -m x' c"), true)
  assert.match(I.withoutGitGlobals("git -c alias.p='!git push -f' \\\n  p"), /git push -f/, 'en otra línea')
  assert.match(I.withoutGitGlobals("git -c alias.Pf='!git push -f' pf"), /git push -f/, 'sin distinguir mayúsculas')
  assert.equal(I.withoutGitGlobals('git -c core.quotePath=off status'), 'git status', 'un valor común es dato')
  assert.match(I.withoutGitGlobals('git -c core.sshCommand="git push -f" fetch'), /git push -f/)
  assert.match(I.withoutGitGlobals(run(`git commit -m x; git -c alias.p='!git push -f' p`)), /git push -f/)
  assert.match(run('git commit -m x && bash -c "git push -f"'), /git push -f/)
  assert.match(run('cat <<EOF | sh\ngit push -f\nEOF'), /git push -f/, 'un cuerpo que recibe un shell es una orden')
  assert.match(run('bash <<EOF\ngit push -f\nEOF'), /git push -f/)
  const pushAfter = `# it's\ncat > m <<'EOF'\nfix: don't\nEOF\ngit commit -F m && git push origin main && git log '%h'`
  assert.match(run('git commit -m "texto <<EOF"\ngit push -f\nEOF'), /git push -f/, 'en una cadena no abre nada')
  assert.match(run(pushAfter), /git push origin main/, 'las comillas de un comentario o un cuerpo no cuentan')
  assert.match(run(`# usa <<EOF\ngit push -f origin main\nEOF`), /git push -f/, 'un comentario no abre un heredoc')
  const inert = [
    `# it's\ngit commit -F - <<'EOF'\ncita git push -f\nEOF`,
    `git status # it's\ngit commit -m "$(cat <<'EOF'\ncita git push -f\nEOF\n)"`,
    `cat > a <<'EOF'\nit's\nEOF\ngit commit -F - <<'EOF'\ncita git push -f\nEOF`,
    'git commit -m "explica git push -f y rm -rf"',
    "git commit -m 'explica git push -f'",
    `git commit -m "$(cat <<'EOF'\nexplica git push -f y $(rm -rf x)\nEOF\n)"`,
    `git commit -F - <<'EOF'\nexplica 'git push -f'; y "rm -rf x"\nEOF`,
    'git commit -m "uno" -m "explica git reset --hard"',
    'git commit -m x; echo "git push -f"',
    `git commit -m "$(cat <<'EOF'\nun "git push -f"; y 'rm -rf x'\nEOF\n)"`,
  ]
  for (const command of inert) assert.doesNotMatch(run(command), /git (push|reset)|rm -rf/, command)
  assert.match(run('git commit -m "$(cat <<EOF\ntexto $(git push -f)\nEOF\n)"'), /git push -f/)
})

test('un cd que puede no mover al shell no cambia el repositorio del commit', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('(cd /etc); git commit -m x'), '/sesion')
  assert.equal(at('x=$(cd /etc && pwd); git commit -m x'), '/sesion')
  assert.equal(at('cd /no-existe || cd /etc; git commit -m x'), '/etc', 'el primero no entra, el segundo sí')
  assert.equal(at('cd /etc || cd /no-existe; git commit -m x'), '/etc', 'el primero entra, el segundo no corre')
  assert.equal(at('(cd /etc; true) && git commit -m x'), '/sesion')
  assert.equal(at('git -C /r status; cd /o && ls; cd /r && git commit -m x'), '/r')
  assert.equal(at('git -C /r diff; (ls && cd /o); git commit -m x'), '/sesion')
  assert.equal(at('git -C /r log; cd /o && git log; cd - && git commit -m x'), '/sesion')
})

test('un heredoc que no cierra el mensaje no tapa lo que sigue', () => {
  const trap = `git commit -m "$(cat <<'E'\nx\nE\n) tail"\ngit push -f origin main\necho "\nE\n)"`
  assert.match(I.asRun(trap), /git push -f/)
  assert.match(I.asRun(`git commit -m "$(cat <<'E'\nx\nE\n)$(git push -f)"`), /git push -f/)
  assert.match(I.asRun(`git commit -m "$(cat <<'E' | sh\ngit push -f\nE\n)"`), /git push -f/)
})

test('de un mensaje queda a la vista sólo lo que corre', () => {
  const run = I.asRun
  assert.doesNotMatch(run('git commit -m "fix \\`git push -f\\` docs"'), /git push/)
  assert.doesNotMatch(run('git commit -m "fix \\$(git push -f) docs"'), /git push/)
  assert.doesNotMatch(run(`git commit -m "$(printf 'no usar git push -f')"`), /git push/)
  assert.doesNotMatch(run(`git commit -m "$(echo 'git add -A')"`), /git add/)
  assert.doesNotMatch(run(`git commit -m "$(cat <<'END-MSG'\nno usar git push -f\nEND-MSG\n)"`), /git push/)
  assert.doesNotMatch(run(`git commit -m "$(cat <<\\EOF\nno usar git push -f\nEOF\n)"`), /git push/)
  assert.doesNotMatch(run('git commit -m "v$(date +%F): no usar git push -f"'), /git push/)
  assert.match(run('git commit -m "v$(date +%F): no usar git push -f"'), /date \+%F/)
  assert.match(run('git commit -m "$(echo $(true); git push -f)"'), /git push -f/, 'anidada, entera')
  assert.match(run(`git commit -m "a << b"; sh -c 'git push -f'`), /git push -f/)
  assert.match(run(`git commit -m x <<< y; sh -c 'git push -f'`), /git push -f/)
})

test('leer muchos git en un comando cuesta lineal', () => {
  const many = 'git status; '.repeat(5000)
  const started = Date.now()
  I.withoutGitGlobals(many)
  I.gitDirectory(`${many}git commit -m x`, '/sesion')
  const spent = Date.now() - started
  assert.ok(spent < 2000, `tardó ${spent} ms`)
})

test('un comentario o un texto que parece un heredoc no tapa lo que corre', () => {
  const run = I.asRun
  assert.match(run(`git commit -m x # "$(cat <<\\EOF\ngit push -f origin main\nEOF\n)"`), /git push -f/)
  assert.match(run(`git commit -m '"$(cat <<\\EOF'\ngit push -f origin main\nEOF\n)"`), /git push -f/)
  assert.match(run(`git commit -m 'a -m "$(cat <<"EOF'\ngit push -f\necho "\nEOF\n)"`), /git push -f/)
  assert.doesNotMatch(run(`git commit --message="$(cat <<'EOF'\nun "git push -f"\nEOF\n)"`), /git push/)
  assert.doesNotMatch(run(`git commit -am "$(cat <<'EOF'\nun "git push -f"\nEOF\n)"`), /git push/)
  assert.doesNotMatch(run(`git commit -sm "$(cat <<\\EOF\nun "git push -f"\nEOF\n)"`), /git push/)
})

test('la aritmética y el texto alrededor de una sustitución anidada no se leen como orden', () => {
  const run = I.asRun
  assert.doesNotMatch(run('git commit -m "$((1+1)) no usar git push -f"'), /git push/)
  assert.doesNotMatch(run('git commit -m "$(echo $(date)) no usar git push -f"'), /git push/)
})

test('con varios commits en un comando se lee el repositorio como antes', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('git -C /a status; git -C /otro commit -m a; git commit -m b'), '/otro')
  assert.equal(at('git commit -m a; git commit -m b'), '/sesion')
})

// Con el espacio cortaba el valor de `-C`: lo que quedaba no era un `git commit`, y ningún guard de commit corría.
test('un commit con la ruta entrecomillada y con espacios sigue siendo un commit', () => {
  assert.equal(I.isCommit('git -C "/mi carpeta" commit -m x'), true)
  assert.equal(I.isCommit("git -C '/mi carpeta' commit -m x"), true)
  assert.equal(I.isCommit('git --git-dir "/mi carpeta/.git" commit -m x'), true)
  assert.equal(I.isCommit('git -C "/mi carpeta" status'), false)
})

// Cuál `cd` corrió se sabe si van encadenados sin dudas; si no, se juzga el candidato que sea de la sesión.
test('el repositorio de un commit se simula por sus cd cuando no hay dudas', () => {
  const base = fs.realpathSync(tempRoot('cauce-commit-repo-'))
  const here = path.join(base, 'aca')
  const there = path.join(base, 'alla')
  fs.mkdirSync(here)
  fs.mkdirSync(there)
  const at = (command) => I.gitDirectory(command, here)
  assert.equal(at(`cd /etc; cd ${there} && git commit -m x`), there)
  assert.equal(at(`cd /etc && cd ${there} && git commit -m x`), there)
  assert.equal(at(`cd ${there}; git commit -m x`), there)
  assert.equal(at(`cd ${there}; ls; git commit -m x`), there)
  assert.equal(at('cd ../alla && git commit -m x'), there)
  assert.equal(at(`cd ${there}; cd ../aca; git commit -m x`), here)
  assert.equal(at(`cd ${there} && git -C sub commit -m x`), path.join(there, 'sub'))
  assert.equal(at(`cd ${there} && git -C /otro commit -m x`), '/otro')
  assert.equal(at(`echo git -C ${there} && git commit -m x`), here, 'ese -C no es de un git')
  const fresh = path.join(base, 'nueva')
  assert.equal(at(`cd ${fresh} && git commit -m x`), fresh, 'si no existiera, el commit no correría')
  assert.equal(at(`cd ${path.join(base, 'nope')}; git commit -m x`), here, 'el ; sigue aunque no exista')
  assert.equal(at('git -C "$PWD/a b" commit -m x'), path.join(here, 'a b'))
  assert.equal(at('git -C "${PWD}" commit -m x'), here)
  assert.equal(at('cd "$PWD" && git commit -m x'), here)
})

test('con dudas sobre el cd, se juzga el candidato que sea de la sesión', () => {
  const base = fs.realpathSync(tempRoot('cauce-commit-candidatos-'))
  const root = path.join(base, 'ops')
  const other = path.join(base, 'ajeno')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(other)
  const config = { workspaceRoots: [{ name: 'main', path: '.' }] }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  const previous = process.env.OPS_ROOT
  process.env.OPS_ROOT = root
  const at = (command, cwd = other) => I.gitDirectory(command, cwd, { cwd, session_id: 'p' })
  try {
    assert.equal(at(`(cd ${root} && git commit -m x)`), root, 'el subshell puede moverlo')
    assert.equal(at(`(cd ${other}); git commit -m x`, root), root, 'o puede no moverlo')
    assert.equal(at(`cd ${root} || cd ${other}; git commit -m x`), root)
    assert.equal(at(`false && cd ${root}; git commit -m x`), root)
    assert.equal(at(`cd ${root} & git commit -m x`), root)
    assert.equal(at(`x=$(cd ${other}); git commit -m x`, root), root, 'una sustitución no mueve al shell')
    assert.equal(at(`git -C ${root} add a; git -C ${other} commit -m x`), root, 'otro git que escribe también se juzga')
    assert.equal(at(`git commit -m x; git -C ${root} add a`), root)
    assert.equal(at(`git -C ${root} status; git -C ${other} commit -m x`), other, 'el que sólo lee, no')
    assert.equal(at(`cd ${root} && git add -A && cd ${other} && git commit -m x`), root, 'el add corre en la sesión')
    assert.equal(at(`git commit -m x; cd ${root}; sh -c 'git commit -m y'`), root)
    assert.equal(at(`cd ${other} && git commit -m x`, root), other, 'sin dudas, el ajeno es ajeno')
    assert.equal(at(`false && cd ${other}; git commit -m x`, root), root, 'si false falla, el cd no corre')
    assert.equal(at(`pushd ${other}; git commit -m x`, root), other, 'pushd mueve como cd')
    assert.equal(at(`pushd ${other}; popd; git commit -m x`, root), root, 'y popd vuelve')
    assert.equal(at(`cd ${other}; pushd ${root}; popd; git commit -m x`, root), other, 'a donde estaba, sin dudas')
    assert.equal(at(`(cd ${other} && git commit -m x)`, root), other, 'el subshell no deja dudas')
    assert.equal(at(`(cd ${other}); git commit -m x`, root), root, 'y al cerrarse no mueve')
    assert.equal(at(`(cd ${other} && git commit -m x); git -C ${root} status`, root), other)
    assert.equal(at(`{ cd ${other}; git commit -m x; }`, root), other, 'las llaves sí mueven')
    assert.equal(at(`cd ${other} || cd ${root}; git commit -m x`, root), other, 'existe: el segundo no corre')
    assert.equal(at(`if true; then cd ${other}; fi; git commit -m x`, root), root, 'un then deja dudas')
    assert.equal(at(`if true; then cd ${root}; fi; git commit -m x`), root, 'y su cd es candidato')
    assert.equal(at(`if false; then\n  cd ${other}\nfi\ngit commit -m x`, root), root, 'también en otra línea')
    assert.equal(at(`case "$r" in a) cd ${other};; esac; git commit -m x`, root), root, 'un case no se sabe si corre')
    assert.equal(at(`case "$r" in a) echo;; esac; cd ${other} && git commit -m x`, root), other, 'el && da certeza')
    assert.equal(at(`case "$r" in a) echo;; esac; cd ${other} && true; git commit -m x`, root), other)
    assert.equal(at(`if a; then cd ${other} && git commit -m x; fi; git commit -m y`, root), root, 'el fi duda')
    assert.equal(at(`f() { cd ${other}; }; git commit -m x`, root), root, 'una función sin llamar no mueve')
    assert.equal(at(`{ cd ${other}; }; git commit -m x`, root), root, 'puede ir a un tubo')
    assert.equal(at(`{ cd ${other} && npm test; } 2>&1 | tail -5; git commit -m x`, root), root, 'otro proceso')
    assert.equal(at(`{ cd ${other}; npm test; } & git commit -m x`, root), root)
    assert.equal(at(`{ if a; then cd ${other}; fi; git commit -m x; }`, root), root, 'un bloque tras la llave')
    assert.equal(at(`{ if a; then cd ${other}; fi; }; git commit -m x`, root), root)
    assert.equal(at(`if a; then if b; then true; fi; cd ${other}; fi; git commit -m x`, root), root, 'anidado')
    assert.equal(at(`if a\nthen\n if b\n then\n  cd ${other}\n fi\n git commit -m x\nfi`, root), root)
    assert.equal(at(`test -d x && { cd ${other} && git commit -m x; }; git commit -m y`, root), root, 'ni un {')
    assert.equal(at(`cd ${other} && cat > m <<EOF\ndone x\nthen\nEOF\ngit commit -m x`, root), other, 'cuerpo')
    assert.equal(at(`cat > m <<EOF\ncd ${other}\nEOF\ngit commit -m x`, root), root, 'un cuerpo no mueve')
    assert.equal(at(`if a; then cd ${other}; git commit -m x; fi`, root), other, 'adentro de su rama, sí')
    assert.equal(at(`if a; then echo; fi; cd ${other}; git commit -m x`, root), other, 'un bloque que no mueve no duda')
    assert.equal(at(`cd ${other}; if a; then echo; fi; git commit -m x`, root), other)
    assert.equal(at(`for f in a; do echo; done\ncd ${other}\ngit commit -m x`, root), other)
    assert.equal(at(`if a; then echo; fi && cd ${other} && git commit -m x`, root), other)
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true })
    assert.equal(at(`if a; then cd ${other}; fi; cd sub && git commit -m x`, root), root, 'relativo duda')
    assert.equal(at(`if a; then cd ${other}; fi; cd ${other}; git commit -m x`, root), other, 'absoluto y existe, no')
    assert.equal(at(`# 1) ajeno\ncd ${other} && git commit -m x`, root), other, 'un comentario no deja dudas')
    assert.equal(at(`# a; cd ${other}\ngit commit -m x`, root), root, 'ni mueve')
    assert.equal(at(`cd ${other}; git -C "$PWD" add -A`, root), other, 'un $PWD sale de los cd de antes')
    assert.equal(at(`cd ${other}/no; git -C "$PWD" add -A`, root), root, 'el cd que no entra no cuenta')
    assert.equal(at(`false && cd ${other}; git -C "$PWD" add -A`, root), root, 'con dudas, también la sesión')
    assert.equal(at(`git commit -m x && cd ${root}`), other, 'lo que viene después no commitea')
    assert.equal(at(`pushd ${root}; git commit -m x`), root, 'pushd es un candidato')
    // Frenar de más también es un defecto: un commit en un repositorio ajeno no le toca a esta sesión.
    assert.equal(at(`cd ${other} && git commit -m a && git commit --amend --no-edit`, root), other)
    assert.equal(at(`cd ${other}; git commit -m a; git commit -m b`, root), other)
    assert.equal(at(`cd ${other} && git commit -m a && cd ${root} && git status`, root), other)
    assert.equal(at(`cd ${other} && git commit -m a && cd .. && git log`, root), other)
    assert.equal(at(`cd ${other} || exit 1; git commit -m x`, root), other)
    const made = path.join(other, 'hecha')
    assert.equal(at(`mkdir -p ${made} && cd ${made}\ngit init -q\ngit commit -m x`, root), made)
    assert.notEqual(at('T=$(mktemp -d) && cd "$T"\ngit init -q\ngit commit -m x', root), root)
    assert.equal(at(`cd ${other}/my-git && git commit -m x`, root), path.join(other, 'my-git'))
    assert.equal(at(`[ -d ${other}/.git ] && cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`which git && cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git worktree list; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git rev-list --count HEAD; git -C ${other} commit -m x`, root), other)
    assert.equal(at(`cd ${other} || { echo no; exit 1; }; git commit -m x`, root), other)
    assert.equal(at(`git grep foo; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git tag -l; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git stash list; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git --version; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`git init ${other}/n && cd ${other}/n && git commit -m x`, root), path.join(other, 'n'))
    assert.equal(at(`git clone u ${other}/n && cd ${other}/n && git commit -m x`, root), path.join(other, 'n'))
    assert.equal(at(`cd ${other} && source activate && git commit -m x`, root), other)
    assert.equal(at(`cd ${root} && timeout 9 git add f; cd ${other} && git commit -m x`), root, 'el add corre igual')
    assert.equal(at(`cd ${root} && command git add f; cd ${other} && git commit -m x`), root)
    assert.equal(at(`cd ${root} && ls | xargs git add; cd ${other} && git commit -m x`), root)
    assert.equal(at(`cd ${other} && npm test 2>&1 | tail -5 && git commit -m x`, root), other)
    assert.equal(at(`cd ${other} 2>&1 && git commit -m x`, root), other)
    assert.equal(at(`cd ${other} && npm test || exit 1; git commit -m x`, root), other)
    assert.equal(at(`ls | wc -l; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`echo "git listo"; cd ${other} && git commit -m x`, root), other)
    assert.equal(at(`# commit in the git repo\ncd ${other} && git commit -m x`, root), other)
    assert.notEqual(at('T=$(mktemp -d); cd $T; git commit -m x', root), root)
    assert.notEqual(at('T=$(mktemp -d) && cd "$T" && git init && git commit -m x', root), root)
    const fresh = path.join(other, 'nueva')
    assert.equal(at(`mkdir ${fresh}; cd ${fresh}; git init; git commit -m x`, root), fresh)
    assert.equal(at(`cd ${other}; git --git-dir ${root}/.git commit -m x`), root, 'elige el repositorio')
    assert.equal(at(`git --git-dir=${root}/.git commit -m x`), root)
    assert.equal(at(`git -C ${other} commit -m x`, root), other)
    assert.equal(at(`cd ${other}; git commit -m x`, root), other)
  } finally {
    if (previous === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = previous
  }
})

// El cuerpo de un heredoc es dato, salvo lo que corre: sin comillas en el delimitador, una sustitución se ejecuta.
test('lo que un heredoc ejecuta, y lo que viene después de cerrarlo, queda a la vista', () => {
  const read = (command) => I.commandOf({ tool_input: { command } })
  const run = (command) => I.asRun(read(command))
  assert.match(run('git commit -m "$(cat <<EOF\ntexto $(git push -f)\nEOF\n)"'), /git push -f/)
  assert.match(run('git commit -F - <<EOF\ntexto `git reset --hard`\nEOF'), /git reset --hard/)
  assert.match(run('cat <<EOF\n$(git push -f)\nEOF'), /git push -f/)
  assert.match(run(`git commit -F - <<'EOF'\nx\nEOF\nsh -c 'git push -f origin main'`), /git push -f/)
  assert.match(run(`git commit -F - <<'EOF'\nx\nEOF\ngit push -f origin main`), /git push -f/)
  // Lo que corre en el mensaje no parte el commit: lo que sigue sigue siendo suyo.
  assert.match(run('git commit -m "v$(date)" --amend'), /git commit -m \S* --amend ; date/)
  assert.match(run(`git commit -m "$(cat <<'EOF'\nfix: x\nEOF\n)" --amend`), /git commit -m \S* --amend/)
  assert.match(run('git commit -m "$(cat <<EOF\nfix: x\nEOF\n)" --amend'), /git commit -m \S* --amend/)
  // El commit de otro shell no vuelve dato lo que ese shell corre (caso 477).
  assert.match(run('bash -c "git push -f origin main; git commit -m x"'), /git push -f/)
  assert.match(run('git status; sh -c "git push -f origin main; git commit -m x"'), /git push -f/)
  assert.doesNotMatch(run('git commit -m "cita git push -f"'), /git push/)
  assert.doesNotMatch(run('FOO="a b" git commit -m "cita git push -f"'), /git push/)
  const inert = [
    `git commit -F - <<'EOF'\ncita git push -f y $(rm -rf x)\nEOF`,
    'git commit -F - <<EOF\ncita git push -f\nEOF',
    'git commit -F - <<EOF\nescapado \\$(git push -f) y \\`rm -rf x\\`\nEOF',
    'cat > a.sh <<EOF\ngit push -f\nEOF',
    `cat > a.sh <<'EOF'\n$(git push -f)\nEOF`,
    `git commit -m "$(cat <<'EOF'\ncita "git push -f"; y $(rm -rf x)\nEOF\n)"`,
    `git commit -F - <<'END-MSG'\ncita "git push -f"\nEND-MSG`,
    'git commit -F - <<\\EOF\ncita $(git push -f)\nEOF',
    `git commit -F - . <<'EOF'\ncita git push -f\nEOF`,
    `grep -r foo . <<'EOF'\ncita git push -f\nEOF`,
  ]
  for (const command of inert) assert.doesNotMatch(run(command), /git push|rm -rf/, command)
})
