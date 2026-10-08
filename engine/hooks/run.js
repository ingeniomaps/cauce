#!/usr/bin/env node
'use strict'

// El registro de guards y su despacho: cuáles existen, en qué grupo corre cada uno y qué documenta.
// Es el punto por el que un runner los invoca —`run-hook.sh` ejecuta este archivo— y lo único que
// crece de a un guard. Lo que cada uno hace vive en `shell.js` y `files.js`, según qué lee de la
// entrada; cómo se lee esa entrada, en `input.js`.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readInput, block, opsRoot } = require('./input')
const shell = require('./shell')
const { verify } = require('./verify')
const files = require('./files')
const { migrations } = require('./migrations')
const chat = require('./chat')
const { rulesNotice } = require('./rules-notice')
const CF = require('./confirm')
const { secretsShell } = require('./secrets-shell')
const { opsConfig, opsConfigShell } = require('./ops-config')
const { jiraAdf } = require('./jira')
const { testWorkers } = require('./workers')
const { comments } = require('./comments')
const { liveCommit } = require('./live-commit')
const { aiSignature } = require('./ai-signature')
const { testEvidenceShell } = require('./test-evidence-shell')

function planningDrift(input) {
  const root = opsRoot(input)
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
  block(`Planning o integraciones quedaron desalineados:\n${result.output}${repairable(result.output, root)}`)
}
// Con qué criterio se repara una entrada de `done/`, dicho a la sesión: es el único texto con que este guard
// le habla. Sin él leía la salida de `check` como algo a dejar en verde, y lo dejaba: en la entrada de otra
// tarea sacó la condición que la traza cubría, porque era lo que rompía el formato (caso 322). Es el criterio
// con que el recorrido repara al cerrar —sólo lo que se deduce de otra cosa—, más lo que una sesión necesita
// y un agente del recorrido no: a quién decírselo.
//
// Sale sólo cuando el rojo es de una entrada de `done/`. En una configuración rota o un archivo que falta no
// hay entrada ni evidencia de la que hablar.
function repairable(output, root) {
  if (!/^\s*✗ done\//m.test(output)) return ''
  return '\nUna entrada de done/ se repara sólo en lo que se deduce de otra cosa —un formato, un campo que sale '
    + 'de otro, una referencia que quedó vieja—, y sin perder nada de lo que dice: lo que no entra en el formato '
    + 'se mueve dentro de la entrada, no se borra. Lo que una tarea cerrada afirma —su aceptación, su evidencia, '
    + 'sus decisiones— no se cambia ni se completa para que esto pase. Si el error pide eso, dejalo como está y '
    + `decíselo a la persona; si no está, anotalo en ${path.join(root, 'planning', 'HUMAN_ACTIONS.md')} como una `
    + 'fila más.'
}

const guards = {
  destructive: shell.destructive,
  'git-add': shell.gitAdd,
  dependencies: shell.dependencies,
  governance: shell.governance,
  'live-commit': liveCommit,
  'ai-signature': aiSignature,
  verify,
  'shell-boundary': shell.shellBoundary,
  'secrets-shell': secretsShell,
  'ops-config-shell': opsConfigShell,
  'ops-config': opsConfig,
  secrets: files.secrets,
  generated: files.generated,
  'workspace-boundary': files.workspaceBoundary,
  engine: files.engineWrites,
  migrations,
  'integration-snapshot': files.integrationSnapshot,
  'test-evidence': files.testEvidence,
  'test-evidence-shell': testEvidenceShell,
  'plan-first': files.planFirst,
  'secrets-read': files.secretsRead,
  'jira-adf': jiraAdf,
  'test-workers': testWorkers,
  comments,
  chat: chat.record,
  'rules-notice': rulesNotice,
  'planning-drift': planningDrift,
}

// Grupos por evento: un runner corre el grupo entero en un solo proceso en lugar de un guard por hook.
const hookGroups = {
  'pre-shell': ['destructive', 'git-add', 'dependencies', 'governance', 'live-commit', 'ai-signature', 'comments',
    'verify',
    'shell-boundary', 'secrets-shell', 'test-evidence-shell', 'ops-config-shell', 'test-workers'],
  'pre-files': ['secrets', 'generated', 'workspace-boundary', 'engine', 'migrations',
    'integration-snapshot', 'test-evidence', 'plan-first', 'ops-config'],
  'pre-read': ['secrets-read'],
  'pre-mcp': ['jira-adf'],
  prompt: ['chat'],
  // Aparte de `prompt`: lo que `chat` imprime se descarta, y lo de éste es justo lo que tiene que llegar.
  'prompt-notice': ['rules-notice'],
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
    name: 'live-commit',
    event: 'PreToolUse · shell',
    purpose: 'Frena el commit en la rama viva y manda a cortar una rama; pasa si se pidió o se declaró.',
  },
  {
    name: 'ai-signature',
    event: 'PreToolUse · shell',
    purpose: 'Frena un commit o un texto de PR que lleva una firma de IA; pasa si el proyecto lo declaró.',
  },
  {
    name: 'verify',
    event: 'PreToolUse · shell',
    purpose: 'Ejecuta los gates del stack y comprueba drift generado antes de un commit.',
  },
  {
    name: 'shell-boundary',
    event: 'PreToolUse · shell',
    purpose: 'Frena el destino evidente de un comando que escribe fuera de las raíces declaradas, o en la '
      + 'aprobación de la persona.',
  },
  {
    name: 'secrets',
    event: 'PreToolUse · files',
    purpose: 'Bloquea escribir secretos, claves privadas y credenciales en texto plano.',
  },
  {
    name: 'secrets-read',
    event: 'PreToolUse · read',
    purpose: 'Bloquea leer con la herramienta del runner una credencial conocida o declarada.',
  },
  {
    name: 'comments',
    event: 'PreToolUse · shell',
    purpose: 'Si ops.config.json declara comments, frena una vez cada commit que agrega comentarios y los lista '
      + 'para la pasada de R11; con language o inlineMax, frena también lo que los rompe.',
  },
  {
    name: 'test-workers',
    event: 'PreToolUse · shell',
    purpose: 'Frena jest o vitest llamados sin cota de workers, que lanzan tantos procesos como núcleos.',
  },
  {
    name: 'jira-adf',
    event: 'PreToolUse · mcp',
    purpose: 'Frena editar por MCP la descripción de una tarjeta de Jira en markdown, que aplana el ADF.',
  },
  {
    name: 'secrets-shell',
    event: 'PreToolUse · shell',
    purpose: 'Bloquea leer por shell una credencial conocida o declarada; lo que la persona pidió en el chat '
      + 'pasa.',
  },
  {
    name: 'ops-config',
    event: 'PreToolUse · files',
    purpose: 'No deja al agente escribirse el permiso de push: frena la escritura que cambia '
      + 'runner.allowPush o runner.pushToLiveBranches en ops.config.json. El resto del archivo pasa.',
  },
  {
    name: 'ops-config-shell',
    event: 'PreToolUse · shell',
    purpose: 'Frena toda escritura por shell sobre ops.config.json: un comando no dice con qué va a '
      + 'quedar el archivo, así que no hay contenido que comparar.',
  },
  { name: 'generated', event: 'PreToolUse · files', purpose: 'Impide editar código generado manualmente.' },
  {
    name: 'workspace-boundary',
    event: 'PreToolUse · files',
    purpose: 'Limita escrituras a las raíces declaradas en ops.config.json, y no deja al agente escribirse '
      + 'la aprobación de la persona.',
  },
  {
    name: 'engine',
    event: 'PreToolUse · files',
    purpose: 'Impide editar el motor instalado por npm. Inerte en el propio toolkit.',
  },
  {
    name: 'migrations',
    event: 'PreToolUse · files',
    purpose: 'Protege migraciones existentes y bloquea SQL destructivo o el borrado con la API del ORM en la '
      + 'parte que aplica —no en su reversión—, sobre las extensiones y carpetas que el proyecto declare en '
      + 'migrations.extensions y migrations.paths — sólo .sql bajo migrations/, migration/ o migrate/ si no '
      + 'declara nada.',
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
    name: 'test-evidence-shell',
    event: 'PreToolUse · shell',
    purpose: 'Impide borrar por shell una prueba del proyecto; una copia desechable no la mira.',
  },
  {
    name: 'plan-first',
    event: 'PreToolUse · files',
    purpose: 'Exige WIP activo con plan escrito antes de cambiar el producto.',
  },
  {
    name: 'chat',
    event: 'UserPromptSubmit / BeforeAgent',
    purpose: 'Registra el mensaje de la persona: lo que nombró o aprobó en el chat pasa sin archivo. Nunca '
      + 'bloquea.',
  },
  {
    name: 'rules-notice',
    event: 'UserPromptSubmit',
    purpose: 'Le nombra a la sesión las reglas vigentes que el runner instalado no carga. Nunca bloquea.',
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

// Corre en ese orden y el primero que bloquea corta. Lo que se le pregunta a la persona no corta: si
// cortara, aprobar el diálogo dejaría correr la herramienta sin que los guards siguientes la miraran. Se
// junta, los demás corren, y si alguno bloquea de verdad gana el bloqueo; si no, va un solo diálogo con
// todos los motivos (caso 221).
function executeAll(names, input) {
  const asked = []
  for (const name of resolve(names)) {
    // Una marca que quedó de un guard que no llegó a bloquear no puede convertir en pregunta el bloqueo de
    // otro.
    CF.takeAsk(input)
    try {
      execute(name, input)
    } catch (error) {
      if (!error.blocked || !CF.takeAsk(input)) throw error
      asked.push(error.message)
    }
  }
  if (asked.length) {
    const error = new Error(asked.join('\n\n'))
    error.ask = true
    throw error
  }
}

// Lo que Claude Code lee para abrir su diálogo; el motivo es lo que la persona ve, o lo que el agente
// recibe como error si no hay diálogo.
function askOutput(message) {
  return JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: message } })
}

// Asíncrono sólo por la lectura de stdin, que necesita un plazo (`input.js`); los guards siguen siendo
// sincrónicos y `executeAll` también, así que quien los llama directo no cambia.
if (require.main === module) {
  readInput().then((input) => executeAll(process.argv.slice(2), input)).catch((error) => {
    if (error.ask) {
      process.stdout.write(askOutput(error.message))
      return
    }
    console.error(`BLOQUEADO: ${error.message}`)
    process.exit(error.blocked ? 2 : 1)
  })
}

module.exports = {
  execute, executeAll, guards, hookGroups, hookMetadata,
}
