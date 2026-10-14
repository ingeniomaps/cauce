'use strict'

// Promover una épica: pasar sus historias a la cola como hitos. Es el acto humano que el roadmap describe
// —«candidata editable que aún no fue promovida»— hecho por comando, para que el reparto que la épica
// propone en `## Hitos` llegue al archivo que el motor lee con su `line:` en vez de retipearse.
//
// `plan` decide y no escribe: devuelve los archivos a crear y la épica reescrita, o el motivo por el que no
// se puede. Así una épica con un marcador, un reparto mal escrito o un hito que ya existe no deja nada a
// medio promover.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const P = require('./parser')
const BK = require('./backlog')
const EM = require('./epic-milestones')
const SZ = require('./sizing')
const { validateEpic } = require('./contracts')

const STEP = 10
// La referencia al criterio va delante del guión en una historia y detrás del texto en una tarea: la lee
// `criteriaRefs` en los dos lugares, pero `TASK_LINE` exige que después del slug venga el guión.
const LEADING_REF = /^\(\s*(?:→|->)[^)]*\)\s*/

function taskLine(story, num) {
  const ref = (story.text.match(LEADING_REF) || [''])[0].trim()
  const rest = story.text.replace(LEADING_REF, '').replace(/^[—-]\s+/, '').trim()
  const cites = /\(epic:\s*\d{3}\)/.test(rest) ? '' : ` (epic: ${num})`
  return `- [ ] **${story.slug}** — ${rest}${ref ? ` ${ref}` : ''}${cites}`
}

// Las líneas que ya tienen rama. Un hito de una línea que nadie armó no lo ve ningún árbol, y `check` no lo
// dice: la línea sale de la rama (caso 239), así que lo único que la delata es que la rama no esté. Se
// avisa y no se niega, porque declarar el hito antes de armar la línea es un orden legítimo.
function knownLines(root) {
  const refs = spawnSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/line/'],
    { encoding: 'utf8' })
  return refs.status === 0 ? refs.stdout.split('\n').filter(Boolean).map((one) => one.slice('line/'.length)) : []
}

function nextOrder(root) {
  let names = []
  try { names = fs.readdirSync(path.join(root, 'backlog')) } catch { names = [] }
  const orders = names.filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => Number(P.frontmatter(P.read(path.join(root, 'backlog', name)))('order')))
    .filter(Number.isFinite)
  return Math.floor(Math.max(0, ...orders) / STEP) * STEP + STEP
}

function plan(root, epicName) {
  const base = path.basename(String(epicName || '').replace(/\/spec\.md$/, '')).replace(/\.md$/, '')
  const named = base.match(/^epic-(\d{3})-(.+)$/)
  if (!named) return { error: `${epicName || '(sin nombre)'} no es el nombre de una épica (epic-NNN-slug)` }
  const epic = P.readEpics(root).find((one) => one.file === `${base}.md` || one.file === `${base}/spec.md`)
  if (!epic) return { error: `no existe roadmap/${base}.md ni roadmap/${base}/spec.md` }
  const at = `roadmap/${epic.file}`
  if (epic.status !== 'open') return { error: `${at} está ${epic.status}: sólo se promueve una épica open` }
  if (epic.placeholders.length) {
    return { error: `${at} tiene ${epic.placeholders.length} marcador(es) sin resolver — "${epic.placeholders[0]}"` }
  }
  const invalid = [...validateEpic(epic), ...EM.errors(epic)]
  if (invalid.length) return { error: `${at} no pasa check:\n  ${invalid.join('\n  ')}\n` }
  if (!epic.stories.length) return { error: `${at} no tiene historias que promover` }
  const bySlug = new Map(epic.stories.map((story) => [story.slug, story]))
  const milestones = epic.milestones.length
    ? epic.milestones
    : [{ slug: named[2], title: epic.title, line: '', stories: epic.stories.map((story) => story.slug) }]
  // Lo que ya está en la cola, con un archivo propio o dentro de `BACKLOG.md`: el archivo no es lo único que
  // puede existir, y `check` rechaza el hito repetido después de haber escrito.
  const queued = new Map(BK.readBacklog(root).map((one) => [one.slug, one.file]))
  const taken = milestones
    .filter((one) => queued.has(one.slug) || fs.existsSync(path.join(root, 'backlog', `${one.slug}.md`)))
    .map((one) => `ya existe el hito ${one.slug} en ${queued.get(one.slug) || `backlog/${one.slug}.md`}`)
  if (taken.length) return { error: taken.join('; ') }
  let order = nextOrder(root)
  const planned = []
  const files = milestones.map((one) => {
    const front = `---\norder: ${order}\n${one.line ? `line: ${one.line}\n` : ''}---\n`
    const lines = one.stories.map((slug) => taskLine(bySlug.get(slug), epic.num))
    // Se leen con el mismo lector que la cola para juzgarlas como `check` las va a juzgar (R17).
    const tasks = lines.map((line) => P.taskFromLine(line))
    planned.push({ slug: one.slug, noSplit: P.noSplitReason(one.title), tasks: tasks.filter(Boolean) })
    order += STEP
    return {
      file: `backlog/${one.slug}.md`, line: one.line, tasks: lines.length,
      text: `${front}\n## Hito ${one.slug} — ${one.title}\n\n${lines.join('\n')}\n`,
    }
  })
  const oversized = SZ.oversizedUnits({ milestones: planned })
  if (oversized.length) return { error: `${at} no pasa check:\n  ${oversized.join('\n  ')}\n` }
  const text = P.read(epic.path)
  const activated = text.replace(/^status:\s*["']?open["']?[ \t]*$/m, 'status: active')
  if (activated === text) return { error: `no se pudo reescribir "status: open" en ${at}` }
  const known = new Set(knownLines(root))
  const warnings = [...new Set(milestones.map((one) => one.line).filter((line) => line && !known.has(line)))]
    .map((line) => `line ${line} no tiene árbol todavía: nadie la ve hasta "ops line . ${line}"`)
  return { epic, files, warnings, path: epic.path, text: activated }
}

function apply(root, result) {
  fs.mkdirSync(path.join(root, 'backlog'), { recursive: true })
  for (const one of result.files) fs.writeFileSync(path.join(root, one.file), one.text)
  fs.writeFileSync(result.path, result.text)
}

module.exports = { plan, apply }
