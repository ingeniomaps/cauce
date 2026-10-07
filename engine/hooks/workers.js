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
const { block, commandOf, opsRoot, asRun, configOf, unquoted } = require('./input')
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
//
// De cómo se leen las comillas depende quién es «el de afuera», así que se leen como el shell en lo que acá
// importa: una barra escapa lo que sigue —también el salto que continúa un renglón—, `$'…'` admite escape, y
// un comentario no abre cadenas. Y lo que va adentro de una sustitución —`$(…)`, `<(…)`, backticks— lo
// ejecuta esta máquina antes de lanzar nada: adentro vuelve a empezar la lectura, con sus comillas y sus
// paréntesis, y su comando de afuera es la sustitución y no quien la recibe. Sin eso, un runner puesto ahí
// heredaba la cota de un comando que nunca lo contuvo (caso 313). Lo que no lee: el `)` de un `case`.
function outerCommand(text, index) {
  let [start, quote, depth, escaped] = [0, '', 0, -2]
  const outside = []
  const leave = () => { ({ start, quote, depth } = outside.pop()) }
  for (let at = 0; at < index; at += 1) {
    const char = text[at]
    if (quote === "'") { if (char === "'") quote = ''; continue }
    if (char === '\\') { escaped = at += 1; continue }
    if (quote === "$'") { if (char === "'") quote = ''; continue }
    const before = escaped === at - 1 ? '\\' : text.charAt(at - 1)
    const tick = char === '`'
    if (tick && outside.at(-1)?.tick) leave()
    else if (tick || (char === '(' && (before === '$' || (!quote && /[<>]/.test(before))))) {
      outside.push({ start, quote, depth, tick })
      ;[start, quote, depth] = [at + 1, '', 0]
    } else if (quote) quote = char === quote ? '' : quote
    else if (char === '(') depth += 1
    else if (char === ')' && depth) depth -= 1
    else if (char === ')' && outside.length) leave()
    else if (char === "'" || char === '"') quote = before === '$' && char === "'" ? "$'" : char
    else if (char === '#' && /^$|[\s;&|]/.test(before)) {
      const end = text.indexOf('\n', at)
      if (end === -1 || end >= index) return ''
      at = end - 1
    } else if (';&|\n'.includes(char)) start = at + 1
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

// Un contenedor lanzado a mano con tope de memoria y de CPU está igual de acotado que un comando declarado,
// y frenarlo empujaba a correr la prueba de otra forma que la del CI (caso 313). Hacen falta los dos topes,
// cada vez que aparezcan con un número mayor que cero, y como opciones del propio `run`: las que van antes de
// la imagen. Las de después son argumentos del programa de adentro, y ese contenedor no tiene tope.
//
// Para saber dónde termina lo de `run` hay que saber qué opción lleva valor. Se listan las que **no** llevan,
// todas las de `docker run --help` 27.2.1 y `podman run --help` 4.9.3, y cualquier otra se lleva la palabra
// que sigue. La lista tiene que estar completa: una que falte se llevaría la imagen, y lo que el programa de
// adentro reciba con forma de opción se leería como de `run`. Una versión que agregue otra pide agregarla acá.
// Cuánto es mucho no se juzga: quien lo escribe ya lo decidió, como con `boundedCommands`.
const LONE = new Set(['--detach', '--disable-content-trust', '--env-host', '--help', '--http-proxy', '--init',
  '--interactive', '--no-healthcheck', '--no-hosts', '--oom-kill-disable', '--passwd', '--privileged',
  '--publish-all', '--quiet', '--read-only', '--read-only-tmpfs', '--replace', '--rm', '--rmi', '--rootfs',
  '--sig-proxy', '--tls-verify', '--tty', '--unsetenv-all'])
const LIMITS = { '--memory': /^\d*\.?\d+(?:[bkmg]b?)?$/i, '--cpus': /^\d*\.?\d+$/ }
function cappedContainer(outer) {
  const words = unquoted(outer.replace(/\\\n/g, ' ')).trim().split(/\s+/)
    .filter((word) => !/^[A-Za-z_]\w*=/.test(word))
  if (words[0] === 'sudo') words.shift()
  if (!['docker', 'podman'].includes(path.basename(words[0] || '')) || words[1] !== 'run') return false
  const given = { '--memory': [], '--cpus': [] }
  for (let at = 2; at < words.length && words[at].startsWith('-'); at += 1) {
    if (LONE.has(words[at]) || /^-[ditPq]+$/.test(words[at])) continue
    const [name, joined] = words[at].split(/=(.*)/)
    const value = joined === undefined ? words[at += 1] : joined
    const limit = name === '-m' ? '--memory' : name
    if (given[limit]) given[limit].push(LIMITS[limit].test(value) && Number.parseFloat(value) > 0)
  }
  return Object.values(given).every((seen) => seen.length && seen.every(Boolean))
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
    const outer = outerCommand(read, at)
    if ((declared.length && bounded(outer, declared)) || cappedContainer(outer)) continue
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
