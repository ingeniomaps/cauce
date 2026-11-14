'use strict'

// Dentro de una sesión de Claude Code, `install` pide abrir otra sólo cuando instaló algo que esa sesión no tiene, y el
// cierre de `init` la pide siempre (casos 502 y 503).

const { installedProject } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../../engine/core/manifest')
const W = require('../../engine/cli/wiring')

const LINE = /! claude: esta sesión se abrió antes de instalar/

test('dentro de una sesión de Claude Code, install pide abrir otra; desde una terminal, no', () => {
  const inside = installedProject('cauce-sesion-abierta-')
  inside.env.CLAUDECODE = '1'
  const install = () => inside.runCli(['automation', 'install', inside.target, 'claude']).stdout
  const first = inside.runCli(['automation', 'install', inside.target, 'claude'])
  assert.equal(first.status, 0, first.stderr)
  assert.ok(first.stdout.includes('! claude: esta sesión se abrió antes de instalar: los subagentes de Cauce no '
    + 'existen en ella, y lo que la persona pidió antes no quedó registrado para los guards. La persona tiene que '
    + `abrir una nueva en ${inside.workspace} y repetir ahí su pedido.`), first.stdout)
  // La línea de los workflows ya no dice que una sesión abierta encuentra lo que se acaba de instalar.
  assert.doesNotMatch(first.stdout, /los encuentra por nombre una sesión abierta/)
  // Con todo al día no hay nada que la sesión no tenga.
  assert.doesNotMatch(install(), LINE)
  // Un workflow recién instalado lo arrancó la misma sesión en la corrida a ciegas del 494: reponerlo no pide otra.
  fs.rmSync(path.join(inside.workspace, '.claude', 'workflows', 'flow.js'))
  assert.doesNotMatch(install(), LINE)
  // Un subagente actualizado ya existía en la sesión.
  const clerk = path.join(inside.workspace, '.claude', 'agents', 'cauce-clerk.md')
  const manifest = path.join(inside.target, '.cauce', 'manifest.json')
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  fs.writeFileSync(clerk, `${fs.readFileSync(clerk, 'utf8')}\nuna versión anterior\n`)
  recorded.runners['claude/.claude/agents/cauce-clerk.md'] = M.digest(clerk)
  fs.writeFileSync(manifest, JSON.stringify(recorded))
  const updated = install()
  assert.match(updated, /actualizado \.claude\/agents\/cauce-clerk\.md/)
  assert.doesNotMatch(updated, LINE)
  // Cada mitad sale sólo cuando esta instalación la causó.
  fs.rmSync(clerk)
  const agents = install()
  assert.ok(agents.includes('antes de instalar: los subagentes de Cauce no existen en ella. La persona tiene que abrir '
    + `una nueva en ${inside.workspace}.`), agents)
  assert.doesNotMatch(agents, /no quedó registrado|repetir/)
  // Una regla de permisos que nombra el guard no es el hook.
  fs.writeFileSync(path.join(inside.workspace, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Bash(ops/automatization/hooks/guard-chat.sh)'] } }))
  const chat = install()
  assert.ok(chat.includes('antes de instalar: lo que la persona pidió antes no quedó registrado'), chat)
  assert.doesNotMatch(chat, /subagentes/)
  // Otro runner no tiene medido cuándo lee lo instalado.
  assert.doesNotMatch(inside.runCli(['automation', 'install', inside.target, 'gemini']).stdout, /! gemini: esta/)

  const outside = installedProject('cauce-sesion-terminal-')
  delete outside.env.CLAUDECODE
  const loose = outside.runCli(['automation', 'install', outside.target, 'claude'])
  assert.equal(loose.status, 0, loose.stderr)
  assert.doesNotMatch(loose.stdout, LINE)
})

// El cierre de `init` es el de `onboard`. Con `--runner ninguno` no hay manifiesto que leer: preguntarle por la
// sesión tiraba `init` al final, con la instancia ya creada, y antes el cierre decía «Abrí ninguno acá».
test('el cierre de init pide una sesión nueva sólo dentro de una, y sin runner no nombra ninguno', () => {
  const { target } = installedProject('cauce-sesion-cierre-')
  const closing = (runner, inside) => {
    const before = process.env.CLAUDECODE
    const lines = []
    const log = console.log
    if (inside) process.env.CLAUDECODE = '1'
    else delete process.env.CLAUDECODE
    console.log = (...args) => lines.push(args.join(' '))
    try { W.onboard(target, new Set(), runner) } finally {
      console.log = log
      if (before === undefined) delete process.env.CLAUDECODE
      else process.env.CLAUDECODE = before
    }
    return lines.join('\n')
  }
  assert.match(closing('claude', true), /→ Abrí una sesión nueva de claude acá y contestale esa pregunta/)
  assert.match(closing('claude', false), /→ Abrí claude acá y contestale esa pregunta/)
  assert.match(closing('gemini', true), /→ Abrí gemini acá/)
  assert.match(closing('ninguno', true), /→ Contestá esa pregunta cuando corras el arranque/)
})
