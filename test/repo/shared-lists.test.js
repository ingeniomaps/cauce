'use strict'

// Una lista que varios guards necesitan vive en un solo lugar (R27, R7). Los prefijos que un shell admite antes del
// verbo —`sudo`, `env`, `nohup`…— estaban copiados en tres guards; la copia de `removal.js` tenía ocho de diecisiete,
// y `setsid rm -rf .` pasaba donde `sudo rm -rf .` frenaba. Se reconoce la copia por su forma: una lista literal que
// trae `sudo` y `nohup` juntos, fuera de `shell-wrappers.js`.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const HOOKS = path.resolve(__dirname, '..', '..', 'engine', 'hooks')
const OWNER = 'shell-wrappers.js'

test('ningún guard lleva su propia lista de prefijos de shell', () => {
  const copies = fs.readdirSync(HOOKS).filter((name) => name.endsWith('.js') && name !== OWNER)
    .filter((name) => [...fs.readFileSync(path.join(HOOKS, name), 'utf8').matchAll(/\[[^\]]*\]/g)]
      .some((list) => /'sudo'/.test(list[0]) && /'nohup'/.test(list[0])))
  assert.ok(/'sudo'/.test(fs.readFileSync(path.join(HOOKS, OWNER), 'utf8')), `${OWNER} dejó de traer la lista`)
  assert.deepEqual(copies, [], `usá afterLeaders o LEADING de ${OWNER}`)
})
