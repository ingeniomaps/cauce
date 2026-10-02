'use strict'

// Los archivos de la cola: `BACKLOG.md` y uno por hito en `backlog/` (caso 212). Lee la cola entera en el
// orden en que se ofrece, y calcula cómo se parte un `BACKLOG.md` en un archivo por hito —sólo calcula:
// escribir lo hace el comando, y separado se prueba con cualquier texto sin tocar el disco de nadie—.

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

// La cola vive en `BACKLOG.md` y en `backlog/<hito>.md`, un archivo por hito (caso 212). Con un solo
// archivo, dos líneas de trabajo en paralelo editan la misma zona —promover arriba, cerrar en el medio— y
// cada vez que una trae `main` choca; partido por hito, cada línea escribe el suyo, igual que `done/` y
// `roadmap/`, que nunca chocan. `BACKLOG.md` se lee primero: es la cola de siempre, y una instancia que no
// lo partió sigue igual.
//
// El orden entre archivos lo da `order` del frontmatter y no el nombre: con un solo archivo lo decidía la
// posición, y partirlo obliga a declararlo. Sin `order` va al final, por nombre, y `check` lo reclama.
const BACKLOG_DIR = 'backlog'

function backlogFiles(dir) {
  let names = []
  try { names = fs.readdirSync(path.join(dir, BACKLOG_DIR)) } catch { names = [] }
  const split = names.filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => {
    const file = `${BACKLOG_DIR}/${name}`
    const declared = P.frontmatter(P.read(path.join(dir, file)))('order')
    const order = declared === '' ? Infinity : Number(declared)
    return { file, order: Number.isFinite(order) ? order : Infinity }
  }).sort((a, b) => a.order - b.order || a.file.localeCompare(b.file))
  return ['BACKLOG.md', ...split.map((one) => one.file)]
}

function milestonesIn(text, file) {
  const milestones = []
  let current = null
  for (const line of text.split('\n')) {
    const heading = line.match(P.MILESTONE_HEADING)
    if (heading) {
      current = {
        slug: heading[1], title: heading[2].trim(), heading: line.slice(3),
        noSplit: P.noSplitReason(line), tasks: [], file,
      }
      milestones.push(current)
      continue
    }
    if (/^##\s+/.test(line)) current = null
    const task = current ? P.taskFromLine(line) : null
    if (task) current.tasks.push({ ...task, file })
  }
  return milestones
}

// Un hito de `backlog/` puede declarar de qué línea es (caso 239); los de `BACKLOG.md` no son de ninguna.
function readBacklog(dir) {
  return backlogFiles(dir).flatMap((file) => {
    const text = P.read(path.join(dir, file))
    const line = file === 'BACKLOG.md' ? '' : P.frontmatter(text)('line')
    return milestonesIn(P.withoutComments(text), file).map((milestone) => ({ ...milestone, line }))
  })
}

// Lo que no es un hito se queda donde estaba al partir: el encabezado del archivo y cualquier sección `##`
// que no sea `## Hito` son prosa de la instancia, y moverlos sería decidir por ella. El orden de la cola, que
// hasta acá lo daba la posición, pasa a `order` de a diez, para que entre dos hitos se pueda meter otro sin
// renumerar.
const STEP = 10

// Un hito dentro de un comentario no es un hito: el molde trae uno de ejemplo así, y partirlo lo sacaba del
// comentario y dejaba sus tareas de ejemplo en cola. Lo comentado se queda donde está, entero.
function splitBacklog(text) {
  const lines = String(text || '').split('\n')
  const keep = []
  const parts = []
  let current = null
  // Dónde va el comentario abierto: con el hito en el que se abrió, o con la prosa si se abrió afuera.
  let comment = null
  for (const line of lines) {
    if (comment) {
      comment.push(line)
      if (line.includes('-->')) comment = null
      continue
    }
    const opens = line.indexOf('<!--')
    if (opens !== -1 && !line.slice(opens).includes('-->')) {
      comment = current ? current.lines : keep
      comment.push(line)
      continue
    }
    const heading = line.match(P.MILESTONE_HEADING)
    if (heading) {
      current = { slug: heading[1], lines: [line] }
      parts.push(current)
      continue
    }
    if (/^##\s+/.test(line)) current = null
    if (current) current.lines.push(line)
    else keep.push(line)
  }
  const files = parts.map((part, index) => ({
    slug: part.slug,
    file: `backlog/${part.slug}.md`,
    text: `---\norder: ${(index + 1) * STEP}\n---\n\n${part.lines.join('\n').trimEnd()}\n`,
  }))
  return { backlog: `${keep.join('\n').trimEnd()}\n`, files }
}

module.exports = { backlogFiles, readBacklog, splitBacklog }
