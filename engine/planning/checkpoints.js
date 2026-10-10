'use strict'

// El checkpoint humano entre hitos: qué archivos lo dicen y a quién frena cada uno (caso 347).
//
// Garantiza tres cosas. Un checkpoint vive en `checkpoints/<hito>.md`, uno por hito, así que dos líneas de
// trabajo nunca escriben el mismo archivo. Frena a la línea que lo escribió —su `line:`— y a ninguna otra. Y
// es cerrado por defecto (R27): el que no dice `resuelta` frena, y el que no dice de qué línea es frena a
// todas.
//
// Era un solo `AWAITING_REVIEW.md` por instancia. Con dos líneas, la segunda que cerraba un hito reescribía
// el archivo que había traído de la primera; cuando la primera resolvía el suyo, git fusionaba las dos
// ediciones sin conflicto y dejaba `status: resuelta` sobre el checkpoint que nadie había revisado. Ese
// archivo se sigue leyendo, sin línea: es el de las instancias anteriores y la forma de parar todo a propósito.

const fs = require('node:fs')
const path = require('node:path')
const { NAME } = require('./lines')

const LEGACY = 'AWAITING_REVIEW.md'
const DIR = 'checkpoints'
const STATES = ['pendiente', 'resuelta']
const QUOTES = ['\'', '"']

const readIfAny = (file) => {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

// `line` queda `undefined` cuando el frontmatter no lo trae, y vacío cuando lo trae sin valor: lo primero es
// «no dice de quién es», lo segundo es el árbol principal. Lo que no es un nombre de línea tampoco dice de
// quién es: un valor mal escrito que se comparara tal cual no coincidiría con nadie, y el checkpoint
// quedaría pendiente sin frenar a ninguno. Las comillas se quitan porque quien lo escribe las pone.
//
// Y el fin de línea de Windows o un BOM no cambian lo que dice: sin esto el frontmatter no se leía, y el
// checkpoint que una persona acababa de resolver en su editor seguía frenando.
function parse(relative, raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const front = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1] || ''
  const field = (key) => {
    const value = (front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm')) || [])[1]
    if (value === undefined) return undefined
    const bare = value.trim()
    const quoted = bare.length > 1 && QUOTES.includes(bare[0]) && bare[bare.length - 1] === bare[0]
    return quoted ? bare.slice(1, -1).trim() : bare
  }
  const line = field('line')
  // El archivo de siempre se lee como siempre —el estado en cualquier renglón, porque el de una instancia
  // anterior no trae frontmatter—. En el de un hito el estado es el del frontmatter: el cuerpo explica cómo
  // se destraba, y esa frase no puede ser la que lo destrabe.
  const status = relative === LEGACY
    ? ((text.match(/^status:\s*(.*)$/mi) || [])[1] || '').trim()
    : field('status') || ''
  return { file: relative, status, hito: field('hito') || '', resolved: /^resuelta\b/i.test(status),
    written: line, line: line === undefined || line === '' || NAME.test(line) ? line : undefined }
}

function all(dir) {
  const found = []
  const legacy = readIfAny(path.join(dir, LEGACY))
  if (legacy) found.push(parse(LEGACY, legacy))
  let names = []
  try { names = fs.readdirSync(path.join(dir, DIR)) } catch { names = [] }
  for (const name of names.filter((one) => one.endsWith('.md') && one !== 'README.md').sort()) {
    found.push(parse(`${DIR}/${name}`, readIfAny(path.join(dir, DIR, name)) || ''))
  }
  return found
}

// Si un checkpoint sigue frenando lo dice su `status`, no que el archivo esté (R28). Es la misma forma que el
// WIP —`status: IDLE` es un estado escrito—: un centinela cuya única información es existir obliga a que el
// borrado sea parte de la resolución, y cuando se olvida, quien revisa lee que el hito ya se revisó mientras
// la corrida siguiente muere en la puerta de entrada.
const pending = (dir) => all(dir).filter((one) => !one.resolved)
const holding = (dir, line) => pending(dir).filter((one) => one.line === undefined || one.line === line)

// Lo que el motor lee tiene que estar: un checkpoint con el nombre cambiado o el estado mal escrito frena a
// quien no debe, o no frena a nadie, y en los dos casos se lee como uno bien escrito.
function errors(dir) {
  const found = []
  for (const one of all(dir).filter((item) => item.file !== LEGACY)) {
    const name = path.basename(one.file, '.md')
    if (one.hito !== name) found.push(`${one.file}: hito «${one.hito}» no es el nombre del archivo`)
    if (!one.status) found.push(`${one.file}: falta \`status\`, y sin él frena para siempre`)
    else if (!STATES.includes(one.status.split(/\s/)[0].toLowerCase())) {
      found.push(`${one.file}: status «${one.status}» no es \`pendiente\` ni \`resuelta\``)
    }
    if (one.written && !NAME.test(one.written)) {
      found.push(`${one.file}: line «${one.written}» no es un nombre de línea (minúsculas y guiones), `
        + 'así que frena a todas')
    }
  }
  return found
}

module.exports = { pending, holding, errors }
