#!/usr/bin/env node
'use strict'

// Punto de entrada estable del proyecto: nadie —ni una persona ni un agente— necesita saber de
// dónde sale el motor. Viene de la dependencia npm, que el lockfile versiona.
//
// Nada de `require`, `__dirname` ni `import`: el shim se instala dentro del proyecto y hereda el
// `type` de su `package.json`, así que el mismo archivo se carga como CommonJS en un repo y como
// ESM en el de al lado. `import()` dinámico y `process.argv[1]` son las dos únicas formas que
// existen bajo los dos cargadores; cualquier otra revienta en la mitad de los proyectos —`require
// is not defined` en uno, `Cannot use import statement` en el otro— y se lleva puesta toda fase de
// `autobuild`, que invoca este archivo para leer planning.

const self = process.argv[1].replace(/\\/g, '/')
const root = self.slice(0, self.lastIndexOf('/', self.lastIndexOf('/') - 1)) || '.'

// El shim sabe dónde vive; quien lo invoca, no. En modo sidecar se lo llama desde la carpeta de la
// compañía —`node <empresa>-ops/tools/ops.js …`— y sin esto cada comando resolvería su raíz contra
// el cwd: `agents list` y `team list` devolvían vacío en vez de fallar.
process.env.OPS_ROOT = process.env.OPS_ROOT || root

// El especificador se resuelve contra este archivo, así que sube a `<raíz>/node_modules` igual que
// lo hacía `require.resolve` con `paths`.
import('@ingeniomaps/cauce/engine/cli/ops.js').catch((error) => {
  if (!error || error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  console.error('No se encontró el motor de Cauce.')
  console.error('  Instalá la dependencia con "npm install" desde la raíz del repo ops.')
  process.exit(2)
})
