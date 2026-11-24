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
// Las otras dos formas de un enlace: entre `<…>`, que admite espacios, y la definición de referencia `[x]: ruta`.
const ANGLED = /\]\(\s*<([^<>\n]+)>/g
const REFERENCE = /^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<([^<>\n]+)>|([^\s<>]+))/gm

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

// En un solo recorrido y en orden de aparición, como CommonMark: lo que abre primero manda. Un `span` que empieza
// antes tapa el `<!--` que trae adentro, y un comentario que empieza antes se lleva los backticks que tenga. Tapar
// primero los `span` emparejaba un backtick suelto del comentario con uno de afuera y se perdía el cierre. Con
// `indexOf` y no con `<!--[\s\S]*?-->`, que con muchas aperturas sin cierre recorría el resto desde cada una.
function withoutComments(text) {
  const next = /`|<!--/g
  let out = ''
  let at = 0
  let eol = -1
  for (;;) {
    next.lastIndex = at
    const hit = next.exec(text)
    if (!hit) return out + text.slice(at)
    if (hit[0] === '`') {
      if (eol < hit.index) eol = text.indexOf('\n', hit.index) === -1 ? text.length : text.indexOf('\n', hit.index)
      const close = text.indexOf('`', hit.index + 1)
      const stop = close !== -1 && close < eol ? close + 1 : hit.index + 1
      out += text.slice(at, stop)
      at = stop
      continue
    }
    const close = text.indexOf('-->', hit.index + 4)
    out += text.slice(at, hit.index)
    if (close === -1) return out
    at = close + 3
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
// Los títulos de un documento: los ATX (`## Título`) y los setext, una línea subrayada con `===` o `---`. Un `---` sólo
// subraya si la línea de arriba es texto, y el frontmatter no cuenta: su `---` de cierre no es un subrayado.
function titles(text) {
  const lines = text.replace(/^---\n[\s\S]*?\n---\n/, '\n').split('\n')
  const found = []
  for (let at = 0; at < lines.length; at += 1) {
    const atx = titleOf(lines[at])
    if (atx) found.push(atx)
    else if (at + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[at + 1]) && lines[at].trim()
      && !/^ {0,3}(?:[-*+>]|\d+[.)])\s/.test(lines[at])) {
      found.push(lines[at].trim())
      at += 1
    }
  }
  return found
}

function anchorsOf(text) {
  const seen = new Map()
  const anchors = new Set()
  for (const title of titles(blocks(text))) {
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
    const text = prose(fs.readFileSync(file, 'utf8'))
    const found = [...text.matchAll(LINK), ...text.matchAll(ANGLED), ...text.matchAll(REFERENCE)]
    for (const raw of found.map((match) => match[1] || match[2])) {
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
