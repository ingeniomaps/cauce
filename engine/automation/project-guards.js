'use strict'

// Lo que `automation doctor` dice de los guards que declara el proyecto en `guards` (caso 428). El motor los corre
// en cualquier runner, así que los dos modos de fallo están en la instalación y no en el guard: uno que no está o no
// se puede ejecutar frena cada llamada de su evento, y uno que además sigue registrado en la configuración del runner
// corre dos veces, una por el motor y otra por el runner.

const fs = require('node:fs')
const path = require('node:path')

// Los `command` de una configuración de runner, a cualquier profundidad: Claude y Gemini los anidan distinto.
function commandsOf(config) {
  if (Array.isArray(config)) return config.flatMap(commandsOf)
  if (!config || typeof config !== 'object') return []
  return Object.entries(config).flatMap(([key, value]) => (key === 'command' && typeof value === 'string'
    ? [value] : commandsOf(value)))
}

// El script de un comando, resuelto como lo resuelve el runner: la variable del proyecto es la carpeta donde se abre, y
// una ruta relativa cuelga de ahí. Sin comillas, que la documentación de Claude Code recomienda poner alrededor de la
// variable, y saltando lo que va adelante del script —`env`, un intérprete, sus banderas—: con cualquiera de esas
// formas el doble registro pasaba sin aviso.
const LAUNCHER = /^(?:\S*\/)?(?:env|(?:ba|da|z)?sh|node|python\d*(?:\.\d+)?|ruby|perl)$|^-/
function programOf(command, install) {
  const words = command.replace(/["']/g, '').trim().split(/\s+/)
  const first = words.find((word) => !LAUNCHER.test(word)) || ''
  const expanded = first.replace(/^\$\{?(?:CLAUDE|GEMINI)_PROJECT_DIR\}?/, install)
  return path.resolve(install, expanded)
}

// Suma a las listas de `doctor` lo que encuentra.
function guardProblems(root, installed, target, install, { errors, warnings }) {
  let guards = {}
  try { guards = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')).guards || {} } catch {
    return
  }
  const registered = new Set(commandsOf(installed).map((command) => programOf(command, install)))
  for (const [event, files] of Object.entries(guards)) {
    for (const file of Array.isArray(files) ? files : []) {
      const full = path.resolve(root, file)
      try { fs.accessSync(full, fs.constants.X_OK) } catch {
        errors.push(`guards.${event}: ${file} no existe o no es ejecutable, y el motor frena cada llamada de ese `
          + 'evento hasta que lo esté')
        continue
      }
      if (registered.has(full)) {
        warnings.push(`${target}: ${file} también está registrado acá, y con guards.${event} en ops.config.json `
          + 'corre dos veces. Sacalo de este archivo: el motor ya lo corre en todos los runners')
      }
    }
  }
}

module.exports = { guardProblems }
