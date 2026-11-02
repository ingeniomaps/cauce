'use strict'

// Las opciones que van entre `git` y su subcomando, leídas palabra por palabra como las lee el shell. Es un recorrido
// lineal a propósito: expresada como regex, leer la palabra entera dio backtracking exponencial, 24 s con 26 `-C`.
//
// Lo que garantiza: una palabra termina donde termina para el shell, también en `;`, `&`, `|`, paréntesis y
// redirecciones. Y un valor entre comillas se toma entero sólo si adentro no hay nada que el shell interprete, que es
// lo que hace falta para una ruta con espacios. Cualquier otra cosa se corta en el primer espacio y lo que sigue queda
// a la vista de los guards, que es el lado que frena: leer de más se traga órdenes, y cada forma de leer de
// más lo hizo.

// Lo que `git` admite entre el verbo y el subcomando. La lista sale de su propia línea de uso
// —`git --help`, 2.43.0, y las tres que suma 2.53—, y las que llevan el valor en un token aparte se consumen de a dos:
// comprobado ahí mismo que `--git-dir`, `--work-tree` y `--namespace` aceptan la forma separada y no
// sólo la que lleva `=`.
//
// Existe porque cada patrón resolvía la posición por su cuenta y cada arreglo puntual dejaba el
// siguiente: primero el prefijo de entorno en `isCommit`, después el `-C` en `isCommit` y en
// `gitDirectory`. Lo que quedaba era todo lo demás — con `-C`, `-c` o `-P` delante pasaban las reglas
// de `destructive` que miran un subcomando y la prohibición de stagear todo, sin decir nada.
//
// `--git-dir /tmp/.git` era la única forma que igual bloqueaba, y por la razón equivocada: la ruta
// termina en `.git`, así que el patrón encontraba el verbo dentro de `/tmp/.git push`. Una regla que
// acierta por dónde termina una ruta ajena no está cubriendo nada.
const { eachQuoted, masked, segments, shellWord, unquoted } = require('./quoting')

const VALUED = '--(?:git-dir|work-tree|namespace|config-env|attr-source)'
const FLAG = new RegExp(`-[Cc](?=\\s|\\\\\\n)|${VALUED}(?:=|(?=\\s|\\\\\\n))`
  + '|--exec-path=|(?:-[pP]|--(?:paginate|no-pager|no-replace-objects|bare|no-optional-locks|no-advice|no-lazy-fetch'
  + '|(?:literal|glob|noglob|icase)-pathspecs))(?=\\s|$)', 'y')
const TAKES_VALUE = new RegExp(`^(?:-[Cc]|${VALUED}=?|--exec-path=)$`)
const SPACE = /\s/
const ENDS_WORD = /[;&|()<>]/
const RUNS_CONFIG = /alias\.|!|\bgit\b/
const INTERPRETED = /[;&|<>()`\n\\'"]/

function plainEnd(text, start) {
  let at = start
  while (at < text.length && !SPACE.test(text[at])) at += 1
  return at
}

function closingQuote(text, open) {
  if (text[open] === "'") return text.indexOf("'", open + 1)
  for (let at = open + 1; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1
    else if (text[at] === '"') return at
  }
  return -1
}

function wordEnd(text, start) {
  if (text[start] === '#') return plainEnd(text, start)
  let at = start
  while (at < text.length && !SPACE.test(text[at])) {
    if (ENDS_WORD.test(text[at])) return at
    if (text[at] === '\\') at += 2
    else if (text[at] === "'" || text[at] === '"') {
      const close = closingQuote(text, at)
      const inside = close < 0 ? '' : text.slice(at + 1, close).replace(/\\[\s\S]/g, '')
      if (close < 0 || INTERPRETED.test(inside)) return plainEnd(text, start)
      at = close + 1
    } else at += 1
  }
  return Math.min(at, text.length)
}

function skipSpace(text, start) {
  let at = start
  while (at < text.length) {
    if (SPACE.test(text[at])) at += 1
    else if (text[at] === '\\' && text[at + 1] === '\n') at += 2
    else break
  }
  return at
}

// Desde justo después de `git`: las opciones que siguen, cada una con dónde está su valor, y dónde terminan.
function scanGlobals(text, from, whole = true) {
  const globals = []
  let end = from
  while (true) {
    const start = skipSpace(text, end)
    if (start === end) break
    FLAG.lastIndex = start
    const found = FLAG.exec(text)
    if (!found) break
    const flag = found[0]
    let next = start + flag.length
    let value = null
    if (TAKES_VALUE.test(flag)) {
      const valueAt = flag.endsWith('=') ? next : skipSpace(text, next)
      next = whole ? wordEnd(text, valueAt) : plainEnd(text, valueAt)
      // Un valor de `-c` que puede ser código se lee como antes, cortado en el espacio: lo que sobra queda a la vista.
      // El alias y el programa no hace falta cortarlos: `configRuns` los muestra enteros.
      const written = text.slice(valueAt, next)
      if (flag === '-c' && !RUNS_PROGRAM.test(written) && RUNS_CONFIG.test(written)) next = plainEnd(text, valueAt)
      if (next === valueAt && !flag.endsWith('=')) break
      value = { start: valueAt, end: next }
    }
    globals.push({ flag, value })
    end = next
  }
  return { globals, end }
}

// El valor entero sólo se toma con `git` como primera palabra de un comando simple. Si no, puede ser argumento de algo
// que vuelve a leerlo —`eval git -C 'x push -f'`, `ssh h true \; git …`, `echo git … | bash`—, y ahí se lee como antes.
const COMMAND_HEAD = /^\s*(?:(?:env|sudo)\s+)*(?:[A-Za-z_]\w*=[^\s;&|()<>'"\\`$]*\s+)*$/
// Si cada `git` encabeza su comando simple. Se recorre una vez y hacia adelante: los `git` llegan en orden, y partir el
// comando por cada uno costaba minutos con miles de ellos.
function commandHeads(text) {
  const hidden = masked(text)
  const parts = segments(text)
  let index = 0
  return (at) => {
    while (index < parts.length && parts[index].end <= at) index += 1
    const own = parts[index]
    return Boolean(own) && own.start <= at && COMMAND_HEAD.test(hidden.slice(own.start, at))
  }
}

// Sólo se sacan las que van **antes** del subcomando: después significan otra cosa —`git commit -C
// <commit>` reusa el mensaje de otro commit— y el ancla en `git` es lo que las deja afuera.
// Lo que un `-c` hace correr sin que el comando lo diga: un alias, o la configuración que nombra un programa. Se deja
// delante del `git`, a la vista de los guards. Un nombre de clave y no una lista de valores, porque lo que hay que ver
// es la orden, sea cual sea (caso 473).
const RUNS_PROGRAM = new RegExp(String.raw`^["']?(?:alias\.[^=]+`
  + String.raw`|[\w.-]*(?:command|pager|editor|program|helper|fsmonitor|external|textconv|driver))=`, 'i')
function configRuns(text, globals, end) {
  const wordsEnd = globals.reduce((far, { value }) => (value ? Math.max(far, wordEnd(text, value.start)) : far), end)
  const subcommand = (text.slice(skipSpace(text, wordsEnd)).match(/^[^\s;&|)]+/) || [''])[0]
  return globals.flatMap(({ flag, value }) => {
    if (flag !== '-c' || !value) return []
    const stop = Math.max(wordEnd(text, value.start), value.end)
    const word = shellWord(text.slice(value.start, stop))
    if (!RUNS_PROGRAM.test(text.slice(value.start, stop))) return []
    const alias = word.match(/^alias\.([^=]+)=/i)
    // Git no distingue mayúsculas en la clave.
    if (alias && alias[1].toLowerCase() !== subcommand.toLowerCase()) return []
    const run = word.slice(word.indexOf('=') + 1)
    if (run.startsWith('!')) return [run.slice(1)]
    return [alias ? `git ${run}` : run]
  })
}

const withoutGitGlobals = (command) => {
  const text = String(command)
  const isHead = commandHeads(text)
  let out = ''
  let copied = 0
  for (const found of text.matchAll(/\bgit(?=\s)/g)) {
    const start = found.index + found[0].length
    if (start <= copied) continue
    const { globals, end } = scanGlobals(text, start, isHead(found.index))
    if (globals.length) {
      const runs = configRuns(text, globals, end)
      out += text.slice(copied, found.index) + runs.map((one) => `${one} ; `).join('') + text.slice(found.index, start)
      copied = end
    }
  }
  return out + text.slice(copied)
}

// Dónde está el valor del primer `-C` de `text`, o null. Fuera de la primera palabra se lee como antes:
// hasta un separador
// o una comilla, y si las comillas no cierran ahí, no hay valor y cuenta la carpeta de la sesión.
function directoryFlag(text) {
  const isHead = commandHeads(text)
  for (const found of text.matchAll(/(?:^|\s)git(?=\s)/g)) {
    const gitAt = found.index + found[0].length - 3
    const head = isHead(gitAt)
    const { globals } = scanGlobals(text, gitAt + 3, head)
    if (globals.length) {
      const directory = globals.find(({ flag }) => flag === '-C')
      if (!directory) return null
      if (head) return directory.value
      const { start } = directory.value
      const plain = text.slice(start).match(/^(['"]?)([^\s'";&|]+)\1/)
      return plain && { start: start + plain[1].length, end: start + plain[1].length + plain[2].length }
    }
  }
  return null
}

// Lo que un shell admite delante del verbo: asignaciones de entorno, `env` y `sudo`. `VAR=1 git commit`
// empieza por la asignación, así que un ancla que sólo acepta el principio del comando o un separador
// no ve el `git` que viene después.
//
// Falla en los dos sentidos y uno no avisa. Del lado ruidoso, el mensaje del commit vuelve a juzgarse
// como comando. Del silencioso —el que importa— los tres guards que sólo corren sobre un commit dejan
// de correr: gobernanza, dependencias y generados. Cualquier variable delante alcanza, y la ironía es
// que el prefijo que el procedimiento manda escribir para un commit de gobernanza es
// `OPS_GOVERNANCE_OVERRIDE=1`: escrito ahí, el guard no lee el override, directamente no se ejecuta.
// El ancla admite el salto de línea y el `(` por lo mismo que admite `;`: los tres abren un comando. El
// salto es el que más caro salía —dos líneas en un solo Bash es como se escriben dos pasos— y el léxico
// de `shell.js` ya lo declaraba separador; acá faltaba (caso 165).
// Una palabra de bloque abre un comando igual que un separador: `then git commit` también commitea (caso 474). Un `)`
// abre sólo el cuerpo de una función: suelto es prosa, `# 2) git commit`.
// Y un envoltorio no cambia lo que corre: `timeout 60 git commit` commitea (caso 479). Una bandera con valor se lleva
// su palabra, sin alternativa: si la misma palabra pudiera ser las dos cosas, la expresión volvería atrás sin fin.
// `command` va sin banderas: `command -v git` pregunta si existe.
const flagsOf = (valued) => String.raw`(?:\s+(?:${valued})\s+\S+|\s+(?!(?:${valued})\s)-\S+)*`
const WRAPPER = String.raw`(?:env${flagsOf('-u|-C|-S')}|sudo${flagsOf('-u|-g|-h|-p|-C|-D')}`
  + String.raw`|time${flagsOf('-f|-o')}`
  + String.raw`|nice${flagsOf('-n')}|nohup|exec${flagsOf('-a')}|command|cross-env|stdbuf${flagsOf('-i|-o|-e')}`
  + String.raw`|timeout${flagsOf('-s|-k')}\s+\S+)`
const PREFIX = String.raw`(?:^|[;&|(\n]\s*|\)\s*\{\s+)`
  + String.raw`(?:(?:then|else|elif|if|do|while|until|\{|!|function\s+[\w-]+)\s+)*`
  + String.raw`(?:${WRAPPER}\s+)*`
  + String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)*`
// Sólo el `sh -c` que encabeza su comando corre acá: el de un `docker exec` o un `ssh` corre en otra máquina.
const SHELL_C = String.raw`(?:\S*\/)?(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*-\w*c`
const COMMIT = new RegExp(PREFIX + String.raw`(?:${SHELL_C}\s+['"]\s*)?git\s+commit(?:\s|$)`)
const SHELL_SCRIPT = new RegExp(String.raw`^(\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:${WRAPPER}\s+)*${SHELL_C})\s+`
  + String.raw`('[^']*'|"(?:[^"\\]|\\[\s\S])*")\s*$`)
// El comando simple que sólo le pasa un script a un shell, con lo que corre.
function shellScriptOf(part) {
  const found = part.match(SHELL_SCRIPT)
  return found && { head: found[1], script: shellWord(found[2]) }
}

// Lo citado de lo que sólo muestra o busca es dato: `echo 'x; git commit'` no commitea. Vuelve a ser orden si lleva una
// sustitución o si la línea se le pasa a un shell. La lista es de los que sólo leen: uno que nadie anotó sigue
// leyéndose como orden, que es el lado que frena (R27).
const DATA_ONLY = new Set(['sed', 'grep', 'egrep', 'fgrep', 'rg', 'echo', 'printf', 'jq'])
const FEEDS_SHELL = /\|&?\s*(?:sudo\s+)?(?:(?:ba|z|da|k|mk|a)?sh|eval|xargs|source|\.)(?=\s|$)/
const LEADS = new RegExp(`^(?:${WRAPPER}\\s+)*`)
function withoutQuotedData(raw) {
  if (FEEDS_SHELL.test(unquoted(raw))) return raw
  // Un solo recorrido, hacia adelante: buscar el verbo desde el principio por cada cadena costaba minutos con miles.
  const hidden = masked(raw)
  let start = 0
  let scanned = 0
  let first
  return eachQuoted(raw, (quoted, offset) => {
    for (; scanned < offset; scanned += 1) {
      if (';&|\n('.includes(hidden[scanned])) {
        start = scanned + 1
        first = undefined
      }
    }
    if (quoted[0] === '"' && /\$\(|`/.test(quoted)) return quoted
    first ??= hidden.slice(start, offset).trim().replace(LEADS, '').split(/\s+/)
      .find((word) => word && !/^[A-Za-z_]\w*=/.test(word))
    return DATA_ONLY.has(first) ? '\u0000' : quoted
  })
}

function isCommit(command) {
  // Primero lo barato: leer lo citado cuesta, y casi ningún comando commitea.
  return COMMIT.test(withoutGitGlobals(command)) && COMMIT.test(withoutGitGlobals(withoutQuotedData(String(command))))
}

module.exports = {
  directoryFlag, FEEDS_SHELL, isCommit, shellScriptOf, withoutGitGlobals, withoutQuotedData, WRAPPER,
}
