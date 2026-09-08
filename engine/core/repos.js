'use strict'

// En qué repositorio vive un servicio, y cuándo se movió por última vez una rama. Vive acá porque lo
// preguntan dos cosas que no se conocen entre sí —preparar un árbol de trabajo y juzgar si un reclamo
// sigue vivo— y la resolución tiene que ser la misma en las dos: escrita dos veces, una copia envejece
// y las dos respuestas dejan de coincidir sin que nada falle.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// La raíz de trabajo que contiene el servicio, resuelta como la resuelve `check` para juzgar si existe.
// Devuelve la raíz del repositorio git, que no siempre es la raíz declarada: `workspaceRoots` puede
// apuntar a un subdirectorio.
function repoOf(opsRoot, service) {
  let config = {}
  try {
    config = JSON.parse(fs.readFileSync(path.join(opsRoot, 'ops.config.json'), 'utf8'))
  } catch { return '' }
  const roots = (Array.isArray(config.workspaceRoots) ? config.workspaceRoots : [])
    .filter((one) => one && one.path)
    .map((one) => path.resolve(opsRoot, one.path))
  const found = roots.find((root) => fs.existsSync(path.join(root, service || '.')))
  if (!found) return ''
  const top = git(found, 'rev-parse', '--show-toplevel')
  return top.status === 0 ? top.stdout.trim() : ''
}

// La fecha del último commit **propio** de una rama, en AAAA-MM-DD, o vacío si no tiene ninguno. Vacío no
// es un error: una tarea recién tomada todavía no tiene rama, la rama recién creada no tiene commits, y
// un proyecto puede nombrar sus ramas de otra forma. Quien pregunta decide qué hacer con la ausencia.
//
// Lo que hay que excluir es el tronco. Una rama nueva hereda su historia entera, así que preguntar por su
// último commit a secas devuelve el del tronco y **toda rama parece haber avanzado el día que se creó** —
// que es justo lo contrario de lo que esta función existe para medir. El tronco es la rama en la que está
// el árbol principal: los worktrees se crean desde ahí y ahí se queda.
function lastCommit(repo, branch) {
  if (!repo) return ''
  const actual = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
  const tronco = actual.status === 0 ? actual.stdout.trim() : ''
  const args = tronco && tronco !== branch
    ? ['log', '-1', '--format=%cs', branch, '--not', tronco, '--']
    : ['log', '-1', '--format=%cs', branch, '--']
  const shown = git(repo, ...args)
  return shown.status === 0 ? shown.stdout.trim() : ''
}

module.exports = { repoOf, lastCommit }
