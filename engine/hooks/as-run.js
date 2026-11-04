'use strict'

const { FEEDS_SHELL, isCommit, shellScriptOf, withoutQuotedData } = require('./git-globals')
const { eachQuoted, masked, segments, unquoted, withoutHeredocBodies } = require('./quoting')

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
function messageOf(quoted, runsAfter) {
  if (quoted[0] !== '"') return '\u0000'
  const plain = quoted.replace(/\\[\s\S]/g, '')
  if (!/\$\(|`/.test(plain)) return '\u0000'
  const runs = plain.match(/\$\([^()]*\)|`[^`]*`/g) || []
  const nested = runs.join('').split('$(').length !== plain.split('$(').length
  if (nested) {
    runsAfter.push(plain.slice(plain.indexOf('$('), plain.lastIndexOf(')') + 1))
    return '\u0000'
  }
  const inner = runs.map((one) => withoutQuotedData(one[0] === '`' ? one.slice(1, -1) : one.slice(2, -1)))
  runsAfter.push(...inner)
  return '\u0000'
}

// Cada comando simple se lee por lo que es: lo que venga después de un commit no es su mensaje, tampoco después de
// cerrar un heredoc.
function commitAsRun(command) {
  // Sólo el que abre fuera de otra cadena: `'… -m "$(cat <<"EOF'` también tiene la forma, y ahí lo que sigue corre.
  const raw = withoutHeredocBodies(command.replace(QUOTED_HEREDOC, (found, flag, _word, offset) => (
    /['"]/.test(masked(command.slice(0, offset + flag.length))) ? found : `${flag}\u0000`)))
  const feeds = FEEDS_SHELL.test(unquoted(raw))
  let out = ''
  let copied = 0
  for (const { start, end } of segments(raw)) {
    const part = raw.slice(start, end)
    out += raw.slice(copied, start)
    copied = end
    // Con lo citado tapado: el commit de un `bash -c "…"` no es de este tramo, y su texto corre (caso 477).
    if (!isCommit(masked(part).trimStart())) {
      const shell = shellScriptOf(part)
      // Lo que corre un `sh -c` se lee con la misma regla, como comandos: el mensaje de su commit también es dato.
      if (shell) out += `${shell.head} ; ${asRun(shell.script)}`
      else out += feeds ? part : withoutQuotedData(part)
      continue
    }
    // Lo que corre va al final del tramo: en el medio cortaba el commit, y un `--amend` posterior dejaba de ser suyo.
    const runsAfter = []
    out += eachQuoted(part, (quoted) => messageOf(quoted, runsAfter))
    out += runsAfter.map((one) => ` ; ${one}`).join('')
  }
  return out + raw.slice(copied)
}

// El comando tal como se va a ejecutar: sin lo entrecomillado que es dato y no orden. En un commit lo es su mensaje;
// fuera de un commit lo entrecomillado puede ejecutarse (`bash -c "…"`, `eval '…'`), y por eso no se vaciaba
// nunca. Pero
// tampoco es orden el patrón de un `sed` ni el texto de un `grep`, y leerlos como tal frenaba un `sed` por la frase que
// reemplazaba (caso 259).
function asRun(command) {
  const raw = String(command)
  return isCommit(raw) ? commitAsRun(raw) : withoutQuotedData(raw)
}

module.exports = { asRun }
