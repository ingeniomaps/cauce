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
function declaredRoots(opsRoot) {
  let config = {}
  try {
    config = JSON.parse(fs.readFileSync(path.join(opsRoot, 'ops.config.json'), 'utf8'))
  } catch { return [] }
  return (Array.isArray(config.workspaceRoots) ? config.workspaceRoots : [])
    .filter((one) => one && one.path)
    .map((one) => ({ name: one.name, dir: path.resolve(opsRoot, one.path) }))
}

// Un servicio se nombra de dos formas y las dos están en uso: como ruta dentro de una raíz que contiene
// varios repositorios —raíz `..`, `service: api`—, o con el nombre de una raíz que ya es el repositorio
// —raíz `api → ../api`, `service: api`—. Mirando sólo la primera, la segunda buscaba `../api/api` y decía
// que el repositorio no existía (caso 254).
const holds = (root, service) => fs.existsSync(path.join(root.dir, service || '.'))
  || service === root.name || service === path.basename(root.dir)

function reposFor(opsRoot, service) {
  return declaredRoots(opsRoot)
    .filter((root) => holds(root, service))
    // El repositorio se pregunta desde donde vive el servicio y no desde la raíz: una raíz puede ser una
    // carpeta con un repositorio por servicio adentro, y ahí la raíz no es ninguno. Preguntando en la raíz,
    // esa forma contestaba que el repositorio no existía teniéndolo adentro (caso 263).
    .map((root) => {
      const inner = path.join(root.dir, service || '.')
      const from = fs.existsSync(inner) && fs.statSync(inner).isDirectory() ? inner : root.dir
      const top = git(from, 'rev-parse', '--show-toplevel')
      return top.status === 0 ? top.stdout.trim() : ''
    })
    .filter(Boolean)
    // Dos raíces del mismo repositorio son un solo repositorio: lo ambiguo es a cuál pertenece el
    // servicio, no cuántas rutas lo contienen.
    .filter((repo, index, all) => all.indexOf(repo) === index)
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
  const head = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
  const trunk = head.status === 0 ? head.stdout.trim() : ''
  const args = trunk && trunk !== branch
    ? ['log', '-1', '--format=%cs', branch, '--not', trunk, '--']
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
function unrecordedCommits(repo, since, recorded, skip = '') {
  if (!repo || !since) return []
  // La fecha se compara acá y no con `--since`, y eso lo encontró una prueba: `--since` **poda la
  // caminata**, así que un commit con fecha vieja en la punta esconde todo lo que tiene detrás. Con un
  // historial reescrito o un `commit --date` la cuenta daba cero sobre un repositorio lleno.
  // Un commit que sólo toca el planning no es trabajo que el planning tenga que nombrar: es el planning. En
  // una instancia embebida vive en el mismo repositorio, y desde que el recorrido commitea su estado al
  // cerrar cada tarea, ese commit aparecía acá como trabajo sin registrar (caso 270).
  const paths = skip ? ['--', '.', `:(exclude)${skip}`] : []
  const log = git(repo, 'log', '--no-merges', '--date=short', '--format=%h %ad %s', ...paths)
  if (log.status !== 0) return []
  const known = new Set([...recorded].map((sha) => String(sha).slice(0, 7)))
  // El hash y la fecha se leen partiendo por espacios y no por columna: `%h` mide 7 por default y git lo
  // sube solo cuando el repositorio crece —en éste mide 8—, así que una posición fija leía un espacio en
  // vez de la fecha y ningún commit pasaba el filtro. El aviso quedaba mudo sin decirlo, que es la peor
  // forma de que una puerta falle (caso 169).
  return log.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => ({ line, sha: line.split(/\s+/)[0], date: line.split(/\s+/)[1] }))
    .filter((one) => one.date >= since)
    .filter((one) => !known.has(one.sha.slice(0, 7)))
    .map((one) => one.line)
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
  const dates = done.entries.map((entry) => entry.fecha).filter(Boolean).sort()
  const since = dates[dates.length - 1]
  if (!since) return []
  const recorded = new Set()
  for (const entry of done.entries) {
    for (const sha of String(entry.commit || '').matchAll(/\b[0-9a-f]{7,40}\b/g)) recorded.add(sha[0])
  }
  const warnings = []
  for (const repo of reposFor(opsRoot, '.')) {
    const planning = path.relative(repo, path.join(opsRoot, 'planning'))
    const unrecorded = unrecordedCommits(repo, since, recorded, planning.startsWith('..') ? '' : planning)
    if (!unrecorded.length) continue
    warnings.push(`${path.basename(repo)}: ${unrecorded.length} commit(s) desde ${since} que ninguna `
      + 'entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001)')
  }
  return warnings
}

// La fila de `HUMAN_ACTIONS.md` que figura resuelta sin que ningún commit la haya tocado. Ready la rechaza
// —una decisión que nadie dejó escrita es una aprobación autoservida— y `check` no la miraba, así que el
// defecto se descubría en la fase 4 de un recorrido: 1,21 M de tokens en tres paradas, con la puerta en
// verde las tres veces (caso 121).
//
// Se pregunta si **esa** fila, con ese estado, está en el archivo de `HEAD`, línea por línea, y no por la
// palabra `resuelta`. Una que pasó a resuelta sólo en el árbol de trabajo no está ahí.
//
// No se pregunta con el pickaxe, que era la primera forma: `git log -S` busca con una tabla de saltos de
// un byte (`kwset.c`), que con una aguja de más de 256 bytes se desborda y salta por encima de una fila que
// sí está en el commit. Una fila resuelta de verdad es justo la larga, porque lleva la decisión adentro
// (caso 204).
//
// `clean` es la limpieza que ya sufrieron las filas: el parser las lee sin comentarios, así que el archivo
// commiteado tiene que pasar por la misma o una fila con un `<!-- -->` adentro no coincide con su línea.
//
// Sin repositorio, o con el archivo todavía sin commitear, no dice nada: no hay historia contra la cual
// preguntar y el aviso sería inventado. Degrada como el 086 con las migraciones — antes callar de más que
// avisar de más, porque un aviso que salta siempre se termina apagando.
function unrecordedHumanActions(opsRoot, rows, clean) {
  const file = path.join(opsRoot, 'planning', 'HUMAN_ACTIONS.md')
  const top = git(path.dirname(file), 'rev-parse', '--show-toplevel')
  if (top.status !== 0) return []
  const repo = top.stdout.trim()
  const relative = path.relative(repo, file).split(path.sep).join('/')
  const committed = git(repo, 'show', `HEAD:${relative}`)
  if (committed.status !== 0) return []
  const lines = new Set(clean(committed.stdout).split('\n'))
  return rows.filter((row) => row.resolved && !lines.has(row.raw))
    .map((row) => `HUMAN_ACTIONS.md: ${row.task} figura resuelta y ningún commit la registró`)
}

// Qué archivos tocó un commit, buscado en todos los repositorios declarados: una entrada de DONE nombra
// el sha y no el repositorio. Devuelve null si ninguno lo conoce, y quien pregunta decide qué significa.
// `--root` es para que el primer commit de un repositorio también liste lo suyo.
function commitFiles(opsRoot) {
  const repos = reposFor(opsRoot, '.')
  return (sha) => {
    for (const repo of repos) {
      const shown = git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha)
      if (shown.status === 0) return shown.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    }
    return null
  }
}

// Si cada commit citado existe (caso 243): un runner cerró una tarea con un hash fabricado, y el formato lo dejaba
// pasar. Cada ítem trae el sha y, si la traza lo nombra, su repositorio —`(backend-auth@rama)`—, que se busca
// dentro de las raíces: una raíz puede ser una carpeta con varios repositorios, y ahí la raíz no es ninguno.
// Sin nombre, se busca en las raíces que son repositorios. Devuelve, en orden, `found`, `missing` o
// `unchecked` —el repositorio no está en esta máquina, o no hay dónde buscar—: no poder mirar no es lo mismo
// que no encontrar.
//
// Una llamada por repositorio, con todos sus shas por stdin: `check` corre seguido. `cat-file --batch-check`
// acepta shas abreviados y dice el tipo, así que un blob tampoco cuenta como commit (comprobado con git 2.43.0).
function commitStatus(opsRoot, items) {
  const roots = declaredRoots(opsRoot)
  const named = new Map()
  // El nombre es una carpeta dentro de una raíz o el de una raíz que ya es el repositorio: las dos formas
  // de `holds`, y por lo mismo (caso 254).
  const repoOfName = (name) => {
    if (!named.has(name)) {
      named.set(name, roots
        .map((root) => (name === root.name || name === path.basename(root.dir) ? root.dir : path.join(root.dir, name)))
        .find((dir) => fs.existsSync(dir) && git(dir, 'rev-parse', '--show-toplevel').stdout.trim() === dir) || '')
    }
    return named.get(name)
  }
  const plain = reposFor(opsRoot, '.')
  const where = items.map((item) => (item.repo ? [repoOfName(item.repo)].filter(Boolean) : plain))
  const known = new Map()
  for (const repo of [...new Set(where.flat())]) {
    const asked = [...new Set(items.filter((_, index) => where[index].includes(repo)).map((item) => item.sha))]
    const shown = spawnSync('git', ['-C', repo, 'cat-file', '--batch-check=%(objecttype)'],
      { input: `${asked.join('\n')}\n`, encoding: 'utf8' })
    const types = shown.status === 0 ? shown.stdout.split('\n') : []
    asked.forEach((sha, index) => { if ((types[index] || '').trim() === 'commit') known.set(`${repo}\0${sha}`, true) })
  }
  return items.map((item, index) => {
    if (!where[index].length) return 'unchecked'
    return where[index].some((repo) => known.has(`${repo}\0${item.sha}`)) ? 'found' : 'missing'
  })
}

module.exports = { reposFor, repoOf, lastCommit, coverageWarnings, unrecordedHumanActions, commitFiles, commitStatus }
