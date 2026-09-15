'use strict'

// La puerta de un planning: qué está mal y qué conviene mirar, en un solo comando que falla.
//
// Vive aparte de los que leen el mismo estado porque hace lo contrario que ellos. `tree`, `context` y
// `recurring` contestan una pregunta y salen en cero; éste junta errores y advertencias de dieciocho
// módulos —estructura, contratos, reclamos, integraciones, ownership, onboarding— y decide si la
// instancia puede seguir. De ahí que casi todo lo que el CLI de planning importa entre por acá y no por
// allá: lo que valida necesita conocer a todos, y lo que informa sólo necesita el estado ya compuesto.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const SR = require('../planning/structure')
const SZ = require('../planning/sizing')
const RC = require('../planning/recurring')
const IB = require('../planning/inbox')
const CL = require('../planning/claims')
const R = require('../core/repos')
const AD = require('../planning/adoption')
const AP = require('../hooks/approval')
const I = require('../integrations/registry')
const O = require('../core/ownership')
const TR = require('../core/trails')
const OB = require('../core/onboarding')
const C = require('../config/validate')
const CP = require('../config/paths')
const AG = require('../agents/catalog')
const RL = require('../automation/rules')
const CT = require('./contract')
const { fail, planningRoot, TODAY } = require('./io')

function check(dir, cli) {
  const root = planningRoot(dir)
  const errors = []
  const warnings = []
  // El plan no está: `wip/` es local y gitignoreado, así que un clon nuevo no lo trae y eso no es un
  // error. Ausente se lee como IDLE, que es lo que significa.
  const required = ['BACKLOG.md', 'INBOX.md', 'HUMAN_ACTIONS.md', 'PROTOCOL.md']
  // `DONE.md` se retiró: la evidencia vive en un archivo por tarea. Un `DONE.md` que quede en disco
  // ya no lo lee nadie, y eso no se nota — las épicas dejan de poder cerrar y sus historias figuran
  // sin evidencia, que es lo mismo que se vería si nunca se hubieran hecho.
  // `WIP.md` se retiró por lo mismo que `DONE.md`: era uno solo y lo escribían todos los que corren sobre
  // una instancia sidecar. Uno que quede en disco ya no lo lee nadie, y su plan a medias se pierde sin
  // que nada lo diga.
  if (fs.existsSync(path.join(root, 'WIP.md'))) {
    errors.push('WIP.md ya no se lee: el plan de cada runner vive en `wip/<runner>.md`; movelo y borralo')
  }
  if (fs.existsSync(path.join(root, 'DONE.md'))) {
    errors.push('DONE.md ya no se lee: pasá cada entrada a su propio `done/<slug>.md` y borralo')
  }
  for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`falta ${file}`)

  const configPath = path.join(root, '..', 'ops.config.json')
  let config = null
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8')
      config = JSON.parse(raw)
      if (!raw.includes('{{')) {
        errors.push(...C.validateOpsConfig(config))
        warnings.push(...C.configWarnings(config))
        if (Array.isArray(config.workspaceRoots)) {
          for (const workspace of config.workspaceRoots) {
            if (workspace && workspace.name && workspace.path
              && !fs.existsSync(path.resolve(path.dirname(configPath), workspace.path))) {
              errors.push(`ops.config.json: no existe la raíz ${workspace.name} (${workspace.path})`)
            }
          }
        }
        // Es la única parte de la configuración que le levanta el límite a un guard, y quien la escribió
        // no es quien la lee dentro de seis meses: va como advertencia permanente, igual que un override.
        // Y se muestra resuelta porque resuelta es como la compara el guard — un `~` escrito solo exenta
        // la casa entera, y escrito no se nota.
        for (const exempt of CP.writableOutsideRoots(path.dirname(configPath), config)) {
          warnings.push(`ops.config.json: ${exempt.declared} está exenta del límite `
            + `de raíces (${exempt.path})`)
        }
      }
    } catch (error) {
      errors.push(`ops.config.json: JSON inválido (${error.message})`)
    }
  } else {
    warnings.push(`no existe ${path.relative(root, configPath)}`)
  }

  const epics = P.readEpics(root)
  const milestones = P.readBacklog(root)
  const done = P.readDone(root)
  errors.push(...B.validate(path.join(root, 'business-rules')))
  errors.push(...SR.validateRoadmapStructure(root))
  errors.push(...SR.validateBacklogStructure(root))
  errors.push(...SR.validateRules(root))
  errors.push(...SR.validateAdr(root))
  const backlog = milestones.flatMap((milestone) => milestone.tasks)
  const roles = new Set(AG.list(path.resolve(root, '..')).map((role) => role.slug))
  const wips = P.readWips(root)
  const adopted = AD.read(root)
  errors.push(...SZ.oversizedUnits({ epics, milestones }))
  errors.push(...PC.validateState({
    epics, milestones, done, wips, roles, humanActions: P.readHumanActions(root), adopted: new Set(adopted),
  }))
  warnings.push(...AD.report({ done, epics, adopted }))
  warnings.push(...PC.doneCeremonyWarnings(done, new Set(adopted)))
  // Antes de que el recorrido pague Build para descubrirlo en Verify. Cuesta un regex sobre la cola y
  // corre en los cuatro carriles, incluidos los que saltean Ready (caso 140).
  warnings.push(...PC.unverifiableAcceptance(milestones))
  warnings.push(...R.coverageWarnings(path.resolve(root, '..'), done))
  // Sin `RECURRING.md` no dice una palabra: una instancia que actualiza y no declara trabajo recurrente
  // no tiene por qué enterarse de que el contrato existe. Vencida avisa y no frena — lo que frena vive
  // en `HUMAN_ACTIONS.md`, y un aviso que salta siempre se termina apagando.
  // Un reclamo que nombra una tarea que no existe bloquea la cola sin que nada lo explique, y uno viejo
  // la bloquea para siempre. Lo primero es error; lo segundo avisa, porque abandonar no es un defecto.
  const claims = CL.read(root)
  errors.push(...CL.validate({ claims, milestones, done }))
  // Si la rama de cada tarea tomada se movió, que es lo único barato que distingue una tarea larga de
  // una abandonada. Sin repositorio resoluble el mapa queda vacío y el aviso vuelve a mirar sólo la
  // fecha, que es lo que había antes: degrada, no rompe.
  const activity = new Map()
  for (const claim of claims.filter((one) => !done.set.has(one.slug))) {
    const at = R.lastCommit(R.repoOf(path.join(root, '..'), claim.service), CL.branchOf(claim.slug))
    if (at) activity.set(claim.slug, at)
  }
  warnings.push(...CL.warnings({ claims, done, today: TODAY(), activity }))
  const recurring = RC.read(root)
  errors.push(...RC.validate(recurring))
  warnings.push(...RC.warnings(RC.status({ ...recurring, done, today: TODAY() })))
  warnings.push(...IB.warnings(root, done, config))
  warnings.push(...AD.sealWarnings(root))
  warnings.push(...R.unrecordedHumanActions(path.resolve(root, '..'), P.readHumanActions(root)))
  warnings.push(...AP.warnings(path.resolve(root, '..')))
  warnings.push(...TR.warnings(path.resolve(root, '..')))
  warnings.push(...CT.warnings(path.resolve(root, '..')))

  // Lo que `upgrade` conserva por estar editado deja de recibir mejoras, y eso es una deuda que no
  // avisa sola: la instancia queda con medio molde viejo y todo se ve normal. Sale acá para que se vea
  // en cada corrida y no sólo el día que alguien actualiza.
  const congelados = O.localChanges(path.resolve(root, '..'))
  if (congelados.length) {
    warnings.push(`${congelados.length} archivo(s) del molde congelados por edición local; `
      + '`upgrade` los conserva y no les trae mejoras')
  }

  // Y lo que `upgrade` no retiró porque no pudo demostrar que fuera suyo: queda ahí, sin colgar de
  // ningún mecanismo, hasta que alguien lo mueva o lo borre. Se cuenta por lo mismo que los congelados
  // — un resto que no se ve se vuelve permanente.
  const restos = O.RETIRED_COMPARTIDO.filter((relative) => fs.existsSync(path.join(root, '..', relative)))
  if (restos.length) {
    warnings.push(`${restos.length} ruta(s) retiradas siguen en disco con contenido tuyo `
      + `(${restos.join(', ')}); Cauce ya no las distribuye ni las toca`)
  }

  const integration = I.validate(path.resolve(root, '..'))
  errors.push(...integration.errors)
  warnings.push(...integration.warnings)

  warnings.push(...SR.competingSections(root))
  // Sobrescribir una entrada de system/ es legítimo y esperado; lo que no puede pasar es que
  // ocurra en silencio, porque esa entrada deja de recibir las mejoras del toolkit.
  for (const override of O.overrides(path.resolve(root, '..'))) {
    // Y con qué se queda el proyecto: un override sano redefine lo que reemplaza, y el que deja IDs
    // afuera los retira sin decirlo. Nombrarlos es lo único que separa una decisión de un descuido.
    const retired = override.collection === 'planning/rules'
      ? SR.retiredByOverride(root, override.project)
      : []
    warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} `
      + `(override explícito)${retired.length ? `; deja de regir ${retired.join(', ')}` : ''}`)
  }
  // Y lo que instaló cada runner, contra esas mismas reglas (caso 099).
  warnings.push(...RL.staleLines(path.resolve(root, '..')))
  // Y cuánto pesa lo que ese bloque carga, cuando ya se pasó del umbral. Es la contracara de la línea que
  // `install` imprime al elegir: una instancia suma reglas de a una, cada una razonable, y el total no lo
  // mira nadie hasta que una corrida sale cara.
  warnings.push(...RL.heavyRules(path.resolve(root, '..')))
  // Misma regla para los cargos, que es donde más caro sale: un fork se hace una vez y se olvida.
  const FK = require('../agents/fork')
  for (const entry of FK.drift(path.resolve(root, '..'))) warnings.push(FK.driftLine(entry))

  warnings.push(...OB.missingSections(path.resolve(root, '..')))
  warnings.push(...OB.orphanCredentials(path.resolve(root, '..')))

  if (cli.has('--json')) {
    console.log(JSON.stringify({
      ok: !errors.length,
      epics: epics.length,
      queued: backlog.length,
      done: done.entries.length,
      wips: wips.map((one) => one.task),
      errors,
      warnings,
    }))
    if (errors.length) process.exit(1)
    return
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`)
  for (const error of errors) console.error(`✗ ${error}`)
  if (errors.length) fail(`\n${errors.length} error(es), ${warnings.length} advertencia(s)`)
  console.log(
    `✓ planning válido: ${epics.length} épica(s), ${backlog.length} tarea(s) en cola, ` +
      `${done.entries.length} terminada(s)`,
  )
}

module.exports = { check }
