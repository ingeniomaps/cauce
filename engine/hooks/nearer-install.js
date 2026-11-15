'use strict'

// Un guard que llega desde el `settings.local.json` de la raíz git (`engine/automation/subfolder-hooks.js`) corre en
// toda sesión abierta debajo de su instalación. Si entre la carpeta de la sesión y esa instalación hay otra de Cauce
// cuyos guards de verdad corren en la sesión —una instancia dentro de otra, como un monorepo con una embebida en la
// raíz y otra en un paquete—, la sesión es de la más cercana, y éste se retira: es la misma regla con que los guards
// encuentran su instancia.
//
// Correr de verdad es que la sesión se abrió en esa carpeta y su `settings.json` apunta a un script que existe: es lo
// único que Claude Code lee de ella. La de adentro no escribe entradas en el `settings.local.json`, porque su carpeta
// no es la raíz del repositorio. Un `settings.json` copiado a una subcarpeta, que nombra guards que no corren, no
// cuenta: retirarse ahí dejaba la sesión sin ninguno.

const fs = require('node:fs')
const path = require('node:path')

const quoted = (text) => `'${text.replace(/'/g, `'\\''`)}'`
// El comienzo de cada entrada del `settings.local.json`: compara la carpeta de la sesión por su ruta real.
const opener = (install) => `case "$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P)" in ${quoted(install)}/*) `

const real = (dir) => {
  try { return fs.realpathSync(dir) } catch { return '' }
}

// Con la instancia en una subcarpeta (`ops/`) o embebida en la carpeta misma, sin prefijo.
const SCRIPT = /^\$CLAUDE_PROJECT_DIR(\/(?:\S*\/)?automatization\/hooks\/guard-[\w-]+\.sh)/

// Si los guards de `settings.json` corren en una sesión abierta en `dir`.
function runsHere(dir) {
  let hooks
  try { ({ hooks } = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))) } catch {
    return false
  }
  return Object.values(hooks || {}).flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .flatMap((group) => (Array.isArray(group && group.hooks) ? group.hooks : []))
    .some((hook) => {
      const script = (String(hook && hook.command).match(SCRIPT) || [])[1]
      return Boolean(script) && fs.existsSync(path.join(dir, script))
    })
}

// Sólo un guard del archivo local trae su instalación; que la sesión esté debajo de ella ya lo decidió el `case`.
function nearer(session, install) {
  const start = install && session && real(session)
  return Boolean(start) && runsHere(start)
}

module.exports = { nearer, opener, quoted }
