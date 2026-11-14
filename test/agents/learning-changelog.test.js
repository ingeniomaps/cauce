'use strict'

// Lo que el sello de una propuesta de cargo escribe en el CHANGELOG del toolkit: que se anote aunque el agente de
// «Aplicar» la haya sellado él mismo (caso 500), una sola vez en todo el archivo, y con la línea que dice qué cambió
// (caso 497). Que se anote en el toolkit y no en una empresa lo prueba `learning-proposal.test.js`.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const learning = require('../../engine/agents/learning')
const { blankProposal } = require('../../engine/agents/learning-files')
const { writeSkill, firmarPropuesta } = require('../support/agents-fixtures')

const withRecommendation = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
  .replace(/\n## Recomendación[^\S\n]*\n/, '\n## Recomendación\n\nCambiar algo (cierra H1).\n'))

// Caso 500. El agente de «Aplicar» a veces marca él mismo la propuesta como aplicada, y el sello la encontraba sellada
// y salía antes de anotar: el cargo salía en la release sin entrada. Y anotar no puede duplicar lo que ya salió.
test('un cargo que el agente ya marcó aplicado se anota igual, una sola vez en todo el CHANGELOG', () => {
  const sealByAgent = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace(/^status:.*$/m, 'status: applied').replace(/^- Estado: aprobada$/m, '- Estado: aplicada'))
  const toolkit = (published = '', agentSeals = true) => {
    const root = tempRoot('cauce-toolkit-aplicada-')
    fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'T', mode: 'toolkit' }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.4.0' }))
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'),
      `# Changelog\n\n## [1.4.0] - 2099-05-01\n\n- lo publicado\n${published}`)
    const dir = writeSkill(path.join(root, 'agents', 'roles', 'system', 'probe'), 'probe', 'x')
    withRecommendation(learning.prepareReport(root, 'probe', new Date('2099-06-10T00:00:00Z')).file)
    learning.prepareProposal(root, 'probe', new Date('2099-06-15T00:00:00Z'))
    const file = path.join(dir, 'learning', 'proposals', '2099-06.md')
    firmarPropuesta(file)
    // Lo que hizo el agente con release-manager y ux-designer en 2026-11: los dos lados del sello.
    if (agentSeals) sealByAgent(file)
    return { root, file }
  }
  const git = (root, message) => {
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm',
      message]]) execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  }
  const { root } = toolkit()
  const sealed = learning.seal(root, 'probe', '2099-06')
  assert.equal(sealed.already, true, 'el documento ya estaba sellado')
  assert.deepEqual(sealed.noted, { version: '1.5.0', already: false }, 'y el cambio no se anotó')
  assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /\*\*`probe`\*\*: Se agrega la fuente/)
  assert.deepEqual(learning.seal(root, 'probe', '2099-06').noted, { version: '1.5.0', already: true })

  // Como pasa en este repositorio: firmada sin sellar en `HEAD`, y sellada por el agente sólo en el árbol de trabajo.
  const live = toolkit('', false)
  git(live.root, 'firmada')
  sealByAgent(live.file)
  assert.deepEqual(learning.seal(live.root, 'probe', '2099-06').noted, { version: '1.5.0', already: false },
    'no anotó lo que selló el agente en esta misma aplicación')

  // Sellada ya en el último commit es de otro ciclo, quizá anterior a la anotación automática: no se anota de nuevo.
  const committed = toolkit().root
  git(committed, 'aplicada antes')
  assert.equal(learning.seal(committed, 'probe', '2099-06').noted, undefined, 'anotó un cambio de otro ciclo')
  assert.doesNotMatch(fs.readFileSync(path.join(committed, 'CHANGELOG.md'), 'utf8'), /1\.5\.0/)

  // Ya anotada en una versión publicada, aunque no sea la última, no vuelve a salir en la siguiente.
  const { root: old } = toolkit(
    '\n## [1.3.0] - 2099-04-01\n\n### Cargos\n\n- **`probe`**: Algo (propuesta `2099-06.md`).\n')
  assert.deepEqual(learning.seal(old, 'probe', '2099-06').noted, { version: '1.3.0', already: true })
  assert.doesNotMatch(fs.readFileSync(path.join(old, 'CHANGELOG.md'), 'utf8'), /1\.5\.0/)
})

// Caso 497. La entrada del CHANGELOG copiaba el primer párrafo de «Cambio propuesto», que casi nunca dice qué cambia
// sino dónde y por qué. Una propuesta lo dice en su línea `**En una línea:**`, y sin ella queda lo de antes.
test('la entrada del CHANGELOG de un cargo sale de su línea «En una línea»', () => {
  const sealWith = (change) => {
    const root = tempRoot('cauce-toolkit-linea-')
    fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'T', mode: 'toolkit' }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.4.0' }))
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.4.0] - 2099-05-01\n\n- lo publicado\n')
    const dir = writeSkill(path.join(root, 'agents', 'roles', 'system', 'probe'), 'probe', 'x')
    withRecommendation(learning.prepareReport(root, 'probe', new Date('2099-06-10T00:00:00Z')).file)
    learning.prepareProposal(root, 'probe', new Date('2099-06-15T00:00:00Z'))
    const file = path.join(dir, 'learning', 'proposals', '2099-06.md')
    // El molde pide la línea y sigue leyéndose como sin decidir.
    assert.match(fs.readFileSync(file, 'utf8'), /abre con `\*\*En una línea:\*\* <qué cambia en el\ncargo>`/)
    assert.equal(blankProposal(file), true, 'el molde con la línea dejó de leerse como sin decidir')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
      .replace(/^## Cambio propuesto\n[\s\S]*?(?=^## )/m, `## Cambio propuesto\n\n${change}\n\n`))
    firmarPropuesta(file)
    learning.seal(root, 'probe', '2099-06')
    return fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split('### Cargos')[1].replace(/\s+/g, ' ')
  }
  const lined = sealWith('Tres archivos, por los dos informes.\n\n**En una línea:** Material Design queda marcada '
    + 'como fuente sin cuerpo verificado.\n\nEl detalle, archivo por archivo.')
  assert.match(lined, /\*\*`probe`\*\*: Material Design queda marcada como fuente sin cuerpo verificado \(propuesta/)
  assert.doesNotMatch(lined, /Tres archivos/, 'el párrafo de metadatos no es la entrada')
  assert.match(sealWith('Tres archivos.\n\n- **En una línea:** Se agrega una fuente.'),
    /\*\*`probe`\*\*: Se agrega una fuente \(/, 'también escrita como viñeta')
  // `firmarPropuesta` abre «Cambio propuesto» con su propio párrafo: sin la línea, la entrada sale de ahí.
  assert.match(sealWith('Tres archivos, por los dos informes.\n\nEl detalle.'),
    /\*\*`probe`\*\*: Se agrega la fuente que el informe trajo \(propuesta/, 'sin la línea, el primer párrafo')
})
