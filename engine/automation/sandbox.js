'use strict'

// Lo que el sandbox de un runner tiene que dejar escribir para que una tarea llegue a commitearse. Codex, con
// `workspace-write`, monta `.git` en sólo lectura: medido con codex-cli 0.163.0, `git switch -c` devuelve «Read-only
// file system» y `$autobuild` termina en una acción humana. El `config.toml` del proyecto abre el `.git` de cada
// repositorio con `sandbox_workspace_write.writable_roots`, en un bloque marcado como el de `ignore-block`, que
// `uninstall` saca.
//
// Abrir `.git` abre también sus hooks y su configuración: por qué eso se frena, en `engine/hooks/git-internals.js`.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const IB = require('../core/ignore-block')
const { declaredRoots } = require('../core/repos')

// Sin las variables de git del entorno: con `GIT_DIR` puesto, `-C` contesta por otro repositorio (caso 045).
const commonDir = (dir) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  const asked = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8', env })
  return asked.status === 0 ? asked.stdout.trim() : ''
}

// El `.git` de la carpeta donde se abre el runner, el de la instancia y el de cada raíz declarada: en sidecar son
// repositorios distintos, y una tarea commitea en el del producto y cierra en el de la instancia.
function gitDirs(root, install) {
  const dirs = [install, root, ...declaredRoots(root).map((one) => one.dir)].filter((dir) => fs.existsSync(dir))
  return [...new Set(dirs.map(commonDir).filter(Boolean))]
}

// Codex resuelve una ruta relativa desde la carpeta del archivo, no desde la del proyecto: `".git"` en
// `.codex/config.toml` es `.codex/.git` (medido). Relativas, el archivo no queda atado a esta máquina.
function wanted(root, install, file) {
  const rel = gitDirs(root, install).map((dir) => JSON.stringify(path.relative(path.dirname(file), dir) || '.'))
  return rel.length ? ['[sandbox_workspace_write]', `writable_roots = [${rel.join(', ')}]`] : []
}

// La tabla, escrita por la persona fuera del bloque: dos tablas con el mismo nombre no son TOML válido, así que la
// suya no se toca, el bloque se saca, y se le dice la línea que falta. Una clave con punto cuenta sólo antes de la
// primera tabla: dentro de `[profiles.x]` es de ese perfil.
function theirs(outside) {
  let top = true
  for (const line of outside.split(/\r?\n/)) {
    if (/^\s*\[\s*["']?sandbox_workspace_write["']?\s*\]/.test(line)) return true
    if (/^\s*\[\[?[^\[\]=]+\]\]?\s*(?:#.*)?$/.test(line)) top = false
    else if (top && /^\s*["']?sandbox_workspace_write["']?\s*[.=]/.test(line)) return true
  }
  return false
}

// Si lo que la persona escribió abre todo lo que hace falta, en cualquier forma de cadena o de ruta.
function opens(outside, file, lines) {
  const at = (one) => path.resolve(path.dirname(file), one)
  const quoted = (text) => [...text.matchAll(/"([^"]*)"|'([^']*)'/g)].map((one) => at(one[1] ?? one[2]))
  const given = new Set([...outside.matchAll(/writable_roots\s*=\s*\[([^\]]*)\]/g)].flatMap((one) => quoted(one[1])))
  return quoted(lines[1]).every((one) => given.has(one))
}

const target = (paths, runner) => path.join(paths.install, runner.sandbox.target)

// Escribe o rehace el bloque. El bloque va al final del archivo, que es donde no le roba las claves sueltas de la
// persona a la tabla. Devuelve qué pasó, para que `install` lo diga.
function write(root, paths, runner) {
  if (!runner.sandbox) return null
  const file = target(paths, runner)
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) return { file, linked: true }
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const { outside, found } = IB.split(text)
  const lines = wanted(root, paths.install, file)
  if (theirs(outside)) {
    if (found) fs.writeFileSync(file, IB.render(outside, []))
    return { file, conflict: lines.length && !opens(outside, file, lines) ? lines[1] : '' }
  }
  const next = IB.render(outside, lines)
  if (next !== text && (lines.length || found)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, next)
  }
  return { file, lines }
}

function install(root, name, paths, runner, output) {
  const done = write(root, paths, runner)
  if (!done) return
  if (done.conflict !== undefined) {
    if (!done.conflict) return
    output.log(`⚠ ${name}: ${done.file} ya tiene su tabla [sandbox_workspace_write] y no la toco; para que el `
      + `sandbox deje commitear, sumale ${done.conflict}`)
  } else if (done.linked) output.log(`⚠ ${name}: ${done.file} es un enlace y no lo escribo`)
  else if (done.lines.length) {
    output.log(`  ${name}: ${done.file} abre el .git de cada repositorio en el sandbox, para poder commitear`)
  }
}

// Saca el bloque, y el archivo si no queda nada más en él.
function remove(paths, runner) {
  if (!runner.sandbox) return false
  const file = target(paths, runner)
  if (!IB.remove(file)) return false
  if (!fs.readFileSync(file, 'utf8').trim()) fs.rmSync(file)
  return true
}

// Lo que `doctor` dice: un bloque que falta o quedó viejo deja a la sesión sin poder commitear, y eso no se ve hasta
// que una tarea llega a Commit.
function problems(root, paths, runner) {
  if (!runner.sandbox) return []
  const file = target(paths, runner)
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const { outside, inside } = IB.split(text)
  const lines = wanted(root, paths.install, file)
  if (!lines.length) return []
  const tail = `sin él, ${runner.command} con workspace-write no puede cortar rama ni commitear`
  if (theirs(outside)) {
    return opens(outside, file, lines) ? []
      : [`${runner.sandbox.target}: tu tabla [sandbox_workspace_write] no abre el .git; sumale ${lines[1]} (${tail})`]
  }
  if (inside.join('\n') !== lines.join('\n')) {
    const state = inside.length ? 'el bloque de Cauce quedó viejo' : 'falta el bloque de Cauce'
    return [`${runner.sandbox.target}: ${state} que abre .git en el sandbox (${tail}); reinstalá el adaptador`]
  }
  return []
}

module.exports = { install, remove, problems }
