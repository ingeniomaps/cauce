'use strict'

const { isCommit } = require('./git-globals')
const { eachQuoted, masked, segments, unquoted } = require('./quoting')

// El comando tal como se va a ejecutar: sin lo entrecomillado que es dato y no orden. En un commit lo es su mensaje;
// fuera de un commit lo entrecomillado puede ejecutarse (`bash -c "…"`, `eval '…'`), y por eso no se vaciaba
// nunca. Pero
// tampoco es orden el patrón de un `sed` ni el texto de un `grep`, y leerlos como tal frenaba un `sed` por la frase que
// reemplazaba (caso 259).
//
// La lista es de los que **sólo leen** su argumento, y no de los que ejecutan: un ejecutor que nadie
// anotó sigue leyéndose como orden, que es el lado que frena (R27). Y aun para éstos el texto vuelve a ser
// orden si lleva una sustitución adentro o si el comando se lo pasa a un shell por una tubería.
const DATA_ONLY = new Set(['sed', 'grep', 'egrep', 'fgrep', 'rg', 'echo', 'printf', 'jq'])
const FEEDS_SHELL = /\|&?\s*(?:sudo\s+)?(?:(?:ba|z|da|k|mk|a)?sh|eval|xargs|source|\.)(?=\s|$)/
function plainAsRun(raw) {
  if (FEEDS_SHELL.test(unquoted(raw))) return raw
  return eachQuoted(raw, (quoted, offset) => {
    if (quoted[0] === '"' && /\$\(|`/.test(quoted)) return quoted
    const simple = unquoted(raw.slice(0, offset)).split(/[;&|\n(]/).pop()
    const first = simple.trim().split(/\s+/).find((word) => !/^[A-Za-z_]\w*=/.test(word))
    return DATA_ONLY.has(first) ? '\u0000' : quoted
  })
}

// El mensaje de un commit es dato, pero una sustitución adentro corre (caso 469). Queda a la vista sólo lo que corre, y
// no el texto de alrededor: `-m "v$(date): no usar git push -f"` no empuja nada. Una sustitución anidada se
// deja entera.
//
// El heredoc con el delimitador entre comillas se tapa entero y antes de leer nada: su cuerpo puede traer
// comillas, y ahí
// la cadena terminaba a mitad del mensaje y lo que seguía se leía como orden. Termina en su primera línea de cierre, y
// si lo que sigue no cierra el mensaje, no era sólo un mensaje y no se tapa.
const QUOTED_HEREDOC = new RegExp(String.raw`(\s(?:-[a-zA-Z]*m\s*|--message[=\s]\s*))"\$\(\s*cat\s+<<-?\s*`
  + String.raw`(?:'|"|\\)([\w.-]+)['"]?\n`
  + String.raw`(?:(?!\s*\2\s*\n)[^\n]*\n)*\s*\2\s*\n?\s*\)"`, 'g')
function messageOf(quoted) {
  if (quoted[0] !== '"') return '\u0000'
  const plain = quoted.replace(/\\[\s\S]/g, '')
  if (!/\$\(|`/.test(plain)) return '\u0000'
  const runs = plain.match(/\$\([^()]*\)|`[^`]*`/g) || []
  const nested = runs.join('').split('$(').length !== plain.split('$(').length
  if (nested) return `\u0000${plain.slice(plain.indexOf('$('), plain.lastIndexOf(')') + 1)}\u0000`
  const inner = runs.map((one) => plainAsRun(one[0] === '`' ? one.slice(1, -1) : one.slice(2, -1)))
  return `\u0000${inner.join(' ; ')}\u0000`
}

// Cada comando simple se lee por lo que es: lo que venga después de un commit no es su mensaje. Un heredoc se lleva el
// resto, porque su cuerpo son líneas de texto y no comandos.
function commitAsRun(command) {
  // Sólo el que abre fuera de otra cadena: `'… -m "$(cat <<"EOF'` también tiene la forma, y ahí lo que sigue corre.
  const raw = command.replace(QUOTED_HEREDOC, (found, flag, _word, offset) => (
    /['"]/.test(masked(command.slice(0, offset + flag.length))) ? found : `${flag}\u0000`))
  const feeds = FEEDS_SHELL.test(unquoted(raw))
  let out = ''
  let copied = 0
  for (const { start, end } of segments(raw)) {
    const part = raw.slice(start, end)
    out += raw.slice(copied, start)
    copied = end
    if (!isCommit(part.trimStart())) {
      out += feeds ? part : plainAsRun(part)
      continue
    }
    if (/(?<!<)<<(?!<)/.test(masked(part))) return out + unquoted(raw.slice(start))
    out += eachQuoted(part, messageOf)
  }
  return out + raw.slice(copied)
}

function asRun(command) {
  const raw = String(command)
  return isCommit(raw) ? commitAsRun(raw) : plainAsRun(raw)
}

module.exports = { asRun }
