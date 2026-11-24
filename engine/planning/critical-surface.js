'use strict'

// El carril de una tarea se fija antes de construir, por lo que dice su aceptación (OPS-006), y nada lo comparaba con
// lo que el diff tocó: una `express` cuyos commits cruzaban una migración o permisos cerraba sin que nadie mirara el
// diff (caso 561). Cada raíz puede declarar sus superficies críticas en `critical`, como globs relativos a ella, y
// `check` avisa la entrada de `done/` que las toca fuera de `full`. Avisa y no frena: la clasificación la hizo una
// persona o un modelo, y lo que esto agrega es que se vea.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { toRegExp } = require('../core/scope')
const { commitParts } = require('./done-entry')

// Lo cerrado antes de esta regla no se juzga: no violó nada que se le hubiera pedido.
const SINCE = '2026-11-24'
const SHA = /^([0-9a-f]{7,40})\s/

// Con el búfer grande y `-z`, como `commitSources` de `core/repos.js`: con el de siempre, un listado de un repositorio
// mediano se cortaba en 1 MB y un glob que coincidía se leía como que no.
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const listed = (shown) => (shown.status === 0 && !shown.error ? shown.stdout.split('\0').filter(Boolean) : null)
// Los archivos de un commit; uno de merge contra su primer padre, que es lo que entró.
function filesOf(dir, sha) {
  const merge = (git(dir, 'rev-list', '--parents', '-n', '1', sha).stdout || '').trim().split(/\s+/).length > 2
  return listed(merge ? git(dir, 'diff', '--name-only', '-z', `${sha}^1`, sha)
    : git(dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '-z', sha)) || []
}

// Las raíces que declaran superficies, con su carpeta y el prefijo de esa carpeta dentro de su repositorio: los
// archivos de un commit salen relativos al repositorio, y los globs son relativos a la raíz.
function declared(opsRoot) {
  let config = {}
  try { config = JSON.parse(fs.readFileSync(path.join(opsRoot, 'ops.config.json'), 'utf8')) } catch { return [] }
  return (Array.isArray(config.workspaceRoots) ? config.workspaceRoots : [])
    .filter((one) => one && one.path && Array.isArray(one.critical) && one.critical.length)
    // Una raíz que no está en esta máquina se saltea: `check` ya la nombra como ausente.
    .filter((one) => fs.existsSync(path.resolve(opsRoot, one.path)))
    .map((one) => {
      const dir = path.resolve(opsRoot, one.path)
      const top = git(dir, 'rev-parse', '--show-toplevel')
      // Contra la ruta real: git devuelve la del repositorio sin enlaces, y una raíz que pasa por uno no coincidía.
      const prefix = top.status === 0 ? path.relative(top.stdout.trim(), fs.realpathSync(dir)) : null
      // Lo que no es texto ya es error de configuración; compilarlo rompía `check` antes de que lo dijera.
      const globs = one.critical.filter((glob) => typeof glob === 'string' && glob.trim())
      return { name: one.name, dir, prefix, globs: globs.map((glob) => ({ glob, test: toRegExp(glob) })) }
    })
}

const inside = (prefix, file) => {
  if (!prefix) return file
  return file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : null
}
// Con el vocabulario de `scope` y no con `path.matchesGlob`, cuyo `**` salta lo que empieza con punto: `.github/**` no
// veía nada.
const hits = (files, globs) => files.filter((file) => globs.some((one) => one.test.test(file)))

// Se juzga lo cerrado en los últimos 30 días: `check` corre en cada cierre de sesión, y sin ventana el costo crecía con
// cada tarea. Lo de antes ya se avisó mientras estuvo adentro. `today` lo pasa quien llama.
const WINDOW_DAYS = 30
function criticalWarnings(opsRoot, entries, today, adopted = new Set()) {
  const window = new Date(Date.parse(`${today}T00:00:00Z`) - WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
  const since = window > SINCE ? window : SINCE
  const roots = declared(opsRoot)
  const warnings = []
  for (const root of roots) {
    if (root.prefix === null) {
      warnings.push(`ops.config.json: ${root.name}: declara critical y no es un repositorio git, así que no se mide; `
        + 'en una carpeta de varios repositorios, declaralo en la raíz de cada uno')
      continue
    }
    // Un patrón se mide contra el árbol real antes de confiarle algo: el primero que escribió una instancia para su
    // código de pagos no coincidía con ninguno de los archivos del repositorio donde vivía.
    const tracked = listed(git(root.dir, 'ls-files', '-z'))
    if (!tracked) continue
    for (const { glob, test } of root.globs) {
      if (!tracked.some((file) => test.test(file))) {
        warnings.push(`ops.config.json: ${root.name}: critical «${glob}» no coincide con ningún archivo versionado; `
          + 'una superficie que no coincide con nada no avisa nunca')
      }
    }
  }
  const measured = roots.filter((root) => root.prefix !== null)
  // Un sha se pregunta una vez por raíz: `check` corre en cada cierre de sesión.
  const seen = new Map()
  const filesFor = (root, sha) => {
    const key = `${root.dir}\0${sha}`
    if (!seen.has(key)) seen.set(key, filesOf(root.dir, sha))
    return seen.get(key)
  }
  for (const entry of entries) {
    // `sin clasificar` corre el carril full a propósito (`done-entry.js`), así que tampoco se juzga.
    const judged = entry.lane && !['full', 'sin clasificar'].includes(entry.lane) && !adopted.has(entry.slug)
    if (!judged || !(String(entry.fecha || '') >= since)) continue
    const shas = commitParts(entry.commit).map((part) => (part.match(SHA) || [])[1]).filter(Boolean)
    for (const root of measured) {
      const files = shas.flatMap((sha) => filesFor(root, sha))
        .map((file) => inside(root.prefix, file)).filter(Boolean)
      const touched = [...new Set(hits(files, root.globs))]
      if (!touched.length) continue
      const shown = touched.length > 3 ? [...touched.slice(0, 3), `y ${touched.length - 3} más`] : touched
      warnings.push(`${entry.source} ${entry.slug}: carril ${entry.lane} y sus commits tocan ${shown.join(', ')}, `
        + `superficie crítica de ${root.name}; OPS-006 pone en full lo que la cruza`
        + `${['express', 'manual'].includes(entry.lane) ? ', y en este carril nadie revisó el diff' : ''}`)
    }
  }
  return warnings
}

module.exports = { criticalWarnings }
