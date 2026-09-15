'use strict'

// Los comandos sobre el catálogo: qué cargos y equipos hay, qué aprenden y cómo se los mide. Todos
// resuelven la raíz ops de la misma forma, que es lo que los junta acá.

const path = require('node:path')
const L = require('../agents/learning')
const LF = require('../agents/learning-files')
const AG = require('../agents/catalog')
const EV = require('../agents/evaluations')
const T = require('../flows/registry')
const O = require('../core/ownership')
// El banco desechable y su borrado comprobado. Se reexportan abajo porque su contrato lo fija la suite
// del banco, que llega por acá desde antes de que el módulo existiera.
const B = require('./bench')
const { fail, opsRoot } = require('./io')

function agentsFork(slug, dir) {
  const root = opsRoot(dir)
  if (!slug) fail('Falta el cargo: ops agents fork <cargo> [ops-root]', 2)
  let result
  const date = new Date().toISOString().slice(0, 10)
  try { result = require('../agents/fork').fork(root, slug, date) } catch (error) { fail(error.message, 2) }
  console.log(`+ ${path.relative(root, result.dir)} (${result.files.length} archivo(s))`)
  if (result.skipped.length) {
    console.log(`  quedan en el catálogo: ${result.skipped.length} artefacto(s) que ganó su versión`)
  }
  console.log(`  copiado de Cauce ${result.version || '(versión desconocida)'}; desde ahora lo mantenés vos`)
  console.log(`  reinstalá tu runner para que ${slug} apunte a tu copia`)
}

// Lista los cargos visibles resolviendo la precedencia; evita que cada consumidor —CI incluido—
// reimplemente el recorrido del catálogo.
function agents(action, dir, extra, cli) {
  if (action === 'fork') return agentsFork(dir, extra)
  if (action !== 'list') fail(`Acción de agents desconocida: ${action || '(vacía)'}`, 2)
  const root = opsRoot(dir)
  // Una empresa mantiene sus cargos, no los nuestros: `learn` sobre uno del catálogo se niega, así que
  // recorrer el catálogo entero para encontrar el suyo es ruido. `--own` hace ejecutable ese recorrido.
  const own = cli.has('--own')
  const system = cli.has('--system')
  const roles = AG.list(root).filter((role) => (own ? !role.system : true) && (system ? role.system : true))
  if (cli.has('--json')) {
    // `path` viene resuelto: quien consuma esto no debería reconstruir dónde ganó la precedencia.
    return console.log(JSON.stringify(roles.map((role) => ({
      slug: role.slug, type: role.type, system: role.system, summary: role.summary,
      // Cada cuánto le toca investigar, derivada de sus fuentes. Va acá y no en el catálogo porque
      // `catalog` no puede depender de `learning` —`learning` ya depende de él—, y va en esta salida
      // porque es la que el cron consume para armar su matriz: así el calendario sale del árbol y no
      // de una lista paralela en el YAML.
      cadence: L.cadence(root, role.slug),
      path: path.relative(root, role.dir).split(path.sep).join('/'),
    }))))
  }
  // Una línea por cargo, alineadas, para elegir a quién asignarle una tarea sin abrir una carpeta.
  const width = roles.reduce((max, role) => Math.max(max, role.slug.length), 0)
  for (const role of roles) {
    const mark = role.system ? '' : ' (propio)'
    console.log(`${role.slug.padEnd(width)}${mark}  ${role.summary || '— sin resumen'}`)
  }
  // La respuesta negativa tiene que ser tan barata como la positiva: si ninguna línea encaja, el
  // camino no es forzar el cargo más parecido, es escribir el propio.
  if (roles.length && !own) {
    console.log('\nSi ninguno encaja, escribí el tuyo en agents/roles/<slug>/ — es tuyo y gana sobre '
      + 'el catálogo.\nSi encaja uno pero lo querés más enfocado en tu empresa: '
      + 'organization/roles/<slug>.md para el contexto, u "ops agents fork <slug>" para adoptarlo.')
  }
}


function learn(agent, cli) {
  try {
    // Sellar es determinista y por eso vive acá y no en el recorrido: marcar una propuesta como
    // aplicada editando frontmatter a mano es justo el paso que un agente hace mal en silencio.
    // Un recorrido aprende de sus corridas y un cargo de su profesión: mismo ciclo, distinto insumo.
    const kind = cli.has('--flow') ? 'flow' : 'agent'
    // El tercer destino: se miró y no cambia nada. Sin esto sólo había aplicarla o dejarla esperando,
    // y lo que se hacía era mergear el PR sin firmar — que deja el documento diciendo «sin aplicar»
    // para siempre, indistinguible de una que espera trabajo.
    if (cli.has('--archived')) {
      const result = L.archive(opsRoot(), agent, cli.value('--period'), kind)
      const relative = path.relative(opsRoot(), result.file)
      // Los dos archivados no son lo mismo y el mensaje lo dice: uno es una decisión —se miró y no
      // cambia nada— y el otro es tirar un andamio que nadie llegó a llenar. Afirmar el primero sobre
      // el segundo le cuenta a quien archiva que hubo una revisión que no hubo.
      const porque = result.blank
        ? 'nadie decidió el cambio y el documento quedó con el molde'
        : 'se miró y no cambia nada'
      return console.log(result.already
        ? `= ${relative} ya estaba archivada`
        : `✓ ${relative} queda archivada: ${porque}`)
    }
    if (cli.has('--applied')) {
      const result = L.seal(opsRoot(), agent, cli.value('--period'), kind)
      const relative = path.relative(opsRoot(), result.file)
      return console.log(result.already
        ? `= ${relative} ya estaba aplicada`
        : `✓ ${relative} queda aplicada: no se vuelve a aplicar`)
    }
    // Un recorrido no tiene informe semanal: su propuesta se compone de los veredictos de sus propias
    // corridas y nunca lee `learning/reports/`. La forma desnuda —la que para un cargo abre el informe
    // de la semana— no tiene entonces qué abrir acá, y `prepareReport` lo decía resolviendo con el
    // `kind` por defecto: «no existe agents/<tipo>/<slug>/SKILL.md», que manda a crear un cargo que no
    // falta. Negarse nombrando el comando que sí corresponde es lo que cierra R13.
    if (kind === 'flow' && !cli.has('--proposal')) {
      fail(`${agent} es un recorrido: aprende de sus corridas, no de informes semanales.\n`
        + `  Abrí la propuesta con "ops learn ${agent} --flow --proposal".`, 2)
    }
    // `--period` es para consolidar a mano un mes que no es el de hoy. El ciclo automático no lo
    // pasa: la propuesta se llama por el mes en que se abre y arrastra lo que todavía no entró.
    const result = cli.has('--proposal')
      ? L.prepareProposal(opsRoot(), agent, new Date(), cli.value('--period'), kind)
      : L.prepareReport(opsRoot(), agent)
    // Sin archivo que nombrar hay dos resultados distintos y decir cuál es el punto: no había material,
    // o lo había y ninguno propuso un cambio. El segundo no es un error ni un mes perdido —el informe
    // es histórico igual— y confundirlo con el primero manda a buscar por qué no se investigó.
    if (!result.file) {
      return console.log(result.quiet
        ? `= ${result.quiet} informe(s) sin recomendación: no hay qué proponer, quedan para el mes que viene`
        : '= sin informes pendientes: no se abre propuesta')
    }
    console.log(`${result.created ? '+' : '='} ${path.relative(opsRoot(), result.file)}`)
    // Un cargo consolida informes de su profesión; un recorrido, las corridas que lo midieron.
    if (typeof result.reports === 'number') {
      console.log(kind === 'flow'
        ? `  ${result.reports} corrida(s) consolidada(s), ${result.findings} hallazgo(s)`
        : `  ${result.reports} informe(s) semanal(es) incluidos`)
    }
    // Lo lee quien automatiza el ciclo para no pedir una firma por un documento que no decide nada, y
    // también quien lo corre a mano: sin esta línea el archivo se ve terminado y no lo está. Se pregunta
    // sobre el documento y no sobre lo que devolvió el motor, porque `prepareProposal` sale por cinco
    // lugares y sólo uno compone: puesto en ése, el dato falta en los otros cuatro.
    if (LF.blankProposal(result.file)) {
      console.log('  sin cambio decidido: falta correr agent-propose antes de que esto se pueda firmar')
    }
  } catch (error) { fail(error.message, 2) }
}

function evaluate(agent, caso, cli) {
  const root = opsRoot()
  // De quién son los casos, resuelto por bandera y no por el slug. Por qué no se deduce, en `subject`.
  const kind = cli.has('--flow') ? 'flow' : 'agent'
  // El banco sólo tiene sentido acá: en una empresa el cargo que se evalúa es suyo —propio o
  // adoptado— y su `planning/` ya es el lugar legítimo donde trabajar.
  if (cli.has('--bench')) {
    if (O.mode(root) !== 'toolkit') {
      // Lo que decide es el modo de la instancia, así que el consejo tiene que ser una salida y no una
      // condición: mandaba a adoptar el cargo, y adoptarlo no habilita nada —quien seguía el consejo
      // forkeaba, repetía el comando y recibía el mismo mensaje diciéndole que forkeara—.
      fail('--bench es del toolkit. En una instancia, el cargo trabaja sobre tu planning/: corré '
        + `"ops evaluate ${agent}" sin la bandera, que valida sus controles, casos y propuestas `
        + 'contra este proyecto.', 2)
    }
    // El caso es el posicional que sigue al cargo: `evaluate <cargo> --bench <caso>`. Sin él se arma
    // un banco suelto, para mirarlo a mano; una corrida real pide uno por caso.
    //
    // Relativa a la raíz, como la de `--record`: esta salida la lee el agente que prepara los bancos,
    // y de ahí la ruta viaja a los informes y a las propuestas que después lee otro cargo. Absoluta
    // nombraba el directorio personal de una máquina, y así quedaron mil cuatrocientas ochenta y cinco
    // citas que dejaron de resolver el día que este repositorio cambió de nombre.
    return console.log(path.relative(root, B.evaluationBench(root, agent, caso, cli.has('--force'), kind)))
  }
  try {
    // Los casos, para que un recorrido los ejecute. Sin `--json` no tiene sentido: es entrada de
    // máquina, no de persona.
    if (cli.has('--cases')) {
      const cases = EV.list(root, agent, kind)
      const forbidden = EV.behaviors(root, agent, kind).forbidden
      // La salida legible no lleva la conducta prohibida: `agent-propose` cuenta sus líneas para saber
      // cuántos casos hay, y una línea de más se contaría como un caso.
      if (!cli.has('--json')) {
        for (const item of cases) console.log(`${item.id}  ${item.expected.length} comportamiento(s)`)
        return
      }
      // La conducta prohibida viaja junto a los casos y no dentro de cada uno: rige para los seis, y
      // repetirla por caso invitaría a que alguien la editara en uno solo.
      return console.log(JSON.stringify({ cases, forbidden }))
    }
    // Dónde escribir el registro de esta corrida. Lo pregunta el recorrido en vez de componer el
    // nombre, que es lo que hacía que la segunda corrida de un día borrara a la primera.
    if (cli.has('--record')) {
      const day = cli.value('--record') || new Date().toISOString().slice(0, 10)
      return console.log(path.relative(root,
        path.join(EV.resultsDir(root, agent, kind), EV.nextResult(root, agent, day, kind))))
    }
    // Un recorrido no tiene contrato de cargo que validar —ni SKILL.md ni fuentes—: lo suyo lo
    // comprueba `flow check`. Acá se mide lo que sí comparte con un cargo: sus casos y su corrida.
    const result = kind === 'flow' ? L.evaluateTeam(root, agent) : L.evaluate(root, agent)
    const runs = EV.validate(root, agent, kind)
    const errors = [...result.errors, ...runs.errors]
    for (const warning of [...result.warnings, ...runs.warnings]) console.warn(`⚠ ${warning}`)
    for (const error of errors) console.error(`✗ ${error}`)
    if (errors.length) fail(`\n${errors.length} error(es)`, 1)
    // Cuándo se midió es un rango cuando el veredicto vigente lo aportó más de una corrida. Por qué se
    // compone en vez de leerse la última, en `composed`.
    const measuredAt = runs.state && runs.state.oldest !== runs.state.newest
      ? `${runs.state.oldest}…${runs.state.newest}`
      : (runs.state ? runs.state.newest : '')
    const lastRun = runs.state
      ? `${runs.state.passed}/${runs.state.total} pasan (${measuredAt})`
      : 'sin correr'
    if (kind === 'flow') {
      return console.log(`✓ ${agent}: ${runs.cases} caso(s) — ${lastRun}, ` +
        `${result.proposals} propuesta(s)${result.pending ? ` (${result.pending} sin aplicar)` : ''}`)
    }
    console.log(
      `✓ ${agent}: ${result.cases} caso(s) — ${lastRun}, ${result.proposals} propuesta(s)` +
        `${result.pending ? ` (${result.pending} sin aplicar)` : ''}, ` +
        'controles estructurales válidos',
    )
  } catch (error) { fail(error.message, 2) }
}

function flow(action, slug, cli) {
  if (action === 'list') {
    const root = opsRoot()
    const slugs = T.list(root)
    // La misma forma que `agents list --json`, porque la consume el mismo cron. `cadence` es fija:
    // un recorrido no tiene profesión que cambie afuera, así que su calendario no se deriva de
    // fuentes —no tiene—; lo que decide si le toca es `pending`, las corridas que dejó sin consolidar.
    // Sin este campo el cron no tenía cómo saber que un recorrido existe, y ninguno aprendió nunca.
    if (cli && cli.has('--json')) {
      return console.log(JSON.stringify(slugs.map((name) => {
        // Sólo un recorrido propio tiene dónde escribir su propuesta, y quién lo es lo decide
        // `pendingRuns`, que resuelve por la misma regla que después va a aplicar `learn`. Comprobar
        // acá si existe `flows/<slug>/flow.json` era reimplementarla, y salía mal en el toolkit, donde
        // el recorrido propio vive en `flows/system/<slug>/`.
        let pending = null
        try { pending = L.pendingRuns(root, name) } catch { pending = null }
        return {
          slug: name, system: pending === null, cadence: 'mensual', pending: pending || 0,
          purpose: (() => {
            try { return T.read(root, name).manifest.purpose || '' } catch { return '' }
          })(),
        }
      })))
    }
    for (const name of slugs) console.log(name)
    return
  }
  if (!['check', 'show'].includes(action)) fail(`Acción de flow desconocida: ${action || '(vacía)'}`, 2)
  try {
    const result = T.validate(opsRoot(), slug)
    for (const error of result.errors) console.error(`✗ ${error}`)
    if (result.errors.length) fail(`${slug}: ${result.errors.length} error(es)`, 1)
    if (action === 'show') {
      // El manifiesto entero, para que un workflow ejecute las etapas sin que un modelo lo parsee.
      if (cli.has('--json')) return console.log(JSON.stringify(result.manifest))
      console.log(`${result.manifest.name} (${slug})`)
      console.log(result.manifest.purpose)
      for (const stage of result.manifest.stages) {
        console.log(`- ${stage.id}: ${stage.agent} → ${stage.produces.join(', ')}`)
      }
    } else {
      console.log(`✓ ${slug}: ${result.stages} etapa(s), ${result.agents} agente(s), contrato válido`)
    }
  } catch (error) { fail(error.message, 2) }
}

module.exports = {
  agents, learn, evaluate, flow, benchSurvived: B.benchSurvived, clearBench: B.clearBench,
}
