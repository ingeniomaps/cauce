'use strict'

// Qué trabajo es de qué línea, y qué reclamó cada una (caso 239).
//
// Una línea es un worktree de la instancia en su rama `line/<nombre>`, con su propia carpeta de sesión (lo arma
// `ops line`). Su autobuild ya lee su propio árbol; lo que faltaba es que no tomara el trabajo de otra. Un hito
// se declara de una línea con `line: <nombre>` en el frontmatter de su `backlog/<hito>.md`. Una línea ve sólo
// sus hitos, y el árbol que no es de ninguna ve los que no tienen línea. Lo que no se declara se comporta como
// antes.
//
// La línea sale de la rama y no de un argumento: un argumento hay que recordarlo en cada corrida, y olvidarlo
// reproduce el caso en silencio.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const C = require('./claims')

const BRANCH = 'line/'
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })

function currentLine(root) {
  const head = git(root, 'symbolic-ref', '--short', '-q', 'HEAD')
  const branch = head.status === 0 ? head.stdout.trim() : ''
  return branch.startsWith(BRANCH) ? branch.slice(BRANCH.length) : ''
}

// Los hitos que esta línea puede tomar. Lo que ya tiene en curso no se esconde aunque sea de otra: un filtro
// elige dónde buscar trabajo nuevo, y esconder el propio dejaría un reclamo que nadie retoma.
function scope(milestones, line, keep = new Set()) {
  const mine = (one) => (one.line || '') === line || one.tasks.some((task) => keep.has(task.slug))
  return { milestones: milestones.filter(mine), hidden: milestones.filter((one) => !mine(one)) }
}

// Lo que se le dice a quien pide trabajo de otra línea: dónde se toma.
function whereToTake(milestone) {
  return milestone.line
    ? `es de la línea ${milestone.line}: se toma desde su carpeta (\`ops line\`)`
    : 'no es de ninguna línea: se toma desde el árbol principal'
}

function lineErrors(milestones) {
  return milestones.filter((one) => one.line && !NAME.test(one.line))
    .map((one) => `${one.file}: line «${one.line}» no es un nombre de línea (minúsculas y guiones)`)
}

// Los árboles de trabajo de la instancia, con su rama. git lista primero el principal, y ese orden es lo que
// `status` toma como base para contar commits. Un árbol borrado a mano sigue listado y se deja afuera.
function worktrees(root) {
  const listed = git(root, 'worktree', 'list', '--porcelain')
  if (listed.status !== 0) return []
  const trees = []
  for (const entry of listed.stdout.split('\n')) {
    if (entry.startsWith('worktree ')) trees.push({ tree: entry.slice('worktree '.length), branch: '' })
    else if (entry.startsWith('branch refs/heads/') && trees.length) {
      trees[trees.length - 1].branch = entry.slice('branch refs/heads/'.length)
    }
  }
  return trees.filter((one) => fs.existsSync(one.tree))
}

// Dónde está la instancia dentro de su repositorio, para encontrar el mismo planning en cada árbol.
function placement(root) {
  const top = git(root, 'rev-parse', '--show-toplevel')
  if (top.status !== 0) return null
  const here = fs.realpathSync(top.stdout.trim())
  return { here, relative: path.relative(here, fs.realpathSync(root)) }
}

// Los reclamos que viven en los otros worktrees de la instancia. Cada línea commitea los suyos en su rama, así
// que desde acá no se veían, y dos líneas reclamaban la misma tarea sin enterarse. Se leen en el disco de cada
// árbol, sin mudarlos de lugar: siguen siendo los archivos versionados de siempre.
function claimsElsewhere(root) {
  const where = placement(root)
  if (!where) return []
  return worktrees(root).filter(({ tree }) => fs.realpathSync(tree) !== where.here)
    .flatMap(({ tree }) => C.read(path.join(tree, where.relative)).map((one) => ({ ...one, tree })))
}

// El estado de cada línea, leído del disco de su árbol: qué cola ve, qué reclamó, qué tiene en vuelo y qué
// checkpoint la frena, más los commits que la separan de la base y lo que todavía no commiteó. Es lo que una
// persona miraba abriendo una carpeta por línea, y lo que un recorrido necesita para proponer un reparto
// entre líneas que existen. Un árbol sin planning —una rama que nunca lo trajo— sale con `planning: false`.
function status(root) {
  const where = placement(root)
  if (!where) return null
  const trees = worktrees(root)
  const base = trees.length ? trees[0].branch : ''
  const ST = require('./state')
  const CK = require('./checkpoints')
  return {
    base,
    trees: trees.map(({ tree, branch }) => {
      const planning = path.join(tree, where.relative)
      const line = branch.startsWith(BRANCH) ? branch.slice(BRANCH.length) : ''
      // `base...rama` con `--left-right`: lo que sólo está en la base es lo que falta traer, lo que sólo está
      // en la rama es lo que falta llevar. Sin base —el principal suelto— no hay número, y cero no es «no sé».
      let [behind, ahead] = [null, null]
      if (base && branch === base) [behind, ahead] = [0, 0]
      else if (base && branch) {
        const counted = git(root, 'rev-list', '--left-right', '--count', `${base}...${branch}`)
        ;[behind, ahead] = counted.stdout.trim().split(/\s+/).map((n) => Number(n) || 0)
      }
      const dirty = (git(tree, 'status', '--porcelain').stdout || '').split('\n').filter(Boolean).length
      const entry = { tree, branch, line, current: fs.realpathSync(tree) === where.here, ahead, behind, dirty }
      if (!fs.existsSync(path.join(planning, 'BACKLOG.md'))) {
        return { ...entry, planning: false, milestones: [], claims: [], wips: [], checkpoints: [] }
      }
      const state = ST.snapshot(planning)
      return {
        ...entry,
        planning: true,
        milestones: scope(state.milestones, line).milestones
          .map((one) => ({ slug: one.slug, tasks: one.tasks.length })),
        claims: state.claims.map((one) => ({ slug: one.slug, runner: one.runner, started: one.started })),
        wips: state.wips.map((one) => ({ task: one.task, runner: one.runner, phase: one.phase })),
        checkpoints: CK.holding(planning, line).map((one) => one.file),
      }
    }),
  }
}

// Qué significa cada archivo en conflicto al juntar dos líneas, y qué hacer con él. Las reglas son las que
// `delivery/teamwork.md` y el `.gitattributes` del molde ya dicen; acá sólo se aplican a una lista de rutas,
// para que quien junta no tenga que acordarse de leerlas. `relative` es dónde está el planning dentro del
// repositorio.
const CONFLICT_KINDS = [
  ['lecciones', ['LESSONS.md'], 'quedate con las filas de las dos tablas; el conflicto es correcto'],
  ['decision', ['BACKLOG.md', 'INBOX.md', 'RECURRING.md'],
    'dos líneas decidieron sobre lo mismo: leé los dos lados y elegí'],
  ['union', ['HUMAN_ACTIONS.md', 'done/human-actions.md'],
    'tendría que fusionar por unión: falta merge=union en el .gitattributes'],
]
const UNIT_DIRS = ['backlog/', 'done/', 'claims/', 'checkpoints/', 'inbox/', 'human/', 'roadmap/', 'wip/']
function classifyConflicts(relative, files) {
  const prefix = relative ? `${relative}/` : ''
  return files.map((file) => {
    const inside = file.startsWith(prefix) ? file.slice(prefix.length) : null
    const named = inside && CONFLICT_KINDS.find(([, names]) => names.includes(inside))
    if (named) return { file, kind: named[0], advice: named[2] }
    if (inside && UNIT_DIRS.some((dir) => inside.startsWith(dir))) {
      return { file, kind: 'unidad', advice: 'las dos líneas editaron la misma unidad: se resuelve leyendo las dos' }
    }
    return { file, kind: 'conflicto', advice: 'no es un archivo que el motor reparta: se resuelve a mano' }
  })
}

// Dos épicas con el mismo número y distinto archivo no chocan en git y `check` las rechaza después de juntar
// (caso 217). Se ven antes comparando los nombres de `roadmap/` de los dos lados.
function duplicateEpics(targetFiles, sourceFiles) {
  const numOf = (file) => (path.basename(file).match(/^epic-(\d{3})-/) || [])[1]
  const byNum = new Map()
  for (const file of [...new Set([...targetFiles, ...sourceFiles])]) {
    const num = numOf(file)
    if (num) byNum.set(num, [...(byNum.get(num) || []), file])
  }
  return [...byNum].filter(([, files]) => files.length > 1).map(([num, files]) => ({ num, files: files.sort() }))
}

// La tabla de acciones humanas es de todas las líneas: sin `merge=union`, dos que le agreguen una fila chocan
// al juntarse. El molde entrega la regla, pero un `.gitattributes` propio en la raíz del repositorio —una
// instancia embebida— la deja afuera sin que nada lo diga. Sólo se avisa donde hay líneas —sin ellas no hay
// dos ramas escribiendo la tabla— y donde la tabla tiene filas: los recorridos ya no la escriben (caso 351),
// así que vacía no la toca nadie y el aviso pedía editar un archivo por otro que no se usa.
function mergeWarnings(root, milestones, tableRows) {
  if (!tableRows || (!currentLine(root) && !milestones.some((one) => one.line))) return []
  const attribute = git(root, 'check-attr', 'merge', '--', 'HUMAN_ACTIONS.md')
  if (attribute.status !== 0 || /: merge: union\s*$/.test(attribute.stdout)) return []
  const prefix = git(root, 'rev-parse', '--show-prefix').stdout.trim()
  return [`HUMAN_ACTIONS.md no fusiona por unión, así que dos líneas que registren una fila van a chocar al `
    + `juntarse. Agregá al .gitattributes de la raíz del repositorio: ${prefix}HUMAN_ACTIONS.md merge=union`]
}

module.exports = {
  BRANCH, NAME, currentLine, scope, whereToTake, lineErrors, worktrees, placement, claimsElsewhere, status,
  classifyConflicts, duplicateEpics, mergeWarnings,
}
