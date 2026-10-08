'use strict'

// Qué parte de un comando es orden y qué parte es dato, y contra qué directorio corre. Dos lecturas que
// fallaban hacia el lado que frena de más: el texto que otra herramienta sólo lee, tomado por comando; y
// el `cd` a una variable que el propio comando acababa de asignar, tomado por irresoluble.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const I = require('../../engine/hooks/input')

const run = (guard, command, cwd) => execute(guard, { ...(cwd ? { cwd } : {}), tool_input: { command } })

// Caso 259. Las dos mitades van juntas: el dato deja de frenar, y lo que se ejecuta sigue frenando. Sólo
// la primera pasaría con la regla apagada.
test('el texto que una herramienta sólo lee no se toma por comando, y el que se ejecuta sí', () => {
  const data = [
    `sed -i "s|'git -C . commit -am sonda'|otra cosa|" test/x.test.js`,
    `grep -rn "git add -A" docs`,
    `rg 'git reset --hard' engine`,
    `echo "no corras git add ."`,
    `printf '%s\\n' 'git clean -fd'`,
  ]
  for (const command of data) {
    assert.doesNotThrow(() => run('git-add', command), command)
    assert.doesNotThrow(() => run('destructive', command), command)
  }

  blocked('git-add', { tool_input: { command: `bash -c "git add -A"` } }, /Stagea rutas explícitas/)
  blocked('git-add', { tool_input: { command: `eval 'git add .'` } }, /Stagea rutas explícitas/)
  blocked('git-add', { tool_input: { command: `echo "git add -A" | bash` } }, /Stagea rutas explícitas/)
  blocked('git-add', { tool_input: { command: 'echo "$(git add -A)"' } }, /Stagea rutas explícitas/)
  blocked('git-add', { tool_input: { command: `echo listo; git add -A` } }, /Stagea rutas explícitas/)
  // Un programa que nadie anotó como lector sigue leyéndose como orden.
  blocked('git-add', { tool_input: { command: `otro-programa "git add -A"` } }, /Stagea rutas explícitas/)
  blocked('destructive', { tool_input: { command: `sh -c 'git reset --hard HEAD'` } }, /destruye cambios locales/)
})

// Caso 312. Dónde termina una cadena lo dice el shell. Las dos mitades van juntas: la comilla escapada adentro
// no cierra, y la comilla escapada afuera no abre. Con sólo la primera, lo que sigue a un `\"` suelto quedaba
// escondido hasta la próxima comilla, y ahí puede haber una orden.
test('una comilla escapada no cierra una cadena ni abre otra', () => {
  const Q = '\\"'
  const read = [
    [`grep -n "${Q}test\\|jest" package.json`, 'grep -n \u0000 package.json'],
    // Una barra escapada no escapa a la comilla que sigue: la cadena cierra ahí.
    ['echo "a\\\\" ; x ; echo "b"', 'echo \u0000 ; x ; echo \u0000'],
    [`echo ${Q}a${Q} ; x ; echo "b"`, `echo ${Q}a${Q} ; x ; echo \u0000`],
    [`echo ${Q}; x ; echo ${Q}`, `echo ${Q}; x ; echo ${Q}`],
    // Sin cerrar no es una cadena, y las simples no admiten escape: terminan en la primera que encuentran.
    [`echo "sin cerrar ${Q} ; x`, `echo "sin cerrar ${Q} ; x`],
    ["echo 'a\\' ; x ; echo 'b'", 'echo \u0000 ; x ; echo \u0000'],
    ['echo "varias\\\nlíneas" ; x', 'echo \u0000 ; x'],
    // Afuera la barra escapa lo que sea que siga: una simple, o a otra barra, y ahí la comilla sí abre.
    ["echo \\' ; x ; echo \\'", "echo \\' ; x ; echo \\'"],
    ['echo \\\\"a ; x" ; y', 'echo \\\\\u0000 ; y'],
    // Un comentario no abre cadenas y queda a la vista; un `#` pegado a una palabra no es comentario.
    ['echo a # "\nx ; echo "b"', 'echo a # "\nx ; echo \u0000'],
    ['echo a#"b" ; x', 'echo a#\u0000 ; x'],
  ]
  for (const [command, expected] of read) assert.equal(I.unquoted(command), expected, command)

  const root = tempRoot('cauce-comilla-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))
  const outside = path.join(os.homedir(), 'fuera-de-las-raices')
  // Lo que queda adentro de la cadena es dato, también cuando parece una orden.
  assert.doesNotThrow(() => run('destructive', `echo "a ${Q} ; rm -rf / ; ${Q} b"`))
  assert.doesNotThrow(() => run('git-add', `grep -rn "${Q}git add -A${Q}" docs`))
  assert.doesNotThrow(() => run('shell-boundary', `echo "a${Q} > ${outside}/zz ${Q}b"`, root))
  // Y lo que queda afuera sigue siendo orden, antes y después de la comilla escapada.
  for (const command of [`echo "a${Q}b"; rm -rf /`, `echo ${Q}a${Q} ; rm -rf / ; echo "b"`,
    `echo ${Q}; rm -rf / ; echo ${Q}`, "echo \\' ; rm -rf / ; echo \\'",
    `echo a # "\necho ${Q} ; rm -rf / ; echo ${Q}\n# "`, "echo a # don't\nrm -rf /\necho 'listo'",
    // Quién lee la cadena se decide por lo que hay antes, y eso también se lee con las barras.
    `echo ${Q} ; X=${Q} eval "rm -rf /"`]) {
    blocked('destructive', { tool_input: { command } }, /catastrófico/)
  }
  blocked('git-add', { tool_input: { command: `otro "a${Q}b"; git add -A` } }, /Stagea rutas explícitas/)
  blocked('shell-boundary', { cwd: root, tool_input: { command: `echo "x${Q}y" > ${outside}/zz` } },
    /fuera de las raíces/)
})

// Caso 261. Una copia desechable se arma con `mktemp` y un `cd` a la variable; el destino es el temporal y
// se sabe leyendo el comando. Lo que no se sabe sigue sin resolverse.
test('un cd a una variable que el propio comando asigna se resuelve, y el resto no', () => {
  const root = tempRoot('cauce-cd-var-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.mkdirSync(path.join(root, 'cerrada'), { mode: 0o555 })
  fs.writeFileSync(path.join(root, 'correr.sh'), '', { mode: 0o755 })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))
  const outside = path.join(os.homedir(), 'fuera-de-las-raices')

  const fine = [
    'T=$(mktemp -d) && cp -r src $T/ && cd $T && sed -i "/x/d" src/alta.js',
    `T=$(mktemp -d ${os.tmpdir()}/qa-XXXXXX); cd "$T"; echo x > consumer.js`,
    `d=${root}/src\nmkdir -p "$d" && cd "$d" || exit 1\nprintf 'x' > nota.md`,
    `R=${root}; S=$R/src; cd \${S} && echo x > a.js`,
    // Una copia hecha donde el comando dice, que es como se arma una mutación (caso 311).
    `S=${root}/src; C=$(mktemp -d -p $S mut.XXXX) && cd $C && sed -i "s/a/b/" a.js`,
    `C=$(mktemp -d --tmpdir=${root} mut.XXXX) && cd $C && echo x > a.js`,
    `C=$(mktemp -d ${root}/src/mut.XXXX); cd $C; echo x > a.js`,
    `S=${root}/src; C=$(mktemp -d -q -p "$S" mut.XXXX) && cd $C && echo x > a.js`,
    // La carpeta todavía no existe. Con `&&` da igual: si `mktemp` falla, la cadena se corta. Y sin `&&`
    // alcanza con que un paso anterior la cree con `mkdir -p`, nombrándola (caso 327).
    `T=$(mktemp -d -p ${root}/nueva) && cd $T && echo x > a.js`,
    `git worktree add ${root}/nueva && T=$(mktemp -d -p ${root}/nueva) && cd $T && echo x > a.js`,
    `mkdir -p ${root}/nueva\nT=$(mktemp -d -p ${root}/nueva)\ncd $T\necho x > a.js`,
    `mkdir -p ${root}/nueva/sub; T=$(mktemp -d -p ${root}/nueva); cd $T; echo x > a.js`,
    `S=${root}/nueva; mkdir -p "$S"; C=$(mktemp -d -p "$S" m.XXXX); cd $C; echo x > a.js`,
    // Un archivo temporal no es una carpeta, y escribirle a la variable no se juzga: no se sabe dónde cae.
    'T=$(mktemp); echo x > $T',
    // Con directorio propio, `TMPDIR` no decide nada; y leerlo no lo mueve.
    `export TMPDIR=${outside}; C=$(mktemp -d -p ${root}) && cd $C && echo x > a.js`,
    'echo "$TMPDIR"; T=$(mktemp -d); cd $T; echo x > a.js',
  ]
  for (const command of fine) assert.doesNotThrow(() => run('shell-boundary', command, root), command)

  // Resuelta, se juzga por dónde cae: afuera frena como cualquier ruta de afuera.
  blocked('shell-boundary', { cwd: root, tool_input: { command: `d=${outside}; cd $d && echo x > a.js` } },
    /fuera de las raíces/)
  // Y `mktemp` con directorio se juzga por ese directorio: afuera frena diciendo dónde, no por no saber. La
  // carpeta de afuera no existe, así que sin `&&` ya no se sabe dónde cae lo que sigue (caso 327).
  for (const made of [`mktemp -d -p ${outside}`, `mktemp -d ${outside}/qa-XXXXXX`, `mktemp -d --tmpdir=${outside}`]) {
    blocked('shell-boundary', { cwd: root, tool_input: { command: `T=$(${made}) && cd $T && echo x > a.js` } },
      /fuera de las raíces/)
    blocked('shell-boundary', { cwd: root, tool_input: { command: `T=$(${made}); cd $T; echo x > a.js` } },
      /no se puede resolver/)
  }
  const unresolved = [
    'cd $NADIE && echo x > a.js',
    'T=/a; T=/b; cd $T && echo x > a.js',
    'T=$(algo-que-no-es-mktemp) && cd $T && echo x > a.js',
    'T=$(mktemp -d -p $NADIE) && cd $T && echo x > a.js',
    'T=$(mktemp -d -p relativo) && cd $T && echo x > a.js',
    // `mktemp` tiene más de una forma de decir dónde crea, y cuando dos se contradicen gana una que acá no se
    // sabe. Cada una de éstas resolvía a la raíz mientras `mktemp` creaba afuera: quedan sin resolver.
    `T=$(mktemp -d -p ${root} -p ${outside}) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -p ${root} --tmpdir=${outside}) && cd $T && echo x > a.js`,
    `T=$(mktemp -d --tmpdir=${root} -p${outside}) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -p${outside}) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -p ${root} ../fuera/x.XXXX) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -p ${root} | sed s,src,fuera,) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -p ${root} -t x.XXXX) && cd $T && echo x > a.js`,
    `T=$(mktemp -d ${root}/../fuera/x.XXXX) && cd $T && echo x > a.js`,
    `T=$(mktemp -d ${root}/x.XXXX otra) && cd $T && echo x > a.js`,
    `T=$(mktemp -d -u -p ${root}) && cd $T && echo x > a.js`,
    // Con la salida redirigida la variable queda vacía: la ruta del `>` no es dónde crea.
    `T=$(mktemp -d >${root}/log) && cd $T && echo x > a.js`,
    `T=${root}/src; cd '$T' && echo x > a.js`,
    // Si `mktemp` falla, la variable queda vacía y el `cd` va a la carpeta personal. Sin `&&` que corte la
    // cadena, la carpeta pedida tiene que estar, ser una carpeta y poder escribirse (caso 327).
    `T=$(mktemp -d -p ${root}/no-existe); cd $T; echo x > a.js`,
    `T=$(mktemp -d -p ${root}/no-existe)\ncd $T\necho x > a.js`,
    `T=$(mktemp -d ${root}/no-existe/x.XXXX); cd $T; echo x > a.js`,
    `T=$(mktemp -d --tmpdir=${root}/no-existe); cd $T; echo x > a.js`,
    `T=$(mktemp -d -p ${root}/correr.sh); cd $T; echo x > a.js`,
    ...(process.getuid() ? [`T=$(mktemp -d -p ${root}/cerrada); cd $T; echo x > a.js`] : []),
    // Nombrar `mkdir` no alcanza: tiene que crear esa carpeta, y con `-p`.
    `echo mkdir; T=$(mktemp -d -p ${root}/no-existe); cd $T; echo x > a.js`,
    `mkdir -p ${root}/otra; T=$(mktemp -d -p ${root}/no-existe); cd $T; echo x > a.js`,
    `mkdir -p ${root}/no-existe-tampoco; T=$(mktemp -d -p ${root}/no-existe); cd $T; echo x > a.js`,
    `mkdir -p no-existe; T=$(mktemp -d -p ${path.resolve('no-existe')}); cd $T; echo x > a.js`,
    `mkdir ${root}/no/existe; T=$(mktemp -d -p ${root}/no/existe); cd $T; echo x > a.js`,
    // Una plantilla sin tres `X` la rechaza `mktemp`, esté o no la carpeta.
    `T=$(mktemp -d ${root}/src/mut); cd $T; echo x > a.js`,
    `T=$(mktemp -d -p ${root}/src mut.XX) && cd $T && echo x > a.js`,
    // Sin `-d` crea un archivo: el `cd` falla y la escritura cae donde se estaba (caso 318).
    `T=$(mktemp -p ${root}); cd $T; echo x > a.js`,
    'T=$(mktemp); cd $T; echo x > a.js',
    // Con `TMPDIR` nombrado en el comando, el temporal ya no es el que ve el guard.
    `export TMPDIR=${outside}; T=$(mktemp -d); cd $T; echo x > a.js`,
    `TMPDIR=${outside}; T=$(mktemp -d) && cd $T && echo x > a.js`,
    // Una plantilla sin ruta crea en la carpeta donde se está, no en el temporal.
    'T=$(mktemp -d mut.XXXX) && cd $T && echo x > a.js',
  ]
  for (const command of unresolved) {
    blocked('shell-boundary', { cwd: root, tool_input: { command } }, /no se puede resolver/)
  }
})

// El repositorio de un commit se resuelve igual: con la ruta en una variable asignada ahí mismo, el guard
// sabe a dónde apunta en vez de colgarla de la carpeta de la sesión.
test('git -C a una variable asignada en el comando apunta a donde la variable dice', () => {
  const at = (command) => I.gitDirectory(command, '/sesion')
  assert.equal(at('W=/otro/lado; git -C $W/app commit -m x'), '/otro/lado/app')
  assert.equal(at('W=/otro/lado\ncd "$W/ops" && git commit -m x'), '/otro/lado/ops')
  assert.equal(at('git -C $W/app commit -m x'), '/sesion/$W/app', 'sin asignar, queda como estaba')
})
