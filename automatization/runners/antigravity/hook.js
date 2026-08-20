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

function declaredRoot() {
  // El plugin vive en <raíz-de-instalación>/.agents/plugins/cauce/.
  const installed = path.resolve(__dirname, '..', '..', '..')
  const root = OPS_DIR.startsWith('{{') ? installed : path.join(installed, OPS_DIR)
  return fs.existsSync(path.join(root, 'ops.config.json')) ? root : ''
}

function findRoot(input) {
  const declared = declaredRoot()
  if (declared) return declared
  const args = input.toolCall && input.toolCall.args || {}
  const starts = [args.Cwd, process.cwd(), ...(input.workspacePaths || [])].filter(Boolean)
  for (const start of starts) {
    let current = path.resolve(start)
    while (true) {
      const instance = fs.existsSync(path.join(current, 'planning'))
      const toolkit = fs.existsSync(path.join(current, 'engine', 'hooks', 'run.js'))
      if (fs.existsSync(path.join(current, 'ops.config.json')) && (instance || toolkit)) return current
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  throw new Error('No se encontró una raíz Cauce desde el workspace de Antigravity.')
}

function runtimeAt(root) {
  // Mismo orden que tools/ops.js: dependencia npm y, por último, el repositorio del toolkit.
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

function normalize(input) {
  const args = input.toolCall && input.toolCall.args || {}
  const file = args.TargetFile || args.AbsolutePath || ''
  const content = args.CodeContent || args.ReplacementContent
    || (args.ReplacementChunks && JSON.stringify(args.ReplacementChunks)) || ''
  return {
    sessionId: input.conversationId,
    cwd: args.Cwd || (input.workspacePaths || [])[0] || process.cwd(),
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
    const normalized = normalize(input)
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
