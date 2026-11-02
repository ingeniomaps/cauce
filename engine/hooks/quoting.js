'use strict'

// Dónde empieza y termina lo entrecomillado en un comando de shell. Lo usan los guards para leer un comando sin
// confundir el dato con la orden.

// Vacía lo que va entre comillas, dejando una marca que ningún patrón confunde con una ruta ni con un
// comando. La usan varios lugares por razones distintas, y cada uno explica la suya donde la llama.
//
// Dónde empieza y dónde termina una cadena lo dice el shell, y tiene dos formas de barra invertida que acá
// hay que leer igual que él. Dentro de comillas dobles, `\"` no cierra: sin eso `"\"test\|jest"` terminaba
// en la segunda comilla y dejaba `jest` a la vista de un `grep` que sólo lo busca (caso 312). Fuera de
// comillas, `\"` no abre: es una comilla literal. Las dos van juntas porque arreglar sólo la primera es
// peor que no arreglar ninguna — en `echo \"a\" ; rm -rf x ; echo "b"` la cadena pasaría a empezar en una
// comilla que no abre nada y se llevaría puesto el `rm`. Las simples `'…'` no cambian: no admiten escape.
//
// Un comentario tampoco abre cadenas, y queda a la vista entero: una comilla suelta en uno escondía el
// renglón siguiente. Se deja en vez de sacarlo porque `#` también aparece en `${x/ #/y}`, y ahí sacarlo
// escondería lo que sigue. Lo que esta lectura todavía no conoce está en el caso 328.
const QUOTED = /\\.|'[^']*'|"(?:[^"\\]|\\[\s\S])*"|(?<![^\s;&|()<>])#[^\n]*/g
const eachQuoted = (text, replace) => text.replace(QUOTED,
  (found, offset) => (found[0] === '\\' || found[0] === '#' ? found : replace(found, offset)))
const unquoted = (command) => eachQuoted(String(command), () => '\u0000')

// Una palabra del shell tal como le llega al programa: sin sus comillas y sin los escapes.
const shellWord = (word) => word.replace(/"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|\\\n|\\(.)/g,
  (found, double, single, escaped) => {
    if (double !== undefined) return double.replace(/\\\n/g, '').replace(/\\([$`"\\])/g, '$1')
    if (single !== undefined) return single
    return escaped === undefined ? '' : escaped
  })

// Con cada línea continuada ya unida, como la une el shell: `git \<salto> push -f` es un `git push -f`, y sin esto no
// lo veía ninguna regla (caso 478). No une en un comentario, que termina en su línea, ni en comillas simples.
const ESCAPED_OR_QUOTED = /\\[\s\S]|'[^']*'|"(?:[^"\\]|\\[\s\S])*"|(?<![^\s;&|()<>])#[^\n]*/g
const withoutContinuations = (command) => command.replace(ESCAPED_OR_QUOTED, (found) => {
  if (found === '\\\n') return ''
  return found[0] === '"' ? found.replace(/\\[\s\S]/g, (one) => (one === '\\\n' ? '' : one)) : found
})

// El comando con lo entrecomillado tapado, del mismo largo: lo que se encuentre acá se lee del original en ese lugar.
const masked = (command) => eachQuoted(command, (quoted) => '\u0000'.repeat(quoted.length))

// Los comandos simples de una línea de shell, como rangos. Buscar sobre lo tapado y saltear los escapes es lo que hace
// que `'a; b'` y `a\; b` no separen: los dos los vuelve a leer otro programa, y ahí un separador no dice nada.
function segments(command) {
  const text = masked(command)
  const found = []
  let start = 0
  for (let at = 0; at <= text.length; at += 1) {
    if (text[at] === '\\') at += 1
    else if (at === text.length || /[;&|\n()]/.test(text[at])) {
      if (at > start) found.push({ start, end: at })
      start = at + 1
    }
  }
  return found
}

// Por qué se quita el cuerpo de un heredoc, en `commandOf`. La excepción es lo que el shell corre al armarlo: sin
// comillas en el delimitador, una sustitución se ejecuta, y lo escapado no. Un cuerpo que recibe un shell es entero una
// orden, y va en un subshell porque corre en otro proceso: su `cd` no mueve lo que viene después (casos 456 y 473).
const HEREDOC_OPEN = /<<(-?)\s*(\\?)(['"]?)([A-Za-z_][\w.-]*)\3([^\n]*)\n/y
const SHELL = String.raw`(?:sudo\s+)?(?:(?:ba|z|da|k|mk|a)?sh|eval|xargs|source|\.)`
const PIPES_TO_SHELL = new RegExp(String.raw`\|&?\s*${SHELL}(?=\s|$)`)
const READS_FROM_HEREDOC = new RegExp(String.raw`^\s*${SHELL}(?:\s+-\w+)*\s*$`)

const heredocRuns = (body) => body.replace(/\\[\s\S]/g, '').match(/\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`/g) || []

function heredocLine(command, at, opened) {
  const [found, dash, slash, quote, word, rest] = opened
  const bodyAt = at + found.length
  const closing = new RegExp(String.raw`^\s*${word.replace(/[.-]/g, '\\$&')}\s*$`, 'm')
  const close = closing.exec(command.slice(bodyAt))
  if (!close) return null
  const body = command.slice(bodyAt, bodyAt + close.index)
  const opening = `<<${dash}${slash}${quote}${word}${quote}${rest}`
  const line = command.slice(command.lastIndexOf('\n', at) + 1, at)
  const end = bodyAt + close.index + close[0].length
  if (PIPES_TO_SHELL.test(rest) || READS_FROM_HEREDOC.test(line.split(/[;&|(]/).pop())) {
    return { text: `${opening} ; (${body.trimEnd()}\n)`, end }
  }
  const runs = quote || slash ? [] : heredocRuns(body)
  return { text: `${opening}${runs.length ? ` ${runs.join(' ')}` : ''}`, end }
}

// Un solo recorrido hacia adelante: un `<<` en una cadena o un comentario no abre nada, salvo dentro de un `$(`, que
// vuelve a ser comando. Y las comillas de un comentario o de un cuerpo no cuentan.
function withoutHeredocBodies(command) {
  const open = []
  let out = ''
  let copied = 0
  for (let at = 0; at < command.length; at += 1) {
    const top = open[open.length - 1]
    const char = command[at]
    if (top === "'") {
      if (char === "'") open.pop()
    } else if (char === '\\') at += 1
    else if (char === '"') {
      if (top === '"') open.pop()
      else open.push('"')
    } else if (char === '$' && command[at + 1] === '(') {
      open.push('(')
      at += 1
    } else if (top !== '"' && char === '$' && command[at + 1] === "'") {
      // `$'…'` es la única cadena con `\'` adentro.
      for (at += 2; at < command.length && command[at] !== "'"; at += 1) if (command[at] === '\\') at += 1
    } else if (top !== '"') {
      if (char === "'") open.push("'")
      else if (char === ')' && top === '(') open.pop()
      else if (char === '#' && (at === 0 || /[\s;&|(]/.test(command[at - 1]))) {
        const end = command.indexOf('\n', at)
        at = end < 0 ? command.length : end
      } else if (char === '<' && command[at + 1] === '<' && command[at + 2] !== '<' && command[at - 1] !== '<') {
        HEREDOC_OPEN.lastIndex = at
        const opened = HEREDOC_OPEN.exec(command)
        const heredoc = opened && heredocLine(command, at, opened)
        if (heredoc) {
          out += command.slice(copied, at) + heredoc.text
          copied = heredoc.end
          at = heredoc.end - 1
        }
      }
    }
  }
  return out + command.slice(copied)
}

module.exports = { eachQuoted, heredocRuns, masked, segments, shellWord, unquoted, withoutContinuations,
  withoutHeredocBodies }
