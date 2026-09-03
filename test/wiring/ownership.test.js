'use strict'

// Qué del wiring de un runner es del proyecto y sobrevive a que el toolkit vuelva a instalar o a
// diagnosticar. Es la frontera de `core/ownership.js` llevada a la configuración que vive fuera de la
// instancia: `runners.test.js` prueba qué instala cada adaptador; acá se prueba qué **no** se lleva
// puesto al hacerlo.
//
// Las dos pruebas salieron de la misma migración real —un repositorio con meses de planning propio
// adoptando Cauce—, donde lo que el toolkit promete conservar se desregistraba en cada reinstalación.

const { installedProject } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// `AGENTS.md` le dice a cada proyecto que su guard propio va en `automatization/hooks/guard-<x>.sh` y
// que sobrevive a cada actualización. Sobrevivía al `upgrade` y no al `automation install`, que el
// README manda a correr justo después: lo nuestro se reconocía por el directorio, así que cualquier
// `guard-*.sh` de ahí se desregistraba antes de fusionar. El archivo quedaba en disco y el guard
// dejaba de correr, anunciado como «una entrada obsoleta».
test('reinstalar conserva el guard propio del proyecto en la configuración del runner', () => {
  const { workspace, target, runCli } = installedProject('cauce-guard-propio-', 'claude')
  const settings = path.join(workspace, '.claude', 'settings.json')

  const mio = path.join(target, 'automatization', 'hooks', 'guard-mio.sh')
  fs.writeFileSync(mio, '#!/usr/bin/env bash\nexit 0\n')
  fs.chmodSync(mio, 0o755)
  const command = '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-mio.sh'
  const config = JSON.parse(fs.readFileSync(settings, 'utf8'))
  config.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command }] })
  fs.writeFileSync(settings, JSON.stringify(config, null, 2))

  const again = runCli(['automation', 'install', target, 'claude'])
  assert.equal(again.status, 0, again.stderr)
  assert.ok(fs.readFileSync(settings, 'utf8').includes('guard-mio.sh'), 'el guard propio sigue registrado')
  assert.doesNotMatch(again.stdout, /guard-mio/, 'y no se lo anuncia como entrada obsoleta')

  // Lo que sí se retira sigue retirándose: un guard del toolkit que hoy cubre su wrapper de grupo.
  const legacy = JSON.parse(fs.readFileSync(settings, 'utf8'))
  legacy.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [
    { type: 'command', command: '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-destructive.sh' },
  ] })
  fs.writeFileSync(settings, JSON.stringify(legacy, null, 2))
  const tercera = runCli(['automation', 'install', target, 'claude'])
  assert.equal(tercera.status, 0, tercera.stderr)
  assert.match(tercera.stdout, /guard-destructive\.sh/, 'el guard suelto del toolkit se reemplaza')
  assert.ok(fs.readFileSync(settings, 'utf8').includes('guard-mio.sh'), 'y el propio sigue ahí')
})

// La instalación promete conservar las entradas que el proyecto ya tenía, y las conserva. Pero un hook
// propio sumado *dentro* de un grupo que escribió el toolkit dejaba a `doctor` en rojo: la comparación
// era «contiene», que es lo correcto, con el ítem entero serializado como unidad, así que un grupo con
// un hook de más ya no era el mismo objeto y contaba como ausente. El workaround —un segundo grupo con
// el mismo matcher— funcionaba y era indescubrible.
test('doctor no llama divergente a un grupo que suma un hook propio', () => {
  const A = require('../../engine/automation')
  const { workspace, target, runCli } = installedProject('cauce-doctor-hook-propio-', 'claude')
  const settings = path.join(workspace, '.claude', 'settings.json')
  assert.equal(A.doctor(target, 'claude', { warn() {}, error() {} }).errors.length, 0, 'sano de entrada')

  const config = JSON.parse(fs.readFileSync(settings, 'utf8'))
  const bash = config.hooks.PreToolUse.find((group) => group.matcher === 'Bash')
  assert.ok(bash, 'el adaptador escribe un grupo Bash')
  bash.hooks.push({ type: 'command', command: '$CLAUDE_PROJECT_DIR/ops/mio.sh' })
  fs.writeFileSync(settings, JSON.stringify(config, null, 2))

  assert.equal(runCli(['automation', 'doctor', target, 'claude']).status, 0, 'nada falta')
  assert.equal(A.doctor(target, 'claude', { warn() {}, error() {} }).errors.length, 0)

  // Y lo que importa se sigue detectando: que falte una entrada esperada.
  const roto = JSON.parse(fs.readFileSync(settings, 'utf8'))
  roto.hooks.PreToolUse.find((group) => group.matcher === 'Bash').hooks = [
    { type: 'command', command: '$CLAUDE_PROJECT_DIR/ops/mio.sh' },
  ]
  fs.writeFileSync(settings, JSON.stringify(roto, null, 2))
  assert.ok(A.doctor(target, 'claude', { warn() {}, error() {} }).errors.length > 0, 'una ausencia sí es error')
})

// El reconocimiento por nombre deja un borde: un guard que el toolkit entregó en una versión y retiró
// en la siguiente ya no está en `expectedHooks()`, así que la reinstalación no lo desregistraría y el
// runner seguiría llamando a un guard que Cauce ya no mantiene. Por eso lo que instalamos se anota,
// igual que se anota cada archivo entregado: reconocer por el registro no depende de que el nombre
// siga existiendo. Un guard propio nunca estuvo en ese registro y por eso sobrevive.
test('reinstalar retira un guard que el toolkit entregó y ya no trae', () => {
  const { workspace, target, runCli } = installedProject('cauce-guard-retirado-', 'claude')
  const settings = path.join(workspace, '.claude', 'settings.json')
  const manifest = path.join(target, '.cauce', 'manifest.json')

  // Una instancia como la dejó una versión anterior: el guard registrado como entregado por nosotros,
  // y su entrada viva en la configuración del runner. El nombre ya no existe en el motor de hoy.
  const retirado = '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-retirado.sh'
  const propio = '$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-mio.sh'
  const registro = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  registro.runners['claude/config.hooks'] = [...registro.runners['claude/config.hooks'] || [], retirado]
  fs.writeFileSync(manifest, JSON.stringify(registro, null, 2))

  const config = JSON.parse(fs.readFileSync(settings, 'utf8'))
  config.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [
    { type: 'command', command: retirado },
    { type: 'command', command: propio },
  ] })
  fs.writeFileSync(settings, JSON.stringify(config, null, 2))

  const again = runCli(['automation', 'install', target, 'claude'])
  assert.equal(again.status, 0, again.stderr)
  const after = fs.readFileSync(settings, 'utf8')
  assert.equal(after.includes('guard-retirado.sh'), false, 'lo nuestro que ya no traemos se retira')
  assert.ok(after.includes('guard-mio.sh'), 'y el guard propio del proyecto sigue registrado')
  assert.match(again.stdout, /guard-retirado\.sh/, 'y se dice cuál se fue')

  // El registro queda al día: lo entregado ahora es lo de esta versión, sin el que se retiró.
  const anotado = JSON.parse(fs.readFileSync(manifest, 'utf8')).runners['claude/config.hooks']
  assert.ok(Array.isArray(anotado) && anotado.length, 'la instalación anota lo que puso')
  assert.equal(anotado.includes(retirado), false)
  assert.equal(anotado.includes(propio), false, 'lo que no pusimos no entra en el registro')
})
