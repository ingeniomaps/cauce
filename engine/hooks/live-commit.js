'use strict'

// Si un `git commit` cae en una rama viva. R10 dice que a la rama viva se llega pidiéndolo, y hasta 0.101.0
// eso lo sostenía sólo el recorrido de Claude, que corta la rama antes de commitear. A los demás runners
// les llegaba como texto: en corridas reales Codex y Gemini cerraron una tarea commiteando en `main`, en el
// producto y en la instancia (caso 284).
//
// Lo que garantiza:
//
// - En un repositorio de la sesión, un commit sobre `main`, `master` o la rama por defecto de un remoto se
//   frena. El mensaje dice qué hacer sin preguntarle a nadie: cortar una rama y reintentar.
// - Pasa si el proyecto lo declaró con `runner.commitToLiveBranch`, o si la persona lo pidió en el chat
//   nombrando la rama. «Commiteá» a secas no alcanza: es justo el pedido que tiene que terminar en una rama.
// - No opina sobre un repositorio ajeno; por qué, en `owns`.
// - Tampoco sobre uno sin commits, donde la rama viva todavía no existe y el primero la crea, ni con el
//   HEAD suelto.
// - Ni en CI: ahí no hay a quién pedírselo, y el pipeline commitea en la rama que él mismo preparó.

const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { block, commandOf, cwdOf, isCommit, gitDirectory, owns, opsRoot, configOf } = require('./input')
const CHAT = require('./chat')
const { liveBranches } = require('./push')

function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

// El comando puede cambiar de rama antes de commitear —`git switch -c feat/x && git commit …`—, y entonces
// la rama que cuenta es ésa y no la que hay ahora. Se toma el último cambio escrito: su primera palabra que
// no es una bandera, que para `-c nombre [desde]` es el nombre.
const MOVES = /\bgit\s+(?:switch|checkout)\b([^;&|\n]*)/g
function branchAfter(command, current) {
  const moves = [...command.matchAll(MOVES)]
  if (!moves.length) return current
  const target = moves[moves.length - 1][1].trim().split(/\s+/).find((word) => word && !word.startsWith('-'))
  return target || current
}

// Una orden de commitear en la rama viva: el nombre de la rama como palabra entera, en una frase que pida
// commitear y sin una negación antes. Se lee aparte de `mentions`, por lo mismo que `ordersPush`.
const COMMITS = /\bcomm?it\p{L}*/iu
const NEGATED = /(?:^|\s)(?:no|nunca|sin|ni|don'?t|not|never)\s/iu
function ordersCommit(text, item) {
  const branch = item.split(' ')[1].toLowerCase()
  return String(text).split(/[.;\n]+/).some((clause) => {
    const words = clause.toLowerCase().split(/[\s"'`(),:«»]+/)
    const at = words.indexOf(branch)
    return at >= 0 && COMMITS.test(clause) && !NEGATED.test(` ${words.slice(0, at + 1).join(' ')} `)
  })
}

function liveCommit(input) {
  if (process.env.CI) return
  const command = commandOf(input)
  if (!isCommit(command)) return
  const dir = gitDirectory(command, cwdOf(input))
  if (!owns(input, dir)) return
  const root = opsRoot(input)
  if (root && (configOf(root).runner || {}).commitToLiveBranch === true) return
  if (!git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])) return
  const branch = branchAfter(command, git(dir, ['branch', '--show-current']))
  if (!branch || !liveBranches(dir).has(branch)) return
  if (CHAT.authorized(input, [`commit ${branch}`], { asked: ordersCommit }).length) return
  block(`'git commit' cae en ${branch}, la rama viva de ${path.basename(dir)}. No hace falta preguntarle a `
    + 'nadie: cortá una rama, que se lleva lo stageado, y reintentá el commit ahí. Para el trabajo de una '
    + 'tarea, `git switch -c <tipo>/<slug>` con el tipo del Conventional Commit; para estado de planning, la '
    + 'rama de trabajo de planning que ya exista o `git switch -c work/planning`.\n'
    + `Commitear en ${branch} pasa si la persona lo pide en el chat nombrando la rama —«commiteá en `
    + `${branch}»—, o siempre con runner.commitToLiveBranch: true en ops.config.json, que lo decide una persona.`)
}

module.exports = { liveCommit, ordersCommit, branchAfter }
