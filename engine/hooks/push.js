'use strict'

// Si un `git push` se publica, y con qué autorización. R10 pide «la autorización configurada para el
// proyecto», y hasta 0.81.0 era un solo interruptor: `runner.allowPush` dejaba pasar cualquier push —a la
// rama viva, y de un subagente igual que de la persona— y, apagado, frenaba también el que la persona
// acababa de pedir con todas las letras (casos 103 y 108).
//
// Lo que garantiza, en orden:
//
// - Un subagente no publica, con ningún permiso: es trabajo que el agente delegó, dos pasos más lejos de
//   la persona que la sesión. El push sale de la sesión principal.
// - Una rama viva —`main`, `master` y la rama por defecto de cada remoto— no la alcanza ni `allowPush` ni
//   una orden del chat si el proyecto no la nombró en `runner.pushToLiveBranches`. La línea exacta en
//   `.ops-approval` sí la alcanza: la escribe una persona a mano y los guards de límites no dejan que el
//   agente se la escriba.
// - A una rama de trabajo, o a una viva ya nombrada, la alcanzan `allowPush`, la línea exacta en
//   `.ops-approval`, un mensaje de la persona que ordena ese push con su remoto y su rama, o un «dale» al
//   push que quedó frenado. Qué cuenta como orden lo decide `chat.js`.
//
// El `--force` no llega hasta acá: lo frena `destructive` antes, sin override (R8).

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { block, cwdOf, gitDirectory, opsRoot, configOf } = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')

// Lo que va entre `git push` y el fin del comando. El salto de línea corta igual que `;`, por lo que
// `destructive` explica en MISMO.
const PUSH = /\bgit\s+push\b([^;&|\n]*)/g
// Las banderas que llevan su valor en la palabra siguiente: sin saltearlo, el valor se leía como remoto.
const VALUED = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])
// Publican todas las ramas, así que entre ellas la viva: no hay una rama que nombrar ni que aprobar.
const EVERY = new Set(['--all', '--branches', '--mirror'])

// Lectura local e inocua del repositorio: ninguna de estas consultas habla con el remoto. Si falla, no
// hay dato, y quien pregunta decide sin él.
function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

// La rama por defecto de un remoto es la que git anota en `refs/remotes/<remoto>/HEAD`: la escribe el
// `clone` y la cambia `git remote set-head`, así que el proyecto la declara sin un campo nuevo. `main` y
// `master` cuentan siempre, porque un remoto agregado a mano no la anota.
function liveBranches(dir) {
  const live = new Set(['main', 'master'])
  const refs = git(dir, ['for-each-ref', '--format=%(refname)%09%(symref)', 'refs/remotes/'])
  for (const line of refs.split('\n')) {
    const [name, target] = line.split('\t')
    if (!target || !name.endsWith('/HEAD')) continue
    live.add(target.slice(name.length - 'HEAD'.length))
  }
  return live
}

// A dónde publicaría un `git push` sin rama: lo que git resuelve como `@{push}`, que ya aplica
// push.default y el remoto de publicación que declare la rama. Sin upstream no resuelve, y git mismo
// tampoco sabría a dónde ir.
function pushTarget(dir, current) {
  if (!current) return null
  const remote = git(dir, ['for-each-ref', '--format=%(push:remotename)', `refs/heads/${current}`])
  const full = git(dir, ['rev-parse', '--symbolic-full-name', '@{push}'])
  const prefix = `refs/remotes/${remote}/`
  return remote && full.startsWith(prefix) ? { remote, branch: full.slice(prefix.length) } : null
}

// Los destinos de un push: `{ item, remote, branch }` con el ítem que se aprueba, `push <remoto> <rama>`.
// El que no se puede resolver lleva por ítem el comando mismo, que no nombra ninguna rama: lo aprueba un
// «dale» a ese bloqueo y nada en `.ops-approval`.
function destinationsOf(args, dir) {
  const words = args.trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/^['"]|['"]$/g, ''))
  const positional = []
  const found = []
  for (let at = 0; at < words.length; at += 1) {
    if (!words[at].startsWith('-')) positional.push(words[at])
    else if (EVERY.has(words[at])) found.push({ every: true })
    else if (VALUED.has(words[at])) at += 1
    else if (words[at] === '--tags') found.push({ tags: true })
  }
  const current = git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const target = pushTarget(dir, current)
  const [remote, ...refspecs] = positional
  const unknown = { item: 'git push', branch: current }
  const one = (to, branch) => (branch ? { item: `push ${to} ${branch}`, remote: to, branch } : unknown)
  const named = refspecs.map((spec) => {
    const destination = spec.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '')
    return one(remote, destination === 'HEAD' ? current : destination)
  })
  const rest = found.map((flag) => (flag.every ? { every: true }
    : one(remote || (target && target.remote) || 'origin', '--tags')))
  if (named.length || found.length) return [...named, ...rest]
  if (remote) return [one(remote, target && target.remote === remote ? target.branch : current)]
  return [target ? one(target.remote, target.branch) : unknown]
}

const SUBAGENT = "'git push' desde un subagente no se publica, con ningún permiso: publicar lo decide una "
  + 'persona (R10), y un subagente es trabajo que el agente delegó. Devolvé el resultado a la sesión '
  + 'principal, que es la que publica.'

function liveMessage(live, input) {
  const lines = live.filter((to) => to.remote).map((to) => to.item)
  const names = [...new Set(live.map((to) => (to.every ? 'todas las ramas' : to.branch)))].join(', ')
  // Le habla al agente y deja el permiso como cosa de la persona, por lo mismo que `AP.HOW`: medido en
  // una sesión real, con «pegando tal cual» a secas el agente se ofreció a escribirse la aprobación.
  return `'git push' publica cambios en ${names}, la rama viva, y requiere una acción humana: ni `
    + 'runner.allowPush ni una orden en el chat llegan ahí sin un permiso por rama. Decile a la persona qué '
    + 'se frenó y esperá: un «dale» no lo destraba. Lo da ella, nombrando la rama en '
    + 'runner.pushToLiveBranches de ops.config.json, que la deja como una rama de trabajo'
    + (lines.length ? `, o pegando ella tal cual en ${AP.where(input)} estas líneas:\n`
      + lines.map((line) => `  ${line}\n`).join('') : '.')
}

function workMessage(items, input) {
  const lines = items.filter((item) => item.startsWith('push '))
  const chat = CHAT.hold(input, items)
  const how = chat
    ? 'Decile a la persona qué se frenó y esperá: si contesta «dale», reintentá el mismo push y pasa. '
      + 'También pasa si lo pide nombrando el remoto y la rama, como «subí feat/x a origin».'
    : 'Lo destraba una persona pidiéndolo en el chat con el remoto y la rama.'
  const paste = lines.length
    ? `\nSi prefiere aprobarlo a mano, que pegue ella tal cual en ${AP.where(input)} estas líneas:\n`
      + lines.map((line) => `  ${line}\n`).join('')
    : ' Sin remoto y rama que se puedan leer del comando no hay línea que aprobar: nombralos.\n'
  return `'git push' publica cambios y requiere una acción humana. ${how}${paste}`
    + 'El permiso permanente es runner.allowPush en ops.config.json, y lo decide una persona.'
}

// El rastro de las aprobaciones que publicaron: una línea por push que pasó porque alguien lo autorizó.
// Una aprobación se consume sin dejar nada —un «dale» publica y al mensaje siguiente ya no queda quién lo
// autorizó— y un push no vuelve atrás, así que «quién, a qué rama y cuándo» no tenía de dónde salir
// (caso 112).
//
// Sólo agrega, a diferencia del registro de gates, que es rodante: lo que una auditoría pregunta es
// justamente la entrada vieja.
//
// No guarda el texto de la persona. La vía y la sesión alcanzan para reconstruir qué pasó, y el texto se
// queda en el temporal, que es donde el 098 decidió dejarlo.
//
// Y anota la autorización, no el resultado: este hook corre antes del comando, así que un push que después
// falla queda registrado igual. Por eso la fecha se llama `authorizedAt` y no `at`: leer la línea como
// «esto se publicó» afirmaría algo que el hook no puede saber.
const LOG = path.join('planning', '.push-log')

function trail(root, session, entries) {
  if (!root) return
  try {
    const authorizedAt = new Date().toISOString()
    const file = path.join(root, LOG)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${entries
      .map((one) => JSON.stringify({ authorizedAt, ...one, session: session || null })).join('\n')}\n`)
  } catch { /* el push ya estaba autorizado: no lo frena un registro que no se pudo escribir */ }
}

// Un destino en la forma en que se anota. Sin remoto ni rama resolubles va `null`, que es exactamente lo
// que el comando dejó ver.
const entryOf = (to, via) => ({ remote: to.remote || null, branch: to.branch || null, via })

function publish(input, command) {
  const pushes = [...command.matchAll(PUSH)]
  if (!pushes.length) return
  if (input.agent_id) block(SUBAGENT)
  const dir = gitDirectory(command, cwdOf(input))
  const root = opsRoot(input)
  const runner = (root && configOf(root).runner) || {}
  const listed = new Set(Array.isArray(runner.pushToLiveBranches) ? runner.pushToLiveBranches : [])
  const filed = new Set(root ? AP.read(root) : [])
  const live = liveBranches(dir)
  const destinations = pushes.flatMap((match) => destinationsOf(match[1], dir))
  const byFile = destinations.filter((to) => to.item && to.item.startsWith('push ') && filed.has(to.item))
  const left = destinations.filter((to) => !byFile.includes(to))
  const unlisted = left.filter((to) => to.every || (live.has(to.branch) && !listed.has(to.branch)))
  if (unlisted.length) block(liveMessage(unlisted, input))
  // Con la llave puesta no hizo falta ninguna aprobación, así que no hay ninguna que anotar: la
  // autorización ya está escrita en `ops.config.json`, y repetirla en cada push sería registrar el archivo
  // del proyecto contra sí mismo.
  if (runner.allowPush === true) return
  const items = [...new Set(left.map((to) => to.item))]
  // Se pregunta sin conceder, a diferencia de lo que pasa por `AP.pending`: volver a leer lo que ya se
  // leyó no agrega consecuencia y volver a publicar sí, así que la autorización de un push vale para esa
  // operación y no para el mensaje siguiente (R10).
  const cleared = CHAT.authorized(input, items, { asked: CHAT.ordersPush })
  const unordered = items.filter((item) => !cleared.some((one) => one.item === item))
  if (unordered.length) block(workMessage(unordered, input))
  const destination = new Map(destinations.map((to) => [to.item, to]))
  trail(root, input.session_id, [
    ...new Map(byFile.map((to) => [to.item, entryOf(to, AP.APPROVAL)])).values(),
    ...cleared.map((one) => entryOf(destination.get(one.item), one.via)),
  ])
}

module.exports = { publish }
