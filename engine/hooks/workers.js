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

const path = require('node:path')
const { block, commandOf, opsRoot, asRun, configOf } = require('./input')
const AP = require('./approval')

// En posición de comando —al principio o después de `;`, `&`, `|` o `(`—, con variables de entorno delante:
// `jest` dentro de un `grep` o de un mensaje no es correrlo. Una comilla abre comando sólo detrás del `-c` de
// un shell, que es donde lo entrecomillado se ejecuta. Contarla siempre tomaba por una corrida el patrón
// `'jest'` de un `grep`, y también lo que seguía a la comilla de cierre de cualquier argumento: `'swc'
// jest.config.*` (caso 286).
const SHELL_C = String.raw`\b(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*-\w*c\s+['"]`
const AT = String.raw`(?:^|[;&|(\n]|${SHELL_C})\s*(?:\w+=\S*\s+)*`
const SAME = String.raw`[^;&|\n]*`
const LAUNCHER = String.raw`(?:(?:npx|bunx|pnpm(?:\s+exec)?|yarn)\s+)?`
const RUNNER = new RegExp(AT + LAUNCHER + String.raw`(?:\S*\/)?(jest|vitest)\b(${SAME})`, 'g')
const CAPPED = {
  jest: /(?:^|\s)(?:--maxWorkers(?:=|\s)|-w(?:=|\s)|--runInBand\b|-i\b)/,
  vitest: /(?:^|\s)(?:--maxWorkers(?:=|\s)|--no-file-parallelism\b)/,
}
const NO_RUN = /(?:^|\s)(?:--version|--help|-h|--listTests|--showConfig)\b/

// El comando de más afuera que contiene esa posición: desde el último `;`, `&`, `|` o salto de línea que no
// esté entre comillas. Es el que dice con qué se lanzó lo que va adentro de un `sh -c '…'`.
function outerCommand(text, index) {
  let start = 0
  let quote = ''
  for (let at = 0; at < index; at += 1) {
    const char = text[at]
    if (quote) quote = char === quote ? '' : quote
    else if (char === "'" || char === '"') quote = char
    else if (';&|\n'.includes(char)) start = at + 1
  }
  return text.slice(start, index)
}

// Lo que el proyecto declaró que ya corre con tope de recursos —un script que lanza dentro de un contenedor
// con memoria y CPU acotadas—. Ahí el runner no puede tirar la máquina, que es lo único que este guard
// cuida, y frenarlo costaba un reintento por cada corrida de pruebas (caso 291). Se compara como
// `deployCommands`, por cómo empieza el comando, y el programa por su nombre: el mismo script se llama con
// ruta relativa, absoluta o desde otra carpeta.
function bounded(outer, declared) {
  const words = outer.trim().split(/\s+/).filter((word) => !/^[A-Za-z_]\w*=/.test(word))
  return declared.some((entry) => {
    const [program, ...rest] = entry.trim().split(/\s+/)
    return path.basename(words[0] || '') === path.basename(program)
      && rest.every((word, at) => words[at + 1] === word)
  })
}

function testWorkers(input) {
  const command = commandOf(input)
  const root = opsRoot(input)
  const declared = (root && configOf(root).boundedCommands) || []
  // Con la lectura de los demás guards de shell: lo que un programa sólo lee no es un comando.
  const read = asRun(command)
  for (const match of read.matchAll(RUNNER)) {
    const [, tool, args] = match
    if (CAPPED[tool].test(args) || NO_RUN.test(args)) continue
    // Desde dónde está el runner y no desde donde empieza la coincidencia, que arranca en el separador: con
    // `acotado …; npx jest` el comando de afuera de ese `jest` es el segundo.
    const at = match.index + match[0].length - args.length - tool.length
    if (declared.length && bounded(outerCommand(read, at), declared)) continue
    const item = command.trim()
    if (!AP.pending(root, [item], input).length) return
    block(`'${tool}' sin cota de workers lanza tantos procesos como núcleos, y dos a la vez tiran la máquina. `
      + `Agregale ${tool === 'jest' ? '--maxWorkers=2 (o --runInBand)' : '--maxWorkers=2 (o --no-file-parallelism)'}. `
      + 'Si este comando ya corre con tope de recursos, una persona lo declara en boundedCommands de '
      + 'ops.config.json y el guard deja de opinar sobre él.'
      + `\n${AP.HOW(null, [item], input, [item], { fixable: true })}`)
  }
}

module.exports = { testWorkers }
