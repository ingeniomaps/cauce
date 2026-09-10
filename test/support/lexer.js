'use strict'

// Desnudar un archivo de JavaScript sin parsearlo: se van comentarios, cadenas, templates y literales
// de regex, y queda la estructura. Tres puertas de `workflows.test.js` leían así los recorridos, cada
// una con su propio recorte, y las tres se equivocaban distinto sobre lo mismo. Vive acá para poder
// medirse sola: la regla que decide si un `/` abre un regex o divide no se puede ejercitar a través de
// una puerta que corre sobre los nueve recorridos que hoy existen.

// `/` es ambiguo en JavaScript —abre un regex o divide— y lo decide el token que tiene delante. Sin
// esta distinción el lexer leía el `//` que queda al cerrar un regex escapado —`\//g`— como el arranque
// de un comentario y se comía el resto de la línea. Eso no es ruidoso: **es silencioso y hacia abajo**,
// que es la dirección cara. `uno.replace(/x\//g, '') + noExiste(1)` dejaba a `noExiste` invisible para
// la puerta que existe justo para verlo, y hoy hay cuatro líneas así en dos recorridos (caso 084).
//
// La decisión es por el carácter anterior y tiene dos bordes conocidos, los dos raros y los dos hacia el
// falso positivo: `)` cierra una condición —`if (x) /re/.test(y)`— y una cadena o un template ya se
// reemplazaron por un espacio, así que dividir por uno se lee como abrir un regex.
const DIVIDE_ANTES = /[\w$)\]]$/
const NO_DIVIDEN = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do',
  'else', 'yield', 'await', 'instanceof'])

function opensRegex(emitted) {
  const previo = emitted.replace(/\s+$/, '')
  if (!previo || !DIVIDE_ANTES.test(previo)) return true
  return NO_DIVIDEN.has((previo.match(/[A-Za-z_$][\w$]*$/) || [''])[0])
}

// Devuelve dónde termina el regex que arranca en `from`, o -1 si no termina en su línea: un literal de
// regex no cruza líneas, así que lo que no cierra no era uno y se deja pasar como división.
function regexEnds(src, from) {
  let i = from + 1
  let klass = false
  while (i < src.length && src[i] !== '\n') {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === '[') klass = true
    else if (src[i] === ']') klass = false
    else if (src[i] === '/' && !klass) {
      i += 1
      while (i < src.length && /[a-z]/.test(src[i])) i += 1
      return i
    }
    i += 1
  }
  return -1
}

function codeOnly(src) {
  let out = ''
  let i = 0
  let mode = 'code'
  // Pila explícita: `tpl` es un template abierto, `expr` una interpolación adentro de uno. Sin
  // distinguirlas, cerrar un template anidado dentro de un `${}` devolvía a modo texto cuando todavía
  // se estaba en código, y la prosa de ese tramo entraba al análisis como si fueran identificadores.
  const stack = []
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 2; continue }
      if (c === '/' && opensRegex(out)) {
        const end = regexEnds(src, i)
        if (end !== -1) { i = end; out += ' '; continue }
      }
      if (c === "'" || c === '"') {
        const quote = c
        i++
        while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
        i++
        out += ' '
        continue
      }
      if (c === '`') { stack.push({ type: 'tpl' }); mode = 'template'; i++; out += ' '; continue }
      const top = stack[stack.length - 1]
      if (c === '}' && top && top.type === 'expr') {
        if (top.braces === 0) { stack.pop(); mode = 'template'; i++; continue }
        top.braces--
      }
      if (c === '{' && top && top.type === 'expr') top.braces++
      out += c
      i++
      continue
    }
    if (c === '\\') { i += 2; continue }
    if (c === '`') {
      stack.pop()
      const top = stack[stack.length - 1]
      mode = top && top.type === 'tpl' ? 'template' : 'code'
      i++
      continue
    }
    if (c === '$' && d === '{') { stack.push({ type: 'expr', braces: 0 }); mode = 'code'; i += 2; out += ' '; continue }
    i++
  }
  return out
}

module.exports = { codeOnly }
