'use strict'

// Caso 365. El guard de límites veía lo que un comando escribe y no lo que borra: la ruta que no dejaba tocar
// con un `echo >` se podía borrar entera con un `rm -rf`.
//
// El guard sólo lee el texto del comando: acá no se ejecuta ningún borrado. La carpeta de afuera es un nombre
// que no existe, así que tampoco hay nada que se pueda perder.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

const OUT = path.join(os.homedir(), 'fuera-de-las-raices')

function project(name, extra = {}) {
  const root = path.join(tempRoot(name), 'repo')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'service', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'service', path: 'service' }], ...extra }))
  fs.symlinkSync(OUT, path.join(root, 'service', 'enlace'))
  const passes = (command, cwd = root) =>
    assert.doesNotThrow(() => execute('shell-boundary', { cwd, tool_input: { command } }), command)
  const refuses = (command, reason, cwd = root) =>
    blocked('shell-boundary', { cwd, tool_input: { command } }, reason)
  return { root, passes, refuses }
}

const REMOVES = /el comando borra .*fuera-de-las-raices.*fuera de las raíces declaradas/s

test('borrar fuera de las raíces frena como escribir ahí, con el verbo que sea', () => {
  const { refuses } = project('ops-hook-borra-afuera-')
  const commands = [
    `rm ${OUT}/x.txt`, `rm -rf ${OUT}`, `rm -rf ${OUT}/*`, `rm -f -- ${OUT}/a ${OUT}/b`,
    `unlink ${OUT}/x.txt`, `rmdir ${OUT}/vacia`,
    `find ${OUT} -name '*.log' -delete`, `find ${OUT}/a ${OUT}/b -type f -delete`,
    `sudo rm -rf ${OUT}/sub`, `echo listo; rm -f ${OUT}/x.txt`, `(rm -rf ${OUT}/sub)`,
    `cd ${OUT} && rm -rf sub`, `D=${OUT}; rm -rf $D/sub`, `rm -rf ~/fuera-de-las-raices/sub`,
    'rm -rf ../../../../../../../../no-es-de-nadie', `rm -f ${OUT}/x.txt 2>/dev/null`,
    // Las formas en que un borrado se escribe de verdad (revisión del 365).
    'rm -rf $HOME/fuera-de-las-raices/sub', 'rm -rf "$HOME/fuera-de-las-raices/sub"', `rm -rf "${OUT}/sub"`,
    `if [ -d x ]; then rm -rf ${OUT}/sub; fi`, `for d in a b; do rm -rf ${OUT}/sub; done`, `! rm -f ${OUT}/x`,
    `sudo -n rm -rf ${OUT}/sub`, `rm -rf \\\n  ${OUT}/a \\\n  ${OUT}/b`, `(cd ${OUT} && rm -rf sub)`,
    'cd && rm -rf fuera-de-las-raices', `rm -rf {${OUT}/a,${OUT}/b}`, `find -L ${OUT} -name x -delete`,
    `(cd ${OUT} && n=$(ls | wc -l); rm -rf old)`, `cd ${OUT} 2>/dev/null && rm -rf old`,
    `if ! rm -rf ${OUT}/x; then echo no; fi`, `while rm ${OUT}/x; do :; done`,
    `export D=${OUT}; rm -rf $D/sub`, `pushd ${OUT} && rm -rf sub`, `if cd ${OUT}; then rm -rf sub; fi`,
    // El cierre de una función con una redirección no se queda abierto para deshacer un `cd` de verdad.
    `f() { echo a; } >&2\ncd ${OUT}\n{ echo x\n}\nrm -rf sub`,
    // Una función que envuelve al verbo no lo esconde, y llamar a una que no hace `cd` no pierde dónde se está.
    // Una función escrita en una línea se lee igual que en varias: su `cd` vale para lo que sigue adentro.
    `limpia() { cd ${OUT}; rm -rf sub; }`,
    `rm() {\n  echo no\n}\nrm -rf ${OUT}/x`, `rm() {\n  cd /srv/x\n}\nrm -rf ${OUT}/x`,
    'log() {\n  echo x\n}\nlog\nrm -rf ../../../../../../../../no-es-de-nadie',
    // Un binario que se llama como una función no es la función, y el cuerpo de una se lee donde está escrito.
    'go() {\n  cd /srv/x\n}\n./bin/go build\nrm -rf ../../../../../../../../no-es-de-nadie',
    'limpia() {\n  rm -rf ../../../../../../../../no-es-de-nadie\n}',
    // Un grupo entre llaves dentro del cuerpo no cierra la función: lo que sigue sigue siendo de ella.
    'f() {\n  { echo a; }\n  cd "$DIR"\n}\nrm -rf ../../../../../../../../no-es-de-nadie',
    // Ni el `cd` que una función hace dentro de un subshell, que no sale de él.
    'ver() {\n  (cd "$D" && ls)\n}\nver\nrm -rf ../../../../../../../../no-es-de-nadie',
    // Después de llamar a una que sí hace `cd` no se sabe dónde se está, pero una ruta entera se juzga igual.
    `ir() {\n  cd /srv/x\n}\nir\nrm -rf ${OUT}/sub`,
    `main() {\n  prep\n}\nprep() {\n  cd /srv/x\n}\nmain\nrm -rf ${OUT}/sub`,
    `rm -rf "${OUT}/con espacio/sub"`, `cd "${OUT}/con espacio" && rm -rf old`, `cd -P ${OUT} && rm -rf old`,
    `cd "$X"; if cd ${OUT}; then rm -rf sub; fi`, 'if cd ../../../../../../../..; then rm -rf no-es-de-nadie; fi',
  ]
  for (const command of commands) refuses(command, command.includes('no-es-de-nadie') ? /el comando borra/ : REMOVES)
})

test('lo que se borra adentro, en el temporal o sin poder saber dónde sigue pasando', () => {
  const { root, passes } = project('ops-hook-borra-adentro-')
  const commands = [
    'rm -rf service/src', 'rm service/src/a.js', 'rm -rf node_modules', 'rmdir service/src',
    'find service -name "*.tmp" -delete', `rm -rf ${os.tmpdir()}/lo-que-sea`,
    // Sin saber a dónde apunta no se inventa un destino: es la limpieza corriente de cualquier script.
    'rm -rf "$DIR/sub"', 'cd "$DIR" && rm -rf node_modules', 'cd $(mktemp -d) && rm -rf sub', 'rm -rf ~/$CACHE/viejo',
    // Una redirección no es un destino del borrado.
    'rm -f service/a.js 2>/dev/null', 'rm -rf service/src 2> /dev/null || true', 'rm -f service/x > /dev/null 2>&1',
    'cd / && rm -f tmp/x 2> /dev/null',
    // Lo que va entre comillas como argumento de otro comando es un dato, no un borrado de acá.
    `git commit -m "fix: stop the guard; rm -rf ${OUT} is now refused"`, `echo "limpio; rm -rf ${OUT}"`,
    'docker exec app sh -c "cd /app && rm -rf /app/cache"', 'ssh host "systemctl stop x; rm -rf /var/www/old"',
    // También cuando va dentro de una sustitución entre comillas, con sus propias comillas adentro.
    'OUT="$(docker exec app sh -c "cd /app && rm -rf /app/cache")"',
    // Un subshell no deja parado al resto del comando donde hizo su `cd`, tenga adentro lo que tenga.
    '(cd /usr && ls); rm -rf service/src', '(cd service && n=$(ls | wc -l) && cd /var/x); rm -rf old',
    // Lo que una sustitución lee no es lo que el comando borra.
    'rm -f $(cat ~/a-borrar.txt)', 'rm -f $(grep -l foo /usr/share/dict/words service/src/*.js)',
    'rm -rf "service/$(basename /usr/lib/x)"', 'rm -f $(ls /usr/share | head -1)',
    'rm -f `ls /usr/share | head -1`',
    'rm -f $(ls -t /var/backups/app | tail -n +$(cat keep))',
    // Un apóstrofo en un comentario no abre una cadena.
    "# don't stop here\ngit commit -m 'cleanup; rm -rf /var/old'",
    // Un `cd` que no se puede leer deja sin base, no en la carpeta de antes.
    'cd uno dos && rm -rf ../../../../../../../../no-se-sabe', 'popd && rm -rf ../../../../../../../../no-se-sabe',
    // El valor de una asignación es un dato, tenga las palabras que tenga.
    'MSG="chore: rm /etc/foo from image"; git commit -m "$MSG"', 'PROMPT="Please mkdir /data/out and run" node a.js',
    'env NOTE="x touch /etc/hosts" node a.js',
    // Y el cuerpo de un heredoc también, se llame como se llame su delimitador.
    'cat > service/x.sh <<\\EOF\nrm -rf /var/www/old\nEOF', "cat > service/x.sh <<'END-1'\nmkdir /opt/x\nEND-1",
    'cat > service/f.sh <<1\nmkdir /srv/x\n1',
    // Una expansión de parámetro no es una ruta: `${F##*/}` es el nombre del archivo, no su carpeta de afuera.
    `F=${OUT}/plantilla.conf; rm -f \${F##*/}`,
    // Una ruta entre comillas con espacios es una sola, tenga lo que tenga después del espacio.
    'rm -rf "service/a /b"', 'touch "service/a /b"', 'mkdir -p "service/mis docs/ /abs"',
    // El `cd` del cuerpo de una función que nadie llama no mueve nada.
    'f() {\n  cd /\n}\nrm -rf z', 'a() {\n  cd /\n}\nb() {\n  a\n}\nrm -rf z',
    // Tampoco en una línea, ni con un grupo entre llaves antes del `cd`.
    `entra() { cd ${OUT}; }; rm -rf service/src`,
    `prep() {\n  { echo a; date; } >> log\n  cd ${OUT}\n}\nmkdir -p service/build`,
    `entra() { cd ${OUT}; }; entra; rm -rf sub`,
    'f() {\n  { cd /srv/x; }\n}\nf\nrm -rf ../../../../../../../../no-se-sabe',
    // Y si se la llama, no se sigue: el guard no interpreta funciones. Queda sin saber dónde está, que es no
    // juzgar lo relativo; también cuando la llama otra, definida antes o después.
    `ir() {\n  cd ${OUT}\n}\nir\nrm -rf sub`, `a() {\n  cd ${OUT}\n}\nb() {\n  a\n}\nb\nrm -rf sub`,
    `main() {\n  prep\n}\nprep() {\n  cd ${OUT}\n}\nmain\nrm -rf sub`,
    'ir() {\n  cd /srv/x\n}\nir\nrm -rf ../../../../../../../../no-se-sabe',
    'a() {\n  cd /srv/x\n}\nb() {\n  a\n}\nb\nrm -rf ../../../../../../../../no-se-sabe',
    // El `cd` de un subshell dentro de una función no mueve a quien la llama, y un binario no es la función.
    `ver() {\n  (cd ${OUT} && git status)\n}\nver\nmkdir -p service/build`,
    `go() {\n  cd ${OUT}\n}\n./bin/go build\nrm -rf service/src`,
    // Nombrarlo no es borrarlo.
    `echo "rm -rf ${OUT}"`, `find ${OUT} -name x`, `git log --grep 'rm -rf ${OUT}'`,
  ]
  for (const command of commands) passes(command)
  passes('rm -rf src', path.join(root, 'service'))
})

test('borrar un enlace quita el enlace, y borrar a través de él borra lo de afuera', () => {
  const { passes, refuses } = project('ops-hook-borra-enlace-')
  passes('rm service/enlace')
  passes('rm -f service/enlace')
  refuses('rm -rf service/enlace/sub', REMOVES)
  refuses('rm service/enlace/a.js', REMOVES)
  // Con la barra al final se nombra lo de adentro del enlace, no el enlace.
  refuses('rm -rf service/enlace/', REMOVES)
  refuses('rm -rf service/enlace/*', REMOVES)
})

// `destructive` contesta otra pregunta —si un `rm -r` se lleva el árbol— con su propio resolvedor, que este
// caso no toca. Tres revisiones seguidas encontraron una regresión suya por compartirlo; estas formas son las
// que cambiaron de veredicto en el camino, fijadas como estaban antes.
test('lo que destructive frena y deja pasar no cambió con este caso', () => {
  const { root } = project('ops-hook-borra-arbol-')
  const destructive = (command) => execute('destructive', { cwd: root, tool_input: { command } })
  for (const command of ["find . -name '*.tmp' -delete", 'rm -f ./suelto.txt', 'rm -f *',
    'cd "/ruta/con espacio" && rm -rf ./sub', 'if cd service; then rm -rf ./dist; fi',
    'cd "$(git rev-parse --show-toplevel)" && rm -rf ./dist']) assert.doesNotThrow(() => destructive(command), command)
  blocked('destructive', { cwd: root, tool_input: { command: 'rm -rf .' } }, /se lleva el directorio actual/)
  // Un `cd` que ese guard no sabe leer, o que quizá no corre, no saca de la vista el borrado de una raíz.
  for (const command of ['cd "$(git rev-parse --show-toplevel)" && rm -rf service', 'cd -P . && rm -rf service',
    'if [ -d sub ]; then cd sub; fi; rm -rf service', 'cd -- . && rm -rf service',
    'cd /tmp/build 2>/dev/null; rm -rf service', 'cd /nonexistent 2>/dev/null || true; rm -rf service']) {
    blocked('destructive', { cwd: root, tool_input: { command } }, /se lleva la raíz/)
  }
  // `local` fuera de una función falla y deja la variable vacía: el `cd` no va a donde dice.
  blocked('destructive', { cwd: root, tool_input: { command: 'local D=/tmp/copia; cd "$D" && rm -rf .' } },
    /no se puede resolver/)
})

test('una cadena larga de funciones que se llaman no cuelga el guard', () => {
  const { passes } = project('ops-hook-borra-cadena-')
  // Treinta funciones, cada una llamando dos veces a la anterior: repetir sus `cd` al llamarlas duplicaba el
  // trabajo por nivel, y el guard no terminaba.
  const chain = ['f0() {\n  cd /srv/x\n}']
  for (let at = 1; at < 30; at += 1) chain.push(`f${at}() {\n  cd /srv/x\n  f${at - 1}\n  f${at - 1}\n}`)
  const started = Date.now()
  passes([...chain, 'f29', 'rm -rf sub'].join('\n'))
  assert.ok(Date.now() - started < 2000, `tardó ${Date.now() - started} ms`)
  // Y el trabajo crece con el texto, no con su cuadrado: un cuerpo de veinte mil líneas, y ocho mil funciones
  // donde cada una llama a la que se define después.
  const long = Date.now()
  passes(['x() {', ...Array.from({ length: 20000 }, (_, at) => `  echo ${at}`), '}', 'rm -rf service/src'].join('\n'))
  passes([...Array.from({ length: 8000 }, (_, at) => `g${at}() {\n  g${at + 1}\n}`), 'g8000() {\n  cd /srv/x\n}',
    'g0', 'rm -rf sub'].join('\n'))
  assert.ok(Date.now() - long < 2000, `tardó ${Date.now() - long} ms`)
})

test('lo declarado como escribible fuera de las raíces también se puede borrar', () => {
  const { passes, refuses } = project('ops-hook-borra-declarado-', { writableOutsideRoots: [`${OUT}/cache`] })
  passes(`rm -rf ${OUT}/cache/viejo`)
  refuses(`rm -rf ${OUT}/otra`, REMOVES)
})

test('fuera de una instancia no hay límite que cuidar, tampoco al borrar', () => {
  const lone = tempRoot('ops-hook-borra-sin-instancia-')
  assert.doesNotThrow(() => execute('shell-boundary', { cwd: lone, tool_input: { command: `rm -rf ${OUT}/x` } }))
  assert.doesNotThrow(() => execute('shell-boundary', { cwd: lone, tool_input: { command: `echo x > ${OUT}/x` } }))
})

test('crear un archivo vacío o una carpeta afuera es escribir afuera', () => {
  const { passes, refuses } = project('ops-hook-crea-afuera-')
  const WRITES = /el comando escribe en .*fuera-de-las-raices/s
  refuses(`touch ${OUT}/t.txt`, WRITES)
  refuses(`mkdir -p ${OUT}/a/b`, WRITES)
  refuses(`mkdir service/ok ${OUT}/d`, WRITES)
  // Una función que envuelve al verbo no lo esconde.
  refuses(`mkdir() {\n  command mkdir -p "$@"\n}\nmkdir ${OUT}/x`, WRITES)
  passes('touch service/src/t.txt')
  passes('mkdir -p service/a/b')
  // El verbo es el que el comando corre, no una palabra en cualquier lado.
  passes('docker exec app mkdir -p /app/data')
  passes('grep -rn mkdir /usr/share/doc')
  passes(`git commit -m "docs: say it; mkdir ${OUT}/x is refused"`)
  passes('touch -r /etc/hostname service/src/a.js')
  passes('touch -mr /etc/hostname service/src/a.js')
  passes('touch --reference /etc/hostname service/src/a.js')
  passes('mkdir -p "service/$(basename /usr/lib/x)"')
  // Y sin saber dónde quedó parado no se inventa un destino, igual que al borrar.
  passes('cd "$DIR" && mkdir -p build')
  passes('cd "$DIR" && touch .done')
})
