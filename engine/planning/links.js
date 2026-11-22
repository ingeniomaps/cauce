'use strict'

// Enlaces relativos rotos en `planning/` y `organization/` (caso 531). Una regla que enlaza a un archivo que se movió o
// se partió pasaba `check` en verde, y mover o partir reglas es lo que hace una empresa al adaptar el molde y lo que
// puede hacer un `upgrade`. Todo es aviso: una instancia con enlaces viejos no pasa a rojo de golpe al actualizar, y el
// ancla depende de cómo slugifica el visor, que no es el motor.

const fs = require('node:fs')
const path = require('node:path')

// `done/` y `archive/` son historia: lo cerrado no se corrige editándolo.
const SKIPPED_DIRS = new Set(['done', 'archive', 'node_modules', '.git'])
// Lo que en una plantilla está para que alguien lo llene: `NNN-slug.md`, `{{…}}`, `<ruta>`, la ADR modelo.
const PLACEHOLDER = /NNN|\{\{|<|>|000-template/
// La ruta no lleva `(`, `)` ni `]`: así una tira de `](x` sin cerrar no se recorre hasta el final desde cada una.
const LINK = /\]\(\s*([^()\]\s]+)(?:\s+["'][^"']*["'])?\s*\)/g

function markdownFiles(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return entries.flatMap((entry) => {
    const at = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : markdownFiles(at)
    return entry.isFile() && entry.name.endsWith('.md') ? [at] : []
  })
}

// Lo que no es prosa: un bloque de código —también indentado dentro de una lista, o de cuatro backticks que envuelve
// uno de tres— o un comentario HTML lleva ejemplos de enlaces, no enlaces. Los `span` también, salvo en un título.
// Se recorre por líneas y no con una expresión: con cientos de aperturas sin cierre, la expresión retrocedía hasta el
// final del archivo por cada una. Como en CommonMark, cierra un fence del mismo carácter y al menos igual de largo, uno
// sin cierre llega hasta el final, y una línea de backticks que repite backticks después no abre ninguno.
function blocks(text) {
  const kept = []
  let open = null
  for (const line of text.split('\n')) {
    const fence = /^[ \t]*(`{3,}|~{3,})/.exec(line)
    if (!open) {
      if (fence && !(fence[1][0] === '`' && line.slice(fence[0].length).includes('`'))) open = fence[1]
      else kept.push(line)
    } else if (fence && fence[1][0] === open[0] && fence[1].length >= open.length
      && !line.slice(fence[0].length).trim()) {
      open = null
    }
  }
  return withoutComments(kept.join('\n'))
}

// Con `indexOf` y no con `<!--[\s\S]*?-->`, que con muchas aperturas sin cierre recorría el resto desde cada una. Se
// busca con los `span` tapados, del mismo largo: un `<!--` citado entre backticks no abre un comentario.
function withoutComments(text) {
  const masked = text.replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
  let out = ''
  let at = 0
  for (;;) {
    const start = masked.indexOf('<!--', at)
    if (start === -1) return out + text.slice(at)
    const end = masked.indexOf('-->', start + 4)
    out += text.slice(at, start)
    if (end === -1) return out
    at = end + 3
  }
}

// El texto de un título ATX, sin los `#` de cierre, o null. Recortado a mano: una expresión que buscara el cierre
// desde cada posición tardaba segundos con un título de miles de espacios.
function titleOf(line) {
  const open = /^ {0,3}#{1,6}[ \t]+/.exec(line)
  if (!open) return null
  let rest = line.slice(open[0].length).trimEnd()
  const closing = /[ \t]#+$/.exec(rest)
  if (closing) rest = rest.slice(0, closing.index).trimEnd()
  else if (/^#+$/.test(rest)) rest = ''
  return rest || null
}
const prose = (text) => blocks(text).replace(/`[^`\n]*`/g, '')

// El ancla que GitHub le da a un título: del texto que se ve —el código sin backticks, un enlace sin su ruta—, en
// minúsculas, sin puntuación salvo `-` y `_`, espacios por guiones, y `-1`, `-2` para los repetidos. Más las que el
// documento declara a mano con `<a id>` o `{#id}`.
function anchorsOf(text) {
  const seen = new Map()
  const anchors = new Set()
  for (const title of blocks(text).split('\n').map(titleOf).filter(Boolean)) {
    const shown = title.replace(/!?\[([^[\]]*)\]\([^()\]]*\)/g, '$1').replace(/`/g, '')
    const base = shown.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    anchors.add(count ? `${base}-${count}` : base)
  }
  for (const match of text.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']|\{#([^{}\s]+)\}/g)) {
    anchors.add((match[1] || match[2]).toLowerCase())
  }
  return anchors
}

// Un `%20` mal formado se mira tal cual en vez de tumbar `check`.
const decoded = (text) => { try { return decodeURIComponent(text) } catch { return text } }

function linkWarnings(opsRoot) {
  const files = ['planning', 'organization'].flatMap((dir) => markdownFiles(path.join(opsRoot, dir)))
  const anchors = new Map()
  const anchorsAt = (file) => {
    if (!anchors.has(file)) anchors.set(file, anchorsOf(fs.readFileSync(file, 'utf8')))
    return anchors.get(file)
  }
  const warnings = []
  for (const file of files) {
    const shown = path.relative(opsRoot, file)
    for (const [, raw] of prose(fs.readFileSync(file, 'utf8')).matchAll(LINK)) {
      // Una URL con esquema, un `mailto:` o una ruta absoluta no son del árbol que se mira.
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('/') || PLACEHOLDER.test(raw)) continue
      const [target, anchor] = raw.split('#')
      const resolved = target ? path.resolve(path.dirname(file), decoded(target)) : file
      if (!fs.existsSync(resolved)) {
        warnings.push(`${shown}: el enlace a ${raw} apunta a un archivo que no existe`)
        continue
      }
      if (!anchor || !resolved.endsWith('.md') || !fs.statSync(resolved).isFile()) continue
      if (!anchorsAt(resolved).has(decoded(anchor).toLowerCase())) {
        warnings.push(`${shown}: el enlace a ${raw} apunta a un ancla que ${path.basename(resolved)} no tiene`)
      }
    }
  }
  return warnings
}

module.exports = { linkWarnings, anchorsOf }
