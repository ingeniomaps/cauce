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
const R = require('../core/repos')

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

function ignoreLink(tree, link) {
  if (!inside(tree, link)) return
  const common = git(tree, 'rev-parse', '--git-common-dir')
  if (common.status !== 0) return
  const file = path.join(path.resolve(tree, common.stdout.trim()), 'info', 'exclude')
  const entry = `/${path.relative(tree, link).split(path.sep).join('/')}`
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (current.split('\n').includes(entry)) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`)
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

  // Una línea borrada a mano sigue listada: sin retirarla, se daba por reusada y quedaba a medias. Se retira
  // ésa y no se poda todo, que le quitaría el registro a cualquier otro árbol que hoy no esté.
  if (!fs.existsSync(where.tree)) git(root, 'worktree', 'remove', '--force', where.tree)
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
  // El enlace al motor no es del proyecto, y el `.gitignore` de la instancia no siempre lo cubre: un patrón
  // con barra final ignora un directorio y un enlace no lo es para git, así que la línea nacía con
  // `node_modules` sin trackear. Se anota en el `exclude` del repositorio, que comparten sus árboles y no
  // viaja (caso 275).
  ignoreLink(where.tree, path.join(where.ops, 'node_modules'))
  let config = {}
  try { config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch { config = {} }
  const roots = (config.workspaceRoots || []).map((one) => one.path || '').filter(Boolean)
  const linked = roots
    .filter((relative) => linkIfMissing(path.resolve(where.ops, relative), path.resolve(root, relative)))

  // Los mismos runners que tiene la instancia, instalados desde la línea: su configuración queda en la carpeta
  // de la línea y apunta a su árbol.
  const runners = A.RUNNER_NAMES.filter((runner) => {
    try { return fs.existsSync(A.runnerPaths(root, runner, A.runnerManifest(root, runner)).configTarget) } catch {
      return false
    }
  })
  const quiet = { log: () => {}, error: () => {} }
  // Si el runner no se puede instalar, la línea no está armada: quedó el árbol, con los recorridos y los
  // guards de otra carpeta o sin ninguno. Se dice, en vez de contestar que quedó (caso 363).
  //
  // `ownFolder`: la configuración que una línea embebida trae por git puede llevar los guards apuntando a la
  // carpeta original —la de Codex lleva la ruta escrita—. La instalación se niega a mover guards de una
  // carpeta de sesión que otro árbol comparte; la de una línea es sólo suya, y moverlos acá es el punto.
  for (const runner of runners) {
    try { A.install(where.ops, runner, quiet, { ownFolder: true }) } catch (error) {
      return fail(`${error.message}\n\nEl árbol se creó en ${where.tree}, pero la línea ${name} quedó sin su `
        + `runner (${runner}): sus recorridos y sus guards no apuntan a ella. Resolvé lo de arriba en la `
        + 'instancia y repetí este comando.', REFUSED)
    }
  }

  // Una raíz que es la carpeta que contiene a la instancia —`..`, con un repositorio por servicio adentro— no
  // se puede enlazar entera: su lugar en la línea es la propia carpeta de la línea, que ya existe. Se enlazan
  // sus hijos, y con ellos viaja también lo que la sesión lee de esa carpeta y no es una raíz. La instancia
  // no se enlaza porque ya está: es el worktree. Y queda afuera la configuración de todo runner, también la
  // del que la instancia no tiene instalado: enlazada, instalarlo después desde la línea escribiría en la
  // carpeta original y movería los guards de la otra sesión (caso 218). Va después de instalar para no
  // pisar lo que la instalación escribe (caso 263).
  const configOf = (runner) => {
    try {
      const target = A.runnerPaths(root, runner, A.runnerManifest(root, runner)).configTarget
      return path.relative(installRoot(root), target).split(path.sep)[0]
    } catch { return '' }
  }
  for (const relative of roots) {
    const target = path.resolve(where.ops, relative)
    const original = path.resolve(root, relative)
    if (target === original || !inside(target, where.tree) || !fs.existsSync(original)) continue
    const skip = new Set(A.RUNNER_NAMES.map(configOf))
    for (const name of fs.readdirSync(original).sort()) {
      if (!skip.has(name) && linkIfMissing(path.join(target, name), path.join(original, name))) {
        linked.push(path.join(relative, name))
      }
    }
  }

  // La raíz que el repositorio registra como enlace de git nace vacía en la línea, y `check` lo dice; acá se
  // repite porque éste es el momento en que todavía se puede corregir antes de abrir la sesión (caso 358).
  // Avisa y no se niega: no se conoce una instancia con esa disposición, y a quien la tenga le frenaría lo
  // que hoy le anda a medias.
  const warnings = R.nestedRootWarnings(root)
  const report = {
    home: installRoot(where.ops), tree: where.tree, branch: where.branch, reused, engine, linked, runners, warnings,
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  console.log(`${reused ? '=' : '✓'} ${where.tree}  (${where.branch})`)
  if (linked.length) console.log(`  enlazados al original: ${linked.join(', ')}`)
  console.log(`  runners: ${runners.join(', ') || '(ninguno instalado en la instancia)'}`)
  console.log(`Abrí la sesión de esta línea en ${report.home}: ahí está su configuración, apuntando a su árbol.`)
  for (const warning of warnings) console.log(`⚠ ${warning}`)
}

module.exports = { line, layout }
