'use strict'

// Lo que un comando borra o crea sin escribirle nada, resuelto, para el guard de límites (caso 365).
//
// Qué garantiza. De un comando devuelve cada ruta que un `rm`, `unlink`, `rmdir` o `find … -delete` borra, y
// cada una que un `touch` o un `mkdir` crea, con la carpeta contra la que hay que resolverla —o `null` si no
// se puede saber, que es no juzgar—. Lee la forma habitual y no se presenta como completo: un `-exec rm`, un
// `bash -c "…"`, un `python -c` o un script propio no se ven.
//
// Vive aparte de `removal.js`, que contesta otra pregunta para otro guard —si un `rm -r` se lleva el árbol
// entero— y no se toca desde acá. Compartir el resolvedor parecía ahorrar una lectura y costó tres
// regresiones de `destructive` en tres revisiones seguidas: cada forma nueva que este archivo aprendía a leer
// cambiaba lo que aquél frenaba. Las dos lecturas piden cosas opuestas —acá el error caro es frenar un comando
// legítimo, allá es no ver un borrado—, así que cada una tiene la suya.

const os = require('node:os')
const path = require('node:path')
const { expandAssigned } = require('./input')
const { MKTEMP } = require('./mktemp')

// Lo que un shell admite delante del verbo: asignaciones, `sudo` con sus banderas, `time`, un paréntesis, y
// las palabras de un `if` o de un bucle escritos en una línea.
const LEADING = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs', 'if', 'elif', 'then',
  'else', 'while', 'until', 'do', '!'])
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

const REDIRECT = /(?:^|\s)\d*&?[<>]{1,2}&?\d*\s*\S*/g

// Dos lecturas que el resto de los guards no hace, y que por eso se quedan acá en vez de cambiar lo que
// comparten todos: cada una, puesta en la lectura común, le cambiaba el veredicto a `destructive`.
//
// El cuerpo de un heredoc es dato también cuando su delimitador no son sólo letras —`END-1`, `E.O.F`, `1`,
// `\EOF`—: la lectura común deja ese cuerpo, y acá una línea suya con `rm` o `mkdir` se leía como comando.
// Y `export D=…` asigna igual que `D=…`. `local` no: fuera de una función falla y deja la variable vacía.
const HEREDOC_BODY = /<<(-?)\s*\\?(['"]?)(\w[\w.-]*)\2([^\n]*)\n[\s\S]*?^\s*\3\s*$/gm
const EXPORTED = /(^|[;&\n]\s*)(?:export|readonly)\s+(?=[A-Za-z_]\w*=)/g
const asRead = (command) => String(command).replace(HEREDOC_BODY, '<<$3$4').replace(EXPORTED, '$1')

// Cada tramo que corre algo, con su verbo, sus palabras y la carpeta donde queda parado. Un subshell devuelve
// la carpeta al cerrarse: sin eso, `(cd /otra && ls); rm -rf build` juzgaba `build` dentro de `/otra`.
function steps(command, cwd) {
  const { cdTarget, QUOTED_CD } = require('./shell')
  const found = []
  const outer = []
  let base = cwd
  const joined = expandAssigned(asRead(command)).replace(QUOTED_CD, '$1$3')
  for (const { text, opens, closes } of pieces(joined)) {
    for (let level = 0; level < opens; level += 1) outer.push(base)
    // Sin el comentario ni las redirecciones: `rm -f x 2> /dev/null` no borra ni `2>` ni `/dev/null`, y un
    // `cd /otra 2>/dev/null` es un `cd`.
    const piece = text.replace(/(?:^|\s)#[^\n]*/g, ' ').replace(REDIRECT, ' ')
    const cd = piece.match(/^\s*cd(?:\s+(\$\([^)]*\)|\S+))?\s*$/)
    if (cd) {
      const to = cd[1]
      // Sin destino, `cd` deja en la carpeta personal.
      if (to === undefined) base = os.homedir()
      else if (MKTEMP.test(to)) base = path.join(os.tmpdir(), 'mktemp')
      else if (path.isAbsolute(home(to))) base = home(to)
      else base = base === null ? null : cdTarget(to, base)
    } else {
      // La llave que cierra un grupo va suelta; pegada a una ruta es de un `{a,b}`.
      const words = shellWords(withoutSubstitutions(piece).trim().replace(/^[({]+\s*|\s*\)+$|\s+\}+$/g, ''))
      let prefixed = false
      while (words.length && (/^[A-Za-z_]\w*=/.test(words[0]) || LEADING.has(words[0])
        || (prefixed && words[0].startsWith('-')))) prefixed = LEADING.has(words.shift()) || prefixed
      const verb = path.basename(words[0] || '')
      const rest = words.slice(1).filter(Boolean)
      // Un `cd` que no ocupa su tramo limpio: detrás de un `if`, con una bandera, con `pushd`. Se sigue si
      // nombra una sola ruta, y si no queda sin saber dónde está, que es no juzgar.
      if (verb === 'cd' || verb === 'pushd' || verb === 'popd') {
        const to = rest.filter((word) => !word.startsWith('-'))
        const named = to.length === 1 ? home(to[0]) : null
        if (named && path.isAbsolute(named)) base = named
        else base = named && base !== null ? cdTarget(named, base) : null
      } else found.push({ verb, rest, base })
    }
    for (let level = 0; level < closes && outer.length; level += 1) base = outer.pop()
  }
  return found
}

// `{a,b}` son dos rutas, y `carpeta/*` es lo de adentro de la carpeta: la barra se queda, que es lo que hace
// que un enlace se siga.
const expanded = (raw) => {
  const braces = raw.match(/^([^{}]*)\{([^{}]+)\}([^{}]*)$/)
  const all = braces ? braces[2].split(',').map((one) => braces[1] + one + braces[3]) : [raw]
  return all.map((one) => one.replace(/\*$/, '') || '.')
}

// De `find` salen las rutas donde busca, que van entre sus opciones globales y la primera expresión, y sólo
// si trae `-delete`.
const REMOVERS = new Set(['rm', 'unlink', 'rmdir'])
function removals(ran) {
  const { positional } = require('./shell')
  const found = []
  for (const { verb, rest, base } of ran) {
    if (verb === 'find' && rest.includes('-delete')) {
      const paths = rest.slice(rest.findIndex((word) => !/^-(?:[HLP]|O\d*)$/.test(word)))
      const expression = paths.findIndex((word) => /^[-(!]/.test(word))
      for (const raw of expression ? paths.slice(0, expression) : ['.']) found.push({ raw, base })
    }
    if (REMOVERS.has(verb)) for (const raw of positional(rest.join(' ')).flatMap(expanded)) found.push({ raw, base })
  }
  return found
}

// Un archivo vacío o una carpeta. Van por acá y no por la lista de verbos que escriben, que los busca como
// palabra en cualquier lado: `docker exec app mkdir -p /app/data` y `grep -rn mkdir /usr/share/doc` no crean
// nada en esta máquina. De `touch` se saca el archivo del que copia la fecha, que sólo se lee, y la fecha.
const TOUCH_VALUE = /(?:^|\s)(?:-[a-z]*[rdt]|--reference|--date)\s+\S+/g
function creations(ran) {
  const { positional } = require('./shell')
  return ran.filter((one) => one.verb === 'touch' || one.verb === 'mkdir').flatMap(({ verb, rest, base }) => {
    const words = rest.join(' ')
    return positional(verb === 'touch' ? words.replace(TOUCH_VALUE, ' ') : words).map((raw) => ({ raw, base }))
  })
}

module.exports = { steps, removals, creations, home, asRead }
