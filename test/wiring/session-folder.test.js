'use strict'

// `install` dice en qué carpeta tiene que abrirse la sesión para que corran los guards. Por qué hace falta decirlo
// está en el comentario del aviso, en `engine/automation/index.js` (caso 393).

const { tempRoot, linkEngine, installedProject } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
const NOTICE = /los guards corren en una sesión abierta en/

test('en sidecar, install dice dónde abrir la sesión, y a Antigravity le da su flag', () => {
  const { workspace, target, runCli } = installedProject('cauce-sesion-sidecar-')
  for (const runner of ['claude', 'codex', 'gemini', 'antigravity']) {
    const out = runCli(['automation', 'install', target, runner])
    assert.equal(out.status, 0, out.stderr)
    assert.ok(out.stdout.includes(`${runner}: los guards corren en una sesión abierta en ${workspace}`), out.stdout)
    const escape = `agy --add-dir ${workspace}`
    if (runner === 'antigravity') assert.ok(out.stdout.includes(escape), out.stdout)
    else assert.ok(!out.stdout.includes('--add-dir'), `${runner}: no tiene un flag medido que cargue otra carpeta`)
  }
})

// En un repo git que es a la vez la carpeta de instalación, toda subcarpeta queda dentro de la búsqueda del
// runner y no hay repo de producto aparte: el aviso sería ruido.
test('embebido en la raíz de un repo git, install no avisa', () => {
  const repo = path.join(tempRoot('cauce-sesion-embebido-'), 'app')
  fs.mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0)
  const env = { ...process.env }
  for (const key of ['NODE_TEST_CONTEXT', 'OPS_ROOT', 'CLAUDE_PROJECT_DIR']) delete env[key]
  const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
  assert.equal(runCli(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  linkEngine(repo)
  const out = runCli(['automation', 'install', repo, 'antigravity'])
  assert.equal(out.status, 0, out.stderr)
  assert.doesNotMatch(out.stdout, NOTICE)
})
