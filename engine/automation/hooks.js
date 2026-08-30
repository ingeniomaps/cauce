'use strict'

// El wiring de guards: cuáles existen, cuáles corren agrupados y cuáles quedaron registrados de a uno
// en una instancia vieja. Su reloj es el registro que los ejecuta —un guard nuevo entra por ahí—, no
// el de los comandos que los instalan.

const fs = require('node:fs')
const path = require('node:path')
const H = require('../hooks/run')
const M = require('../core/manifest')
const { packagedAutomation } = require('./runners')

// Los guards que el motor implementa, tomados del registro que los ejecuta. Sale de ahí y no de un
// número escrito a mano: `automation check` anunciaba «11 guards» cuando hacía rato que eran doce, y
// un conteo que envejece solo es peor que ninguno —dice que revisó menos de lo que revisó—.
const GUARD_NAMES = Object.keys(H.guards)

// Un `.sh` por grupo de más de un guard: es el que registra el runner para correrlos en un proceso.
function groupWrappers() {
  return Object.entries(H.hookGroups)
    .filter(([, names]) => names.length > 1)
    .map(([group]) => [group, `guard-${group.replace('pre-', '')}.sh`])
}

// Los scripts que la instancia debe tener, derivados del registro que los ejecuta en vez de copiados
// a mano: la copia envejecía sin avisar, porque un guard nuevo del motor no entraba en la cuenta.
//
// Se comprueba en una sola dirección a propósito. Un `.sh` que no está acá no sobra: así es como una
// empresa agrega el suyo —`guard-acme.sh` al lado de los nuestros—, que es lo que `upgrade` le dice
// que haga y lo único que sobrevive a cada actualización.
function expectedHooks() {
  return [
    'run-hook.sh',
    ...groupWrappers().map(([, wrapper]) => wrapper),
    ...GUARD_NAMES.map((name) => `guard-${name}.sh`),
  ]
}

// Guards que hoy viven dentro de un grupo, con el wrapper que los reemplaza.
function supersededGuards() {
  const entries = []
  for (const [group, wrapper] of groupWrappers()) {
    for (const name of H.hookGroups[group]) entries.push({ file: `guard-${name}.sh`, wrapper })
  }
  return entries
}

// Wiring heredado: guards que ahora corren agrupados pero siguen registrados uno por uno.
// Conviven sin romper nada, a costa de ejecutar el guard dos veces por herramienta.
function legacyGuardWiring(config) {
  const text = JSON.stringify(config)
  const superseded = []
  for (const [group, names] of Object.entries(H.hookGroups)) {
    if (names.length < 2 || !text.includes(`guard-${group.replace('pre-', '')}.sh`)) continue
    superseded.push(...names.filter((guard) => text.includes(`guard-${guard}.sh`)))
  }
  return superseded
}

// Guards de la instancia que ya no coinciden con los del paquete. Existir y ser ejecutable no
// alcanza: un guard viejo no falla, deja de proteger sin decir nada. La instancia declaraba una
// versión y nadie comprobaba que su runtime fuera realmente esa.
function staleHooks(root) {
  const packaged = packagedAutomation(root)
  if (!packaged) return []
  const shipped = path.join(packaged, 'hooks')
  const mine = path.join(root, 'automatization', 'hooks')
  const recorded = M.read(root)
  const stale = []
  let names = []
  try { names = fs.readdirSync(shipped) } catch { return [] }
  for (const file of names) {
    const local = path.join(mine, file)
    // Los que faltan ya los reporta el chequeo de arriba; acá sólo interesa el que quedó atrás.
    if (!fs.existsSync(local)) continue
    const current = M.digest(local)
    if (current === M.digest(path.join(shipped, file))) continue
    const delivered = recorded[`automatization/hooks/${file}`]
    stale.push({ file, edited: Boolean(delivered) && delivered !== current })
  }
  return stale
}

function listHooks(output = console) {
  const nameWidth = Math.max(...H.hookMetadata.map((hook) => hook.name.length))
  const eventWidth = Math.max(...H.hookMetadata.map((hook) => hook.event.length))
  for (const hook of H.hookMetadata) {
    output.log(`${hook.name.padEnd(nameWidth)}  ${hook.event.padEnd(eventWidth)}  ${hook.purpose}`)
  }
}

module.exports = {
  GUARD_NAMES, groupWrappers, expectedHooks, supersededGuards,
  legacyGuardWiring, staleHooks, listHooks,
}
