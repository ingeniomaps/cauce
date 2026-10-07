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

// Caso 261. Una copia desechable se arma con `mktemp` y un `cd` a la variable; el destino es el temporal y
// se sabe leyendo el comando. Lo que no se sabe sigue sin resolverse.
test('un cd a una variable que el propio comando asigna se resuelve, y el resto no', () => {
  const root = tempRoot('cauce-cd-var-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'src'))
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
  ]
  for (const command of fine) assert.doesNotThrow(() => run('shell-boundary', command, root), command)

  // Resuelta, se juzga por dónde cae: afuera frena como cualquier ruta de afuera.
  blocked('shell-boundary', { cwd: root, tool_input: { command: `d=${outside}; cd $d && echo x > a.js` } },
    /fuera de las raíces/)
  // Y `mktemp` con directorio se juzga por ese directorio: afuera frena diciendo dónde, no por no saber.
  for (const made of [`mktemp -d -p ${outside}`, `mktemp -d ${outside}/qa-XXXXXX`, `mktemp -d --tmpdir=${outside}`]) {
    blocked('shell-boundary', { cwd: root, tool_input: { command: `T=$(${made}) && cd $T && echo x > a.js` } },
      /fuera de las raíces/)
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
