'use strict'

// Sobre qué repositorios opinan los guards de commit. La sesión tiene los suyos —la carpeta en la que se
// abrió y las raíces que la instancia declaró—; el resto no declaró esta puerta.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')

// Caso 258. Los guards de commit miraban el comando y no a dónde apuntaba: un `git -C` hacia un repositorio
// que la sesión no tiene abierto se frenaba por su forma y se le corría su propia suite. Las dos mitades
// van juntas —el ajeno pasa, el propio sigue frenando— porque dejar pasar todo daría el mismo verde.
test('un commit en un repositorio que no es de la sesión no se juzga, y el propio sí', () => {
  const I = require('../../engine/hooks/input')
  const red = (root) => {
    initRepo(root)
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'exit 1' } }))
    fs.writeFileSync(path.join(root, 'a.js'), 'module.exports = 1\n')
    git(['add', '-A'], root)
  }
  const session = tempRoot('cauce-own-sesion-')
  const foreign = tempRoot('cauce-own-ajeno-')
  red(session)
  red(foreign)
  const previous = process.env.CLAUDE_PROJECT_DIR
  process.env.CLAUDE_PROJECT_DIR = session
  try {
    const at = (command) => ({ cwd: session, tool_input: { command } })
    assert.doesNotThrow(() => execute('verify', at(`git -C ${foreign} commit -m x`)), 'con su suite en rojo')
    assert.doesNotThrow(() => execute('verify', at(`git -C ${foreign} add a.js && git -C ${foreign} commit -m x`)),
      'y stageando y commiteando a la vez')
    blocked('verify', at('git commit -m x'), /Verify falló/)
    blocked('verify', at(`git -C ${session} add a.js && git -C ${session} commit -m x`), /stagea y commitea a la vez/)

    // Es de la sesión lo que está adentro, lo que la contiene y lo que la instancia declaró como raíz.
    assert.equal(I.owns({ cwd: session }, path.join(session, 'sub')), true)
    assert.equal(I.owns({ cwd: session }, path.dirname(session)), true)
    assert.equal(I.owns({ cwd: session }, foreign), false)
    fs.mkdirSync(path.join(session, 'planning'), { recursive: true })
    fs.writeFileSync(path.join(session, 'ops.config.json'), JSON.stringify({
      project: 'x', mode: 'sidecar', workspaceRoots: [{ name: 'otro', path: path.relative(session, foreign) }],
    }))
    assert.equal(I.owns({ cwd: session }, foreign), true, 'una raíz declarada es de la sesión')
    blocked('verify', at(`git -C ${foreign} commit -m x`), /Verify falló/)
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = previous
  }
})
