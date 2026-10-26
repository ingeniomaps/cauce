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
const { LEADING, VALUED, POSITIONAL } = require('../../engine/hooks/shell-wrappers')

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
    // Un prefijo con valor —el usuario, el plazo, la prioridad— no es el comando (caso 454).
    `sudo -u nadie rm -rf ${OUT}/sub`, `timeout 10 rm -rf ${OUT}/sub`, `nice -n 5 rm -rf ${OUT}/sub`,
    `env -C ${OUT} rm -rf sub`,
    'cd && rm -rf fuera-de-las-raices', `rm -rf {${OUT}/a,${OUT}/b}`, `find -L ${OUT} -name x -delete`,
    `(cd ${OUT} && n=$(ls | wc -l); rm -rf old)`, `cd ${OUT} 2>/dev/null && rm -rf old`,
    `if ! rm -rf ${OUT}/x; then echo no; fi`, `while rm ${OUT}/x; do :; done`,
    // Una barra al final seguida de una línea en blanco une con esa línea vacía, no con el comando de abajo.
    `echo hola \\\n\nrm -rf ${OUT}/a`, `echo hola \\\n  \t\nrm -rf ${OUT}/a`, `cd ${OUT} \\\n\nrm -rf sub`,
    `echo hola \\\r\n\r\nrm -rf ${OUT}/a`,
    // Un heredoc que no cierra no tiene cuerpo que sacar: lo que sigue son comandos.
    `cat <<'E-1'\nrm -rf ${OUT}/x`,
    `export D=${OUT}; rm -rf $D/sub`, `pushd ${OUT} && rm -rf sub`, `if cd ${OUT}; then rm -rf sub; fi`,
    `rm -rf "${OUT}/con espacio/sub"`, `cd "${OUT}/con espacio" && rm -rf old`, `cd -P ${OUT} && rm -rf old`,
    `cd "$X"; if cd ${OUT}; then rm -rf sub; fi`, 'if cd ../../../../../../../..; then rm -rf no-es-de-nadie; fi',
  ]
  for (const command of commands) refuses(command, command.includes('no-es-de-nadie') ? /el comando borra/ : REMOVES)
})

test('el paréntesis que cierra un subshell no queda pegado a la ruta que se nombra', () => {
  const { refuses } = project('ops-hook-borra-parentesis-')
  refuses(`(rm -rf ${OUT}/sub)`, /fuera-de-las-raices\/sub, fuera de las raíces/)
  refuses(`(cd ${OUT} && rm -rf sub)`, /fuera-de-las-raices\/sub, fuera de las raíces/)
})

// Caso 455. Un comando que corre adentro de otro —el de `sh -c`, `eval`, `env -S`— o detrás de un envoltorio que la
// lectura no conocía se juzga igual que escrito suelto. Lo que corre en otra máquina o es texto sigue pasando.
test('un borrado o una escritura escondidos detrás de otro comando frenan como escritos sueltos', () => {
  const { refuses, passes } = project('ops-hook-borra-escondido-')
  const far = '../../../../../../../../no-es-de-nadie'
  for (const command of [`sh -c 'rm -rf ${OUT}/sub'`, `bash -lc "rm -rf ${OUT}/sub"`, `eval "rm -rf ${OUT}/sub"`,
    `zsh -c 'rm -rf ${OUT}/sub'`, `bash -o pipefail -c 'rm -rf ${OUT}/sub'`, `su me -c 'rm -rf ${OUT}/sub'`,
    `runuser -l me --command='rm -rf ${OUT}/sub'`, `env --split-string='rm -rf ${OUT}/sub'`,
    `sh -c "cd ${OUT} && rm -rf sub"`, `sh -c "eval 'rm -rf ${OUT}/sub'"`, `sh -c 'touch ${OUT}/x'`,
    `bash --rcfile /dev/null -c 'rm -rf ${OUT}/sub'`, `sh -c -- 'rm -rf ${OUT}/sub'`, `su -lc 'rm -rf ${OUT}/sub'`,
    `eval eval eval 'rm -rf ${OUT}/sub'`, `bash -euo pipefail -c 'rm -rf ${OUT}/sub'`, `bash -c -e 'rm -rf ${OUT}/sub'`,
    `sudo -iu root rm -rf ${OUT}/sub`, `sudo -Eu root rm -rf ${OUT}/sub`, `flock --command='rm -rf ${OUT}/sub' /l`,
    `env -S'rm -rf ${OUT}/sub'`, `runuser -u nadie -- rm -rf ${OUT}/sub`, `eval cd ${OUT}; rm -rf sub`,
    `runuser -u nadie rm -rf ${OUT}/sub`, `runuser -u nadie -m -- rm -rf ${OUT}/sub`,
    `bash -c -o pipefail 'rm -rf ${OUT}/sub'`, `env --chdir ${OUT} rm -rf sub`,
    `bash -co pipefail 'rm -rf ${OUT}/sub'`, `bash -oc pipefail 'rm -rf ${OUT}/sub'`,
    `bash -xoc pipefail 'rm -rf ${OUT}/sub'`, `builtin eval 'rm -rf ${OUT}/sub'`,
    `if eval 'cd ${OUT}'; then rm -rf sub; fi`]) {
    refuses(command, /fuera-de-las-raices.*fuera de las raíces/s)
  }
  for (const command of [`sh -c 'echo x > ${OUT}/f'`, `bash -c 'tee ${OUT}/f'`, `eval 'cp a ${OUT}/f'`,
    `sh -c 'cd ${OUT} && echo x > f'`]) {
    refuses(command, /escribe en .*fuera-de-las-raices/)
  }
  // Lo que escribe un `su -` cae en la carpeta personal del otro usuario: no se sabe dónde, y se frena. Una función
  // definida antes no cambia cómo se leen las escrituras, adentro o afuera.
  refuses(`su - root -c 'echo x > ${far}'`, /no se puede resolver/)
  passes("f() { :; }; sh -c 'echo x > out'")
  for (const command of [`ssh host 'rm -rf ${OUT}/sub'`, `docker exec app sh -c 'rm -rf ${OUT}/sub'`,
    `git commit -m "sh -c 'rm -rf ${OUT}/sub'"`, `bash script.sh -c 'rm -rf ${OUT}/sub'`, `echo rm -rf ${OUT}/sub`,
    "sh -c 'echo x 2>/dev/null'", "sh -c 'rm -rf build'", 'rm -f x 2> "/dev/null"', 'sh -c', 'runuser -u nadie',
    'su nadie', `bash "rm -rf ${OUT}/sub"`,
    // Lo que va detrás de `runuser -u … --` es el comando con sus palabras, no un shell (tercera revisión del 455).
    `runuser -u nadie -- echo "a; rm -rf ${OUT}/sub"`, `runuser -u nadie -- psql -c "rm -rf ${OUT}/sub"`,
    'runuser -u nadie -- cp -l a b', "f() { :; }; eval true; sh -c 'echo x > out'"]) {
    passes(command)
  }
  // Lo relativo de `su -`, `sudo -i` y `sudo -R` no se juzga (el porqué, en `shell-wrappers.js`). Y la carpeta de
  // `env -C` o `sudo -i` vale sólo para su comando.
  for (const command of [`su - root -c 'rm -rf ${far}'`, `su -l root -c 'rm -rf ${far}'`,
    `su -c 'rm -rf ${far}' - root`, `sudo -i rm -rf ${far}`, `sudo -R /r rm -rf ${far}`,
    `sudo --chroot=/r rm -rf ${far}`, `env -C ${OUT} ls; rm -rf build`, `eval 'f() { :; }'; rm -rf ${far}`]) {
    passes(command)
  }
  refuses(`sudo -i true; rm -rf ${far}`, /el comando borra/)
  refuses(`env -C /x eval true; rm -rf ${far}`, /el comando borra/)
  refuses(`sudo -i eval true; rm -rf ${far}`, /el comando borra/)
  // Lo que anida sin fin no se puede leer, y se frena en vez de dejarlo pasar sin juzgar.
  refuses(`${'eval '.repeat(2000)}rm -rf ${OUT}/sub`, /anida más de 16 comandos/)
})

// Los envoltorios son una lista (el porqué, en `LEADING`, `engine/hooks/shell-wrappers.js`): cada uno que se suma
// nace en rojo hasta tener acá su ejemplo, y el ejemplo lo usa como se escribe, con sus banderas con valor. Se
// recorren también los ejemplos, para que sacar uno de la lista no lo saque de la prueba.
const WRAPPED = {
  sudo: 'sudo -T 10 -R /x', env: 'env -a x -f .env -u Y', command: 'command', exec: 'exec -a x', time: 'time -f %e',
  nohup: 'nohup', nice: 'nice -n 5', xargs: 'xargs -n 1', timeout: 'timeout -s KILL 10', stdbuf: 'stdbuf -o L',
  ionice: 'ionice -c 2 -n 7', taskset: 'taskset -c 0,1', chrt: 'chrt -r 10', flock: 'flock -w 5 /var/lock/l',
  setsid: 'setsid -w', doas: 'doas -u root', unbuffer: 'unbuffer', su: 'su -g wheel root',
  runuser: 'runuser -u nadie --', builtin: 'builtin', '!': '!',
}
const KEYWORDS = {
  if: (rm) => `if ${rm}; then :; fi`, elif: (rm) => `if false; then :; elif ${rm}; then :; fi`,
  then: (rm) => `if true; then ${rm}; fi`, else: (rm) => `if false; then :; else ${rm}; fi`,
  while: (rm) => `while ${rm}; do :; done`, until: (rm) => `until ${rm}; do :; done`,
  do: (rm) => `for d in a; do ${rm}; done`,
}
test('cada envoltorio que la lectura conoce deja ver el borrado que lleva detrás', () => {
  const { refuses } = project('ops-hook-borra-envoltorios-')
  const rm = `rm -rf ${OUT}/sub`
  const all = [...LEADING, ...VALUED.keys(), ...POSITIONAL.keys(), ...Object.keys(WRAPPED), ...Object.keys(KEYWORDS)]
  for (const name of new Set(all)) {
    const command = KEYWORDS[name] ? KEYWORDS[name](rm) : WRAPPED[name] && `${WRAPPED[name]} ${rm}`
    assert.ok(command, `${name} no tiene ejemplo en esta prueba`)
    refuses(command, REMOVES)
  }
  refuses(`flock /var/lock/l -c '${rm}'`, REMOVES)
  refuses(`flock -c '${rm}' /var/lock/l`, REMOVES)
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
    // Y lo que viene después de esa línea en blanco no es un destino más del borrado de arriba.
    `rm -rf \\\n  service/a \\\n\n  ${OUT}/b`,
    // Un `<<` que no abre un heredoc —un desplazamiento, uno citado, un here-string— no tapa al que sí lo abre
    // más adelante en la misma línea.
    `N=$((1<<20)); cat > service/limpiar.sh <<\\EOF\nrm -rf ${OUT}/cache\nEOF`,
    `echo "uso: prog << entrada" && cat > service/notas.md <<'FIN-1'\nmkdir ${OUT}/d\nFIN-1`,
    `wc -c <<<hola; cat > service/x.sh <<'E.O.F'\ntouch ${OUT}/t\nE.O.F`,
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

// La regla y su porqué están junto a `steps`, en `engine/hooks/shell-changes.js`. Acá van las formas que cada
// intento anterior de leer una función frenó sin motivo, que tienen que pasar, y el costo de no leerlas.
test('con una función definida en el comando, lo relativo no se juzga y una ruta entera sí', () => {
  const { passes, refuses } = project('ops-hook-borra-funcion-')
  for (const command of [
    `rm() {\n  echo no\n}\nrm -rf ${OUT}/x`, `ir() {\n  cd /srv/x\n}\nir\nrm -rf ${OUT}/sub`,
    `limpia() {\n  rm -rf ${OUT}/sub\n}`, `function f { echo a; }; rm -rf ${OUT}/sub`,
    `f() { echo a; } >&2\nrm -rf ${OUT}/sub`, `limpia() { rm -rf ${OUT}/x; }`,
    // Escrita como se la escriba: con otro nombre, con espacios, con el cuerpo entre paréntesis.
    `ns::limpia() { rm -rf ${OUT}/x; }; ns::limpia`, `limpia() ( rm -rf ${OUT}/x ); limpia`,
    `f ( ) { rm -rf ${OUT}/x; }`, `function ns::f { rm -rf ${OUT}/x; }`,
    // Un arreglo vacío no es una función: después de él se sigue sabiendo dónde se está.
    `archivos=(); cd ${OUT} && rm -rf sub`,
    // Antes de la definición todavía se sabe dónde se está.
    `cd ${OUT} && rm -rf sub\nf() {\n  echo a\n}`,
  ]) refuses(command, REMOVES)
  for (const command of [
    'f() {\n  cd /\n}\nrm -rf z', `entra() { cd ${OUT}; }; rm -rf service/src`,
    // Con la llave en la línea de abajo, o con un nombre que lleva `::` o un punto, también es una función.
    'sale()\n{\n  cd /var/log/app\n}\nrm -rf service/build', 'ns::sale() {\n  cd /var/log/app\n}\nrm -rf service/build',
    'build.clean() {\n  cd /var/log/app\n}\nrm -rf service/build',
    `prep() {\n  { echo a; date; } >> log\n  cd ${OUT}\n}\nmkdir -p service/build`,
    `main() {\n  {\n    make\n  } > >(tee -a build.log) 2>&1\n  cd ${OUT}\n}\nmkdir -p service/build`,
    `f() {\n  for x in a b; do { echo $x; }; done\n  cd ${OUT}\n}\nrm -rf service/build`,
    `ver() {\n  (cd ${OUT} && git status)\n}\nver\nmkdir -p service/build`,
    // El costo: un borrado relativo de verdad, detrás de una función, tampoco se ve.
    `ir() {\n  cd ${OUT}\n}\nir\nrm -rf sub`, `f() { echo a; }\ncd ${OUT}\nrm -rf sub`,
    'log() {\n  echo x\n}\nlog\nrm -rf ../../../../../../../../no-es-de-nadie',
  ]) passes(command)
})

test('un comando largo con funciones y llaves se lee en un tiempo que crece con su tamaño', () => {
  const { passes } = project('ops-hook-borra-largo-')
  const chain = ['f0() {\n  cd /srv/x\n}']
  for (let at = 1; at < 30; at += 1) chain.push(`f${at}() {\n  cd /srv/x\n  f${at - 1}\n  f${at - 1}\n}`)
  const many = (line, count) => Array.from({ length: count }, (_, at) => line(at))
  const started = Date.now()
  passes([...chain, 'f29', 'rm -rf sub'].join('\n'))
  passes(['x() {', ...many((at) => `  echo ${at}`, 20000), '}', 'rm -rf service/src'].join('\n'))
  const helpers = many((at) => `g${at}() {\n  g${at + 1}\n}`, 8000)
  passes([...helpers, 'g8000() {\n  cd /srv/x\n}', 'g0', 'rm -rf sub'].join('\n'))
  passes([...many(() => '{', 20000), ':', ...many(() => '}', 20000), 'rm -rf service/src'].join('\n'))
  // Una corrida larga de espacios o de saltos de línea tampoco.
  passes(`echo${' '.repeat(40000)}x; rm -rf service/src`)
  passes(`echo "${'\n'.repeat(20000)}"; rm -rf service/src`)
  assert.ok(Date.now() - started < 3000, `tardó ${Date.now() - started} ms`)
  // Lo de arriba comparte el tope con lo que el guard ya tardaba antes de este caso, así que la lectura nueva
  // se mide sola: corridas de saltos de línea, de espacios y de paréntesis, que es donde una expresión que
  // vuelve atrás se hace cuadrática.
  const { steps } = require('../../engine/hooks/shell-changes')
  for (const [name, text] of [['saltos de línea', `echo a${'\n'.repeat(80000)}rm -rf service/src`],
    ['espacios', `echo${' '.repeat(80000)}x; rm -rf service/src`],
    ['paréntesis', `echo "${')'.repeat(80000)}" x; rm -rf service/src`],
    ['paréntesis sueltos', `echo ${')'.repeat(80000)} x; rm -rf service/src`],
    ['saltos de Windows', `echo a${'\r\n'.repeat(80000)}rm -rf service/src`],
    // Heredocs que ya llegan sin cuerpo, que es como los deja la lectura común: no hay terminador que buscar.
    ['heredocs', `${'cat <<EOF\n'.repeat(20000)}rm -rf service/src`]]) {
    const from = Date.now()
    steps(text, '/srv/proyecto')
    assert.ok(Date.now() - from < 500, `${name}: ${Date.now() - from} ms`)
  }
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
