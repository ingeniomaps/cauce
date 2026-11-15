'use strict'

// Un guard que llega desde el `settings.local.json` de la raíz git (`engine/automation/subfolder-hooks.js`) corre en
// toda sesión abierta debajo de su instalación. Si entre la carpeta de la sesión y esa instalación hay otra de Cauce
// que de verdad cubre la sesión —una instancia dentro de otra, como un monorepo con una embebida en la raíz y otra en
// un paquete—, la sesión es de la más cercana, y éste se retira: es la misma regla con que los guards encuentran su
// instancia.
//
// Cubrir es que sus guards corran de verdad, y cada fuente corre en un lugar: en la carpeta misma, su `settings.json`;
// debajo de ella, sus entradas del `settings.local.json`. En las dos el script al que apuntan tiene que existir. Un
// `settings.json` copiado a una subcarpeta, o las entradas de una instancia que ya no está, nombran guards que no
// corren: retirarse ahí dejaba la sesión sin ninguno.

const fs = require('node:fs')
const path = require('node:path')

const quoted = (text) => `'${text.replace(/'/g, `'\\''`)}'`
// El comienzo de cada entrada del `settings.local.json`: compara la carpeta de la sesión por su ruta real.
const opener = (install) => `case "$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P)" in ${quoted(install)}/*) `

const real = (dir) => {
  try { return fs.realpathSync(dir) } catch { return '' }
}

const commandsOf = (file) => {
  try {
    const { hooks } = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Object.values(hooks || {}).flatMap((groups) => (Array.isArray(groups) ? groups : [])
      .flatMap((group) => (Array.isArray(group && group.hooks) ? group.hooks : []))
      .map((hook) => String(hook && hook.command)))
  } catch { return [] }
}

// La raíz git que contiene la instalación, que es donde está el `settings.local.json`.
function repoOf(dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    if (path.dirname(current) === current) return ''
  }
}

const SCRIPT = /^(\/\S*\/automatization\/hooks\/guard-[\w-]+\.sh)/

// Si los guards de la instalación `dir` corren en una sesión abierta en `session`.
function covers(dir, session, local) {
  if (dir === session) {
    return commandsOf(path.join(dir, '.claude', 'settings.json')).some((command) => {
      const script = (command.replace(/^\$CLAUDE_PROJECT_DIR/, '').match(SCRIPT) || [])[1]
      return command.startsWith('$CLAUDE_PROJECT_DIR/') && Boolean(script) && fs.existsSync(path.join(dir, script))
    })
  }
  const head = `${opener(dir)}CAUCE_SUBFOLDER_OF=${quoted(dir)} ${quoted(dir)}`
  return local.some((command) => {
    const script = command.startsWith(head) && (command.slice(head.length).match(SCRIPT) || [])[1]
    return Boolean(script) && fs.existsSync(path.join(dir, script))
  })
}

function nearer(session, install) {
  const own = install && real(install)
  const start = session && real(session)
  if (!own || !start) return false
  const repo = repoOf(own)
  const local = repo ? commandsOf(path.join(repo, '.claude', 'settings.local.json')) : []
  for (let current = start; current.startsWith(`${own}${path.sep}`); current = path.dirname(current)) {
    if (covers(current, start, local)) return true
  }
  return false
}

module.exports = { nearer, opener, quoted }
