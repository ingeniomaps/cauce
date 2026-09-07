'use strict'

// Cómo un guard lee lo que el runner le mandó, y cómo se niega. Es una sola pregunta —qué hay en la
// entrada y cómo se interpreta— y la comparten las tres familias de guards, así que vive acá y no en
// ninguna de ellas: copiada, una copia dejaría de reconocer un formato y su guard permitiría todo en
// silencio, que es la falla que ninguna prueba verde delata.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { writableOutsideRoots } = require('../config/paths')

// Sin stdin no hay nada que leer y los guards caen a las variables de entorno; con stdin ilegible sí
// hay algo y no se entiende, que es otra cosa. Devolver `{}` ahí dejaba a cada guard sin comando ni
// archivos, o sea permitiendo todo, y en silencio.
function readInput() {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch { /* sin stdin */ }
  if (!raw.trim()) return {}
  try { return JSON.parse(raw) } catch (error) {
    block(`la entrada del hook no es JSON válido (${error.message}).`)
  }
}

// El cuerpo de un heredoc es entrada estándar: no se ejecuta, se escribe. Juzgarlo como comando frenaba
// documentar lo que los guards vigilan — escribir un archivo que explica por qué borrar la raíz es
// catastrófico se bloqueaba por nombrarlo—, y la salida era cambiar de herramienta, que es el rodeo que
// un guard no debería enseñar.
//
// La línea de apertura se conserva **entera**, porque sí es comando y `shell-boundary` tiene que seguir
// viendo dónde escribe. Entera incluye lo que va después del delimitador: `cat <<FIN > salida` es una
// forma válida y su destino está ahí. El cuerpo empieza en el salto de línea, no en el delimitador —
// recortar desde el delimitador se llevaba esa redirección, y nada lo notaba porque en la forma común
// el destino va antes del `<<`.
//
// Lo que se pierde: un cuerpo que después alguien ejecuta. `cat > script.sh <<EOF` no ejecuta nada al
// escribirse y el guard verá el comando de verdad cuando alguien corra el script; el borde filoso es
// `$(cat <<EOF …)`, donde el cuerpo sí corre y ya no se mira. Es el mismo trato que con el mensaje de un
// commit: se frena la forma habitual, no al que quiere pasar.
const HEREDOC = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2([^\n]*)\n[\s\S]*?^\s*\3\s*$/gm

function commandOf(input) {
  const value = input.tool_input && (input.tool_input.command || input.tool_input.cmd)
    || input.command || input.input && input.input.command || process.env.OPS_HOOK_COMMAND || ''
  return String(Array.isArray(value) ? value.join(' ') : value).replace(HEREDOC, '<<$1$2$3$2$4')
}

function fileOf(input) {
  return String(input.tool_input && (input.tool_input.file_path || input.tool_input.path)
    || input.file_path || input.path || process.env.OPS_HOOK_FILE || '')
}

// El sobre de `apply_patch`, venga por donde venga. Codex lo manda entero como `command` en vez de
// `patch`, y sin reconocerlo ahí el guard de archivos no ve ni un archivo: mira una escritura que
// reemplaza una migración o filtra una credencial y la deja pasar sin decir nada. Se exige el
// encabezado en vez de aceptar cualquier `command`, para no leer un comando de shell como si fuera
// contenido de archivo.
function patchOf(input) {
  const fields = input.tool_input || {}
  const command = String(fields.command || '')
  const envelope = command.startsWith('*** Begin Patch') ? command : ''
  return String(fields.patch || fields.input || input.patch || envelope || '')
}

function filesOf(input) {
  const files = new Set()
  const direct = fileOf(input)
  if (direct) files.add(direct)
  const patch = patchOf(input)
  for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) files.add(match[1].trim())
  return [...files]
}

function contentOf(input) {
  return String(input.tool_input && (
    input.tool_input.content
    || input.tool_input.new_string
    || input.tool_input.patch
    || input.tool_input.input
  )
    || input.content || input.patch || patchOf(input) || '')
}

function cwdOf(input) {
  const cwd = input.cwd || input.tool_input && input.tool_input.cwd
    || process.env.OPS_ROOT || process.cwd()
  return path.resolve(String(cwd))
}

function block(message) {
  const error = new Error(message)
  error.blocked = true
  throw error
}

// La configuración de la raíz ops. Un guard que no puede leerla bloquea: `findOpsRoot` sólo devuelve
// una raíz donde estén `ops.config.json` y `planning/`, así que llegar acá significa roto o ilegible,
// no ausente.
// Dejarlo pasar convertía una coma de más en «sin límite de escritura».
function configOf(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch (error) {
    block(`ops.config.json no se puede leer (${error.message}). Un guard no decide sin él.`)
  }
}

// Vacía lo que va entre comillas, dejando una marca que ningún patrón confunde con una ruta ni con un
// comando. Vive acá porque la usan tres lugares por razones distintas, y cada uno explica la suya donde
// la llama.
const unquoted = (command) => String(command).replace(/'[^']*'|"[^"]*"/g, '\u0000')

// Lo que `git` admite entre el verbo y el subcomando. La lista sale de su propia línea de uso
// —`git --help`, 2.43.0—, y las que llevan el valor en un token aparte se consumen de a dos:
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
const GIT_GLOBAL = String.raw`(?:-[Cc]\s+\S+`
  + String.raw`|--(?:git-dir|work-tree|namespace|config-env)(?:=\S*|\s+\S+)`
  + String.raw`|--exec-path=\S*`
  + String.raw`|-[pP]|--paginate|--no-pager|--no-replace-objects|--bare`
  + String.raw`|--(?:literal|glob|noglob|icase)-pathspecs|--no-optional-locks)`
const GIT_GLOBALS = new RegExp(String.raw`\bgit(?:\s+${GIT_GLOBAL})+`, 'g')

// Sólo se sacan las que van **antes** del subcomando: después significan otra cosa —`git commit -C
// <commit>` reusa el mensaje de otro commit— y el ancla en `git` es lo que las deja afuera.
const withoutGitGlobals = (command) => String(command).replace(GIT_GLOBALS, 'git')

// Sobre qué repositorio se lee el índice. En un commit se mira el comando con el mensaje vaciado, por
// la misma razón por la que `destructive` lo hace: un mensaje que menciona `git -C $VAR` no está
// eligiendo un repositorio, lo está citando. Sin esto, el commit que explica este arreglo se bloquea a
// sí mismo — pasó al escribirlo.
//
// El precio es una ruta entrecomillada en el propio `-C` de un commit —`git -C "mi carpeta" commit`—,
// que se pierde y cae al cwd. Es más raro que un mensaje que cita un comando, y el cwd de un commit
// suele ser el repositorio correcto; el caso contrario deja al guard leyendo un índice ajeno.
function gitDirectory(command, cwd) {
  const text = isCommit(command) ? unquoted(command) : command
  const run = text.match(new RegExp(String.raw`(?:^|\s)git(?:\s+${GIT_GLOBAL})+`))
  const flag = run && run[0].match(/-C\s+(['"]?)([^\s'";&|]+)\1/)
  const cd = text.match(/(?:^|[;&|]\s*)cd\s+(['"]?)([^\s'";&|]+)\1/)
  return path.resolve(cwd, flag ? flag[2] : cd ? cd[2] : '.')
}

// Lo que un shell admite delante del verbo: asignaciones de entorno, `env` y `sudo`. `VAR=1 git commit`
// empieza por la asignación, así que un ancla que sólo acepta el principio del comando o un separador
// no ve el `git` que viene después.
//
// Falla en los dos sentidos y uno no avisa. Del lado ruidoso, el mensaje del commit vuelve a juzgarse
// como comando. Del silencioso —el que importa— los tres guards que sólo corren sobre un commit dejan
// de correr: gobernanza, dependencias y generados. Cualquier variable delante alcanza, y la ironía es
// que el prefijo que el procedimiento manda escribir para un commit de gobernanza es
// `OPS_GOVERNANCE_OVERRIDE=1`: escrito ahí, el guard no lee el override, directamente no se ejecuta.
const PREFIX = String.raw`(?:^|[;&|]\s*)(?:(?:env|sudo)\s+)*`
  + String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)*`
const COMMIT = new RegExp(PREFIX + String.raw`git\s+commit(?:\s|$)`)

function isCommit(command) {
  return COMMIT.test(withoutGitGlobals(command))
}

// Un índice vacío y un índice ilegible no son la misma respuesta: la primera autoriza a seguir, la
// segunda no autoriza nada. Devolviendo `[]` en los dos casos, los tres guards que preguntan acá se
// apagaban en silencio ante cualquier lectura fallida — y llegar a una es fácil, porque `gitDirectory`
// no expande variables: `git -C $OPS commit` resuelve la ruta literal `$OPS`, que no existe.
//
// Es la regla que el propio shim ya tiene escrita —«Un guard que no encuentra su motor bloquea, nunca
// permite»—, aplicada donde faltaba. Bloquear desde acá es seguro: los tres llamadores son guards, así
// que no hay ningún consumidor que sólo quiera consultar el índice.
function stagedFiles(dir) {
  const result = spawnSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
  if (result.status !== 0) {
    const why = (result.stderr || '').trim() || (result.error && result.error.message) || 'git falló'
    block(`no se pudo leer el índice de ${dir} (${why}). Un guard que no puede verificar no autoriza. `
      + 'Si usaste una variable en `git -C`, escribí la ruta literal.')
  }
  return result.stdout.trim().split('\n').filter(Boolean)
}

// R10 pide «la autorización configurada para el proyecto» y `runner.allowPush` es esa configuración:
// sin esto era un interruptor que nadie leía, y un cargo que lo leyó dio por imposible un push que el
// guard bloqueaba igual. Sin raíz legible no hay permiso que verificar, así que no se autoriza.
// El índice que un hook de pre-ejecución lee es el de **antes** del comando, y el comando puede ser
// justamente el que lo llene. Ahí los tres guards que juzgan mirando el índice no fallan: leen bien,
// encuentran cero archivos y concluyen que no hay nada que revisar.
//
// Reconstruir el índice futuro desde el texto del `add` sería peor: tendría que resolver globs, `-u`,
// `-p` y el alias que esconde otro `add`, o sea acertar en los casos fáciles y fallar callado en los
// difíciles, que es el modo de fallo que esto viene a cerrar. Pedir dos comandos cuesta una línea.
//
// El mensaje se vacía antes de mirar porque un commit que explica esta misma regla lo nombra, y
// bloquearlo dejaría sin escribir el commit que la documenta — pasó con la prohibición de stagear todo.
//
// La otra forma de llenar el índice tarde es `git commit -a`, y la frena `git-add`: además de cegar a
// estos guards viola R8 por escrito, así que su razón vive con esa regla y no acá.
//
// Devuelve también el directorio porque dos de los tres guards siguen leyendo del repositorio después
// —el lockfile que está al lado del manifiesto, el `package.json` que dice qué gate correr—, y
// resolverlo dos veces sería preguntar dos veces lo mismo.
function stagedForCommit(command, cwd) {
  if (/\bgit\s+add\b/.test(withoutGitGlobals(unquoted(command)))) {
    block('El comando stagea y commitea a la vez, así que este guard lee el índice de antes de stagear '
      + 'y no puede ver qué se commitea. Stageá las rutas en un comando y commiteá en otro.')
  }
  const dir = gitDirectory(command, cwd)
  return { dir, staged: stagedFiles(dir) }
}

function pushAllowed(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return false
  const runner = configOf(root).runner
  return Boolean(runner && runner.allowPush === true)
}

function findOpsRoot(start) {
  let current = path.resolve(start)
  while (true) {
    if (fs.existsSync(path.join(current, 'ops.config.json'))
      && fs.existsSync(path.join(current, 'planning'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return ''
    current = parent
  }
}

// Lo que un proyecto declaró que puede escribirse: su raíz de ops, las raíces de código y las rutas que
// exentó sin que sean código. Lo preguntan los dos guards de límites —el que mira un `Write` y el que
// mira el destino de un comando— y tienen que responder lo mismo: con dos copias, una herramienta
// escribiría donde la otra bloquea, que es exactamente el agujero que el segundo vino a cerrar.
//
// Sin raíz legible no hay lista, y quien pregunta se abstiene: el guard que no sabe dónde está no
// inventa un límite.
function writableRoots(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return null
  const config = configOf(root)
  return [
    root,
    ...(config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path)),
    ...writableOutsideRoots(root, config).map((entry) => entry.path),
  ]
}

// La pregunta exacta y nada más. Las excepciones viven en quien las necesita: un `>` a `/dev/null` es
// corriente y una escritura de `Write` ahí no lo es, así que perdonarlas acá le habría cambiado en
// silencio el alcance a `workspace-boundary`, que no es lo que se vino a hacer.
function outsideRoots(file, allowed) {
  return !allowed.some((base) => file === base || file.startsWith(`${base}${path.sep}`))
}

// Va en los dos bloqueos y no en uno: un límite que sólo dice «no» enseña a rodearlo, y el rodeo que
// este mensaje evita es cambiar de herramienta, que es por donde el límite se perdía entero.
const DECLARE_IT = 'Si el proyecto necesita escribir ahí, declaralo en writableOutsideRoots de '
  + 'ops.config.json; cambiar de herramienta no lo autoriza.'

module.exports = {
  readInput, commandOf, patchOf, filesOf, contentOf, cwdOf, block, configOf,
  gitDirectory, isCommit, withoutGitGlobals, stagedFiles, stagedForCommit, pushAllowed,
  findOpsRoot,
  writableRoots, outsideRoots, DECLARE_IT, unquoted,
}
