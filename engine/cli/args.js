'use strict'

// La gramática de la línea de comandos, en su propio módulo para poder probarla sin ejecutar el
// CLI: `tools/ops.js` invoca el comando haciendo `require` del motor, así que ops.js corre al ser
// requerido y no puede exportar nada sin dispararse.

// Banderas que consumen el argumento siguiente: su valor no es un posicional.
const VALUED_FLAGS = new Set([
  '--name', '--mode', '--fixture', '--period', '--record', '--runner', '--integration',
])

// Qué acepta cada comando, y a la vez qué comandos existen. Una bandera desconocida se rechaza en vez
// de ignorarse: `check --jsonn` imprimía la salida humana con código 0, así que quien esperaba JSON
// —un agente, típicamente— recibía texto sin ninguna señal de que su bandera no existía.
const FLAGS = {
  init: ['--name', '--mode', '--force', '--runner', '--integration', '--install', '--no-install'],
  check: ['--json'],
  tree: ['--json', '--no-color'],
  context: ['--json'],
  upgrade: ['--check', '--force'],
  archive: [],
  agents: ['--json', '--own', '--system'],
  integration: ['--fixture'],
  automation: ['--force'],
  learn: ['--proposal', '--applied', '--period'],
  evaluate: ['--cases', '--json', '--bench', '--force', '--record'],
  team: ['--json'],
}

// La línea de comandos, leída una sola vez. Antes cada función buscaba sus banderas en
// `process.argv`, veinticinco veces y a cualquier profundidad: `evaluationBench` sacaba `--force` de
// ahí en vez de recibirlo, así que su firma no decía de qué dependía y probar un comando exigía
// levantar un proceso. Acá se parsea al entrar y lo demás recibe el resultado.
function parse(argv) {
  const flags = new Set()
  const values = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) { positional.push(value); continue }
    flags.add(value)
    if (VALUED_FLAGS.has(value)) { values[value] = argv[index + 1] || ''; index += 1 }
  }
  return {
    positional,
    has: (flag) => flags.has(flag),
    value: (flag, fallback = '') => values[flag] || fallback,
    // Lo que el comando no declara en `FLAGS`. Se calcula sobre `flags` y no sobre argv crudo para
    // que el valor de una bandera con valor no se confunda con una bandera suelta.
    unknown: (command) => [...flags].filter((flag) => !FLAGS[command].includes(flag)),
  }
}

module.exports = { FLAGS, VALUED_FLAGS, parse }
