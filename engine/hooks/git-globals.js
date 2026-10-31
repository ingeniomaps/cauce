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
const { masked, segments } = require('./quoting')

const VALUED = '--(?:git-dir|work-tree|namespace|config-env|attr-source)'
const FLAG = new RegExp(`-[Cc](?=\\s|\\\\\\n)|${VALUED}(?:=|(?=\\s|\\\\\\n))`
  + '|--exec-path=|(?:-[pP]|--(?:paginate|no-pager|no-replace-objects|bare|no-optional-locks|no-advice|no-lazy-fetch'
  + '|(?:literal|glob|noglob|icase)-pathspecs))(?=\\s|$)', 'y')
const TAKES_VALUE = new RegExp(`^(?:-[Cc]|${VALUED}=?|--exec-path=)$`)
const SPACE = /\s/
const ENDS_WORD = /[;&|()<>]/
const RUNS_CONFIG = /alias\.|!|\bgit\b/i
const INTERPRETED = /[;&|<>()$`\n\\'"]/

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
      if (flag === '-c' && RUNS_CONFIG.test(text.slice(valueAt, next))) next = plainEnd(text, valueAt)
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
      out += text.slice(copied, start)
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
const PREFIX = String.raw`(?:^|[;&|(\n]\s*)(?:(?:env|sudo)\s+)*`
  + String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)*`
const COMMIT = new RegExp(PREFIX + String.raw`git\s+commit(?:\s|$)`)

function isCommit(command) {
  return COMMIT.test(withoutGitGlobals(command))
}

module.exports = { directoryFlag, isCommit, withoutGitGlobals }
