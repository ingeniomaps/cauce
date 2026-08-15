'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const learning = require('../engine/agents/learning')

const CLI = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
const AGENTS_ROOT = path.resolve(__dirname, '..', 'agents')
const catalog = require('../engine/agents/catalog')
const AGENTS = catalog.list(path.dirname(AGENTS_ROOT))
  .map((role) => ({ type: role.type, slug: role.slug, dir: role.dir }))

function run(args, cwd = path.dirname(CLI)) {
  const env = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env })
}

function installedProject(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-agents-'))
  const target = path.join(root, 'demo-ops')
  const result = run(['init', target, '--name', name, '--mode', 'sidecar'])
  assert.equal(result.status, 0, result.stderr)
  return target
}

test('learning prepara informes y propuestas sin modificar el agente', () => {
  const target = installedProject('Learning')
  const skill = path.join(target, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const before = fs.readFileSync(skill, 'utf8')
  assert.equal(run(['learn', 'product-manager'], target).status, 0)
  assert.equal(run(['learn', 'product-manager', '--proposal'], target).status, 0)
  const evaluated = run(['evaluate', 'product-manager'], target)
  assert.equal(evaluated.status, 0, evaluated.stderr)
  assert.equal(fs.readFileSync(skill, 'utf8'), before)
})

test('todos los agentes se distribuyen y superan sus controles estructurales', async (context) => {
  const target = installedProject('Agents')
  for (const agent of AGENTS) {
    await context.test(`${agent.type}/${agent.slug}`, () => {
      const skill = path.join(target, path.relative(path.dirname(AGENTS_ROOT), agent.dir), 'SKILL.md')
      assert.equal(fs.existsSync(skill), true)
      const evaluated = run(['evaluate', agent.slug], target)
      assert.equal(evaluated.status, 0, evaluated.stderr || evaluated.stdout)
    })
  }
})

test('un slug duplicado entre tipos se rechaza como ambiguo', () => {
  const target = installedProject('Ambiguous agents')
  const duplicate = path.join(target, 'agents', 'specialists', 'product-manager')
  fs.mkdirSync(duplicate, { recursive: true })
  fs.writeFileSync(path.join(duplicate, 'SKILL.md'), 'duplicado\n')
  assert.throws(
    () => learning.evaluate(target, 'product-manager'),
    /agente ambiguo product-manager/,
  )
})

test('la documentación de agentes no cita rutas del toolkit ni rutas inexistentes', () => {
  const repoRoot = path.resolve(__dirname, '..')
  const docs = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.md')) docs.push(file)
    }
  }
  walk(AGENTS_ROOT)
  assert.ok(docs.length >= AGENTS.length, 'se esperaba al menos un documento por agente')

  for (const file of docs) {
    const text = fs.readFileSync(file, 'utf8')
    const at = path.relative(repoRoot, file)
    // `engine/cli/ops.js` sólo existe en el toolkit; estos documentos viajan a cada instancia.
    assert.equal(text.includes('engine/cli/ops.js'), false, `${at} cita el CLI del toolkit`)
    for (const match of text.matchAll(/agents\/[a-z0-9/-]+/g)) {
      assert.equal(fs.existsSync(path.join(repoRoot, match[0])), true, `${at} cita ${match[0]}, que no existe`)
    }
  }
})

test('los comandos make citados por los agentes existen en ambos Makefiles', () => {
  const repoRoot = path.resolve(__dirname, '..')
  const targets = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.md')) {
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/`make ([a-z-]+)/g)) targets.add(match[1])
      }
    }
  }
  walk(AGENTS_ROOT)
  assert.ok(targets.size, 'los agentes deberían citar algún comando make')
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    const source = fs.readFileSync(path.join(repoRoot, makefile), 'utf8')
    for (const target of targets) {
      assert.match(source, new RegExp(`^${target}:`, 'm'), `${makefile} no define ${target}`)
    }
  }
})

test('un cargo propio reemplaza al del sistema y el runner apunta al que gana', () => {
  const A = require('../engine/automation')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-precedencia-'))
  const write = (dir, description) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: demo\ndescription: ${description}\n---\n\n# demo\n`)
  }
  const system = path.join(root, 'agents', 'roles', 'system', 'demo')
  const own = path.join(root, 'agents', 'roles', 'demo')

  write(system, 'La versión que trae Cauce.')
  assert.equal(catalog.resolve(root, 'demo'), system)
  assert.deepEqual(catalog.list(root).map((role) => role.system), [true])

  write(own, 'La versión del proyecto.')
  assert.equal(catalog.resolve(root, 'demo'), own, 'el del proyecto manda')
  const listed = catalog.list(root)
  assert.equal(listed.length, 1, 'el slug no aparece dos veces')
  assert.equal(listed[0].system, false)

  // El puntero que lee el runner debe describir al que ganó, no al que quedó debajo.
  const generated = A.roleSkill(A.roleCatalog(root)[0])
  assert.ok(generated.includes('La versión del proyecto.'))
  assert.match(generated, /agents\/roles\/demo\/SKILL\.md/)

  fs.rmSync(own, { recursive: true, force: true })
  assert.equal(catalog.resolve(root, 'demo'), system, 'al quitarlo vuelve el del sistema')
})

test('un slug repetido entre tipos distintos sigue siendo ambiguo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-ambiguo-'))
  for (const type of ['roles', 'specialists']) {
    const dir = path.join(root, 'agents', type, 'demo')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: x\n---\n')
  }
  // Entre tipos no hay regla de precedencia, y elegir en silencio sería peor que fallar.
  assert.throws(() => catalog.resolve(root, 'demo'), /agente ambiguo demo/)
})
