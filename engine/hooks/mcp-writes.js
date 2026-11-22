'use strict'

// Lo que un agente escribe por un servidor MCP en un sistema ajeno —una tarjeta, un comentario, una página, un
// mensaje, un merge— lo deja R12 a una persona, y por shell el motor ya frenaba parte de eso (caso 541). Por MCP no
// frenaba nada: el único guard era `jira-adf`, que cuida el formato.
//
// Cerrado por defecto (R27, decisión del caso): todo servidor se trata como real y lo que no se reconoce como lectura
// es escritura, así que una herramienta que el servidor agregue mañana nace frenada. Lo que se abre se declara en
// `ops.config.json`: `mcpSandbox`, los servidores que son un sandbox —la excepción por nombre que R12 prevé—, y
// `mcpReads`, las herramientas de lectura que el nombre no delata.
//
// La lectura se reconoce por el verbo con que empieza el nombre de la herramienta. No es la lista de palabras que un
// guard no usa para leer lo que la persona quiso: clasifica un nombre, y lo que no reconoce frena de más en vez de
// dejar pasar. Por eso no se amplía para callar un freno; lo que falta se declara en `mcpReads`.

const { block, configOf, opsRoot } = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')

const TOOL = /^mcp__(.+?)__(.+)$/
// Sin `log` ni `status`, que también nombran escrituras (`log_work`, `status_update`): `git_status` frena y se declara.
const READS = new Set(['get', 'list', 'search', 'lookup', 'fetch', 'read', 'query', 'find', 'describe', 'view', 'show',
  'diff', 'download'])
const wordsOf = (name) => name.split(/[_.-]|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean).map((one) => one.toLowerCase())
// La primera palabra del nombre, partido en `_`, `-`, `.` o una mayúscula, sin la que repite el nombre del servidor
// delante (`slack_get_channel_history`, `notion-search` en `claude_ai_Notion`).
function verbOf(server, tool) {
  const [first, second] = wordsOf(tool)
  return second && wordsOf(server).includes(first) ? second : first
}

const declared = (config, key) => (Array.isArray(config[key]) ? config[key] : [])
  .filter((one) => typeof one === 'string').map((one) => one.trim())

// Qué frena la llamada, o nada: el ítem que se aprueba, y la herramienta y el servidor para decirlo.
function governed(input) {
  const match = TOOL.exec(String(input.tool_name || ''))
  if (!match) return null
  const [name, server, tool] = match
  if (READS.has(verbOf(server, tool))) return null
  const root = opsRoot(input)
  const config = root ? configOf(root) : {}
  if (declared(config, 'mcpSandbox').includes(server)) return null
  if (declared(config, 'mcpReads').some((one) => one === name || one === tool)) return null
  return { root, server, tool, item: `mcp ${server} ${tool}` }
}

function mcpWrites(input) {
  const call = governed(input)
  if (!call) return
  const { root, server, tool, item } = call
  // Aprobada una vez, la herramienta vale el resto de la sesión, y un «pará» lo revoca (decisión del caso). Con el
  // diálogo de Claude Code eso lo anota `mcpGranted`; preguntar en cada llamada eran decenas de diálogos por una
  // tarea en el navegador.
  const held = AP.pending(root, [item], input)
  if (!held.length) return
  block(`'${tool}' escribe por el servidor MCP '${server}' en un sistema ajeno, y R12 lo deja a una persona: lo que `
    + 'llega ahí —una tarjeta, un comentario, un mensaje— no se deshace. Aprobada una vez, vale el resto de la sesión '
    + 'para la conversación principal; un subagente la vuelve a pedir. '
    + 'Si es una lectura, o el servidor es un sandbox, se declara en mcpReads o mcpSandbox de ops.config.json.\n'
    + AP.HOW(null, held, input, held))
}

// En `PostToolUse`: la herramienta que el guard frena y que igual corrió fue aprobada, así que queda concedida.
function mcpGranted(input) {
  const call = governed(input)
  if (call) CHAT.grantRan(input, [call.item], 'corrió')
}

module.exports = { mcpWrites, mcpGranted }
