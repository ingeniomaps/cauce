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

function findRoot(input) {
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
  throw new Error('No se encontró una raíz Project Ops desde el workspace de Antigravity.')
}

function runtimeAt(root) {
  const candidates = [path.join(root, '.ops', 'engine', 'hooks', 'run.js'), path.join(root, 'engine', 'hooks', 'run.js')]
  const runtime = candidates.find(fs.existsSync)
  if (!runtime) throw new Error('No se encontró el runtime engine/hooks/run.js.')
  return require(runtime)
}

function normalize(input) {
  const args = input.toolCall && input.toolCall.args || {}
  const file = args.TargetFile || args.AbsolutePath || ''
  const content = args.CodeContent || args.ReplacementContent || (args.ReplacementChunks && JSON.stringify(args.ReplacementChunks)) || ''
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
    if (event === 'stop') return { decision: 'continue', reason: `Project Ops: ${error.message}` }
    return { decision: 'deny', reason: `Project Ops: ${error.message}` }
  }
}

function main() {
  respond(evaluate(process.argv[2], readInput()))
}

if (require.main === module) main()

module.exports = { evaluate, findRoot, normalize }
