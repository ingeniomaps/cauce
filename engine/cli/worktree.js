'use strict'

// Dónde trabaja un agente. Prepara un árbol de trabajo por tarea con `git worktree`, que es git de base:
// no hace falta instalar nada, y sobre todo **no clona el repositorio**. Un worktree comparte el mismo
// `.git`, el mismo historial y los mismos objetos; lo único que materializa es un segundo directorio de
// archivos, fijado a su rama.
//
// Esa es la propiedad que importa con varios agentes: cada uno queda en su rama y **nadie hace checkout
// nunca**, que es lo que pisaría el trabajo del otro dentro de un único directorio compartido.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ST = require('../planning/state')
const CL = require('../planning/claims')
const R = require('../core/repos')
const O = require('../core/ownership')
const { treeOf } = require('../core/task-trees')
const { fail, planningRoot, USAGE, REFUSED } = require('./io')

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// El árbol que ya existe para esa rama, si existe. `--porcelain` lista bloques de `worktree <ruta>` y
// `branch refs/heads/<nombre>`, y se lee así para no depender del formato humano, que cambia.
function existing(repo, branch) {
  const listed = git(repo, 'worktree', 'list', '--porcelain')
  if (listed.status !== 0) return ''
  let current = ''
  for (const line of listed.stdout.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice(9).trim()
    if (line.trim() === `branch refs/heads/${branch}`) return current
  }
  return ''
}

function worktree(dir, slug, cli) {
  const root = planningRoot(dir)
  if (!slug) return fail('Falta el slug. `ops worktree <planning-dir> <tarea>`', USAGE)
  const state = ST.snapshot(root)
  const task = state.milestones.flatMap((milestone) => milestone.tasks).find((one) => one.slug === slug)
  if (!task) return fail(`${slug} no está en BACKLOG: sólo se prepara trabajo ya promovido.`, USAGE)

  // No reserva —eso es `claim`— pero se niega a montar sobre lo de otro: preparar un árbol para una
  // tarea ajena es trabajo que se va a tirar, y el aviso cuesta menos que descubrirlo después.
  const taken = state.claims.find((one) => one.slug === slug)
  if (taken && taken.runner !== CL.runner()) {
    return fail(`${slug} la tomó ${taken.owner}; preparar un árbol para su tarea no ayuda a nadie.`, REFUSED)
  }

  const candidatos = R.reposFor(path.join(root, '..'), task.service)
  if (candidatos.length > 1) {
    return fail(`${task.service || '.'} existe en más de un repositorio (${candidatos.join(', ')}), así que `
      + 'no puedo saber cuál. Escribí un `service:` que sólo exista en uno.', USAGE)
  }
  const repo = candidatos[0]
  if (!repo) {
    return fail(`no encontré el repositorio de ${task.service || '(sin service)'}: revisá workspaceRoots `
      + 'en ops.config.json y que la ruta del servicio exista.', USAGE)
  }

  const branch = CL.branchOf(slug)
  // Un árbol borrado a mano sigue listado: sin retirarlo, se lo daba por existente. Se retira ése y no se
  // poda todo, que le quitaría el registro a cualquier otro árbol que hoy no esté —un volumen desmontado—.
  const listed = existing(repo, branch)
  if (listed && !fs.existsSync(listed)) git(repo, 'worktree', 'remove', '--force', listed)
  const already = listed && fs.existsSync(listed) ? listed : ''
  // El árbol queda al lado del repositorio **tal como lo ve la sesión**. En la carpeta de una línea el
  // producto es un enlace al original: al lado del original, el árbol caía fuera de las raíces de la línea
  // —sus guards de límites frenaban cada escritura— y dentro de la carpeta que comparten las demás
  // (caso 274). `seen` es dónde vive el servicio según la instancia; `anchor`, el tramo de esa ruta que es
  // el repositorio.
  const seen = R.serviceDirs(path.join(root, '..'), task.service).filter((dir) => fs.existsSync(dir))
    .find((dir) => !path.relative(repo, fs.realpathSync(dir)).startsWith('..')) || repo
  let anchor = seen
  while (fs.realpathSync(anchor) !== repo && path.dirname(anchor) !== anchor) anchor = path.dirname(anchor)
  if (fs.realpathSync(anchor) !== repo) anchor = repo
  const expected = treeOf(anchor, slug)
  const target = already || expected
  // El árbol de esa rama puede existir en otro lado: armado a mano, o movido. Ahí los guards no lo abren
  // —abren el lugar donde este comando lo arma, y lo que el proyecto declaró—, así que entregarlo sería dar
  // por bueno un árbol donde cada escritura se frena. El checkout principal con la rama puesta sí vale.
  // Un enlace puesto en ese lugar tampoco: los guards abren la carpeta, no adonde lleve.
  const declared = [path.join(root, '..'), ...R.declaredRoots(path.join(root, '..')).map((one) => one.dir)]
    .filter((base) => fs.existsSync(base)).map((base) => fs.realpathSync(base))
  const within = (dir) => dir === repo || declared.some((base) => !path.relative(base, dir).startsWith('..'))
  const inPlace = fs.existsSync(expected) && !fs.lstatSync(expected).isSymbolicLink()
    && fs.realpathSync(expected) === (already && fs.realpathSync(already))
  if (already && !inPlace && !within(fs.realpathSync(already))) {
    return fail(`la rama ${branch} ya tiene un árbol en ${already}, que no es donde se arma el de esta tarea `
      + `(${expected}) ni está dentro de lo que el proyecto declaró: los guards no dejarían escribir ahí. `
      + `Movelo a ese lugar con git worktree move, o retiralo con git worktree remove.`, REFUSED)
  }
  // Dónde trabajar adentro del árbol: el mismo tramo que separa al servicio de la raíz de su repositorio.
  const work = path.join(target, path.relative(anchor, anchor === repo && seen !== repo
    ? fs.realpathSync(seen) : seen))
  if (!already) {
    if (fs.existsSync(target)) return fail(`${target} ya existe y no es un árbol de esta rama.`, REFUSED)
    const hasBranch = git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0
    const args = hasBranch ? ['worktree', 'add', target, branch] : ['worktree', 'add', '-b', branch, target]
    const added = git(repo, ...args)
    if (added.status !== 0) return fail(`git worktree add falló: ${(added.stderr || '').trim()}`, REFUSED)
  }
  if (cli.has('--json')) {
    return console.log(JSON.stringify({
      path: target, work, branch, repo, runner: target, reused: Boolean(already),
    }))
  }
  console.log(`${already ? '=' : '✓'} ${target}  (${branch})`)
  // Los guards abren el árbol de una tarea reclamada. Sin reclamo queda cerrado si cae fuera de las raíces.
  if (!taken) console.log(`  ⚠ ${slug} no está reclamada: los guards abren el árbol cuando lo esté (ops claim).`)
  // En `embedded` la instancia vive dentro del repo, así que cada árbol se lleva su propia copia de
  // `planning/` — o ninguna, si todavía no se commiteó—. Para un agente solo eso funciona; para varios
  // deja de haber coordinación, porque los reclamos de uno no los ve el otro hasta mergear. Se avisa y no
  // se frena: usar un árbol por rama sin equipo es legítimo.
  if (O.mode(path.join(root, '..')) === 'embedded') {
    console.log('  ⚠ la instancia vive dentro del repo, así que este árbol lleva su propia copia de '
      + 'planning/: los reclamos no se ven entre árboles hasta mergear. Para varios agentes, mode: sidecar.')
  }
  // El id del runner y la ruta son la misma cosa a propósito: el árbol es lo que distingue a un agente
  // de otro en una máquina, así que darlo hecho evita el modo de fallo que deja a los dos con el mismo.
  console.log(`  export CAUCE_RUNNER=${target}`)
  console.log(`  node tools/ops.js claim ${path.relative(process.cwd(), root) || '.'} ${slug}`)
}

module.exports = { worktree }
