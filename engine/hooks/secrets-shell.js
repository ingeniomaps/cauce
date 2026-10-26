'use strict'

// Leer o escribir una credencial por shell. `secrets-read` mira la herramienta de lectura del runner, y un `cat .env`
// no pasa por ella: en Claude lo tapaba una regla nativa `permissions.deny`, que además frenaba lo que la
// persona pedía, y en los otros runners no lo tapaba nada (caso 104). Esto lo mira donde pasan todos los
// comandos, con la misma salida que el resto: lo que la persona pidió en el chat pasa.
//
// Como todo lo que lee el texto de un comando, frena la forma habitual y no un script decidido: un nombre
// armado en una variable o un `grep -r` sobre la carpeta sin nombrar el archivo pasan.

const os = require('node:os')
const path = require('node:path')
const { commandOf, cwdOf, block, isCommit, unquoted, opsRoot } = require('./input')
const { credential, patternNames } = require('./files')
const { REDIRECT } = require('./shell-writes')
const { writes } = require('./shell-changes')
const AP = require('./approval')
const CHAT = require('./chat')

// Lo que muestra el contenido de un archivo. Queda afuera lo que sólo lo nombra —`ls`, `test -f`, `rm`,
// `git add`—, que no deja nada en la sesión, y `cp` y `mv`, cuyo último argumento es un destino: `cp
// .env.example .env` es preparar el entorno, no leerlo. `nl` entró porque un agente lo usó en una sesión
// real para leer el `.env` después de que la lista no lo tuviera.
const READERS = new Set(['cat', 'tac', 'nl', 'head', 'tail', 'less', 'more', 'bat', 'sed', 'awk', 'grep', 'egrep',
  'fgrep', 'rg', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'cut', 'sort', 'uniq', 'rev', 'paste', 'fold', 'pr',
  'dd', 'jq', 'yq', 'diff', 'cmp', 'source', '.', 'node', 'python', 'python3', 'ruby', 'perl', 'php', 'deno', 'bun'])
const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs'])

// El verbo de un tramo, saltando lo que va delante sin serlo: asignaciones, prefijos y sus banderas.
function verbOf(words) {
  let prefixed = false
  while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || PREFIXES.has(words[0])
    || (prefixed && words[0].startsWith('-')))) {
    prefixed = prefixed || PREFIXES.has(words[0])
    words.shift()
  }
  return words[0] || ''
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

// El tramo sin su patrón. Las palabras se parten respetando comillas, que es donde un patrón lleva espacios.
function withoutPattern(segment, verb) {
  const rule = PATTERN_FIRST[path.basename(verb)]
  if (!rule) return segment
  const words = segment.match(/"[^"]*"|'[^']*'|\S+/g) || []
  const kept = []
  let positional = true
  for (let at = words.indexOf(verb) + 1; at < words.length; at += 1) {
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

// Las palabras de cada tramo que lee: el que empieza con un lector, o el que redirige un archivo a la
// entrada. Lo entrecomillado se mira, porque el código de un `node -e` nombra el archivo ahí adentro.
function readTokens(command) {
  const found = []
  for (const segment of unbraced(command).split(/[;&|\n]+|\$\(|`/)) {
    const words = segment.trim().replace(/^[({]+\s*/, '').split(/\s+/).filter(Boolean)
    const verb = verbOf(words)
    const reads = READERS.has(path.basename(verb)) || /<(?![<(])/.test(segment)
    // Lo que va después de `>` es el destino, no lo que se lee: `cat > .npmrc` escribe, y eso lo juzga
    // `writtenCredentials` como escritura (caso 402).
    const read = withoutPattern(segment, verb).replace(REDIRECT, ' ')
    if (reads) found.push(...(read.match(/[^\s'"`\\;|&<>(){}=,]+/g) || []))
  }
  return [...new Set(found)]
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

function secretsShell(input) {
  const raw = commandOf(input)
  writtenCredentials(input, raw)
  if (process.env.OPS_SECRETS_READ_OVERRIDE === '1') return
  // El mensaje de un commit es dato, como en `destructive`: nombrar el archivo ahí no lo lee.
  const command = isCommit(raw) ? unquoted(raw) : raw
  const cwd = cwdOf(input)
  const files = readTokens(command).filter((token) => patternNames(token).some((name) => credential(input, name)))
    .map((token) => path.resolve(cwd, token.replace(/^~(?=$|\/)/, os.homedir())))
  const left = AP.pending(opsRoot(input), [...new Set(files)], input)
  if (!left.length) return
  block(`el comando lee ${left.join(', ')}, que es una credencial: leerla la deja en el contexto de la sesión. `
    + 'Si hace falta un valor, pedíselo a una persona.\n'
    + AP.HOW('OPS_SECRETS_READ_OVERRIDE', left, input, left.filter((one) => !UNRESOLVED.test(one)),
      { durable: true }))
}

module.exports = { secretsShell }
