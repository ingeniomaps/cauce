'use strict'

// Cómo un guard lee lo que el runner le mandó, y cómo se niega. Es una sola pregunta —qué hay en la
// entrada y cómo se interpreta— y la comparten las tres familias de guards, así que vive acá y no en
// ninguna de ellas: copiada, una copia dejaría de reconocer un formato y su guard permitiría todo en
// silencio, que es la falla que ninguna prueba verde delata.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

function commandOf(input) {
  const value = input.tool_input && (input.tool_input.command || input.tool_input.cmd)
    || input.command || input.input && input.input.command || process.env.OPS_HOOK_COMMAND || ''
  return Array.isArray(value) ? value.join(' ') : String(value)
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

function gitDirectory(command, cwd) {
  const flag = command.match(/(?:^|\s)git\s+-C\s+(['"]?)([^\s'";&|]+)\1/)
  const cd = command.match(/(?:^|[;&|]\s*)cd\s+(['"]?)([^\s'";&|]+)\1/)
  return path.resolve(cwd, flag ? flag[2] : cd ? cd[2] : '.')
}

function isCommit(command) {
  return /(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/.test(command)
}

function stagedFiles(dir) {
  const result = spawnSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim().split('\n').filter(Boolean) : []
}

// R10 pide «la autorización configurada para el proyecto» y `runner.allowPush` es esa configuración:
// sin esto era un interruptor que nadie leía, y un cargo que lo leyó dio por imposible un push que el
// guard bloqueaba igual. Sin raíz legible no hay permiso que verificar, así que no se autoriza.
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

module.exports = {
  readInput, commandOf, patchOf, filesOf, contentOf, cwdOf, block, configOf,
  gitDirectory, isCommit, stagedFiles, pushAllowed, findOpsRoot,
}
