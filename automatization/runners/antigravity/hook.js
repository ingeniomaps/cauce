#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch { return {} }
}

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
const MARCAS = { dir: OPS_DIR, root: OPS_ROOT, plugin: __dirname }

function isRoot(dir) {
  const instance = fs.existsSync(path.join(dir, 'planning'))
  const toolkit = fs.existsSync(path.join(dir, 'engine', 'hooks', 'run.js'))
  return fs.existsSync(path.join(dir, 'ops.config.json')) && (instance || toolkit)
}

function declaredRoot(marcas) {
  if (!marcas.root.startsWith('{{') && isRoot(marcas.root)) return marcas.root
  // El plugin corriendo desde donde `automation install` lo dejó, que es el caso sin registrar.
  const installed = path.resolve(marcas.plugin, '..', '..', '..')
  const root = marcas.dir.startsWith('{{') ? installed : path.join(installed, marcas.dir)
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

function findRoot(input, marcas = MARCAS) {
  const declared = declaredRoot(marcas)
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

function runtimeAt(root) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'hooks', 'run.js'),
    path.join(root, 'engine', 'hooks', 'run.js'),
  ]
  // El bridge corre antes de poder cargar el motor, así que repite la cascada de
  // engine/core/ownership.js en vez de requerirla. Si cambia una, cambian las dos.
  const runtime = candidates.find(fs.existsSync)
  if (!runtime) throw new Error('No se encontró el runtime engine/hooks/run.js.')
  return require(runtime)
}

// La carpeta que el runner abrió, deducida de la raíz: en sidecar la raíz ops es su hija, y en modo
// embebido son la misma.
function workspaceOf(root, marcas) {
  const relative = marcas.dir.startsWith('{{') ? '' : marcas.dir.replace(/\/+$/, '')
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
function cwdFor(args, root, marcas) {
  const declared = args.Cwd && path.resolve(String(args.Cwd))
  const workspace = workspaceOf(root, marcas)
  return declared && within(declared, workspace) ? declared : workspace
}

function normalize(input, root, marcas = MARCAS) {
  const args = input.toolCall && input.toolCall.args || {}
  const file = args.TargetFile || args.AbsolutePath || ''
  const content = args.CodeContent || args.ReplacementContent
    || (args.ReplacementChunks && JSON.stringify(args.ReplacementChunks)) || ''
  return {
    sessionId: input.conversationId,
    cwd: cwdFor(args, root, marcas),
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

function evaluate(event, input) {
  try {
    const root = findRoot(input)
    process.env.OPS_ROOT = root
    const hooks = runtimeAt(root)
    const normalized = normalize(input, root)
    if (!hooks.hookGroups[event]) throw new Error(`Evento Antigravity desconocido: ${event || '(vacío)'}`)
    hooks.executeAll([event], normalized)
    return event === 'stop' ? { decision: 'stop' } : { decision: 'allow' }
  } catch (error) {
    const reason = `Cauce: ${error.message}`
    if (event !== 'stop') return { decision: 'deny', reason }
    // Un guard que bloquea marca su error con `blocked` (engine/hooks/run.js); cualquier otro es que el
    // puente no llegó a juzgar nada. En `stop` los dos devolvían `continue`, y eso ata al agente: la
    // raíz que no resuelve no se arregla sola, así que cada intento de cerrar repite el mismo error.
    // El bloqueo sigue dando `continue` —es el mecanismo funcionando—; la falla deja cerrar y avisa.
    return error.blocked ? { decision: 'continue', reason } : { decision: 'stop', reason }
  }
}

function main() {
  respond(evaluate(process.argv[2], readInput()))
}

if (require.main === module) main()

module.exports = { evaluate, findRoot, normalize }
