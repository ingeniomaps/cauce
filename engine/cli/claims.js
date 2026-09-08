'use strict'

// Tomar y soltar una tarea. Son los dos únicos comandos del motor que escriben un archivo de
// coordinación, y escriben **el propio**: `BACKLOG.md` no lo toca ninguno, porque la cola es de lo
// aprobado y la escribe una persona.

const fs = require('node:fs')
const path = require('node:path')
const CL = require('../planning/claims')
const ST = require('../planning/state')
const { fail } = require('./io')

const TODAY = () => new Date().toISOString().slice(0, 10)

function claim(dir, slug, cli) {
  const root = path.resolve(dir || '.')
  if (!slug) return fail('Falta el slug. `ops claim <planning-dir> <tarea>`', 2)
  const state = ST.snapshot(root)
  const task = state.milestones.flatMap((milestone) => milestone.tasks).find((one) => one.slug === slug)
  if (!task) return fail(`${slug} no está en BACKLOG: sólo se toma trabajo ya promovido.`, 2)

  const me = CL.owner(root)
  const from = CL.runner()
  const taken = state.claims.find((one) => one.slug === slug)
  if (taken && taken.runner !== from) {
    return fail(`${slug} la tomó ${taken.owner} el ${taken.started}. Si se abandonó, `
      + `borrá ${taken.at} a mano: soltar lo de otro es una decisión, no un comando.`)
  }
  if (taken) return console.log(`= ${slug} ya era tuya desde ${taken.started}`)
  if (!me) {
    return fail('No sé quién sos. Configurá `git config user.email` o exportá CAUCE_OWNER: '
      + 'un reclamo anónimo no dice a quién preguntarle.', 2)
  }
  // Un runner lleva una tarea a la vez (BR-OPS-001), y exigirlo acá hace ruidosa la única forma en que
  // este contrato falla en silencio: dos agentes de la misma máquina compartiendo id porque nadie puso
  // `CAUCE_RUNNER`. Sin esto, el segundo se llevaría la tarea del primero creyéndola suya.
  const ocupado = state.claims.find((one) => one.runner === from && !state.done.set.has(one.slug))
  if (ocupado) {
    return fail(`este runner ya tiene ${ocupado.slug}. Cerrala o soltala primero; y si sos otro agente `
      + 'en la misma máquina, exportá CAUCE_RUNNER con un valor propio.')
  }

  const target = CL.file(root, slug)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const cuerpo = CL.content({ task: slug, owner: me, runner: from, started: TODAY(), service: task.service })
  try {
    // Exclusivo a propósito: entre leer «libre» y escribir hay una ventana, y dos agentes que arrancan
    // con segundos de diferencia la cruzan. `atomicWrite` renombra encima y el último ganaría sin que
    // ninguno se entere; `wx` falla en el segundo, que es lo que hace del archivo una reserva.
    fs.writeFileSync(target, cuerpo, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const ganador = CL.read(root).find((one) => one.slug === slug)
    return fail(`${slug} la tomó ${(ganador && ganador.owner) || 'otro runner'} mientras la pedías.`)
  }
  console.log(`✓ ${slug} tomada por ${me}`)
  // Un reclamo sin empujar no protege de nada: el otro runner lee lo que hay en su copia. Decirlo acá
  // es lo único que separa «tomé la tarea» de «creí que la había tomado».
  if (!cli.has('--json')) console.log(`  commiteá y empujá ${CL.DIR}/${slug}.md para que el equipo lo vea`)
}

function release(dir, slug) {
  const root = path.resolve(dir || '.')
  if (!slug) return fail('Falta el slug. `ops release <planning-dir> <tarea>`', 2)
  const from = CL.runner()
  const taken = CL.read(root).find((one) => one.slug === slug)
  if (!taken) return fail(`${slug} no está tomada por nadie.`, 2)
  if (taken.runner !== from) {
    return fail(`${slug} es de ${taken.owner}. Si se abandonó, borrá ${taken.at} a mano.`)
  }
  fs.rmSync(CL.file(root, slug))
  console.log(`✓ ${slug} soltada; volvió a la cola`)
}

module.exports = { claim, release }
