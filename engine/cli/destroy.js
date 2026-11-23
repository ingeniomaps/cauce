'use strict'

// Sacar una instancia: qué se pierde, el wiring de cada runner y lo que Cauce dejó afuera de la carpeta. Vive aparte
// de `instance.js`, que crea y actualiza, porque lo que lo hace cambiar es otra cosa: lo que una versión empieza a
// dejar fuera de la instancia y hay que saber sacar.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const O = require('../core/ownership')
const M = require('../core/manifest')
const OB = require('../core/onboarding')
const R = require('../core/repos')
const IB = require('../core/ignore-block')
const P = require('../planning/parser')
const BK = require('../planning/backlog')
const ST = require('../planning/state')
const A = require('../automation')
const { fail, USAGE } = require('./io')
const { undeclareEngine } = require('./dependency')

// Qué se pierde al borrar una instancia. Se cuenta antes de tocar nada porque es lo único que vuelve
// reversible la decisión: quien lee esto todavía puede no seguir.
// Lo cuenta el mismo parser que usan `check` y `tree`, no una expresión regular propia: los moldes traen
// ejemplos comentados, y contarlos a mano anunciaba una tarea en cola y otra terminada en una instancia
// recién creada. Un aviso que exagera lo que se pierde se deja de leer igual que uno que lo minimiza.
function whatIsLost(root) {
  const planning = path.join(root, 'planning')
  const queued = BK.readBacklog(planning).reduce((total, milestone) => total + (milestone.tasks || []).length, 0)
  const humanActions = ST.pendingHumanActions(planning).length
  return {
    epics: P.readEpics(planning).length,
    done: (P.readDone(planning).entries || []).length,
    queued,
    humanActions,
    context: !OB.guide(root).fresh,
    runners: [...new Set(Object.keys(M.readRunners(root)).map((key) => key.split('/')[0]))],
    trees: taskTrees(root),
  }
}

// Sin `GIT_*`, por lo mismo que en `core/ignore-block.js`: de lo que git contesta sale de qué `.gitignore` se saca el
// bloque y qué árboles se nombran.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))

// Los `.gitignore` donde Cauce pudo dejar su bloque: el de la instancia en embebido, y el del repositorio que la
// contiene, donde `automation install` ignora lo que el runner escribe afuera.
function ignoreFiles(root) {
  const top = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', env: cleanEnv() })
  const files = [path.join(root, '.gitignore')]
  if (top.status === 0) files.push(path.join(top.stdout.trim(), '.gitignore'))
  return [...new Set(files)]
}

// Los árboles que `ops worktree` armó, en el repositorio de la instancia y en sus raíces. Se nombran y no se
// borran: pueden tener trabajo sin commitear, y llevan su propia copia de la instancia que este borrado no alcanza.
function taskTrees(root) {
  const repos = [root, ...R.declaredRoots(root).map((one) => one.dir)]
  const found = new Map()
  for (const dir of repos) {
    const listed = spawnSync('git', ['-C', dir, 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8', env: cleanEnv() })
    if (listed.status !== 0) continue
    for (const block of listed.stdout.split('\n\n')) {
      const tree = (block.match(/^worktree (.+)$/m) || [])[1]
      const branch = (block.match(/^branch refs\/heads\/(task\/.+)$/m) || [])[1]
      if (tree && branch) found.set(tree, branch)
    }
  }
  return [...found].map(([tree, branch]) => ({ tree, branch }))
}

// Saca la instancia entera y el wiring que dejó en cada runner. Existe porque la alternativa era una
// lista de pasos a mano —desinstalar cada runner y después `rm -rf`—, y una lista se ejecuta a medias:
// el orden importa, y borrar primero la carpeta deja al runner ejecutando guards que ya no existen.
//
// Nunca borra sin que alguien lo haya pedido dos veces. Lo que hay adentro —planning, organization, la
// evidencia de lo hecho— es del proyecto y no lo repone ningún `init`.
function destroy(dir, cli) {
  const root = path.resolve(dir || '.')
  if (!fs.existsSync(path.join(root, 'ops.config.json'))) {
    fail(`${root} no es una instancia de Cauce: falta ops.config.json.`, USAGE)
  }
  if (O.mode(root) === 'toolkit') fail(`${root} es el toolkit: acá se fabrica Cauce, no se lo borra.`, USAGE)

  const loss = whatIsLost(root)
  const lines = [
    loss.epics && `${loss.epics} épica(s) en el roadmap`,
    loss.queued && `${loss.queued} tarea(s) en la cola`,
    loss.done && `${loss.done} tarea(s) terminada(s) con su evidencia`,
    loss.humanActions && `${loss.humanActions} acción(es) humana(s) pendiente(s)`,
    loss.context && 'el contexto escrito en organization/',
  ].filter(Boolean)

  const embedded = O.mode(root) === 'embedded'
  if (!cli.has('--force')) {
    console.log(embedded
      ? `Sacar Cauce de ${root} se lleva:`
      : `Borrar ${root} se lleva:`)
    for (const textLine of lines) console.log(`  − ${textLine}`)
    if (!lines.length) console.log('  − nada escrito todavía: la instancia está como salió de init')
    if (loss.runners.length) {
      console.log(`  y saca el wiring de: ${loss.runners.join(', ')} (lo tuyo queda donde está)`)
    }
    if (embedded) {
      console.log('  el código del repositorio no se toca: en modo embebido la instancia es él mismo.')
    }
    if (loss.trees.length) {
      console.log(`  y quedan en pie ${loss.trees.length} árbol(es) de tarea, que no se borran:`)
      for (const one of loss.trees) console.log(`    ${one.tree} (${one.branch})`)
    }
    console.log('\nNada de esto lo repone un init. Si es lo que querés: repetí con --force.')
    process.exit(1)
  }

  for (const runner of loss.runners) {
    try { A.uninstall(root, runner, console) } catch (error) { console.error(`  ${runner}: ${error.message}`) }
  }
  // El orden no es negociable: primero el wiring, después la carpeta. Al revés, cada llamada de
  // herramienta del runner queda ejecutando un guard que ya no está.
  // En modo embebido la instancia **es** el repositorio: borrar la carpeta se lleva el código del
  // producto, que Cauce nunca escribió y no repone nadie. Ahí se saca lo del toolkit y se deja el repo.
  for (const one of loss.trees) {
    console.log(`  queda ${one.tree} (${one.branch}): si ya no sirve, "git worktree remove ${one.tree}".`)
  }
  for (const file of ignoreFiles(root)) {
    if (IB.remove(file)) console.log(`✓ ${file} sin el bloque de Cauce`)
  }
  if (O.mode(root) === 'embedded') {
    const ownPath = [
      'planning', 'organization', 'flows', 'integrations', 'automatization', 'tools',
      'ops.config.json', '.cauce', 'AGENTS.md',
    ]
    for (const relative of ownPath) fs.rmSync(path.join(root, relative), { recursive: true, force: true })
    console.log(`✓ ${ownPath.length} ruta(s) de Cauce quitadas de ${root}`)
    for (const line of undeclareEngine(path.join(root, 'package.json'))) console.log(`✓ ${line}`)
    const npm = ['node_modules', 'package-lock.json']
      .filter((one) => fs.existsSync(path.join(root, one)))
    if (npm.length) {
      console.log(`  queda ${npm.join(' y ')}: lo escribe npm y puede tener lo tuyo. Borralo vos si el`)
      console.log('  repositorio no usaba npm antes de instalar Cauce.')
    }
    return console.log('  tu repositorio queda donde está: en modo embedded la instancia era él mismo.')
  }
  const inside = process.cwd() === root || process.cwd().startsWith(`${root}${path.sep}`)
  fs.rmSync(root, { recursive: true, force: true })
  console.log(`✓ ${root} borrado`)
  // Correrlo desde adentro es lo natural —ahí está `tools/ops.js`— y deja la terminal en un directorio
  // que ya no existe: el próximo comando falla con un `getcwd` que no dice nada de esto.
  if (inside) console.log('  tu terminal quedó en esa carpeta: hacé "cd .." antes del próximo comando.')
}

module.exports = { destroy }
