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

  // No se reserva lo que todavía no se puede empezar: una tarea tomada con su dependencia en vuelo
  // bloquea la cola sin que nadie pueda avanzarla, y el runner que la tomó se queda sin poder tomar otra.
  const falta = task.depends.find((dep) => !state.done.set.has(dep))
  if (falta) return fail(`${slug} depende de ${falta}, que todavía no está en DONE.`)

  const me = CL.owner(root)
  const from = CL.runner()
  if (!me) {
    return fail('No sé quién sos. Configurá `git config user.email` o exportá CAUCE_OWNER: '
      + 'un reclamo anónimo no dice a quién preguntarle.', 2)
  }
  // Un runner lleva una tarea a la vez (BR-OPS-001), y exigirlo acá hace ruidosa la única forma en que
  // este contrato falla en silencio: dos agentes de la misma máquina compartiendo id porque nadie puso
  // `CAUCE_RUNNER`. Sin esto, el segundo se llevaría la tarea del primero creyéndola suya.
  //
  // La que se está pidiendo queda afuera del conteo: volver a pedir la propia es reintentar, no llevar dos.
  const ocupado = state.claims
    .find((one) => one.runner === from && one.slug !== slug && !state.done.set.has(one.slug))
  if (ocupado) {
    return fail(`este runner ya tiene ${ocupado.slug}. Cerrala o soltala primero; y si sos otro agente `
      + 'en la misma máquina, exportá CAUCE_RUNNER con un valor propio.')
  }

  const target = CL.file(root, slug)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const cuerpo = CL.content({ task: slug, owner: me, runner: from, started: TODAY(), service: task.service })
  try {
    // Reservar **es** crear el archivo, así que el único juez de quién la tiene es el archivo. `wx` falla
    // si ya está, y de ahí sale la respuesta entera: propia, ajena o perdida en la carrera.
    //
    // Sin `wx` no habría reserva: `atomicWrite` renombra encima, y dos agentes que arrancan con segundos
    // de diferencia ganarían los dos sin que ninguno se entere. Y una comprobación previa tampoco
    // alcanzaría —entre mirar y escribir queda la misma ventana—, así que sería un segundo juez que
    // adelanta un veredicto que este bloque tiene que volver a dar igual.
    fs.writeFileSync(target, cuerpo, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const dueño = CL.read(root).find((one) => one.slug === slug)
    // Existía al crear y ya no está: alguien la soltó entre las dos operaciones. Es una ventana de
    // microsegundos y aun así tiene respuesta, porque la alternativa es reventar con un TypeError.
    if (!dueño) return fail(`${slug} cambió de manos mientras la pedías; volvé a intentarlo.`)
    if (dueño.runner === from) return console.log(`= ${slug} ya era tuya desde ${dueño.started}`)
    // Mismo dueño y otro runner son dos situaciones que se ven idénticas desde acá —vos retomando la
    // sesión de ayer, o un segundo agente tuyo— y ninguna se puede distinguir mirando el archivo.
    // Retomarla sola le sacaría la tarea al otro agente; crear un runner nuevo dejaría dos trabajando lo
    // mismo. Las dos rompen trabajo, así que decide una persona y acá sólo se dice cuál es cuál.
    if (dueño.owner === me) {
      return fail(`${slug} la tenés vos, tomada el ${dueño.started} desde otro runner (${dueño.runner}). `
        + `Si estás retomando esa sesión, exportá CAUCE_RUNNER=${dueño.runner} y seguí donde la dejaste; `
        + 'si sos otro agente tuyo corriendo a la vez, tomá otra tarea.')
    }
    return fail(`${slug} la tomó ${dueño.owner} el ${dueño.started}. Si se abandonó, borrá `
      + `${CL.DIR}/${slug}.md a mano: soltar lo de otro es una decisión, no un comando.`)
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
