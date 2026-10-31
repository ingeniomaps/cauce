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

module.exports = { eachQuoted, masked, segments, shellWord, unquoted }
