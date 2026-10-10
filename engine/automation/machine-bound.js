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
//
// Y la contracara de no viajar: el clon recibe la configuración del runner y no estos archivos. Qué runner
// se instaló lo dice el manifiesto, que sí viaja, así que acá mismo se avisa de lo que falta rehacer.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const M = require('../core/manifest')
const { ownGenerated } = require('./own-workflows')
const {
  RUNNER_NAMES, OPS_ROOT, runnerManifest, runnerPaths, resolveItem, render, opsPrefix,
} = require('./runners')

const carriesRoot = (root, source, automationRoot) => {
  try { return render(source, opsPrefix(root), automationRoot, OPS_ROOT).includes(OPS_ROOT) } catch { return false }
}

// Un propio se juzga por lo que quedó escrito: su fuente pudo borrarse y el generado sigue ahí, con la ruta.
const wroteRoot = (written, file) => {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return written.some((one) => text.includes(one))
  } catch { return false }
}

// Por runner instalado: lo que lleva la ruta y está, lo que la lleva y falta, y todo lo generado.
//
// Instalado es que su configuración esté o que el manifiesto diga que Cauce lo entregó: en un clon la
// configuración puede no haber viajado tampoco. Y una plantilla se rinde sólo si su archivo está o se
// entregó, porque esto corre en cada `check` y rendir las de un runner que nadie usa es trabajo de más.
function survey(root, written) {
  const delivered = Object.keys(M.readRunners(root))
  const found = []
  for (const name of RUNNER_NAMES) {
    let runner
    let paths
    try {
      runner = runnerManifest(root, name)
      paths = runnerPaths(root, name, runner)
    } catch { continue }
    if (!fs.existsSync(paths.configTarget) && !delivered.some((key) => key.startsWith(`${name}/`))) continue
    const one = { name, present: [], absent: [], generated: [] }
    for (const item of runner.artifacts || []) {
      const resolved = resolveItem(paths, root, name, item)
      const exists = fs.existsSync(resolved.target)
      // Que la configuración esté no alcanza: puede ser de la persona, con un runner que Cauce no instaló.
      if (!exists && !delivered.includes(`${name}/${item.target}`)) continue
      if (!carriesRoot(root, resolved.source, resolved.automationRoot)) continue
      one[exists ? 'present' : 'absent'].push(resolved.target)
    }
    for (const own of ownGenerated(root, runner, paths)) {
      one.generated.push(own.target)
      if (wroteRoot(written, own.target)) one.present.push(own.target)
    }
    one.generated.push(...one.present)
    found.push(one)
  }
  return found
}

// Como se escribe en un `.gitignore`: la carpeta cuando todo lo suyo es generado, el archivo cuando no.
// Un recorrido propio sin la ruta no está entre los que se avisan y tampoco impide ignorar la carpeta; uno
// escrito a mano sí, porque ignorarla lo sacaría de git a él.
function patterns(files, top, generated) {
  const byDir = new Map()
  for (const file of files) {
    const dir = path.dirname(file)
    byDir.set(dir, [...(byDir.get(dir) || []), file])
  }
  const relative = (one) => path.relative(top, one).split(path.sep).join('/')
  return [...byDir].flatMap(([dir, inside]) => {
    let all = []
    try { all = fs.readdirSync(dir).map((one) => path.join(dir, one)) } catch { all = [] }
    return all.every((one) => generated.includes(one)) ? [`${relative(dir)}/`] : inside.sort().map(relative)
  })
}

function absentWarnings(root, runners) {
  return runners.filter((one) => one.absent.length).map((one) => {
    const dirs = [...new Set(one.absent.map((file) => `${path.relative(root, path.dirname(file))}/`))]
    return `a ${one.name} le faltan ${one.absent.length} archivo(s) que se generan en cada carpeta y no viajan `
      + `por git (en ${dirs.join(', ')}): un clon nace sin ellos, y sin ellos el runner no funciona entero acá. `
      + `Rehacelos con node tools/ops.js automation install . ${one.name}`
  })
}

function trackedWarnings(root, runners) {
  const files = runners.flatMap((one) => one.present)
  const generated = runners.flatMap((one) => one.generated)
  if (!files.length) return []
  const git = (args, input) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input })
  const shown = git(['rev-parse', '--show-toplevel'])
  if (shown.status !== 0) return []
  const top = fs.realpathSync(shown.stdout.trim())
  const here = files.filter((one) => !path.relative(top, one).startsWith('..'))
  if (!here.length) return []
  // `-z` en los dos: sin él git escribe entre comillas y con escapes la ruta que trae un acento, y deja de
  // coincidir con la nuestra. `check-ignore` sólo lo admite leyendo las rutas por la entrada.
  const listed = (out, base) => new Set((out.stdout || '').split('\0').filter(Boolean)
    .map((one) => path.resolve(base, one)))
  // `--full-name`: sin él las rutas salen relativas a la instancia, que puede no ser la raíz del repositorio.
  const tracked = listed(git(['ls-files', '-z', '--full-name', '--', ...here]), top)
  // `check-ignore` no da por ignorado lo que git ya tiene en el índice, que es lo que hace falta: agregar
  // la línea al `.gitignore` no saca de git lo que ya está adentro.
  const ignored = listed(git(['check-ignore', '-z', '--stdin'], here.join('\0')), root)
  const loose = here.filter((one) => !ignored.has(one))
  if (!loose.length) return []
  const lines = patterns(loose, top, generated)
  const inGit = here.filter((one) => tracked.has(one))
  const untrack = inGit.length
    ? ` ${inGit.length} ya están en git: sacalos con git rm -r --cached `
      + `${patterns(inGit, top, generated).join(' ')} —quedan en disco—.`
    : ''
  // Las líneas valen para el `.gitignore` de la raíz del repositorio, y el comando se corre desde ahí.
  const from = top === root ? '' : ` Las rutas son desde la raíz del repositorio, ${top}.`
  return [`${loose.length} archivo(s) del runner llevan escrita la ruta de esta carpeta y git no los ignora `
    + `(${lines.join(', ')}): en git, cada clon y cada línea de trabajo los ve modificados. Son generados, los `
    + `rehace automation install; agregá esa(s) línea(s) a tu .gitignore.${untrack}${from}`]
}

// La raíz se resuelve antes de preguntar: git contesta con rutas reales, y por un enlace a la instancia
// las nuestras no coincidían con las suyas.
function warnings(given) {
  let root
  try { root = fs.realpathSync(given) } catch { return [] }
  // La raíz pudo escribirse como se la nombró al instalar, y no como la resuelve el sistema.
  const runners = survey(root, [root, path.resolve(given)])
  return [...absentWarnings(root, runners), ...trackedWarnings(root, runners)]
}

module.exports = { warnings }
