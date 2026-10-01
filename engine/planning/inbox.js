'use strict'

// Lo que `check` dice sobre el INBOX. Son advertencias y nunca errores: el INBOX es de la persona, y un
// `check` rojo por lo que tiene adentro la frenaría a ella por lo que escribió un recorrido (caso 101).

const fs = require('node:fs')
const path = require('node:path')
const P = require('./parser')

const FILE = 'INBOX.md'
// Un archivo que todavía se recorre de una sentada; el molde vacío ocupa menos de treinta. La instancia
// lo cambia en `inbox.warnLines`.
const WARN_LINES = 300

function warnings(root, done, config) {
  const text = P.read(path.join(root, FILE))
  const found = []
  const declared = config && config.inbox && config.inbox.warnLines
  const limit = Number.isInteger(declared) && declared > 0 ? declared : WARN_LINES
  const count = text.trim() ? text.replace(/\n$/, '').split('\n').length : 0
  if (count > limit) {
    found.push(`${FILE}: ${count} líneas, más que el umbral de ${limit} (inbox.warnLines en ops.config.json); `
      + 'recorrelo y borrá lo que ya se decidió')
  }
  // Una entrada que se llama como una tarea cerrada probablemente se promovió y nadie la borró. Es un
  // indicio y no una prueba —el molde no obliga a que la tarea conserve el nombre del ítem—, y por eso
  // avisa en vez de fallar (caso 106).
  for (const [section, names] of Object.entries(P.inboxHeads(root))) {
    for (const name of names.filter((one) => done.set.has(one))) {
      const own = `inbox/${section}/${slug(name)}.md`
      const where = fs.existsSync(path.join(root, own)) ? own : FILE
      found.push(`${where}: **${name}** se llama como done/${name}.md; si ya se promovió, borrala`)
    }
  }
  return [...found, ...entryWarnings(root)]
}

// `inbox/` lo escriben los recorridos, uno por entrada (caso 216), y un archivo fuera de lugar no se lee:
// una carpeta que no es sección o un nombre que no es el de la entrada no fallan, desaparecen del conteo.
function entryWarnings(root) {
  const found = []
  let folders = []
  try { folders = fs.readdirSync(path.join(root, 'inbox'), { withFileTypes: true }) } catch { return found }
  const sections = Object.keys(P.inboxHeads(root))
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    if (!sections.includes(folder.name)) {
      found.push(`inbox/${folder.name}/: no es una sección (${sections.join(', ')}); lo que tiene no se lee`)
      continue
    }
    for (const file of P.inboxFiles(root, folder.name)) {
      const base = path.basename(file, '.md')
      const names = P.entryNames(P.read(file))
      if (names.length === 1 && slug(names[0]) !== base) {
        found.push(`inbox/${folder.name}/${base}.md: la entrada se llama **${names[0]}**; renombrá el archivo`)
      }
    }
  }
  return found
}

function slug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

module.exports = { warnings }
