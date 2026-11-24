'use strict'

// Las escrituras de Done (paso 13 del PROTOCOL) como funciones de texto: reciben lo que hay y devuelven lo que tiene
// que quedar. `ops done` las aplica al disco; separadas, se prueban sin tocar el planning de nadie (caso 537).

const P = require('./parser')

// Lo que juzga quien cierra. El resto de la entrada —acept, fecha, lane— sale del disco y no se pide.
const JUDGED = ['done', 'qa', 'tests', 'decisions', 'commit', 'review', 'critique']
// El PROTOCOL la deja opcional; exigida, la primera sesión real la llenó con evidencia que no era una decisión.
const OPTIONAL = ['decisions']
// El orden de la plantilla de `done/README.md`, que es el que se lee.
const ORDER = ['acept', 'fecha', 'done', 'qa', 'tests', 'decisions', 'commit', 'lane', 'review', 'critique']

// Una línea `campo: valor` por campo; un renglón indentado sigue al campo anterior y `#` es un comentario. Lo que no
// encaja vuelve en `stray`: el archivo lo escribe una persona, y descartarlo callado perdía parte de lo que juzgó.
function parseFields(text) {
  const fields = {}
  const stray = []
  let last = ''
  for (const line of String(text).split('\n')) {
    const field = line.match(/^([A-Za-z]+):[^\S\n]*(.*)$/)
    if (field) {
      last = field[1]
      fields[last] = field[2].trim()
    } else if (last && /^\s+\S/.test(line)) fields[last] = `${fields[last]} ${line.trim()}`.trim()
    else if (/^\s*(?:#|$)/.test(line)) last = ''
    else stray.push(line.trim())
  }
  return { fields, stray }
}

const missingFields = (fields) => JUDGED.filter((name) => !OPTIONAL.includes(name)
  && !String(fields[name] || '').trim())
// Lo que no se juzga: `acept`, `fecha` y `lane` salen del disco, y cualquier otro nombre es un error de tipeo.
const unknownFields = (fields) => Object.keys(fields).filter((name) => !JUDGED.includes(name))

function entryText({ task, fecha, lane, fields }) {
  const title = String(task.description || task.slug).replace(/[.\s]+$/, '')
  const values = { ...fields, acept: task.acceptance, fecha, lane }
  return `- [x] **${task.slug}**${task.epic ? ` (epic: ${task.epic})` : ''} — ${title}\n`
    + ORDER.filter((name) => !OPTIONAL.includes(name) || String(values[name] || '').trim())
      .map((name) => `  ${name}: ${values[name] || ''}\n`).join('')
}

// Lo que se lee de una línea sin sus comentarios HTML, y si termina dentro de uno: un comentario al final de la
// línea de una tarea no la esconde, porque la cola la lee con `withoutComments`.
function visiblePart(line, inComment) {
  let rest = line
  let text = ''
  let comment = inComment
  while (rest) {
    const mark = rest.indexOf(comment ? '-->' : '<!--')
    if (mark === -1) {
      if (!comment) text += rest
      break
    }
    if (!comment) text += rest.slice(0, mark)
    rest = rest.slice(mark + (comment ? 3 : 4))
    comment = !comment
  }
  return { text, comment }
}

// La línea de la tarea y sus notas indentadas, que son de ella y no del hito. Sólo la que se lee como cola: dentro de
// un `## Hito` y fuera de un comentario, donde la encontró `readBacklog` —el molde trae un hito de ejemplo comentado—.
function withoutTask(text, slug) {
  const lines = String(text).split('\n')
  let comment = false
  let milestone = false
  const at = lines.findIndex((line) => {
    const visible = visiblePart(line, comment)
    comment = visible.comment
    if (/^##\s+/.test(visible.text)) milestone = P.MILESTONE_HEADING.test(visible.text.trimEnd())
    return milestone && (P.taskFromLine(visible.text.trimEnd()) || {}).slug === slug
  })
  if (at === -1) return text
  // Un comentario que la línea abre y sigue abajo se conserva: sin su apertura, lo comentado pasaría a leerse.
  if (comment) return [...lines.slice(0, at), lines[at].slice(lines[at].lastIndexOf('<!--')), ...lines.slice(at + 1)]
    .join('\n')
  let end = at + 1
  while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1
  return [...lines.slice(0, at), ...lines.slice(end)].join('\n')
}

// Sólo el frontmatter: un `status:` del cuerpo es prosa. Las mismas cercas que acepta `core/frontmatter.js`, y todas
// las líneas `status:`, porque el parser se queda con la última.
function inFrontmatter(text, edit) {
  const match = String(text).match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  if (!match) return text
  return `---\n${edit(match[1])}\n---\n${text.slice(match[0].length)}`
}

const closedEpic = (text) => inFrontmatter(text, (front) => front.replace(/^status:.*$/gm, 'status: closed'))

// El estado lo dice el contenido y no la presencia del archivo (R28): el WIP se queda, con `status: IDLE`.
const idleWip = (text) => inFrontmatter(text, (front) => (/^status:.*$/m.test(front)
  ? front.replace(/^status:.*$/gm, 'status: IDLE') : `status: IDLE\n${front}`))

// Un archivo de `backlog/` se borra cuando su hito se queda sin tareas, pero no si guarda borradores comentados: esos
// no los lee la cola y son de quien los escribió.
const hasTaskLines = (text) => String(text).split('\n').some((line) => P.taskFromLine(line.replace(/^\s*<!--\s*/, '')))

module.exports = {
  parseFields, missingFields, unknownFields, entryText, withoutTask, closedEpic, idleWip, hasTaskLines,
}
