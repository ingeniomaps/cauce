'use strict'

// Las reglas del sistema que un override conserva (caso 545). Sobrescribir `system/process.md` con un `process.md`
// propio reemplaza el archivo entero, y una instancia que sólo quería cambiar dos reglas perdía las demás: las
// «adoptaba por referencia» en una tabla de prosa que el motor no lee, y no le llegaban a ningún agente.
//
// El archivo que sobrescribe las nombra en su frontmatter, `adopta: R3, R17, R28`, y acá se copia su texto del
// sistema a `planning/rules/adopted/<archivo>.md`. Va en un archivo porque un import trae un archivo entero y no
// una sección, y va fuera de `system/` porque `upgrade` trata esa carpeta como suya entera.

const fs = require('node:fs')
const path = require('node:path')

const DIR = 'adopted'
// La marca de cada generado, al principio o después de su frontmatter. Es lo que permite rehacerlo, o borrarlo cuando
// ya no se adopta nada, sin tocar un archivo que haya escrito una persona en la misma carpeta.
const MARK = '<!-- generado por Cauce (caso 545)'
const marked = (text) => String(text || '').slice(0, 400).includes(MARK)

const read = (file) => {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}
const RULE = /^##\s+([A-Z]\d+)\s+[—-]/

// Sólo en el frontmatter: un «adopta:» en la prosa es una frase.
function adoptsOf(text) {
  const front = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''))
  const line = front && /^adopta[ \t]*:[ \t]*(.*)$/m.exec(front[1])
  return line ? [...new Set(line[1].split(/[\s,]+/).filter(Boolean))] : []
}

// Las secciones `## RN — …` de un archivo de reglas, cada una hasta la siguiente de su nivel.
function sectionsOf(text) {
  const sections = new Map()
  let current = null
  for (const line of String(text).split('\n')) {
    const rule = RULE.exec(line)
    if (rule) sections.set(current = rule[1], [line])
    else if (/^##\s/.test(line) || /^#\s/.test(line)) current = null
    else if (current) sections.get(current).push(line)
  }
  return new Map([...sections].map(([id, lines]) => [id, lines.join('\n').trimEnd()]))
}

// Cada archivo propio que sobrescribe uno del sistema y declara `adopta:`, con lo que adopta.
function declared(rules) {
  let names = []
  try { names = fs.readdirSync(rules).filter((one) => one.endsWith('.md') && one !== 'README.md') } catch { return [] }
  return names.sort().flatMap((name) => {
    const own = read(path.join(rules, name))
    const ids = adoptsOf(own)
    if (!ids.length) return []
    const system = read(path.join(rules, 'system', name))
    return [{ name, ids, own, system }]
  })
}

// Sólo lo que el sistema define y el propio no: con las dos, el agente cargaba dos textos bajo el mismo número. Y con
// la superficie (`aplica:`) del propio o, si no la tiene, del sistema: sin ella, una regla que se carga sólo al tocar
// su tema pasaba a cargarse en cada agente.
const surfaceOf = (text) => {
  const front = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''))
  return ((front && /^aplica:[ \t]*(\S.*?)[ \t]*$/m.exec(front[1])) || [])[1] || ''
}
function render(one) {
  const theirs = sectionsOf(one.system || '')
  const ours = sectionsOf(one.own || '')
  const body = one.ids.filter((id) => theirs.has(id) && !ours.has(id)).map((id) => theirs.get(id))
  const surface = surfaceOf(one.own) || surfaceOf(one.system)
  return `${surface ? `---\naplica: ${surface}\n---\n\n` : ''}`
    + `${MARK}: lo que planning/rules/${one.name} adopta de planning/rules/system/${one.name}. `
    + 'No se edita: se rehace con automation install. -->\n\n'
    + `# Adoptadas de system/${one.name}\n\n${body.join('\n\n')}\n`
}

const generated = (rules, name) => path.join(rules, DIR, name)

// Lo que está mal declarado: adoptar sin sobrescribir, una regla que el sistema no define, o una que el propio
// redefine, que serían dos textos bajo el mismo número.
function errorsOf(rules) {
  return declared(rules).flatMap((one) => {
    if (one.system === null) {
      return [`rules/${one.name}: adopta ${one.ids.join(', ')}, pero no sobrescribe ningún archivo del sistema`]
    }
    const theirs = sectionsOf(one.system)
    const ours = sectionsOf(one.own)
    return one.ids.flatMap((id) => {
      if (!theirs.has(id)) return [`rules/${one.name}: adopta ${id}, que system/${one.name} no define`]
      if (ours.has(id)) return [`rules/${one.name}: adopta ${id} y también lo define; queda una de las dos`]
      return []
    })
  })
}

// Lo generado que no coincide con lo que se declara hoy: el sistema cambió con un `upgrade`, o el `adopta:` cambió.
function staleOf(rules) {
  return declared(rules).filter((one) => one.system !== null && read(generated(rules, one.name)) !== render(one))
    .map((one) => `rules/${DIR}/${one.name} no coincide con lo que rules/${one.name} adopta de system/${one.name}; `
      + 'corré automation install para rehacerlo')
}

// Escribe lo que se adopta y borra lo generado que ya no se adopta. Sólo toca archivos regulares que llevan la marca:
// uno escrito a mano, un enlace o una carpeta en ese lugar frenan la instalación nombrando la ruta.
function write(rules) {
  const keep = new Set()
  for (const one of declared(rules).filter((item) => item.system !== null)) {
    const file = generated(rules, one.name)
    const text = render(one)
    keep.add(one.name)
    let stat = null
    try { stat = fs.lstatSync(file) } catch { /* no existe todavía */ }
    if (stat && !(stat.isFile() && marked(read(file)))) {
      throw new Error(`${file} existe y no lo generó Cauce: es donde va lo que rules/${one.name} adopta. `
        + 'Movelo o borralo, y volvé a instalar.')
    }
    if (read(file) === text) continue
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  let present = []
  try { present = fs.readdirSync(path.join(rules, DIR)) } catch { return }
  for (const name of present.filter((one) => !keep.has(one))) {
    const file = generated(rules, name)
    let regular = false
    try { regular = fs.lstatSync(file).isFile() } catch { /* se fue */ }
    if (regular && marked(read(file))) fs.unlinkSync(file)
  }
}

// Los ids que un override conserva, para restarlos de los que deja de regir.
const adoptedIds = (rules, name) => (declared(rules).find((item) => item.name === name) || { ids: [] }).ids

module.exports = { DIR, adoptsOf, sectionsOf, declared, render, errorsOf, staleOf, write, adoptedIds }
