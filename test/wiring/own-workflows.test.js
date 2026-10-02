'use strict'

// Los workflows propios de una instancia (caso 223). Lo que se mide: que `install` los renderice con los mismos
// marcadores que los de Cauce, que no instale uno que se llame como uno de Cauce, que retire lo generado cuya
// fuente se borró, y que no toque un archivo del mismo directorio que no generó.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { installOwnWorkflows } = require('../../engine/automation/own-workflows')

const AUTOMATION = path.resolve(__dirname, '..', '..', 'automatization')
const RUNNER = { artifacts: [{ source: 'x', target: '.claude/workflows/autobuild.js' }] }

function setup(sources) {
  const install = tempRoot('cauce-propios-')
  const root = path.join(install, 'ops')
  fs.mkdirSync(path.join(root, 'workflows'), { recursive: true })
  for (const [file, body] of Object.entries(sources)) fs.writeFileSync(path.join(root, 'workflows', file), body)
  const lines = []
  const run = () => installOwnWorkflows(root, 'claude', RUNNER, { install, automationRoot: AUTOMATION },
    { log: (line) => lines.push(line) })
  return { install, root, lines, run, target: (file) => path.join(install, '.claude', 'workflows', file) }
}

test('un workflow propio sale con los marcadores de Cauce resueltos', () => {
  const { root, run, target, lines } = setup({
    'propio.js': "export const meta = { name: 'propio' }\n{{INCLUDE:shared/workflow-root.js}}\n"
      + "const AQUI = '{{OPS_ROOT}}'\n",
  })
  run()
  const out = fs.readFileSync(target('propio.js'), 'utf8')
  assert.match(out, /^\/\/ Generado por `automation install` desde workflows\/propio\.js/)
  assert.doesNotMatch(out, /\{\{/, 'ningún marcador queda sin resolver')
  assert.ok(out.includes(`const AQUI = '${root}'`))
  assert.ok(lines.some((one) => /workflow propio workflows\/propio\.js → \.claude\/workflows\/propio\.js/.test(one)))
})

test('uno que se llama como uno de Cauce no se instala, y lo dice', () => {
  const { run, target, lines } = setup({ 'autobuild.js': 'export const meta = {}\n' })
  run()
  assert.equal(fs.existsSync(target('autobuild.js')), false)
  assert.ok(lines.some((one) => /autobuild\.js se llama como un workflow de Cauce y no se instaló/.test(one)))
})

test('lo generado cuya fuente se borró se retira, y lo que no generó se queda', () => {
  const { root, run, target, lines } = setup({ 'propio.js': 'export const meta = {}\n' })
  run()
  fs.writeFileSync(target('ajeno.js'), 'export const meta = {}\n')
  fs.rmSync(path.join(root, 'workflows', 'propio.js'))
  run()
  assert.equal(fs.existsSync(target('propio.js')), false)
  assert.ok(fs.existsSync(target('ajeno.js')), 'no se borra lo que no lleva la marca')
  assert.ok(lines.some((one) => /retirado propio\.js, que ya no está en workflows\//.test(one)))
})
