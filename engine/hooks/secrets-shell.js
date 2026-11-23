'use strict'

// Leer o escribir una credencial por shell. `secrets-read` mira la herramienta de lectura del runner, y un `cat .env`
// no pasa por ella: en Claude lo tapaba una regla nativa `permissions.deny`, que además frenaba lo que la
// persona pedía, y en los otros runners no lo tapaba nada (caso 104). Esto lo mira donde pasan todos los
// comandos, con la misma salida que el resto: lo que la persona pidió en el chat pasa.
//
// Como todo lo que lee el texto de un comando, frena la forma habitual y no un script decidido: un nombre
// armado en una variable o un `grep -r` sobre la carpeta sin nombrar el archivo pasan.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { asRun, commandOf, rawCommandOf, cwdOf, block, isCommit, opsRoot } = require('./input')
const { credential, patternNames } = require('./files')
const { afterLeaders } = require('./shell-wrappers')
const { masked, shellWord } = require('./quoting')
const { GIT_VALUED } = require('./git-globals')
const { REDIRECT } = require('./shell-writes')
const { writes } = require('./shell-changes')
const AP = require('./approval')
const CHAT = require('./chat')
const RC = require('../core/remote-credentials')

// Lo que muestra el contenido de un archivo, también dentro de las comillas: el código de un `node -e` nombra el
// archivo ahí adentro. Estén o no instalados.
const READERS = new Set(['cat', 'tac', 'nl', 'head', 'tail', 'less', 'more', 'bat', 'sed', 'awk', 'grep', 'egrep',
  'fgrep', 'rg', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'cut', 'sort', 'uniq', 'rev', 'paste', 'fold', 'pr',
  'dd', 'jq', 'yq', 'diff', 'cmp', 'source', '.', 'node', 'python', 'python3', 'ruby', 'perl', 'php', 'deno', 'bun'])
const verbOf = (words) => afterLeaders(words)[0] || ''

// Lo que nombra un archivo sin mostrarlo. Cualquier otro verbo cuenta como lector (R27): hasta 0.124.0 sólo contaban
// los de `READERS`, y un agente leyó el `.env` con `nl` cuando no estaba. `cp`, `mv`, `ln`, `install` y `rsync`
// leen el origen sin mostrarlo —`cp .env.example .env` es preparar el entorno—, y lo que escriben lo juzga
// `writtenCredentials`. `docker` y `podman` le pasan el `--env-file` a un contenedor; `docker compose config`, que
// lo imprime resuelto, queda abierto. `ssh`, `scp` y `ssh-add` usan una clave sin mostrarla, y `ssh-keygen` la crea.
const NAMES_ONLY = new Set(['ls', 'test', '[', '[[', 'stat', 'file', 'touch', 'rm', 'unlink', 'mkdir', 'chmod', 'chown',
  'chgrp', 'cp', 'mv', 'ln', 'install', 'rsync', 'echo', 'printf', 'cd', 'pushd', 'realpath', 'readlink', 'basename',
  'dirname', 'du', 'wc', 'md5sum', 'sha1sum', 'sha256sum', 'which', 'type', 'export', 'unset', 'mktemp', 'shred',
  'docker', 'docker-compose', 'podman', 'ssh', 'scp', 'sftp', 'ssh-add', 'ssh-keygen'])
// Los de git que nombran rutas sin mostrarlas; `show`, `blame` o `stash show` las muestran. `log` sólo con un parche, y
// `diff` salvo que liste nombres o cuentas.
const GIT_NAMES_ONLY = new Set(['add', 'rm', 'mv', 'check-ignore', 'ls-files', 'status', 'restore', 'checkout', 'reset',
  'clean', 'commit', 'stash', 'update-index'])
const GIT_PATCH = /^(?:-p|-u|-U\d*|--patch|--word-diff(?:=.*)?|--color-words(?:=.*)?|-[a-zA-Z]*p[a-zA-Z]*)$/
const GIT_NAMES = /^--(?:name-only|name-status|stat|numstat|shortstat|dirstat|summary|quiet)(?:=.*)?$/
// `find` nombra lo que encuentra, salvo que se lo pase a un programa que lo lea o lo imprima con formato.
const FIND_RUNS = /^-(?:exec|execdir|ok|okdir)$/
const FIND_PRINTS = /^-(?:fprint|fprintf|fls)$/

function gitSub(rest) {
  let at = 0
  while (at < rest.length && rest[at].startsWith('-')) at += GIT_VALUED.has(rest[at]) ? 2 : 1
  return rest[at]
}

function gitNamesOnly(rest) {
  const sub = gitSub(rest)
  const after = rest.slice(rest.indexOf(sub) + 1)
  if (sub === 'stash') return after[0] !== 'show'
  if (sub === 'log' || sub === 'whatchanged') return !after.some((one) => GIT_PATCH.test(one))
  if (sub === 'diff') return after.some((one) => GIT_NAMES.test(one))
  return GIT_NAMES_ONLY.has(sub)
}

// Un programa que no está en esta máquina no lee nada: así un pedazo de código o de prosa que quedó al principio de un
// tramo —`for(const`, `y`, `const`— no se toma por un lector. Uno con ruta se busca desde la carpeta del tramo.
const runnable = new Map()
function installed(verb, base) {
  const own = verb.includes('/')
  const key = own ? path.resolve(base || process.cwd(), verb) : verb
  if (!runnable.has(key)) {
    const dirs = own ? [''] : String(process.env.PATH || '').split(path.delimiter).filter(Boolean)
    runnable.set(key, /^[\w./+-]+$/.test(verb) && dirs.some((dir) => {
      try { return fs.statSync(path.join(dir, own ? key : verb)).isFile() } catch { return false }
    }))
  }
  return runnable.get(key)
}

// Cómo lee un tramo: `all` mira todo lo que nombra, también dentro de las comillas; `words`, sólo sus argumentos
// enteros —de un verbo que no se conoce, una frase entre comillas es texto, como el `--body` de un `gh`, y
// `value(items[].key)` no es un archivo—; y null no lee.
function readingOf(words, verb, base) {
  const name = path.basename(verb)
  if (READERS.has(name)) return 'all'
  if (!name || NAMES_ONLY.has(name)) return null
  const rest = words.slice(words.indexOf(verb) + 1)
  if (name === 'find') {
    const runs = rest.filter((word, at) => at && FIND_RUNS.test(rest[at - 1]))
    return rest.some((word) => FIND_PRINTS.test(word)) || runs.some((one) => !NAMES_ONLY.has(path.basename(one)))
      ? 'words' : null
  }
  if (name === 'git' && gitNamesOnly(rest)) return null
  return installed(verb, base) ? 'words' : null
}

// Los argumentos enteros de un tramo, sin comillas, y el valor de un `--opción=valor`. Una frase con espacios es texto,
// y lo que sigue a una comilla que el tramo no cierra también: el separador que lo cortó estaba adentro.
function argumentsOf(text) {
  const found = []
  for (const word of text.match(/(?:[^\s"']|"[^"]*"|'[^']*')+|["']/g) || []) {
    if (/^["']$/.test(word)) break
    // Un paréntesis sin comillas cierra un subshell o una sustitución, no es parte del nombre: `(perl … .env)`.
    const unquoted = word.replace(/"([^"]*)"|'([^']*)'/g, '$1$2').replace(/^[({]+/, '')
    const bare = /[({]/.test(unquoted) ? unquoted : unquoted.replace(/[)}]+$/, '')
    const value = bare.startsWith('-') ? bare.split(/=(.*)/s)[1] : bare
    if (value && !/\s/.test(value)) found.push(value)
    // `HEAD:.env` es el `.env` de esa revisión, y `host:.env` el de esa máquina.
    if (value && /^[^/:]+:[^/]/.test(value)) found.push(value.replace(/^[^:]*:/, ''))
  }
  return found
}

// `${VAR}` y `$VAR` son la misma expansión, y sólo la primera lleva llaves: la separación de palabras corta
// ahí, así que de `ops/${O}/.env.infisical` quedaba suelto `/.env.infisical` —una ruta absoluta que el
// comando no lee y que el bloqueo ofrecía aprobar—. Sin llaves, la expansión se queda pegada a su ruta y el
// guard la ve como lo que es: algo que no resolvió (caso 118).
const unbraced = (command) => String(command).replace(/\$\{(\w+)\}/g, '$$$1')

// Lo que el shell iba a expandir y el guard no: una variable, un `$(…)` o un backtick. Lo que sale de ahí
// no nombra ningún archivo, así que no se puede aprobar por archivo.
const UNRESOLVED = /[$`]/

// Los lectores cuyo primer argumento no es un archivo sino lo que buscan o lo que ejecutan: el patrón de un
// `grep`, el script de un `sed`, el programa de un `awk`, el filtro de un `jq`. Ese argumento nombra texto, y
// leerlo como ruta frenaba buscar `\.env\.schema` o `process\.env\.` en el código —la barra corta la palabra
// y queda `.env`—: 26 de los 44 frenos de una instancia real, ninguno sobre un archivo de credenciales
// (caso 287).
//
// `pattern` son las banderas que traen el patrón en su valor: con una de ellas ya no hay patrón posicional.
// `data` son las que traen otro dato que tampoco es un archivo, y cuántas palabras ocupa. `file` las que sí
// nombran uno. El valor de cualquier otra bandera se sigue mirando: si se confunde, es hacia el lado que frena.
// `-g`/`--glob` de `rg` nombran un archivo por comodín, y sin estar acá su valor se leía como el patrón
// posicional y se descartaba: `rg -g '.env*' KEY` pasaba y `rg -n KEY -g '.env*'` no (caso 342).
const SEARCH = { pattern: ['-e', '--regexp'], data: {}, file: ['-f', '--file', '-g', '--glob', '--include'] }
const PATTERN_FIRST = {
  grep: SEARCH, egrep: SEARCH, fgrep: SEARCH, rg: SEARCH,
  sed: { pattern: ['-e', '--expression'], data: {}, file: ['-f', '--file'] },
  awk: { pattern: [], data: { '-F': 1, '-v': 1 }, file: ['-f', '--file'] },
  jq: { pattern: [], data: { '--arg': 2, '--argjson': 2 }, file: ['-f', '--from-file'] },
}

const afterVerb = (segment, verb) => {
  const words = segment.trim().split(/\s+/)
  return words.slice(words.indexOf(verb) + 1)
}

// El tramo sin su patrón. Las palabras se parten respetando comillas, que es donde un patrón lleva espacios.
function withoutPattern(segment, verb) {
  const rule = PATTERN_FIRST[path.basename(verb)]
    || (path.basename(verb) === 'git' && PATTERN_FIRST[gitSub(afterVerb(segment, verb))] ? SEARCH : null)
  if (!rule) return segment
  const words = segment.match(/"[^"]*"|'[^']*'|\S+/g) || []
  const kept = []
  let positional = true
  const from = PATTERN_FIRST[path.basename(verb)] ? words.indexOf(verb) : words.indexOf('grep')
  for (let at = from + 1; at < words.length; at += 1) {
    const word = words[at]
    const [flag, attached] = word.split(/=(.*)/s)
    const separate = attached === undefined ? 1 : 0
    if (rule.pattern.includes(flag)) {
      positional = false
      at += separate
    } else if (rule.data[flag]) at += attached === undefined ? rule.data[flag] : rule.data[flag] - 1
    else if (rule.file.includes(flag)) {
      positional = false
      kept.push(word)
    } else if (word.startsWith('-') || !positional) kept.push(word)
    else positional = false
  }
  return kept.join(' ')
}

// Si un separador de comandos cae entre comillas, que es donde partir por él deja un `cd` que no corre.
function quotedSeparator(text) {
  let quote = ''
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = ''
      else if (/[;&|\n]/.test(char)) return true
    } else if (char === '"' || char === "'") quote = char
  }
  return false
}

// Lo que corre otro shell: el valor de `-c` o `--command` —`sh -c`, `docker exec … bash -c`, `gcloud compute ssh
// --command`—, lo que sigue a `eval` y el comando remoto de `ssh`. Se lee como un comando, sea cual sea el verbo de
// afuera: `docker` sólo nombra, y el `. ./.env` de su `sh -c` sí lee.
const SSH_VALUED = /^-[BbcDEeFIiJLlmOoPpQRSWw]$/
function scriptsOf(words, verb) {
  const found = []
  words.forEach((word, at) => {
    if (/^(?:-c|--command)$/.test(word) && words[at + 1]) found.push(words[at + 1])
    else if (word.startsWith('--command=')) found.push(word.slice('--command='.length))
  })
  const name = path.basename(verb)
  const rest = words.slice(words.indexOf(verb) + 1)
  if (name === 'eval') found.push(rest.join(' '))
  if (name === 'ssh') {
    let at = 0
    while (at < rest.length && rest[at].startsWith('-')) at += SSH_VALUED.test(rest[at]) ? 2 : 1
    if (rest.length > at + 1) found.push(rest.slice(at + 1).join(' '))
  }
  return found.map(shellWord)
}

// Los intérpretes nombran un archivo en una cadena de su código —`readFileSync('.env')`, `open('.env')`—; lo demás
// del código no es una ruta: `console.log(x.key)` no lee un archivo `.key`. Sus argumentos sueltos también cuentan.
const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'php', 'deno', 'bun'])
function literalsOf(text) {
  const found = argumentsOf(text)
  for (const word of text.match(/"(?:[^"\\]|\\[\s\S])*"|'[^']*'/g) || []) {
    for (const hit of shellWord(word).matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
      const literal = hit[1] ?? hit[2] ?? hit[3]
      if (literal && !/\s/.test(literal)) found.push(literal)
    }
  }
  return found
}

// Los tramos y sus separadores, alternados. Un `;`, un `|` o un salto entre comillas o escapado no separa: lo lee otro
// programa —el `;` de un `python3 -c`, el `|` de un `grep -E '(A|B)'`—, y cortar ahí dejaba la credencial en un tramo
// sin su lector.
function separated(text) {
  const hidden = masked(text).replace(/\\[\s\S]/g, '\u0000\u0000')
  const found = []
  let last = 0
  for (const run of hidden.matchAll(/[;&|\n]+/g)) {
    found.push(text.slice(last, run.index), run[0])
    last = run.index + run[0].length
  }
  found.push(text.slice(last))
  return found
}

// Las palabras de un tramo, sin lo que abre un bloque, y con las comillas dentro de la palabra: `B="a b"` es una.
const wordsOf = (piece) => piece.trim().replace(/^(?:(?:then|else|elif|if|do|while|until|!)\s+)*(?:[({]+\s*)+/, '')
  .match(/(?:[^\s"']|"[^"]*"|'[^']*'|["'])+/g) || []

const ASSIGNED = /^\s*(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"'])*\s+)+/

// Los comandos de un tramo: el de afuera y el de cada sustitución, que se lee hasta el final del tramo porque su `)`
// puede estar entre comillas. Lo que sigue al primer `)` se le pasa además al de afuera, con la sustitución como un
// valor sin resolver: en `cat "$(pwd)/.env"` la ruta la lee `cat`, no `pwd`.
function pieces(segment) {
  const parts = segment.split(/(\$\(|`)/)
  const found = [parts[0]]
  for (let at = 2; at < parts.length; at += 2) {
    found.push(parts[at])
    const close = parts[at - 1] === '$(' ? parts[at].indexOf(')') : -1
    if (close >= 0) found[0] += `$_${parts[at].slice(close + 1)}`
  }
  return found
}

// A dónde lleva un `cd` desde `base`, o null si no se sabe: una variable, una sustitución, una opción, comillas que la
// partición por espacios dejó abiertas.
function moved(base, to) {
  if (base === null) return null
  const home = (to === undefined ? '~' : to).replace(/^(["']?)\$(?:HOME\b|\{HOME\})/, `$1${os.homedir()}`)
  const target = home.replace(/^(["'])(.*)\1$/, '$2')
  if (/[$`*?"'\\]/.test(target) || target.startsWith('-')) return null
  return path.resolve(base, target.replace(/^~(?=$|\/)/, os.homedir()))
}

// Las palabras de cada tramo que lee, con la carpeta desde la que se resuelven: el que empieza con un lector, o el que
// redirige un archivo a la entrada. Lo entrecomillado se mira, porque el código de un `node -e` nombra el archivo ahí
// adentro.
//
// La carpeta es la que deja el `cd` de un tramo anterior (caso 518), y sólo cuando se sabe sin interpretar: el `cd`
// mueve lo que sigue a `&&`, `;` o un salto; tras un `||` —inmediato o más adelante—, o en la rama `else` de un
// `if`, no se sabe si corrió; tras cualquier otro separador corre en otro proceso y no mueve nada. Con un `( … )`, un
// `$( … )`, un backtick, un comentario o un separador entre comillas en el comando, lo que sigue a un `cd` no se sabe:
// seguirlos pedía leer bien comillas y redirecciones, y leerlas mal hacía pasar una lectura aprobada en otra carpeta.
// Una carpeta que no se sabe no se adivina: la lectura de una credencial pide la ruta absoluta.
function readTokens(command, cwd, depth = 0) {
  const found = new Map()
  const text = unbraced(command)
  const scoped = /[()`#]/.test(text) || quotedSeparator(text)
  let base = cwd
  let pending
  for (const [at, segment] of separated(text).entries()) {
    if (at % 2) {
      if (segment.includes('||') && (pending !== undefined || base !== cwd)) base = null
      else if (pending !== undefined && /^(?:&&|;|\n)+$/.test(segment)) base = pending
      pending = undefined
      continue
    }
    for (const written of pieces(segment)) {
      const raw = verbOf(wordsOf(written))
      // `\cat` y `"cat"` son `cat`.
      const piece = raw ? written.replace(raw, shellWord(raw)) : written
      const words = wordsOf(piece)
      if (/^\s*(?:else|elif)\b/.test(piece) && base !== cwd) base = null
      const verb = verbOf(words)
      if (verb === 'cd') pending = scoped ? null : moved(base, words[1])
      const reading = /<(?![<(])/.test(piece) ? 'all' : readingOf(words, verb, base)
      // Lo que va después de `>` es el destino, no lo que se lee: `cat > .npmrc` escribe, y eso lo juzga
      // `writtenCredentials` como escritura (caso 402). Una asignación delante del verbo guarda un nombre, no lo lee.
      const read = withoutPattern(piece.replace(ASSIGNED, ''), verb).replace(REDIRECT, ' ')
      const tokens = reading === 'all' ? read.match(/[^\s'"`\\;|&<>(){}=,]+/g) || [] : []
      const code = reading === 'all' && INTERPRETERS.has(path.basename(verb))
      for (const token of reading === 'words' ? argumentsOf(read) : code ? literalsOf(read) : tokens) {
        found.set(`${base}\0${token}`, { token, base })
      }
      for (const script of depth < 3 ? scriptsOf(words, verb) : []) {
        for (const one of readTokens(script, base, depth + 1)) found.set(`${one.base}\0${one.token}`, one)
      }
    }
  }
  return [...found.values()]
}

// Escribir una credencial desde el shell, con la misma regla y la misma aprobación que el guard `secrets` aplica a
// las herramientas de edición. Hasta 0.111.0 ese guard era el único: `echo … > .npmrc` pasaba, y `cat > .npmrc`
// frenaba sólo porque se lo leía como lectura (caso 405). La variable de la lectura no lo apaga: la pregunta es
// otra.
//
// `.env` y `.env.local` quedan afuera, y son la única excepción: armarlos desde su plantilla —`cp .env.example
// .env`— es el paso de setup de casi todo repositorio, y frenarlo frenaría a todos. Leerlos sigue frenando. El resto
// de la familia frena como en la edición: la excepción eximía `.env.*` entera, y con ella `.env.keys`, donde dotenvx
// guarda la clave privada, que ningún setup arma (caso 417).
const SETUP_ENV = /^\.env(?:\.local)?$/
function writtenCredentials(input, command) {
  const found = new Map()
  // Sin el cuerpo de los heredocs, que es dato (`asRead`): leído como comandos, frenaba crear un script que nombra
  // una credencial.
  for (const { raw, base } of writes(command, cwdOf(input))) {
    if (SETUP_ENV.test(path.basename(raw))) continue
    // Bajo un `cd` que no se resuelve no se sabe dónde cae, y una aprobación por archivo no tendría qué ruta nombrar:
    // se juzga por el nombre, que es lo que decide, y pasa sólo si la persona lo pidió en el chat nombrándolo.
    if (base === null && !path.isAbsolute(raw)) {
      const reason = credential(input, raw)
      if (reason && CHAT.unauthorized(input, [raw]).length) {
        block(`${raw} ${reason}\nEl comando hace \`cd\` a un destino que no se puede resolver acá: escribí la ruta `
          + 'absoluta, o hacé el `cd` en un comando aparte.')
      }
      continue
    }
    const file = path.resolve(base || cwdOf(input), raw)
    const reason = credential(input, file)
    if (reason) found.set(file, reason)
  }
  const left = AP.pending(opsRoot(input), [...found.keys()], input)
  if (!left.length) return
  block(`${left.map((file) => `${file} ${found.get(file)}`).join('\n')}\n${AP.HOW(null, left, input)}`)
}

// Lo que muestra la URL de un remoto (caso 530): `remote -v`, `remote show`, `remote get-url`, un `config` que lee las
// del remoto o lista todo, `ls-remote --get-url`, y un lector que nombra `.git/config`. Por sí solo no frena: frena si
// alguna URL de ese repositorio trae credencial, y la de un remoto sin ella se lee como siempre.
// Las opciones globales de git se sacan antes con `withoutGitGlobals`.
const SHOWS_URL = new RegExp(String.raw`(?:^|[\s;&|('"])(?:[^\s;&|()<>'"\x60]*\/)?git\s+(?:`
  + String.raw`remote\s+(?:[^;&|\n]*\s)?(?:-v+|--verbose|show|get-url)\b`
  + String.raw`|config\b(?=[^;&|\n]*(?:\bremote\b|\burl\b|\s(?:-l|--list|list)\b))`
  + String.raw`|ls-remote\b[^;&|\n]*--get-url)`)
function remoteShown(input, command, reads) {
  const raw = String(command)
  // El `.git/config` que se lee es el de su ruta, que puede ser de otro repositorio que el de la carpeta.
  const configs = reads.filter(({ token }) => /(?:^|\/)\.git\/config$/.test(token))
    .map(({ token, base }) => path.dirname(path.dirname(path.resolve(base || cwdOf(input), token))))
  const shows = SHOWS_URL.test(require('./input').withoutGitGlobals(raw))
  const dirs = [...new Set([...configs, ...(shows ? [require('./input').gitDirectory(raw, cwdOf(input), input)] : [])])]
  for (const dir of dirs) remoteIn(input, dir)
}

function remoteIn(input, dir) {
  const remotes = RC.credentialedRemotes(dir)
  if (!remotes.length) return
  const items = remotes.map((one) => `remote ${one.name} @ ${dir}`)
  const left = AP.pending(opsRoot(input), items, input)
  if (!left.length) return
  const named = remotes.filter((one) => left.includes(`remote ${one.name} @ ${dir}`))
  block(`el comando imprime la URL del remoto ${named.map((one) => one.name).join(' y ')} de ${dir}, que lleva una `
    + 'credencial: quedaría en el contexto de la sesión. Sacala de la URL y dejala en el helper de git:\n'
    + `${named.map((one) => `  ${RC.fixOf(dir, one)}`).join('\n')}\n${AP.HOW(null, left, input)}`)
}

function secretsShell(input) {
  const raw = commandOf(input)
  writtenCredentials(input, rawCommandOf(input))
  if (process.env.OPS_SECRETS_READ_OVERRIDE === '1') return
  // El mensaje de un commit es dato, como en `destructive`: nombrar el archivo ahí no lo lee. Lo demás corre.
  const command = isCommit(raw) ? asRun(raw) : raw
  // Una identidad declarada se reconoce también por su ruta resuelta desde la carpeta del tramo; la regla por nombre la
  // resuelve desde la sesión. Sólo contra las identidades: por nombre, un `.` resuelto tomaría el de su carpeta.
  const root = opsRoot(input)
  const declared = root && fs.existsSync(path.join(root, 'organization', 'secrets.json'))
    ? require('../secrets').identityFiles(root) : []
  const reads = readTokens(command, cwdOf(input))
  remoteShown(input, command, reads)
  const named = reads
    .filter(({ token, base }) => patternNames(token).some((name) => credential(input, name))
      || (base !== null && declared.includes(path.resolve(base, token.replace(/^~(?=$|\/)/, os.homedir())))))
  // Bajo un `cd` que no se sabe no hay qué ruta aprobar; pasa si la persona lo pidió en el chat nombrándolo, como la
  // escritura.
  const lost = named.find(({ token, base }) => base === null && !/^[~/]/.test(token)
    && CHAT.unauthorized(input, [token]).length)
  if (lost) {
    block(`el comando lee ${lost.token}, que es una credencial, después de un \`cd\` a un destino que no se puede `
      + 'resolver acá: escribí la ruta absoluta, o hacé el `cd` en un comando aparte.')
  }
  const files = named.filter(({ token, base }) => base !== null || /^[~/]/.test(token))
    .map(({ token, base }) => path.resolve(base || '/', token.replace(/^~(?=$|\/)/, os.homedir())))
  const left = AP.pending(opsRoot(input), [...new Set(files)], input)
  if (!left.length) return
  block(`el comando lee ${left.join(', ')}, que es una credencial: leerla la deja en el contexto de la sesión. `
    + 'Si hace falta un valor, pedíselo a una persona.\n'
    + AP.HOW('OPS_SECRETS_READ_OVERRIDE', left, input, left.filter((one) => !UNRESOLVED.test(one)),
      { durable: true }))
}

module.exports = { secretsShell }
