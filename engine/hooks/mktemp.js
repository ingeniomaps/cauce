'use strict'

// Dónde crea `mktemp` lo suyo cuando un comando guarda el resultado en una variable y después hace `cd` a
// ella: es como se arma una copia desechable, y el guard de límites necesita saber dónde cae lo que sigue.
// Vive aparte del resto de la lectura de comandos (`input.js`) porque es una sola pregunta con muchas formas.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MKTEMP = /^\$\(mktemp((?:\s+[^\s$`]+)*)\)$/

// Dónde crea `mktemp` lo suyo: el directorio de `-p` o `--tmpdir=`, el de la plantilla si trae ruta, y el
// temporal del sistema si no dice nada. El nombre que elige no se sabe y no hace falta: lo que se juzga es dónde
// cae, y cae adentro de ése. Sin esto sólo se reconocía el temporal del sistema, y una copia hecha con
// `mktemp -d -p <scratchpad de la sesión>` —lo que pide R23 para una mutación— dejaba el `cd` sin resolver y
// frenaba toda escritura que viniera después (caso 311).
//
// Se acepta una lista cerrada de formas y lo demás queda sin resolver, que es el lado que frena. `mktemp`
// tiene más de una manera de decir dónde, y cuando dos se contradicen gana una que acá no se sabe: con dos
// `-p` usa el último, con `-t` manda `TMPDIR`, y una plantilla con `..` se sale del directorio que la precede.
// Resolver mal acá es peor que no resolver: el guard juzgaría una carpeta permitida mientras se escribe en
// otra. Vacío significa «no se sabe».
//
// Y tres formas más quedan sin resolver, porque resueltas juzgaban una carpeta donde no se iba a escribir
// (caso 318). Sin `-d` lo que `mktemp` crea es un archivo: el `cd` falla y lo que sigue cae donde se estaba.
// Con `TMPDIR` asignado en el comando, el temporal ya no es el que ve este proceso. Y una plantilla sin ruta
// crea en la carpeta donde se está, que acá no se sabe cuál es. Y una plantilla sin tres `X` seguidas no crea
// nada: `mktemp` la rechaza (caso 327).
function mktempParent(args, movedTemp) {
  const words = args.trim().split(/\s+/).filter(Boolean)
    .map((word) => word.replace(/^(["'])(.*)\1$/, '$2'))
  const dirs = []
  const templates = []
  if (!words.includes('-d')) return ''
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at]
    if (word === '-d' || word === '-q') continue
    if (word === '-p') { dirs.push(words[at += 1] || ''); continue }
    if (word.startsWith('--tmpdir=')) { dirs.push(word.slice('--tmpdir='.length)); continue }
    if (word.startsWith('-')) return ''
    templates.push(word)
  }
  if (dirs.length > 1 || templates.length > 1 || /["']/.test(words.join(''))) return ''
  const [template = ''] = templates
  if (template && !/XXX/.test(path.basename(template))) return ''
  if (dirs.length) return template.includes('/') || !path.isAbsolute(dirs[0]) ? '' : dirs[0]
  if (!template) return movedTemp ? '' : os.tmpdir()
  if (!template.includes('/')) return ''
  return path.isAbsolute(template) && !template.split('/').includes('..') ? path.dirname(template) : ''
}

// Lo mismo, y además que el `cd` que sigue no pueda quedar sin argumento: si `mktemp` falla la variable queda
// vacía, `cd` va a la carpeta personal, y lo que sigue se escribe ahí mientras el guard juzga la carpeta pedida
// (caso 327). Alcanza con una de tres cosas. Que la asignación siga con `&&`, porque fallida corta la cadena.
// Que la carpeta ya esté, sea una carpeta y se pueda escribir, que es lo que `mktemp` necesita. O que un paso
// anterior del mismo comando la cree con `mkdir -p`, nombrándola: es la forma corriente de armar una copia en
// varios renglones, y exigirle `&&` frenaba lo que nadie hace mal.
//
// No se exige `&&` a secas porque el `;` y el salto de renglón son tan corrientes como él en comandos reales.
// Y lo que queda afuera es un comando que rompe su propia carpeta antes de usarla —`rm -rf X; T=$(mktemp -d
// -p X)`—, o un `mkdir -p` que falla: el disco se mira antes de que el comando corra.
function madeUnder(args, { raw, chained, before }) {
  const parent = mktempParent(args, /\bTMPDIR=/.test(raw))
  if (!parent || chained || usable(parent)) return parent
  // Sirve también `mkdir -p X/sub`, que crea `X` de paso. Una ruta relativa no: acá no se sabe contra qué.
  const target = path.resolve(parent)
  const same = (word) => {
    const made = word.replace(/^(["'])(.*)\1$/, '$2')
    return path.isAbsolute(made) && `${path.resolve(made)}${path.sep}`.startsWith(`${target}${path.sep}`)
  }
  const creates = (words) => words[0] === 'mkdir' && words.includes('-p') && words.slice(1).some(same)
  return before.some((segment) => creates(segment.trim().split(/\s+/))) ? parent : ''
}

function usable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK)
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

module.exports = { MKTEMP, madeUnder }
