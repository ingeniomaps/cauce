'use strict'

// El bloque de `.codex/config.toml` que abre `.git` en el sandbox de Codex. Por qué hace falta, en
// `engine/automation/sandbox.js`. `CODEX_HOME` va a un temporal: la confianza de los hooks vive bajo el home, y una
// prueba no lee la de quien la corre (R23).

const { tempRoot, linkEngine } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
const OPEN = '# >>> cauce'
// Lo que doctor dice del bloque; la ruta del banco también dice «sandbox», así que no alcanza con esa palabra.
const ABOUT = /abre \.git en el sandbox|no abre el \.git/

function sidecar(name) {
  const base = tempRoot(name)
  const workspace = path.join(base, 'repo')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(path.join(base, 'codex-home'), { recursive: true })
  fs.mkdirSync(workspace)
  const env = { ...process.env, CODEX_HOME: path.join(base, 'codex-home') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(spawnSync('git', ['init', '-q', workspace]).status, 0)
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  assert.equal(spawnSync('git', ['init', '-q', target]).status, 0)
  linkEngine(target)
  const config = path.join(workspace, '.codex', 'config.toml')
  return { workspace, target, config, runCli }
}

const said = (result) => `${result.stdout}${result.stderr}`

test('install abre en el sandbox de Codex el .git de cada repositorio, en relativo y en un bloque', () => {
  const { target, config, runCli } = sidecar('cauce-codex-sandbox-')
  fs.mkdirSync(path.dirname(config))
  fs.writeFileSync(config, 'model = "propio"\n')
  const installed = runCli(['automation', 'install', target, 'codex'])
  assert.equal(installed.status, 0, said(installed))
  assert.match(installed.stdout, /abre el \.git de cada repositorio en el sandbox/)
  const text = fs.readFileSync(config, 'utf8')
  // Relativas a `.codex/`, que es desde donde Codex las resuelve: el de la carpeta y el de la instancia.
  assert.match(text, /\[sandbox_workspace_write\]\nwritable_roots = \["\.\.\/\.git", "\.\.\/ops\/\.git"\]/)
  assert.ok(text.startsWith('model = "propio"\n'), 'lo de la persona queda y el bloque va al final')
  assert.ok(text.indexOf(OPEN) > text.indexOf('model'), text)
  assert.doesNotMatch(said(runCli(['automation', 'doctor', target, 'codex'])), ABOUT)

  // Sin el bloque, doctor lo dice; uninstall lo saca y deja lo de la persona.
  fs.writeFileSync(config, 'model = "propio"\n')
  assert.match(said(runCli(['automation', 'doctor', target, 'codex'])), /falta el bloque de Cauce que abre \.git/)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(runCli(['automation', 'uninstall', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(config, 'utf8'), 'model = "propio"\n')
})

test('una tabla [sandbox_workspace_write] de la persona no se toca, y doctor dice qué le falta', () => {
  const { target, config, runCli } = sidecar('cauce-codex-sandbox-propia-')
  fs.mkdirSync(path.dirname(config))
  const own = '[sandbox_workspace_write]\nnetwork_access = true\n'
  fs.writeFileSync(config, own)
  const installed = runCli(['automation', 'install', target, 'codex'])
  assert.equal(installed.status, 0, said(installed))
  assert.match(installed.stdout, /ya tiene su tabla \[sandbox_workspace_write\] y no la toco; .* sumale writable_roots/)
  assert.equal(fs.readFileSync(config, 'utf8'), own, 'dos tablas iguales no serían TOML válido')
  assert.match(said(runCli(['automation', 'doctor', target, 'codex'])), /tu tabla \[sandbox_workspace_write\] no abre/)
  // Abierto en cualquier forma —comillas simples, una ruta absoluta— alcanza.
  fs.writeFileSync(config, `${own}writable_roots = ['../.git', "${path.dirname(config)}/../ops/.git"]\n`)
  assert.doesNotMatch(said(runCli(['automation', 'doctor', target, 'codex'])), ABOUT)
  assert.doesNotMatch(runCli(['automation', 'install', target, 'codex']).stdout, /sumale/)
})

test('una tabla propia que aparece después saca el bloque, y una clave con punto de otra tabla no es la suya', () => {
  const { target, config, runCli } = sidecar('cauce-codex-sandbox-despues-')
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  fs.appendFileSync(config, '\n[sandbox_workspace_write]\nnetwork_access = true\n')
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  const text = fs.readFileSync(config, 'utf8')
  assert.equal(text.match(/\[sandbox_workspace_write\]/g).length, 1, text)
  assert.doesNotMatch(text, new RegExp(OPEN))

  // Las otras formas de escribir la misma tabla también son la suya: con el bloque, el TOML no cargaría.
  for (const own of ["['sandbox_workspace_write']\nnetwork_access = true\n",
    'sandbox_workspace_write = { network_access = true }\n']) {
    fs.writeFileSync(config, own)
    assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
    assert.equal(fs.readFileSync(config, 'utf8'), own)
  }

  // Un arreglo de varias líneas no es una tabla: la clave con punto de después sigue siendo del nivel superior.
  const matrix = 'matrix = [\n  ["a"],\n]\nsandbox_workspace_write.network_access = true\n'
  fs.writeFileSync(config, matrix)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(config, 'utf8'), matrix)

  fs.writeFileSync(config, '[profiles.x]\nsandbox_workspace_write.network_access = true\n')
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.match(fs.readFileSync(config, 'utf8'), /\[profiles\.x\][\s\S]*# >>> cauce\n.*\n\[sandbox_workspace_write\]/)
})

test('sin git no hay nada que abrir, y un config.toml que no existía se va con uninstall', () => {
  const base = tempRoot('cauce-codex-sandbox-sin-git-')
  const env = { ...process.env, CODEX_HOME: path.join(base, 'codex-home') }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  const target = path.join(base, 'repo', 'ops')
  assert.equal(runCli(['init', target, '--name', 'P', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  const loose = path.join(base, 'repo', '.codex', 'config.toml')
  assert.equal(fs.existsSync(loose), false)
  // Con una tabla propia y sin git tampoco hay nada que pedirle: install termina y no la toca.
  fs.writeFileSync(loose, '[sandbox_workspace_write]\nnetwork_access = true\n')
  const again = runCli(['automation', 'install', target, 'codex'])
  assert.equal(again.status, 0, said(again))
  assert.equal(fs.readFileSync(loose, 'utf8'), '[sandbox_workspace_write]\nnetwork_access = true\n')
  // Y un bloque de antes, de cuando la carpeta tenía git, se va: con la tabla propia serían dos.
  fs.appendFileSync(loose, '\n# >>> cauce\n[sandbox_workspace_write]\nwritable_roots = ["../.git"]\n# <<< cauce\n')
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(loose, 'utf8'), '[sandbox_workspace_write]\nnetwork_access = true\n')
  const block = '# >>> cauce\n[sandbox_workspace_write]\nwritable_roots = ["../.git"]\n# <<< cauce\n'
  fs.writeFileSync(loose, `model = "x"\n\n${block}`)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(loose, 'utf8'), 'model = "x"\n', 'sin git, el bloque viejo no abre nada')

  const { config, runCli: inRepo, target: other } = sidecar('cauce-codex-sandbox-nuevo-')
  assert.equal(inRepo(['automation', 'install', other, 'codex']).status, 0)
  assert.ok(fs.existsSync(config))
  assert.equal(inRepo(['automation', 'uninstall', other, 'codex']).status, 0)
  assert.equal(fs.existsSync(config), false)
})
