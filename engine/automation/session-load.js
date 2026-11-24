'use strict'

// Cuánto carga de instrucciones una sesión de Claude Code abierta en la carpeta del runner (caso 532). El peso que
// informan `install` y `check` es sólo el bloque de Cauce, en bytes; Claude Code avisa por otra cuenta: todos los
// archivos de instrucciones de la sesión —el del usuario, los del proyecto y lo que importan con `@`—, en caracteres.
// Esto da esa cuenta, partida por quién la puso, para ver venir el aviso en el cambio que lo cruza.
//
// Del archivo del usuario se mide sólo el largo: es suyo y nunca se imprime. Los umbrales son los de Claude Code
// 2.1.330, leídos en su binario por el caso 532: avisa un archivo pasado `max(40.000, …)` y el total de los que no lo
// pasan pasado `max(120.000, ventana × 0,05 × 3 o 4)`, así que dependen del modelo y esto informa, no frena.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { SYSTEM_FILES } = require('../core/ownership')
const M = require('../core/manifest')

const FLOOR = 120000
const FILE_FLOOR = 40000
const MEASURED_WITH = '2.1.330'
const MAX_DEPTH = 4
// La política de la organización, en Linux; en otro sistema vive en otra ruta y no se cuenta.
const MANAGED = '/etc/claude-code/CLAUDE.md'
const CAUCE_BLOCK = /<!-- cauce:([\w-]+) inicio[^>]*-->([\s\S]*?)<!-- cauce:\1 fin -->/g

const read = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return null } }
const realOf = (file) => { try { return fs.realpathSync(file) } catch { return file } }
// Claude Code quita los comentarios HTML antes de cargar el archivo, así que no cuentan.
const shown = (text) => text.replace(/<!--[\s\S]*?-->/g, '')

// Los `@ruta` de un archivo, fuera del código: un `@x` dentro de un bloque o de un `span` es un ejemplo, y un `@` que
// no sigue a un espacio es parte de otra cosa, como un email. `\ ` escapa un espacio de la ruta.
function imports(text, from, home) {
  const prose = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '')
  return [...prose.matchAll(/(?:^|\s)@((?:\\ |[^\s])+)/g)].map(([, raw]) => raw.replace(/\\ /g, ' '))
    .map((ref) => (ref.startsWith('~/') ? path.join(home, ref.slice(2)) : path.resolve(path.dirname(from), ref)))
}

// Las reglas de `.claude/rules/` que se cargan al arrancar, en todas sus subcarpetas: las que no declaran `paths:`.
function startupRules(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  const scoped = (file) => /^paths:/m.test(((read(file) || '').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '')
  return entries.sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const at = path.join(dir, entry.name)
    if (entry.isDirectory()) return startupRules(at)
    return entry.name.endsWith('.md') && !scoped(at) ? [at] : []
  })
}

// Quién puso cada parte: lo del usuario, lo que Cauce entrega —sus reglas, su paquete, las instrucciones del runner
// que `install` escribió y nadie tocó, y sus archivos del sistema mientras sigan como el manifiesto los anotó— y el
// resto, que es del proyecto. Un archivo de la empresa con un bloque `cauce:<nombre>` adentro se parte: el bloque es
// de Cauce y lo de alrededor, de ella. Que haya un bloque no dice quién escribió lo de alrededor: `install` mete el
// suyo también en el `AGENTS.md` que Cauce entregó, y vuelve a anotarlo.
function parts(file, text, { home, opsRoot, delivered }) {
  if (file === MANAGED || file.startsWith(path.join(home, '.claude') + path.sep)) return { user: shown(text).length }
  const rel = opsRoot ? path.relative(opsRoot, file).split(path.sep).join('/') : ''
  const untouched = SYSTEM_FILES.includes(rel) && !M.editedPaths(opsRoot, [rel]).length && Boolean(M.read(opsRoot)[rel])
  const fromCauce = untouched || /^planning\/rules\/(?:system|adopted)\//.test(rel)
    || /[/\\]@ingeniomaps[/\\]cauce[/\\]/.test(file) || delivered.has(file)
  if (fromCauce) return { cauce: shown(text).length }
  let cauce = 0
  const rest = text.replace(CAUCE_BLOCK, (all, name, inner) => { cauce += shown(inner).length; return '' })
  return { project: shown(rest).length, cauce }
}

// Lo que carga al arrancar, como lo documenta Claude Code (code.claude.com/docs/en/memory, leído el 2026-11-22): la
// política de la organización, el `CLAUDE.md` y las reglas del usuario, el `CLAUDE.md`, el `CLAUDE.local.md` y las
// reglas sin `paths:` de la carpeta y de cada ancestro, y sus `@` hasta «a maximum depth of four hops». Se recorre por
// saltos, así que cada archivo cuenta una vez, por su ruta real y en el salto más corto que lo alcanza.
function loadedFiles(dir, { home = os.homedir(), opsRoot = '', delivered = new Set() } = {}) {
  const roots = [MANAGED, path.join(home, '.claude', 'CLAUDE.md'), ...startupRules(path.join(home, '.claude', 'rules'))]
  const levels = []
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    levels.unshift(at)
    if (path.dirname(at) === at) break
  }
  for (const at of levels) {
    roots.push(path.join(at, 'CLAUDE.md'), path.join(at, '.claude', 'CLAUDE.md'), path.join(at, 'CLAUDE.local.md'),
      ...startupRules(path.join(at, '.claude', 'rules')))
  }
  const seen = new Map()
  let hop = roots.map((file) => ({ file, depth: 0 }))
  while (hop.length) {
    const next = []
    for (const { file, depth } of hop) {
      const real = realOf(file)
      if (seen.has(real)) continue
      const text = read(file)
      if (text === null || !fs.statSync(file).isFile()) continue
      seen.set(real, { file: real, ...parts(real, text, { home, opsRoot, delivered }) })
      if (depth < MAX_DEPTH) for (const one of imports(text, file, home)) next.push({ file: one, depth: depth + 1 })
    }
    hop = next
  }
  return [...seen.values()].map((one) => ({ ...one,
    chars: (one.user || 0) + (one.project || 0) + (one.cauce || 0) }))
}

const thousands = (n) => n.toLocaleString('es-AR')

// Las instrucciones del runner que Cauce entregó y siguen como las entregó, o como una versión anterior suya: el
// estado de `doctor` (`deliveryState`). Lo que la empresa editó es `ajeno`, y ese se parte por bloques.
function delivered(root, name = 'claude') {
  const A = require('./index')
  const R = require('./runners')
  const runner = A.runnerManifest(root, name)
  const paths = R.runnerPaths(root, name, runner)
  return new Set((runner.instructions || []).map((item) => ({ item, ...R.resolveItem(paths, root, name, item) }))
    .filter((one) => ['al día', 'desactualizado'].includes(A.deliveryState(M.readRunners(root), name, one,
      R.opsPrefix(root))))
    .map((one) => realOf(one.target)))
}

function loadLine(dir, options = {}) {
  const files = loadedFiles(dir, options)
  const sum = (kind) => files.reduce((total, one) => total + (one[kind] || 0), 0)
  const big = files.filter((one) => one.chars > FILE_FLOOR)
  const counted = files.filter((one) => one.chars <= FILE_FLOOR).reduce((total, one) => total + one.chars, 0)
  const over = counted > FLOOR ? ', y esto ya lo pasa' : ''
  const alone = big.length
    ? `; ${big.length} archivo(s) pasan los ${thousands(FILE_FLOOR)} de a uno, que avisa aparte y no suma al total` : ''
  return `una sesión abierta en la carpeta del runner carga ${thousands(sum('chars'))} caracteres de instrucciones en `
    + `${files.length} archivo(s): ${thousands(sum('user'))} del usuario, ${thousands(sum('project'))} del proyecto y `
    + `${thousands(sum('cauce'))} de Cauce. Claude Code avisa pasado ${thousands(FLOOR)}${over}${alone}; con una `
    + `ventana de contexto grande los umbrales suben (leídos en Claude Code ${MEASURED_WITH})`
}

module.exports = { loadLine, loadedFiles, delivered, FLOOR }
