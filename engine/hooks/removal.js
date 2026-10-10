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

// Un `cd $(mktemp -d)` cae en un temporal que no contiene nada de lo que se cuida; un `cd` a una ruta absoluta
// vuelve a dar base aunque la anterior no se haya resuelto. El verbo se busca detrás de lo que un shell admite
// delante —asignaciones, `sudo`, `time`, un paréntesis—, igual que `test-evidence-shell`: `sudo rm -rf .` es
// el mismo borrado (revisión del 337). Un glob se juzga por su carpeta: `rm -rf *` vacía el cwd como `rm -rf .`.
const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs'])
const home = (raw) => raw.replace(/^~(?=$|\/)/, os.homedir())
function removedDirectories(command, cwd) {
  const { cdTarget, positional, QUOTED_CD } = require('./shell')
  const found = []
  let base = cwd
  for (const segment of expandAssigned(command).replace(QUOTED_CD, '$1$3').split(/[;&\n]+|(?<!>)\|+/)) {
    const cd = segment.match(/^\s*cd(?:\s+(\$\([^)]*\)|\S+))?\s*$/)
    if (cd) {
      const to = cd[1] || ''
      if (MKTEMP.test(to)) base = path.join(os.tmpdir(), 'mktemp')
      else if (path.isAbsolute(home(to))) base = home(to)
      else base = base === null ? null : cdTarget(to, base)
      continue
    }
    const words = segment.trim().replace(/^[({]+\s*|\s*[)}]+$/g, '').replace(/(["'])([^"'\n]*)\1/g, '$2')
      .split(/\s+/)
    while (words.length && (/^[A-Za-z_]\w*=/.test(words[0]) || PREFIXES.has(words[0]))) words.shift()
    if (path.basename(words[0] || '') !== 'rm') continue
    const flags = words.slice(1).filter((word) => word.startsWith('-') && word !== '--')
    if (!flags.some((flag) => /^-[^-]*r/i.test(flag) || flag === '--recursive')) continue
    for (const raw of positional(words.slice(1).join(' '))) found.push({ raw: raw.replace(/\/?\*$/, '') || '.', base })
  }
  return found
}

// Sin salida por chat ni por archivo, como la regla de `/` y `~`: es la clase que gobierna R23. Se cuida
// el directorio actual, la raíz ops, las raíces declaradas y la carpeta personal, nombradas enteras o por un
// ancestro. La carpeta personal va por nombre: quedaba cuidada sólo por contener a las otras, y con el
// proyecto fuera de ella un `cd ~ && rm -rf .` pasaba (caso 368).
function removesTheTree(input, command) {
  const cwd = cwdOf(input)
  const ops = opsRoot(input)
  const roots = ops ? (configOf(ops).workspaceRoots || []).filter((one) => one && one.path) : []
  const kept = [cwd, ...(ops ? [ops] : []), ...roots.map((one) => path.resolve(ops, one.path)), os.homedir()]
  for (const { raw, base } of removedDirectories(command, cwd)) {
    if (/[$`\u0000]/.test(raw)) continue
    const named = home(raw)
    // Sin base no se juzga una subcarpeta nombrada —`cd "$DIR" && rm -rf node_modules` es limpieza corriente—,
    // sólo el árbol mismo: `.`, `..` y lo que cuelga de ellos. Con `X` vacío, `cd $X` es `cd`, que deja en la
    // carpeta personal, y `rm -rf .` la borra.
    if (base === null && !path.isAbsolute(named)) {
      if (!/^\.\.?(?:\/|$)/.test(path.normalize(named) === '.' ? './' : named)) continue
      return `el comando hace \`cd\` a un destino que no se puede resolver acá y después borra ${raw}: con la `
        + 'variable vacía el `cd` deja en la carpeta personal y el borrado se la lleva (R23). Escribí la ruta '
        + 'absoluta.'
    }
    const target = path.resolve(base || '/', named)
    const hit = kept.find((one) => one === target || one.startsWith(target + path.sep))
    if (!hit) continue
    const what = hit === cwd ? 'el directorio actual' : hit === ops ? 'la raíz ops'
      : hit === os.homedir() ? 'la carpeta personal' : `la raíz ${hit}`
    return `'rm -r' sobre ${target} se lleva ${what} (destino resuelto desde ${base}): es la clase que `
      + 'gobierna R23 y no tiene salida. Nombrá la carpeta concreta que querés borrar.'
  }
  return null
}

module.exports = { removesTheTree }
