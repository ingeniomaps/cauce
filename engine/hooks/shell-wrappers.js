'use strict'

// Qué corre un comando cuando va detrás de otro, para la lectura por tramos de `shell-changes.js` (casos 454 y 455).
// Qué garantiza: dado el verbo de un tramo y sus palabras, dice qué prefijos se saltean y con cuántas palabras, qué
// bandera cambia la carpeta o el entorno, y qué comando corre un shell o un `eval` desde una sola palabra. No lee el
// comando entero ni sabe de carpetas: eso es de `steps`.

// Lo que va delante de un comando sin sacarlo del shell que corre: lo que un `eval` cambia detrás de esto sigue
// valiendo.
const SAME_SHELL = ['command', 'builtin', 'time', 'if', 'elif', 'then', 'else', 'while', 'until', 'do', '!']
// Las palabras que un shell admite delante del verbo —`sudo` y sus banderas, `env`, `time`, `xargs`…— y las de
// un `if` o de un bucle escritos en una línea. Las asignaciones se saltean aparte, y el paréntesis lo saca
// `unwrapped`.
//
// **Es una lista, y lo que no está se lee como el verbo**: `stdbuf -oL git stash` no juzgaba el `git` (caso 455). No
// hay contra qué compararla —cualquier programa puede correr otro—, así que se decidió así y no leyendo cualquier
// palabra que nombre un comando: eso frenaría `docker exec app rm -rf /app/x`, que corre en otra máquina, y `echo git
// stash`. Un envoltorio nuevo se suma acá y a la prueba que los recorre a todos.
const LEADING = new Set(['sudo', 'env', 'exec', 'nohup', 'nice', 'xargs', 'stdbuf', 'ionice', 'taskset', 'chrt',
  'flock', 'setsid', 'doas', 'unbuffer', ...SAME_SHELL])
// Las banderas de un prefijo que llevan su valor en la palabra siguiente, y cuántas palabras sueltas lleva antes del
// comando: sin saltarlas, `env -u GIT_DIR git stash` o `timeout 10 git stash` tomaban el valor por el comando, y el
// `git` no se juzgaba (caso 454). Las de `sudo` que no trae la versión de esta máquina —`-T`, `-R`— son del manual
// de sudo 1.9.
const VALUED = new Map([
  ['sudo', ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-R', '--user', '--group', '--host',
    '--prompt', '--chdir', '--close-from', '--role', '--type', '--other-user', '--command-timeout', '--chroot']],
  ['env', ['-u', '-C', '-S', '-a', '-f', '--unset', '--chdir', '--split-string', '--argv0', '--file']],
  ['nice', ['-n', '--adjustment']],
  ['exec', ['-a']],
  ['time', ['-f', '-o', '--format', '--output']],
  ['xargs', ['-n', '-L', '-P', '-I', '-d', '-E', '-s', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file']],
  ['timeout', ['-s', '-k', '--signal', '--kill-after']],
  ['stdbuf', ['-i', '-o', '-e', '--input', '--output', '--error']],
  ['ionice', ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid']],
  ['chrt', ['-T', '-P', '-D', '--sched-runtime', '--sched-period', '--sched-deadline']],
  ['flock', ['-w', '-E', '-c', '--timeout', '--conflict-exit-code', '--command']],
  ['doas', ['-u', '-C']],
  ['su', ['-c', '-g', '-G', '-s', '-w', '--command', '--session-command', '--group', '--supp-group', '--shell',
    '--whitelist-environment']],
  ['runuser', ['-c', '-u', '-g', '-G', '-s', '-w', '--command', '--session-command', '--user', '--group',
    '--supp-group', '--shell', '--whitelist-environment']],
])
// La máscara de `taskset`, la prioridad de `chrt`, el archivo de `flock` y el usuario de `su` van sueltos antes del
// comando.
const POSITIONAL = new Map([['timeout', 1], ['taskset', 1], ['chrt', 1], ['flock', 1], ['su', 1], ['runuser', 1]])
// Lo que hace cada bandera de un prefijo además de llevar su valor. `env -C` y `sudo -D` corren el comando en otra
// carpeta; `sudo -i`, `sudo -R` y un `su` de inicio de sesión, en una que no se sabe —la personal del otro usuario,
// otra raíz—. `env -S` parte su valor en palabras, y `flock -c` y `su -c` lo corren con un shell.
const MOVES = { env: ['-C', '--chdir'], sudo: ['-D', '--chdir'] }
const AWAY = { sudo: ['-i', '--login', '-R', '--chroot'], su: ['-', '-l', '--login'], runuser: ['-', '-l', '--login'] }
const RUNS = { flock: ['-c', '--command'], su: ['-c', '--command', '--session-command'],
  runuser: ['-c', '--command', '--session-command'] }

// El comando que otro corre desde una sola palabra: el de `sh -c` y el de `eval`. Se vuelve a leer entero, desde la
// misma carpeta y con el mismo entorno (caso 455). Lo que corre en otra máquina —`ssh`, `docker exec`— no, porque su
// verbo no es éste. En un shell, la primera palabra que no es una bandera es un script, y entonces no hay `-c`; y el
// comando es la primera que no es una bandera después del `-c`: `bash -c -e '…'` y `bash -c -- '…'` también corren.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
// Las opciones de un shell como las lee él: en un grupo como `-euo` o `-oc`, la `c` dice que hay comando y cada `o`
// toma una palabra; el comando es la primera palabra que no es una opción, y un `--` se saltea.
function hidden(verb, rest) {
  if (verb === 'eval') return rest.join(' ')
  if (!SHELLS.has(verb)) return null
  let command = false
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at]
    if (word === '--rcfile' || word === '--init-file') at += 1
    else if (/^[-+][A-Za-z]+$/.test(word)) {
      command = command || (word[0] === '-' && word.includes('c'))
      at += (word.match(/[oO]/g) || []).length
    } else if (!word.startsWith('--')) return command ? word : null
  }
  return null
}
// Las banderas de una palabra de un prefijo, como las lee getopt: `-iu root` son `-i` y `-u root`, el valor de una
// corta va pegado o en la palabra siguiente, y el de una larga, después de `=` o en la siguiente. Leídas de a una
// palabra entera, `sudo -iu root rm …` tomaba `root` por el comando.
function options(leader, word, words) {
  const valued = VALUED.get(leader) || []
  const long = word.match(/^(--[^=]+)=(.*)$/s)
  if (long) return [[long[1], long[2]]]
  if (word.startsWith('--')) return [[word, valued.includes(word) ? words.shift() : undefined]]
  const found = []
  for (let at = 1; at < word.length; at += 1) {
    const flag = `-${word[at]}`
    if (!valued.includes(flag)) found.push([flag, undefined])
    else return [...found, [flag, at + 1 < word.length ? word.slice(at + 1) : words.shift()]]
  }
  return found
}

module.exports = { SAME_SHELL, LEADING, VALUED, POSITIONAL, MOVES, AWAY, RUNS, hidden, options }
