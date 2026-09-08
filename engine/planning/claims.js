'use strict'

// Quién tomó qué. Un archivo por tarea reclamada: crearlo es reclamar, borrarlo es soltar.
//
// El nombre del archivo es el slug de la tarea, y de ahí sale la única propiedad que importa: dos
// personas en tareas distintas no tocan el mismo archivo nunca, y dos que reclaman la misma chocan en
// git — que es exactamente donde el choque significa algo y donde conviene verlo.
//
// El plan de la ejecución no vive acá. Eso es `WIP.md`, que es local y cambia en cada paso; acá va lo
// poco que el resto del equipo necesita saber, que cambia dos veces por tarea. Son dos responsabilidades
// distintas y por eso son dos archivos: el reclamo evita que dos runners tomen la misma tarea, y el WIP
// evita que un runner lleve dos.

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const P = require('./parser')

const DIR = 'claims'
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Tres días **sin ninguna señal de avance**, que no es lo mismo que tres días desde que se tomó. El
// tiempo transcurrido solo no distingue una tarea larga de una abandonada, y equivocarse en esa
// distinción es caro en los dos sentidos: apurar a alguien que está trabajando, o dejar bloqueada para
// siempre la tarea de quien se fue.
//
// Lo que sí distingue es si la rama de la tarea se movió. Con esa señal, tres días sin un solo commit no
// es una tarea larga: es una que se detuvo, y el aviso manda a mirar y no a soltar.
const STALE_DAYS = 3

// Quién soy. Sale de la identidad de git porque ya está configurada, es por máquina y es la que va a
// terminar en el commit igual: pedir una segunda identidad sólo para esto sería un dato más que puede
// quedar desincronizado. `CAUCE_OWNER` la pisa donde no la haya —un contenedor de CI, por ejemplo—.
//
// Sin identidad no se puede reclamar, y eso es correcto: un reclamo anónimo no le dice a nadie a quién
// preguntarle.
function owner(root) {
  if (process.env.CAUCE_OWNER) return process.env.CAUCE_OWNER.trim()
  const result = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? (result.stdout || '').trim() : ''
}

// Qué runner soy, que no es lo mismo que quién soy. En una máquina con varios agentes la identidad de
// git es la misma para todos —`git config user.email` no distingue una sesión de otra—, así que si lo
// que decide «esto es mío» fuera el owner, el segundo agente tomaría por propia la tarea del primero y
// los dos construirían lo mismo. La unidad es el árbol de trabajo: uno por agente.
//
// `CAUCE_RUNNER` es la vía explícita y la que deja `ops worktree`. Sin ella se deduce del árbol donde
// corre el proceso, que acierta cuando el agente invoca desde el suyo y falla —devolviendo el mismo id
// para todos— cuando invoca desde una instancia sidecar compartida. Esa falla no queda en silencio:
// `claim` se niega a darle una segunda tarea a un runner que ya tiene una, y ese es el mensaje que
// manda a poner la variable.
function runner() {
  if (process.env.CAUCE_RUNNER) return process.env.CAUCE_RUNNER.trim()
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  return result.status === 0 ? (result.stdout || '').trim() : process.cwd()
}

// La rama donde vive el trabajo de una tarea. La escriben `worktree` al crearla y `check` al buscar si
// se movió, y son la misma o el segundo mira una rama que nadie usa.
const branchOf = (slug) => `task/${slug}`

function file(root, slug) {
  return path.join(root, DIR, `${slug}.md`)
}

function read(root) {
  let names = []
  try { names = fs.readdirSync(path.join(root, DIR)) } catch { return [] }
  return names.filter((name) => name.endsWith('.md') && name !== 'README.md').sort()
    .map((name) => {
      const field = P.frontmatter(P.read(path.join(root, DIR, name)))
      return {
        slug: name.replace(/\.md$/, ''),
        task: field('task'),
        owner: field('owner'),
        runner: field('runner'),
        started: field('started'),
        service: field('service'),
        at: `${DIR}/${name}`,
      }
    })
}

// El cuerpo de un reclamo. Es corto a propósito: todo lo que crezca acá vuelve a viajar por git en cada
// cambio, que es de lo que este archivo vino a separarse.
function content({ task, owner, runner: from, started, service }) {
  return `---\ntask: ${task}\nowner: ${owner}\nrunner: ${from}\nstarted: ${started}\n`
    + `service: ${service || ''}\n---\n\nTomada. El plan vive en el \`WIP.md\` de quien la tomó.\n`
}

function validate({ claims, milestones, done }) {
  const errors = []
  const queued = new Set(milestones.flatMap((milestone) => milestone.tasks).map((task) => task.slug))
  for (const claim of claims) {
    const at = `${claim.at}`
    // El nombre del archivo es lo que hace única la reserva, así que un frontmatter que dice otra cosa
    // reclama una tarea y bloquea otra. Es la única forma en que este contrato puede mentir.
    if (claim.task !== claim.slug) {
      errors.push(`${at}: declara task "${claim.task}" y el archivo reserva ${claim.slug}`)
    }
    if (!claim.owner) errors.push(`${at}: falta owner`)
    if (!claim.runner) errors.push(`${at}: falta runner`)
    if (!DATE.test(claim.started)) errors.push(`${at}: started debe ser AAAA-MM-DD`)
    if (!queued.has(claim.slug) && !done.set.has(claim.slug)) {
      errors.push(`${at}: ${claim.slug} no existe en BACKLOG ni DONE`)
    }
  }
  return errors
}

const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`))
  / 86400000)

// `activity` mapea el slug de una tarea a la fecha del último commit de su rama. Llega de afuera porque
// resolverlo exige git y la configuración del proyecto, y este módulo se prueba sin ninguna de las dos.
// Vacío es un estado legítimo —una tarea recién tomada no tiene rama— y entonces la única señal que
// queda es cuándo se tomó.
function warnings({ claims, done, today, activity = new Map() }) {
  const lines = []
  for (const claim of claims) {
    if (done.set.has(claim.slug)) {
      lines.push(`${claim.at}: ${claim.slug} ya está en DONE; soltala con \`ops release\``)
      continue
    }
    if (!DATE.test(claim.started)) continue
    const commit = activity.get(claim.slug) || ''
    const ultima = commit && commit > claim.started ? commit : claim.started
    const quieta = days(ultima, today)
    if (quieta > STALE_DAYS) {
      const senal = commit
        ? `último commit hace ${days(commit, today)} días`
        : 'la rama de la tarea no tiene commits'
      lines.push(`${claim.at}: ${claim.slug} sin avanzar hace ${quieta} días `
        + `(${claim.owner}, tomada hace ${days(claim.started, today)}; ${senal}); mirá si sigue viva`)
    }
  }
  // Dos tareas del mismo servicio pueden tocar los mismos archivos, y eso no se puede saber antes de
  // hacerlas. Lo único que se puede es decirlo a tiempo de que hablen, así que avisa y nunca frena:
  // frenar serializaría a un equipo entero sobre un servicio, que es peor que la colisión que evita.
  const byService = new Map()
  for (const claim of claims.filter((one) => one.service && !done.set.has(one.slug))) {
    byService.set(claim.service, [...(byService.get(claim.service) || []), claim])
  }
  for (const [service, group] of byService) {
    if (group.length < 2) continue
    lines.push(`${group.length} tareas tomadas sobre ${service} `
      + `(${group.map((one) => `${one.slug} · ${one.owner}`).join('; ')}); pueden tocar los mismos archivos`)
  }
  return lines
}

module.exports = { DIR, STALE_DAYS, owner, runner, branchOf, file, read, content, validate, warnings }
