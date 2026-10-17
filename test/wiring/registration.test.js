'use strict'

// Qué dicen `install` y `doctor` de una copia del plugin registrada para todo el usuario. Por qué sobra está en
// `engine/automation/registration.js` (caso 392). `HOME` va a un temporal: la copia vive bajo el home, y una prueba
// no lee ni escribe el de quien la corre (R23).

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
  const env = { ...process.env, HOME: home }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  const plugin = path.join(workspace, '.agents', 'plugins', 'cauce')
  const registered = path.join(home, '.gemini', 'config', 'plugins', 'cauce')
  // Lo que hacía `agy plugin install .agents/plugins/cauce`: copiar el plugin a la carpeta del usuario.
  const register = () => fs.cpSync(plugin, registered, { recursive: true })
  return { home, target, register, runCli }
}

function doctorWithHome(home, target) {
  const A = require('../../engine/automation')
  const before = process.env.HOME
  process.env.HOME = home
  try { return A.doctor(target, 'antigravity', quiet) } finally { process.env.HOME = before }
}

test('install no pide registrar el plugin a nivel global', () => {
  const project = antigravityProject('cauce-registro-')
  const install = project.runCli(['automation', 'install', project.target, 'antigravity'])
  assert.equal(install.status, 0, install.stderr)
  assert.doesNotMatch(install.stdout + install.stderr, /agy plugin install/)
  assert.deepEqual(doctorWithHome(project.home, project.target).errors, [])
})

test('una copia registrada a nivel global sobra, y doctor dice cómo quitarla', () => {
  const project = antigravityProject('cauce-registro-global-')
  assert.equal(project.runCli(['automation', 'install', project.target, 'antigravity']).status, 0)
  project.register()
  const stray = doctorWithHome(project.home, project.target).errors
  assert.ok(stray.some((error) => /toda carpeta/.test(error) && /agy plugin uninstall cauce/.test(error)),
    stray.join('\n'))
  // Al instalar es una advertencia: el plugin del proyecto ya quedó bien, lo que sobra está afuera.
  const again = project.runCli(['automation', 'install', project.target, 'antigravity'])
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout + again.stderr, /agy plugin uninstall cauce/)
})

test('un plugin ajeno que se llama cauce no es asunto de doctor', () => {
  const project = antigravityProject('cauce-registro-ajeno-')
  assert.equal(project.runCli(['automation', 'install', project.target, 'antigravity']).status, 0)
  const foreign = path.join(project.home, '.gemini', 'config', 'plugins', 'cauce')
  fs.mkdirSync(foreign, { recursive: true })
  fs.writeFileSync(path.join(foreign, 'hook.js'), 'process.stdout.write("{}")\n')
  assert.deepEqual(doctorWithHome(project.home, project.target).errors, [])
})
