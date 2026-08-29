#!/usr/bin/env node
'use strict'

// El registro de guards y su despacho: cuáles existen, en qué grupo corre cada uno y qué documenta.
// Es el punto por el que un runner los invoca —`run-hook.sh` ejecuta este archivo— y lo único que
// crece de a un guard. Lo que cada uno hace vive en `shell.js` y `files.js`, según qué lee de la
// entrada; cómo se lee esa entrada, en `input.js`.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readInput, cwdOf, block, findOpsRoot } = require('./input')
const shell = require('./shell')
const files = require('./files')

function planningDrift(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  const local = path.join(root, 'tools', 'ops.js')
  const source = path.join(root, 'engine', 'cli', 'ops.js')
  const cli = fs.existsSync(local) ? local : source
  if (!fs.existsSync(cli)) return
  const result = shell.run(process.execPath, [cli, 'check', path.join(root, 'planning')], root)
  const session = String(input.session_id || input.sessionId || 'nosession').replace(/[^a-zA-Z0-9_-]/g, '_')
  const marker = path.join(os.tmpdir(), `cauce-drift-${session}`)
  if (result.ok) {
    try { fs.unlinkSync(marker) } catch { /* already clean */ }
    return
  }
  if (fs.existsSync(marker)) return
  fs.writeFileSync(marker, '')
  block(`Planning o integraciones quedaron desalineados:\n${result.output}`)
}

const guards = {
  destructive: shell.destructive,
  'git-add': shell.gitAdd,
  dependencies: shell.dependencies,
  governance: shell.governance,
  verify: shell.verify,
  secrets: files.secrets,
  generated: files.generated,
  'workspace-boundary': files.workspaceBoundary,
  engine: files.engineWrites,
  migrations: files.migrations,
  'integration-snapshot': files.integrationSnapshot,
  'test-evidence': files.testEvidence,
  'planning-drift': planningDrift,
}

// Grupos por evento: un runner corre el grupo entero en un solo proceso en lugar de un guard por hook.
const hookGroups = {
  'pre-shell': ['destructive', 'git-add', 'dependencies', 'governance', 'verify'],
  'pre-files': ['secrets', 'generated', 'workspace-boundary', 'engine', 'migrations',
    'integration-snapshot', 'test-evidence'],
  stop: ['planning-drift'],
}

const hookMetadata = [
  {
    name: 'destructive',
    event: 'PreToolUse · shell',
    purpose: 'Bloquea publicación y comandos capaces de destruir datos o el working tree.',
  },
  {
    name: 'git-add',
    event: 'PreToolUse · shell',
    purpose: 'Impide `git add .`, `-A` y `--all`; exige rutas explícitas.',
  },
  {
    name: 'dependencies',
    event: 'PreToolUse · shell',
    purpose: 'Protege manifests y lockfiles; bloquea publicar e instalar global.',
  },
  {
    name: 'governance',
    event: 'PreToolUse · shell',
    purpose: 'Impide commitear cambios de gobernanza sin aprobación.',
  },
  {
    name: 'verify',
    event: 'PreToolUse · shell',
    purpose: 'Ejecuta los gates del stack y comprueba drift generado antes de un commit.',
  },
  {
    name: 'secrets',
    event: 'PreToolUse · files',
    purpose: 'Bloquea escribir secretos, claves privadas y credenciales en texto plano.',
  },
  { name: 'generated', event: 'PreToolUse · files', purpose: 'Impide editar código generado manualmente.' },
  {
    name: 'workspace-boundary',
    event: 'PreToolUse · files',
    purpose: 'Limita escrituras a las raíces declaradas en ops.config.json.',
  },
  {
    name: 'engine',
    event: 'PreToolUse · files',
    purpose: 'Impide editar el motor instalado por npm. Inerte en el propio toolkit.',
  },
  {
    name: 'migrations',
    event: 'PreToolUse · files',
    purpose: 'Protege migraciones existentes y bloquea SQL destructivo sin override.',
  },
  {
    name: 'integration-snapshot',
    event: 'PreToolUse · files',
    purpose: 'Protege snapshots administrados por integraciones.',
  },
  {
    name: 'test-evidence',
    event: 'PreToolUse · files',
    purpose: 'Impide apagar o borrar la prueba que juzga el cambio.',
  },
  {
    name: 'planning-drift',
    event: 'Stop / SessionEnd',
    purpose: 'Evita cerrar una sesión con planning o integraciones desalineados.',
  },
]

function execute(name, input) {
  const guard = guards[name]
  if (!guard) throw new Error(`Hook desconocido: ${name}`)
  guard(input)
}

// Expande grupos a guards y conserva el orden declarado.
function resolve(names) {
  const resolved = names.flatMap((name) => hookGroups[name] || [name])
  if (!resolved.length) throw new Error('Se requiere el nombre de un guard o de un grupo.')
  return resolved
}

// Corre en ese orden y el primero que bloquea corta: `execute` lanza y acá nadie lo atrapa.
function executeAll(names, input) {
  for (const name of resolve(names)) execute(name, input)
}

if (require.main === module) {
  try { executeAll(process.argv.slice(2), readInput()) } catch (error) {
    console.error(`BLOQUEADO: ${error.message}`)
    process.exit(error.blocked ? 2 : 1)
  }
}

module.exports = {
  execute, executeAll, findOpsRoot, guards, hookGroups, hookMetadata,
}
