'use strict'

const { temporal } = require('./entorno')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const teams = require('../engine/teams/registry')

const ROOT = path.resolve(__dirname, '..')
const CLI = path.join(ROOT, 'engine', 'cli', 'ops.js')

test('product-development referencia agentes existentes y un DAG ordenado', () => {
  const result = teams.validate(ROOT, 'product-development')
  assert.deepEqual(result.errors, [])
  assert.equal(result.stages, 9)
  assert.ok(result.agents >= 15)
  assert.equal(result.manifest.stages[0].id, 'frame')
  assert.equal(result.manifest.stages.at(-1).id, 'learn')
})

test('team check y show exponen un contrato utilizable', () => {
  const env = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }
  delete env.NODE_TEST_CONTEXT
  const checked = spawnSync(process.execPath, [CLI, 'team', 'check', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(checked.status, 0, checked.stderr)
  const shown = spawnSync(process.execPath, [CLI, 'team', 'show', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(shown.status, 0, shown.stderr)
})

test('validador rechaza dependencias posteriores y agentes inexistentes', () => {
  const root = temporal('ops-team-invalid-')
  fs.mkdirSync(path.join(root, 'teams', 'broken'), { recursive: true })
  fs.writeFileSync(path.join(root, 'teams', 'broken', 'WORKFLOW.md'), '# Broken\n')
  fs.writeFileSync(path.join(root, 'teams', 'broken', 'team.json'), JSON.stringify({
    schemaVersion: 1,
    slug: 'broken',
    name: 'Broken',
    purpose: 'Test',
    entryAgent: 'missing-agent',
    facilitator: 'missing-agent',
    stages: [{
      id: 'first', agent: 'missing-agent', dependsOn: ['later'],
      produces: ['nothing'], exitGate: 'Never',
    }],
    guardrails: ['test'],
    completion: ['test'],
  }))
  const result = teams.validate(root, 'broken')
  assert.ok(result.errors.some((error) => error.includes('dependencia inexistente o posterior later')))
  assert.ok(result.errors.some((error) => error.includes('agente inexistente: missing-agent')))
})
