'use strict'

// El estado de la firma vive en «Aprobación humana», y una propuesta puede traer las mismas líneas dentro del fixture
// de un caso nuevo (caso 501). Sellar, archivar y contar firmadas leen sólo esa sección (caso 507).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const learning = require('../../engine/agents/learning')
const { installedProject, writeSkill, signProposal } = require('../support/agents-fixtures')

// Un fixture con las cuatro líneas que escribe la firma, en «Evaluación».
const fixture = (status) => '## Evaluación\n\n```markdown\n'
  + `- Estado: ${status}\n- Responsable: por definir\n- Fecha: por definir\n- Huella: sha256:${'0'.repeat(64)}\n`
  + '```\n\n## Aprobación humana'

function proposal(name, status) {
  const target = installedProject(name)
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const report = learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file
  fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
    .replace(/\n## Recomendación[^\S\n]*\n/, '\n## Recomendación\n\nCambiar algo (cierra H1).\n'))
  learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  const file = path.join(own, 'learning', 'proposals', '2099-06.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace(/^## Evaluación\n[\s\S]*?^## Aprobación humana/m, fixture(status)))
  return { target, file }
}
const fixtureOf = (file) => fs.readFileSync(file, 'utf8').match(/```markdown\n([\s\S]*?)```/)[1]
const approvalOf = (file) => fs.readFileSync(file, 'utf8').split(/^## Aprobación humana/m)[1]

test('sellar escribe la firma y deja intacto el fixture que trae las mismas líneas', () => {
  const { target, file } = proposal('Sello con fixture', 'pendiente')
  signProposal(file)
  const before = fixtureOf(file)
  assert.equal(learning.checkSignature(target, 'probe', '2099-06').ok, true, 'leyó la huella del fixture')
  learning.seal(target, 'probe', '2099-06')
  assert.equal(fixtureOf(file), before, 'el sello reescribió el fixture')
  assert.match(approvalOf(file), /^- Estado: aplicada$/m, 'y no la firma')
  // Y ya sellada, el «pendiente» del fixture no la hace parecer sin sellar.
  assert.equal(learning.seal(target, 'probe', '2099-06').already, true, 'la volvió a sellar')
})

test('archivar y contar firmadas leen la firma, no el fixture', () => {
  const { target, file } = proposal('Archivo con fixture', 'aprobada')
  // Con un cambio decidido, una firmada no se archiva: ésta no lo está, aunque su fixture lo diga.
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^(## Cambio propuesto\n)/m, '$1\nAgregar algo.\n'))
  assert.equal(learning.evaluate(target, 'probe').warnings.some((one) => /firmada/.test(one)), false,
    'una pendiente cuyo fixture dice «aprobada» se contó como firmada')
  const before = fixtureOf(file)
  learning.archive(target, 'probe', '2099-06', 'agent', 'no va')
  assert.equal(fixtureOf(file), before, 'archivar reescribió el fixture')
  assert.match(approvalOf(file), /^- Estado: archivada\n- Motivo: no va$/m)
  // El motivo que lee el informe siguiente es el de la firma, aunque el fixture traiga otro.
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace('```markdown\n', '```markdown\n- Motivo: el del fixture\n'))
  const discarded = require('../../engine/agents/learning-files').discardedProposals(path.dirname(file))
  assert.deepEqual(discarded.map((one) => one.reason), ['no va'])
})
