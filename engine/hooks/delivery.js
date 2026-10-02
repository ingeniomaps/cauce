'use strict'

// Lo que publica fuera de la máquina sin ser un push (caso 225). R10 nombra seis actos —push, PR, merge,
// tags, deploy y rollback— y el motor comprobaba sólo el push, con el argumento de que los otros no tenían
// una forma reconocible en un comando (caso 025). Para `gh` eso no es así, y dos instancias construyeron este
// mismo guard por su cuenta; una de ellas, después de dos merges que nadie había autorizado.
//
// Son reglas «con salida» de `destructive`: frenan y se destraban como el resto —el diálogo de Claude Code,
// una orden en el chat que las nombre, o la línea exacta en `.ops-approval`—. Lo que se gobierna es una
// lista, no todo lo que pudiera desplegar: un deploy hecho con un script propio no tiene forma hasta que el
// proyecto la declara en `deployCommands`.

const { configOf, opsRoot } = require('./input')

// Dónde empieza un comando, y qué puede ir entre el programa y su verbo sin salir de él: banderas, con su
// valor separado o pegado (`kubectl -n prod apply`, `terraform -chdir=infra apply`).
const AT = String.raw`(?:^|[\s;&|('"\`])`
const FLAGS = String.raw`(?:\s+-{1,2}[^\s;&|]+(?:\s+[^-\s;&|][^\s;&|]*)?)*`
const ENDS = String.raw`(?=$|[\s;&|)'"\`])`
const SAME = String.raw`[^;&|\n]`
const verb = (program, verbs) => `${program}${FLAGS}\\s+(?:${verbs})\\b`

const PR = "actúa sobre un pull request —mergear, aprobar, cerrar o comentar es publicar en el repositorio de "
  + 'otra gente— y R10 lo deja a una persona.'
const DEPLOY = 'es un deploy: cambia un ambiente que otros usan, y R10 lo deja a una persona.'

const RULES = [
  [new RegExp(AT + String.raw`gh\s+pr\s+(?:merge|review|close|reopen|comment)\b`), `'gh pr' ${PR}`],
  [new RegExp(AT + String.raw`gh\s+api\b${SAME}*\/pulls\/\d+\/(?:merge|reviews)\b`), `'gh api' ${PR}`],
  // Sin `--repo`, `gh` elige el destino solo, y en un fork lo resuelve al original: es la forma en que un PR
  // termina en el repositorio de otro equipo. Con el destino nombrado no se frena (R10: a dónde se publica
  // se decide y se comprueba).
  [new RegExp(AT + String.raw`gh\s+pr\s+create\b(?!${SAME}*\s(?:--repo|-R)(?:[\s=]|$))`),
    "'gh pr create' sin --repo abre el PR donde gh resuelva el repositorio, y en un fork puede ser el "
      + 'original. Nombrá el destino con --repo.'],
  [new RegExp(AT + String.raw`gh\s+(?:workflow\s+run|run\s+rerun|release\s+(?:create|delete|upload|edit))\b`),
    "'gh' dispara o publica fuera de la máquina —un workflow, una release— y R10 lo deja a una persona."],
  [new RegExp(AT + `(?:${[
    verb('(?:terraform|tofu)', 'apply|destroy|import'),
    verb('kubectl', 'apply|delete|create|replace|patch|edit|scale|rollout|set|label|annotate|drain|cordon'),
    verb('helm', 'install|upgrade|uninstall|rollback|delete'),
    verb('pulumi', 'up|destroy|refresh'),
    verb('cdk', 'deploy|destroy'),
  ].join('|')})`), `el comando ${DEPLOY}`],
]

// Los comandos de deploy que el proyecto declara, como se escriben al principio de un comando.
function declared(input) {
  const root = opsRoot(input)
  const list = root ? configOf(root).deployCommands : null
  return (Array.isArray(list) ? list : []).filter((one) => typeof one === 'string' && one.trim())
    .map((one) => [new RegExp(AT + one.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ENDS),
      `'${one.trim()}' está declarado en deployCommands de ops.config.json: ${DEPLOY}`])
}

// En la forma de la tabla de `destructive`: patrón, mensaje y si tiene salida —todas la tienen—.
function deliveryRules(input) {
  return [...RULES, ...declared(input)].map(([pattern, message]) => [pattern, message, true])
}

module.exports = { deliveryRules }
