'use strict'

// El lado del motor de `automatization/shared/acceptance.js`: lo evalúa en vez de copiarlo. El archivo
// declara constantes sueltas porque así lo incluye un recorrido, y un fragmento así no se puede
// `require`; evaluado aparte da los mismos valores que recibe el recorrido renderizado.

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SOURCE = path.join(__dirname, '..', '..', 'automatization', 'shared', 'acceptance.js')

const { acceptanceConditions, OUT_OF_VERIFY, NON_EXECUTABLE } = vm.runInNewContext(
  `${fs.readFileSync(SOURCE, 'utf8')}\n;({ acceptanceConditions, OUT_OF_VERIFY, NON_EXECUTABLE })`,
  {}, { filename: SOURCE },
)

module.exports = { acceptanceConditions, OUT_OF_VERIFY, NON_EXECUTABLE }
