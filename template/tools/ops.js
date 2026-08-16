#!/usr/bin/env node
'use strict'

// Punto de entrada estable del proyecto: nadie —ni una persona ni un agente— necesita saber de
// dónde sale el motor. Viene de la dependencia npm, que el lockfile versiona.

const path = require('path')

const root = path.join(__dirname, '..')

// El shim sabe dónde vive; quien lo invoca, no. En modo sidecar se lo llama desde la carpeta de la
// compañía —`node <empresa>-ops/tools/ops.js …`— y sin esto cada comando resolvería su raíz contra
// el cwd: `agents list` y `team list` devolvían vacío en vez de fallar.
process.env.OPS_ROOT = process.env.OPS_ROOT || root

const candidates = [
  () => require.resolve('@ingeniomaps/cauce/engine/cli/ops.js', { paths: [root] }),
]

let engine = ''
for (const candidate of candidates) {
  try { engine = candidate(); break } catch { /* siguiente candidato */ }
}

if (!engine) {
  console.error('No se encontró el motor de Cauce.')
  console.error('  Instalá la dependencia con "npm install" desde la raíz del repo ops.')
  process.exit(2)
}

require(engine)
