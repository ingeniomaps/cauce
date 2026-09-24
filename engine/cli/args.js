'use strict'

// La gramática de la línea de comandos, en su propio módulo para poder probarla sin ejecutar el
// CLI: `tools/ops.js` invoca el comando haciendo `require` del motor, así que ops.js corre al ser
// requerido y no puede exportar nada sin dispararse.

// Banderas que consumen el argumento siguiente: su valor no es un posicional.
const VALUED_FLAGS = new Set([
  '--name', '--mode', '--fixture', '--period', '--record', '--runner', '--integration',
  '--task', '--promote', '--hito', '--reason',
])

// Qué acepta cada comando, y a la vez qué comandos existen. Una bandera desconocida se rechaza en vez
// de ignorarse: `check --jsonn` imprimía la salida humana con código 0, así que quien esperaba JSON
// —un agente, típicamente— recibía texto sin ninguna señal de que su bandera no existía.
const FLAGS = {
  init: ['--name', '--mode', '--force', '--runner', '--integration', '--install', '--no-install'],
  scan: ['--json'],
  onboard: ['--json'],
  check: ['--json'],
  tree: ['--json', '--no-color'],
  context: ['--json', '--hito'],
  contract: ['--json'],
  bench: ['--force'],
  recurring: ['--json', '--promote'],
  claim: ['--json'],
  runners: ['--json'],
  worktree: ['--json'],
  release: [],
  evidence: ['--json', '--task'],
  upgrade: ['--check', '--force'],
  destroy: ['--force'],
  archive: [],
  adopt: [],
  agents: ['--json', '--own', '--system'],
  integration: ['--fixture'],
  secrets: [],
  automation: ['--force'],
  learn: ['--flow', '--proposal', '--applied', '--unchanged', '--archived', '--period', '--reason'],
  evaluate: ['--cases', '--json', '--bench', '--force', '--record', '--flow'],
  flow: ['--json'],
}

// Qué banderas acepta un comando, y `[]` si el comando no existe. `FLAGS[nombre]` a secas resuelve
// contra `Object.prototype`, así que `constructor` contestaba una función —que es verdadera, y el CLI
// daba el comando por bueno— y `toString` contestaba un método sin `.includes`, que reventaba acá
// mismo. No es un nombre exótico: es lo que sale de pasarle a `ops` una variable que vino vacía.
const accepted = (command) => (Object.hasOwn(FLAGS, command) ? FLAGS[command] : [])

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
    // `-h` es la única bandera corta que el CLI anuncia, y como no empieza con `--` caía de posicional:
    // `ops check -h` tomaba `-h` por la raíz del planning y contestaba que ahí no había ninguno. Se
    // normaliza a `--help` para que adentro haya una sola grafía y nadie tenga que preguntar por las dos.
    if (value === '-h') { flags.add('--help'); continue }
    if (!value.startsWith('--')) { positional.push(value); continue }
    flags.add(value)
    if (VALUED_FLAGS.has(value)) { values[value] = argv[index + 1] || ''; index += 1 }
  }
  return {
    positional,
    has: (flag) => flags.has(flag),
    value: (flag, fallback = '') => values[flag] || fallback,
    // Lo que el comando no declara en `FLAGS`. Se calcula sobre `flags` y no sobre argv crudo para
    // que el valor de una bandera con valor no se confunda con una bandera suelta. `--help` la acepta
    // cualquier comando y por eso no la declara ninguno: sin esta excepción, pedir ayuda sería una
    // bandera desconocida.
    unknown: (command) => [...flags]
      .filter((flag) => flag !== '--help')
      .filter((flag) => !accepted(command).includes(flag)),
  }
}

module.exports = { FLAGS, parse }
