'use strict'

// Si lo que se publica lleva una firma de IA. R8 la prohíbe en el mensaje de un commit y en el título, el
// cuerpo y los comentarios de un pull request, y dice por qué no alcanza con recordarlo: casi nunca la tipea
// alguien, la agrega la herramienta sola. Hasta 0.103.5 eso lo cumplía quien tenía la regla cargada; un agente
// sin ella firmó tres commits seguidos y se vio leyendo el log (caso 300).
//
// Lo que garantiza:
//
// - Un `git commit` en un repositorio de la sesión cuyo mensaje trae una firma de IA se frena, diciendo cuál.
// - Lo mismo un `gh` que abre, edita, comenta o revisa un pull request o un issue con esa firma en su texto.
// - Pasa si el proyecto lo declaró con `runner.allowAiSignature`: hay empresas que quieren dejar constancia de
//   qué hizo un agente, y eso lo decide una persona en la configuración.
// - Un `Co-Authored-By` de una persona no es una firma de IA y pasa, se llame como se llame.
//
// Lo que no ve, y no se presenta como si lo viera: una firma que no empieza su línea, un mensaje que llega
// por archivo —`git commit -F`, `gh pr create --body-file`—, el editor que abre un commit sin `-m`, el `-m`
// de un `git merge` o un `git tag`, las notas de una release, y una herramienta que firme de una forma que no
// está en la lista. Es una lista de lo que frena, no de lo que habilita, y queda corta igual. Y frena de más
// en un caso: un comando que escribe un archivo con la firma adentro y commitea en la misma línea.

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
  [/^[ \t]*assisted-by:/im, 'un trailer Assisted-by'],
  [new RegExp(`^[ \\t]*(?:🤖[ \\t]*)?generated (?:with|by) \\[?${LINKED}\\]?(?:\\([^)\\n]*\\))?[ \\t.]*$`, 'im'),
    '«Generated with» de un asistente'],
  [/^[ \t]*claude-session:/im, 'el enlace a la sesión'],
]

// Los verbos de `gh` que publican texto donde lo lee otro. `merge` entra porque su `--body` es el mensaje del
// commit que queda en la rama.
const PUBLISHES = /\bgh\s+(?:pr|issue)\s+(?:create|edit|comment|review|merge)\b/

function signatureIn(text) {
  const found = SIGNATURES.find(([shape]) => shape.test(String(text)))
  return found ? found[1] : ''
}

function aiSignature(input) {
  const command = commandOf(input)
  const commit = isCommit(command)
  if (!commit && !PUBLISHES.test(command)) return
  if (commit && !owns(input, gitDirectory(command, cwdOf(input)))) return
  // El mensaje viaja casi siempre en un heredoc, y ahí es donde hay que mirar: por qué, en `rawCommandOf`.
  const found = signatureIn(rawCommandOf(input))
  if (!found) return
  const root = opsRoot(input)
  if (root && (configOf(root).runner || {}).allowAiSignature === true) return
  block(`${commit ? "el mensaje de este 'git commit'" : "el texto de este 'gh'"} trae ${found}. Lo que se `
    + 'publica no lleva firmas de IA (R8): no hace falta preguntarle a nadie, quitá esa línea y reintentá. Casi '
    + 'nunca la escribió quien arma el mensaje: la agrega la herramienta al final. Un coautor que es una persona '
    + 'no es esto y se queda.\n'
    + 'Si este proyecto quiere dejar constancia de lo que hace un agente, lo declara una persona con '
    + 'runner.allowAiSignature: true en ops.config.json.')
}

module.exports = { aiSignature, signatureIn }
