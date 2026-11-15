'use strict'

// El bloque que Cauce escribe en un `.gitignore` que no creó (caso 513). Va entre dos marcas para que se pueda
// rehacer, revisar en el diff y sacar sin tocar nada de lo que la persona escribió afuera.
//
// Existe para los dos `.gitignore` que el de la instancia no alcanza: el del producto en modo embebido —la
// instancia es el repositorio, y su `.gitignore` es del producto— y el del repositorio donde el runner instala su
// wiring en sidecar, que es el padre de la instancia.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const OPEN = '# >>> cauce'
const CLOSE = '# <<< cauce'
const NOTE = '# Lo escribe Cauce al instalar o actualizar, y destroy lo saca. Lo tuyo va fuera de estas marcas.'

// Lo que el molde ignora porque es de la instancia. Quedan afuera dos líneas que no son de Cauce sino de cualquier
// repositorio —`*.tgz`, `.DS_Store`—, y las del wiring del runner: ésas las agrega `automation install`, que distingue
// lo que generó de un recorrido propio del producto en la misma carpeta. `node_modules` sí entra: `init` le suma al
// producto una dependencia, y con ella la carpeta.
const LEFT_OUT = new Set(['*.tgz', '.DS_Store', '.claude/workflows/', '.agents/plugins/cauce/hook.js'])
function instanceLines(templateFile) {
  return fs.readFileSync(templateFile, 'utf8').split('\n').map((one) => one.trim())
    .filter((one) => one && !one.startsWith('#') && !LEFT_OUT.has(one))
}

function split(text) {
  const lines = text.split('\n')
  const start = lines.indexOf(OPEN)
  const end = start < 0 ? -1 : lines.indexOf(CLOSE, start)
  if (start < 0 || end < 0) return { outside: text, inside: [], found: false }
  const inside = lines.slice(start + 1, end).filter((one) => one.trim() && !one.startsWith('#'))
  const outside = [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n')
  return { outside, inside, found: true }
}

const render = (outside, inside) => {
  const kept = outside.replace(/\n+$/, '')
  if (!inside.length) return kept ? `${kept}\n` : ''
  return `${kept ? `${kept}\n\n` : ''}${[OPEN, NOTE, ...inside, CLOSE].join('\n')}\n`
}

// Sin las variables de git del entorno: con `GIT_DIR` puesto, `-C` contesta por otro repositorio (caso 045).
const git = (repo, ...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8',
  env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))) })

// Una ruta de ejemplo que el patrón alcanza, para preguntarle a git si ya la ignora.
const probe = (pattern) => {
  const bare = pattern.replace(/^\//, '').replace(/\*/g, 'x')
  return bare.endsWith('/') ? `${bare}x` : bare
}

// Las líneas en grupos: cada una con las negaciones que la siguen, que sólo significan algo junto a ella.
function groups(lines) {
  const out = []
  for (const line of lines) {
    if (line.startsWith('!') && out.length) out[out.length - 1].push(line)
    else out.push([line])
  }
  return out
}

// Qué grupos entran, con el repositorio a la vista. Uno cuya línea la persona ya escribió, o que ya está en el
// bloque, no se toca: sus negaciones son decisión de quien la escribió. Uno que ignoraría archivos que el repositorio
// versiona —contadas sus negaciones: `planning/wip/*.md` con `!planning/wip/README.md` no ignora el README— no entra,
// porque `.env.*` sobre un `.env.production` del producto lo dejaría fuera de todo cambio sin avisar. Uno que git ya
// cubre con otra regla tampoco.
function decide(repo, lines, present) {
  const take = []
  const skipped = []
  // `ls-files -x` compara desde la raíz del repositorio, y el `.gitignore` de una subcarpeta —una embebida dentro de un
  // monorepo— se lee desde ella: sin traducir, el control de versionados no veía nada ahí.
  const prefix = repo ? (git(repo, 'rev-parse', '--show-prefix').stdout || '').trim() : ''
  const fromTop = (pattern) => {
    if (!prefix) return pattern
    const negated = pattern.startsWith('!')
    const bare = negated ? pattern.slice(1) : pattern
    const body = bare.replace(/\/$/, '').replace(/^\//, '')
    const inside = bare.replace(/\/$/, '').includes('/') ? body : `**/${body}`
    return `${negated ? '!' : ''}${prefix}${inside}${bare.endsWith('/') ? '/' : ''}`
  }
  for (const [line, ...negations] of groups(lines)) {
    if (present.has(line)) continue
    if (repo) {
      const tracked = (git(repo, 'ls-files', '-c', '-i', `--exclude=${fromTop(line)}`,
        ...negations.map((one) => `--exclude=${fromTop(one)}`)).stdout || '').split('\n').filter(Boolean)
      if (tracked.length) {
        skipped.push({ line, tracked })
        continue
      }
      if (git(repo, 'check-ignore', '-q', '--no-index', probe(line)).status === 0) continue
    }
    take.push(line, ...negations.filter((one) => !present.has(one)))
  }
  return { take, skipped }
}

// Suma `lines` —en el orden del molde— al bloque, sin repetir las que ya tiene ni las que la persona escribió afuera.
// Con `repo`, decide además contra lo que git versiona y lo que ya ignora. Un `.gitignore` que es un enlace no se
// escribe: lo que hay detrás no es de este repositorio.
function add(file, lines, repo = '') {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) return { added: [], skipped: [] }
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const { outside, inside } = split(text)
  const present = new Set([...inside, ...outside.split('\n').map((one) => one.trim())])
  const { take, skipped } = decide(repo, [...new Set(lines)], present)
  if (take.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, render(outside, [...inside, ...take]))
  }
  return { added: take, skipped }
}

// Saca el bloque entero. Devuelve si había uno, con sus dos marcas.
function remove(file) {
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) return false
  const { outside, found } = split(fs.readFileSync(file, 'utf8'))
  if (!found) return false
  fs.writeFileSync(file, render(outside, []))
  return true
}

module.exports = { instanceLines, add, remove, split, render }
