'use strict'

// La copia de un plugin registrada para todo el usuario, cuando el runner ya descubre la del proyecto. `agy` 1.4.0
// carga el plugin del `.agents/` del proyecto sin registrarlo, y una copia en `~/.gemini/config/plugins/cauce` corre
// en toda carpeta que no tenga plugin propio, con la raíz, las reglas y los cargos del proyecto que la registró. Es
// lo contrario de lo que se medía en el caso 201, donde la copia registrada era la única que corría y por eso
// Cauce pedía crearla. Medido con agy 1.4.0 en el caso 392.
//
// El runner declara dónde vive esa copia —`strayCopy` en su manifiesto— y cómo se quita. Sin esa declaración no
// hay nada que mirar.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Qué sobra fuera de esta instalación. No se borra desde acá: es configuración del usuario, fuera del proyecto. Y
// se mira que sea un puente de Cauce: un plugin ajeno que se llame igual no es asunto de este doctor.
function registrationProblems(paths, runner) {
  return [...strayProblems(paths, runner), ...trustProblems(paths, runner)]
}

function strayProblems(paths, runner) {
  const stray = runner.strayCopy
  if (!stray) return []
  const dir = stray.path.replace(/^~(?=\/|$)/, os.homedir())
  let bridge = ''
  try { bridge = fs.readFileSync(path.join(dir, 'hook.js'), 'utf8') } catch { return [] }
  if (!bridge.includes('Cauce')) return []
  return [`hay una copia del plugin registrada para todo el usuario en ${dir}: ${runner.command} la corre en toda `
    + 'carpeta que no tenga plugin propio, con la raíz y las reglas del proyecto que la registró. Este proyecto no '
    + `la necesita, porque ${runner.command} descubre el plugin de ${paths.install}. Quitala con `
    + `"${stray.remove}".`]
}

// Los hooks que el runner no corre hasta que una persona los confía (caso 434). Codex guarda la confianza en su
// `config.toml`, una entrada `hooks.state` por hook —`<hooks.json>:<evento>:<grupo>:<hook>`—, y un hook sin la suya
// queda registrado y no corre: en `codex exec` no avisa nada, y la sesión trabaja sin un solo guard. Medido con
// `codex-cli` 0.162.1. Que el `trusted_hash` de la entrada coincida con el archivo de hoy no se mira: cómo lo calcula
// Codex no está medido, y afirmarlo daría por confiado un hook que no lo está.
function trustProblems(paths, runner) {
  const trust = runner.hookTrust
  if (!trust) return []
  const home = process.env[trust.home] || trust.fallback.replace(/^~(?=\/|$)/, os.homedir())
  let state = ''
  try { state = fs.readFileSync(path.join(home, trust.config), 'utf8') } catch { /* sin archivo, nada está confiado */ }
  const trusted = new Set([...state.matchAll(/^\[hooks\.state\."([^"]+)"\]/gm)].map((match) => match[1]))
  let installed = {}
  try { installed = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8')).hooks || {} } catch { return [] }
  const snake = (event) => event.replace(/[A-Z]/g, (letter, at) => `${at ? '_' : ''}${letter.toLowerCase()}`)
  const keyOf = (event, at, index) => `${paths.configTarget}:${snake(event)}:${at}:${index}`
  const untrusted = Object.entries(installed).flatMap(([event, groups]) => (Array.isArray(groups) ? groups : [])
    .flatMap((group, at) => (group.hooks || []).map((_, index) => keyOf(event, at, index))))
    .filter((key) => !trusted.has(key))
  if (!untrusted.length) return []
  return [`${untrusted.length} hook(s) de ${paths.configTarget} sin confiar en ${path.join(home, trust.config)}: `
    + `${runner.command} no los corre, y sin ellos no corre ningún guard de Cauce. ${trust.trust}`]
}

module.exports = { registrationProblems }
