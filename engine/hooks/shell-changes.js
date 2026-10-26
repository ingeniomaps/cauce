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
const {
  SAME_SHELL, LEADING, VALUED, POSITIONAL, MOVES, AWAY, RUNS, hidden, reads, output, options,
} = require('./shell-wrappers')

// El tramo de apertura de un heredoc —lo que va antes del `<<` en su línea, y lo que sigue— le pasa el cuerpo a un
// shell, directo o por una tubería. Si no, el cuerpo es dato y se borra; si sí, se marca, y lo que lo corre de verdad
// lo decide `steps` por el verbo de cada tramo.
function feedsShell(before, after) {
  const reading = (text) => steps(text, null).some((one) => one.stdin)
  // `sh 0<<EOF` le da el cuerpo a la entrada por su número.
  if (reading(pieces(before).pop().text.replace(/(^|\s)\d+\s*$/, '$1'))) return true
  const next = pieces(after)
  for (let at = 0; at + 1 < next.length && next[at].piped; at += 1) if (reading(next[at + 1].text)) return true
  return false
}
// El cuerpo que corre un shell queda en la lectura por tramos como una sola palabra marcada, y `steps` lo vuelve a leer
// como el de un `sh -c`, en su propio proceso. Puesto en líneas sueltas, su `cd` seguía valiendo para lo de después y
// un heredoc anidado se leía como órdenes. La marca no llega a la lectura común, `commandOf`, que borra el cuerpo como
// siempre porque lo que ella arma se le muestra a la persona: sólo la ven `asRead` y quien lea su salida.
const FED = '\u0003'
const fed = (body) => `<<<${FED}${Buffer.from(body).toString('base64url')}`
const unfed = (word) => (word.startsWith(FED) ? Buffer.from(word.slice(1), 'base64url').toString() : null)

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
    // `||` no pasa la salida: corre lo de después sólo si lo de antes falló.
    const piped = text[at] === '|' && text[at + 1] !== '|' && text[at - 1] !== '|'
    found.push({ text: text.slice(start, at), opens, closes, piped })
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
    } else if (char === '&' && (/[<>]/.test(text[at - 1]) || text[at + 1] === '>')) continue
    else if ((';&\n'.includes(char) || (char === '|' && text[at - 1] !== '>'))
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
      // Entre comillas dobles la barra sólo escapa `$`, `` ` ``, `"`, `\\` y el salto: `"a\\nb"` lleva la barra.
      else if (char === '\\' && quote === '"' && '$`"\\\n'.includes(text[at + 1] || '')) word += text[at += 1]
      else word += char
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
const OPENS = /(?<!<)<<(?!<)-?\s*\\?(['"]?)(\w[\w.-]*)\1/g
const EXPORTED = /(^|[;&\n])[ \t]*(?:export|readonly)\s+(?=[A-Za-z_]\w*=)/g

// El comando sin el cuerpo de sus heredocs, línea por línea y no con una expresión: una expresión que busca el
// terminador de cada uno recorría el resto del texto por cada `<<EOF` que no lo tiene —mil doscientos milisegundos
// con seis mil—. El cuerpo se quita sólo si su terminador está más abajo; si no, la línea queda como está. El
// terminador se deja, salvo en la primera pasada (`closing`): es una palabra suelta que nadie lee.
function withoutBodies(text, closing = false) {
  const lines = text.split('\n')
  const last = new Map(lines.map((line, at) => [line.trim(), at]))
  const kept = []
  for (let at = 0; at < lines.length; at += 1) {
    kept.push(lines[at])
    // De todos los `<<` de la línea, el primero cuyo terminador está más abajo: un desplazamiento, uno citado o
    // un here-string también se escriben así, y no abren nada.
    const opener = [...lines[at].matchAll(OPENS)].find((one) => last.get(one[2]) > at)
    if (opener === undefined) continue
    const opens = opener[2]
    const line = lines[at]
    const after = line.slice(opener.index + opener[0].length)
    const body = []
    while (lines[at + 1].trim() !== opens) body.push(lines[at += 1])
    if (closing) at += 1
    const before = line.slice(0, opener.index)
    if (feedsShell(before, after)) kept[kept.length - 1] = before + fed(body.join('\n')) + after
  }
  return kept.join('\n')
}

// Las líneas en blanco se juntan antes que nada. No le dicen nada a un shell, y lo que lee el comando de acá
// en más —varias expresiones de las que comparten todos los guards— vuelve atrás en cada corrida de saltos:
// con cuarenta mil tardaba cuatro segundos. Menos la que sigue a una barra: ahí la barra une con esa línea
// vacía, y juntarla la pegaba con el comando de abajo.
//
// Dos pasadas, y la primera se lleva también el terminador: así un cuerpo con un heredoc anidado con sangría, o un
// renglón que abre dos, no deja nada suelto. Es lo que hacían la lectura común y ésta una detrás de la otra, cuando
// a esta lectura le llegaba el comando ya sin cuerpos.
const asRead = (command) => withoutBodies(withoutBodies(String(command)
  .replace(/(?<!\\)\r?\n(?:[ \t\r]*\n)+/g, '\n'), true)).replace(EXPORTED, '$1')

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
  // Lo que el tramo anterior le pasa por tubería a éste.
  let feed = null
  for (const { text, opens, closes, piped } of pieces(expandAssigned(asRead(command)).replace(QUOTED_CD, '$1$3'))) {
    // Sin el comentario ni las redirecciones: `rm -f x 2> /dev/null` no borra ni `2>` ni `/dev/null`, y un
    // `cd /otra 2>/dev/null` es un `cd`. Lo entrecomillado no se toca: es el comando de un `sh -c '…'`, y sin su `>`
    // no se veía lo que escribe (caso 455).
    const held = []
    const mark = (one) => (one[0] === '\\' ? one : `\u0001${held.push(one) - 1}\u0001`)
    const clean = text.replace(QUOTED, mark).replace(/(?:^|\s)#[^\n]*/g, ' ').replace(/\d*<<<\s*\S+/g, ' ')
      .replace(REDIRECTIONS, ' ').replace(/\u0001(\d+)\u0001/g, (_, at) => held[at])
    // Un tramo vacío —el salto o el comentario que sigue a un `|`— no corta la tubería.
    const incoming = feed
    if (clean.trim()) feed = null
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
      let args = false
      let login = false
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
          args = args || word === 'xargs'
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
            if (leader === 'sudo' && ['-s', '--shell', '-i', '--login'].includes(flag)) login = true
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
        // Un shell que lee de la entrada corre lo que le llega por un here-string o por la tubería.
        const string = text.match(/<<<\s*(\S[\s\S]*)$/)
        const word = string && shellWords(string[1])[0]
        const input = string ? unfed(word) ?? word ?? null : incoming
        // Lee de la entrada un shell sin comando, el que abren `sudo -s`, `sudo -i` o `su` sin `-c`, y
        // `source /dev/stdin`. `xargs sh` no: le pasa a `sh` nombres de archivo, no comandos.
        const stdin = !args && (verb ? reads(verb, rest) : login || leader === 'su' || leader === 'runuser')
          || ((verb === 'source' || verb === '.') && rest[0] === '/dev/stdin')
        const script = hidden(verb, rest) ?? (stdin ? input : null)
        if (piped) feed = output(verb, rest, input)
        const at = lost ? null : here
        // `inside` es la carpeta del comando escondido para las escrituras, que no leen funciones (`writes`).
        found.push({ verb, rest, base: at, env: { ...inherited, ...set }, script, inside: here, stdin })
        if (script !== null) {
          const inner = steps(script, at, { ...inherited, ...set }, depth + 1)
          found.push(...inner)
          // `eval` corre en este mismo shell: su `cd` y su `export` valen para lo que sigue, y la asignación de delante
          // no. Con una función definida antes ya no se sabe dónde se está, y eso no cambia.
          // `source` también: el que lee de la entrada corre en el mismo shell.
          if (['eval', 'source', '.'].includes(verb) && !external && !lost) {
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

module.exports = { steps: read, removals, creations, home, asRead, writes }
