'use strict'

// Lo que Cauce entregó a la instancia y ejecuta: los scripts de `automatization/hooks/`, que corren los guards, y lo
// que cada runner recibió al instalarse —su configuración, sus workflows, sus agentes—. Reescribir, mover o borrar un
// script apagaba un grupo entero de guards para el resto de la sesión, y ningún guard lo frenaba (caso 508):
// `automation check` lo marca, pero después.
//
// La lista sale del registro de entregas (`.cauce/manifest.json`), así que lo que una versión nueva entregue nace
// protegido (R27), y un guard propio del proyecto puesto al lado no. El registro también se protege, porque vaciarlo
// vaciaba la lista; y si no se puede leer, se protege la carpeta entera. Lo mismo `engine/hooks/run.js` en la raíz ops,
// que `run-hook.sh` usaría como motor si existiera. Las instrucciones de cada runner —`CLAUDE.md`, `AGENTS.md`— son del
// proyecto y quedan afuera. `install` y `upgrade` escriben con `fs`, y estos guards no los ven.
//
// Por shell se leen las escrituras, los borrados, `mv`, `cp`, `ln`, `chmod` y sus parecidos, `git rm`, `git mv`,
// `git checkout` y `git restore`, sobre el archivo, sobre una carpeta que lo contiene o con un glob que lo alcanza; y
// cualquier otro programa que nombre el archivo o un glob que lo alcance, salvo los que sólo lo leen o lo ejecutan.
// No se lee lo que cambia un `git checkout <rama>`, un `merge` o un `pull`, que no nombran el archivo.
//
// La salida es que la persona lo pida nombrando el archivo, o lo confirme en el turno, sin línea que pegar: pegada,
// dejaría abierta para siempre la escritura de lo que corre los guards. Son dos guards en un fuente, como `ops-config`
// y `ops-config-shell`.

const fs = require('node:fs')
const path = require('node:path')
const { block, rawCommandOf, cwdOf, filesOf, opsRoot } = require('./input')
const CHAT = require('./chat')
const AP = require('./approval')
const { writes, removals, steps } = require('./shell-changes')
const { real } = require('./boundary')
const { GIT_VALUED } = require('./git-globals')
const M = require('../core/manifest')
const { installRoot } = require('../automation/runners')

const RUNNERS = path.join(__dirname, '..', '..', 'automatization', 'runners')
const HOOKS = 'automatization/hooks/'
const REGISTRY = path.join('.cauce', 'manifest.json')
// El README y el marcador de carpeta vacía no corren nada.
const RUNS = (file) => !/(?:\.md|\/\.gitkeep)$/.test(file)

function manifestOf(name) {
  try { return JSON.parse(fs.readFileSync(path.join(RUNNERS, name, 'manifest.json'), 'utf8')) } catch { return null }
}

// Lo que se protege en esta instancia: `files`, rutas exactas; `trees`, carpetas que se protegen enteras.
function guardedOf(root) {
  const trees = []
  const files = [path.join(root, REGISTRY), path.join(root, 'engine', 'hooks', 'run.js')]
  let delivered = null
  let runners = {}
  if (fs.existsSync(path.join(root, REGISTRY))) {
    try { [delivered, runners] = [M.read(root), M.readRunners(root)] } catch { delivered = null }
  }
  if (!delivered) trees.push(real(path.join(root, HOOKS)))
  else files.push(...Object.keys(delivered).filter((one) => one.startsWith(HOOKS) && RUNS(one))
    .map((one) => path.join(root, one)))
  const install = installRoot(root)
  for (const name of new Set(Object.keys(runners).map((key) => key.split('/')[0]))) {
    const runner = manifestOf(name)
    if (!runner) continue
    const instructions = new Set((runner.instructions || []).map((item) => item.target))
    if (runner.config && runner.config.target) files.push(path.join(install, runner.config.target))
    for (const key of Object.keys(runners).filter((one) => one.startsWith(`${name}/`))) {
      const target = key.slice(name.length + 1)
      // `config.hooks` anota los comandos de la configuración, no un archivo.
      if (target !== 'config.hooks' && !instructions.has(target)) files.push(path.join(install, target))
    }
  }
  return { files: new Set(files.map(real)), trees }
}

const within = (dir, file) => file === dir || file.startsWith(`${dir}${path.sep}`)
const GLOB = /[*?[]/
// Un patrón que no es un glob válido —el de un `grep` que quedó como argumento— no alcanza nada, y no rompe el guard.
const globbed = (file, pattern) => { try { return path.matchesGlob(file, pattern) } catch { return false } }
const exists = (one) => fs.existsSync(one)
// El archivo y cada carpeta que lo contiene, que es lo que un glob puede nombrar.
const chain = (file) => {
  const all = []
  for (let at = file; at !== path.dirname(at); at = path.dirname(at)) all.push(at)
  return all
}

// Lo protegido que esta ruta alcanza: el archivo mismo, lo que existe dentro de una carpeta, o lo que un glob abarca.
// Con `exact`, sólo el archivo: volver a `HEAD` o al índice no cambia nada que no se haya escrito antes (`git
// restore .`). Una carpeta sin nada protegido adentro —el `engine/` de un producto— no frena.
function reached(guarded, raw, exact = false, removal = false) {
  if (GLOB.test(raw)) return [...guarded.files].filter((one) => chain(one).some((at) => globbed(at, raw)))
  const one = real(raw)
  if (guarded.files.has(one) || guarded.trees.some((tree) => within(tree, one))) return [one]
  if (exact) return []
  // `shell-changes` le saca el `*` final a lo que se borra: `ops/automat*` llega como `ops/automat`, que no existe.
  const cut = removal && !exists(one) && !one.endsWith(path.sep)
  return [...guarded.files].filter((file) => exists(file)
    && (within(one, file) || (cut && chain(file).some((at) => at.startsWith(one)))))
}

const isDir = (one) => { try { return fs.statSync(one).isDirectory() } catch { return false } }

function message(hits, how) {
  return `${hits.join(', ')} ${hits.length > 1 ? 'son' : 'es'} de lo que Cauce entregó a la instancia: los scripts `
    + 'que corren los guards, el registro de lo entregado, o lo que recibió el runner. Reescribirlo, moverlo o '
    + 'borrarlo puede apagar los guards para el resto de la sesión, así que lo decide una persona (R10): decile qué '
    + 'se frenó y para qué. Un guard propio va al lado, como archivo nuevo, y una versión nueva llega con `cauce '
    + `upgrade\`.\n${how}`
}

function judge(input, root, paths) {
  if (!paths.length) return
  const guarded = guardedOf(root)
  const hits = [...new Set(paths.flatMap((one) => (typeof one === 'string' ? reached(guarded, one)
    : one.match ? [...guarded.files].filter((file) => within(one.path, file) && exists(file)
      && globbed(path.basename(file), one.match)) : reached(guarded, one.path, one.exact, one.removal))))]
  if (!hits.length) return
  const held = CHAT.unauthorizedNow(input, hits.map((one) => `escribe ${one}`))
  if (held.length) block(message(hits, AP.HOW(null, held, input, [], { turn: true })))
}

function runtimeWrites(input) {
  const root = opsRoot(input)
  if (root) judge(input, root, filesOf(input).map((raw) => path.resolve(cwdOf(input), raw)))
}

const words = (rest) => rest.filter((word) => word && !word.startsWith('-'))
// Los que escriben en su último argumento: en una carpeta, lo que pisan es el archivo con el nombre de cada origen.
const COPIES = new Set(['cp', 'ln', 'install', 'rsync'])
// Los que tocan cada argumento: moverlo o quitarle el permiso deja al script sin correr.
const TOUCHES = new Set(['mv', 'chmod', 'chown', 'chgrp', 'chattr', 'truncate', 'shred'])

// Lo que toca un `git rm`, `mv`, `checkout` o `restore`. Volver a `HEAD` o al índice se mira sólo por archivo, y sólo
// en el árbol: `--staged` o `--cached` sin `--worktree` cambian el índice y nada que se ejecute.
function gitTouched(rest, base) {
  let at = 0
  let from = base
  while (at < rest.length && rest[at].startsWith('-')) {
    const [name, joined] = rest[at].split(/=(.*)/)
    if (GIT_VALUED.has(name) && joined === undefined) at += 1
    if (name === '-C') from = path.resolve(base || '/', joined ?? rest[at])
    at += 1
  }
  const [sub, ...tail] = rest.slice(at)
  if (!['rm', 'mv', 'checkout', 'restore'].includes(sub)) return []
  // Un grupo de letras que empieza con `-s` es el origen pegado (`-sSTABLE`), no `-S` ni `-W`.
  const worktree = tail.some((one) => one === '--worktree' || /^-(?!s)[a-zA-Z]*W/.test(one))
  if (tail.some((one) => /^--(?:staged|cached)$|^-(?!s)[a-zA-Z]*S/.test(one)) && !worktree) return []
  const dash = tail.indexOf('--')
  const before = words(dash < 0 ? tail : tail.slice(0, dash))
  // El origen de `restore`: `--source=X`, `--source X`, `-s X` o `-sX`.
  const given = tail.findIndex((one) => /^(?:--source|-s)/.test(one))
  const source = given < 0 ? '' : tail[given].replace(/^(?:--source=?|-s)/, '') || tail[given + 1] || ''
  // En `checkout`, lo que va antes de las rutas es el commit: delante de `--`, o la primera palabra sin `--`.
  const commit = sub === 'checkout' && (dash > 0 ? before[0] : dash < 0 && before.length > 1 ? before[0] : '')
  const foreign = (source && source !== 'HEAD') || (commit && commit !== 'HEAD')
  const paths = sub === 'checkout' ? (dash >= 0 ? words(tail.slice(dash + 1)) : commit ? before.slice(1) : before)
    : [...before.filter((one) => one !== source), ...(dash < 0 ? [] : words(tail.slice(dash + 1)))]
  const exact = (sub === 'checkout' || sub === 'restore') && !foreign
  return paths.map((raw) => ({ raw, base: from, exact }))
}

// Lo que nombra un archivo entregado sin cambiarlo: lo lee, lo compara o lo ejecuta. Cerrado por defecto (R27):
// cualquier otro programa que nombre uno cuenta como que lo toca —`dd of=`, `patch`, un script propio—, y hasta 0.124.0
// era al revés: sólo contaban los de `COPIES` y `TOUCHES`. Lo que ya se juzga en otro lado —las escrituras, los
// borrados, `find -delete`— no se vuelve a juzgar acá.
const LEAVES = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'ls', 'stat', 'file', 'wc', 'grep', 'egrep',
  'fgrep', 'rg', 'diff', 'cmp', 'md5sum', 'sha1sum', 'sha256sum', 'readlink', 'realpath', 'basename', 'dirname',
  'test', '[', '[[', 'echo', 'printf', 'cd', 'pushd', 'du', 'tree', 'od', 'xxd', 'hexdump', 'strings', 'sort', 'uniq',
  'cut', 'jq', 'yq', 'sed', 'awk', 'tee', 'bash', 'sh', 'zsh', 'dash', 'source', '.', 'which', 'type', 'command',
  'true', 'false', 'rm', 'unlink', 'rmdir', 'find', 'shellcheck', 'tr', 'for', 'case', 'while', 'until', 'if', 'select',
  'do', 'done', 'then', 'else', 'elif', 'fi', 'esac', 'function', '{', '}'])
const HANDLED = new Set([...COPIES, ...TOUCHES, 'git'])
// Los de git que no cambian el árbol, o lo cambian sin nombrar rutas; los que sí, en `gitTouched`.
const GIT_LEAVES = new Set(['status', 'log', 'diff', 'show', 'blame', 'grep', 'ls-files', 'ls-tree', 'add', 'commit',
  'check-ignore', 'check-attr', 'cat-file', 'rev-parse', 'describe', 'shortlog', 'reflog', 'fetch', 'push', 'rm', 'mv',
  'checkout', 'restore'])
// Un intérprete ejecuta su script sin cambiarlo; lo que su código nombra en una cadena y sus otros argumentos cuentan:
// `node -e "fs.writeFileSync('automatization/hooks/…')"`, `perl -pi -e … archivo`.
const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'php', 'deno', 'bun'])
const CODE_FLAGS = /^-(?:[a-zA-Z]*[ecp][a-zA-Z]*|-eval|-print)$/

// Las rutas que nombra un programa: sus argumentos, y el valor de `--opción=valor` o de `of=valor`.
// Un comodín sin nada más —el `'*'` de un `tr -d`— no nombra una ruta.
const named = (args) => args.flatMap((word) => {
  const valued = word.match(/^(?:-{1,2}[\w-]+|[a-z]+)=(.+)$/s)
  if (valued) return [valued[1]]
  return word && !word.startsWith('-') && !/^[*?]+$/.test(word) ? [word] : []
})

// Una cadena que el código sólo lee —`require('./.cauce/manifest.json')`, `open('x')` sin modo, `readFileSync('x')`—
// no la cambia.
const READ_CALL = /(?:require|readFileSync|open|load)\(\s*$/
const READ_END = /^\s*(?:\)|,\s*['"](?:utf-?8|r)['"]\s*\))/

function interpreted(rest) {
  const code = rest.findIndex((word, at) => at && CODE_FLAGS.test(rest[at - 1]))
  const source = code < 0 ? '' : rest[code]
  const literals = [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)]
    .filter((hit) => !(READ_CALL.test(source.slice(0, hit.index))
      && READ_END.test(source.slice(hit.index + hit[0].length))))
    .map((hit) => hit[1] ?? hit[2] ?? hit[3]).filter((one) => one && !/\s/.test(one))
  const args = named(rest.filter((word, at) => at !== code && !(at && CODE_FLAGS.test(word))))
  return [...literals, ...(code < 0 ? args.slice(1) : args)]
}

function touched(ran) {
  const found = []
  for (const { verb, rest, base } of ran) {
    const args = words(rest)
    if (COPIES.has(verb) || verb === 'mv') {
      const target = rest.includes('-t') ? rest[rest.indexOf('-t') + 1] : args.at(-1)
      found.push({ raw: target, base, sources: args.filter((one) => one !== target) })
    }
    if (TOUCHES.has(verb)) for (const raw of verb === 'mv' ? args.slice(0, -1) : args) found.push({ raw, base })
    if (verb === 'git') {
      found.push(...gitTouched(rest, base))
      const sub = rest.findIndex((word, at) => !word.startsWith('-') && !(at && GIT_VALUED.has(rest[at - 1])))
      // `git clean` borra lo que nombra y lo de adentro; los demás, como cualquier programa, sólo el archivo exacto.
      const clean = rest[sub] === 'clean'
      if (sub >= 0 && !GIT_LEAVES.has(rest[sub])) {
        found.push(...named(rest.slice(sub + 1)).map((raw) => ({ raw, base, exact: !clean, removal: clean })))
      }
    }
    if (!verb || LEAVES.has(verb) || HANDLED.has(verb) || verb === 'mv') continue
    // Sólo el archivo que nombra, no la carpeta que lo contiene: `tar -C .` o `script.sh .` no reescriben los guards.
    for (const raw of INTERPRETERS.has(verb) ? interpreted(rest) : named(rest)) found.push({ raw, base, exact: true })
  }
  return found
}

// Un `find -delete` borra lo que su filtro nombra bajo cada carpeta de arranque. Con `-name`, sólo eso; con otro
// filtro o sin ninguno, todo lo de adentro.
function findDeletes(ran) {
  return ran.filter((one) => one.verb === 'find' && one.rest.includes('-delete')).flatMap(({ rest, base }) => {
    const start = rest.findIndex((word) => /^[-(!]/.test(word))
    const roots = start < 0 ? rest : start ? rest.slice(0, start) : ['.']
    const named = rest.indexOf('-name') >= 0 ? rest[rest.indexOf('-name') + 1] : null
    const other = rest.some((word) => /^-(?:path|wholename|regex|iname|ipath|iregex|lname)$/.test(word))
    return roots.map((raw) => ({ raw, base, match: named && !other ? named : null }))
  })
}

function runtimeShell(input) {
  const root = opsRoot(input)
  if (!root) return
  const command = rawCommandOf(input)
  const cwd = cwdOf(input)
  const ran = steps(command, cwd)
  const resolve = ({ raw, base, sources, write, exact, match, removal }) => {
    if (!raw || (!path.isAbsolute(raw) && base === null)) return []
    const one = path.resolve(base || '/', raw)
    if (match) return [{ path: real(one), match }]
    // Copiar dentro de una carpeta pisa el archivo con el nombre del origen, y no la carpeta: eso lo resuelve
    // `touched`, y la misma carpeta leída como escritura se descarta.
    if (isDir(one) && (sources || write)) {
      return sources ? sources.map((source) => path.join(one, path.basename(source))) : []
    }
    return exact || removal ? [{ path: one, exact, removal }] : [one]
  }
  const written = writes(command, cwd).map((one) => ({ ...one, write: true }))
  const removed = removals(ran.filter((one) => one.verb !== 'find')).map((one) => ({ ...one, removal: true }))
  judge(input, root, [...written, ...removed, ...findDeletes(ran), ...touched(ran)].flatMap(resolve))
}

module.exports = { runtimeWrites, runtimeShell }
