'use strict'

// El guard `migrations`: no reescribir una migración que ya viajó y no aplicar un borrado sin que una
// persona lo apruebe. Qué archivo es una migración, qué parte aplica y qué cuenta como destruir lo decide
// `core/migrations`, que `check` también lee.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { filesOf, contentOf, cwdOf, block, configOf, opsRoot } = require('./input')
const AP = require('./approval')
const M = require('../core/migrations')

// Si la migración ya viajó a otra copia, que es lo que el bloqueo de abajo quiere saber y `existsSync`
// no contesta. Devuelve el motivo del bloqueo o cadena vacía.
//
// **`HEAD` y no el índice**: un archivo apenas `git add`eado no viajó a ninguna parte, y `git ls-files`
// lo daría por historial. Y **resolver la raíz es una pregunta aparte** de si el archivo está en `HEAD`:
// las dos fallan con 128 y confundirlas repite el error que este caso arregla —decidir por la respuesta
// equivocada—. Sin raíz resoluble se degrada a la conducta de antes, que bloquea de más, porque cuando
// no se puede saber ése es el lado correcto para equivocarse. Es la degradación que `check` ya declara
// cuando no puede resolver el repositorio de un servicio. Caso 086.
function alreadyShipped(file) {
  if (!fs.existsSync(file)) return ''
  const cwd = path.dirname(file)
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' })
  if (top.status !== 0) {
    return 'existe, y acá no hay repositorio con el que saber si ya viajó a otra copia'
  }
  const rel = path.relative(top.stdout.trim(), file).split(path.sep).join('/')
  return spawnSync('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd }).status === 0
    ? 'ya está en el historial del repositorio'
    : ''
}

const approved = (input, file) => !AP.pending(opsRoot(input), [file], input).length

// El `Edit` trae lo que reemplaza; el archivo en disco dice dónde cae (caso 185). Se lo lee sólo para
// ubicar el fragmento: lo que ya estaba no se juzga.
function editOf(input, file) {
  const fields = input.tool_input || {}
  if (typeof fields.old_string !== 'string' || typeof fields.content === 'string') return {}
  let disk = null
  try { disk = fs.readFileSync(file, 'utf8') } catch { /* sin archivo se juzga el fragmento */ }
  return { disk, old: fields.old_string, all: fields.replace_all === true }
}

function migrations(input) {
  if (process.env.OPS_MIGRATIONS_OVERRIDE === '1') return
  // Las dos condiciones deciden sobre el mismo alcance, y por eso comparten el filtro. El bloqueo por
  // SQL destructivo corría antes de este bucle, o sea sobre el contenido y sin mirar la ruta que ya
  // tenía a mano: frenaba un ADR que citaba la migración o un comentario que advertía que eso no se
  // hace, y encima afirmaba «La migración contiene…» sobre un archivo que no lo era. Un guard que
  // frena donde no corresponde enseña a apagarlo, que es la salida más ancha que hay.
  //
  // El precio de compartir el filtro es que una migración escrita fuera de las carpetas declaradas deja de
  // frenarse. Es deliberado: el otro chequeo ya vivía con esa convención, y dos condiciones de la misma
  // función con dos alcances distintos es lo que hizo falta arreglar acá.
  const root = opsRoot(input)
  const isMigration = M.pattern(root ? configOf(root) : {})
  for (const raw of filesOf(input)) {
    const normalized = raw.replace(/\\/g, '/')
    if (!isMigration.test(normalized)) continue
    if (approved(input, normalized)) continue
    const file = path.resolve(cwdOf(input), raw)
    // El mensaje nombra el archivo y la sentencia: un falso positivo se lee igual que un bloqueo correcto
    // mientras no diga sobre qué está decidiendo. Y cuando la migración se partió, dice que la reversión
    // no se juzgó, para que quien lo lea no busque la sentencia en el bloque equivocado.
    const scope = M.judged(normalized, contentOf(input), editOf(input, file))
    const found = M.destructive(scope.text)
    if (found) {
      const where = scope.label ? ` en el bloque que aplica (la reversión, \`${scope.label}\`, no se juzga)` : ''
      block(`${raw} contiene ${found.kind}${where}: \`${found.what}\`.\n`
        + AP.HOW('OPS_MIGRATIONS_OVERRIDE', [normalized], input))
    }
    // El mensaje nombra el hecho que sostiene el bloqueo y no su interpretación: «historial» era una
    // lectura que `existsSync` no podía dar, y se la daba igual sobre stubs de la misma sesión. Y lleva
    // la salida angosta, que hasta 0.79.0 sólo tenía el bloqueo hermano: éste es el que aparece en el
    // flujo normal de escribir una migración, así que era justo el que no podía quedarse sin decirla.
    const shipped = alreadyShipped(file)
    if (shipped) {
      block(`${raw} ${shipped}. Crea una nueva en vez de reescribirla.\n`
        + AP.HOW('OPS_MIGRATIONS_OVERRIDE', [normalized], input))
    }
  }
}

module.exports = { migrations }
