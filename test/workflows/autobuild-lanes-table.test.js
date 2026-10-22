'use strict'

// La tabla de carriles de PROTOCOL.md contra lo que corre el recorrido de Claude (caso 431). La tabla es lo único que
// gradúa una tarea en un runner sin recorrido con fases, así que si dice otra cosa que el workflow, la misma tarea pesa
// distinto según quién la tome, y nada lo nota: son dos copias de un hecho, y una se pudre (R7, R27).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runFlow } = require('../support/autobuild-harness')

const PROTOCOL = fs.readFileSync(path.resolve(__dirname, '..', '..', 'template', 'planning', 'PROTOCOL.md'), 'utf8')
// Las fases que un carril puede saltear o correr, en el orden del recorrido; las de antes y después no dependen de él.
const GRADED = ['Ready', 'Decompose', 'Plan', 'Critique', 'WIP', 'Build', 'Review', 'Verify', 'QA', 'Commit', 'Done']

const table = Object.fromEntries([...PROTOCOL.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)]
  .map(([, lane, phases]) => [lane, phases.split('·').map((one) => one.trim())]))

test('la tabla nombra los cuatro carriles del recorrido, y sólo fases que existen', () => {
  assert.deepEqual(Object.keys(table), ['express', 'directo', 'lite', 'full'])
  for (const [lane, phases] of Object.entries(table)) {
    assert.deepEqual(phases.filter((one) => !GRADED.includes(one)), [], lane)
  }
})

// Con el carril puesto por el clasificador, que es como el recorrido saltea Ready en los mecánicos.
test('cada carril corre exactamente las fases que la tabla le da', async () => {
  for (const [lane, phases] of Object.entries(table)) {
    const run = await runFlow({}, { lane, vouched: true })
    assert.deepEqual(run.phases.filter((one) => GRADED.includes(one)), phases, lane)
  }
})

test('escrito a mano, un carril mecánico corre además Ready, como dice la tabla', async () => {
  for (const lane of ['express', 'directo']) {
    const run = await runFlow({}, { lane })
    assert.deepEqual(run.phases.filter((one) => GRADED.includes(one)), ['Ready', ...table[lane]], lane)
  }
  assert.match(PROTOCOL, /En `express` y `directo` Ready corre igual cuando el carril lo escribió una persona/)
})
