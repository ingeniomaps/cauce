'use strict'

// Lo que un comando borra, resuelto. Las reglas de `destructive` miran cómo está escrito el destino —`/`,
// `~`, `..`— y R23 dice que la comprobación es del destino y no de la intención: `rm -rf .` es el cwd, y
// `cd $X && rm -rf .` con `X` vacío es el cwd también (caso 337). Vive aparte de `shell.js` por lo mismo que
// `mktemp.js`: es una sola pregunta —a dónde cae un borrado— y la contesta siguiendo el `cd` tramo a tramo.
//
// Lo que `shell.js` presta —`cdTarget`, `positional`, `QUOTED_CD`— se pide al usarlo y no al cargar, porque
// `shell.js` carga este archivo: pedirlo arriba dejaría los tres sin definir.

const os = require('node:os')
const path = require('node:path')
const { cwdOf, opsRoot, configOf, expandAssigned } = require('./input')
const { MKTEMP } = require('./mktemp')

// Un `cd $(mktemp -d)` cae en un temporal que no contiene nada de lo que se cuida; un `cd` a una ruta absoluta
// vuelve a dar base aunque la anterior no se haya resuelto. El verbo se busca detrás de lo que un shell admite
// delante —asignaciones, `sudo` con sus banderas, `time`, un paréntesis, las palabras de un `if` o de un bucle
// escritos en una línea—, igual que `test-evidence-shell`: `sudo rm -rf .` es el mismo borrado (revisión del
// 337). Un glob se juzga por su carpeta: `rm -rf *` vacía el cwd como `rm -rf .`.
const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs', 'if', 'elif', 'then',
  'else', 'while', 'until', 'do', '!'])
const home = (raw) => raw.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$\{?HOME\}?(?=$|\/)/, os.homedir())

// Los tramos de un comando, con cuántos subshells abre y cierra cada uno. Hay dos lecturas y no son la misma
// a propósito.
//
// `destructive` parte en todo separador, también dentro de una cadena: así ve el `rm -rf .` que va adentro de
// un `sh -c "…"`, y lo que cuida no admite el error de no verlo.
//
// El guard de límites lee con cuidado (`careful`): no parte dentro de unas comillas ni de una sustitución, y
// un comentario termina en su línea. Lo que va entre comillas como argumento de otro comando —el mensaje de
// un commit, lo que corre un `docker exec` en otra máquina— es un dato, y frenarlo es frenar un comando
// legítimo. Un apóstrofo en un comentario no abre una cadena.
//
// Los paréntesis se cuentan sobre el comando entero y no tramo por tramo: el `)` de un `$(ls | wc -l)` queda
// en otro tramo que su `$(`, y contado ahí cerraba un subshell que seguía abierto.
function pieces(text, careful) {
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
    if (careful && quote) {
      if (char === '\\' && quote === '"') at += 1
      else if (char === quote) quote = ''
    } else if (careful && (char === '"' || char === "'")) quote = char
    else if (careful && char === '\\') at += 1
    else if (careful && char === '#' && (at === 0 || /\s/.test(text[at - 1]))) {
      const end = text.indexOf('\n', at)
      at = (end < 0 ? text.length : end) - 1
    } else if (char === '(') {
      const kind = text[at - 1] === '$' ? '$(' : '('
      open.push(kind)
      if (kind === '(') opens += 1
    } else if (char === ')') {
      if (open.pop() === '(') closes += 1
    } else if (char === '`') {
      if (open[open.length - 1] === '`') open.pop()
      else open.push('`')
    } else if ((';&\n'.includes(char) || (char === '|' && text[at - 1] !== '>'))
      && !(careful && open.some((kind) => kind !== '('))) cut(at)
  }
  cut(text.length)
  return found
}

const REDIRECT = /(?:^|\s)\d*&?[<>]{1,2}&?\d*\s*\S*/g

// Las palabras de un tramo como las arma un shell: lo que va entre comillas es una sola, con sus espacios. Sin
// esto el valor de `MSG="chore: rm /etc/foo"` se desarmaba y su segunda palabra pasaba por el verbo que corre; y
// al revés, en `VAR="a b" rm -rf .` el verbo que se leía era `b`, y el borrado no se veía.
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

// Cada tramo que corre algo, con su verbo, sus palabras y la carpeta donde queda parado. Un subshell devuelve
// la carpeta al cerrarse: sin eso, `(cd /otra && ls); rm -rf build` juzgaba `build` dentro de `/otra`.
function steps(command, cwd, careful) {
  const { cdTarget, QUOTED_CD } = require('./shell')
  const found = []
  const outer = []
  let base = cwd
  // Una barra al final de la línea sigue el mismo comando en la de abajo.
  const joined = expandAssigned(command).replace(/\\\n/g, ' ').replace(QUOTED_CD, '$1$3')
  for (const { text, opens, closes } of pieces(joined, careful)) {
    for (let level = 0; level < opens; level += 1) outer.push(base)
    // Sin el comentario ni las redirecciones: `rm -f x 2> /dev/null` no borra ni `2>` ni `/dev/null`, y un
    // `cd /otra 2>/dev/null` es un `cd`.
    const piece = (careful ? text.replace(/(?:^|\s)#[^\n]*/g, ' ') : text).replace(REDIRECT, ' ')
    const cd = piece.match(/^[\s({]*cd(?:\s+(\$\([^)]*\)|[^\s)]+))?[\s)}]*$/)
    if (cd) {
      const to = cd[1]
      // Sin destino, `cd` deja en la carpeta personal.
      if (to === undefined) base = os.homedir()
      else if (MKTEMP.test(to)) base = path.join(os.tmpdir(), 'mktemp')
      else if (path.isAbsolute(home(to))) base = home(to)
      else base = base === null ? null : cdTarget(to, base)
    } else {
      // Lo que una sustitución lee no es lo que el comando toca: queda como una variable sin resolver. Y la
      // llave que cierra un grupo va suelta; pegada a una ruta es de un `{a,b}`.
      const bare = piece.replace(/\$\([^()]*\)|`[^`]*`/g, '$').trim().replace(/^[({]+\s*|\s*\)+$|\s+\}+$/g, '')
      const words = shellWords(bare)
      let prefixed = false
      while (words.length && (/^[A-Za-z_]\w*=/.test(words[0]) || PREFIXES.has(words[0])
        || (prefixed && words[0].startsWith('-')))) prefixed = PREFIXES.has(words.shift()) || prefixed
      const verb = path.basename(words[0] || '')
      const rest = words.slice(1).filter(Boolean)
      // Un `cd` que no ocupa su tramo limpio: detrás de un `if`, con una bandera, con `pushd`. El guard de
      // límites lo sigue si nombra una sola ruta, y si no queda sin saber dónde está, que es no juzgar.
      // `destructive` lo ignora, como siempre: para él sin base es frenar `./x`, y un `cd` que quizá no
      // corre no puede sacar de la vista el `rm -rf` de una raíz.
      if (verb === 'cd' || verb === 'pushd' || verb === 'popd') {
        const to = rest.filter((word) => !word.startsWith('-'))
        const named = to.length === 1 ? home(to[0]) : null
        if (careful && named && path.isAbsolute(named)) base = named
        else if (careful) base = named && base !== null ? cdTarget(named, base) : null
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

// Cada cosa que un comando borra, con la carpeta contra la que se resuelve. `tree` marca el `rm -r`, que es
// el único que `destructive` juzga: un `find . -name '*.tmp' -delete` también recorre el árbol y es limpieza
// corriente, así que no entra en esa regla. El guard de límites los mira todos (caso 365).
//
// De `find` salen las rutas donde busca, que van entre sus opciones globales y la primera expresión, y sólo
// si trae `-delete`. Un `-exec rm` no se ve: es de lo que este grupo de guards no puede leer, y no se
// presenta como si pudiera.
const REMOVERS = new Set(['rm', 'unlink', 'rmdir'])
function removals(ran) {
  const { positional } = require('./shell')
  const found = []
  for (const { verb, rest, base } of ran) {
    if (verb === 'find' && rest.includes('-delete')) {
      const paths = rest.slice(rest.findIndex((word) => !/^-(?:[HLP]|O\d*)$/.test(word)))
      const expression = paths.findIndex((word) => /^[-(!]/.test(word))
      for (const raw of expression ? paths.slice(0, expression) : ['.']) found.push({ raw, base, tree: false })
    }
    if (!REMOVERS.has(verb)) continue
    const flags = rest.filter((word) => word.startsWith('-') && word !== '--')
    const tree = verb === 'rm' && flags.some((flag) => /^-[^-]*r/i.test(flag) || flag === '--recursive')
    for (const raw of positional(rest.join(' ')).flatMap(expanded)) found.push({ raw, base, tree })
  }
  return found
}

// Lo que un comando crea sin escribirle nada: un archivo vacío o una carpeta. Va por acá y no por la lista de
// verbos que escriben, que los busca como palabra en cualquier lado: `docker exec app mkdir -p /app/data` y
// `grep -rn mkdir /usr/share/doc` no crean nada en esta máquina. De `touch` se saca el archivo del que copia
// la fecha, que sólo se lee, y la fecha misma.
const TOUCH_VALUE = /(?:^|\s)(?:-[a-z]*[rdt]|--reference|--date)\s+\S+/g
function creations(ran) {
  const { positional } = require('./shell')
  return ran.filter((one) => one.verb === 'touch' || one.verb === 'mkdir').flatMap(({ verb, rest, base }) => {
    const words = rest.join(' ')
    return positional(verb === 'touch' ? words.replace(TOUCH_VALUE, ' ') : words).map((raw) => ({ raw, base }))
  })
}

const removedDirectories = (command, cwd) => removals(steps(command, cwd, false)).filter((one) => one.tree)

// Sin salida por chat ni por archivo, como la regla de `/` y `~`: es la clase que gobierna R23. Se cuida
// el directorio actual, la raíz ops y las raíces declaradas, nombradas enteras o por un ancestro.
function removesTheTree(input, command) {
  const cwd = cwdOf(input)
  const ops = opsRoot(input)
  const roots = ops ? (configOf(ops).workspaceRoots || []).filter((one) => one && one.path) : []
  // La carpeta personal también: un `cd` sin destino deja ahí, y puede no contener al proyecto.
  const kept = [cwd, ...(ops ? [ops] : []), ...roots.map((one) => path.resolve(ops, one.path)), os.homedir()]
  for (const { raw, base } of removedDirectories(command, cwd)) {
    if (/[$`\u0000]/.test(raw)) continue
    const named = home(raw)
    // Sin base no se juzga una subcarpeta nombrada —`cd "$DIR" && rm -rf node_modules` es limpieza corriente—,
    // sólo el árbol mismo: `.`, `..` y lo que cuelga de ellos. Con `X` vacío, `cd $X` es `cd`, que deja en la
    // carpeta personal, y `rm -rf .` la borra.
    if (base === null && !path.isAbsolute(named)) {
      if (!/^\.\.?(?:\/|$)/.test(path.normalize(named) === '.' ? './' : named)) continue
      return `el comando hace \`cd\` a un destino que no se puede resolver acá y después borra ${raw}: con la `
        + 'variable vacía el `cd` deja en la carpeta personal y el borrado se la lleva (R23). Escribí la ruta '
        + 'absoluta.'
    }
    const target = path.resolve(base || '/', named)
    const hit = kept.find((one) => one === target || one.startsWith(target + path.sep))
    if (!hit) continue
    const what = hit === cwd ? 'el directorio actual' : hit === ops ? 'la raíz ops'
      : hit === os.homedir() ? 'la carpeta personal' : `la raíz ${hit}`
    return `'rm -r' sobre ${target} se lleva ${what} (destino resuelto desde ${base}): es la clase que `
      + 'gobierna R23 y no tiene salida. Nombrá la carpeta concreta que querés borrar.'
  }
  return null
}

module.exports = { removesTheTree, steps, removals, creations, home }
