'use strict'

// A qué `git worktree` de la instancia pertenece una ruta que cae fuera de la raíz de la sesión. Garantiza una
// respuesta por el repositorio y no por la forma: una carpeta ajena con un `planning/` propio no es la instancia.
// Pregunta a git sólo con la ruta ya afuera, porque corre en cada escritura.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { realPath } = require('./input')

function repositoryOf(dir) {
  const result = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--show-toplevel',
    '--git-common-dir'], { encoding: 'utf8' })
  if (result.status !== 0) return null
  const [top, common] = result.stdout.trim().split('\n')
  return { top: realPath(top), common: realPath(common) }
}

function existingParent(file) {
  let dir = path.dirname(file)
  while (!fs.existsSync(dir) && dir !== path.dirname(dir)) dir = path.dirname(dir)
  return dir
}

// La raíz del worktree que contiene `file`, o '' si no es de la instancia. Dentro de `root` no pregunta, salvo con
// `inside`: quien cuida el permiso de push paga esa consulta, porque un worktree también puede vivir adentro.
function instanceTreeOf(root, file, { inside = false } = {}) {
  const relative = path.relative(root, file)
  if (!inside && !relative.startsWith('..') && !path.isAbsolute(relative)) return ''
  const instance = repositoryOf(root)
  const found = instance && repositoryOf(existingParent(file))
  return found && found.common === instance.common && found.top !== instance.top ? found.top : ''
}

// La ruta con sus enlaces resueltos, también si el archivo todavía no existe.
const resolved = (file) => path.join(realPath(existingParent(file)), path.relative(existingParent(file), file))

module.exports = { instanceTreeOf, resolved }
