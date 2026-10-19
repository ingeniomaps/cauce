'use strict'

// Las líneas de trabajo declaradas y dónde vive cada árbol (caso 394).
//
// Una línea es un nombre y los repositorios del producto que trabaja: `"lines": { "pagos": ["backend-pagos"] }`
// en `ops.config.json`, cada repositorio nombrado como se ve desde la carpeta de sesión. Cada uno tiene su
// worktree en `lines/<línea>/<repo>/`, dentro de esa misma carpeta y en la rama `line/<línea>`. La instancia
// es una sola y la sesión también: una línea no lleva configuración propia, y por eso no hay nada que
// replicar ni que enlazar para que la gobierne lo mismo que al trabajo principal.
//
// Lo declarado manda, no lo que haya en disco (R28): un árbol en `lines/` que nadie declaró no es de ninguna
// línea. Y sólo existe en sidecar, que es donde hay una carpeta de sesión que contiene a la instancia y al
// producto; en embebido el worktree del repo se llevaría una segunda instancia adentro.
//
// No lanza procesos: lo leen también los guards, antes de cada escritura.

const fs = require('node:fs')
const path = require('node:path')

const DIR = 'lines'
const BRANCH = 'line/'
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function config(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch { return {} }
}

// La carpeta de sesión de una instancia sidecar, o '' si no es sidecar.
const sessionOf = (root, read = config(root)) => (read.mode === 'sidecar' ? path.resolve(root, '..') : '')

// Las líneas declaradas, como `{ nombre: [repo, ...] }`. Lo que no tiene la forma se deja afuera: `check` es
// quien lo dice, y acá una entrada rota no puede abrir ni cerrar nada.
function declared(root, read = config(root)) {
  const lines = read.lines
  if (!lines || typeof lines !== 'object' || Array.isArray(lines)) return {}
  return Object.fromEntries(Object.entries(lines).filter(([name, repos]) => NAME.test(name) && Array.isArray(repos))
    .map(([name, repos]) => [name, repos.filter((one) => typeof one === 'string' && safeRepo(one))]))
}

// Un repositorio de una línea se nombra por debajo de la carpeta de sesión y fuera de `lines/`: lo que sale
// de ahí no es un repositorio del producto sino otra cosa con una ruta que lo parece.
function safeRepo(repo) {
  const clean = path.normalize(repo)
  return Boolean(repo.trim()) && !path.isAbsolute(clean) && !clean.startsWith('..') && clean !== '.'
    && clean.split(path.sep)[0] !== DIR
}

// Dónde va el árbol de un repositorio de una línea.
const treeOf = (session, line, repo) => path.join(session, DIR, line, path.normalize(repo))

// Todos los árboles declarados de la instancia, con su línea y su repositorio de origen.
function trees(root) {
  const read = config(root)
  const session = sessionOf(root, read)
  if (!session) return []
  return Object.entries(declared(root, read)).flatMap(([line, repos]) => repos.map((repo) => ({
    line, repo, source: path.join(session, path.normalize(repo)), tree: treeOf(session, line, repo),
  })))
}

// El id de runner de una sesión que lleva una línea. Las dos sesiones corren `ops` desde la misma instancia,
// así que el id que se deduce del árbol es el mismo para las dos: compartirían el WIP, y la segunda no podría
// reclamar mientras la primera tuviera una tarea. Con `CAUCE_RUNNER` el id es el que se declaró.
const runnerOf = (base, line) => (line ? `${base}#${BRANCH}${line}` : base)

module.exports = { DIR, BRANCH, NAME, config, sessionOf, declared, safeRepo, treeOf, trees, runnerOf }
