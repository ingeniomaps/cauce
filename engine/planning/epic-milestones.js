'use strict'

// Los hitos que una épica propone para su promoción, en su sección `## Hitos`: una viñeta por hito —slug,
// `(line: nombre)` optativo y título— y, anidada, una viñeta por historia con su slug. Es la forma en que un
// reparto entre líneas de trabajo llega hasta `backlog/<hito>.md` sin retipearse: `flow` lo propone, una
// persona lo corrige en la épica, y `ops promote` lo escribe. La sección es optativa, y sin ella la épica se
// promueve como un solo hito.
//
// Vive aparte porque `parser.js` está en el umbral de las 500 líneas, y porque es una sola
// cosa —leer y juzgar la misma sección— con un ciclo de vida propio: nace en la épica y muere al promoverla.

const HEADING = /Hitos/i
const MILESTONE = /^[-*]\s+\*\*([^*]+)\*\*\s*(?:\(line:\s*([^)]*)\))?\s+[—-]\s+(.+)$/
// La historia va anidada y por su slug, con o sin negrita y con o sin título detrás del guión: quien la
// escribe a mano la copia de `## Historias`, y lo que sigue al slug no cambia cuál es.
const STORY = /^\s+[-*]\s+(?:\*\*)?([^*\s]+)(?:\*\*)?(?:\s+[—-]\s.*)?\s*$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function read(section) {
  const out = []
  for (const line of section.split('\n')) {
    const head = line.match(MILESTONE)
    if (head) {
      out.push({ slug: head[1].trim(), line: (head[2] || '').trim(), title: head[3].trim(), stories: [] })
      continue
    }
    const story = line.match(STORY)
    if (story && out.length) out[out.length - 1].stories.push(story[1])
  }
  return out
}

// Lo que `check` exige cuando la sección está: cada historia en exactamente un hito, ningún hito vacío ni
// repetido, y una línea que sea un nombre de línea. Sin la sección no se exige nada, porque no hay reparto.
function errors(epic) {
  const milestones = epic.milestones || []
  if (!milestones.length) return []
  // Al usarse y no al cargar: `parser` requiere este módulo, y `lines` requiere `claims`, que requiere `parser`.
  const { NAME } = require('./lines')
  const at = `roadmap/${epic.file}`
  const found = []
  const stories = new Set(epic.stories.map((story) => story.slug))
  const seen = new Set()
  const placed = new Map()
  for (const one of milestones) {
    if (seen.has(one.slug)) found.push(`${at}: hito repetido ${one.slug}`)
    seen.add(one.slug)
    if (!SLUG.test(one.slug)) found.push(`${at}: hito «${one.slug}» no es un slug (minúsculas y guiones)`)
    if (one.line && !NAME.test(one.line)) {
      found.push(`${at}: hito ${one.slug}: line «${one.line}» no es un nombre de línea (minúsculas y guiones)`)
    }
    if (!one.stories.length) found.push(`${at}: hito ${one.slug} sin historias`)
    for (const slug of one.stories) {
      if (!stories.has(slug)) found.push(`${at}: hito ${one.slug} agrupa ${slug}, que no es una historia de esta épica`)
      placed.set(slug, (placed.get(slug) || 0) + 1)
    }
  }
  for (const slug of stories) {
    const times = placed.get(slug) || 0
    if (!times) found.push(`${at}: historia ${slug} sin hito: con ## Hitos cada historia va en uno`)
    else if (times > 1) found.push(`${at}: historia ${slug} está en ${times} hitos`)
  }
  return found
}

module.exports = { HEADING, read, errors }
