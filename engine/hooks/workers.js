'use strict'

// Un runner de pruebas sin cota de workers lanza tantos procesos como núcleos tenga la máquina (caso 232).
// Dos agentes que lo corren a la vez la saturan: en una instancia real, dos Review lanzaron `npx jest` en
// paralelo y la sesión murió por memoria. `verify` ya corre de a uno (caso 240); esto cubre lo que un agente
// lanza por su cuenta.
//
// Lo que cada herramienta acepta, de su documentación: jest 30.5 —`--maxWorkers`/`-w` con número o
// porcentaje, y `--runInBand`/`-i`; por defecto «los núcleos menos uno»— y vitest 5.0.3 —`--maxWorkers` con
// número o porcentaje, y `--no-file-parallelism`—. nx queda afuera: su `--parallel` ya vale 3 por defecto, y
// lo que multiplica son los jest que lanza cada tarea, que se cotan en la configuración del proyecto y no en
// la línea de comando.
//
// Sólo se ve la llamada directa. `npm test` corre lo que diga el script, y eso lo cota el script.

const { block, commandOf, opsRoot } = require('./input')
const AP = require('./approval')

// En posición de comando —al principio o después de `;`, `&`, `|`, `(` o una comilla—, con variables de
// entorno delante: `jest` dentro de un `grep` o de un mensaje no es correrlo. Lo que va entre comillas no se
// vacía, porque `bash -c "npx jest"` sí lo corre.
const AT = String.raw`(?:^|[;&|(\n'"])\s*(?:\w+=\S*\s+)*`
const SAME = String.raw`[^;&|\n]*`
const LAUNCHER = String.raw`(?:(?:npx|bunx|pnpm(?:\s+exec)?|yarn)\s+)?`
const RUNNER = new RegExp(AT + LAUNCHER + String.raw`(?:\S*\/)?(jest|vitest)\b(${SAME})`, 'g')
const CAPPED = {
  jest: /(?:^|\s)(?:--maxWorkers(?:=|\s)|-w(?:=|\s)|--runInBand\b|-i\b)/,
  vitest: /(?:^|\s)(?:--maxWorkers(?:=|\s)|--no-file-parallelism\b)/,
}
const NO_RUN = /(?:^|\s)(?:--version|--help|-h|--listTests|--showConfig)\b/

function testWorkers(input) {
  const command = commandOf(input)
  for (const match of command.matchAll(RUNNER)) {
    const [, tool, args] = match
    if (CAPPED[tool].test(args) || NO_RUN.test(args)) continue
    const item = command.trim()
    if (!AP.pending(opsRoot(input), [item], input).length) return
    block(`'${tool}' sin cota de workers lanza tantos procesos como núcleos, y dos a la vez tiran la máquina. `
      + `Agregale ${tool === 'jest' ? '--maxWorkers=2 (o --runInBand)' : '--maxWorkers=2 (o --no-file-parallelism)'}.`
      + `\n${AP.HOW(null, [item], input)}`)
  }
}

module.exports = { testWorkers }
