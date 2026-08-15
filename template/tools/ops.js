#!/usr/bin/env node
'use strict'

// Punto de entrada estable del proyecto: nadie —ni una persona ni un agente— necesita saber de
// dónde sale el motor. Se prefiere la dependencia npm, que se actualiza con el lockfile; si el
// repositorio no usa npm (Go, Python, Rust), se usa la copia de `.ops/engine`.

const path = require('path')

const root = path.join(__dirname, '..')

// El shim sabe dónde vive; quien lo invoca, no. En modo sidecar se lo llama desde la carpeta de la
// compañía —`node <empresa>-ops/tools/ops.js …`— y sin esto cada comando resolvería su raíz contra
// el cwd: `agents list` y `team list` devolvían vacío en vez de fallar.
process.env.OPS_ROOT = process.env.OPS_ROOT || root

const candidates = [
  () => require.resolve('@ingeniomaps/cauce/engine/cli/ops.js', { paths: [root] }),
  () => require.resolve(path.join(root, '.ops', 'engine', 'cli', 'ops.js')),
]

let engine = ''
for (const candidate of candidates) {
  try { engine = candidate(); break } catch { /* siguiente candidato */ }
}

if (!engine) {
  console.error('No se encontró el motor de Cauce.')
  console.error('  Instalá la dependencia con "npm install" o restaurá .ops/engine con "cauce upgrade".')
  process.exit(2)
}

require(engine)
