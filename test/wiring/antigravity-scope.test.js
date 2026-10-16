'use strict'

// El puente de Antigravity opina sólo sobre su proyecto (caso 392). `agy` 1.4.0 descubre el plugin del proyecto en
// `.agents/plugins/` y le manda `workspacePaths` con la carpeta de trabajo. Una copia registrada a nivel global corre
// en toda carpeta sin plugin propio, con la raíz del proyecto que la registró. Ahí lo que corresponde es abstenerse,
// no decidir con las reglas de otro (R26).

const { installedProject } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// El puente instalado, lanzado como lo lanza `agy` desde una copia global: desde su carpeta, que no es el proyecto.
function asGlobalCopy(base, workspace, env) {
  const copy = path.join(base, 'global', 'hook.js')
  fs.mkdirSync(path.dirname(copy), { recursive: true })
  fs.copyFileSync(path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js'), copy)
  return (event, payload) => {
    const answer = spawnSync(process.execPath, [copy, event],
      { cwd: path.dirname(copy), input: JSON.stringify(payload), encoding: 'utf8', env })
    return JSON.parse(answer.stdout.trim())
  }
}

test('el puente se abstiene en una carpeta que no es su proyecto', () => {
  const { base, workspace, env } = installedProject('cauce-agy-scope-', 'antigravity')
  const answer = asGlobalCopy(base, workspace, env)
  const elsewhere = path.join(base, 'otro-proyecto')
  fs.mkdirSync(elsewhere)
  const push = (where) => ({ workspacePaths: [where], toolCall: { args: { CommandLine: 'git push', Cwd: where } } })

  // Fuera de su proyecto, ni un `git push` lo frena: no es suyo juzgarlo.
  const outside = answer('pre-shell', push(elsewhere))
  assert.deepEqual(outside, { decision: 'allow' })
  assert.deepEqual(answer('stop', { workspacePaths: [elsewhere] }), { decision: 'stop' })

  // En su proyecto sigue juzgando igual que siempre.
  const inside = answer('pre-shell', push(workspace))
  assert.equal(inside.decision, 'deny')
  assert.match(inside.reason, /git push/)
})

// Un `agy` que no manda la carpeta de trabajo —el que se midió el 2026-09-23— no le deja al puente con qué
// decidir que está afuera. Ahí sigue usando la raíz que dejó escrita la instalación, que es lo que hacía.
test('sin carpeta de trabajo en el payload, el puente sigue juzgando con su raíz', () => {
  const { base, workspace, env } = installedProject('cauce-agy-scope-legacy-', 'antigravity')
  const answer = asGlobalCopy(base, workspace, env)
  const legacy = answer('pre-shell',
    { workspacePaths: [], toolCall: { args: { CommandLine: 'git push', Cwd: os.homedir() } } })
  assert.equal(legacy.decision, 'deny')
  assert.match(legacy.reason, /git push/)
})
