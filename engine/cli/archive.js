'use strict'

// Los comandos que mueven estado ya decidido: archivar lo que cerró y declarar de una vez qué historia
// llegó con el proyecto. Viven aparte de `planning.js` porque son la otra mitad de una costura: aquéllos
// leen y juzgan sin mutar nada, éstos escriben. Se separaron cuando el archivo cruzó las 500 líneas, y
// lo que decidió el corte fue eso y no el número.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const PC = require('../planning/contracts')
const AD = require('../planning/adoption')
const F = require('../core/files')
const { fail, planningRoot } = require('./io')

// La fecha de hoy, la misma que usan los comandos que leen.
const TODAY = () => new Date().toISOString().slice(0, 10)

// El historial de acciones humanas se acumula en un solo archivo y no por épica: una fila no pertenece
// a ninguna, y esperar el cierre de una épica dejaría sin archivar las de un planning que todavía no
// cerró ninguna —que es justo cuando el archivo se vuelve ilegible—.
// Adoptar es declarar de una vez qué historia llegó con el proyecto. Se genera con lo que hoy no cumple
// y no se vuelve a correr: un baseline que se regenera perdona de nuevo lo que alguien ya se tomó el
// trabajo de arreglar, y uno que crece a mano deja de ser una lista de perdones para ser una amnistía.
// Achicarlo sí es a mano, borrando el renglón que `check` señala.
function adopt(dir) {
  const root = planningRoot(dir)
  const target = path.join(root, AD.BASELINE)
  if (fs.existsSync(target)) {
    // Un baseline que ya trae huella no se toca: regenerarlo es exactamente lo que la huella impide.
    // Uno sin huella lo generó una versión anterior, y sellarlo no es regenerar nada — se calcula sobre
    // lo que ya está—, así que es la única salida de un aviso que si no no tendría ninguna.
    const existing = fs.readFileSync(target, 'utf8')
    if (!AD.sealWarnings(root).some((one) => /sin huella/.test(one))) {
      fail(`${AD.BASELINE} ya existe: se genera una vez. Para retirar un renglón, ponele \`#~\` `
        + 'delante; `check` marca los que ya cumplen.')
    }
    const slugs = AD.declared(existing)
    F.atomicWrite(target, existing.replace(/\n?$/, `\n# huella: ${slugs.length} entradas · `
      + `sha256:${AD.digest(slugs)}\n`))
    return console.log(`✓ ${AD.BASELINE} sellado con ${slugs.length} entrada(s); la lista no cambió`)
  }
  const epics = P.readEpics(root)
  const pending = P.readDone(root).entries.filter((entry) => PC.doneEntryErrors(entry, epics).length)
  if (!pending.length) {
    return console.log('= no hay nada que exentar: todas las entradas de DONE cumplen el contrato')
  }
  const today = TODAY()
  const slugs = pending.map((entry) => entry.slug)
  F.atomicWrite(target, `# Entradas anteriores a la adopción de Cauce (${today}). No se agregan nuevas:\n`
    + '# desde esa fecha rige el contrato completo, y `check` avisa cuando una de éstas pasa a\n'
    + '# cumplirlo para que le pongas `#~` delante y quede retirada.\n'
    + `# huella: ${slugs.length} entradas · sha256:${AD.digest(slugs)}\n`
    + `${slugs.join('\n')}\n`)
  console.log(`✓ ${pending.length} entrada(s) exentas en ${AD.BASELINE}`)
  return console.log('  revisá la lista: lo que sí cumple el contrato no tiene por qué estar ahí')
}

function archiveHumanActions(root) {
  const source = path.join(root, 'HUMAN_ACTIONS.md')
  const rows = P.readHumanActions(root).filter((row) => row.resolved)
  if (!rows.length) return console.log('= no hay filas resueltas')
  const target = path.join(root, 'done', 'human-actions.md')
  const header = '| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |\n|---|---|---|---|'
  const previous = P.read(target).trimEnd()
  const head = previous || `---\nstatus: archived\n---\n\n# Acciones humanas resueltas\n\n${header}`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  F.atomicWrite(target, `${head}\n${rows.map((row) => row.raw).join('\n')}\n`)
  const drop = new Set(rows.map((row) => row.raw))
  const kept = P.read(source).split('\n').filter((line) => !drop.has(line))
  F.atomicWrite(source, `${kept.join('\n').trimEnd()}\n`)
  return console.log(`✓ ${rows.length} fila(s) archivadas`)
}
// Archivar una épica se retiró en 0.71.0. Existía para descongestionar un `DONE.md` que se hinchaba con
// una entrada por tarea; con un archivo por tarea no hay nada que descongestionar, y mover esos archivos
// a una carpeta por épica sería reintroducir el movimiento que la mudanza vino a sacar.
//
// El comando se queda para lo que sí sigue archivándose, y para decirle a quien escriba el número que ya
// no hace falta: sin esto contestaría «La épica debe ser NNN», que manda a corregir la forma de algo que
// no existe.
function archive(dir, rawNum) {
  if (String(rawNum || '') === 'human-actions') return archiveHumanActions(planningRoot(dir))
  return fail('Sólo se archiva `human-actions`. La evidencia de una tarea ya vive en su propio archivo '
    + 'de `done/`, así que archivar una épica dejó de tener sentido.', 2)
}

module.exports = { archive, adopt }
