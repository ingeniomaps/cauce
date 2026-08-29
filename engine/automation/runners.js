'use strict'

// El modelo de un adaptador de runner: qué archivos trae, contra qué carpeta se resuelven y cómo se
// rellenan sus marcadores. Vive aparte de los comandos porque cambia por otra razón —cuando se agrega
// un runner o se mueve un marcador— y porque `check`, `doctor`, `install` y `uninstall` lo consumen
// los cuatro igual.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const O = require('../core/ownership')

const RUNNER_NAMES = ['claude', 'codex', 'gemini', 'antigravity']

// Adaptadores y workflows viven en el paquete, no en la instancia: son definiciones que el motor
// consume y que ninguna empresa edita —`RUNNER_NAMES` es cerrado, así que ni siquiera puede agregar
// uno propio—. Los hooks sí se quedan en el proyecto: la configuración del runner los nombra por
// ruta literal y no sabe resolver en cascada.
// Se busca por `runners/` y no por `automatization/`: toda instancia tiene el segundo —ahí viven sus
// hooks— y encontrarlo daría por buena una dependencia sin instalar.
function packagedAutomation(root) {
  const runners = O.packagePath(root, path.join('automatization', 'runners'))
  return runners ? path.dirname(runners) : ''
}

function runnerManifest(root, name) {
  if (!RUNNER_NAMES.includes(name)) {
    throw new Error(`runner debe ser ${RUNNER_NAMES.join(', ')}`)
  }
  const packaged = packagedAutomation(root)
  if (!packaged) {
    throw new Error('no encuentro automatization/: corré "npm install" en la raíz del repo ops')
  }
  const file = path.join(packaged, 'runners', name, 'manifest.json')
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    throw new Error(`${name}: manifest inválido (${error.message})`)
  }
}

// Dónde abre el dev su herramienta, que no siempre es la raíz ops. En modo sidecar el repo ops es
// un hermano de los repos de producto: `<empresa>-ops/` coordina, `<empresa>/` es lo que se abre.
// Instalar dentro del sidecar dejaría al runner sin ver una sola línea de código.
function installRoot(root) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
    if (config.mode === 'sidecar') return path.resolve(root, '..')
  } catch { /* sin configuración legible, instalar donde está */ }
  return root
}

// Cómo se nombra la raíz ops desde ahí: `<empresa>-ops/` en sidecar, vacío cuando coinciden.
function opsPrefix(root) {
  const relative = path.relative(installRoot(root), root)
  return relative ? `${relative.split(path.sep).join('/')}/` : ''
}

function runnerPaths(root, name, runner) {
  const automationRoot = packagedAutomation(root)
  const sourceDir = path.join(automationRoot, 'runners', name)
  const install = installRoot(root)
  const configSource = F.assertWithin(
    sourceDir,
    path.resolve(sourceDir, runner.config.source),
    `${name}: config.source`,
  )
  const configTarget = F.assertWithin(
    install,
    path.resolve(install, runner.config.target),
    `${name}: config.target`,
  )
  return { automationRoot, sourceDir, configSource, configTarget, install }
}

function resolveItem(paths, root, name, item) {
  return {
    automationRoot: paths.automationRoot,
    opsRoot: root,
    source: F.assertWithin(
      paths.automationRoot,
      path.resolve(paths.sourceDir, item.source),
      `${name}: source`,
    ),
    target: F.assertWithin(
      paths.install,
      path.resolve(paths.install, item.target),
      `${name}: target`,
    ),
  }
}

// Todo lo que un adaptador copia —configuración, instrucciones, workflows— nombra rutas relativas a
// la carpeta donde se abre la herramienta. Cuando la raíz ops no es esa carpeta, cada una necesita el
// prefijo. El marcador es explícito en la fuente en vez de adivinarse con reemplazos de texto:
// `{{OPS_DIR}}` significa "acá va la raíz ops, o nada si coinciden".
//
// Un solo render, y `install` escribe exactamente lo que `doctor` compara.
const OPS_DIR = '{{OPS_DIR}}'

// Un fragmento que varios adaptadores comparten, resuelto contra la raíz de `automatization/`. El
// arranque es el mismo trabajo en tres formatos —la sección de un `AGENTS.md`, el cuerpo de un
// `SKILL.md`, el prompt de un `.toml`—, y escrito tres veces hizo lo que hace siempre una copia: dos
// de ellas anunciaban cinco puntos y enumeraban seis, con el sexto doblado dentro del quinto.
//
// El workflow de Claude queda afuera a propósito: es un programa con fases y esquemas, no una prosa
// enmarcada, así que su arranque no es una copia de éste sino otra cosa.
//
// Se resuelve antes que `{{OPS_DIR}}` para que el fragmento también reciba el prefijo, y no anida:
// lo incluido se copia tal cual.
const INCLUDE = /\{\{INCLUDE:([^}]+)\}\}/g

function inline(text, automationRoot) {
  return text.replace(INCLUDE, (_, relative) => {
    const shared = F.assertWithin(
      automationRoot,
      path.resolve(automationRoot, relative.trim()),
      'INCLUDE',
    )
    return fs.readFileSync(shared, 'utf8').trimEnd()
  })
}

// `{{OPS_ROOT}}` es la raíz absoluta. La necesita quien no puede deducirla de dónde lo ejecutaron
// —el puente de Antigravity—, y por eso no reemplaza a `{{OPS_DIR}}`: una ruta absoluta escrita en un
// archivo se rompe si el proyecto se mueve, así que la lleva sólo el que se queda sin alternativa.
const OPS_ROOT = '{{OPS_ROOT}}'

function render(file, prefix, automationRoot, opsRoot = '') {
  return inline(fs.readFileSync(file, 'utf8'), automationRoot)
    .split(OPS_ROOT).join(opsRoot)
    .split(OPS_DIR).join(prefix)
}

function runnerConfig(paths, root) {
  return JSON.parse(render(paths.configSource, opsPrefix(root), paths.automationRoot, root))
}

// Runners que además de los archivos necesitan un registro propio para que el wiring cuente. Copiar
// y quedarse ahí deja un plugin inerte: los archivos están, `doctor` da verde y nada se ejecuta.
function activated(runner) {
  if (!runner.activation) return true
  const result = spawnSync(runner.command, runner.activation.verify, { encoding: 'utf8' })
  if (result.status !== 0) return null
  return `${result.stdout || ''}`.includes(runner.activation.expect)
}

module.exports = {
  activated,
  RUNNER_NAMES,
  OPS_DIR,
  OPS_ROOT,
  packagedAutomation,
  runnerManifest,
  installRoot,
  opsPrefix,
  runnerPaths,
  resolveItem,
  inline,
  render,
  runnerConfig,
}
