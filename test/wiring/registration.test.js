'use strict'

// La copia que un runner ejecuta de verdad no siempre es la del workspace: `agy` corre la que registra
// `agy plugin install`, una por usuario (caso 201). `doctor` tiene que mirar ésa. `HOME` va a un temporal:
// la copia registrada vive bajo el home, y una prueba no lee ni escribe el de quien la corre (R23).

const { tempRoot, linkEngine } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
const quiet = { warn() {}, error() {}, log() {} }

function antigravityProject(name) {
  const base = tempRoot(name)
  const home = path.join(base, 'home')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(home)
  fs.mkdirSync(workspace)
  // Doble de `agy`: contesta `plugin list` con un `cauce` registrado, que es lo que dice el `agy` de quien ya
  // registró otro proyecto. Sin él, la prueba dependería del `agy` —o de su ausencia— en la máquina que corre.
  const bin = path.join(base, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'agy'), '#!/bin/sh\necho \'{"imports":[{"name":"cauce"}]}\'\n', { mode: 0o755 })
  const env = { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  const plugin = path.join(workspace, '.agents', 'plugins', 'cauce')
  const registered = path.join(home, '.gemini', 'config', 'plugins', 'cauce')
  // Lo que hace `agy plugin install .agents/plugins/cauce`: copiar el plugin a la carpeta del usuario.
  const register = () => fs.cpSync(plugin, registered, { recursive: true })
  return { home, workspace, target, plugin, registered, register, runCli }
}

function doctorWithHome(home, target) {
  const A = require('../../engine/automation')
  const before = process.env.HOME
  process.env.HOME = home
  try { return A.doctor(target, 'antigravity', quiet) } finally { process.env.HOME = before }
}

test('doctor mira la copia que el runner ejecuta, no sólo la del workspace', () => {
  const project = antigravityProject('cauce-registro-')
  const install = project.runCli(['automation', 'install', project.target, 'antigravity'])
  assert.equal(install.status, 0, install.stderr)

  // Registrada igual que la del workspace: nada que decir.
  project.register()
  assert.deepEqual(doctorWithHome(project.home, project.target).errors, [])

  // La copia registrada es la de otro proyecto, con el wiring viejo que resolvía contra el workspace: el
  // runner la lanza desde su carpeta y no arranca. Es lo que se vio con `agy` real en el 201.
  const hooks = path.join(project.registered, 'hooks.json')
  const oldWiring = fs.readFileSync(hooks, 'utf8').replace(/"node hook\.js /g, '"node .agents/plugins/cauce/hook.js ')
  fs.writeFileSync(hooks, oldWiring)
  const stale = doctorWithHome(project.home, project.target)
  const named = /ejecuta .*plugins\/cauce, que no es esta instalación.*hooks\.json/
  assert.ok(stale.errors.some((error) => named.test(error)), 'nombra la copia que difiere y qué archivo')
  const fix = /agy plugin install \.agents\/plugins\/cauce/
  assert.ok(stale.errors.some((error) => fix.test(error)), 'y cómo se corrige')
  assert.ok(stale.errors.some((error) => /registrada.*pre-shell.*Cannot find module/s.test(error)),
    'y la lanza como el runner, desde su carpeta, que es donde se ve que no arranca')
})

test('al instalar, una copia registrada vieja es el paso siguiente y no un error', () => {
  const project = antigravityProject('cauce-registro-install-')
  assert.equal(project.runCli(['automation', 'install', project.target, 'antigravity']).status, 0)
  project.register()
  fs.appendFileSync(path.join(project.registered, 'hook.js'), '\n// de otra instalación\n')
  const again = project.runCli(['automation', 'install', project.target, 'antigravity'])
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout + again.stderr, /no es esta instalación/)
  assert.match(again.stdout + again.stderr, /agy plugin install \.agents\/plugins\/cauce/)
})

// Una copia registrada que no contesta —un puente viejo que lee stdin sin plazo, un guard colgado— no puede
// colgar a `doctor`: lanzarla lleva tope, y agotarlo es el diagnóstico.
test('una copia registrada que no contesta no cuelga a doctor', () => {
  const project = antigravityProject('cauce-registro-colgado-')
  assert.equal(project.runCli(['automation', 'install', project.target, 'antigravity']).status, 0)
  project.register()
  fs.writeFileSync(path.join(project.registered, 'hook.js'), 'setInterval(() => {}, 1000)\n')
  const started = Date.now()
  const hung = doctorWithHome(project.home, project.target)
  assert.ok(Date.now() - started < 25000, 'terminó con un solo tope y no esperando a la copia')
  assert.ok(hung.errors.some((error) => /no respondió en \d+ s/.test(error)), hung.errors.join('\n'))
})
