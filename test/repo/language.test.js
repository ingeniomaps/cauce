'use strict'

// Que el código se nombre en inglés, como pide AGENTS.md: los nombres que declara o usa el código de este
// repositorio —JavaScript, shell y los `run:` de los workflows— no traen palabras en español. Las claves y
// las propiedades no se miran: en una prueba suelen ser datos (una línea que se llama `otra`), y en el motor
// el vocabulario que se escribe a disco. Lo que de ese vocabulario aparece como nombre se declara abajo,
// una vez y con su razón.
//
// Detecta, no demuestra. Reconoce el español por cuatro señales: una tilde o una eñe, una primera palabra
// que en inglés no abre un nombre (`sinCambio`, `conGit`), una lista de palabras que salió de traducir
// cuatrocientos ochenta nombres, y la prosa del propio repositorio. Esta última cierra por defecto (R27): una palabra
// de un nombre que la prosa en español usa cuenta como español hasta que `english-words.txt` la declara inglesa. La
// lista a mano dejó pasar veintinueve nombres —`ocupado`, `candidatos`, `limpiar`— que sí estaban en la prosa.
// Lo que queda abierto es la palabra que la prosa nunca usó. Una palabra nueva en inglés que la prosa también usa
// pone esto en rojo y se agrega a `english-words.txt`; agregar una en español para que algo pase es la salida que no
// corresponde.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { sourceFiles } = require('../support/environment')
const { codeOnly } = require('../support/lexer')
const { proseWords } = require('../support/prose')

const ROOT = path.resolve(__dirname, '..', '..')
const WORDS = new Set(fs.readFileSync(path.join(__dirname, '..', 'support', 'spanish-words.txt'), 'utf8')
  .split('\n').map((one) => one.trim()).filter(Boolean))
const FIRST_WORDS = new Set(['sin', 'con', 'en', 'para', 'por', 'del', 'al', 'ya', 'solo', 'tras', 'entre',
  'desde', 'hasta', 'mas'])
const SUFFIX = /(?:ados|adas|idos|idas|ciones|mente)$/
const ENGLISH = new Set(fs.readFileSync(path.join(__dirname, '..', 'support', 'english-words.txt'), 'utf8')
  .split('\n').map((one) => one.trim()).filter(Boolean))
let prose
const inSpanishProse = (word) => {
  prose = prose || proseWords(ROOT)
  return word.length >= 3 && prose.has(word) && !ENGLISH.has(word)
}

// Vocabulario que el código nombra igual que el documento que lee o escribe: traducirlo dejaría el nombre
// y el campo diciendo cosas distintas, o rompería lo ya escrito. Cada uno con lo que nombra.
const VOCABULARY = {
  fecha: 'el campo `fecha:` de una entrada de DONE',
  pagos: 'una línea de ejemplo de las pruebas de líneas, dentro de una plantilla que el lexer lee como código',
}

const normalize = (word) => word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const wordsOf = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .split(/[\s_$0-9]+/).filter(Boolean)

// La palabra en español que delata al nombre, o '' si no hay ninguna.
function spanishWord(name) {
  if (/[áéíóúñÁÉÍÓÚÑ]/.test(name)) return name
  const words = wordsOf(name)
  if (words.length > 1 && FIRST_WORDS.has(words[0].toLowerCase())) return words[0]
  return words.find((word) => WORDS.has(normalize(word)) || (word.length > 6 && SUFFIX.test(normalize(word)))
    || inSpanishProse(normalize(word))) || ''
}

// Los nombres de un archivo de JavaScript, sin propiedades ni claves de objeto.
function jsNames(src) {
  const code = codeOnly(src)
  const names = []
  for (const match of code.matchAll(/[A-Za-z_$À-ſ][\w$À-ſ]*/g)) {
    if (/[\w$À-ſ]/.test(code[match.index - 1] || '')) continue
    const before = code.slice(0, match.index).replace(/\s+$/, '')
    const after = code.slice(match.index + match[0].length).replace(/^\s+/, '')
    if (before.endsWith('.') && !before.endsWith('...')) continue
    if (after.startsWith(':') && !after.startsWith('::') && /[{,]$/.test(before)) continue
    names.push(match[0])
  }
  return names
}

// Las variables de un script de shell o de los `run:` de un workflow: las que se asignan, las que se
// expanden, las que recorre un `for` o llena un `read`, y las funciones que define.
function shellNames(src) {
  const names = []
  for (const line of src.split('\n')) {
    const code = line.replace(/(^|\s)#.*$/, '')
    for (const match of code.matchAll(/(?:^|[\s;(])(?:local\s+|export\s+|readonly\s+)?([A-Za-z_]\w*)=/g)) {
      names.push(match[1])
    }
    for (const match of code.matchAll(/\$\{?([A-Za-z_]\w*)/g)) names.push(match[1])
    for (const match of code.matchAll(/(?:^|[\s;])(?:function\s+)?([A-Za-z_]\w*)\s*\(\)\s*\{/g)) names.push(match[1])
    for (const match of code.matchAll(/\b(?:for|read(?:\s+-\w+)*)\s+([A-Za-z_]\w*)\b/g)) names.push(match[1])
  }
  return names
}

function below(dir, pattern, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) below(file, pattern, out)
    else if (pattern.test(entry.name)) out.push(file)
  }
  return out
}

const files = () => [...sourceFiles(), ...below(path.join(ROOT, '.github'), /\.(ya?ml|sh)$/),
  ...below(path.join(ROOT, '.claude', 'hooks'), /\.js$/)]

function spanishNames() {
  const found = new Map()
  for (const file of files()) {
    const src = fs.readFileSync(file, 'utf8')
    const names = file.endsWith('.js') ? jsNames(src) : shellNames(src)
    for (const name of names) {
      const word = spanishWord(name)
      if (!word) continue
      const key = `${path.relative(ROOT, file)}: ${name}`
      if (!found.has(key)) found.set(key, { name, word })
    }
  }
  return found
}

test('ningún nombre de código está en español', () => {
  const found = spanishNames()
  const offending = [...found].filter(([, one]) => !(one.name in VOCABULARY))
    .map(([key, one]) => `${key} («${one.word}»)`)
  assert.ok(files().length > 300, `sólo se recorrieron ${files().length} archivos`)
  assert.deepEqual(offending, [], `nombres en español:\n  ${offending.join('\n  ')}`)
})

// Las dos listas no se contradicen, y la inglesa no declara lo que la prosa ya no usa: una palabra que salió de la
// prosa vuelve a quedar abierta, y declararla inglesa sería una excepción sin nada que exceptuar.
test('la lista inglesa no choca con la española y sólo trae palabras de la prosa', () => {
  const both = [...ENGLISH].filter((word) => WORDS.has(word))
  prose = prose || proseWords(ROOT)
  const unused = [...ENGLISH].filter((word) => !prose.has(word))
  assert.deepEqual(both, [], `palabras en las dos listas: ${both.join(', ')}`)
  assert.deepEqual(unused, [], `palabras de english-words.txt que la prosa ya no usa: ${unused.join(', ')}`)
})

test('cada nombre del vocabulario sigue apareciendo en el código', () => {
  const used = new Set([...spanishNames().values()].map((one) => one.name))
  const stale = Object.keys(VOCABULARY).filter((name) => !used.has(name))
  assert.deepEqual(stale, [], `vocabulario declarado que ya no se usa: ${stale.join(', ')}`)
})

test('el detector reconoce el español y deja pasar el inglés', () => {
  // `limpiar`, `ocupado` y `candidatos` no están en la lista a mano: los reconoce la prosa.
  for (const name of ['sinCambio', 'conGit', 'texto', 'salidaJson', 'heredados', 'Revisión', 'enElNombre', 'limpiar',
    'ocupado', 'candidatosRepo']) {
    assert.notEqual(spanishWord(name), '', name)
  }
  for (const name of ['configRuns', 'heredoc', 'withoutFootprint', 'output', 'sinceLast', 'context',
    'suspicion', 'revision']) {
    assert.equal(spanishWord(name), '', name)
  }
  assert.deepEqual(jsNames('const salida = x.texto; f({ hecho: 1, ...resto })'), ['const', 'salida', 'x', 'f',
    'resto'], 'una propiedad y una clave no son nombres; lo que se esparce sí')
  assert.deepEqual(shellNames('rama=x # salida=y\nfor uno in $lista; do echo "${otro}"; done'),
    ['rama', 'lista', 'otro', 'uno'])
})
