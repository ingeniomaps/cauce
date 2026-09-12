'use strict'

// Leer una credencial por shell. `secrets-read` mira la herramienta de lectura del runner, y un `cat .env`
// no pasa por ella: en Claude lo tapaba una regla nativa `permissions.deny`, que además frenaba lo que la
// persona pedía, y en los otros runners no lo tapaba nada (caso 104). Esto lo mira donde pasan todos los
// comandos, con la misma salida que el resto: lo que la persona pidió en el chat pasa.
//
// Como todo lo que lee el texto de un comando, frena la forma habitual y no un script decidido: un nombre
// armado en una variable o un `grep -r` sobre la carpeta sin nombrar el archivo pasan.

const path = require('node:path')
const { commandOf, cwdOf, block, isCommit, unquoted, opsRoot } = require('./input')
const { credential, patternNames } = require('./files')
const AP = require('./approval')

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

// Las palabras de cada tramo que lee: el que empieza con un lector, o el que redirige un archivo a la
// entrada. Lo entrecomillado se mira, porque el código de un `node -e` nombra el archivo ahí adentro.
function readTokens(command) {
  const found = []
  for (const segment of unbraced(command).split(/[;&|\n]+|\$\(|`/)) {
    const words = segment.trim().replace(/^[({]+\s*/, '').split(/\s+/).filter(Boolean)
    const reads = READERS.has(path.basename(verbOf(words))) || /<(?![<(])/.test(segment)
    if (reads) found.push(...(segment.match(/[^\s'"`\\;|&<>(){}=,]+/g) || []))
  }
  return [...new Set(found)]
}

function secretsShell(input) {
  if (process.env.OPS_SECRETS_READ_OVERRIDE === '1') return
  const raw = commandOf(input)
  // El mensaje de un commit es dato, como en `destructive`: nombrar el archivo ahí no lo lee.
  const command = isCommit(raw) ? unquoted(raw) : raw
  const cwd = cwdOf(input)
  const files = readTokens(command).filter((token) => patternNames(token).some((name) => credential(input, name)))
    .map((token) => path.resolve(cwd, token))
  const left = AP.pending(opsRoot(input), [...new Set(files)], input)
  if (!left.length) return
  block(`el comando lee ${left.join(', ')}, que es una credencial: leerla la deja en el contexto de la sesión. `
    + 'Si hace falta un valor, pedíselo a una persona.\n'
    + AP.HOW('OPS_SECRETS_READ_OVERRIDE', left, input, left.filter((one) => !UNRESOLVED.test(one))))
}

module.exports = { secretsShell }
