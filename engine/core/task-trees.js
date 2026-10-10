'use strict'

// Los árboles de tarea de un proyecto: se pueden escribir por lo que son, no por dónde caen (caso 360).
//
// `ops worktree` arma el árbol de una tarea al lado del repositorio del servicio. Con una raíz que es la
// carpeta que contiene a los repositorios, cae adentro de la raíz; con una raíz por repositorio, cae al
// lado, fuera de todo lo declarado, y el guard frenaba la primera escritura de cada tarea de una línea.
//
// Qué es un árbol de tarea se **calcula**, no se anota. Es la carpeta `<repositorio>-<tarea>`, al lado del
// repositorio de algo que el proyecto declaró, para una tarea que hoy tiene un reclamo en `planning/claims/`,
// y que git tiene registrada como árbol de ese mismo repositorio. Las tres cosas, y ninguna es un archivo
// que alcance con escribir:
//
// - **El lugar es uno solo.** No es «cualquier árbol registrado», que cualquiera arma con
//   `git worktree add <ruta>`, ni el de una línea de trabajo, que es la instancia de otra sesión.
// - **La tarea está viva.** Sin reclamo no hay árbol que abrir, y al soltarse la tarea se cierra solo.
// - **Es de ese repositorio.** La entrada del registro nombra la carpeta, la carpeta apunta de vuelta a la
//   entrada, y la entrada es del repositorio de la raíz. Una vecina con el nombre justo no alcanza.
//
// Tres versiones anteriores anotaban el árbol —por estar registrado, por su rama, por una marca dentro de
// `.git`— y cada revisión les encontró cómo fabricar la anotación: `.git` es escribible, y un guard no
// puede cuidar un archivo de todas las formas en que un comando lo deja caer. Lo que se calcula no tiene
// dónde falsificarse.
//
// La ruta se arma **como la ve la sesión**, sin resolver enlaces, que es como la arma `ops worktree`: con
// la carpeta de trabajo detrás de un enlace, la real y la que se escribe no coinciden.
//
// Abre lo mismo que se puede escribir en el árbol principal: cada carpeta que se le pasa —la instancia,
// cada raíz— se abre en el árbol en su mismo lugar. Y no lanza procesos: corre antes de cada escritura.

const fs = require('node:fs')
const path = require('node:path')
const { DIR: CLAIMS } = require('../planning/claims')
const { BRANCH: LINE } = require('../planning/lines')

const read = (file) => {
  try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' }
}
const real = (dir) => {
  try { return fs.realpathSync(dir) } catch { return '' }
}
const pointer = (file) => read(file).replace(/^gitdir:\s*/, '')

// El repositorio que contiene a `dir`, subiendo por la ruta: su carpeta y el `.git` que comparten todos sus
// árboles. Si `dir` ya está en un árbol —el producto dentro de una línea embebida—, el `.git` de ese árbol
// es un archivo que lleva a su entrada, y de ahí al común.
function climb(dir) {
  for (let top = dir; ; top = path.dirname(top)) {
    const dotGit = path.join(top, '.git')
    if (fs.existsSync(dotGit)) {
      if (fs.statSync(dotGit).isDirectory()) return { top, common: dotGit }
      const entry = path.resolve(top, pointer(dotGit))
      return { top, common: path.resolve(entry, read(path.join(entry, 'commondir')) || '.') }
    }
    if (path.dirname(top) === top) return null
  }
}

// El repositorio es el más cercano a donde `dir` está de verdad. Su carpeta se nombra como la ve la sesión
// cuando por la ruta escrita se llega a ese mismo repositorio —el producto enlazado en la carpeta de una
// línea—, y por la real cuando no: un enlace que lleva a una carpeta de adentro de un repositorio no tiene
// `.git` en el camino escrito, y subir por ahí encuentra otro repositorio o ninguno. Es lo mismo que hace
// `ops worktree` al elegir dónde armar.
function repository(dir) {
  const truly = real(dir)
  const actual = truly ? climb(truly) : null
  if (!actual) return null
  const written = climb(path.resolve(dir))
  const top = written && real(written.top) === actual.top ? written.top : actual.top
  return { top, common: actual.common, inside: path.relative(actual.top, truly) }
}

// Si git tiene a `tree` registrado como árbol del repositorio cuyo `.git` común es `common`. La ruta del
// registro puede ser relativa a la entrada —`worktree.useRelativePaths`—, así que se resuelve desde ahí.
function registered(tree, common) {
  // Un enlace en el lugar justo no es el árbol: lo que se abre es esta carpeta, no adonde lleve.
  try { if (fs.lstatSync(tree).isSymbolicLink()) return false } catch { return false }
  const back = pointer(path.join(tree, '.git'))
  const entry = back ? path.resolve(tree, back) : ''
  const named = entry && pointer(path.join(entry, 'gitdir'))
  return Boolean(named) && real(path.dirname(path.resolve(entry, named))) === real(tree)
    && real(path.dirname(path.dirname(entry))) === real(common)
}

// Si el repositorio tiene una línea de trabajo con ese nombre. Su carpeta también es `<repositorio>-<nombre>`
// y también está registrada, así que una tarea que se llame igual la abriría: es la instancia de otra
// sesión. Se pregunta por la rama de la línea, que existe mientras la línea exista, y no por la rama en la
// que está su árbol, que cambia con un rebase.
function isLine(common, slug) {
  const ref = `refs/heads/${LINE}${slug}`
  return fs.existsSync(path.join(common, ref))
    || read(path.join(common, 'packed-refs')).split('\n').some((entry) => entry.endsWith(` ${ref}`))
}

// Dónde arma `ops worktree` el árbol de una tarea de ese repositorio. Es la única fuente de esa ruta: la usa
// quien lo arma y quien decide si se puede escribir ahí.
const treeOf = (top, slug) => path.join(path.dirname(top), `${path.basename(top)}-${slug}`)

// Las tareas con reclamo, por el nombre de su archivo: es lo único que hace falta saber de cada una.
function claimed(planning) {
  try {
    return fs.readdirSync(path.join(planning, CLAIMS))
      .filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => name.slice(0, -3))
  } catch { return [] }
}

function taskTrees(planning, folders) {
  const slugs = claimed(planning)
  const found = new Set()
  for (const folder of slugs.length ? folders : []) {
    const repo = repository(folder)
    if (!repo) continue
    for (const slug of slugs) {
      const tree = treeOf(repo.top, slug)
      if (isLine(repo.common, slug) || !registered(tree, repo.common)) continue
      // Por donde la sesión lo ve y por donde está de verdad: `ops worktree` entrega la segunda cuando git
      // es quien la sabe, y con un enlace en el camino son dos textos para la misma carpeta.
      for (const seen of [tree, real(tree)]) found.add(path.join(seen, repo.inside))
    }
  }
  return [...found]
}

// Lo escribible de un proyecto con sus árboles de tarea: la instancia, las raíces, y esas mismas carpetas
// en cada árbol. Lo arman igual los guards que lo necesitan, para que no puedan contestar distinto.
const withTaskTrees = (root, declared) => [root, ...declared,
  ...taskTrees(path.join(root, 'planning'), [root, ...declared])]

module.exports = { taskTrees, treeOf, withTaskTrees }
