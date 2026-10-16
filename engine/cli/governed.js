'use strict'

// Qué archivos de un plan va a frenar el guard de gobernanza al commitear, contestado antes de construir. El
// commit de un subagente no puede esperar la aprobación de una persona, así que enterarse ahí tira Build,
// Review, Verify y QA ya pagados (caso 383). La regla es la del guard, no una copia: `governedOf` es la misma
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

// Un plan escribe sus rutas desde la raíz o desde el servicio de la tarea, y el esquema no dice cuál. La que ya
// nombra al servicio está escrita desde la raíz; cualquier otra, desde el servicio. Gana la que ya existe y, si
// ninguna existe todavía, esa lectura: preguntar por la carpeta daba la raíz para un archivo nuevo del primer
// nivel del servicio, porque esa carpeta siempre existe (revisión del caso 383).
function resolve(file, service) {
  const fromRoot = path.resolve(file)
  if (!service) return fromRoot
  const fromService = path.resolve(service, file)
  const named = fromRoot.startsWith(`${path.resolve(service)}${path.sep}`)
  const candidates = named ? [fromRoot, fromService] : [fromService, fromRoot]
  return candidates.find((one) => fs.existsSync(one)) || candidates[0]
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
    const target = real(resolve(file, cli.value('--service', '')))
    const repo = toplevel(existingDir(target))
    // Se nombra como la nombra el índice, que es lo que el guard frena y lo que una persona escribe al aprobar.
    const indexed = path.relative(repo, target)
    if (governedOf(ops, repo, [indexed]).length && !found.includes(indexed)) found.push(indexed)
  }
  // El mismo escape que el guard: con la variable puesta no frena nada, así que acá tampoco hay nada pendiente.
  const pending = process.env.OPS_GOVERNANCE_OVERRIDE === '1' ? [] : found.filter((one) => !approved.has(one))
  if (cli.has('--json')) return console.log(JSON.stringify({ governed: found, pending }))
  if (!pending.length) return console.log('✓ nada de esto pide aprobación de gobernanza')
  console.log(`! piden aprobación de gobernanza: ${pending.join(', ')}`)
  console.log(`  Una persona las aprueba escribiéndolas en ${path.join(root, AP.APPROVAL)}, una por línea.`)
}

module.exports = { governed }
