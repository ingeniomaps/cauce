#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const ST = require('../planning/state')
const I = require('../integrations/registry')
const L = require('../agents/learning')
const A = require('../automation')
const F = require('../core/files')
const O = require('../core/ownership')
const CL = require('../core/changelog')
const M = require('../core/manifest')
const SC = require('../core/scan')
const OB = require('../core/onboarding')
const C = require('../config/validate')
const T = require('../flows/registry')
const AG = require('../agents/catalog')
const EV = require('../agents/evaluations')
const { FLAGS, parse } = require('./args')
const { fail, opsRoot } = require('./io')
const IN = require('./instance')
const PL = require('./planning')
const CAT = require('./catalog')
const W = require('./wiring')
const BOOT = require('./bootstrap')

// Dónde aterriza una instancia cuando nadie eligió: una carpeta propia junto al código.
const DEFAULT_TARGET = 'ops'

// Cuántos servicios se listan en pantalla antes de recortar. El resto sigue en `--json`, que es lo que
// consume el recorrido de arranque: recortar la lista es para leerla, no para acotar lo que se sabe.

// Dónde va la instancia cuando nadie eligió destino. Parada frecuente: el dev ya creó `acme-ops/` y
// corre `init` adentro. Sin esto la instancia caía en `acme-ops/ops/` —una carpeta del toolkit dentro
// de otra— y el proyecto quedaba llamándose «acme-ops». La carpeta que ya nombra al toolkit es la
// instancia; no hay una segunda adentro.
// instancia recibía el de un proveedor apagado que quizá no usaba nunca, y que nadie actualizaba.

function implicitTarget(cwd) {
  const base = path.basename(cwd)
  return base === DEFAULT_TARGET || base.endsWith('-ops') ? '.' : DEFAULT_TARGET
}

// El nombre sale de la carpeta del proyecto, no de la que aloja la instancia: `ops/` y `acme-ops/`
// nombran al toolkit, y quien lee `project` en la configuración espera leer «acme».
function defaultName(root) {
  const base = path.basename(root)
  return base === DEFAULT_TARGET ? path.basename(path.dirname(root)) : base.replace(/-ops$/, '')
}

// El motor no se instala solo: `npm install` baja el paquete que `init` acaba de declarar, y sin él el
// shim, los cargos, los equipos y los adaptadores no se resuelven. Correrlo desde acá es lo que hace que
// una instalación sea un comando y no una lista. En Windows el ejecutable es `npm.cmd`.
function npmInstall(root) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['install'], { cwd: root, stdio: 'inherit' })
  if (result.error) {
    console.error(`  no pude ejecutar npm (${result.error.code || result.error.message}).`)
    return 1
  }
  return result.status === null ? 1 : result.status
}

// Lo que quedó pendiente, y sólo eso: cuando la instalación corrió, `check` ya se ejecutó y repetirlo
// como sugerencia hace dudar de que haya pasado.
function initSteps(enter, result) {
  if (result.installed) return []
  const steps = ['npm install']
  if (result.runner !== BOOT.NO_RUNNER) {
    steps.push(`node tools/ops.js automation install . ${result.runner}`)
  }
  steps.push('node tools/ops.js check planning')
  return steps.map((step, index) => `  siguiente: ${index === 0 ? enter : ''}${step}`)
}

async function init(target, cli) {
  // Sin destino la instancia va a `ops/` y en modo sidecar, en vez de volcarse donde esté parado el
  // dev: un monorepo que recibe `planning/`, `flows/`, `organization/` y `AGENTS.md` en su primer
  // nivel deja de distinguir qué es suyo y qué llegó del toolkit. Es el layout que `automation
  // install` ya asume —el wiring del runner va al padre, donde se abre la herramienta—, así que lo
  // único que faltaba era que fuera lo que pasa cuando no se elige nada.
  const root = path.resolve(target || implicitTarget(process.cwd()))
  const mode = cli.value('--mode', target ? 'embedded' : 'sidecar')
  if (!['embedded', 'sidecar'].includes(mode)) fail('--mode debe ser embedded o sidecar.', 2)
  const name = cli.value('--name', defaultName(root))
  const force = cli.has('--force')
  // `.git` no cuenta como contenido: es lo único que hay en la carpeta que alguien acaba de crear y
  // versionar para la instancia, y el toolkit no escribe nada adentro. Sin esta excepción el camino
  // más natural —`mkdir acme-ops && git init && cauce init`— pedía `--force` para no pisar nada.
  const existing = (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((entry) => entry !== '.git')
  if (existing.length && !force) {
    fail(`El destino no está vacío: ${root}. Usa --force para agregar solo archivos faltantes.`)
  }
  IN.scaffold(root, { name, mode, force })
  const relative = path.relative(process.cwd(), root)
  const enter = relative && relative !== '.' ? `cd ${relative} && ` : ''
  console.log(`\n✓ ${name}: sistema ops creado en ${root} (modo ${mode})`)

  // Preguntar exige una terminal, e instalar baja un paquete y escribe `node_modules`: las dos cosas
  // pasan cuando hay alguien mirando. Una corrida automatizada —CI, un contenedor, estas pruebas—
  // recibe la instancia materializada y decide por bandera, sin descargas ni preguntas implícitas.
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const options = {
    runner: cli.value('--runner'),
    integration: cli.value('--integration'),
    runners: A.RUNNER_NAMES,
    providers: IN.providerNames(),
    interactive,
    install: cli.has('--install') || (interactive && !cli.has('--no-install')),
  }
  let result
  try {
    result = await BOOT.run(root, options, {
      log: console.log,
      npm: npmInstall,
      installRunner: (runner) => W.automation('install', root, runner, NO_FLAGS),
      enableProvider: (provider) => W.enableProvider(root, provider),
    })
  } catch (error) { fail(error.message, 2) }

  if (result.installed) PL.check(path.join(root, 'planning'), NO_FLAGS)

  // Una instancia recién instalada funciona y no sabe nada de este proyecto: `organization/` es el molde
  // y el roadmap está vacío. Llenarlo exige leer el repositorio y decidir qué es cada cosa, que es justo
  // lo que un CLI determinista no puede hacer; lo que sí puede es decir qué falta y qué preguntar.
  //
  // Se imprime siempre, incluso cuando la dependencia no se instaló: lo resuelve el motor que está
  // corriendo `init`, no cuesta nada, y es lo único que le dice a alguien qué hacer con lo que acaba de
  // crear. Dejarlo adentro del camino feliz lo escondía justo de quien más lo necesita.
  console.log('')
  W.onboard(root, NO_FLAGS, result.installed ? result.runner : '')
  for (const step of initSteps(enter, result)) console.log(step)
  if (result.error) fail(`${result.error}: la instancia quedó creada pero todavía no funciona.`)
}

function usage() {
  console.log(`Uso:
  ops init [destino] [--name <nombre>] [--mode embedded|sidecar] [--force]
           [--runner claude|codex|gemini|antigravity] [--integration <proveedor>] [--install|--no-install]
  ops scan [workspace] [--json]
  ops onboard [ops-root] [--json]
  ops check <planning-dir> [--json]
  ops tree <planning-dir> [--no-color] [--json]
  ops context <planning-dir> [--json]
  ops upgrade <ops-root> [--check] [--force]
  ops destroy <ops-root> [--force]
  ops archive <planning-dir> <NNN|human-actions>
  ops integration list <ops-root>
  ops integration enable <ops-root> <provider>
  ops integration disable <ops-root> <provider>
  ops integration check <ops-root> [provider]
  ops integration sync <ops-root> <provider> [--fixture <json>]
  ops integration promote <ops-root> <provider> <remote-key>
  ops integration reset <ops-root> <provider> <remote-key>
  ops integration rebase <ops-root> <provider> <remote-key>
  ops integration reconcile <ops-root> <provider> <remote-key>
  ops integration writeback-plan <ops-root> <provider>
  ops automation list <ops-root>
  ops automation list-hooks <ops-root>
  ops automation check <ops-root>
  ops automation doctor <ops-root> claude|codex|gemini|antigravity
  ops automation install <ops-root> claude|codex|gemini|antigravity
  ops automation uninstall <ops-root> claude|codex|gemini|antigravity
  ops learn <agent|flow> [--flow] [--proposal [--period <AAAA-MM>]] [--applied [--period <AAAA-MM>]]
  ops evaluate <agent|flow> [--flow] [--cases [--json]] [--bench [caso]] [--record [AAAA-MM-DD]]
  ops agents list [ops-root] [--own|--system] [--json]
  ops agents fork <cargo> [ops-root]
  ops flow list
  ops flow check <flow>
  ops flow show <flow>`)
}

// Un `cli` que no tiene banderas, para reusar un comando desde otro: el `--force` de `init` habla del
// molde y no del wiring del runner, así que pasarle el suyo instalaría a la fuerza algo que nadie pidió.
const NO_FLAGS = { has: () => false, value: (_flag, fallback = '') => fallback }

// Si el proveedor terminó su propia configuración. Son dos interruptores y `sync` exige los dos: el

async function run(cli) {
  const [command] = cli.positional
  if (!command || ['help', '--help', '-h'].includes(command)) return usage()
  if (!FLAGS[command]) { usage(); fail(`Comando desconocido: ${command}`, 2) }
  // `--help` valía sólo como primer argumento: `check --help` corría `check` contra el directorio
  // actual en vez de explicarse.
  if (cli.has('--help') || cli.has('-h')) return usage()
  const unknown = cli.unknown(command)
  if (unknown.length) {
    const accepts = FLAGS[command].length ? `Acepta: ${FLAGS[command].join(', ')}.` : 'No acepta banderas.'
    fail(`${command}: bandera desconocida ${unknown.join(', ')}. ${accepts}`, 2)
  }
  const arg = cli.positional
  if (command === 'init') await init(arg[1], cli)
  else if (command === 'scan') W.scan(arg[1], cli)
  else if (command === 'onboard') W.onboard(arg[1], cli)
  else if (command === 'check') PL.check(arg[1], cli)
  else if (command === 'tree') PL.tree(arg[1], cli)
  else if (command === 'context') PL.context(arg[1], cli)
  else if (command === 'upgrade') IN.upgrade(arg[1], cli)
  else if (command === 'destroy') IN.destroy(arg[1], cli)
  else if (command === 'agents') CAT.agents(arg[1], arg[2], arg[3], cli)
  else if (command === 'archive') PL.archive(arg[1], arg[2])
  else if (command === 'integration') {
    await W.integration(arg[1], arg[2], arg[3], arg[4], cli)
  }
  else if (command === 'automation') W.automation(arg[1], arg[2], arg[3], cli)
  else if (command === 'learn') CAT.learn(arg[1], cli)
  else if (command === 'evaluate') CAT.evaluate(arg[1], arg[2], cli)
  else if (command === 'flow') CAT.flow(arg[1], arg[2], cli)
}

run(parse(process.argv.slice(2))).catch((error) => fail(error.message))
