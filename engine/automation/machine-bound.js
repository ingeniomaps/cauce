'use strict'

// Lo que un runner instala con la ruta de la instancia escrita, y si git lo está versionando (caso 364).
//
// Los recorridos y el puente de Antigravity llevan la raíz absoluta porque dictan comandos a quien no sabe
// dónde está parado (caso 139). Eso los vuelve de **esa** carpeta: en git, cada clon y cada línea de trabajo
// los reinstala con su ruta y los ve modificados para siempre. Son generados —`automation install` los
// rehace—, así que no tienen por qué viajar.
//
// El molde los ignora en `gitignore`, pero ese archivo se escribe al crear la instancia y `upgrade` no lo
// toca. Para la que nació antes está este aviso, que pregunta por el **efecto** —si git los ignora, si ya
// los tiene— y no por el texto del `.gitignore`, igual que el de los rastros locales y por lo mismo.
//
// Cuáles son no se enumera: sale de las plantillas de cada runner instalado, las que traen el marcador de
// la raíz. La configuración de hooks queda afuera aunque lo traiga —la de Codex—: ahí conviven las entradas
// del usuario, y un archivo suyo no se manda a ignorar.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  RUNNER_NAMES, OPS_ROOT, runnerManifest, runnerPaths, resolveItem, render, opsPrefix,
} = require('./runners')

function bound(root) {
  const found = []
  for (const name of RUNNER_NAMES) {
    let runner
    let paths
    try {
      runner = runnerManifest(root, name)
      paths = runnerPaths(root, name, runner)
    } catch { continue }
    if (!fs.existsSync(paths.configTarget)) continue
    for (const item of runner.artifacts || []) {
      const resolved = resolveItem(paths, root, name, item)
      if (!fs.existsSync(resolved.target)) continue
      const template = render(resolved.source, opsPrefix(root), resolved.automationRoot, OPS_ROOT)
      if (template.includes(OPS_ROOT)) found.push(resolved.target)
    }
  }
  return found
}

// Como se escribe en un `.gitignore`: la carpeta cuando todo lo suyo es de éstos, el archivo cuando no.
function patterns(files, top) {
  const byDir = new Map()
  for (const file of files) {
    const dir = path.dirname(file)
    byDir.set(dir, [...(byDir.get(dir) || []), file])
  }
  const relative = (one) => path.relative(top, one).split(path.sep).join('/')
  return [...byDir].flatMap(([dir, inside]) => {
    let all = []
    try { all = fs.readdirSync(dir) } catch { all = [] }
    return all.length === inside.length ? [`${relative(dir)}/`] : inside.map(relative)
  })
}

function warnings(root) {
  const files = bound(root)
  if (!files.length) return []
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const top = git('rev-parse', '--show-toplevel')
  if (top.status !== 0) return []
  const here = files.filter((one) => !path.relative(fs.realpathSync(top.stdout.trim()), fs.realpathSync(one))
    .startsWith('..'))
  if (!here.length) return []
  const tracked = new Set((git('ls-files', '-z', '--', ...here).stdout || '').split('\0').filter(Boolean)
    .map((one) => path.resolve(top.stdout.trim(), one)))
  const ignored = new Set((git('check-ignore', '--', ...here).stdout || '').split('\n').filter(Boolean)
    .map((one) => path.resolve(root, one)))
  // `check-ignore` no da por ignorado lo que git ya tiene en el índice, que es lo que hace falta: agregar
  // la línea al `.gitignore` no saca de git lo que ya está adentro.
  const loose = here.filter((one) => !ignored.has(one))
  if (!loose.length) return []
  const lines = patterns(loose, top.stdout.trim())
  const inGit = here.filter((one) => tracked.has(one))
  const untrack = inGit.length
    ? ` ${inGit.length} ya están en git: sacalos con git rm -r --cached `
      + `${patterns(inGit, top.stdout.trim()).join(' ')} —quedan en disco—.`
    : ''
  return [`${loose.length} archivo(s) del runner llevan escrita la ruta de esta carpeta y git no los ignora `
    + `(${lines.join(', ')}): en git, cada clon y cada línea de trabajo los ve modificados. Son generados, los `
    + `rehace automation install; agregá esa(s) línea(s) a tu .gitignore.${untrack}`]
}

module.exports = { warnings }
