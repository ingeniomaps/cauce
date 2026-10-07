'use strict'

// Si lo que se publica lleva una firma de IA. R8 la prohíbe en el mensaje de un commit y en el título, el
// cuerpo y los comentarios de un pull request, y dice por qué no alcanza con recordarlo: casi nunca la tipea
// alguien, la agrega la herramienta sola. Hasta 0.103.5 eso lo cumplía quien tenía la regla cargada; un agente
// sin ella firmó tres commits seguidos y se vio leyendo el log (caso 300).
//
// Lo que garantiza:
//
// - Un `git commit`, `git merge` o `git tag` en un repositorio de la sesión cuyo mensaje termina con una
//   firma de IA se frena, diciendo cuál. También el `gh` que publica texto en un pull request, un issue o una
//   release.
// - Se juzga el mensaje y no el comando: lo que va en `-m`, `--body`, `--title` o `--notes`, y el archivo de
//   `-F`, `--body-file` o `--notes-file` cuando se puede leer. Un comando que escribe un archivo con la firma
//   adentro y después commitea limpio no se frena.
// - Cuenta la firma que cierra el mensaje. Una citada en la prosa —la de un commit que explica el problema—
//   tiene texto después, y pasa.
// - Pasa si el proyecto lo declaró con `runner.allowAiSignature`: hay empresas que quieren dejar constancia de
//   qué hizo un agente, y eso lo decide una persona en la configuración.
// - Un `Co-Authored-By` de una persona no es una firma de IA y pasa, se llame como se llame.
// - Pasa también si la persona lo pidió en el chat nombrando la firma. Lo que ella pide directo no se frena.
//
// Lo que no ve, y no se presenta como si lo viera: el mensaje que se escribe en el editor, sin `-m`; un archivo
// de mensaje cuya ruta sale de una variable; y una herramienta que firme de una forma que no está en la lista.
// Es una lista de lo que frena, no de lo que habilita, y queda corta igual.

const fs = require('node:fs')
const path = require('node:path')
const CHAT = require('./chat')
const { NEGATED } = require('./live-commit')
const { block, commandOf, rawCommandOf, cwdOf, isCommit, gitDirectory, owns, opsRoot, configOf } = require('./input')

// Quién firma, por cómo firma la herramienta y no por un nombre suelto: «Claude» y «Devin» también son
// nombres de persona, y un guard que frena a un coautor humano termina borrándolo. Cuenta el nombre de
// producto con que cada asistente se presenta, o la casilla desde la que firma.
const PRODUCT = '(?:claude (?:code|opus|sonnet|haiku|fable|\\d)|github copilot|copilot|chatgpt|codex|'
  + 'cursor agent|gemini cli|gemini code assist|devin ai|aider|antigravity)'
const MAILBOX = '(?:noreply@anthropic\\.com|copilot@github\\.com|copilot@users\\.noreply\\.github\\.com|'
  + 'noreply@openai\\.com|codex@openai\\.com|cursoragent@cursor\\.com|gemini-cli@google\\.com)'
// «Generated with» sólo cuando la línea es eso y nada más: la frase dentro de una oración es prosa.
const LINKED = '(?:claude code|claude|github copilot|copilot|chatgpt|codex|cursor|gemini cli|gemini|devin|aider)'
const SIGNATURES = [
  [new RegExp(`^[ \\t]*co-authored-by:[ \\t]*${PRODUCT}\\b`, 'im'), 'un Co-Authored-By de un asistente'],
  [new RegExp(`^[ \\t]*co-authored-by:[^\\n]*<${MAILBOX}>`, 'im'), 'un Co-Authored-By de un asistente'],
  [new RegExp(`^[ \\t]*assisted-by:[ \\t]*${LINKED}\\b`, 'im'), 'un trailer Assisted-by de un asistente'],
  [new RegExp(`^[ \\t]*(?:🤖[ \\t]*)?generated (?:with|by) \\[?${LINKED}\\]?(?:\\([^)\\n]*\\))?[ \\t.]*$`, 'im'),
    '«Generated with» de un asistente'],
  [/^[ \t]*claude-session:/im, 'el enlace a la sesión'],
]

// Lo que publica texto donde lo lee otro. `gh pr merge` entra porque su `--body` es el mensaje del commit que
// queda en la rama, y `git merge` y `git tag` porque su `-m` también queda en la historia.
const PUBLISHES = /\bgh\s+(?:(?:pr|issue)\s+(?:create|edit|comment|review|merge)|release\s+(?:create|edit))\b/
const WRITES_HISTORY = /\bgit\b[^;&|\n]*\s(?:merge|tag)\b/

// Dónde va el texto. Las formas largas no se confunden con nada; `-m` es de git y `-b`/`-t`/`-n` de `gh`.
const INLINE = /(?:^|\s)(--message|--body|--title|--notes|-m|-b|-t|-n)(?:=|\s+)/g
const FROM_FILE = /(?:^|\s)(?:--file|--body-file|--notes-file|-F)(?:=|\s+)(['"]?)([^\s'"$`]+)\1/g

// El valor que sigue a una bandera: el cuerpo de un heredoc, una cadena entre comillas o una palabra.
function valueAt(text) {
  const heredoc = text.match(/^"?\$\(cat\s*<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n\s*\2\s*\n?\s*\)"?/)
  if (heredoc) return heredoc[3]
  const quote = text[0]
  if (quote === '"' || quote === "'") {
    const end = quote === "'" ? text.indexOf("'", 1) : text.slice(1).search(/(?<!\\)"/) + 1
    return end > 0 ? text.slice(1, end) : text.slice(1)
  }
  return (text.match(/^\S+/) || [''])[0]
}

// Todo el texto que el comando publica, en el orden en que queda: los `-m` de un commit son párrafos.
function messageOf(raw, dir, short) {
  const parts = []
  for (const found of raw.matchAll(INLINE)) {
    if (!short && /^-[btn]$/.test(found[1])) continue
    parts.push(valueAt(raw.slice(found.index + found[0].length)))
  }
  for (const found of raw.matchAll(FROM_FILE)) {
    try { parts.push(fs.readFileSync(path.resolve(dir, found[2]), 'utf8')) } catch { /* no se puede leer acá */ }
  }
  return parts.join('\n\n')
}

// Una línea que puede venir después de una firma sin volverla prosa: otro trailer, un enlace, otra firma.
const TRAILING = /^[ \t]*(?:[\w-]+:[ \t]\S.*|https?:\/\/\S+|(?:🤖[ \t]*)?generated (?:with|by) .*)?[ \t]*$/i

function signatureIn(text) {
  const lines = String(text).split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const found = SIGNATURES.find(([shape]) => shape.test(lines[index]))
    if (found && lines.slice(index + 1).every((line) => TRAILING.test(line))) return found[1]
  }
  return ''
}

// Lo que la persona pide en el chat no se frena: si su mensaje nombra la firma —«dejale el Co-Authored-By»—,
// pasa. Se comprueba que la nombre, no con qué palabras la pidió; y el lado seguro: no vale si la frase que la
// nombra la niega, ni si el mensaje pregunta.
function ordersSignature(text) {
  if (/[?¿]/.test(text)) return false
  return String(text).split(/[;\n]+|\.\s/).some((clause) => /co-authored-by|generated with/i.test(clause)
    && !NEGATED.test(` ${clause.toLowerCase()} `))
}

function aiSignature(input) {
  const command = commandOf(input)
  const commit = isCommit(command) || WRITES_HISTORY.test(command)
  const publishes = PUBLISHES.test(command)
  if (!commit && !publishes) return
  const dir = commit ? gitDirectory(command, cwdOf(input)) : cwdOf(input)
  if (commit && !owns(input, dir)) return
  // El mensaje viaja casi siempre en un heredoc, y ahí es donde hay que mirar: por qué, en `rawCommandOf`.
  const found = signatureIn(messageOf(rawCommandOf(input), dir, publishes))
  if (!found) return
  const root = opsRoot(input)
  if (root && (configOf(root).runner || {}).allowAiSignature === true) return
  if (CHAT.authorized(input, ['commit con firma de IA'], { asked: ordersSignature, inherit: false }).length) return
  block(`${commit ? 'el mensaje de este comando de git' : "el texto de este 'gh'"} termina con ${found}. Lo que `
    + 'se publica no lleva firmas de IA (R8): no hace falta preguntarle a nadie, quitá esa línea y reintentá. Casi '
    + 'nunca la escribió quien arma el mensaje: la agrega la herramienta al final. Un coautor que es una persona '
    + 'no es esto y se queda.\n'
    + 'Si este proyecto quiere dejar constancia de lo que hace un agente, lo declara una persona con '
    + 'runner.allowAiSignature: true en ops.config.json; para una vez, alcanza con que lo pida en el chat '
    + 'nombrando la firma.')
}

module.exports = { aiSignature, signatureIn, ordersSignature }
