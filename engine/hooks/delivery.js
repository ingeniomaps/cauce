'use strict'

// Lo que publica fuera de la máquina sin ser un push (caso 225). R10 nombra seis actos —push, PR, merge,
// tags, deploy y rollback— y el motor comprobaba sólo el push, con el argumento de que los otros no tenían
// una forma reconocible en un comando (caso 025). Para `gh` eso no es así, y dos instancias construyeron este
// mismo guard por su cuenta; una de ellas, después de dos merges que nadie había autorizado.
//
// Son reglas «con salida» de `destructive`: frenan y se destraban como el resto —el diálogo de Claude Code,
// una orden en el chat, o la línea exacta en `.ops-approval`—. La orden nombra el comando, salvo para mergear,
// cerrar o reabrir un PR, que se piden con sus palabras (`ordersPull`). Lo que se gobierna es una lista, no todo lo
// que pudiera desplegar: un deploy hecho con un script propio no tiene forma hasta que el proyecto la declara en
// `deployCommands`.

const { execFileSync } = require('node:child_process')
const { configOf, cwdOf, gitDirectory, opsRoot } = require('./input')
const { apiActs } = require('./github-api')
const { namedCommand } = require('./chat')
const { ordersPull } = require('./orders')
const { PROGRAM_PATH } = require('./quoting')

// Dónde empieza un comando —con la ruta del programa, si la trae—, y qué puede ir entre el programa y su verbo sin
// salir de él: banderas, con su valor separado o pegado (`kubectl -n prod apply`, `terraform -chdir=infra apply`).
const AT = String.raw`(?:^|[\s;&|('"\`])` + PROGRAM_PATH
const FLAGS = String.raw`(?:\s+-{1,2}[^\s;&|]+(?:\s+[^-\s;&|][^\s;&|]*)?)*`
const ENDS = String.raw`(?=$|[\s;&|)'"\`])`
const SAME = String.raw`[^;&|\n]`
const verb = (program, verbs) => `${program}${FLAGS}\\s+(?:${verbs})\\b`
// `gh` acepta el repositorio antes del subcomando —`gh -R acme/app pr merge 5`, `-Racme/app`—, y escrito ahí no se
// veía el acto; repetido, vale el último. `gh api` no lo acepta (`unknown shorthand flag: 'R'`, gh 2.86.0).
const GH_REPO = String.raw`gh(?:\s+(?:-R\s*|--repo(?:=|\s+))([^\s;&|]+))*`

const PR = "actúa sobre un pull request —mergear, aprobar, cerrar o comentar es publicar en el repositorio de "
  + 'otra gente— y R10 lo deja a una persona. Si son varios, van en un mismo comando: la confirmación cubre '
  + 'lo que se frenó junto.'
const DEPLOY = 'es un deploy: cambia un ambiente que otros usan, y R10 lo deja a una persona.'

// Un merge se aprueba por lo que mergea y no por cómo quedó escrita la línea: con el comando entero como
// ítem, el sí a un PR no alcanzaba al mismo PR con las banderas en otro orden, ni una orden de la persona
// podía nombrarlo (caso 280). El ítem es el PR y su repositorio; `--admin` queda adentro porque saltea la
// protección de la rama, que es otro acto. Aprobar —firma por la persona— y comentar no se leen por partes: con uno
// de ellos en el comando vale el comando entero, como en el resto de las reglas.
//
// Cerrar y reabrir sí (caso 520), porque son reversibles, y por eso sólo con lo que no lo cambia: el número, el
// repositorio y el comentario con que se cierra (`-c`), que viaja con el cierre como el cuerpo de un merge. Cualquier
// otra palabra vuelve al comando entero, en vez de una lista de las que se frenan: `-d` borra la rama, y
// `--delete-branch=true`, `-dc` o un `-d"` dentro de un `bash -c` se escribían sin pasar por esa lista.
//
// Y para los tres, un tramo que termina con una comilla abierta: `ACTS` lo cortó en un `;`, `&` o `|` del comentario o
// del cuerpo, y lo que seguía —un `-d`, un `--admin`— no se leyó.
const VALUED = new Set(['-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email',
  '--match-head-commit'])
const COMMENT = new Set(['-c', '--comment'])
const unclosed = (args) => (args.replace(/"[^"]*"|'[^']*'/g, '').match(/["']/) || []).length > 0
const ACTS = new RegExp(AT + String.raw`${GH_REPO}\s+pr\s+(merge|review|close|reopen|comment)\b(${SAME}*)`, 'g')
const PARTED = new Set(['merge', 'close', 'reopen'])
function mergeItem(act, args) {
  const words = (args.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((word) => word.replace(/^(["'])(.*)\1$/, '$2'))
  const closing = act !== 'merge'
  if (unclosed(args)) return null
  let target = ''
  let repo = ''
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at]
    if (word === '--repo' || word === '-R') repo = words[at += 1] || ''
    else if (word.startsWith('--repo=')) repo = word.slice('--repo='.length)
    else if ((closing ? COMMENT : VALUED).has(word)) at += 1
    else if (!word.startsWith('-') && !target) target = word
    else if (closing && !word.startsWith('--comment=')) return null
  }
  const url = /github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/.exec(target)
  if (url) [, repo, target] = url
  return [`gh pr ${act}`, target, repo && `--repo ${repo}`, words.includes('--admin') && '--admin']
    .filter(Boolean).join(' ')
}
function mergeItems(command) {
  const acts = [...command.matchAll(ACTS)]
  if (!acts.length || acts.some((act) => !PARTED.has(act[2]))) return null
  const items = acts.map((act) => mergeItem(act[2], act[1] ? `--repo ${act[1]} ${act[3]}` : act[3]))
  return items.includes(null) ? null : [...new Set(items)]
}
const MERGE = { items: mergeItems, asked: (text, item, how) => ordersPull(text, item, how) }
// Cómo se escribe hoy una línea de `.ops-approval` que nombra un merge, un cierre o una reapertura con el comando
// entero: el ítem se lee por partes (casos 280 y 520), así que esa línea ya no aprueba nada. `null` si la línea ya
// está en esa forma, o si el comando no se lee por partes y se sigue aprobando entero.
function rewrittenPull(line) {
  const items = mergeItems(line)
  return items && !items.includes(line.trim()) ? items.join(' y ') : null
}

// Lo mismo, pedido a la API (caso 539).
const API = { items: (command) => [...new Set(apiActs(command).map((one) => one.text))], asked: namedCommand }
const API_ACT = 'pide a la API de GitHub un acto que R10 deja a una persona —mergear, aprobar, cerrar o comentar un '
  + 'PR, disparar un workflow, publicar una release o mover una rama—, igual que su subcomando de `gh`.'

// Dónde vale cada aprobación, en el quinto lugar de cada regla (caso 446). Un `gh` sin destino lo resuelve solo,
// por lo que dice la regla de `pr create`, así que por archivo se aprueba sólo nombrándolo: con `--repo`, o con
// la ruta de la API escrita entera. Un deploy vale para la carpeta donde corre, porque ahí lee su configuración.
// `kubectl` y `helm` van sin lugar: su destino es el contexto de kubeconfig, y acotarlos por carpeta prometería
// algo que no cumple.
const GH = 'gh'
const DIR = 'dir'

const RULES = [
  [new RegExp(AT + String.raw`${GH_REPO}\s+pr\s+(?:merge|review|close|reopen|comment)\b`), `'gh pr' ${PR}`, MERGE, GH],
  [new RegExp(AT + String.raw`(?:gh\s+api|curl|wget|https?|xh)\s`), `el comando ${API_ACT}`, API, GH],
  // Sin `--repo`, `gh` elige el destino solo, y en un fork lo resuelve al original: es la forma en que un PR
  // termina en el repositorio de otro equipo. Con el destino nombrado, lo compara `destination`. `new` es el alias.
  [new RegExp(AT + String.raw`gh\s+pr\s+(?:create|new)\b(?!${SAME}*\s(?:--repo|-R))`),
    "'gh pr create' sin --repo abre el PR donde gh resuelva el repositorio, y en un fork puede ser el "
      + 'original. Nombrá el destino con --repo.', null, GH],
  [new RegExp(AT + String.raw`${GH_REPO}\s+(?:workflow\s+run|run\s+rerun|release\s+(?:create|delete|upload|edit))\b`),
    "'gh' dispara o publica fuera de la máquina —un workflow, una release— y R10 lo deja a una persona.", null, GH],
  [new RegExp(AT + `(?:${[
    verb('(?:terraform|tofu)', 'apply|destroy|import'),
    verb('pulumi', 'up|destroy|refresh'),
    verb('cdk', 'deploy|destroy'),
  ].join('|')})`), `el comando ${DEPLOY}`, null, DIR],
  [new RegExp(AT + `(?:${[
    verb('kubectl', 'apply|delete|create|replace|patch|edit|scale|rollout|set|label|annotate|drain|cordon'),
    verb('helm', 'install|upgrade|uninstall|rollback|delete'),
  ].join('|')})`), `el comando ${DEPLOY}`],
]

// Si cada `gh` del texto nombra su repositorio: `--repo`/`-R`, o una ruta de la API con dueño y nombre escritos.
// Se mira por llamada y no por el texto entero: con dos en una línea, el `--repo` de una no nombra el de la otra.
// Los marcadores `{owner}` y `{repo}` los completa `gh` desde el cwd, así que no cuentan; tampoco la forma con dos
// puntos, que es la dirección segura si alguna versión todavía la completa.
const NAMED = [new RegExp(String.raw`\s(?:--repo|-R)(?:[\s=]|$)`),
  /(?:^|[\s/])repos\/(?![{:])[^/\s]+\/(?![{:])[^/\s]+\//]
// Lo que va entre comillas es un valor —un `--body`, un mensaje— y no nombra nada; pero se blanquea recién al buscar
// el repositorio, porque un `gh` entre comillas, como en `bash -c "gh pr merge 5"`, sigue siendo una llamada.
const unvalued = (call) => call.replace(/"[^"]*"|'[^']*'/g, '""')
const CALLS_GH = new RegExp(String.raw`(?:^|[\s('"\`])${PROGRAM_PATH}gh\s`)
const namesRepo = (text) => text.split(/&&|\|\||[;|&\n]/).filter((call) => CALLS_GH.test(call))
  .every((call) => NAMED.some((one) => one.test(unvalued(call))))

// Los comandos de deploy que el proyecto declara, como se escriben al principio de un comando.
function declared(input) {
  const root = opsRoot(input)
  const list = root ? configOf(root).deployCommands : null
  return (Array.isArray(list) ? list : []).filter((one) => typeof one === 'string' && one.trim())
    .map((one) => [new RegExp(AT + one.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ENDS),
      `'${one.trim()}' está declarado en deployCommands de ops.config.json: ${DEPLOY}`, null, DIR])
}

// `dueño/nombre` de una URL de remoto o de un `--repo` —`git@host:o/r.git`, `ssh://git@host:443/o/r`,
// `https://cred@host/o/r`, `host/o/r`, `o/r`—: los dos últimos tramos. Sin mirar el host, porque GitHub Enterprise es
// otro host y el mismo `gh`.
function slugOf(text) {
  const parts = String(text).trim().replace(/^["']|["']$/g, '').replace(/\.git\/?$|\/+$/i, '').split(/[/:]/)
    .filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('/').toLowerCase() : ''
}

// El repositorio del `origin` de un checkout. La URL puede traer una credencial (caso 530): se usa para comparar y no
// sale de acá.
function originOf(dir) {
  try {
    return slugOf(execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: 'pipe' }))
  } catch { return '' }
}

// Con el destino nombrado, que sea el repositorio en el que se trabaja (caso 540): R10 dice que se comprueba, y la
// regla de arriba sólo comprobaba que estuviera escrito. Es el `origin` del checkout donde se corre, que es lo que
// R10 llama el repositorio en el que se trabaja; en un fork, el fork. Sin `origin` no hay contra qué comparar, y frena.
const CREATES = new RegExp(AT + String.raw`${GH_REPO}\s+pr\s+(?:create|new)\b(${SAME}*)`, 'g')
// Como `gh`, vale el último `--repo`, también si el primero iba antes del subcomando.
function namedTarget(before, args) {
  const words = args.match(/"[^"]*"|'[^']*'|\S+/g) || []
  let target = before || ''
  for (let at = 0; at < words.length; at += 1) {
    const flag = /^(?:--repo=|-R)(.+)$/.exec(words[at])
    if (flag) target = flag[1]
    else if (words[at] === '--repo' || words[at] === '-R') target = words[at += 1] || ''
  }
  return target
}
function destination(input) {
  const raw = String((input.tool_input || {}).command || '')
  if (!/\bpr\s+(?:create|new)\b/.test(raw)) return []
  const dir = gitDirectory(raw, cwdOf(input), input)
  const origin = originOf(dir)
  const items = (command) => [...command.matchAll(CREATES)]
    .map((call) => namedTarget(call[1], call[2]).replace(/^["']|["']$/g, ''))
    .filter((repo) => repo && (!slugOf(repo) || slugOf(repo) !== origin))
    .map((repo) => `gh pr create --repo ${repo}`)
  const what = origin ? `abre el PR en un repositorio que no es el origin del checkout, que en ${dir} es ${origin}`
    : `nombra un destino que no se puede comprobar: ${dir} no tiene origin`
  return [[new RegExp(AT + String.raw`${GH_REPO}\s+pr\s+(?:create|new)\b`),
    `'gh pr create' ${what}. R10 dice que lo que se publica va al repositorio en el que se trabaja —en un fork, el `
      + 'fork—, y saltar al original se pide.',
    { items: (command) => [...new Set(items(command))], asked: namedCommand }, GH]]
}

// En la forma de la tabla de `destructive`, que describe `rulesOf` (`shell.js`): todas tienen salida y todas publican.
function deliveryRules(input) {
  return [...RULES, ...destination(input), ...declared(input)]
    .map(([pattern, message, by, place]) => [pattern, message, true, by, place, true])
}

module.exports = { deliveryRules, namesRepo, rewrittenPull, GH, DIR }
