'use strict'

// En qué repositorio vive un servicio, y cuándo se movió por última vez una rama. Vive acá porque lo
// preguntan dos cosas que no se conocen entre sí —preparar un árbol de trabajo y juzgar si un reclamo
// sigue vivo— y la resolución tiene que ser la misma en las dos: escrita dos veces, una copia envejece
// y las dos respuestas dejan de coincidir sin que nada falle.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// Los repositorios cuyo árbol contiene el servicio, resuelto como lo resuelve `check` para juzgar si
// existe. Devuelve la raíz git de cada uno, que no siempre es la raíz declarada: `workspaceRoots` puede
// apuntar a un subdirectorio.
//
// Devuelve una lista y no el primero porque con varias raíces la respuesta puede ser ambigua: un
// `service: .` existe en todas, y un `src` puede existir en dos. Elegir el primero da una respuesta
// plausible y equivocada —un árbol de trabajo en el repositorio que no era— sin que nada lo diga.
function reposFor(opsRoot, service) {
  let config = {}
  try {
    config = JSON.parse(fs.readFileSync(path.join(opsRoot, 'ops.config.json'), 'utf8'))
  } catch { return [] }
  return (Array.isArray(config.workspaceRoots) ? config.workspaceRoots : [])
    .filter((one) => one && one.path)
    .map((one) => path.resolve(opsRoot, one.path))
    .filter((root) => fs.existsSync(path.join(root, service || '.')))
    .map((root) => {
      const top = git(root, 'rev-parse', '--show-toplevel')
      return top.status === 0 ? top.stdout.trim() : ''
    })
    .filter(Boolean)
    // Dos raíces del mismo repositorio son un solo repositorio: lo ambiguo es a cuál pertenece el
    // servicio, no cuántas rutas lo contienen.
    .filter((repo, index, todos) => todos.indexOf(repo) === index)
}

// El repositorio del servicio cuando no hay duda. Sin ninguno o con varios devuelve vacío, y quien
// pregunta decide qué decir: para `check` es la degradación ya declarada —mirar sólo la fecha—, y para
// `worktree` es un error que tiene que nombrar los candidatos.
function repoOf(opsRoot, service) {
  const repos = reposFor(opsRoot, service)
  return repos.length === 1 ? repos[0] : ''
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

module.exports = { reposFor, repoOf, lastCommit }
