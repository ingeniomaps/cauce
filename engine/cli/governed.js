'use strict'

// Qué archivos de un plan va a frenar el guard de gobernanza al commitear, contestado antes de construir (caso 383;
// por qué importa saberlo antes, en `autobuild`). La regla es la del guard, no una copia: `governedOf` es la misma
// función, y la aprobación se descuenta del mismo `planning/.ops-approval`.

const fs = require('node:fs')
const path = require('node:path')
const AP = require('../hooks/approval')
const { governedOf } = require('../hooks/governance')
const { realPath, toplevel } = require('../hooks/input')
const { fail, planningRoot, USAGE } = require('./io')

// El directorio existente más cercano: un archivo que el plan va a crear todavía no está, y su repositorio
// es el de la carpeta que lo va a contener.
function existingDir(target) {
  let current = path.dirname(target)
  while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current)
  return current
}

// Un plan escribe sus rutas desde la raíz o desde el servicio de la tarea, y el esquema no dice cuál. Se juzgan
// las dos lecturas y vale cualquiera que sea gobernanza: elegir una perdía en silencio la otra —la raíz para un
// archivo nuevo del primer nivel del servicio, el servicio para uno nuevo bajo `planning/`— y el guard la frenaba
// igual al commitear. Lo que esto cuesta es alguna aprobación de más, y es la dirección segura (revisión del 383).
// La única que se descarta es la que no puede ser: una ruta que ya nombra al servicio no está escrita desde él, y
// leerla así daría `servicio/servicio/…`, una aprobación pedida para un archivo que nunca va a existir.
function readings(file, service) {
  const fromRoot = path.resolve(file)
  if (!service || fromRoot.startsWith(`${path.resolve(service)}${path.sep}`)) return [fromRoot]
  return [fromRoot, path.resolve(service, file)]
}

// La ruta real, también para un archivo que todavía no existe: el repositorio sale real de git, y relativizar una
// ruta con el enlace puesto contra él da una que el índice no nombra.
function real(target) {
  const dir = existingDir(target)
  return path.join(realPath(dir), path.relative(dir, target))
}

function governed(dir, files, cli) {
  const root = planningRoot(dir)
  if (!files.length) return fail('Faltan los archivos. `ops governed <planning-dir> <archivo>...`', USAGE)
  const ops = path.dirname(root)
  const approved = new Set(AP.read(ops))
  const found = []
  for (const file of files) {
    for (const reading of readings(file, cli.value('--service', ''))) {
      const target = real(reading)
      const repo = toplevel(existingDir(target))
      // Se juzga con la ruta del índice y se nombra como el guard la coteja: entera desde la raíz de su
      // repositorio, que es lo que una persona escribe al aprobar (caso 445).
      if (governedOf(ops, repo, [path.relative(repo, target)]).length && !found.includes(target)) found.push(target)
    }
  }
  // El mismo escape que el guard: con la variable puesta no frena nada, así que acá tampoco hay nada pendiente.
  const pending = process.env.OPS_GOVERNANCE_OVERRIDE === '1' ? [] : found.filter((one) => !approved.has(one))
  if (cli.has('--json')) return console.log(JSON.stringify({ governed: found, pending }))
  if (!pending.length) return console.log('✓ nada de esto pide aprobación de gobernanza')
  console.log(`! piden aprobación de gobernanza: ${pending.join(', ')}`)
  console.log(`  Una persona las aprueba escribiéndolas en ${path.join(root, AP.APPROVAL)}, una por línea.`)
}

module.exports = { governed }
