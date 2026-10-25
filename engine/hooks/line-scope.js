'use strict'

// Lo que la sesión de una línea de trabajo puede escribir dentro de la carpeta de sesión (caso 422): sus árboles y la
// instancia, que es donde vive el planning. Lo demás de esa carpeta —el checkout de la principal, los árboles de otra
// línea, un repositorio que la línea no trabaja— frena, nombrando dónde va. Una línea existe para que dos sesiones
// trabajen a la vez sin pisarse, y hasta acá eso lo sostenía sólo que el agente se acordara de dónde estaba.
//
// Afuera de la carpeta de sesión no decide nada: eso lo juzgan las raíces, como siempre. La sesión principal no lleva
// línea, así que para ella no cambia nada. Pasa lo que la persona nombra o confirma en el chat, o pega en el archivo de
// aprobación, y nada más: un «seguí» no es pedir que la línea escriba en el checkout de otra sesión, que es lo que
// esto cuida.
//
// Qué línea lleva una sesión no está en el entorno: las dos se abren en la misma carpeta y `/autobuild <línea>` no
// exporta nada. Se anota por sesión lo que ella misma dice —el `/autobuild` que escribe la persona, el `--line` de un
// `ops claim` o un `ops worktree`— y manda `CAUCE_RUNNER` si alguien lo exportó con su línea. Un subagente lleva el
// id de la sesión que lo lanzó, así que el Build de la línea queda alcanzado. Dónde está parada no cuenta: la
// principal que entra a mirar el árbol de una línea no pasa a llevarla.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const LT = require('../core/line-trees')
const { landing } = require('../core/files')
const { opsRoot, commandOf, cwdOf } = require('./input')
const { steps } = require('./shell-changes')
const AP = require('./approval')
const CHAT = require('./chat')

// El temporal, como el registro del chat: una sesión dura lo que dura, y su línea con ella.
const DIR = path.join(os.tmpdir(), 'cauce-line')
const recordOf = (session) => path.join(DIR, `${String(session).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
// El puente de Antigravity lo manda como `sessionId` (`automatization/runners/antigravity/hook.js`); sin leerlo, ahí la
// línea no se anotaba nunca.
const sessionOf = (input) => input.session_id || input.sessionId || ''

const NAMED = String.raw`([a-z0-9]+(?:-[a-z0-9]+)*)`

// Los argumentos de un `ops claim` o `ops worktree` que el comando corre, o null. Se lee por palabras de shell y por
// tramo (`steps`): un `grep 'ops claim --line x'` cita el comando y no lo corre, y lo que sigue al tramo —un agente
// real escribió `--line piloto; echo "exit=$?"`— no es parte de él. Son las formas de correr `ops`: `node …/ops.js`,
// el script directo, el `bin` del paquete y `npm run ops --`.
function opsArgs({ verb, rest }) {
  const args = verb === 'node' ? (/ops\.js$/.test(rest[0] || '') ? rest.slice(1) : null)
    : verb === 'ops.js' || verb === 'cauce' ? rest
      : verb === 'npx' ? (/^(?:@ingeniomaps\/)?cauce(?:@\S+)?$/.test(rest[0] || '') ? rest.slice(1) : null)
        : verb === 'npm' && rest[0] === 'run' && rest[1] === 'ops' ? rest.slice(rest[2] === '--' ? 3 : 2) : null
  return args && ['claim', 'worktree'].includes(args[0]) ? args : null
}
const flagOf = (args) => {
  const at = args.findIndex((one) => one === '--line' || one.startsWith('--line='))
  return at < 0 ? '' : args[at] === '--line' ? args[at + 1] || '' : args[at].slice('--line='.length)
}
// En el mensaje, las mismas reglas con que lo lee `autobuild` (`LINE_FLAG`, `MAX_FLAG` y `ROLE_FLAG`): si leyeran
// distinto, la corrida sería la principal y el guard la frenaría como línea.
const FLOW = /^\s*[/$](?:cauce:)?autobuild(?![\w-])(.*)$/s
const ASKED_LINE = new RegExp(String.raw`(?:^|\s)--line(?:=|\s+)${NAMED}(?=\s|$)`)
const ASKED_MAX = /(?:^|\s)--max(?:=|\s+)(\d+)(?=\s|$)/
const ASKED_ROLE = /(?:^|\s)--role(?:=|\s+)(\S+)(?=\s|$)/

// La línea que dice un pedido, '' si dice que es la principal, o null si no dice nada. Un `--line` que no está
// declarado no cambia nada, porque `ops` y `/autobuild` lo rechazan; el nombre suelto que no es una línea es un pedido
// en palabras, y `/autobuild` corre como la principal.
//
// Cambiar de línea o volver a la principal lo dice sólo la persona, con `/autobuild`. Un comando del agente puede
// anotarle una línea a la sesión que no tiene ninguna, y nada más: un `ops worktree` sin `--line` apagaba el límite
// para el resto de la sesión, y uno con otra línea le abría los árboles de otra sesión. Lo que esto contiene es al
// agente.
function told(input, root) {
  const flow = typeof input.prompt === 'string' && input.prompt.match(FLOW)
  const ran = flow ? [] : steps(commandOf(input), cwdOf(input)).map(opsArgs).filter(Boolean)
  if (!flow && !ran.length) return null
  const lines = LT.declared(root)
  const flag = flow ? (flow[1].match(ASKED_LINE) || [])[1] : ran.map(flagOf).find(Boolean)
  if (flag) return lines[flag] ? { line: flag, flow } : null
  if (!flow) return null
  const word = flow[1].replace(ASKED_MAX, ' ').replace(ASKED_LINE, ' ').replace(ASKED_ROLE, ' ').trim()
  return { line: lines[word] ? word : '', flow }
}

// Anota la línea que la sesión acaba de decir. Nunca frena: si no puede escribir, el guard juzga como antes.
function remember(input) {
  try {
    const session = sessionOf(input)
    const root = session && opsRoot(input)
    const said = root ? told(input, root) : null
    if (said === null) return
    const { line } = said
    if (!said.flow && lineOf(input, root)) return
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(recordOf(session), JSON.stringify({ root, line }))
  } catch { /* anotar es un extra */ }
}

// La línea de esta sesión, o ''. La de `CAUCE_RUNNER` —recortada, como la lee `runner()`—, o la anotada.
function lineOf(input, root) {
  const marked = LT.lineOfRunner(process.env.CAUCE_RUNNER)
  if (marked) return marked
  let saved = null
  try { saved = sessionOf(input) && JSON.parse(fs.readFileSync(recordOf(sessionOf(input)), 'utf8')) } catch { /* */ }
  return saved && saved.root === root ? saved.line : ''
}

const inside = (base, file) => file === base || file.startsWith(`${base}${path.sep}`)
const real = (file) => landing(path.sep, file)

// Lo que la llamada sabe de la línea, una vez por llamada: los guards preguntan por cada destino, y la raíz, la
// configuración y el registro no cambian entre uno y otro.
const known = new WeakMap()
function scopeOf(input) {
  if (known.has(input)) return known.get(input)
  const root = opsRoot(input)
  const read = root ? LT.config(root) : {}
  const session = root && LT.sessionOf(root, read)
  const line = session ? lineOf(input, root) : ''
  let scope = null
  if (line && LT.declared(root, read)[line]) {
    const mine = LT.trees(root, read).filter((one) => one.line === line)
    scope = { root, session, line, mine, trees: mine.flatMap(({ tree }) => [tree, real(tree)]) }
  }
  known.set(input, scope)
  return scope
}

// Lo que un `git` hace en la instancia y le cambia a la otra sesión, que tiene abierto el mismo checkout: su rama, su
// árbol, su índice o su stash. En la instancia la línea escribe —es su planning— y commitea, así que ahí lo abierto
// es lo de siempre y la excepción se declara, al revés que en el resto de la carpeta de sesión (caso 423).
const SHARED = new Set(['switch', 'checkout', 'stash', 'reset', 'rebase', 'merge', 'pull', 'restore', 'clean',
  'cherry-pick', 'revert', 'am', 'bisect'])

// Si escribir `file`, que cae en `lands`, saca a la sesión de su línea: con qué decirlo, o null. `sub` es el
// subcomando de git, cuando lo que cambia `file` es un `git` que corre ahí.
function strayed(input, file, lands = file, sub = '') {
  const scope = scopeOf(input)
  if (!scope) return null
  const { root, session, line, mine, trees } = scope
  const spots = [...new Set([file, lands])]
  const ours = (one) => trees.some((base) => inside(base, one))
  const shared = sub && SHARED.has(sub) && spots.find((one) => [root, real(root)].some((base) => inside(base, one))
    && !ours(one))
  if (shared) return { file, line, shared: sub, root }
  const off = spots.find((one) => [session, real(session)].some((base) => inside(base, one))
    && ![root, real(root)].some((base) => inside(base, one)) && !ours(one))
  if (!off) return null
  const twin = mine.find((one) => [one.source, real(one.source)].some((base) => inside(base, off)))
  return { file, line, twin: twin && path.join(twin.tree, path.relative(real(twin.source), real(off))) }
}

// Lo que un `git` no cambia del checkout donde corre: ni su rama, ni su árbol, ni su índice, ni su stash (caso 423).
// Cerrado por defecto (R27): un subcomando que no está acá cuenta como cambio. Algunos leen o escriben según lo que
// sigue, y se exime sólo la forma que lee. `fetch` escribe en el `.git` que comparten, pero no lo que la otra sesión
// tiene abierto.
const READS = new Set(['status', 'log', 'diff', 'show', 'blame', 'grep', 'ls-files', 'ls-tree', 'ls-remote',
  'rev-parse', 'rev-list', 'cat-file', 'describe', 'shortlog', 'whatchanged', 'range-diff', 'cherry', 'for-each-ref',
  'show-ref', 'merge-base', 'name-rev', 'check-ignore', 'check-attr', 'count-objects', 'verify-commit', 'verify-tag',
  'var', 'version', 'help', 'fetch'])
// `branch` lista sin argumentos o con una bandera que lista, y entonces lo que sigue es un patrón (`--list tmp`): un
// agente real lo corrió para comprobar. Con un nombre suelto, o con una bandera que borra, mueve o copia, cambia.
const BRANCH_LISTS = new RegExp(String.raw`^(?:-[avrl]+|--(?:list|all|remotes|verbose|show-current|no-color|no-column)`
  + String.raw`|--(?:contains|no-contains|merged|no-merged|points-at|sort|format|color|column)(?:=.*)?)$`)
// `tag` lista igual: sin argumentos, o con una bandera que lista; crear, firmar o borrar la cambia.
const TAG_LISTS = new RegExp(String.raw`^(?:-l|--list|-n\d*`
  + String.raw`|--(?:contains|no-contains|merged|no-merged|points-at|sort|format|column)(?:=.*)?)$`)
const TAG_CHANGES = /^(?:-[a-z]*[adsfmFuv][a-z]*|--(?:delete|annotate|sign|force|message|file|local-user)\b)/
// `config` lee con una sola clave y nada más —`git config user.email`—, o con una forma de leer, también la de 2.46
// (`git config get`). Las banderas de alcance o de formato no cambian eso.
const CONFIG_SCOPE = new RegExp(String.raw`^(?:-z|--type=.*`
  + String.raw`|--(?:local|global|system|worktree|show-origin|show-scope|null|name-only|includes|no-includes))$`)
const CONFIG_READS = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', 'get', 'list']
const BRANCH_CHANGES = new RegExp(String.raw`^(?:-[a-z]*[dDmMcCfu][a-z]*`
  + String.raw`|--(?:delete|move|copy|force|set-upstream-to|unset-upstream|edit-description|track)\b)`)
const READING = {
  branch: (args) => !args.some((one) => BRANCH_CHANGES.test(one))
    && (!args.length || args.some((one) => BRANCH_LISTS.test(one))),
  tag: (args) => !args.some((one) => TAG_CHANGES.test(one))
    && (!args.length || args.some((one) => TAG_LISTS.test(one))),
  stash: ([first]) => first === 'list' || first === 'show',
  worktree: ([first]) => first === 'list',
  remote: ([first]) => !first || ['-v', '--verbose', 'show', 'get-url'].includes(first),
  reflog: ([first]) => !first || first === 'show' || first.startsWith('-'),
  'symbolic-ref': (args) => !args.some((one) => /^(?:-d|--delete|-m)$/.test(one))
    && args.filter((one) => !one.startsWith('-')).length <= 1,
  config: (args) => {
    const left = args.filter((one) => !CONFIG_SCOPE.test(one))
    return CONFIG_READS.includes(left[0]) || (left.length === 1 && !left[0].startsWith('-'))
  },
}
const reads = (sub, args) => READS.has(sub) || Boolean(READING[sub] && READING[sub](args))

// Los checkouts que cambian los `git` de un comando, ya partido en tramos con su carpeta (`steps`). El checkout es el
// del `--work-tree`, o el de los `-C` sobre la carpeta del tramo; un tramo cuya carpeta no se sabe no se juzga.
function gitTargets(ran) {
  const found = []
  for (const { verb, rest, base } of ran) {
    if (verb !== 'git' || base === null) continue
    let dir = base
    let tree = ''
    let at = 0
    for (; at < rest.length && rest[at].startsWith('-'); at += 1) {
      const [flag, glued] = rest[at].split(/=(.*)/s)
      const value = () => (glued !== undefined ? glued : rest[(at += 1)])
      if (flag === '-C') dir = path.resolve(dir, rest[(at += 1)] || '')
      else if (flag === '--work-tree') tree = value()
      else if (['-c', '--git-dir', '--namespace', '--config-env'].includes(flag) && glued === undefined) at += 1
    }
    const sub = rest[at]
    if (sub && !reads(sub, rest.slice(at + 1))) found.push({ dir: tree ? path.resolve(dir, tree) : dir, sub })
  }
  return found
}

// Un `git` en la instancia no se nombra como un archivo: la persona pide «el merge de main», no una carpeta, y con la
// ruta como ítem su orden no lo destrababa nunca (caso 449). El ítem es el subcomando con su lugar. La orden tiene que
// nombrar ese subcomando —«merge», «mergeá», «stash»—, como un archivo se nombra por su ruta: si alcanzara cualquier
// mensaje, un «implementá la tarea» dejaba al agente cambiarle la rama a la sesión principal (caso 423). Lo demás lo
// juzga el agente, como el merge de un PR (caso 280): el guard frena el mensaje que pregunta, niega o frena, y lo que
// llega tras un aviso del runner.
const sharedItem = (one) => AP.placed(`git ${one.shared}`, one.root)
// El nombre va entero —«ambos» no es `am`— y, si es largo, conjugado en español: «mergeá», «stasheá».
function ordersShared(text, item, { relayed = false } = {}) {
  const sub = CHAT.spokenOf(item).replace(/^git /, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const conjugated = sub.length >= 4 ? '(?:[aáeéií]\\p{L}*)?' : ''
  return !relayed && !CHAT.refuses(text) && new RegExp(`(?<![\\p{L}])${sub}${conjugated}(?![\\p{L}])`, 'iu')
    .test(String(text))
}

// El bloqueo, con todo lo que salió de la línea junto. `found` lleva lo que devolvió `strayed`.
function refusal(input, found) {
  if (!found.length) return ''
  const root = opsRoot(input)
  const shared = found.filter((one) => one.shared)
  // La ruta de la instancia pegada antes del 449 sigue aprobando su `git`: era la línea que el bloqueo ofrecía.
  const filed = new Set(root ? AP.read(root) : [])
  const held = [...AP.pendingNow(root, [...new Set(found.filter((one) => !one.shared).map((one) => one.file))], input),
    ...AP.pendingNow(root, [...new Set(shared.filter((one) => !filed.has(one.file)).map(sharedItem))], input,
      ordersShared)]
  if (!held.length) return ''
  const { line } = found[0]
  const where = found.map((one) => (one.shared ? `${one.file} es la instancia, una sola para las dos sesiones, y \`git `
    + `${one.shared}\` le cambia a la otra su rama, su árbol o su stash` : one.twin
    ? `${one.file} va en el árbol de la línea: ${one.twin}` : `${one.file} no es de la línea`))
  return `esta sesión lleva la línea ${line}, y escribe sólo en sus árboles (lines/${line}/…) y en la instancia: `
    + `${where.join('; ')}. Lo de afuera de la línea es de la sesión principal, que lo tiene abierto en su rama. `
    + `Si la línea tiene que trabajar otro repositorio, se suma con \`ops line <ops-root> ${line} <repo>\`.\n`
    // Lo que la línea escribe afuera lo corrige ella, escribiéndolo en su árbol; un `git` en la instancia, no.
    + AP.HOW(null, held, input, held, { fixable: !shared.length, turn: true })
}

module.exports = { DIR, remember, lineOf, strayed, refusal, gitTargets }
