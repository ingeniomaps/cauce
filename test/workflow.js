'use strict'

// Un workflow renderizado y vuelto invocable. Dos suites lo ejecutan de verdad con los subagentes
// simulados —`autobuild.test.js` y `flow.test.js`— y las dos lo montaban con el mismo bloque.
//
// El único retoque al fuente: `export` no es válido dentro de una función. El resto se ejecuta tal
// cual, para que un cambio en el recorrido rompa en la suite y no en una instancia.

const path = require('node:path')

const automation = require('../engine/automation')

const AUTOMATION = path.resolve(__dirname, '..', 'automatization')

function compileWorkflow(name) {
  const file = path.join(AUTOMATION, 'workflows', `${name}.js`)
  const source = automation.render(file, '', AUTOMATION).replace(/^export const meta =/m, 'const meta =')
  return new Function('agent', 'phase', 'log', 'parallel', 'pipeline', 'workflow', 'args', 'budget',
    `return (async () => {\n${source}\n})()`)
}

module.exports = { compileWorkflow }
