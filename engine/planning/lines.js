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

// Los reclamos que viven en los otros worktrees de la instancia. Cada línea commitea los suyos en su rama, así
// que desde acá no se veían, y dos líneas reclamaban la misma tarea sin enterarse. Se leen en el disco de cada
// árbol, sin mudarlos de lugar: siguen siendo los archivos versionados de siempre.
function claimsElsewhere(root) {
  const top = git(root, 'rev-parse', '--show-toplevel')
  if (top.status !== 0) return []
  const here = fs.realpathSync(top.stdout.trim())
  const relative = path.relative(here, fs.realpathSync(root))
  const trees = (git(root, 'worktree', 'list', '--porcelain').stdout || '').split('\n')
    .filter((entry) => entry.startsWith('worktree ')).map((entry) => entry.slice('worktree '.length))
    .filter((tree) => fs.existsSync(tree) && fs.realpathSync(tree) !== here)
  return trees.flatMap((tree) => C.read(path.join(tree, relative)).map((one) => ({ ...one, tree })))
}

module.exports = { BRANCH, NAME, currentLine, scope, whereToTake, lineErrors, claimsElsewhere }
