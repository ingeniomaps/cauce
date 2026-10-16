'use strict'

// Qué archivos de un plan va a frenar el guard de gobernanza al commitear, contestado antes de construir. El
// commit de un subagente no puede esperar la aprobación de una persona, así que enterarse ahí tira Build,
// Review, Verify y QA ya pagados (caso 383). La regla es la del guard, no una copia: `governedOf` es la misma
// función, y la aprobación se descuenta del mismo `planning/.ops-approval`.

const fs = require('node:fs')
const path = require('node:path')
const AP = require('../hooks/approval')
const { governedOf } = require('../hooks/governance')
const { toplevel } = require('../hooks/input')
const { fail, planningRoot, USAGE } = require('./io')

// El directorio existente más cercano: un archivo que el plan va a crear todavía no está, y su repositorio
// es el de la carpeta que lo va a contener.
function existingDir(target) {
  let current = path.dirname(target)
  while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current)
  return current
}

// Un plan escribe sus rutas desde la raíz o desde el servicio de la tarea, y el esquema no dice cuál. Gana la
// que ya existe; si ninguna existe todavía, la que tiene su carpeta.
function resolve(file, service) {
  const candidates = [path.resolve(file), ...(service ? [path.resolve(service, file)] : [])]
  return candidates.find((one) => fs.existsSync(one))
    || candidates.find((one) => fs.existsSync(path.dirname(one)))
    || candidates[0]
}

function governed(dir, files, cli) {
  const root = planningRoot(dir)
  if (!files.length) return fail('Faltan los archivos. `ops governed <planning-dir> <archivo>...`', USAGE)
  const ops = path.dirname(root)
  const approved = new Set(AP.read(ops))
  const found = []
  for (const file of files) {
    const target = resolve(file, cli.value('--service', ''))
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
