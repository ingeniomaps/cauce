'use strict'

// Bloquea cualquier `gh` que no lleve la credencial en la misma invocación.
//
// `gh` a secas no falla: cae a la auth del keyring, que en esta máquina resuelve a otra cuenta sin
// admin sobre ingeniomaps/cauce. Y no avisa —las lecturas (`gh run list`, `gh pr list`) devuelven
// resultados igual—, así que una consulta hecha con la identidad equivocada se lee como una buena y
// puede venir filtrada por permisos sin que nada lo diga. El 403 aparece recién al escribir.
//
// Vive acá y no en `engine/hooks/` a propósito: es la credencial de ESTE repositorio, y un guard en el
// motor bajaría a toda empresa en su próximo `upgrade`. Por eso tampoco lo cubre `npm run ci`.
//
// El estado del shell no sobrevive entre invocaciones de Bash, así que exigirlo en la misma línea no es
// una molestia: es la única forma en que la variable llega viva a `gh`.

const fs = require('node:fs')

function commandOf() {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch { /* sin stdin */ }
  if (!raw.trim()) return process.env.OPS_HOOK_COMMAND || ''
  let input
  // Un guard que no entiende su entrada bloquea, nunca permite: devolver '' acá lo dejaría pasar todo.
  try { input = JSON.parse(raw) } catch (error) { block(`la entrada del hook no es JSON válido (${error.message}).`) }
  const value = (input.tool_input && input.tool_input.command) || input.command || ''
  return Array.isArray(value) ? value.join(' ') : String(value)
}

function block(message) {
  console.error(`BLOQUEADO: ${message}`)
  process.exit(2)
}

const command = commandOf()

// `gh` como palabra de comando: al principio, o después de un separador, con las asignaciones de
// entorno que puedan precederla. Así `GH_TOKEN=... gh api` matchea y `github.com` o `--gh` no.
const INVOKES_GH = /(?:^|[\n;&|(]|&&|\|\|)\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]*\s+)*gh(?:\s|$)/
// Alcanza con que la asignación esté en la misma invocación: `export GH_TOKEN=...; gh ...` es válido.
const CARRIES_TOKEN = /\b(?:GH_TOKEN|GITHUB_TOKEN)\s*=/
// Lo que no toca la red ni la identidad. R14 pide poder comprobar una versión sin ceremonia.
const HARMLESS = /(?:^|[\n;&|(]|&&|\|\|)\s*gh\s+(?:--version|--help|help|version)(?:\s|$)/

if (INVOKES_GH.test(command) && !CARRIES_TOKEN.test(command) && !HARMLESS.test(command)) {
  block(
    "`gh` sin credencial explícita está prohibido en cauce: cae al keyring, que resuelve a otra cuenta.\n"
    + '  Usá:  set -a; . ./.env; set +a\n'
    + '        GH_TOKEN="$GITHUB_PAT_CAUCE" gh <subcomando>\n'
    + '  Los nombres están en .env.example. Comprobá con `gh api user -q .login` → debe decir ingeniomaps.',
  )
}
