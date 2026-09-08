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
const { fail } = require('./io')

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
  const root = path.resolve(dir || '.')
  if (!slug) return fail('Falta el slug. `ops worktree <planning-dir> <tarea>`', 2)
  const state = ST.snapshot(root)
  const task = state.milestones.flatMap((milestone) => milestone.tasks).find((one) => one.slug === slug)
  if (!task) return fail(`${slug} no está en BACKLOG: sólo se prepara trabajo ya promovido.`, 2)

  // No reserva —eso es `claim`— pero se niega a montar sobre lo de otro: preparar un árbol para una
  // tarea ajena es trabajo que se va a tirar, y el aviso cuesta menos que descubrirlo después.
  const taken = state.claims.find((one) => one.slug === slug)
  if (taken && taken.runner !== CL.runner()) {
    return fail(`${slug} la tomó ${taken.owner}; preparar un árbol para su tarea no ayuda a nadie.`)
  }

  const repo = R.repoOf(path.join(root, '..'), task.service)
  if (!repo) {
    return fail(`no encontré el repositorio de ${task.service || '(sin service)'}: revisá workspaceRoots `
      + 'en ops.config.json y que la ruta del servicio exista.', 2)
  }

  const branch = CL.branchOf(slug)
  const already = existing(repo, branch)
  const target = already || path.join(path.dirname(repo), `${path.basename(repo)}-${slug}`)
  if (!already) {
    if (fs.existsSync(target)) return fail(`${target} ya existe y no es un árbol de esta rama.`)
    const hasBranch = git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0
    const args = hasBranch ? ['worktree', 'add', target, branch] : ['worktree', 'add', '-b', branch, target]
    const added = git(repo, ...args)
    if (added.status !== 0) return fail(`git worktree add falló: ${(added.stderr || '').trim()}`)
  }

  if (cli.has('--json')) {
    return console.log(JSON.stringify({ path: target, branch, repo, runner: target, reused: Boolean(already) }))
  }
  console.log(`${already ? '=' : '✓'} ${target}  (${branch})`)
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
