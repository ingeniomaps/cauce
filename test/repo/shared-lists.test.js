'use strict'

// Una lista que varios guards necesitan vive en un solo lugar (R27, R7): copiada, cada copia se queda con las suyas y
// lo que una frena otra lo deja pasar. Se reconoce la copia por su forma, una lista literal con dos elementos que la
// delatan, fuera del archivo que la tiene.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const HOOKS = path.resolve(__dirname, '..', '..', 'engine', 'hooks')

// Los prefijos de shell estaban en tres guards, y `setsid rm -rf .` pasaba `destructive` donde `sudo rm -rf .`
// frenaba. Las globales de git que llevan valor, en cuatro, y `git --attr-source HEAD rm` pasaba `runtime-shell`.
const SHARED = [
  { owner: 'shell-wrappers.js', marks: ["'sudo'", "'nohup'"], use: 'afterLeaders o LEADING' },
  { owner: 'git-globals.js', marks: ["'--git-dir'", "'--work-tree'"], use: 'GIT_VALUED' },
]

for (const { owner, marks, use } of SHARED) {
  test(`ningún guard lleva su propia copia de la lista de ${owner}`, () => {
    const listed = (text) => [...text.matchAll(/\[[^\]]*\]/g)]
      .some((list) => marks.every((mark) => list[0].includes(mark)))
    const copies = fs.readdirSync(HOOKS).filter((name) => name.endsWith('.js') && name !== owner)
      .filter((name) => listed(fs.readFileSync(path.join(HOOKS, name), 'utf8')))
    assert.ok(listed(fs.readFileSync(path.join(HOOKS, owner), 'utf8')), `${owner} dejó de traer la lista`)
    assert.deepEqual(copies, [], `usá ${use} de ${owner}`)
  })
}
