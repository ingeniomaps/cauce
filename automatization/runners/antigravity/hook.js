#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Dónde quedó la raíz ops respecto de la carpeta que Antigravity abre. Lo completa
// `automation install`, que es el único momento en que se sabe: en modo sidecar la raíz ops es un
// hermano de los repos de producto, y ninguna búsqueda hacia arriba la encuentra. Sin esto el bridge
// no hallaba `ops.config.json` y, como falla cerrado, negaba cada llamada a herramienta.
const OPS_DIR = '{{OPS_DIR}}'

// Y la ruta absoluta, porque con Antigravity no hay de dónde deducirla. Su payload manda
// `workspacePaths` vacío y un `Cwd` que apunta al scratch del CLI o al home; el hook lo ejecuta `agy`
// desde la copia que registró en `~/.gemini/config/plugins/`, cuyo `__dirname` no lleva a ningún
// proyecto. Nada de eso nombra el workspace, así que el ancla se escribe al instalar o no existe.
const OPS_ROOT = '{{OPS_ROOT}}'

// Los dos marcadores y la carpeta desde la que corre el puente, juntos y pasables como argumento. El
// default es lo que `automation install` deja escrito; poder reemplazarlo es lo que permite ejercer
// desde el repositorio lo que sólo existe instalado. Sin eso, la resolución de la raíz —donde ya se
// escondieron dos fallas que negaban cada llamada a herramienta— sólo se puede probar sobre una copia,
// y una copia no la mide ninguna cobertura.
const MARKERS = { dir: OPS_DIR, root: OPS_ROOT, plugin: __dirname }

function isRoot(dir) {
  const instance = fs.existsSync(path.join(dir, 'planning'))
  const toolkit = fs.existsSync(path.join(dir, 'engine', 'hooks', 'run.js'))
  return fs.existsSync(path.join(dir, 'ops.config.json')) && (instance || toolkit)
}

function declaredRoot(markers) {
  if (!markers.root.startsWith('{{') && isRoot(markers.root)) return markers.root
  // El plugin corriendo desde donde `automation install` lo dejó, que es el caso sin registrar.
  const installed = path.resolve(markers.plugin, '..', '..', '..')
  const root = markers.dir.startsWith('{{') ? installed : path.join(installed, markers.dir)
  return fs.existsSync(path.join(root, 'ops.config.json')) ? root : ''
}

// En sidecar se abre la carpeta de la compañía y la raíz ops es una de sus hijas, así que buscar sólo
// hacia arriba no la encuentra nunca: el puente fallaba cerrado y negaba cada llamada a herramienta.
// Un nivel hacia abajo alcanza para los dos modos y es determinista; recorrer el árbol del producto,
// no. Dos candidatas hermanas es una ambigüedad que nadie puede resolver acá: se abstiene.
function childRoot(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return '' }
  const roots = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(dir, entry.name))
    .filter(isRoot)
  return roots.length === 1 ? roots[0] : ''
}

function findRoot(input, markers = MARKERS) {
  const declared = declaredRoot(markers)
  if (declared) return declared
  const args = input.toolCall && input.toolCall.args || {}
  const starts = [args.Cwd, process.cwd(), ...(input.workspacePaths || [])].filter(Boolean)
  for (const start of starts) {
    const base = path.resolve(start)
    const child = isRoot(base) ? base : childRoot(base)
    if (child) return child
    let current = path.dirname(base)
    while (true) {
      if (isRoot(current)) return current
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  throw new Error('No se encontró una raíz Cauce desde el workspace de Antigravity.')
}

function engineAt(root, file) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'hooks', file),
    path.join(root, 'engine', 'hooks', file),
    path.join(root, '..', 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'hooks', file),
  ]
  // Copia de `packagePath`; su porqué vive allá. Son tres los que la repiten y el motor los nombra.
  return candidates.find(fs.existsSync) || ''
}

function runtimeAt(root) {
  const runtime = engineAt(root, 'run.js')
  if (!runtime) throw new Error('No se encontró el runtime engine/hooks/run.js.')
  return require(runtime)
}

// La entrada se lee con el lector del motor y no con uno propio: el puente tenía su copia, y la copia se
// colgaba con stdin abierto y convertía un JSON ilegible en `allow` (caso 198). El problema es de orden:
// la raíz que dice dónde está el motor puede salir de la entrada misma (`findRoot`). Por eso se busca
// sólo en la que se conoce sin leerla, `declaredRoot`: la que `install` dejó escrita, o la carpeta de la
// que cuelga el puente, que desde el fuente es este mismo repositorio. Sin ella no hay con qué leer, y
// eso niega como cualquier otra falla del puente.
function inputReader(markers = MARKERS) {
  const declared = declaredRoot(markers)
  const reader = declared && engineAt(declared, 'input.js')
  if (!reader) {
    throw new Error('No se encontró engine/hooks/input.js, con el que se lee la entrada, en la raíz que '
      + `automation install declaró (${declared || 'ninguna'}). Reinstalá el runner.`)
  }
  return require(reader)
}

// La carpeta que el runner abrió, deducida de la raíz: en sidecar la raíz ops es su hija, y en modo
// embebido son la misma.
function workspaceOf(root, markers) {
  const relative = markers.dir.startsWith('{{') ? '' : markers.dir.replace(/\/+$/, '')
  if (!relative) return root
  return path.resolve(root, ...relative.split('/').map(() => '..'))
}

function within(dir, base) {
  const relative = path.relative(base, dir)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

// Contra qué resuelven los guards una ruta relativa o el directorio git. El `Cwd` de Antigravity no
// sirve para eso: apunta al scratch del CLI o al home, así que un guard que juzgue `src/x.js` estaría
// juzgando otro archivo, y uno que busque el repo git lo buscaría fuera del proyecto. Se respeta el
// que manda sólo si cae adentro del workspace —si algún día manda uno real, es mejor que el nuestro—;
// si no, el workspace, que es donde el runner dice estar trabajando.
function cwdFor(args, root, markers) {
  const declared = args.Cwd && path.resolve(String(args.Cwd))
  const workspace = workspaceOf(root, markers)
  return declared && within(declared, workspace) ? declared : workspace
}

function normalize(input, root, markers = MARKERS) {
  const args = input.toolCall && input.toolCall.args || {}
  const file = args.TargetFile || args.AbsolutePath || ''
  const content = args.CodeContent || args.ReplacementContent
    || (args.ReplacementChunks && JSON.stringify(args.ReplacementChunks)) || ''
  return {
    sessionId: input.conversationId,
    cwd: cwdFor(args, root, markers),
    tool_input: {
      command: args.CommandLine || '',
      file_path: file,
      content,
    },
  }
}

function respond(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function refusal(event, message, blocking) {
  const reason = `Cauce: ${message}`
  if (event !== 'stop') return { decision: 'deny', reason }
  // Un guard que bloquea marca su error con `blocked` (engine/hooks/run.js); cualquier otro es que el
  // puente no llegó a juzgar nada. En `stop` los dos devolvían `continue`, y eso ata al agente: la
  // raíz que no resuelve no se arregla sola, así que cada intento de cerrar repite el mismo error.
  // El bloqueo sigue dando `continue` —es el mecanismo funcionando—; la falla deja cerrar y avisa.
  return blocking ? { decision: 'continue', reason } : { decision: 'stop', reason }
}

// Lo que cada evento tiene que traer para que sus guards juzguen algo. `normalize` lee campos por nombre y
// convierte en `''` el que no encuentra, así que una llamada con otra forma —un campo renombrado en una
// actualización de Antigravity— llegaba vacía a los guards, ninguno frenaba y el puente respondía `allow`:
// todos los guards apagados sin rastro (caso 200). Cerrado por defecto: sin lo que el evento juzga, se niega
// y se dice qué llegó, que es lo que hace falta para enseñarle la forma nueva a `normalize`.
//
// Una entrada vacía no es una llamada con otra forma: no describe ninguna, y es como se invoca a mano, con
// `OPS_HOOK_COMMAND` u `OPS_HOOK_FILE` (caso 198).
const DESCRIBED_BY = {
  'pre-shell': { field: 'command', names: 'CommandLine' },
  'pre-files': { field: 'file_path', names: 'TargetFile ni AbsolutePath' },
}

// Un archivo sin su contenido tampoco se puede juzgar: los guards que miran qué se escribe —secretos,
// migraciones— verían un texto vacío. Basta que el campo esté; vacío es un archivo vacío.
const CONTENT_FIELDS = ['CodeContent', 'ReplacementContent', 'ReplacementChunks']

function undescribed(event, input, normalized) {
  const need = DESCRIBED_BY[event]
  if (!need || !Object.keys(input).length) return ''
  const fields = (input.toolCall && input.toolCall.args) || {}
  const args = Object.keys(fields)
  const missing = !normalized.tool_input[need.field] ? need.names
    : event === 'pre-files' && !CONTENT_FIELDS.some((field) => field in fields)
      ? 'CodeContent, ReplacementContent ni ReplacementChunks' : ''
  if (!missing) return ''
  const received = args.length ? `toolCall.args trae ${args.join(', ')}` : `llegó ${Object.keys(input).join(', ')}`
  return `la llamada no trae ${missing}, así que no hay nada que juzgar y no se autoriza (${received}). Si `
    + 'Antigravity cambió el formato de sus llamadas, el puente tiene que aprenderlo en normalize().'
}

function evaluate(event, input) {
  try {
    const root = findRoot(input)
    process.env.OPS_ROOT = root
    const hooks = runtimeAt(root)
    const normalized = normalize(input, root)
    if (!hooks.hookGroups[event]) throw new Error(`Evento Antigravity desconocido: ${event || '(vacío)'}`)
    const missing = undescribed(event, input, normalized)
    if (missing) throw new Error(missing)
    hooks.executeAll([event], normalized)
    return event === 'stop' ? { decision: 'stop' } : { decision: 'allow' }
  } catch (error) {
    return refusal(event, error.message, error.blocked)
  }
}

async function main(event = process.argv[2]) {
  let input
  try {
    const engine = inputReader()
    const usage = 'pasale el JSON de Antigravity —printf \'%s\' '
      + `'{"toolCall":{"args":{"CommandLine":"…"}}}' | node hook.js ${event || '<evento>'}—`
    input = await engine.readInput(process.stdin, engine.FIRST_BYTE_MS, usage)
  } catch (error) {
    // El lector del motor marca `blocked` lo que no pudo leer, porque para un guard eso es bloquear. Acá
    // es el puente sin nada que juzgar, y en `stop` eso deja cerrar: reintentar no arregla la entrada.
    return respond(refusal(event, error.message, false))
  }
  respond(evaluate(event, input))
}

if (require.main === module) main()

module.exports = { evaluate, findRoot, normalize, inputReader }
