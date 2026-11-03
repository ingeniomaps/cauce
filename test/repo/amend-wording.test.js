'use strict'

// Lo que el molde y el preámbulo de `autobuild` dicen del amend tiene que decir lo mismo que R8: se frena sobre lo
// publicado, no sobre un commit que no salió de la máquina. Quien obedecía el texto viejo hacía un commit de relleno
// en vez de corregir el suyo (caso 481).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('el molde y autobuild prohíben el amend de lo publicado, no todo amend', () => {
  assert.match(read('template/AGENTS.md'), /reescribe historia publicada con `--force` o `--amend`/)
  assert.match(read('template/planning/PROTOCOL.md'), /No push, force, amend de lo publicado, deploy/)
  assert.match(read('automatization/workflows/autobuild.js'), /Nunca hagas push, deploy, force, amend de lo publicado/)
  assert.doesNotMatch(read('template/planning/PROTOCOL.md'), /No push, amend, force/, 'la forma vieja ya no está')
  assert.doesNotMatch(read('automatization/workflows/autobuild.js'), /Nunca hagas push, deploy, amend, force/)
  assert.doesNotMatch(read('template/AGENTS.md'), /reescribe historia con `--force`/)
  const build = read('automatization/workflows/autobuild.js')
  assert.doesNotMatch(build, /Nunca amend/, 'tampoco en las fases que commitean')
  assert.equal(build.split('${NO_REWRITE}').length - 1, 4, 'las cuatro fases que commitean dicen lo de R8')
})
