'use strict'

// El guard `dependencies`: un manifiesto y su lockfile viajan juntos en un commit, y publicar o instalar
// global pide una persona. Es del grupo `pre-shell`, pero a diferencia de los de `shell.js` no decide sólo
// con el texto del comando: lee el índice y los dos lados del `package.json`. Vive aparte desde el caso 407,
// porque lo que lo hace cambiar es la medición de un gestor nuevo, no una forma nueva de esquivar un guard.

const fs = require('node:fs')
const path = require('node:path')
const { commandOf, cwdOf, block, isCommit, stagedForCommit, opsRoot } = require('./input')
const AP = require('./approval')
const { run, MISMO } = require('./shell')

// Un `package.json` cambia sin tocar nada de lo que su lockfile registra: un script, una descripción, la
// configuración de una herramienta. Frenar eso por la sola presencia del archivo en el índice obligaba a
// pedir permiso por un cambio sin riesgo (caso 181). Se deja pasar sólo lo medido, y lo demás frena como
// antes, incluido lo que no se puede comparar.
//
// La lista salió de correr `npm install --package-lock-only` con npm 11.16.0 cambiando una clave por vez:
// las claves name, version, license, engines, bin, funding, workspaces, os y cpu, y los scripts preinstall,
// install y postinstall, sí mueven el lock. Con pnpm 10.30.2 y `pnpm install --lockfile-only`, la misma
// medición: todas éstas son inertes también —incluidos los scripts de instalación y las claves que npm sí
// registra—, y lo que mueve su lock es `pnpm.overrides`, `resolutions` y `pnpm.patchedDependencies`, que no
// están en la lista y por eso no aflojan (caso 375). Los scripts de instalación se siguen tratando como en
// npm: es más estricto que lo medido y cuesta un rechazo raro, no un lock viejo. yarn y bun siguen sin medir.
const INERT_KEYS = new Set([
  'scripts', 'description', 'keywords', 'author', 'repository', 'homepage', 'bugs', 'private', 'type',
  'main', 'files', 'exports', 'config', 'jest', 'eslintConfig', 'prettier',
])
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall']
// Un solo lockfile, de un gestor medido. Dos a la vez no aflojan: cuál manda lo decide el gestor que corra.
const MEASURED_LOCKS = new Set(['package-lock.json', 'pnpm-lock.yaml'])

function lockUnaffected(dir, file, lockfiles) {
  if (path.basename(file) !== 'package.json' || !MEASURED_LOCKS.has(lockfiles.join())) return false
  const read = (ref) => {
    const shown = run('git', ['-C', dir, 'show', `${ref}:${file}`], dir)
    if (!shown.ok) return null
    try { return JSON.parse(shown.output) } catch { return null }
  }
  const before = read('HEAD')
  const after = read('')
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false
  const same = (one, other) => JSON.stringify(one) === JSON.stringify(other)
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !same(before[key], after[key]))
  if (changed.some((key) => !INERT_KEYS.has(key))) return false
  const scripts = (one) => (one && typeof one.scripts === 'object' ? one.scripts : {}) || {}
  return INSTALL_SCRIPTS.every((name) => same(scripts(before)[name], scripts(after)[name]))
}

function dependencies(input) {
  if (process.env.OPS_DEPENDENCIES_OVERRIDE === '1') return
  const command = commandOf(input)
  const unsafePackageCommand = /\b(?:npm|pnpm|yarn|bun)\s+publish\b/.test(command)
    || new RegExp(String.raw`\b(?:npm|pnpm|yarn)\s+(?:install|add)\b${MISMO}*(?:\s-g\b|\s--global\b)`)
      .test(command)
  if (unsafePackageCommand) {
    block('Publicar paquetes o instalar dependencias globales requiere una acción humana explícita.')
  }
  if (!isCommit(command)) return
  const { dir, staged } = stagedForCommit(command, cwdOf(input), input)
  const manifests = new Set(['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'])
  const locks = new Set([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'poetry.lock',
    'uv.lock',
    'go.sum',
    'Cargo.lock',
  ])
  const byDir = new Map()
  for (const file of staged) {
    const base = path.basename(file)
    if (!manifests.has(base) && !locks.has(base)) continue
    const parent = path.dirname(file)
    const state = byDir.get(parent) || { manifests: [], locks: [] }
    state[manifests.has(base) ? 'manifests' : 'locks'].push(base)
    byDir.set(parent, state)
  }
  // Lo que se juzga acá es el archivo staged, así que la aprobación por ruta lo expresa: autorizar
  // `package.json` dice «este manifiesto va sin su lock a propósito» y deja de valer en cuanto el
  // conjunto cambie. La rama de publicar no pasa por acá y no tiene ruta: sigue arriba, con su variable.
  const sinAprobar = (parent, names) => AP.pendingNow(opsRoot(input),
    names.map((name) => path.posix.join(parent === '.' ? '' : parent, name)), input)
  // Un lock cuenta si está en disco **o** si el commit lo va a llevar, y la unión no es un detalle: el
  // disco solo perdía el que alguien borró del árbol sin stagear el borrado —sigue en el índice, sigue
  // en el próximo commit— y ahí la comprobación dejaba de dispararse justo cuando más hacía falta. Es
  // la misma forma que `verify` en chico. El índice se lee una vez y sólo si hay algo que decidir.
  const index = byDir.size ? run('git', ['-C', dir, 'ls-files'], dir) : { ok: true, output: '' }
  if (!index.ok) {
    block(`no se pudo leer el índice de ${dir}, así que no hay cómo saber qué lockfiles va a llevar el `
      + 'commit.')
  }
  const enElIndice = new Set(index.output.split('\n').filter(Boolean))
  for (const [parent, state] of byDir) {
    const enParent = (name) => (parent === '.' ? name : path.posix.join(parent, name))
    // La regla de «varios lockfiles» sí es sobre el disco y sólo sobre el disco: lo que rompe ahí es que
    // el gestor que corra elija uno, y el que corre lee el árbol.
    const onDisk = [...locks].filter((name) => fs.existsSync(path.join(dir, parent, name)))
    const existingLocks = [...new Set([...onDisk, ...[...locks].filter((n) => enElIndice.has(enParent(n)))])]
    if (onDisk.length > 1) {
      block(`${parent}: hay varios lockfiles (${onDisk.join(', ')}). Conserva uno solo.`)
    }
    const manifests = sinAprobar(parent, state.manifests)
      .filter((name) => !lockUnaffected(dir, name, existingLocks))
    if (state.manifests.length && existingLocks.length && !state.locks.length && manifests.length) {
      // Un lock que ya no está en disco pero sigue en el índice impide aflojar y no se ve: se nombra.
      const stale = existingLocks.filter((name) => !onDisk.includes(name))
      block(`${parent}: cambió ${state.manifests.join(', ')} sin actualizar su lockfile.\n`
        + (stale.length ? `Hay otro lockfile en el índice y no en disco —${stale.join(', ')}—: con dos, un `
          + 'manifiesto que no toca dependencias tampoco afloja. Si ya no se usa, sacalo del índice.\n' : '')
        + AP.HOW('OPS_DEPENDENCIES_OVERRIDE', manifests, input))
    }
    const lockfiles = sinAprobar(parent, state.locks)
    if (state.locks.length && !state.manifests.length && lockfiles.length) {
      block(`${parent}: cambió ${state.locks.join(', ')} sin un cambio explícito en el manifest.\n`
        + AP.HOW('OPS_DEPENDENCIES_OVERRIDE', lockfiles, input))
    }
  }
}

module.exports = { dependencies }
