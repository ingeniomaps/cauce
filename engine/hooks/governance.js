'use strict'

// Lo que un commit no toca sin una persona: reglas, ADR, el protocolo, el contrato de un cargo y lo que lo
// mide. Es un gate de commit como `verify` y `dependencies`, y vive aparte de `shell.js` por lo mismo que
// `live-commit.js` y `ai-signature.js`: frena por política sobre qué archivos entran, no por la forma del
// comando, y tiene su propia salida —la aprobación por archivo— que los guards de forma no tienen.

const path = require('node:path')
const { commandOf, cwdOf, block, isCommit, stagedForCommit, opsRoot, realPath, toplevel } = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')

function governance(input) {
  if (process.env.OPS_GOVERNANCE_OVERRIDE === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  // Con una persona conduciendo el turno, este guard no pregunta nada. Frena por **política** —qué archivos
  // toca un commit— y no por un defecto de hecho, y esa pregunta a quien está dando instrucciones no le
  // corresponde: lo que el guard contiene es al agente decidiendo solo (caso 126). `said` ya distingue las
  // dos cosas —devuelve nada para un subagente, para un recorrido de Cauce y en CI—, así que la exención no
  // alcanza a nada de eso. Es la misma forma que usa `plan-first` en `files.js`.
  //
  // Sus dos vecinos de gate no llevan esta exención y la diferencia no es quién pidió el commit: `verify` y
  // `dependencies` frenan por algo que está mal —una verificación que falla, un manifiesto sin su lockfile—
  // y callarlos porque hay alguien hablando sería tapar un rojo.
  if (CHAT.said(input)) return
  // El contrato de un cargo y lo que lo mide son gobernanza, igual que un ADR o una regla. La firma de
  // «Aprobación humana» sólo estaba protegida por una frase en un prompt; `SKILL.md` y `references/`
  // son lo que la propuesta cambia, y editarlos directo saltea el ciclo entero; y `evaluations/` es el
  // denominador con que se juzga, así que moverlo ablanda toda medición pasada sin tocar una regla.
  //
  // Quedan afuera las dos clases de evidencia, que registran lo que pasó un día en vez de decidir algo:
  // `learning/reports/` y `evaluations/results/` —esta última se escribe en cada corrida, así que
  // gobernarla pediría un override por evaluación—. Por eso `evaluations/` se nombra por partes.
  const governedPattern = new RegExp(
    String.raw`^(?:(?:template\/)?planning\/(?:rules\/|adr\/|PROTOCOL\.md|` +
      String.raw`METHODOLOGY\.md|FLOW\.md)|automatization\/|engine\/` +
      String.raw`|agents\/[a-z0-9-]+\/(?:system\/)?[a-z0-9-]+\/(?:SKILL\.md|references\/` +
      String.raw`|evaluations\/(?:cases\/|expected-behaviors\.yaml)|learning\/proposals\/))`,
  )
  // El índice nombra cada ruta desde la raíz del repositorio —también lanzado desde `ops/`— y la gobernanza
  // se declara desde la raíz ops: con `ops/` dentro del repo, el layout por defecto de `init`, era
  // `ops/planning/rules/…` contra `^planning/` y el guard no frenaba nada sin decirlo (caso 334). Se juzga
  // la ruta relativa a la raíz ops cuando la hay; la que se aprueba y se nombra sigue siendo la del índice.
  const { dir, staged } = stagedForCommit(command, cwdOf(input), input)
  const ops = opsRoot(input)
  const repo = toplevel(dir)
  const fromOps = (file) => (ops ? path.relative(realPath(ops), path.resolve(repo, file)) : file)
  const governed = staged.filter((file) => governedPattern.test(fromOps(file)))
  if (!governed.length) return
  // La aprobación vale para lo que nombra y para nada más: lo que quede sin cubrir es lo que se
  // reporta. Así una aprobación vieja no autoriza el archivo que se sumó después, que es la diferencia
  // entre una llave por operación y una puerta que quedó abierta.
  const pending = AP.pendingNow(opsRoot(input), governed, input)
  if (!pending.length) return
  block(`El commit toca gobernanza protegida.\n${AP.HOW('OPS_GOVERNANCE_OVERRIDE', pending, input)}`)
}

module.exports = { governance }
