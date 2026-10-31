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
const VALUED = '--(?:git-dir|work-tree|namespace|config-env|attr-source)'
const FLAG = new RegExp(`-[Cc](?=\\s|\\\\\\n)|${VALUED}(?:=|(?=\\s|\\\\\\n))`
  + '|--exec-path=|(?:-[pP]|--(?:paginate|no-pager|no-replace-objects|bare|no-optional-locks|no-advice|no-lazy-fetch'
  + '|(?:literal|glob|noglob|icase)-pathspecs))(?=\\s|$)', 'y')
const TAKES_VALUE = new RegExp(`^(?:-[Cc]|${VALUED}=?|--exec-path=)$`)
const SPACE = /\s/
const ENDS_WORD = /[;&|()<>]/
const INTERPRETED = /[;&|<>()$`\n\\'"]/

function plainEnd(text, start) {
  let at = start
  while (at < text.length && !SPACE.test(text[at])) at += 1
  return at
}

function wordEnd(text, start) {
  if (text[start] === '#') return plainEnd(text, start)
  let at = start
  while (at < text.length && !SPACE.test(text[at])) {
    if (ENDS_WORD.test(text[at])) return at
    if (text[at] === '\\') at += 2
    else if (text[at] === "'" || text[at] === '"') {
      const close = text.indexOf(text[at], at + 1)
      if (close < 0 || INTERPRETED.test(text.slice(at + 1, close))) return plainEnd(text, start)
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
      // El valor de `-c` puede ser código: `alias.p='!git push -f'` corre. Se corta en el primer espacio, y
      // lo de adentro
      // queda a la vista.
      next = flag === '-c' || !whole ? plainEnd(text, valueAt) : wordEnd(text, valueAt)
      if (next === valueAt && !flag.endsWith('=')) break
      value = { start: valueAt, end: next }
    }
    globals.push({ flag, value })
    end = next
  }
  return { globals, end }
}

// El valor entero sólo se toma con `git` como primera palabra de todo el comando. En cualquier otro lugar puede ser
// argumento de algo que vuelve a leerlo —`eval git -C 'x push -f'`, `ssh h true \; git …`, `echo git … | bash`—, y un
// separador no dice nada: también se re-parsea. Ahí se lee como antes, y lo que eso deja sin leer es el caso 468.
const COMMAND_HEAD = /^\s*(?:(?:env|sudo)\s+)*(?:[A-Za-z_]\w*=[^\s;&|()<>'"\\`$]*\s+)*$/
const isCommandHead = (text, at) => COMMAND_HEAD.test(text.slice(0, at))

// Sólo se sacan las que van **antes** del subcomando: después significan otra cosa —`git commit -C
// <commit>` reusa el mensaje de otro commit— y el ancla en `git` es lo que las deja afuera.
const withoutGitGlobals = (command) => {
  const text = String(command)
  let out = ''
  let copied = 0
  for (const found of text.matchAll(/\bgit(?=\s)/g)) {
    const start = found.index + found[0].length
    if (start <= copied) continue
    const { globals, end } = scanGlobals(text, start, isCommandHead(text, found.index))
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
  for (const found of text.matchAll(/(?:^|\s)git(?=\s)/g)) {
    const gitAt = found.index + found[0].length - 3
    const head = isCommandHead(text, gitAt)
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

module.exports = { directoryFlag, withoutGitGlobals }
