'use strict'

// La pasada de comentarios de R11, con mecanismo (caso 233). Antes de un commit lista los comentarios que
// agrega y lo frena una vez; entra cuando se repite con el token de esa lista, que cambia si cambia cualquier
// comentario, así que la pasada no se puede declarar sobre otro diff. El token prueba que se miró la lista, no
// que se pensó cada comentario: eso lo sigue sosteniendo quien commitea.
//
// Apagado salvo que `ops.config.json` declare `comments`. Medido sobre 113 commits de una instancia que lo
// usa, frenó cada uno una vez y en 12 cambió un comentario: es una vuelta por commit, y esa cuenta la hace
// cada empresa. `language` e `inlineMax` son los dos chequeos duros que esa misma medición vio dispararse;
// cada uno corre sólo si se declara.
//
// Lo que no ve: los docstrings de Python y los comentarios de los lenguajes que no están en `STYLES`.

const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { commandOf, cwdOf, block, isCommit, stagedForCommit, opsRoot, configOf } = require('./input')
const AP = require('./approval')

const STYLES = [
  { ext: /\.(?:[cm]?js|jsx|tsx?|go|java|kt|rs|swift|c|cc|cpp|h|hpp|cs|scss)$/, line: '//', block: true },
  { ext: /(?:\.(?:py|sh|bash|rb|ya?ml|toml)|(?:^|\/)(?:Dockerfile[^/]*|Makefile))$/, line: '#', block: false },
]
const styleOf = (file) => STYLES.find((style) => style.ext.test(file))
const VARIABLE = 'CAUCE_COMMENTS_REVIEWED'

// El comentario después de código en la misma línea, cuando su marca está fuera de toda comilla.
function trailing(raw, marker) {
  let quote = null
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (raw.startsWith(marker, i) && /\s/.test(raw[i - 1] || '') && raw.slice(0, i).trim()) {
      return raw.slice(i + marker.length).trim()
    }
  }
  return null
}

// Un bloque es una racha de líneas que son sólo comentario, o un `/* */`. Encabeza algo —el archivo o una
// unidad— cuando empieza en la columna cero: dentro de una unidad todo va sangrado, así que no hace falta
// reconocer la declaración de cada lenguaje. El de después de código es siempre de adentro.
function commentBlocks(file, content) {
  const style = styleOf(file)
  if (!style) return []
  const blocks = []
  let current = null
  let open = false
  const close = () => { if (current) blocks.push(current); current = null }
  const push = (n, text, raw) => {
    if (!current) current = { start: n, lines: [], header: !/^\s/.test(raw) }
    current.end = n
    current.lines.push({ n, text: text.trim() })
  }
  content.split('\n').forEach((raw, index) => {
    const n = index + 1
    const text = raw.trim()
    if (open) {
      push(n, text.replace(/\*\/.*$/, '').replace(/^\*\s?/, ''), raw)
      if (text.includes('*/')) { open = false; close() }
      return
    }
    if (style.block && text.startsWith('/*')) {
      close()
      push(n, text.replace(/^\/\*\*?\s?/, '').replace(/\*\/.*$/, ''), raw)
      if (text.includes('*/')) close()
      else open = true
      return
    }
    if (text.startsWith(style.line) && !(n === 1 && text.startsWith('#!'))) {
      push(n, text.slice(style.line.length).trim(), raw)
      return
    }
    close()
    const after = trailing(raw, style.line)
    if (after) blocks.push({ start: n, end: n, lines: [{ n, text: after }], header: false })
  })
  close()
  return blocks
}

// Palabras que en un idioma son frecuentes y en el otro no existen. Lo que va entre comillas, backticks o
// «» es un nombre y no prosa: `--skip-roots` no hace inglés a un comentario en español.
const WORDS = {
  es: new Set(('que para los las del una por sin cuando porque pero como esto esta este hay donde el la en se '
    + 'con es son al ya más sólo cada otro otra nunca siempre también').split(' ')),
  en: new Set(('the and that with for this from when which what because but not are was were has have its '
    + 'into only every never always also should would there').split(' ')),
}
const NAMES = /`[^`]*`|"[^"]*"|'[^']*'|«[^»]*»|https?:\/\/\S+/g

function languageOf(text) {
  const prose = text.replace(NAMES, ' ').toLowerCase()
  const words = prose.split(/[^a-záéíóúüñ]+/).filter(Boolean)
  const hits = (language) => new Set(words.filter((word) => WORDS[language].has(word))).size
  const es = hits('es') + (/[áéíóúñ¿¡]/.test(prose) ? 2 : 0)
  const en = hits('en')
  if (Math.max(es, en) < 2 || es === en) return null
  return es > en ? 'es' : 'en'
}

// Las líneas del archivo staged que son nuevas. En un merge, nuevas contra los dos padres: lo que trae la
// rama mergeada se revisó donde se escribió.
function addedLines(dir, file, merging) {
  const against = (rev) => {
    const out = git(dir, ['diff', '--cached', '-U0', ...(rev ? [rev] : []), '--', file])
    const lines = new Set()
    for (const hunk of out.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      for (let n = start; n < start + count; n++) lines.add(n)
    }
    return lines
  }
  const added = against(null)
  if (!merging) return added
  const theirs = against('MERGE_HEAD')
  return new Set([...added].filter((n) => theirs.has(n)))
}

function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (result.status !== 0) {
    block(`no se pudo leer el commit en ${dir} (git ${args[0]}): ${(result.stderr || '').trim()}`)
  }
  return result.stdout
}

// Lo que el commit agrega, archivo por archivo, y lo que rompe lo declarado.
function review(files, spec) {
  const hard = []
  const listing = []
  for (const { file, content, added } of files) {
    const touched = commentBlocks(file, content).filter((one) => one.lines.some((line) => added.has(line.n)))
    if (!touched.length) continue
    listing.push({ file, blocks: touched })
    for (const one of touched) {
      const where = `${file}:${one.start}`
      if (spec.inlineMax && !one.header && one.lines.length > spec.inlineMax) {
        hard.push(`${where}: ${one.lines.length} líneas dentro de una unidad (máximo ${spec.inlineMax}); lo que `
          + 'garantiza va encabezándola, y lo que sobra, afuera')
      }
      const found = spec.language && languageOf(one.lines.map((line) => line.text).join(' '))
      if (found && found !== spec.language) {
        hard.push(`${where}: está en ${found} y acá los comentarios van en ${spec.language}`)
      }
    }
  }
  return { hard, listing }
}

function token(listing) {
  const hash = crypto.createHash('sha256')
  for (const { file, blocks } of listing) {
    hash.update(file)
    for (const one of blocks) for (const line of one.lines) hash.update(`\0${line.text}`)
  }
  return hash.digest('hex').slice(0, 12)
}

// Las tres preguntas son las de R11, en sus palabras: cambiarlas acá sin cambiar la regla es tener dos.
function listingMessage(listing, tok) {
  const out = ['Este commit agrega comentarios: recorrelos antes de que entren (R11). De cada uno, si alguien lo '
    + 'preguntaría, si su razón ya está escrita en otro lado y si está en el destino que le toca —el porqué '
    + 'dentro de la unidad, qué garantiza encabezándola—.', '']
  for (const { file, blocks } of listing) {
    out.push(file)
    for (const one of blocks) {
      out.push(`  ${one.start}-${one.end} (${one.header ? 'encabezado' : 'dentro'})`)
      for (const line of one.lines) out.push(`    | ${line.text}`)
    }
  }
  out.push('', 'Corregí lo que no pase, stageá de nuevo y volvé a commitear. Cuando todos pasen:',
    `  ${VARIABLE}=${tok} git commit …`)
  return out.join('\n')
}

function comments(input) {
  const command = commandOf(input)
  if (!isCommit(command)) return
  const root = opsRoot(input)
  const spec = root && configOf(root).comments
  if (!spec) return
  const { dir, staged } = stagedForCommit(command, cwdOf(input))
  const merging = spawnSync('git', ['-C', dir, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0
  const files = git(dir, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
    .split('\0').filter((file) => file && styleOf(file))
    .map((file) => ({ file, content: git(dir, ['show', `:${file}`]), added: addedLines(dir, file, merging) }))
  const { hard, listing } = review(files, spec)
  if (hard.length) {
    // Lo duro lo puede aprobar la persona, como cualquier gate: el idioma de un archivo ajeno no se corrige.
    // Aprobarlo no saltea la pasada de abajo, que es del agente y no de lo declarado.
    const unapproved = AP.pendingNow(root, staged, input)
    if (unapproved.length) {
      block(`Los comentarios que agrega este commit rompen lo que declara ops.config.json → comments:\n`
        + `${hard.map((one) => `  - ${one}`).join('\n')}\n${AP.HOW(null, unapproved, input)}`)
    }
  }
  if (!listing.length) return
  const tok = token(listing)
  const given = (command.match(new RegExp(`\\b${VARIABLE}=([0-9a-f]+)`)) || [])[1]
  if (given !== tok) block(listingMessage(listing, tok))
}

module.exports = { comments, commentBlocks, languageOf, review, token }
