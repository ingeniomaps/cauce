'use strict'

// Una línea de trabajo: un worktree del repositorio de la instancia con su propia carpeta de sesión (caso 218).
//
// La configuración del runner vive en la raíz de la sesión, y en sidecar esa raíz es la carpeta que contiene a
// la instancia: todos los worktrees la comparten, así que todas las sesiones corrían los guards de un solo
// árbol, y instalar desde otro los movía para todas. Una línea se arma al lado, en `<raíz>-<nombre>/`, con lo
// que su sesión necesita para no depender del árbol principal: su worktree, su motor y su configuración.
//
// El motor se enlaza al `node_modules` del árbol principal en vez de reinstalarse: es el mismo paquete
// instalado —su versión la fija la instalación, no la rama— y un worktree no lo trae porque está
// gitignoreado. Los repositorios del producto que viven fuera de la instancia se enlazan a los originales:
// separar el trabajo dentro del producto es de `ops worktree`, por tarea.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const A = require('../automation')
const { installRoot } = require('../automation/runners')
const { fail, opsRoot, REFUSED, USAGE } = require('./io')
const { BRANCH, NAME } = require('../planning/lines')

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const inside = (base, target) => !path.relative(base, target).startsWith('..')

// Dónde queda cada pieza de la línea. Sólo calcula —no toca el disco— para poder probar los dos modos.
function layout(root, top, name) {
  const install = installRoot(root)
  const home = path.join(path.dirname(install), `${path.basename(install)}-${name}`)
  // Sidecar: el repo de la instancia vive dentro de la carpeta de sesión, y la línea lo replica adentro de la
  // suya. Embebido: la sesión se abre dentro del repo, y la línea es un worktree hermano del repo entero.
  const tree = inside(install, top)
    ? path.join(home, path.relative(install, top))
    : path.join(path.dirname(top), `${path.basename(top)}-${name}`)
  return { install, home, tree, ops: path.join(tree, path.relative(top, root)), branch: `${BRANCH}${name}` }
}

function linkIfMissing(link, target) {
  if (fs.existsSync(link) || !fs.existsSync(target)) return false
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.symlinkSync(fs.realpathSync(target), link, 'dir')
  return true
}

function line(dir, name, cli) {
  // Real, porque git devuelve rutas reales: mezcladas con una que pasa por un enlace, la línea caía en la
  // carpeta compartida en vez de al lado.
  const given = opsRoot(dir)
  const root = fs.existsSync(given) ? fs.realpathSync(given) : given
  if (!name || !NAME.test(name)) {
    return fail('Falta el nombre, en minúsculas y con guiones. `ops line <ops-root> <nombre>`', USAGE)
  }
  const repo = git(root, 'rev-parse', '--show-toplevel')
  if (repo.status !== 0) return fail(`${root} no está en un repositorio git: una línea es un worktree de él.`, REFUSED)
  const where = layout(root, repo.stdout.trim(), name)

  // Una línea borrada a mano sigue listada como prunable: sin podar, se daba por reusada y quedaba a medias.
  if (!fs.existsSync(where.tree)) git(root, 'worktree', 'prune')
  const listed = git(root, 'worktree', 'list', '--porcelain').stdout || ''
  const reused = listed.split('\n').some((entry) => entry.trim() === `worktree ${where.tree}`)
  if (!reused) {
    if (fs.existsSync(where.tree)) {
      return fail(`${where.tree} ya existe y no es un worktree de esta instancia.`, REFUSED)
    }
    const hasBranch = git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${where.branch}`).status === 0
    const args = hasBranch ? [where.tree, where.branch] : ['-b', where.branch, where.tree]
    const added = git(root, 'worktree', 'add', ...args)
    if (added.status !== 0) return fail(`git worktree add falló: ${(added.stderr || '').trim()}`, REFUSED)
  }

  // El motor, donde `packagePath` lo busca: bajo la raíz ops o un nivel arriba.
  const engine = linkIfMissing(path.join(where.ops, 'node_modules'), path.join(root, 'node_modules'))
    || linkIfMissing(path.join(path.dirname(where.ops), 'node_modules'), path.join(path.dirname(root), 'node_modules'))
  let config = {}
  try { config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch { config = {} }
  const linked = (config.workspaceRoots || []).map((one) => one.path || '').filter(Boolean)
    .filter((relative) => linkIfMissing(path.resolve(where.ops, relative), path.resolve(root, relative)))

  // Los mismos runners que tiene la instancia, instalados desde la línea: su configuración queda en la carpeta
  // de la línea y apunta a su árbol.
  const runners = A.RUNNER_NAMES.filter((runner) => {
    try { return fs.existsSync(A.runnerPaths(root, runner, A.runnerManifest(root, runner)).configTarget) } catch {
      return false
    }
  })
  const quiet = { log: () => {}, error: () => {} }
  for (const runner of runners) A.install(where.ops, runner, quiet)

  const report = {
    home: installRoot(where.ops), tree: where.tree, branch: where.branch, reused, engine, linked, runners,
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  console.log(`${reused ? '=' : '✓'} ${where.tree}  (${where.branch})`)
  if (linked.length) console.log(`  enlazados al original: ${linked.join(', ')}`)
  console.log(`  runners: ${runners.join(', ') || '(ninguno instalado en la instancia)'}`)
  console.log(`Abrí la sesión de esta línea en ${report.home}: ahí está su configuración, apuntando a su árbol.`)
}

module.exports = { line, layout }
