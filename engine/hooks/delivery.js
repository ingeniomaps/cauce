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

const { configOf, opsRoot } = require('./input')
const { ordersPull } = require('./orders')
const { PROGRAM_PATH } = require('./quoting')

// Dónde empieza un comando —con la ruta del programa, si la trae—, y qué puede ir entre el programa y su verbo sin
// salir de él: banderas, con su valor separado o pegado (`kubectl -n prod apply`, `terraform -chdir=infra apply`).
const AT = String.raw`(?:^|[\s;&|('"\`])` + PROGRAM_PATH
const FLAGS = String.raw`(?:\s+-{1,2}[^\s;&|]+(?:\s+[^-\s;&|][^\s;&|]*)?)*`
const ENDS = String.raw`(?=$|[\s;&|)'"\`])`
const SAME = String.raw`[^;&|\n]`
const verb = (program, verbs) => `${program}${FLAGS}\\s+(?:${verbs})\\b`

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
const ACTS = new RegExp(AT + String.raw`gh\s+pr\s+(merge|review|close|reopen|comment)\b(${SAME}*)`, 'g')
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
  if (!acts.length || acts.some((act) => !PARTED.has(act[1]))) return null
  const items = acts.map((act) => mergeItem(act[1], act[2]))
  return items.includes(null) ? null : [...new Set(items)]
}
const MERGE = { items: mergeItems, asked: (text, item, how) => ordersPull(text, item, how) }

// Dónde vale cada aprobación, en el quinto lugar de cada regla (caso 446). Un `gh` sin destino lo resuelve solo,
// por lo que dice la regla de `pr create`, así que por archivo se aprueba sólo nombrándolo: con `--repo`, o con
// la ruta de la API escrita entera. Un deploy vale para la carpeta donde corre, porque ahí lee su configuración.
// `kubectl` y `helm` van sin lugar: su destino es el contexto de kubeconfig, y acotarlos por carpeta prometería
// algo que no cumple.
const GH = 'gh'
const DIR = 'dir'

const RULES = [
  [new RegExp(AT + String.raw`gh\s+pr\s+(?:merge|review|close|reopen|comment)\b`), `'gh pr' ${PR}`, MERGE, GH],
  [new RegExp(AT + String.raw`gh\s+api\b${SAME}*\/pulls\/\d+\/(?:merge|reviews)\b`), `'gh api' ${PR}`, null, GH],
  // Sin `--repo`, `gh` elige el destino solo, y en un fork lo resuelve al original: es la forma en que un PR
  // termina en el repositorio de otro equipo. Con el destino nombrado no se frena (R10: a dónde se publica
  // se decide y se comprueba).
  [new RegExp(AT + String.raw`gh\s+pr\s+create\b(?!${SAME}*\s(?:--repo|-R)(?:[\s=]|$))`),
    "'gh pr create' sin --repo abre el PR donde gh resuelva el repositorio, y en un fork puede ser el "
      + 'original. Nombrá el destino con --repo.', null, GH],
  [new RegExp(AT + String.raw`gh\s+(?:workflow\s+run|run\s+rerun|release\s+(?:create|delete|upload|edit))\b`),
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

// En la forma de la tabla de `destructive`, que describe `rulesOf` (`shell.js`): todas tienen salida y todas publican.
function deliveryRules(input) {
  return [...RULES, ...declared(input)]
    .map(([pattern, message, by, place]) => [pattern, message, true, by, place, true])
}

module.exports = { deliveryRules, namesRepo, GH, DIR }
