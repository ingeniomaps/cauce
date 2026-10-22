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

// Los hooks de Codex que nadie confió (caso 434). `CODEX_HOME` va a un temporal: la confianza vive bajo el home, y una
// prueba no lee la de quien la corre (R23). Qué cuenta como confiado, en `trustProblems`.
test('doctor da error con los hooks de Codex sin confiar, y calla cuando están confiados', () => {
  const base = tempRoot('cauce-codex-trust-')
  const codexHome = path.join(base, 'codex-home')
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(codexHome)
  fs.mkdirSync(workspace)
  const env = { ...process.env, CODEX_HOME: codexHome }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  const hooks = path.join(workspace, '.codex', 'hooks.json')

  const untrusted = runCli(['automation', 'doctor', target, 'codex'])
  assert.notEqual(untrusted.status, 0)
  assert.match(`${untrusted.stdout}${untrusted.stderr}`, /4 hook\(s\) de .*hooks\.json sin confiar en .*config\.toml/)

  // Confiados los cuatro como los anota Codex —una entrada por hook, con su evento en snake_case—, calla. Con uno
  // de menos, lo cuenta.
  const keys = ['pre_tool_use:0:0', 'pre_tool_use:1:0', 'user_prompt_submit:0:0', 'session_end:0:0']
  const entry = (key) => `[hooks.state."${hooks}:${key}"]\ntrusted_hash = "sha256:x"\n`
  fs.writeFileSync(path.join(codexHome, 'config.toml'), keys.map(entry).join('\n'))
  const trusted = runCli(['automation', 'doctor', target, 'codex'])
  assert.doesNotMatch(`${trusted.stdout}${trusted.stderr}`, /sin confiar/)
  fs.writeFileSync(path.join(codexHome, 'config.toml'), keys.slice(1).map(entry).join('\n'))
  const one = runCli(['automation', 'doctor', target, 'codex'])
  assert.match(`${one.stdout}${one.stderr}`, /1 hook\(s\) de .* sin confiar/)
})

// Lo que `trustProblems` hace con lo que no tiene la forma esperada: sin `CODEX_HOME` busca en el home —un temporal
// acá, nunca el de quien corre la prueba—, y un `hooks.json` ilegible o con otra forma no inventa hooks que faltan.
test('la confianza de Codex sin CODEX_HOME se busca en el home, y un hooks.json raro no cuenta hooks', () => {
  const { registrationProblems } = require('../../engine/automation/registration')
  const runner = require('../../automatization/runners/codex/manifest.json')
  const base = tempRoot('cauce-codex-trust-forma-')
  const file = path.join(base, 'hooks.json')
  const previous = { CODEX_HOME: process.env.CODEX_HOME, HOME: process.env.HOME }
  delete process.env.CODEX_HOME
  process.env.HOME = base
  try {
    fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'x' }] }] } }))
    assert.match(registrationProblems({ configTarget: file }, runner).join('\n'),
      new RegExp(`1 hook\\(s\\) .* sin confiar en ${path.join(base, '.codex', 'config.toml')}`))
    fs.mkdirSync(path.join(base, '.codex'))
    fs.writeFileSync(path.join(base, '.codex', 'config.toml'), `[hooks.state."${file}:pre_tool_use:0:0"]\n`)
    assert.deepEqual(registrationProblems({ configTarget: file }, runner), [])
    const shapes = ['{', '{}', JSON.stringify({ hooks: { PreToolUse: 'x' } }),
      JSON.stringify({ hooks: { Stop: [{}] } })]
    for (const shape of shapes) {
      fs.writeFileSync(file, shape)
      assert.deepEqual(registrationProblems({ configTarget: file }, runner), [], shape)
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
