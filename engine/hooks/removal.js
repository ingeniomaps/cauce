'use strict'

// Lo que un `rm -r` borra, resuelto. Las reglas de `destructive` miran cómo está escrito el destino —`/`,
// `~`, `..`— y R23 dice que la comprobación es del destino y no de la intención: `rm -rf .` es el cwd, y
// `cd $X && rm -rf .` con `X` vacío es el cwd también (caso 337). Vive aparte de `shell.js` por lo mismo que
// `mktemp.js`: es una sola pregunta —a dónde cae un borrado— y la contesta siguiendo el `cd` tramo a tramo.
//
// Lo que `shell.js` presta —`cdTarget`, `positional`, `QUOTED_CD`— se pide al usarlo y no al cargar, porque
// `shell.js` carga este archivo: pedirlo arriba dejaría los tres sin definir.

const os = require('node:os')
const path = require('node:path')
const { cwdOf, opsRoot, configOf, expandAssigned } = require('./input')
const { MKTEMP } = require('./mktemp')

// Un `cd $(mktemp -d)` cae en un temporal que no contiene nada de lo que se cuida.
function removedDirectories(command, cwd) {
  const { cdTarget, positional, QUOTED_CD } = require('./shell')
  const found = []
  let base = cwd
  for (const segment of expandAssigned(command).replace(QUOTED_CD, '$1$3').split(/[;&\n]+|(?<!>)\|+/)) {
    const cd = segment.match(/^\s*cd(?:\s+(\$\([^)]*\)|\S+))?\s*$/)
    if (cd) {
      base = MKTEMP.test(cd[1] || '') ? path.join(os.tmpdir(), 'mktemp') : base === null ? null : cdTarget(cd[1], base)
      continue
    }
    const rm = segment.match(/^\s*rm\s+((?:-\S+\s+)*)(?:--\s+)?(.*)$/)
    if (!rm || !/-\S*r/i.test(rm[1])) continue
    for (const raw of positional(rm[2].replace(/(["'])([^"'\n]*)\1/g, '$2'))) found.push({ raw, base })
  }
  return found
}

// Sin salida por chat ni por archivo, como la regla de `/` y `~`: es la clase que gobierna R23. Se cuida
// el directorio actual, la raíz ops y las raíces declaradas, nombradas enteras o por un ancestro.
function removesTheTree(input, command) {
  const cwd = cwdOf(input)
  const ops = opsRoot(input)
  const roots = ops ? (configOf(ops).workspaceRoots || []).filter((one) => one && one.path) : []
  const kept = [cwd, ...(ops ? [ops] : []), ...roots.map((one) => path.resolve(ops, one.path))]
  for (const { raw, base } of removedDirectories(command, cwd)) {
    if (/[$`\u0000]/.test(raw)) continue
    if (base === null && !path.isAbsolute(raw)) {
      return `el comando hace \`cd\` a un destino que no se puede resolver acá y después borra ${raw}: con la `
        + 'variable vacía el destino resuelto es el directorio actual (R23). Escribí la ruta absoluta.'
    }
    const target = path.resolve(base || '/', raw.replace(/^~(?=$|\/)/, os.homedir()))
    const hit = kept.find((one) => one === target || one.startsWith(target + path.sep))
    if (!hit) continue
    const what = hit === cwd ? 'el directorio actual' : hit === ops ? 'la raíz ops' : `la raíz ${hit}`
    return `'rm -r' sobre ${target} se lleva ${what} (destino resuelto desde ${base}): es la clase que `
      + 'gobierna R23 y no tiene salida. Nombrá la carpeta concreta que querés borrar.'
  }
  return null
}

module.exports = { removesTheTree }
