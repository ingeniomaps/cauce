'use strict'

// Lo que un runner necesita escrito fuera de su configuración para que sus guards alcancen: el bloque que abre `.git`
// en el sandbox de Codex (`sandbox.js`) y los hooks de una sesión de Claude Code abierta en una subcarpeta
// (`subfolder-hooks.js`). `install`, `uninstall` y `doctor` los tratan juntos.

const SB = require('./sandbox')
const SH = require('./subfolder-hooks')

function install(root, name, paths, runner, output) {
  SB.install(root, name, paths, runner, output)
  SH.install(root, paths, runner, name, output)
}

function remove(root, paths, runner, name, output) {
  if (SB.remove(paths, runner)) output.log(`✓ ${name}: ${runner.sandbox.target} sin el bloque de Cauce`)
  if (SH.remove(root, paths, runner)) output.log(`✓ ${name}: ${runner.subfolderConfig} sin los guards de Cauce`)
}

const problems = (root, paths, runner) => [...SB.problems(root, paths, runner), ...SH.problems(root, paths, runner)]

module.exports = { install, remove, problems, coversSubfolders: SH.covers }
