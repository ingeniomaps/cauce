'use strict'

// Lo que un comando borra o crea sin escribirle nada, resuelto, para el guard de límites (caso 365).
//
// Qué garantiza. De un comando devuelve cada ruta que un `rm`, `unlink`, `rmdir` o `find … -delete` borra, y
// cada una que un `touch` o un `mkdir` crea, con la carpeta contra la que hay que resolverla —o `null` si no
// se puede saber, que es no juzgar—. Lee la forma habitual y no se presenta como completo: un `-exec rm`, un
// `python -c` o un script propio no se ven.
//
// Vive aparte de `removal.js`, que contesta otra pregunta para otro guard —si un `rm -r` se lleva el árbol
// entero— y no se toca desde acá. Compartir el resolvedor parecía ahorrar una lectura y costó tres
// regresiones de `destructive` en tres revisiones seguidas: cada forma nueva que este archivo aprendía a leer
// cambiaba lo que aquél frenaba. Las dos lecturas piden cosas opuestas —acá el error caro es frenar un comando
// legítimo, allá es no ver un borrado—, así que cada una tiene la suya.

const os = require('node:os')
const path = require('node:path')
const { block, expandAssigned } = require('./input')
const { MKTEMP } = require('./mktemp')
const { cdTarget, QUOTED_CD, REDIRECTIONS, writesWithBase } = require('./shell-writes')

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
// Cuántos comandos escondidos se leen uno dentro de otro. Más que eso no lo escribe nadie, y leerlo sin tope
// desbordaba la pila: el guard salía con un error que no frena, y el comando pasaba sin juzgar.
const NESTING = 16

// El entorno que deja cada tramo para los que siguen. Lo que se asigna con un valor que no se lee —`+=`, `read`,
// `printf -v`— queda como `UNKNOWN`, que lleva `$` para que nadie lo tome por una ruta. Lo que cambia el entorno sin
// nombrar la variable —`source`, `eval`, `set -a`— no se ve.
const UNKNOWN = '$(?)'
const DECLARES = new Set(['export', 'declare', 'typeset', 'readonly', 'local'])
const NAME = /^[A-Za-z_]\w*$/
function declare(verb, rest, kept) {
  const names = rest.filter((word) => NAME.test(word))
  if (DECLARES.has(verb)) {
    for (const word of rest) {
      const set = word.match(/^([A-Za-z_]\w*)(\+?)=(.*)$/s)
      if (set) kept[set[1]] = set[2] ? UNKNOWN : set[3]
    }
  } else if (verb === 'unset') for (const name of names) delete kept[name]
  else if (['read', 'mapfile', 'readarray'].includes(verb)) for (const name of names) kept[name] = UNKNOWN
  else if (verb === 'printf' && rest.includes('-v') && NAME.test(rest[rest.indexOf('-v') + 1] || '')) {
    kept[rest[rest.indexOf('-v') + 1]] = UNKNOWN
  }
}
const home = (raw) => raw.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$\{?HOME\}?(?=$|\/)/, os.homedir())

// Los tramos de un comando, con cuántos subshells abre y cierra cada uno. No parte dentro de unas comillas ni
// de una sustitución, y un comentario termina en su línea: lo que va entre comillas como argumento de otro
// comando —el mensaje de un commit, lo que corre un `docker exec` en otra máquina— es un dato, y frenarlo es
// frenar un comando legítimo. Un apóstrofo en un comentario no abre una cadena.
//
// Los paréntesis se cuentan sobre el comando entero y no tramo por tramo: el `)` de un `$(ls | wc -l)` queda
// en otro tramo que su `$(`, y contado ahí cerraba un subshell que seguía abierto. Y una sustitución dentro de
// unas comillas dobles abre su propio mundo: en `"$(ssh host "a && b")"` las comillas de adentro son de ella.
function pieces(text) {
  const found = []
  const open = []
  let start = 0
  let quote = ''
  let opens = 0
  let closes = 0
  const cut = (at) => {
    found.push({ text: text.slice(start, at), opens, closes })
    start = at + 1
    opens = 0
    closes = 0
  }
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]
    if (quote) {
      if (char === '\\' && quote === '"') at += 1
      else if (quote === '"' && char === '$' && text[at + 1] === '(') {
        open.push({ kind: '$(', quote })
        quote = ''
        at += 1
      } else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '\\') at += 1
    else if (char === '#' && (at === 0 || /\s/.test(text[at - 1]))) {
      const end = text.indexOf('\n', at)
      at = (end < 0 ? text.length : end) - 1
    } else if (char === '(') {
      const kind = text[at - 1] === '$' ? '$(' : '('
      open.push({ kind, quote: '' })
      if (kind === '(') opens += 1
    } else if (char === ')') {
      const closed = open.pop()
      if (closed && closed.kind === '(') closes += 1
      if (closed) quote = closed.quote
    } else if (char === '`') {
      if (open.length && open[open.length - 1].kind === '`') open.pop()
      else open.push({ kind: '`', quote: '' })
    } else if ((';&\n'.includes(char) || (char === '|' && text[at - 1] !== '>'))
      && !open.some((one) => one.kind !== '(')) cut(at)
  }
  cut(text.length)
  return found
}

// Las palabras de un tramo como las arma un shell: lo que va entre comillas es una sola, con sus espacios. Sin
// esto el valor de `MSG="chore: rm /etc/foo"` se desarmaba y su segunda palabra pasaba por el verbo que corre.
function shellWords(text) {
  const words = []
  let word = null
  let quote = ''
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]
    if (quote) {
      if (char === quote) quote = ''
      else word += char === '\\' && quote === '"' ? text[at += 1] || '' : char
    } else if (char === '"' || char === "'") {
      quote = char
      word = word || ''
    } else if (/\s/.test(char)) {
      if (word !== null) words.push(word)
      word = null
    } else word = (word || '') + (char === '\\' ? text[at += 1] || '' : char)
  }
  return word === null ? words : [...words, word]
}

// Lo que una sustitución lee no es lo que el comando toca: queda como una variable sin resolver. De adentro
// hacia afuera, hasta que no quede ninguna: en `$(ls /a | tail -n +$(cat n))` la de afuera también se va.
function withoutSubstitutions(text) {
  let last = text
  for (let next = last.replace(/\$\([^()]*\)|`[^`]*`/g, '$'); next !== last;) {
    last = next
    next = last.replace(/\$\([^()]*\)|`[^`]*`/g, '$')
  }
  return last
}

// Dos lecturas que no van en la común, `commandOf`: puestas ahí, cada una le cambiaba el veredicto a
// `destructive`. Quien las quiere las pide con `asRead`.
//
// El cuerpo de un heredoc es dato también cuando su delimitador no son sólo letras —`END-1`, `E.O.F`, `1`,
// `\EOF`—: la lectura común deja ese cuerpo, y acá una línea suya con `rm` o `mkdir` se leía como comando.
// Y `export D=…` asigna igual que `D=…`. `local` no: fuera de una función falla y deja la variable vacía.
const OPENS = /<<-?\s*\\?(['"]?)(\w[\w.-]*)\1/g
const EXPORTED = /(^|[;&\n])[ \t]*(?:export|readonly)\s+(?=[A-Za-z_]\w*=)/g

// El comando sin el cuerpo de sus heredocs, línea por línea y no con una expresión: la lectura común ya vació
// los de delimitador corriente, y una expresión que busca el terminador de cada uno recorría el resto del
// texto por cada `<<EOF` que ya no lo tiene —mil doscientos milisegundos con seis mil—. El cuerpo se quita
// sólo si su terminador está más abajo; si no, la línea queda como está. El terminador se deja: es una palabra
// suelta que nadie lee.
function withoutBodies(text) {
  const lines = text.split('\n')
  const last = new Map(lines.map((line, at) => [line.trim(), at]))
  const kept = []
  for (let at = 0; at < lines.length; at += 1) {
    kept.push(lines[at])
    // De todos los `<<` de la línea, el primero cuyo terminador está más abajo: un desplazamiento, uno citado o
    // un here-string también se escriben así, y no abren nada.
    const opens = [...lines[at].matchAll(OPENS)].map((one) => one[2]).find((name) => last.get(name) > at)
    if (opens === undefined) continue
    while (lines[at + 1].trim() !== opens) at += 1
  }
  return kept.join('\n')
}

// Las líneas en blanco se juntan antes que nada. No le dicen nada a un shell, y lo que lee el comando de acá
// en más —varias expresiones de las que comparten todos los guards— vuelve atrás en cada corrida de saltos:
// con cuarenta mil tardaba cuatro segundos. Menos la que sigue a una barra: ahí la barra une con esa línea
// vacía, y juntarla la pegaba con el comando de abajo.
const asRead = (command) => withoutBodies(String(command).replace(/(?<!\\)\r?\n(?:[ \t\r]*\n)+/g, '\n'))
  .replace(EXPORTED, '$1')

// Cada tramo que corre algo, con su verbo, sus palabras y la carpeta donde queda parado. Un subshell devuelve
// la carpeta al cerrarse: sin eso, `(cd /otra && ls); rm -rf build` juzgaba `build` dentro de `/otra`.
//
// Las funciones de shell no se interpretan. Desde que el comando define una, no se sabe dónde se está —su
// cuerpo corre cuando se la llama, desde donde se la llame, y puede hacer `cd`—: lo relativo deja de juzgarse
// y una ruta entera se juzga igual. Es todo. Se intentó leerlas —seguir el `cd` del cuerpo, repetirlo en cada
// llamada, contar las llaves de sus grupos, calcular cuáles mueven— y cinco revisiones seguidas encontraron
// otra forma de leerlas mal: una colgaba el guard, y las demás frenaban comandos legítimos (caso 365).
//
// Qué es definir una se lee ancho, porque equivocarse hacia este lado sólo deja de juzgar lo relativo: el nombre
// que sea —`ns::f`, `build.clean`—, con la llave en la línea de abajo o con el cuerpo entre paréntesis.
const DEFINES = /^\s*(?:function\s+[^\s(){}$=]+(?:\s*\(\s*\))?|[^\s(){}$=]+\s*\(\s*\))\s*[{(]?/

// El tramo sin lo que lo envuelve: el paréntesis o la llave que lo abre y los paréntesis que lo cierran. Los de
// cierre se cuentan desde el final, a mano: una expresión anclada al final vuelve atrás en cada corrida de
// espacios o de paréntesis que no sea la última, y con ochenta mil tardaba segundos. La llave que cierra un
// grupo no hace falta sacarla: va en su propio tramo.
function unwrapped(text) {
  const open = text.trim().replace(/^[({]+\s*/, '')
  let end = open.length
  while (end && open[end - 1] === ')') end -= 1
  return open.slice(0, end).trimEnd()
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
const QUOTED = /\\[\s\S]|"(?:\\[\s\S]|[^"\\])*"|'[^']*'/g
function steps(command, cwd, env = {}, depth = 0) {
  if (depth > NESTING) {
    block(`el comando anida más de ${NESTING} comandos uno dentro de otro (\`sh -c\`, \`eval\`…), y así no se puede `
      + 'juzgar qué cambia. Escribí el de adentro directo.')
  }
  const found = []
  const outer = []
  let base = cwd
  let lost = false
  // Las variables que el comando deja puestas para lo que sigue, como `export GIT_DIR=…`, y las de afuera de cada
  // subshell; las que van delante de un comando valen sólo para él.
  let kept = { ...env }
  const scopes = []
  for (const { text, opens, closes } of pieces(expandAssigned(asRead(command)).replace(QUOTED_CD, '$1$3'))) {
    // Sin el comentario ni las redirecciones: `rm -f x 2> /dev/null` no borra ni `2>` ni `/dev/null`, y un
    // `cd /otra 2>/dev/null` es un `cd`. Lo entrecomillado no se toca: es el comando de un `sh -c '…'`, y sin su `>`
    // no se veía lo que escribe (caso 455).
    const held = []
    const mark = (one) => (one[0] === '\\' ? one : `\u0001${held.push(one) - 1}\u0001`)
    const clean = text.replace(QUOTED, mark).replace(/(?:^|\s)#[^\n]*/g, ' ').replace(REDIRECTIONS, ' ')
      .replace(/\u0001(\d+)\u0001/g, (_, at) => held[at])
    const header = clean.match(DEFINES)
    if (header) lost = true
    const piece = header ? clean.slice(header[0].length) : clean
    for (let level = 0; level < opens; level += 1) {
      outer.push(base)
      scopes.push({ ...kept })
    }
    const cd = piece.match(/^\s*cd(?:\s+(\$\([^)]*\)|\S+))?\s*$/)
    if (cd) {
      const to = cd[1]
      // Sin destino, `cd` deja en la carpeta personal.
      if (to === undefined) base = os.homedir()
      else if (MKTEMP.test(to)) base = path.join(os.tmpdir(), 'mktemp')
      else if (path.isAbsolute(home(to))) base = home(to)
      else base = cdTarget(to, base)
    } else {
      const words = shellWords(unwrapped(withoutSubstitutions(piece)))
      let prefixed = false
      let leader = ''
      let external = false
      let loose = 0
      let inherited = { ...kept }
      // La carpeta de este comando: `env -C`, `sudo -D` y `sudo -i` la cambian sólo para él.
      let here = base
      const set = {}
      const isLeader = (word) => LEADING.has(word) || VALUED.has(word)
      while (words.length && (/^[A-Za-z_]\w*\+?=/.test(words[0]) || isLeader(words[0])
        || (prefixed && words[0].startsWith('-')) || loose)) {
        const word = words.shift()
        const assigned = word.match(/^([A-Za-z_]\w*)(\+?)=(.*)$/s)
        if (isLeader(word)) {
          external = external || !SAME_SHELL.includes(word)
          leader = word
          loose = POSITIONAL.get(word) || 0
        } else if (assigned) set[assigned[1]] = assigned[2] ? UNKNOWN : assigned[3]
        else if (!word.startsWith('-')) loose -= 1
        else if (leader === 'env' && word === '-') inherited = {}
        else {
          for (const [flag, value] of word === '-' ? [['-']] : options(leader, word, words)) {
            if (leader === 'env' && (flag === '-u' || flag === '--unset')) delete inherited[value]
            if (leader === 'env' && (flag === '-i' || flag === '--ignore-environment')) inherited = {}
            if ((MOVES[leader] || []).includes(flag) && value !== undefined) here = cdTarget(home(value), here)
            if ((AWAY[leader] || []).includes(flag)) here = null
            // Un `su` de inicio de sesión empieza con el entorno limpio.
            if (leader !== 'sudo' && (AWAY[leader] || []).includes(flag)) inherited = {}
            if (leader === 'env' && ['-S', '--split-string'].includes(flag)) words.unshift(...shellWords(value || ''))
            // Con `runuser -u` el usuario ya está, y lo que sigue es el comando.
            if (leader === 'runuser' && (flag === '-u' || flag === '--user')) loose = 0
            // Lo que sigue al comando de `flock -c` es su archivo, y el de `su -c`, sus argumentos: ya no queda nada
            // suelto que saltear.
            if ((RUNS[leader] || []).includes(flag)) {
              // `su -c '…' - root` también es de inicio de sesión.
              if (words.some((one) => (AWAY[leader] || []).includes(one))) {
                here = null
                inherited = {}
              }
              words.splice(0, words.length, 'sh', '-c', value || '')
              loose = 0
            }
          }
        }
        prefixed = prefixed || isLeader(word)
      }
      const verb = path.basename(words[0] || '')
      if (!verb) Object.assign(kept, set)
      const rest = words.slice(1).filter(Boolean)
      declare(verb, rest, kept)
      // Un `cd` que no ocupa su tramo limpio: detrás de un `if`, con una bandera, con `pushd`. Se sigue si
      // nombra una sola ruta, y si no queda sin saber dónde está, que es no juzgar.
      if (verb === 'cd' || verb === 'pushd' || verb === 'popd') {
        const to = rest.filter((word) => !word.startsWith('-'))
        const named = to.length === 1 ? home(to[0]) : null
        if (named && path.isAbsolute(named)) base = named
        else base = named ? cdTarget(named, base) : null
      } else {
        const script = hidden(verb, rest)
        const at = lost ? null : here
        // `inside` es la carpeta del comando escondido para las escrituras, que no leen funciones (`writes`).
        found.push({ verb, rest, base: at, env: { ...inherited, ...set }, script, inside: here })
        if (script !== null) {
          const inner = steps(script, at, { ...inherited, ...set }, depth + 1)
          found.push(...inner)
          // `eval` corre en este mismo shell: su `cd` y su `export` valen para lo que sigue, y la asignación de delante
          // no. Con una función definida antes ya no se sabe dónde se está, y eso no cambia.
          if (verb === 'eval' && !external && !lost) {
            base = inner.state.base
            kept = inner.state.kept
            lost = inner.state.lost
            for (const name of Object.keys(set)) {
              if (kept[name] !== set[name]) continue
              if (name in inherited) kept[name] = inherited[name]
              else delete kept[name]
            }
          }
        }
      }
    }
    for (let level = 0; level < closes && outer.length; level += 1) {
      base = outer.pop()
      kept = scopes.pop()
    }
  }
  found.state = { base, kept, lost }
  return found
}

// La lectura de un comando se pide desde varios guards del mismo grupo, y con un comando largo cuesta: se guarda la
// última. La carpeta personal y el temporal entran en la clave porque la lectura los usa.
let last = null
function read(command, cwd) {
  const key = [command, cwd, os.homedir(), os.tmpdir()].join('\0')
  if (last?.key !== key) last = { key, ran: steps(command, cwd) }
  return last.ran
}

// `{a,b}` son dos rutas, y `carpeta/*` es lo de adentro de la carpeta: la barra se queda, que es lo que hace
// que un enlace se siga. `${F##*/}` también lleva llaves y no es una lista: sin coma, o con `$` delante, no se toca.
const expanded = (raw) => {
  const braces = raw.match(/^([^{}]*[^{}$])?\{([^{}]*,[^{}]*)\}([^{}]*)$/)
  const all = braces ? braces[2].split(',').map((one) => (braces[1] || '') + one + braces[3]) : [raw]
  return all.map((one) => one.replace(/\*$/, '') || '.')
}

const REMOVERS = new Set(['rm', 'unlink', 'rmdir'])
// Las palabras llegan armadas por `shellWords` y se usan así: unirlas con un espacio para volver a partirlas
// desarmaba la ruta entre comillas que traía uno.
const targets = (words) => words.filter((word) => word && !word.startsWith('-'))
// De `find` salen las rutas donde busca, que van entre sus opciones globales y la primera expresión, y sólo
// si trae `-delete`.
function removals(ran) {
  const found = []
  for (const { verb, rest, base } of ran) {
    if (verb === 'find' && rest.includes('-delete')) {
      const paths = rest.slice(rest.findIndex((word) => !/^-(?:[HLP]|O\d*)$/.test(word)))
      const expression = paths.findIndex((word) => /^[-(!]/.test(word))
      for (const raw of expression ? paths.slice(0, expression) : ['.']) found.push({ raw, base })
    }
    if (REMOVERS.has(verb)) for (const raw of targets(rest).flatMap(expanded)) found.push({ raw, base })
  }
  return found
}

// Un archivo vacío o una carpeta. Van por acá y no por la lista de verbos que escriben, que los busca como
// palabra en cualquier lado: `docker exec app mkdir -p /app/data` y `grep -rn mkdir /usr/share/doc` no crean
// nada en esta máquina. De `touch` se saca el archivo del que copia la fecha, que sólo se lee, y la fecha.
const TOUCH_VALUE = /^(?:-[a-z]*[rdt]|--reference|--date)$/
function creations(ran) {
  return ran.filter((one) => one.verb === 'touch' || one.verb === 'mkdir').flatMap(({ verb, rest, base }) => {
    const words = verb === 'touch' ? rest.filter((word, at) => !TOUCH_VALUE.test(rest[at - 1] || '')) : rest
    return targets(words).map((raw) => ({ raw, base }))
  })
}

// Lo que escribe un comando, también lo que corre adentro de otro: la lectura de escrituras vacía las comillas, y
// con ellas el `echo x > f` de un `sh -c '…'` (caso 455). Cada comando escondido, desde la carpeta donde corre.
// Lo de un `eval` sin comillas se ve de afuera y de adentro, y se nombra una vez.
function writes(command, cwd) {
  const inner = read(command, cwd).filter((one) => one.script !== null)
    .flatMap((one) => writesWithBase(asRead(one.script), one.inside))
  const seen = new Set()
  return [...writesWithBase(asRead(command), cwd), ...inner].filter((one) => {
    const key = `${one.raw}\0${one.base}`
    return !seen.has(key) && seen.add(key)
  })
}

module.exports = { steps: read, removals, creations, home, asRead, writes, LEADING, VALUED, POSITIONAL }
