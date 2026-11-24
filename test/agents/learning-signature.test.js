'use strict'

// La firma queda atada a lo que se aprobó (caso 486): `sign-proposal.yml` escribe la huella de lo que se aplica y
// `ops learn --check-signature` la recalcula antes de aplicar. Cómo la escribe el workflow lo prueba
// `test/repo/ci-sign.test.js`; acá, qué hace el motor con ella.

const { run, inRepo } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const learning = require('../../engine/agents/learning')
const { fingerprint } = require('../../engine/agents/learning-files')
const { installedProject, writeSkill, signProposal } = require('../support/agents-fixtures')

function signed(name) {
  const target = installedProject(name)
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const report = learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file
  fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
    .replace(/\n## Recomendación[^\S\n]*\n/, '\n## Recomendación\n\nCambiar algo (cierra H1).\n'))
  learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  const file = path.join(own, 'learning', 'proposals', '2099-06.md')
  signProposal(file)
  return { target, file }
}
// Una firma de antes del caso 486, que no dejaba huella.
const withoutPrint = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^- Huella:.*\n/m, ''))
const editChange = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
  .replace('Se agrega la fuente que el informe trajo.', 'Se agrega otra fuente, que nadie aprobó.'))

test('con la huella intacta la firma vale, y editado «Cambio propuesto» no', () => {
  const { target, file } = signed('Firma con huella')
  const text = fs.readFileSync(file, 'utf8')
  assert.match(text, new RegExp(`^- Huella: sha256:${fingerprint(text)}$`, 'm'), 'la firma no dejó su huella')
  assert.equal(learning.checkSignature(target, 'probe', '2099-06').ok, true)
  editChange(file)
  const after = learning.checkSignature(target, 'probe', '2099-06')
  assert.equal(after.ok, false, 'aceptó un «Cambio propuesto» editado después de firmar')
  assert.notEqual(after.signed, after.current)
})

test('el CLI se niega con las dos huellas, y una firma sin huella se acepta como estaba', () => {
  const { target, file } = signed('Firma por CLI')
  const check = () => run(['learn', 'probe', '--check-signature', '--period', '2099-06'], target)
  const ok = check()
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /«Evaluación» son los que se firmaron/)

  editChange(file)
  const refused = check()
  assert.equal(refused.status, 1)
  assert.match(refused.stderr,
    /cambió después de la firma \(firmado sha256:[0-9a-f]{12}…, ahora sha256:[0-9a-f]{12}…\)/)
  assert.match(refused.stderr, /Estado: pendiente.*borrá la línea Huella y aprobá el PR otra vez/)

  withoutPrint(file)
  const legacy = check()
  assert.equal(legacy.status, 0, legacy.stderr)
  assert.match(legacy.stdout, /no trae huella/)
})

test('lo que no se aplica puede cambiar sin tocar la huella', () => {
  const { target, file } = signed('Firma y desvíos')
  // `agent-promote` escribe sus desvíos al final de «Aprobación humana», y eso no es lo que se firmó.
  fs.appendFileSync(file, '\n### Desviaciones al aplicar\n\n- ninguna\n')
  assert.equal(learning.checkSignature(target, 'probe', '2099-06').ok, true)
})

// Lo que `agent-promote` crea desde la propuesta firmada está en dos secciones: «Cambio propuesto» y «Evaluación», que
// trae el caso nuevo y su fixture (caso 506). Y un título dentro de un bloque de código no corta ninguna (caso 505).
test('la huella cubre «Evaluación» y lo que sigue a un título dentro de un bloque de código', () => {
  const evaluation = signed('Firma y evaluación')
  fs.writeFileSync(evaluation.file, fs.readFileSync(evaluation.file, 'utf8')
    .replace(/^(## Evaluación\n)/m, '$1\nUn caso nuevo que nadie aprobó.\n'))
  assert.equal(learning.checkSignature(evaluation.target, 'probe', '2099-06').ok, false, 'editar «Evaluación» pasó')

  const target = installedProject('Firma con bloque')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const report = learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file
  fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
    .replace(/\n## Recomendación[^\S\n]*\n/, '\n## Recomendación\n\nCambiar algo (cierra H1).\n'))
  learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  const file = path.join(own, 'learning', 'proposals', '2099-06.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace(/^(## Cambio propuesto\n)/m, '$1\n```markdown\n## 2099-01-01 — Una entrada\nLo aprobado.\n```\n'))
  signProposal(file)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Lo aprobado.', 'Lo que nadie aprobó.'))
  assert.equal(learning.checkSignature(target, 'probe', '2099-06').ok, false, 'lo que sigue al título del bloque pasó')
})

test('una línea de huella rota no pasa por firma vieja', () => {
  const { target, file } = signed('Firma rota')
  editChange(file)
  for (const broken of ['- Huella: sha256:abc', '- Huella: SHA256:XYZ', '- Huella:']) {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^- Huella:.*$/m, broken))
    assert.equal(learning.checkSignature(target, 'probe', '2099-06').ok, false, `aceptó «${broken}»`)
  }
})

test('sellar se niega si «Cambio propuesto» cambió después de la firma', () => {
  const { target, file } = signed('Sello con huella')
  editChange(file)
  assert.throws(() => learning.seal(target, 'probe', '2099-06'), /cambió después de la firma/)
  assert.match(fs.readFileSync(file, 'utf8'), /^status: proposed$/m, 'la selló igual')
})

// La huella del workflow y la del motor tienen que dar lo mismo también en los bordes.
test('el awk del workflow y el motor calculan la misma huella', { skip: process.platform === 'win32' }, () => {
  const { execFileSync } = require('node:child_process')
  const { workflow } = require('../support/environment')
  // El de la huella, que nombra las secciones: el workflow tiene otro, el que busca las pendientes.
  const awk = (workflow('sign-proposal').match(/awk '([^']*Cambio propuesto[^']*)'/) || [])[1]
  assert.ok(awk, 'no encontré el awk del workflow')
  const cases = ['## Cambio propuesto\nA\n', '## Cambio propuesto\nA', 'x\n',
    'x\n## Cambio propuesto\nA\n## Cambio propuesto\nB\n## Z\n', '## Cambio propuesto\r\nA\r\n## Z\r\n',
    '## Cambio propuesto: con texto\n\n```\n## no es título\n```\n',
    '## Cambio propuesto\nA\n```\n## no es título\nB\n```\nC\n## Riesgos\nR\n## Evaluación\nE\n## Aprobación humana\n',
    '## Evaluación\nE\n## Cambio propuesto\nA\n', '## Cambio propuesto\nA\n## Evaluación\nE\n## Evaluación\nF\n',
    '## Hallazgos\n```\n## Cambio propuesto\nfalso\n```\n## Cambio propuesto\nA\n',
    '## Cambio propuesto\n```\nsin cerrar\n## Z\n',
    '## Cambio propuesto\n```\nA\n## Aprobación humana\n- Estado: aprobada\n']
  for (const text of cases) {
    const shell = execFileSync('bash', ['-c', `awk '${awk}' | sha256sum | cut -d' ' -f1`],
      { input: text, encoding: 'utf8' })
    assert.equal(fingerprint(text), shell.trim(), JSON.stringify(text))
  }
  // Y sobre las propuestas reales, que traen bloques con títulos adentro (caso 505). Sin `.git` no hay cuáles leer.
  if (!inRepo()) return
  const repo = path.resolve(__dirname, '..', '..')
  const tracked = execFileSync('git', ['ls-files', 'agents/roles/*/learning/proposals/*.md',
    'flows/*/learning/proposals/*.md'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean)
  assert.ok(tracked.length > 100, `sólo ${tracked.length} propuestas trackeadas`)
  for (const file of tracked) {
    const shell = execFileSync('bash', ['-c', `awk '${awk}' "$0" | sha256sum | cut -d' ' -f1`, file], { cwd: repo,
      encoding: 'utf8' })
    assert.equal(fingerprint(fs.readFileSync(path.join(repo, file), 'utf8')), shell.trim(), file)
  }
})
