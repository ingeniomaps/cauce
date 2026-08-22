'use strict'

// Lo que conecta la instancia con el afuera: qué hay en el workspace, qué falta para arrancar, los
// proveedores externos y el wiring del runner. Ninguno decide sobre planning; los cuatro escriben o leen
// configuración de borde.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const I = require('../integrations/registry')
const A = require('../automation')
const SC = require('../core/scan')
const OB = require('../core/onboarding')
const IN = require('./instance')
const { fail, opsRoot } = require('./io')

const MAX_LISTED = 20


const INTEGRATION = {
  list: {
    run: (root) => {
      for (const [name, entry] of Object.entries(providerRegistry(root).config.providers || {})) {
        const ready = I.providerReady(root, name)
        const mark = !entry.enabled ? '○' : (ready ? '●' : '◐')
        const note = mark === '◐'
          ? `  — falta completar integrations/${name}/config.json y poner enabled: true`
          : ''
        console.log(`${mark} ${name} [${entry.adapter}]${note}`)
      }
    },
  },
  enable: {
    missing: 'Falta <provider>.',
    run: (root, provider) => {
      const source = path.join(IN.PROJECT_ROOT, 'template', 'integrations', provider)
      if (!fs.existsSync(source)) fail(`Cauce no trae un adaptador para ${provider}.`, 2)
      // Habilitar no es inicializar: repone lo que falte y conserva lo que ya esté. Una instancia que
      // trae el andamiaje de una versión anterior —o que ya tiene snapshots— sólo quiere el interruptor.
      providerRegistry(root)
      IN.copyTemplate(source, path.join(root, 'integrations', provider), {}, true)
      switchProvider(root, provider, true)
      console.log(`✓ ${provider}: conectado al proyecto y andamiaje en integrations/${provider}/.`)
      // Sólo se pide lo que falta: reencender un proveedor ya configurado no debería mandar a
      // completar un archivo que la empresa terminó hace meses.
      if (I.providerReady(root, provider)) {
        console.log(`  Su configuración ya estaba completa: "integration sync" puede correr.`)
        return
      }
      console.log(`  Falta lo tuyo: completá integrations/${provider}/config.json y poné enabled: true ahí.`)
      console.log(`  Hasta entonces "integration sync" se niega, que es lo correcto: no hay a dónde apuntar.`)
    },
  },
  // Apagar no desinstala: `integrations/<proveedor>/` puede tener snapshots y borradores de la
  // empresa, y borrarlos para desconectar una integración sería perder trabajo suyo. El andamiaje
  // queda, callado, y volver a encenderlo no pierde nada.
  disable: {
    missing: 'Falta <provider>.',
    run: (root, provider) => {
      switchProvider(root, provider, false)
      console.log(`✓ ${provider}: desconectado del proyecto. "integration sync" deja de correrlo.`)
      if (fs.existsSync(path.join(root, 'integrations', provider))) {
        console.log(`  integrations/${provider}/ queda como está: ahí pueden vivir snapshots y borradores tuyos.`)
      }
    },
  },
  check: {
    run: (root, provider) => {
      const result = I.validate(root, provider || '')
      for (const warning of result.warnings) console.warn(`⚠ ${warning}`)
      for (const error of result.errors) console.error(`✗ ${error}`)
      if (result.errors.length) fail(`${result.errors.length} error(es) de integración`)
      console.log(`✓ integraciones válidas${provider ? `: ${provider}` : ''}`)
    },
  },
  sync: {
    missing: 'sync exige <provider>',
    run: async (root, provider, key, cli) => {
      const result = await I.sync(root, provider, { fixture: cli.value('--fixture') })
      console.log(
        `✓ ${provider}: ${result.total} items · ${result.created} nuevos · ` +
          `${result.refreshed} refrescados · ${result.preserved} curados preservados`,
      )
      // Lo que el remoto dejó de tener sí cambia el staging, y se contaba sin decirlo: un item que
      // desaparece se borra o queda marcado según tenga curación. Se nombra sólo cuando pasó, porque
      // en la corrida normal los dos son cero y anunciarlo cada vez es ruido.
      if (result.removed) console.log(`  − ${result.removed} sin curar se fueron del remoto y se borraron`)
      if (result.missing) {
        console.log(`  ⚠ ${result.missing} con curación ya no están en el remoto: quedan marcados`)
      }
    },
  },
  promote: {
    missing: 'promote exige <provider> <remote-key>',
    needsKey: true,
    run: (root, provider, key) => {
      const result = I.promote(root, provider, key)
      console.log(`✓ ${provider}:${result.key} promovido como ${result.kind}`)
    },
  },
  'writeback-plan': {
    missing: 'writeback-plan exige <provider>',
    run: (root, provider) => console.log(JSON.stringify(I.writebackPlan(root, provider), null, 2)),
  },
}

// Dónde puede mirar una instancia: exactamente las raíces que declara, y nada por encima de ellas. Sale
// de `ops.config.json` en vez de suponerse —el sidecar declara `..`, el embebido `.`— para que acotar las
// raíces acote también el escaneo, y para que nadie termine recorriendo la carpeta de al lado.
// Las tres reconciliaciones son el mismo comando con otra operación: se declaran en el mismo lugar
// para que agregar una cuarta no pida tocar el despachador.
for (const operation of ['reset', 'rebase', 'reconcile']) {
  INTEGRATION[operation] = {
    missing: `${operation} exige <provider> <remote-key>`,
    needsKey: true,
    run: (root, provider, key) => {
      const changed = I.reconcile(root, provider, operation, [key])
      console.log(`✓ ${provider}: ${operation} aplicado a ${changed.join(', ')}`)
    },
  }
}

function scan(target, cli) {
  const root = path.resolve(target || '.')
  const result = { root, services: target ? SC.candidates(root) : SC.inventory(root) }
  if (cli.has('--json')) return console.log(JSON.stringify(result, null, 2))
  // Un monorepo de sesenta paquetes no se lee en pantalla. Se recorta, y se dice cuánto: un corte que no
  // se anuncia hace pasar lo listado por todo lo que hay.
  for (const service of result.services.slice(0, MAX_LISTED)) {
    // El proyecto que vive en la raíz se nombra por su carpeta: `.` a secas no dice de cuál se habla.
    const label = service.path === '.' ? `. (${path.basename(service.root || result.root)})` : service.path
    const expects = service.env ? `\n    espera ${service.env.names.join(', ')} (${service.env.file})` : ''
    console.log(
      `${label} [${(service.runtimes || []).join(', ')}]${SC.comandos(service.commands)}${expects}`,
    )
  }
  if (result.services.length > MAX_LISTED) {
    console.log(`… y ${result.services.length - MAX_LISTED} más, todos en --json`)
  }
  console.log(`${result.services.length} candidato(s). Cuál es el producto y cuál quedó muerto lo ` +
    'decide una persona.')
}

// Sólo lo declarado y de dónde salió: un comando inventado se lee igual que uno real.
function onboard(rootArg, cli, runner = '') {
  const root = path.resolve(rootArg || '.')
  const services = SC.inventory(root)
  const state = OB.guide(root, services)
  if (cli.has('--json')) {
    return console.log(JSON.stringify({ ...state, roots: SC.workspaceRoots(root), servicios: services }, null, 2))
  }
  // La pregunta primero, y el inventario después: de qué trata el proyecto es lo mismo esté vacío,
  // sea un monorepo o sean diez repos, y empezar por lo que se encontró invierte de qué se trata esto.
  if (state.fresh) {
    console.log(`${state.opening}\n`)
    console.log(`Según lo que contestes salen hasta ${state.followUps} preguntas más, con las palabras de`)
    console.log('este proyecto, hasta cubrir lo que haga falta de esto:\n')
    for (const dimension of state.dimensions) console.log(`  · ${dimension.need}`)
    console.log('')
  }
  const listed = services.slice(0, MAX_LISTED).map((service) => service.path).join(', ')
  const more = services.length > MAX_LISTED ? ` y ${services.length - MAX_LISTED} más` : ''
  console.log(services.length
    ? `Mientras tanto, esto es lo que hay: ${listed}${more}`
    : 'Mientras tanto, en el workspace todavía no hay ningún proyecto.')
  if (!state.fresh) {
    const parts = [state.written.organization && 'organization/', state.written.roadmap && 'el roadmap']
      .filter(Boolean).join(' y ')
    console.log(`Esta instancia ya tiene ${parts} escrito: el arranque no la va a pisar.`)
    return
  }
  // Un solo cierre: tres líneas que suenan a final se leen como tres finales, y quien recién instaló
  // termina sin saber cuál era el paso.
  console.log(runner
    ? `\n→ Abrí ${runner} acá y contestale esa pregunta.`
    : '\n→ Contestá esa pregunta cuando corras el arranque.')
  console.log('  Con tus respuestas escribe organization/, el mapa real de AGENTS.md y la primera épica.')
}

// El registro de proveedores, leído igual por todos los que lo tocan. `list` lo parseaba suelto y un
// archivo roto salía como un error de JSON sin contexto.
function providerRegistry(root) {
  const file = path.join(root, 'integrations', 'config.json')
  try { return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) } } catch (error) {
    return fail(`integrations/config.json ilegible: ${error.message}`)
  }
}

function switchProvider(root, provider, enabled) {
  const { file, config } = providerRegistry(root)
  if (!config.providers || !config.providers[provider]) {
    fail(`${provider} no está en integrations/config.json.`)
  }
  config.providers[provider].enabled = enabled
  F.atomicWriteJson(file, config)
}

async function integration(action, rootArg, provider, key, cli) {
  const step = INTEGRATION[action]
  if (!step) fail(`Acción de integración desconocida: ${action || '(vacía)'}`, 2)
  if (step.missing && (!provider || (step.needsKey && !key))) fail(step.missing, 2)
  await step.run(path.resolve(rootArg || '.'), provider, key, cli)
}

function automation(action, rootArg, runnerName, cli) {
  const root = opsRoot(rootArg)
  if (action === 'list-hooks') return A.listHooks()
  if (action === 'list') {
    for (const name of A.RUNNER_NAMES) {
      const runner = A.runnerManifest(root, name)
      const installed = fs.existsSync(path.join(root, runner.config.target))
      const capabilities = Object.entries(runner.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([capability]) => capability)
        .join(', ')
      console.log(`${installed ? '●' : '○'} ${name}${installed ? ' [instalado]' : ''} · ${capabilities}`)
    }
    return
  }
  if (action === 'check') {
    const errors = A.check(root)
    for (const error of errors) console.error(`✗ ${error}`)
    if (errors.length) fail(`${errors.length} error(es) de automatización`)
    console.log(
      `✓ automatización válida: ${A.GUARD_NAMES.length} guards, ${A.RUNNER_NAMES.length} adaptadores`,
    )
    return
  }
  if (action === 'doctor') {
    let result
    try { result = A.doctor(root, runnerName) } catch (error) { fail(error.message, 2) }
    if (result.errors.length) {
      fail(`${runnerName}: ${result.errors.length} error(es), ${result.warnings.length} advertencia(s)`)
    }
    console.log(`✓ ${runnerName}: adaptador operativo (${result.warnings.length} advertencia(s))`)
    return
  }
  if (action === 'uninstall') {
    try { A.uninstall(root, runnerName, console) } catch (error) { fail(error.message, 2) }
    console.log('  la instancia sigue en pie: borrar la carpeta ops es una decisión aparte.')
    return
  }
  if (action === 'install') {
    let runner
    const force = cli.has('--force')
    try { runner = A.install(root, runnerName, console, { force }) } catch (error) { fail(error.message, 2) }
    if (runnerName === 'codex') {
      console.log('  Codex deja los hooks nuevos sin correr hasta que los confíes: abrí una sesión')
      console.log('  y usá /hooks para revisarlos y marcarlos como confiables.')
    }
    if (!runner.capabilities.nativeHooks) {
      console.log(`  ${runnerName} no expone hooks nativos; aplica guards como prechecks.`)
    }
    const result = A.doctor(root, runnerName)
    if (result.errors.length) fail(`${runnerName}: instalación incompleta`)
    console.log(`✓ ${runnerName}: adaptador operativo (${result.warnings.length} advertencia(s))`)
    return
  }
  fail(`Acción de automatización desconocida: ${action || '(vacía)'}`, 2)
}

// `init` enciende un proveedor en la misma corrida en que crea la instancia, y ésta es la operación
// que lo hace: se expone para que la composición no tenga que conocer la tabla entera.
const enableProvider = (root, provider) => INTEGRATION.enable.run(root, provider)

module.exports = { scan, onboard, integration, automation, enableProvider }
