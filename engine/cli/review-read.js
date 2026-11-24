'use strict'

// Qué archivos del diff leyó de verdad quien revisó en `/autobuild`, según su transcripción y no según lo que declaró
// en `opened` (caso 549). Sólo Claude Code deja esa transcripción; en otro runner no hay nada que leer y se dice.
//
// La forma del `.jsonl` no es una API documentada: está medida en Claude Code 2.1.330 sobre siete corridas reales —
// `<proyectos>/<carpeta>/<sesión>/subagents/workflows/<recorrido>/journal.jsonl`, con `label` y `agentId`, y al lado
// `agent-<agentId>.jsonl` con los `tool_use` y sus `tool_result`—. Por eso una forma que no se reconoce sale como «no
// se encontró» y nunca como «no leyó nada».
//
// Sólo se extraen nombres de herramienta y rutas: el contenido de lo que el agente vio no se imprime, porque puede
// traer cualquier cosa del entorno. Y del comando de un `Bash` se reconocen formas literales —un `cat`, `sed`, `head`,
// `tail`, `nl` o `less` de la ruta o de un glob que la incluye, y un `git diff`/`git show` cuya salida la muestra—: lo
// demás queda sin reconocer, que es no contarlo como leído, porque leer comandos sin tope fue lo que el 464 no pudo
// cerrar.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fail, USAGE, REFUSED } = require('./io')

const lines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((one) => JSON.parse(one))

const modified = (dir) => fs.statSync(path.join(dir, 'journal.jsonl')).mtimeMs

// Los agentes con la etiqueta pedida del recorrido más nuevo de esa sesión, desde la última lista del diff: un
// recorrido hace varias tareas, y lo que leyó el revisor de la anterior no cuenta para ésta.
function located(session, label, projects = path.join(os.homedir(), '.claude', 'projects')) {
  let folders = []
  try { folders = fs.readdirSync(projects) } catch { return null }
  const runs = folders.flatMap((one) => {
    const dir = path.join(projects, one, session, 'subagents', 'workflows')
    try { return fs.readdirSync(dir).map((wf) => path.join(dir, wf)) } catch { return [] }
  }).filter((dir) => fs.existsSync(path.join(dir, 'journal.jsonl')))
    .sort((a, b) => modified(b) - modified(a))
  // Sólo el más nuevo, que es el de esta corrida: si ahí no hay revisor, otra corrida no lo reemplaza.
  for (const dir of runs.slice(0, 1)) {
    let ids = []
    for (const one of lines(path.join(dir, 'journal.jsonl'))) {
      if (one.label === 'review-diff') ids = []
      else if (one.label === label && one.agentId && !ids.includes(one.agentId)) ids.push(one.agentId)
    }
    ids = ids.filter((id) => fs.existsSync(path.join(dir, `agent-${id}.jsonl`)))
    if (ids.length) return ids.map((id) => path.join(dir, `agent-${id}.jsonl`))
  }
  return null
}

const textOf = (content) => {
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.map((one) => (one && typeof one.text === 'string' ? one.text : '')).join('\n')
    : ''
}

// Las llamadas que corrieron, sin `is_error` en su resultado ni denegación en la línea que lo trae, con su salida: un
// diff cuenta sólo por lo que mostró. La salida se mira y no se devuelve.
function succeeded(entries) {
  const calls = new Map()
  const failed = new Set()
  const output = new Map()
  for (const entry of entries) {
    const content = entry.message && Array.isArray(entry.message.content) ? entry.message.content : []
    for (const block of content) {
      if (block.type === 'tool_use') calls.set(block.id, { name: block.name, input: block.input || {} })
      if (block.type !== 'tool_result') continue
      if (block.is_error || entry.toolDenialKind) failed.add(block.tool_use_id)
      output.set(block.tool_use_id, textOf(block.content))
    }
  }
  return [...calls].filter(([id]) => !failed.has(id))
    .map(([id, call]) => ({ ...call, output: output.get(id) || '' }))
}

const READERS = /^(?:cat|sed|head|tail|nl|less)$/
// Una ruta del comando contra la del archivo, literal o como glob, desde la raíz o desde la carpeta en que corrió.
const names = (word, file, root, cwd) => {
  const target = path.join(root, file)
  const candidates = [path.resolve(cwd || root, word), path.resolve(root, word)]
  return candidates.some((one) => one === target || (/[*?[]/.test(word) && path.matchesGlob(target, one)))
}

function readsOf(call, files, root) {
  const found = {}
  if (call.name === 'Read' && call.input.file_path) {
    const opened = path.resolve(root, call.input.file_path)
    for (const file of files) if (opened === path.join(root, file)) found[file] = 'read'
    return found
  }
  if (call.name !== 'Bash' || typeof call.input.command !== 'string') return found
  for (const piece of call.input.command.split(/&&|\|\||;|\|/)) {
    const words = piece.trim().split(/\s+/).map((one) => one.replace(/^["']|["']$/g, ''))
    let cwd = root
    if (words[0] === 'git' && words[1] === '-C' && words[2]) { cwd = path.resolve(root, words[2]); words.splice(1, 2) }
    if (READERS.test(words[0] || '')) {
      for (const file of files) {
        const hit = words.slice(1).find((one) => !one.startsWith('-') && names(one, file, root, cwd))
        if (hit && !found[file]) found[file] = /[*?[]/.test(hit) ? 'glob' : 'cat'
      }
    }
    if (words[0] === 'git' && ['diff', 'show'].includes(words[1])) {
      // Lo que el diff mostró, por su encabezado: sin rutas, o con un árbol limpio, puede no mostrar nada.
      for (const file of files) {
        if (!found[file] && call.output.includes(` b/${file}\n`)) found[file] = 'diff'
      }
    }
  }
  return found
}

// De más fuerte a más débil: abrirlo entero gana sobre verlo en un glob, y eso sobre ver sólo su hunk.
const STRENGTH = ['read', 'cat', 'glob', 'diff']

function contrast(transcripts, files, root) {
  const read = {}
  for (const file of transcripts) {
    for (const call of succeeded(lines(file))) {
      for (const [one, how] of Object.entries(readsOf(call, files, root))) {
        if (!read[one] || STRENGTH.indexOf(how) < STRENGTH.indexOf(read[one])) read[one] = how
      }
    }
  }
  return { found: true, read, unread: files.filter((file) => !read[file]) }
}

function reviewRead(root, cli) {
  const files = String(cli.value('--files') || '').split(',').map((one) => one.trim()).filter(Boolean)
  if (!root || !files.length) fail('Uso: ops review-read <raíz-del-repositorio> --files <a,b> [--label review]', USAGE)
  const session = cli.value('--session') || process.env.CLAUDE_CODE_SESSION_ID || ''
  let result
  try {
    const transcripts = session ? located(session, cli.value('--label') || 'review') : null
    result = !session ? { found: false, why: 'sin CLAUDE_CODE_SESSION_ID: este runner no deja transcripción' }
      : !transcripts ? { found: false, why: `no hay transcripción de review para la sesión ${session}` }
        : contrast(transcripts, files, path.resolve(root))
  } catch {
    // Sin el mensaje del error: el de `JSON.parse` cita la línea que no pudo leer, y puede ser cualquier cosa.
    result = { found: false, why: 'la transcripción no tiene la forma conocida' }
  }
  console.log(JSON.stringify(result))
  if (!result.found) process.exitCode = REFUSED
}

module.exports = { reviewRead, located, contrast }
