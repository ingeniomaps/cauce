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

// Cuánto del trabajo que entró al repositorio quedó registrado. Devuelve, por raíz, los commits que
// ninguna entrada de DONE nombra desde la fecha que se le pase.
//
// Existe porque el número no se podía tener: sacarlo pedía cruzar a mano los `commit:` de `planning/done`
// contra la historia de cada repositorio. Hecho así sobre una instancia real dio **312 commits y 75
// registrados**, y el desglose de los que faltaban no era trabajo suelto: 69 `feat` y 51 `fix` de 173
// (caso 082).
//
// Se cuenta desde una fecha y no desde el principio a propósito: contar toda la historia da una deuda que
// nunca baja y que se termina leyendo como decorado. Desde la última tarea cerrada, en cambio, el número
// vuelve a cero cada vez que el flujo se cierra, y lo que queda visible es la deriva de ahora.
//
// Los merges quedan afuera: no son trabajo, son la forma de integrarlo.
function unrecordedCommits(repo, since, recorded) {
  if (!repo || !since) return []
  // La fecha se compara acá y no con `--since`, y eso lo encontró una prueba: `--since` **poda la
  // caminata**, así que un commit con fecha vieja en la punta esconde todo lo que tiene detrás. Con un
  // historial reescrito o un `commit --date` la cuenta daba cero sobre un repositorio lleno.
  const log = git(repo, 'log', '--no-merges', '--date=short', '--format=%h %ad %s')
  if (log.status !== 0) return []
  const conocidos = new Set([...recorded].map((sha) => String(sha).slice(0, 7)))
  return log.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((line) => line.slice(8, 18) >= since)
    .filter((line) => !conocidos.has(line.slice(0, 7)))
}

// Cuánto del trabajo que entró a los repositorios quedó registrado, desde la última tarea cerrada. Avisa
// y no falla, por lo mismo que el resto de esta familia: es un hecho del pasado que no se arregla
// editando nada, y el único camino al verde sería escribir entradas de memoria.
//
// La ventana arranca en la entrada más reciente y no en la primera: contar toda la historia da una deuda
// que nunca baja y que se lee como decorado. Así el número vuelve a cero cada vez que se cierra una tarea,
// y lo que queda a la vista es la deriva de ahora. Comprobado sobre una instancia real: **0 desde la
// última tarea cerrada, 54 desde dos semanas antes** — el día que tuvo 64 commits y ninguna entrada.
//
// Y no dice cuántos *deberían* tener entrada, porque eso no se sabe desde acá: lo dice el desglose, y en
// la instancia medida 120 de 173 eran `feat` o `fix` (caso 082).
function coverageWarnings(opsRoot, done) {
  const fechas = done.entries.map((entry) => entry.fecha).filter(Boolean).sort()
  const desde = fechas[fechas.length - 1]
  if (!desde) return []
  const recorded = new Set()
  for (const entry of done.entries) {
    for (const sha of String(entry.commit || '').matchAll(/\b[0-9a-f]{7,40}\b/g)) recorded.add(sha[0])
  }
  const warnings = []
  for (const repo of reposFor(opsRoot, '.')) {
    const sueltos = unrecordedCommits(repo, desde, recorded)
    if (!sueltos.length) continue
    warnings.push(`${path.basename(repo)}: ${sueltos.length} commit(s) desde ${desde} que ninguna `
      + 'entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001)')
  }
  return warnings
}

module.exports = { reposFor, repoOf, lastCommit, coverageWarnings }
