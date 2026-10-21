'use strict'

// Una línea de trabajo: un nombre y un worktree por cada repositorio del producto que trabaja (caso 394).
//
// La línea vive dentro de la carpeta de sesión, en `lines/<línea>/<repo>/`, y no lleva configuración propia: la
// sesión que la lleva se abre donde siempre, con las mismas reglas, los mismos permisos y la misma instancia.
// Hasta 0.110.0 cada línea era un worktree de la instancia con su propia carpeta de sesión al lado (caso 218),
// y todo lo que vivía en la carpeta original había que replicarlo o enlazarlo: cada cosa que faltaba era un
// caso nuevo, y las que faltaban al final eran las que hacen la gobernanza.
//
// La carpeta de una línea tiene sus árboles y nada más: ni enlaces a los repositorios que no trabaja, ni a sus
// dependencias. Un árbol es un checkout aparte, y que cada línea pruebe lo suyo es la razón de tenerlo.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fail, opsRoot, REFUSED, USAGE } = require('./io')
const LNP = require('../planning/lines')
const LT = require('../core/line-trees')
const { BRANCH, NAME } = LNP

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const real = (dir) => (fs.existsSync(dir) ? fs.realpathSync(dir) : dir)
const isDir = (dir) => {
  try { return fs.statSync(dir).isDirectory() } catch { return false }
}

// El worktree de la instancia que una línea de antes tenía en `line/<nombre>`, o null.
const legacyTree = (root, name) => LNP.worktrees(root).find((one) => one.branch === `${BRANCH}${name}`) || null

// Hasta 0.112.0 una línea enlazaba en su carpeta cada repositorio que no trabajaba, para que un `../shared-lib`
// resolviera igual que desde la carpeta de sesión (caso 394). Casi ningún repositorio lo nombraba, y la carpeta se leía
// como una línea con repositorios que no eran suyos (caso 420): el vecino que un repositorio sí nombra se suma a la
// línea con su propio árbol. Esto saca lo que dejó aquella versión, que es un enlace al mismo lugar de la carpeta de
// sesión, y nada más: ni adonde lleva, ni un enlace que puso otro (R23). Las carpetas que quedan vacías se van con él.
function unlinkSiblings(session, name) {
  const removed = []
  const walk = (relative) => {
    const at = path.join(session, LT.DIR, name, relative)
    for (const entry of (isDir(at) ? fs.readdirSync(at) : []).sort()) {
      const inner = path.join(relative, entry)
      const here = path.join(at, entry)
      const stat = fs.lstatSync(here)
      const before = removed.length
      if (stat.isSymbolicLink() && real(here) === real(path.join(session, inner))) {
        fs.unlinkSync(here)
        removed.push(inner)
      } else if (stat.isDirectory() && !fs.existsSync(path.join(here, '.git'))) {
        walk(inner)
        // Sólo la carpeta que vació esto: una vacía que ya estaba no es de aquella versión.
        if (removed.length > before) try { fs.rmdirSync(here) } catch { /* tiene algo más */ }
      }
    }
  }
  walk('')
  return removed
}

// `lines/` no es del proyecto: si la carpeta de sesión es un repositorio, se anota en su `exclude`, que no
// viaja. Sólo si es la raíz de uno: una carpeta adentro de otro repositorio ajeno no es asunto de la línea.
function ignoreLines(session) {
  const top = git(session, 'rev-parse', '--show-toplevel')
  if (top.status !== 0 || real(top.stdout.trim()) !== real(session)) return
  const common = git(session, 'rev-parse', '--git-common-dir').stdout.trim()
  const file = path.join(path.resolve(session, common), 'info', 'exclude')
  const entry = `/${LT.DIR}/`
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (current.split('\n').includes(entry)) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`)
}

// Un árbol de la línea: el que ya está se reusa, uno borrado a mano se retira del registro y se vuelve a armar,
// y la rama nueva sale de la rama viva del repositorio (caso 395). La que ya existe se usa tal cual: es también
// la salida para montar una línea sobre otra rama a propósito, creándola antes.
function plant(session, name, repo, warnings) {
  const source = path.join(session, repo)
  const tree = LT.treeOf(session, name, repo)
  const branch = `${BRANCH}${name}`
  if (!fs.existsSync(tree)) git(source, 'worktree', 'remove', '--force', tree)
  const reused = registered(source, tree)
  let from = ''
  if (!reused) {
    // `occupied` y no `existsSync`: un enlace roto también ocupa la ruta, y sin verlo el error era el de git, opaco.
    if (occupied(tree)) return { error: `${tree} ya existe y no es un worktree de ${repo}.` }
    const hasBranch = git(source, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0
    if (!hasBranch) from = LNP.startPoint(source)
    const args = hasBranch ? [tree, branch] : ['-b', branch, tree, ...(from ? [from] : [])]
    fs.mkdirSync(path.dirname(tree), { recursive: true })
    const added = git(source, 'worktree', 'add', ...args)
    if (added.status !== 0) {
      const error = `git worktree add falló en ${repo}: ${(added.stderr || '').trim()}`
      // Git puede dejar el árbol armado y salir con error: un `post-checkout` que falla le pasa su código. Ese árbol
      // está registrado, así que no se toca —borrarlo a mano deja el registro colgado— y repetir lo reusa.
      return registered(source, tree)
        ? { error: `${error}\nEl árbol quedó armado en ${tree}: repetí el comando para reusarlo.` } : { error }
    }
    const head = git(source, 'symbolic-ref', '--short', '-q', 'HEAD').stdout.trim()
    if (!hasBranch && head && from && head !== LNP.branchOf(from)) {
      warnings.push(`${repo} está en ${head}; ${branch} sale de ${from}, la rama viva. Si la querías sobre ${head}: `
        + `borrá el árbol, creá la rama con \`git -C ${source} branch ${branch} ${head}\` y repetí.`)
    }
  }
  const hooks = missingHooks(tree)
  if (hooks) {
    warnings.push(`${repo}: core.hooksPath apunta a ${hooks}, que este árbol no tiene; hasta que la instalación del `
      + 'repositorio la genere, git commitea sin hooks y no lo dice.')
  }
  if (COMPOSE.some((file) => fs.existsSync(path.join(tree, file))) && !composeNamed(tree, source)) {
    const project = `${path.basename(repo)}-${name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
    warnings.push(`${repo}: su compose, desde este árbol, es el mismo proyecto que desde el checkout de siempre, con `
      + `los mismos volúmenes y contenedores. Poné COMPOSE_PROJECT_NAME=${project} en el .env del árbol, sin copiar `
      + 'el del original; lo que el compose fija a mano —name:, container_name, una IP— se separa del lado del '
      + 'producto.')
  }
  return { repo, tree, branch, from, reused }
}

// Compose nombra el proyecto por la carpeta, y el árbol se llama como el repositorio para que `../` resuelva igual:
// desde el árbol es el mismo proyecto (caso 399). Se dice sólo donde hay compose, con los nombres que él busca, y sin
// leerlo: lo que choca primero es ese nombre, que no está escrito en el archivo.
const COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']
// Con un nombre propio en el `.env` del árbol el aviso calla: es lo que pide hacer, y uno que no se apaga se deja de
// leer. Propio es distinto del que tiene el checkout de siempre: un `.env` versionado que fija el nombre lo trae igual
// al árbol, y ahí el choque sigue.
const composeName = (dir) => {
  try {
    // Un valor vacío no es un nombre: con `\s*` el `=` sin nada tomaba la línea de abajo.
    const text = fs.readFileSync(path.join(dir, '.env'), 'utf8')
    return (text.match(/^[ \t]*COMPOSE_PROJECT_NAME[ \t]*=[ \t]*(\S+)/m) || [])[1]
  } catch { return undefined }
}
const composeNamed = (tree, source) => {
  const own = composeName(tree)
  return Boolean(own) && own !== composeName(source)
}

const occupied = (at) => {
  try { return Boolean(fs.lstatSync(at)) } catch { return false }
}

const registered = (source, tree) => (git(source, 'worktree', 'list', '--porcelain').stdout || '').split('\n')
  .some((entry) => entry.trim() === `worktree ${tree}`)

// `core.hooksPath` vive en la configuración del repositorio y la comparten todos sus worktrees, pero la carpeta
// a la que suele apuntar —`.husky/_`— la genera la instalación y git la ignora: un árbol nuevo no la trae, y
// git no corre ningún hook ni avisa (caso 398). Se dice y no se copia: lo que va adentro es de la herramienta.
// Relativa, git la resuelve desde la raíz del árbol.
function missingHooks(tree) {
  const value = git(tree, 'config', '--path', 'core.hooksPath').stdout.trim()
  if (!value || path.isAbsolute(value)) return ''
  return isDir(path.join(tree, value)) ? '' : value
}

const no = (error, code) => ({ error, code })

// Arma la línea y devuelve qué quedó, o `{ error, code }`. Separado de la salida porque lo usa también
// `ops lines migrate`, que imprime lo suyo.
function assemble(root, name, given) {
  if (!name || !NAME.test(name)) {
    return no('Falta el nombre, en minúsculas y con guiones. `ops line <ops-root> <nombre> [<repo>...]`', USAGE)
  }
  const config = LT.config(root)
  if (!config.mode) return no(`${root} (ruta resuelta) no es una raíz ops: falta ops.config.json.`, USAGE)
  const session = LT.sessionOf(root, config)
  if (!session) {
    return no(`una línea de trabajo necesita una instancia sidecar, y ésta es ${config.mode}: en embebido el `
      + 'worktree del repositorio se llevaría una segunda instancia adentro, con su propio planning.', REFUSED)
  }
  if (legacyTree(root, name)) {
    return no(`la línea ${name} está armada con la disposición de antes, con su propia carpeta de sesión. `
      + `Pasala a la nueva con \`ops lines migrate <ops-root> ${name} <repo>...\`.`, REFUSED)
  }
  const top = git(root, 'rev-parse', '--show-toplevel')
  if (top.status !== 0) return no(`${root} no está en un repositorio git.`, REFUSED)
  const instance = real(top.stdout.trim())
  const lines = LT.declared(root, config)
  const repos = [...new Set([...(lines[name] || []), ...given.map((one) => path.normalize(one).replace(/\/+$/, ''))])]
  for (const repo of repos) {
    const source = path.join(session, repo)
    const its = LT.safeRepo(repo) && isDir(source) ? git(source, 'rev-parse', '--show-toplevel') : null
    if (!its || its.status !== 0 || real(its.stdout.trim()) !== real(source)) {
      return no(`${repo} no es la raíz de un repositorio git dentro de ${session}.`, USAGE)
    }
    if (real(source) === instance) {
      return no(`${repo} es la instancia: una línea trabaja repositorios del producto, y la instancia es una `
        + 'sola para todas las sesiones.', USAGE)
    }
  }

  const warnings = []
  // Dos líneas sobre el mismo repositorio no se pisan —cada una tiene su rama y su árbol—, pero el merge no lo
  // aísla nadie. Se permite y se dice; `ops lines` muestra qué archivos cambiaron las dos.
  for (const repo of repos) {
    const others = Object.entries(lines).filter(([other, its]) => other !== name && its.includes(repo))
      .map(([other]) => other)
    if (others.length) {
      const named = others.map((one) => `la línea ${one}`).join(' y ')
      warnings.push(`${repo} también es de ${named}, en otra rama: no se pisan, pero lo que cambien las dos choca `
        + 'al mergear. `ops lines` muestra qué archivos tocaron.')
    }
  }
  // Antes de armar: un enlace de antes puede estar justo donde va el árbol de un repositorio que se suma (caso 408).
  const unlinked = unlinkSiblings(session, name)
  const trees = []
  for (const repo of repos) {
    const planted = plant(session, name, repo, warnings)
    if (planted.error) {
      const done = trees.length
        ? ` Quedaron armados ${trees.map((one) => one.tree).join(', ')}; repetir los reusa.` : ''
      return no(`${planted.error}${done}`, REFUSED)
    }
    trees.push(planted)
  }
  if (trees.length) ignoreLines(session)
  // La pertenencia se escribe al final: con un árbol que no se pudo armar, la línea no queda declarada a medias.
  // Sin repositorios se declara igual: el frente se decide antes que el repositorio, y su sesión ya puede llevar
  // la planificación (caso 421). Los árboles se arman cuando una tarea de la línea los pide, en `ops worktree`.
  const wrote = JSON.stringify(lines[name]) !== JSON.stringify(repos)
  if (wrote) {
    config.lines = { ...(config.lines || {}), [name]: repos }
    fs.writeFileSync(path.join(root, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  }

  return { line: name, session, trees, unlinked, warnings, declared: wrote }
}

function line(dir, name, given, cli) {
  // Real, porque git devuelve rutas reales: mezcladas con una que pasa por un enlace, ningún árbol coincidía.
  const report = assemble(real(opsRoot(dir)), name, given)
  if (report.error) return report.code === USAGE ? fail(report.error, USAGE) : fail(report.error, REFUSED)
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  print(report)
}

function print({ line: name, trees, unlinked, warnings, declared }) {
  for (const one of trees) {
    console.log(`${one.reused ? '=' : '✓'} ${one.tree}  (${one.branch})`)
    if (one.from) console.log(`  sale de: ${one.from}`)
  }
  if (unlinked.length) {
    console.log(`  sin los enlaces de antes: ${unlinked.join(', ')} (una línea ya no enlaza lo que no trabaja)`)
  }
  if (!trees.length) {
    console.log(`  la línea ${name} todavía no trabaja ningún repositorio: el árbol de cada uno se arma cuando una `
      + `tarea de la línea lo pide (ops worktree --line ${name}), o se suma con ops line <ops-root> ${name} <repo>`)
  }
  if (declared) console.log('  ops.config.json declara la línea: commitealo, que es de donde la lee el equipo')
  console.log(`La línea ${name} se lleva desde esta misma sesión, en otra conversación: /autobuild ${name}, o `
    + `--line ${name} en context y claim. Cada árbol es un checkout aparte: sus dependencias se instalan adentro.`)
  for (const warning of warnings) console.log(`⚠ ${warning}`)
}

// El estado de todas las líneas de la instancia, desde cualquiera de sus árboles. Lo que calcula está en
// `status`; acá sólo se decide cómo se lee: un bloque por árbol, con la base contra la que se cuentan los commits.
function lines(dir, cli) {
  const root = opsRoot(dir)
  const planning = path.join(root, 'planning')
  if (!fs.existsSync(path.join(planning, 'BACKLOG.md'))) {
    return fail(`${root} (ruta resuelta) no es una raíz ops: falta planning/BACKLOG.md.`, USAGE)
  }
  const report = LNP.status(planning)
  if (!report) return fail(`${root} no está en un repositorio git: las líneas son worktrees de él.`, REFUSED)
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  const none = '(ninguno)'
  console.log(`LÍNEAS  base: ${report.base || '(sin rama)'}`)
  for (const one of report.trees) {
    const moved = one.ahead === null ? '  sin base contra qué contar'
      : (one.ahead || one.behind ? `  +${one.ahead} / -${one.behind}` : '')
    const dirty = one.dirty ? `  · ${one.dirty} sin commitear` : ''
    console.log(`\n${one.line || 'principal'}  ${one.tree}  (${one.branch || 'sin rama'})${moved}${dirty}`
      + `${one.current ? '  ← acá' : ''}`)
    if (!one.planning) { console.log('  sin planning en este árbol'); continue }
    console.log(`  cola: ${one.milestones.map((m) => `${m.slug} (${m.tasks})`).join(', ') || '(vacía)'}`)
    console.log(`  reclamos: ${one.claims.map((c) => `${c.slug} (${c.runner}, ${c.started})`).join(', ') || none}`)
    console.log(`  en vuelo: ${one.wips.map((w) => `${w.task} [${w.phase}] ${w.runner}`).join(', ') || none}`)
    console.log(`  checkpoints: ${one.checkpoints.join(', ') || none}`)
  }
  for (const one of report.declared || []) {
    console.log(`\n${one.name}  (línea declarada)`)
    for (const repo of one.repos) {
      const moved = !repo.exists ? '  falta el árbol: ops line lo vuelve a armar'
        : repo.ahead === null ? '  sin rama viva contra qué contar'
          : (repo.ahead || repo.behind ? `  +${repo.ahead} / -${repo.behind}` : '')
      console.log(`  ${repo.repo}  ${repo.tree}  (${repo.branch})${moved}`
        + `${repo.dirty ? `  · ${repo.dirty} sin commitear` : ''}`)
    }
    console.log(`  cola: ${one.milestones.map((m) => `${m.slug} (${m.tasks})`).join(', ') || '(vacía)'}`)
    console.log(`  reclamos: ${one.claims.map((c) => `${c.slug} (${c.runner}, ${c.started})`).join(', ') || none}`)
    console.log(`  en vuelo: ${one.wips.map((w) => `${w.task} [${w.phase}] ${w.runner}`).join(', ') || none}`)
    console.log(`  checkpoints: ${one.checkpoints.join(', ') || none}`)
  }
  for (const one of report.overlaps || []) {
    console.log(`\n⚠ ${one.repo} lo trabajan ${one.lines.join(' y ')}, cada una en su rama. `
      + (one.files.length ? `Cambiaron las dos, y van a chocar al mergear: ${one.files.join(', ')}`
        : 'Todavía no tocaron los mismos archivos.'))
  }
}

module.exports = { line, lines, assemble, print, legacyTree, real }
