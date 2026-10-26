'use strict'

// Las dos llaves que deciden si un `git push` se publica —`runner.allowPush` y `runner.pushToLiveBranches`—
// viven en `ops.config.json`, y hasta 0.82.0 ningún guard miraba ese archivo: el bloqueo que dice «esto lo
// decide una persona» se levantaba escribiendo el archivo que lo levanta, por `Write` o por `sed -i`, y el
// mensaje del bloqueo nombra el campo exacto que hay que agregar (caso 114).
//
// **Protege esos campos y no el archivo.** Protegerlo entero repondría el candado que el 090 sacó: el
// límite de raíces manda a declarar la ruta en `writableOutsideRoots`, de este mismo archivo, así que
// frenarlo entero dejaría sin salida lo que angosta o reescribe; lo que ensancha lo confirma una persona
// (abajo). Todo lo demás —migraciones, lo que sea— sigue pasando como trabajo normal.
//
// Lo que el límite lee es la otra mitad, y hasta 0.106.1 era la misma puerta con otra forma: el agente
// agregaba una ruta a `writableOutsideRoots` —o una raíz a `workspaceRoots`, o cualquiera de las dos en
// `ops.config.local.json`, que no miraba nadie— y lo que estaba frenado pasaba, por prefijo y para siempre,
// sin que nadie lo confirmara en el momento (caso 373). Por eso lo que una escritura **ensancha** lo confirma
// una persona, por la misma salida angosta del 370 y con la entrada resuelta a la vista; lo que angosta,
// reordena o reescribe igual no se pregunta, y así el archivo sigue siendo la salida del límite.
//
// Son dos guards en un solo fuente, como `secrets` y `secrets-shell`: corren en eventos distintos y cada grupo
// cubre a cada guard una vez, mientras que lo que deciden —cuáles son los archivos, qué cambió y cómo se
// dice— es uno solo y copiarlo dejaría dos mitades que dejan de coincidir.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { block, commandOf, configOf, contentOf, cwdOf, filesOf, opsRoot } = require('./input')
const CHAT = require('./chat')
const AP = require('./approval')
const { writes } = require('./shell-changes')
const { confirmedOnly, real } = require('./boundary')
const { writableOutsideRoots, resolvePath, LOCAL_CONFIG } = require('../config/paths')

const INSTANCE_CONFIG = 'ops.config.json'
const PROTECTED = ['allowPush', 'pushToLiveBranches']
const NAMES = PROTECTED.map((name) => `runner.${name}`).join(' y ')

// El valor de cada llave en la forma en que se comparan. Ausente no es vacío: sacar `pushToLiveBranches`
// cambia qué ramas alcanza el permiso y tiene que distinguirse de dejarlo en una lista sin ramas. Lo hace
// `JSON.stringify`, que de un campo ausente no devuelve nada y de ninguno presente devuelve la cadena vacía.
function keysOf(config) {
  const runner = (config && typeof config.runner === 'object' && config.runner) || {}
  return PROTECTED.map((name) => JSON.stringify(runner[name])).join(' ')
}

// El mensaje le habla a la persona y deja el permiso como cosa suya; el porqué de esa redacción está en
// `HOW`, en `approval.js`.
const HANDS_OFF = 'Lo decide una persona (R10): decile qué se frenó y esperá. Lo pone ella editando el '
  + `archivo, o pidiéndotelo en el chat nombrando ${INSTANCE_CONFIG}, y entonces lo escribís con la `
  + 'herramienta de edición.'

function changeMessage(file) {
  return `${file} lleva las dos llaves que deciden qué push se publica, ${NAMES}, y este cambio las toca. `
    + `${HANDS_OFF}\nEl resto del archivo no lo frena este guard: si venías a declarar una raíz o a tocar `
    + 'cualquier otro campo, mandá el mismo cambio sin mover esas dos llaves.'
}

// Qué cuida cada archivo, para decirlo en el bloqueo: el compartido lleva el permiso de push y las raíces;
// el de la máquina, sólo rutas escribibles.
const guards = (root, file) => (file === path.join(root, INSTANCE_CONFIG)
  ? `${NAMES}, las dos llaves que deciden qué push se publica, o las raíces que el límite de escritura lee`
  : 'las rutas que el límite de escritura deja escribir fuera de las raíces')

// **Un contenido que no se puede leer como JSON se frena.** Un `Edit` manda el fragmento que reemplaza y no
// el archivo, así que no hay con qué comparar: dejarlo pasar apagaría este guard con la herramienta más
// común de todas, y frenarlo deja una salida más cara pero escrita —mandar el archivo entero, que sí se
// compara—. Es el mismo criterio con el que el motor decide cuando no puede leer el índice de git.
function unreadableMessage(root, file) {
  return `${file} no llega como un JSON completo que se pueda leer, así que no hay cómo saber si el cambio `
    + `toca ${guards(root, file)}. Un guard que no puede verificar no autoriza: mandá el archivo entero en una `
    + 'sola escritura y el guard compara lo que cambia.'
}

// **Por shell se frena toda escritura, y no sólo la que ensancha.** La mitad de archivos compara dos
// contenidos porque tiene los dos: el entrante viene en la llamada y el otro está en disco. Un comando no
// trae ninguno —`sed -i 's/false/true/'` dice qué reemplaza, no con qué va a quedar el archivo—, y
// averiguarlo sería ejecutarlo, que es justo lo que este guard corre antes de que ocurra. Sin contenido que
// comparar quedan dos conductas posibles y ninguna intermedia, y se elige la que cierra la vía que el 114
// midió.
//
// Lo que sí se ofrece es que la persona lo confirme a ciegas, en este turno y sin nada que pegar (`judgeCommand`),
// una salida más angosta que la del 370: Codex escribe
// sólo por `apply_patch`, que llega como parche y no como archivo, así que sin esto no le quedaba ninguna vía
// para el cambio que ella pidió (revisión del 373). Quien confirma no ve con qué queda el archivo, y el
// bloqueo se lo dice; la herramienta de edición, donde la hay, sigue siendo la que muestra la entrada.
function commandMessage(root, file) {
  return `el comando escribe en ${file}, donde viven ${guards(root, file)}. Un comando no dice con qué va a `
    + 'quedar el archivo, así que acá se frena toda escritura. Si el cambio es de cualquier otro campo, '
    + 'escribí el archivo entero con la herramienta de edición, que el guard sí puede comparar; si es el '
    + `permiso de push, ${HANDS_OFF.replace(/^Lo/, 'lo')}\nSi la persona quiere que pase igual por comando, `
    + 'puede confirmarlo sabiendo que no va a ver con qué queda el archivo:\n'
}

// Las rutas que un archivo abre: las raíces de producto —sólo el compartido las declara— y las escribibles de
// afuera. Cada lista se resuelve como la resuelve el límite —`writableRoots`, en `input.js`—: la raíz con
// `path.resolve`, que no expande `~`, y la escribible con `resolvePath`, que sí. Resolverlas igual es lo que
// hace que la entrada que la persona confirma sea la que después rige.
//
// Y se devuelve **dónde cae** cada una, no cómo está escrita: el límite compara por ahí (`beyond`), así que una
// entrada que textualmente cuelga de una raíz y es un enlace hacia afuera abre lo de afuera. Comparada por
// texto quedaba cubierta y pasaba sin confirmar (revisión del 373).
function opened(root, config, file) {
  const shared = file === path.join(root, INSTANCE_CONFIG)
  const roots = shared && config && Array.isArray(config.workspaceRoots)
    ? config.workspaceRoots.filter((one) => one && typeof one.path === 'string')
      .map((one) => path.resolve(root, one.path))
    : []
  const outside = config && Array.isArray(config.writableOutsideRoots)
    ? config.writableOutsideRoots.filter((one) => typeof one === 'string' && one.trim())
      .map((one) => resolvePath(root, one))
    : []
  return [...roots, ...outside].map(real)
}

// Lo que la escritura entrante abre y nada de lo declarado hoy cubre. Se compara contra los dos archivos en
// disco, no contra el que se escribe: una ruta que el compartido ya declara no es nueva en el de la máquina.
// Y por prefijo, que es como el límite lee: `~/a` donde había `~/a/b` ensancha, `~/a/b` donde había `~/a` no.
function widened(root, incoming, file) {
  const shared = configOf(root)
  // Las raíces del compartido y las escribibles de los dos archivos, cada una resuelta una sola vez.
  const declared = [
    ...opened(root, { workspaceRoots: shared.workspaceRoots }, path.join(root, INSTANCE_CONFIG)),
    ...writableOutsideRoots(root, shared).map((entry) => real(entry.path)),
  ]
  const covered = (one) => declared.some((base) => one === base || one.startsWith(`${base}${path.sep}`))
  return [...new Set(opened(root, incoming, file).filter((one) => !covered(one)))]
}

// El archivo entero, como objeto, o nada. Un `Edit` manda un fragmento aunque ese fragmento sea JSON válido
// —`["/"]` donde había `[]`—, y un fragmento no dice con qué queda el archivo; un JSON que no es un objeto
// tampoco es una configuración (revisión del 373).
function wholeFile(input) {
  if (typeof (input.tool_input || {}).new_string === 'string') return null
  let incoming = null
  try { incoming = JSON.parse(contentOf(input)) } catch { return null }
  return incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : null
}

function widensMessage(file, held) {
  return `${file} ensancha lo que el límite de raíces deja escribir: agrega ${held.map((one) => one.slice(8))
    .join(', ')}. Lo decide una persona (R10), con la entrada a la vista; lo que el archivo ya declaraba y lo `
    + 'que angosta no se pregunta.\n'
}

// Lo que la persona pidió nombrando el archivo pasa el juicio de las dos llaves: ahí quien decide es ella,
// que es lo que este guard cuida. Se pregunta cada vez —sin conceder y sin heredar—, igual que
// `self-approval`: las dos llaves que viven acá son el permiso de push, y nombrar el archivo una vez no lo
// deja abierto toda la sesión. El comentario decía «lo mismo» mientras el código concedía (caso 119).
//
// Vale sólo por la herramienta de edición, que trae el contenido. Por shell nombrar el archivo no abre nada
// —hasta 0.106.1 sí, y el 119 lo había decidido así—: un comando no dice con qué queda el archivo, así que
// «abrí ops.config.json y fijate» dejaba pasar un `sed` que ensanchaba las raíces sin que nadie viera la
// entrada (revisión del 373). El mismo pedido, con la herramienta de edición, pasa igual que antes.
//
// Ensanchar las raíces no pasa por nombrar el archivo: es la salida angosta del 370 —confirmar el bloqueo,
// o la línea en el archivo de aprobación—, con el ítem `declara <ruta resuelta>`.
const asked = (input, file) => !CHAT.unauthorizedNow(input, [file]).length

// El archivo se reconoce por dónde cae y no por cómo está escrito —un enlace con otro nombre, la ruta real de
// una raíz enlazada—, como hace el límite (caso 317): comparado por texto, escribirlo por otro nombre no se
// juzgaba (tercera revisión del 373).
const hits = (file, at) => real(at) === real(file)

function judgeWrite(input, root, file) {
  if (!filesOf(input).some((raw) => hits(file, path.resolve(cwdOf(input), raw)))) return
  const incoming = wholeFile(input)
  if (!incoming) block(unreadableMessage(root, file))
  if (file === path.join(root, INSTANCE_CONFIG) && !asked(input, file)
    && keysOf(configOf(root)) !== keysOf(incoming)) block(changeMessage(file))
  const held = confirmedOnly(input, widened(root, incoming, file).map((one) => `declara ${one}`))
  if (held.length) block(widensMessage(file, held) + AP.HOW(null, held, input, held, { turn: true }))
}

function judgeCommand(input, root, file) {
  for (const { raw, base } of writes(commandOf(input), cwdOf(input))) {
    // Una ruta relativa sin base contra la que resolverla no se puede juzgar, y esa pregunta es de
    // `shell-boundary`, que ya la contesta para todo destino.
    if (!path.isAbsolute(raw) && base === null) continue
    if (!hits(file, path.resolve(base || '/', raw))) continue
    // Sólo la confirmación de este turno, sin línea en el archivo de aprobación: pegada, dejaría abierta para
    // siempre una escritura a ciegas sobre el archivo que lleva el permiso de push, y el agente podía pedir esa
    // línea nombrando el archivo. Por eso no pasa por `confirmedOnly`, que sí lee el archivo, y `HOW` no
    // ofrece nada que pegar (tercera revisión del 373).
    const item = `escribe ${real(file)}`
    const held = CHAT.unauthorizedNow(input, [item], () => false)
    if (held.length) block(commandMessage(root, file) + AP.HOW(null, held, input, [], { turn: true }))
  }
}

// Los archivos que deciden, o nada. Sin raíz ops no hay ninguno: `push.js` lee el `runner` de esta misma
// raíz y el límite lee sus raíces de ahí, así que donde no la hay tampoco hay permiso que escribirse.
function targets(input) {
  const root = opsRoot(input)
  return root ? [INSTANCE_CONFIG, LOCAL_CONFIG].map((name) => ({ root, file: path.join(root, name) })) : []
}

function opsConfig(input) {
  for (const { root, file } of targets(input)) judgeWrite(input, root, file)
}

function opsConfigShell(input) {
  for (const { root, file } of targets(input)) judgeCommand(input, root, file)
}

// Con `ops.config.json` ilegible ningún guard decide, y frenar todo dejaba la sesión sin herramientas, también sin la
// que lo repara: la salida quedaba del lado de la persona y nada la nombraba (caso 419). Pasa sólo volver al contenido
// del último commit, que no ensancha nada que no haya pasado ya por uno. Desde otra rama o desde el índice sigue
// frenando: ahí puede venir un permiso que nadie aprobó en ésta. El comando va solo y sin nada que el shell expanda,
// porque lo que se cuelgue detrás correría sin un guard que lo mire. Y no pasa si restaurar corre código del
// repositorio: git 2.43 corre el `post-checkout` también al restaurar un archivo, con `checkout` y con `restore`
// (medido), y lo mismo vale para un filtro de `.gitattributes` sobre el archivo y para `core.fsmonitor`. Ahí la salida
// es la de la persona, que el bloqueo ya nombra.
const RESTORE = new RegExp(String.raw`^git(?:\s+-C\s+(?:"([^"]+)"|([^\s"]+)))?\s+(?:checkout\s+HEAD\s+--|restore`
  + String.raw`(?:\s+(?:--source(?:=|\s+)HEAD|--staged|--worktree|-S|-W))*(?:\s+--)?)\s+([^\s"]+)$`)
function restoresConfig(input) {
  const command = commandOf(input).trim()
  const hit = !/[$`;|&<>()\\'\n]/.test(command) && command.match(RESTORE)
  if (!hit || !/\s--source(?:=|\s)HEAD\b|\scheckout\s/.test(command)) return false
  const root = opsRoot(input)
  if (!root) return false
  try { configOf(root); return false } catch { /* ilegible: es el único caso en que esto decide */ }
  const dir = path.resolve(cwdOf(input), hit[1] || hit[2] || '.')
  return path.resolve(dir, hit[3]) === path.join(root, INSTANCE_CONFIG) && !runsCode(root)
}

// Si restaurar el archivo correría código del repositorio: un `post-checkout` —contando `core.hooksPath`—, un filtro
// sobre el archivo o un `core.fsmonitor`. Sin poder preguntarlo, se supone que sí: es la dirección que frena.
function runsCode(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env })
  const hook = git('rev-parse', '--path-format=absolute', '--git-path', 'hooks/post-checkout')
  const filter = git('check-attr', 'filter', '--', INSTANCE_CONFIG)
  if (hook.status !== 0 || filter.status !== 0) return true
  if (!/: unspecified$/.test(filter.stdout.trim())) return true
  const monitor = git('config', '--get', 'core.fsmonitor').stdout.trim()
  if (monitor && monitor !== 'false') return true
  try { fs.accessSync(hook.stdout.trim(), fs.constants.X_OK); return true } catch { return false }
}

module.exports = { opsConfig, opsConfigShell, restoresConfig }
