'use strict'

// Qué le falta a la superficie de automatización de una instancia, y nada más. Se mira sin tocar: `check`
// enumera y devuelve; quien decide qué hacer con esa lista es el CLI.
//
// Vive aparte de `index.js` porque no comparte nada con los otros tres verbos. Medido antes de partir:
// `doctor`, `install` y `uninstall` se apoyan en los mismos ayudantes —`deliveryKey`, `deliveryState`,
// `removeFile`, `probeBridge`—, y este par no toca ninguno. Lo único que comparte son los imports, que es
// lo que comparte cualquier archivo del directorio.
//
// La partición estaba anotada como deuda desde que el archivo cruzó las 500 líneas con el aviso de
// sidecar del caso 138, estando en 499.

const fs = require('node:fs')
const path = require('node:path')
const O = require('../core/ownership')
const {
  RUNNER_NAMES, packagedAutomation, runnerManifest, runnerPaths, resolveItem, runnerConfig,
} = require('./runners')
const { expectedHooks, staleHooks } = require('./hooks')
const { hasHooks } = require('./config')

function check(root) {
  const errors = []
  const hookDir = path.join(root, 'automatization', 'hooks')
  if (!fs.existsSync(path.join(root, 'automatization', 'AGENTS.md'))) {
    errors.push('falta automatization/AGENTS.md')
  }
  for (const name of expectedHooks()) {
    const file = path.join(hookDir, name)
    if (!fs.existsSync(file)) errors.push(`falta automatization/hooks/${name}`)
    else if (!(fs.statSync(file).mode & 0o111)) {
      errors.push(`automatization/hooks/${name} no es ejecutable`)
    }
  }
  // El motor puede venir de la dependencia npm o del propio repositorio, y la cascada la resuelve
  // `packagePath`. Eran tres: la copia vendorizada se retiró en 0.10.0 y esta línea la sobrevivió.
  if (!O.engineAt(root, path.join('hooks', 'run.js'))) {
    errors.push('falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops')
  }
  const workflows = [
    'autobuild.js',
    'flow.js',
    path.join('integrations', 'sync.js'),
    path.join('integrations', 'promote.js'),
  ]
  const packaged = packagedAutomation(root)
  for (const name of workflows) {
    if (!packaged || !fs.existsSync(path.join(packaged, 'workflows', name))) {
      errors.push(`falta automatization/workflows/${name}: corré "npm install" en la raíz del repo ops`)
    }
  }
  // Un choque que `upgrade` conservó (caso 110) también queda distinto del paquete, y mandarlo a correr
  // `upgrade` era una vuelta sin salida: lo conservaría otra vez. Se dice qué es y qué hacer.
  const collisions = new Set(O.collisions(root))
  for (const { file, edited } of staleHooks(root)) {
    if (collisions.has(`automatization/hooks/${file}`)) {
      errors.push(`automatization/hooks/${file}: es tuyo y se llama como uno que trae el paquete, así que el `
        + "del paquete no está instalado; renombrá el tuyo y corré `cauce upgrade`")
      continue
    }
    errors.push(edited
      ? `automatization/hooks/${file}: lo editaste y es del toolkit; agregá un guard propio al lado `
        + 'o descartá tu cambio con `cauce upgrade --force`'
      : `automatization/hooks/${file}: quedó atrás del paquete y ya no protege lo que dice; `
        + 'corré `cauce upgrade` antes de instalar el runner')
  }
  for (const name of RUNNER_NAMES) validateRunnerManifest(root, name, errors)
  return errors
}

function validateRunnerManifest(root, name, errors) {
  try {
    const runner = runnerManifest(root, name)
    if (runner.name !== name || runner.schemaVersion !== 1
      || !runner.config || !runner.capabilities) {
      errors.push(`${name}: manifest incompleto`)
      return
    }
    const paths = runnerPaths(root, name, runner)
    const config = runnerConfig(paths, root)
    if (runner.capabilities.nativeHooks && !hasHooks(config)) {
      errors.push(`${name}: declara hooks nativos pero no los configura`)
    }
    for (const item of [...(runner.instructions || []), ...(runner.artifacts || [])]) {
      const resolved = resolveItem(paths, root, name, item)
      if (!fs.existsSync(resolved.source)) errors.push(`${name}: falta ${item.source}`)
    }
  } catch (error) {
    errors.push(`${name}: configuración inválida (${error.message})`)
  }
}


module.exports = { check }
