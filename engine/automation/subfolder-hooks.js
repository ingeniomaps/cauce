'use strict'

// Los guards de Claude Code en una sesión abierta en una subcarpeta del proyecto. Medido con Claude Code 2.1.325: una
// sesión lee el `.claude/settings.json` sólo de la carpeta donde se abre, y el `.claude/settings.local.json` también
// de la raíz git; `CLAUDE_PROJECT_DIR` es la carpeta donde se abrió; y un mismo comando declarado en los dos archivos
// corre una vez. Abierta en una subcarpeta, no cargaba ni un hook de Cauce, y nada lo decía.
//
// `install` suma los mismos hooks al `settings.local.json` de la raíz git, con la ruta real de la instalación, y cada
// uno corre sólo si la sesión se abrió **debajo** de ella: en la instalación misma ya corren los de `settings.json`, y
// fuera de ella —la raíz de un monorepo, la carpeta de otra instancia— no le toca opinar (R26). El archivo es de esta
// máquina, así que la ruta absoluta no ata a nadie más; va al bloque de Cauce del `.gitignore`.
//
// Se escribe sólo en el repositorio del proyecto, con el criterio del bloque del `.gitignore` (caso 513): el que tiene
// su raíz en la carpeta de instalación o en la de la instancia. Uno de más arriba no es del proyecto. Tampoco en uno
// que contiene el home —uno de dotfiles—, que todo lo que se abra bajo el home cargaría, ni en un
// `settings.local.json` versionado, que llevaría la ruta de esta máquina a todos.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const IB = require('../core/ignore-block')
const { runnerConfig } = require('./runners')

// El prefijo vive con quien lo lee al correr el guard.
const { opener, quoted } = require('../hooks/nearer-install')

const git = (dir, ...args) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env })
}

// Dónde va el archivo, o por qué no va.
function target(root, paths, runner) {
  if (!runner.subfolderConfig || !fs.existsSync(paths.install)) return null
  const install = fs.realpathSync(paths.install)
  const asked = git(install, 'rev-parse', '--show-toplevel')
  if (asked.status !== 0) return null
  const repo = fs.realpathSync(asked.stdout.trim())
  if (repo !== install && repo !== fs.realpathSync(root)) return null
  const file = path.join(repo, runner.subfolderConfig)
  const home = fs.realpathSync(os.homedir())
  if (home === repo || home.startsWith(repo === path.sep ? repo : `${repo}${path.sep}`)) {
    return { file, repo, install, refused: 'home' }
  }
  if (git(repo, 'ls-files', '--error-unmatch', '--', runner.subfolderConfig).status === 0) {
    return { file, repo, install, refused: 'tracked' }
  }
  return { file, repo, install }
}

// Los hooks de `settings.json`, con `$CLAUDE_PROJECT_DIR` cambiado por la instalación y la condición alrededor.
function wanted(config, install) {
  const hooks = {}
  for (const [event, groups] of Object.entries(config.hooks || {})) {
    hooks[event] = groups.map((group) => ({ ...group, hooks: (group.hooks || []).map((hook) => ({ ...hook,
      command: `${opener(install)}CAUCE_SUBFOLDER_OF=${quoted(install)} `
        + `${hook.command.replace(/^\$CLAUDE_PROJECT_DIR(?=\/)/, () => quoted(install))} ;; esac`,
    })) }))
  }
  return hooks
}

// Si la forma es la que Claude Code lee: `hooks` es un objeto de listas de grupos, y cada grupo trae su lista.
const shaped = (config) => config && typeof config === 'object' && !Array.isArray(config)
  && (config.hooks === undefined || (typeof config.hooks === 'object' && !Array.isArray(config.hooks)
    && Object.values(config.hooks).every((groups) => Array.isArray(groups)
      && groups.every((group) => group && typeof group === 'object' && (group.hooks === undefined
        || (Array.isArray(group.hooks) && group.hooks.every((hook) => hook && typeof hook === 'object')))))))

// Los hooks del archivo que cumplen `keep`, sin grupos ni eventos vacíos.
function only(config, keep) {
  const hooks = {}
  for (const [event, groups] of Object.entries(config.hooks || {})) {
    const kept = groups.map((group) => ({ ...group, hooks: (group.hooks || []).filter((hook) => keep(hook.command)) }))
      .filter((group) => group.hooks.length)
    if (kept.length) hooks[event] = kept
  }
  return hooks
}

// El archivo sin las entradas de esta instalación; las de otra instancia del mismo repositorio quedan, y un grupo o un
// evento que ya estaba vacío también: sólo se va lo que quedó vacío por sacar lo nuestro.
function without(config, install) {
  const mine = (hook) => String(hook.command).startsWith(opener(install))
  const hooks = {}
  for (const [event, groups] of Object.entries(config.hooks || {})) {
    const kept = groups.filter((group) => !(group.hooks || []).length || !group.hooks.every(mine))
      .map((group) => (group.hooks ? { ...group, hooks: group.hooks.filter((hook) => !mine(hook)) } : group))
    if (kept.length || !groups.length) hooks[event] = kept
  }
  const rest = { ...config }
  delete rest.hooks
  const emptied = !Object.keys(hooks).length && Object.keys(config.hooks || {}).length
  return config.hooks === undefined || emptied ? rest : { ...rest, hooks }
}

const canonical = (hooks) => JSON.stringify(Object.keys(hooks).sort().map((event) => [event, hooks[event]]))

// El archivo leído, o por qué no se puede tocar.
function read(file) {
  if (!fs.existsSync(file)) return { config: {} }
  if (fs.lstatSync(file).isSymbolicLink()) return { why: 'es un enlace' }
  let config
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    return { why: `no es JSON válido (${error.message})` }
  }
  return shaped(config) ? { config } : { why: 'no tiene la forma de hooks que lee Claude Code' }
}

const REFUSED = {
  home: 'su raíz git contiene tu home, y lo cargaría toda sesión abierta bajo el home',
  tracked: 'está versionado, y llevaría la ruta de esta máquina al repositorio',
}

function install(root, paths, runner, name, output) {
  const at = target(root, paths, runner)
  if (!at) return
  const lost = 'una sesión abierta en una subcarpeta corre sin guards'
  if (at.refused) {
    output.log(`⚠ ${name}: no escribo ${at.file}: ${REFUSED[at.refused]}; ${lost}`)
    return
  }
  const { config, why } = read(at.file)
  if (why) {
    output.log(`⚠ ${name}: ${at.file} ${why} y no lo toco: ${lost}`)
    return
  }
  const clean = without(config, at.install)
  const hooks = { ...(clean.hooks || {}) }
  for (const [event, groups] of Object.entries(wanted(runnerConfig(paths, root), at.install))) {
    hooks[event] = [...(hooks[event] || []), ...groups]
  }
  F.atomicWriteJson(at.file, { ...clean, hooks })
  IB.add(path.join(at.repo, '.gitignore'), [path.relative(at.repo, at.file)], at.repo)
  output.log(`  ${name}: ${at.file} lleva los guards a una sesión abierta en una subcarpeta`)
}

function remove(root, paths, runner) {
  const at = target(root, paths, runner)
  if (!at || at.refused || !fs.existsSync(at.file)) return false
  const { config, why } = read(at.file)
  if (why) return false
  const clean = without(config, at.install)
  if (JSON.stringify(clean) === JSON.stringify(config)) return false
  if (Object.keys(clean).length) F.atomicWriteJson(at.file, clean)
  else fs.rmSync(at.file)
  return true
}

// Lo que `doctor` dice: sin estas entradas, una sesión abierta en una subcarpeta trabaja sin un solo guard. Lo que
// reinstalar no arregla se dice con lo que sí lo arregla.
function problems(root, paths, runner) {
  const at = target(root, paths, runner)
  if (!at || at.refused === 'home') return []
  if (at.refused) return [`${at.file} ${REFUSED[at.refused]}: sacalo del repositorio y reinstalá el adaptador`]
  const { config, why } = read(at.file)
  if (why) return [`${at.file} ${why}: corregilo y reinstalá el adaptador, o una sesión abierta en una subcarpeta `
    + 'corre sin guards']
  const ours = only(config, (command) => String(command).startsWith(opener(at.install)))
  if (canonical(ours) === canonical(wanted(runnerConfig(paths, root), at.install))) return []
  return [`${at.file}: faltan o quedaron viejos los guards de una sesión abierta en una subcarpeta; reinstalá el `
    + 'adaptador']
}

// Si una sesión abierta en una subcarpeta lleva los guards.
const covers = (root, paths, runner) => {
  const at = target(root, paths, runner)
  return Boolean(at && !at.refused)
}

module.exports = { install, remove, problems, covers }
