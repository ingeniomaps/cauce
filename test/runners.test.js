'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', 'automatization', 'runners')

test('cada runner declara un manifest instalable y fuentes existentes', () => {
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const dir = path.join(root, name)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.name, name)
    assert.equal(typeof manifest.capabilities.nativeHooks, 'boolean')
    assert.equal(fs.existsSync(path.resolve(dir, manifest.config.source)), true)
    for (const item of [...manifest.instructions, ...manifest.artifacts]) {
      assert.equal(fs.existsSync(path.resolve(dir, item.source)), true, `${name}: ${item.source}`)
    }
  }
})

test('las capacidades declaradas coinciden con los artefactos reales', () => {
  const claude = JSON.parse(fs.readFileSync(path.join(root, 'claude', 'manifest.json'), 'utf8'))
  const codex = JSON.parse(fs.readFileSync(path.join(root, 'codex', 'manifest.json'), 'utf8'))
  const gemini = JSON.parse(fs.readFileSync(path.join(root, 'gemini', 'manifest.json'), 'utf8'))
  const antigravity = JSON.parse(fs.readFileSync(path.join(root, 'antigravity', 'manifest.json'), 'utf8'))
  assert.equal(claude.capabilities.nativeHooks, true)
  assert.equal(claude.capabilities.nativeWorkflows, true)
  assert.equal(codex.capabilities.nativeHooks, true)
  assert.equal(gemini.capabilities.nativeHooks, false)
  assert.equal(gemini.capabilities.checkpointing, true)
  assert.equal(antigravity.command, 'agy')
  assert.equal(antigravity.capabilities.nativeHooks, true)
  assert.equal(antigravity.capabilities.nativeWorkflows, true)
  assert.equal(antigravity.lifecycle.recommendedForNewProjects, true)
  const geminiSettings = JSON.parse(fs.readFileSync(path.join(root, 'gemini', 'settings.json'), 'utf8'))
  assert.equal('hooks' in geminiSettings, false)
  assert.equal(geminiSettings.general.checkpointing.enabled, true)
})

test('el bridge de Antigravity traduce decisiones al protocolo nativo', () => {
  const bridge = path.join(root, 'antigravity', 'hook.js')
  const { evaluate } = require(bridge)
  const payload = (command) => ({
    workspacePaths: [path.resolve(root, '..', '..')],
    toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: path.resolve(root, '..', '..') } },
  })
  assert.equal(evaluate('pre-shell', payload('git status')).decision, 'allow')
  assert.equal(evaluate('pre-shell', payload('git push')).decision, 'deny')
})

test('los runners con hooks nativos registran el grupo, no un hook por guard', () => {
  const { hookGroups } = require('../engine/hooks/run')
  for (const name of ['claude', 'codex']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const config = fs.readFileSync(path.resolve(root, name, manifest.config.source), 'utf8')
    assert.match(config, /guard-shell\.sh/, `${name}: falta el grupo de shell`)
    assert.match(config, /guard-files\.sh/, `${name}: falta el grupo de archivos`)
    for (const group of ['pre-shell', 'pre-files']) {
      for (const guard of hookGroups[group]) {
        assert.equal(config.includes(`guard-${guard}.sh`), false, `${name}: ${guard} quedó registrado suelto`)
      }
    }
  }
})

test('doctor advierte cuando sobrevive el wiring por guard suelto', () => {
  const A = require('../engine/automation')
  const legacy = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
    { type: 'command', command: 'automatization/hooks/guard-destructive.sh' },
    { type: 'command', command: 'automatization/hooks/guard-verify.sh' },
    { type: 'command', command: 'automatization/hooks/guard-shell.sh' },
  ] }] } }
  assert.deepEqual(A.legacyGuardWiring(legacy), ['destructive', 'verify'])
  const grouped = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
    { type: 'command', command: 'automatization/hooks/guard-shell.sh' },
  ] }], Stop: [{ hooks: [{ type: 'command', command: 'automatization/hooks/guard-planning-drift.sh' }] }] } }
  assert.deepEqual(A.legacyGuardWiring(grouped), [], 'el guard suelto de Stop no es wiring heredado')
})

test('los runners con skills nativas exponen el catálogo completo de cargos', () => {
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
  const slugs = fs.readdirSync(path.join(repoRoot, 'agents', 'roles'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.ok(slugs.length >= 40, 'el catálogo debería tener decenas de cargos')

  for (const name of ['claude', 'antigravity']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    assert.equal(manifest.capabilities.nativeSkills, true, `${name}: declara skills nativas`)
    assert.ok(manifest.roleSkills, `${name}: declara dónde instalarlas`)
  }
  for (const name of ['codex', 'gemini']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    assert.equal(manifest.capabilities.nativeSkills, false, `${name}: no tiene mecanismo de skills`)
  }
})

test('el puntero de un cargo conserva su frontmatter y no duplica el contrato', () => {
  const A = require('../engine/automation')
  const repoRoot = path.resolve(__dirname, '..')
  const roles = A.roleCatalog(repoRoot)
  assert.ok(roles.length >= 40)

  const pm = roles.find((role) => role.slug === 'product-manager')
  assert.ok(pm, 'el catálogo resuelve por slug sin exigir el tipo')
  const generated = A.roleSkill(pm)

  // El runner elige por nombre y descripción: los dos tienen que sobrevivir intactos.
  assert.match(generated, /^---\nname: product-manager\n/)
  assert.ok(generated.includes(pm.description), 'la descripción llega verbatim')
  // Y el cuerpo remite, no copia.
  assert.match(generated, /agents\/roles\/product-manager\/SKILL\.md/)
  const original = fs.readFileSync(path.join(repoRoot, 'agents', 'roles', 'product-manager', 'SKILL.md'), 'utf8')
  assert.ok(generated.length < original.length / 2, 'un puntero pesa mucho menos que el contrato')
})
