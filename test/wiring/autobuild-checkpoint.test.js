'use strict'

// El checkpoint entre hitos en los runners sin workflow. Codex 0.163.0, con «detente en el checkpoint entre hitos» y
// nada más, cerró un hito sin escribir `checkpoints/<hito>.md`, y la corrida siguiente habría arrancado sin revisión.
// El workflow de Claude lo escribe en `autobuild.js`; acá lo tiene que pedir el texto, con el archivo y su estado.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const REPO = path.resolve(__dirname, '..', '..')
const read = (file) => fs.readFileSync(path.join(REPO, file), 'utf8')

test('el recorrido de los runners sin workflow pide escribir el checkpoint del hito, y el protocolo lo nombra', () => {
  const skill = read('automatization/shared/skills/autobuild/SKILL.md').replace(/\s+/g, ' ')
  assert.match(skill, /runner\.humanCheckpointBetweenMilestones/)
  assert.match(skill, /escribí `\{\{OPS_DIR\}\}planning\/checkpoints\/<hito>\.md`/)
  assert.match(skill, /`status: pendiente`, commitealo y comprobá con `ops context` que frena/)
  const protocol = read('template/planning/PROTOCOL.md').replace(/\s+/g, ' ')
  assert.match(protocol, /14\. Cierre: .*el hito que se cerró deja `checkpoints\/<hito>\.md` en `pendiente`/)
})
