'use strict'

// Lo que una sesión no escribe dentro de un `.git`: los hooks y la configuración. Un hook, o un `core.hooksPath` en la
// configuración, es código que corre después fuera de cualquier sandbox, cuando commitea la persona. Para Codex, Cauce
// abre `.git` en el sandbox para que una tarea se pueda commitear (`engine/automation/sandbox.js`); lo demás de `.git`
// —el índice, las ramas, los objetos— es lo que un commit escribe.
//
// Lo comparten los dos guards de límites, que juzgan cada destino por dónde cae, y como ellos dejan pasar el temporal
// del sistema, donde se arma un repositorio de prueba. Lo que sale de un script, o de un programa que escribe por su
// cuenta, no se ve: esto frena la forma habitual. Tampoco ve un `.git` común con otro nombre —un repositorio desnudo
// con árboles de trabajo, un `--separate-git-dir`—.

const path = require('node:path')
const { landing } = require('../core/files')
const { confirmedOnly, inTemp } = require('./boundary')
const AP = require('./approval')

// `hooks/` y `config` del repositorio, el `config.worktree` de un árbol de trabajo en `.git/worktrees/<x>/`, y lo
// mismo dentro de un submódulo, en `.git/modules/<x>/`. Sin distinguir mayúsculas: en un disco que no las distingue,
// `.GIT/hooks` es el mismo lugar.
function internal(lands) {
  const parts = lands.split(path.sep).map((one) => one.toLowerCase())
  let at = parts.lastIndexOf('.git') + 1
  if (!at) return false
  // Un submódulo puede llamarse `lib/foo`, así que dentro de `modules/` no se cuentan segmentos: vale un `hooks`
  // después del primero, que es siempre del nombre, o el `config` del final.
  if (parts[at] === 'modules') {
    const rest = parts.slice(at + 1)
    return rest.slice(1).includes('hooks') || (rest.length > 1 && /^config(?:\.worktree)?$/.test(rest.at(-1)))
  }
  const [first, second, third] = parts.slice(at)
  return first === 'hooks' || ((first === 'config' || first === 'config.worktree') && second === undefined)
    || (first === 'worktrees' && Boolean(second) && third === 'config.worktree')
}

// Las banderas globales de git que llevan su valor aparte: saltearlas sin el valor leía el valor como subcomando.
const VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path'])

// Cómo se lee un `git config`. Las banderas de tipo o de formato no cambian si lee o escribe, y las que llevan valor
// se saltean con él. `--global`, `--system` y `--blob` no tocan el `.git`; `-f` se juzga por dónde cae.
const SHAPE = new RegExp(String.raw`^(?:-z|--(?:bool|int|bool-or-int|path|expiry-date|null|name-only|show-origin`
  + String.raw`|show-scope|show-names|includes|local|worktree|fixed-value|all|regexp|no-[\w-]+)`
  + String.raw`|--(?:type|default|comment|url|value)=.*)$`)
const SHAPE_VALUED = new Set(['--type', '-t', '--default', '--comment', '--url', '--value'])
const READS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool',
  '--list', '-l'])
const WRITES = new Set(['set', 'unset', 'rename-section', 'remove-section', 'edit'])
const ELSEWHERE = new Set(['--global', '--system', '--blob'])

function config(args) {
  let file = null
  let read = false
  let wrote = false
  const named = []
  for (let at = 0; at < args.length; at += 1) {
    const one = args[at]
    if (ELSEWHERE.has(one) || one.startsWith('--blob=')) return null
    if (one === '-f' || one === '--file') file = args[(at += 1)] || ''
    else if (one.startsWith('--file=')) file = one.slice('--file='.length)
    else if (SHAPE_VALUED.has(one)) at += 1
    else if (SHAPE.test(one)) continue
    else if (READS.has(one)) read = true
    else if (one.startsWith('-')) wrote = true
    else named.push(one)
  }
  // `get` y `list` son subcomando sólo en primer lugar: como valor —`core.hooksPath list`— es una escritura.
  if (WRITES.has(named[0])) wrote = true
  if (named[0] === 'get' || named[0] === 'list') read = true
  return wrote || (!read && named.length >= 2) ? { file } : null
}

// Los `git` de un comando ya partido (`steps`) que escriben la configuración de un repositorio, o le ponen hooks con
// `--template`. Devuelve los destinos ya resueltos, o el comando cuando lo que cambia es la configuración.
function gitWrites(ran) {
  const found = []
  for (const { verb, rest, base } of ran) {
    if (verb !== 'git') continue
    let dir = base
    let at = 0
    for (; at < rest.length && rest[at].startsWith('-'); at += 1) {
      if (rest[at] === '-C' || rest[at] === '--git-dir') {
        const to = rest[at + 1] || ''
        dir = path.isAbsolute(to) ? to : dir && path.resolve(dir, to)
      }
      if (VALUED.has(rest[at])) at += 1
    }
    const [sub, ...args] = rest.slice(at)
    // Un `-f` absoluto cae donde dice, sea cual sea la carpeta.
    const absolute = sub === 'config' && (config(args) || {}).file
    if (absolute && path.isAbsolute(absolute) && internal(landing(path.sep, absolute))) {
      found.push(`escribe ${landing(path.sep, absolute)}`)
      continue
    }
    if (dir && inTemp(landing(path.sep, dir))) continue
    const said = ['git', ...rest].join(' ')
    if (sub === 'config') {
      const wrote = config(args)
      if (!wrote) continue
      if (wrote.file === null) found.push(said)
      else if (dir || path.isAbsolute(wrote.file)) {
        const lands = landing(dir || path.sep, wrote.file)
        if (internal(lands)) found.push(`escribe ${lands}`)
      }
    } else if ((sub === 'init' || sub === 'clone') && args.some((one) => /^--template(?:=|$)/.test(one))) {
      found.push(said)
    }
  }
  return found
}

// El bloqueo, con todo lo encontrado junto. Lo confirma la persona: una escritura acá puede hacer falta —un hook que
// el equipo versiona aparte—, y no se deduce de nada que esté a la vista.
function refusal(input, found) {
  const held = confirmedOnly(input, [...new Set(found)])
  if (!held.length) return ''
  return `${held.join(' y ')}: dentro de .git sólo se escribe lo que escribe un commit. Un hook, o la configuración `
    + 'de git, corren después fuera de cualquier sandbox, cuando commitea la persona.\n'
    + AP.HOW(null, held, input, held, { turn: true })
}

module.exports = { internal, gitWrites, refusal }
