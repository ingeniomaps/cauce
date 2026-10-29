'use strict'

// Que todo lo que sube o aprueba vaya como `ingeniomaps`, con la credencial del `.env`: bloquea cualquier `gh` que no
// la lleve en la misma invocación, un `gh auth` que cambie la cuenta o el helper, y un remoto o un push por SSH.
//
// `gh` a secas no falla: cae a la auth del keyring, que en esta máquina resuelve a otra cuenta sin
// admin sobre ingeniomaps/cauce. Y no avisa —las lecturas (`gh run list`, `gh pr list`) devuelven
// resultados igual—, así que una consulta hecha con la identidad equivocada se lee como una buena y
// puede venir filtrada por permisos sin que nada lo diga. El 403 aparece recién al escribir.
//
// Vive acá y no en `engine/hooks/` a propósito: es la credencial de ESTE repositorio, y un guard en el
// motor bajaría a toda empresa en su próximo `upgrade`. Vive fuera del paquete y lo prueba
// `test/repo/gh-identity.test.js`, que lo ejecuta como lo ejecuta el harness.
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

// Un separador dentro de comillas no separa nada. `grep "push\|gh pr\|force"` no invoca `gh`: ese `|`
// es texto que busca grep, y el guard lo leía como pipe y bloqueaba una lectura inocua. Pasó el
// 2026-08-31 leyendo este mismo workflow, y un guard que salta cuando no debe es el que se termina
// desactivando.
//
// Se vacía lo entrecomillado antes de buscar. El hueco que deja es un ejecutor que recibe su comando
// como cadena —`bash -c "gh api ..."`—, así que ahí se analiza la línea entera y se acepta el falso
// positivo: es la dirección barata de equivocarse.
// El ejecutor cuenta en posición de comando y no en cualquier parte del texto: `cat > deploy.sh`
// nombra un archivo, no corre un shell, y con un `\bsh\b` suelto ese punto alcanzaba para
// encender la excepción y bloquear una escritura inocua. Lo encontró la prueba del heredoc.
const EXECUTORS = 'bash|sh|zsh|dash|eval|xargs|env'
// Un separador, las asignaciones de entorno que puedan seguirlo, y recién ahí el ejecutor.
const AFTER_SEPARATOR = '(?:^|[\\n;&|(]|&&|\\|\\|)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s;&|]*\\s+)*'
const RUNS_A_STRING = new RegExp(`${AFTER_SEPARATOR}(?:${EXECUTORS})\\b`)

// El cuerpo de un heredoc es lo que se escribe en un archivo, no lo que corre —`cat > msg <<EOF` con
// prosa que cita un comando es el caso común— salvo cuando quien lo recibe es un shell: en
// `bash <<EOF` ese cuerpo sí se ejecuta. Lo decide la línea que abre el heredoc, que es donde está el
// comando que lo consume; los demás se sacan del análisis.
//
// Se resuelve antes que las comillas, porque adentro puede haber cualquier cosa. Lo destapó el commit
// que arregló el caso del ejecutor: su mensaje explicaba esa forma, la palabra `bash` del texto
// encendió la excepción de abajo, y el guard bloqueó su propio `git commit`.
const HEREDOC = /(^|\n)([^\n]*?)<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\3[\s\S]*?\n[ \t]*\4[ \t]*(?=\n|$)/g
const withoutHeredocs = (text) => text.replace(
  HEREDOC,
  (todo, antes, apertura) => (RUNS_A_STRING.test(apertura) ? todo : `${antes}${apertura}<<HEREDOC`),
)

const withoutQuoted = (text) => text.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
const body = withoutHeredocs(command)
const analyzed = RUNS_A_STRING.test(body) ? body : withoutQuoted(body)

// `gh` como palabra de comando: al principio, o después de un separador, con las asignaciones de
// entorno que puedan precederla. Así `GH_TOKEN=... gh api` matchea y `github.com` o `--gh` no.
//
// La comilla cuenta como separador por el caso del ejecutor: en `bash -c "gh pr list"` el `gh` viene
// pegado a una comilla y no a un `;`, y sin esto se colaba —el guard nació con ese hueco y lo encontró
// la prueba, no una corrida—. No reabre el falso positivo del grep: cuando no hay ejecutor lo
// entrecomillado ya viene vacío, así que no queda ningún `gh` adentro que ver.
const INVOKES_GH = /(?:^|[\n;&|("']|&&|\|\|)\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]*\s+)*gh(?:\s|$)/
// Una credencial que llega viva a `gh`, no una asignación escrita (caso 461). `GH_TOKEN=""`, o `"$X"` sin el `.env`
// cargado antes en la misma invocación, llegan vacíos, y `gh` cae al keyring sin que nada lo diga. Sólo `GH_TOKEN`: el
// wrapper de `gh` de esta máquina le saca `GITHUB_TOKEN` (medido: con el PAT ahí, `gh api user` da la otra cuenta).
// Comillas simples no expanden, así que `'$X'` es el texto `$X`. `export GH_TOKEN=...; gh ...` sigue siendo válido.
const TOKEN = /\bGH_TOKEN=(?:"([^"]*)"|'([^']*)'|([^\s;&|)]*))/g
const LOADS_ENV = /(?:^|[\n;&|(]|&&|\|\|)\s*(?:\.|source)\s+(?:\.\/)?\.env(?=[\s;&|)]|$)/
function carriesToken(text) {
  return [...text.matchAll(TOKEN)].some((match) => {
    const [, double = '', single = '', bare = ''] = match
    const value = double || single || bare
    if (!value) return false
    if (!value.includes('$')) return true
    return !single && LOADS_ENV.test(text.slice(0, match.index))
  })
}
// Lo que no toca la red ni la identidad. R14 pide poder comprobar una versión sin ceremonia.
const HARMLESS = /(?:^|[\n;&|(]|&&|\|\|)\s*gh\s+(?:--version|--help|help|version)(?:\s|$)/

// Cambiar la cuenta de `gh` o el helper de git es cambiar de identidad, y el scope `workflow` no se pide nunca: con
// o sin `GH_TOKEN`, estos no pasan.
const SWITCHES_IDENTITY = new RegExp(String.raw`(?:^|[\n;&|("']|&&|\|\|)\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]*\s+)*`
  + String.raw`gh\s+auth\s+(?:login|refresh|switch|setup-git|logout)\b`)
if (SWITCHES_IDENTITY.test(analyzed)) {
  block('`gh auth` cambia la cuenta o la credencial, y en cauce la identidad es `ingeniomaps` con el `.env`: '
    + 'usá `set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh <subcomando>`. Si eso falla, se para y se dice; '
    + 'no se busca otra vía.')
}

// La clave SSH de esta máquina autentica como otra cuenta, sin permiso en `ingeniomaps/cauce`: el push se
// rechaza (caso 425). Se mira tramo por tramo, con las comillas, porque la URL suele ir entrecomillada; un tramo que
// no empieza a escribir un remoto —el mensaje de un commit que la cita— no cuenta.
const SSH_URL = /git@github\.com:|ssh:\/\/[^\s"']*github\.com/
const WRITES_REMOTE = /(?:^|[\s"'(])git\s(?:[^\n"']*?\s)?(?:remote\s+(?:set-url|add)|push)\b/
if (body.split(/\n|;|&&|\|\||\|/).some((part) => WRITES_REMOTE.test(part) && SSH_URL.test(part))) {
  block('en cauce no se sube por SSH: la clave autentica como otra cuenta, sin permiso. Empujá por el remoto HTTPS '
    + 'de siempre (`git push origin <rama>`), cuyo helper lee el `.env`; también con workflows.')
}

if (INVOKES_GH.test(analyzed) && !carriesToken(command) && !HARMLESS.test(analyzed)) {
  block(
    "`gh` sin credencial explícita está prohibido en cauce: cae al keyring, que resuelve a otra cuenta.\n"
    + '  Usá, en la misma llamada:  set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh <subcomando>\n'
    + '  Sin el `.env` cargado ahí la variable llega vacía, y `GITHUB_TOKEN` no llega: el wrapper de gh lo saca.\n'
    + '  Los nombres están en .env.example. Comprobá con `gh api user -q .login` → debe decir ingeniomaps.',
  )
}
