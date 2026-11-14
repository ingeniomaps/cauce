'use strict'

// `agent-promote` pregunta al motor si «Cambio propuesto» sigue siendo el que se firmó antes de aplicar (caso 486).

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileWorkflow } = require('../support/workflow')

const SIGNED = { proposal: '/i/agents/roles/probe/learning/proposals/2099-06.md', dir: '/i/agents/roles/probe',
  cli: 'tools/ops.js', approved: true, signedBy: '@quien', state: '- Estado: aprobada', status: 'proposed',
  change: 'concrete' }

async function promote(check) {
  const asked = []
  const prompts = {}
  const agent = async (prompt, options = {}) => {
    asked.push(options.label)
    prompts[options.label] = prompt
    if (options.label === 'signature') return SIGNED
    if (options.label === 'firma-intacta') return check
    if (options.label === 'aplica:probe') return { applied: true, files: ['SKILL.md'], deviations: '', newCase: '' }
    return 'ok'
  }
  const all = async (thunks) => Promise.all(thunks.map((one) => one()))
  const result = await compileWorkflow('agent-promote')(agent, () => {}, () => {}, all, async () => [],
    async () => ({}), 'probe', { total: null, spent: () => 0, remaining: () => Infinity })
  return { result, asked, prompts }
}

test('una firma cuyo «Cambio propuesto» cambió después no se aplica', async () => {
  const run = await promote({ exitCode: 1, output: '«Cambio propuesto» cambió después de la firma (firmado …)' })
  assert.equal(run.result.reason, 'firma-vencida')
  assert.match(run.result.detail, /cambió después de la firma/)
  assert.ok(!run.asked.includes('aplica:probe'), 'aplicó un cambio que nadie firmó')
  assert.match(run.prompts['firma-intacta'], /learn probe --check-signature --period 2099-06/)
})

test('con la huella intacta, o sin huella, sigue a aplicar', async () => {
  for (const output of ['✓ …: «Cambio propuesto» y «Evaluación» son los que se firmaron', '= … no trae huella']) {
    const run = await promote({ exitCode: 0, output })
    assert.ok(run.asked.includes('aplica:probe'), `con «${output}» no aplicó`)
  }
})
