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
const P = require('./parser')
const EM = require('./epic-milestones')
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
  let order = nextOrder(root)
  const files = milestones.map((one) => {
    const front = `---\norder: ${order}\n${one.line ? `line: ${one.line}\n` : ''}---\n`
    const tasks = one.stories.map((slug) => taskLine(bySlug.get(slug), epic.num))
    order += STEP
    return {
      file: `backlog/${one.slug}.md`, line: one.line, tasks: tasks.length,
      text: `${front}\n## Hito ${one.slug} — ${one.title}\n\n${tasks.join('\n')}\n`,
    }
  })
  const taken = files.filter((one) => fs.existsSync(path.join(root, one.file))).map((one) => one.file)
  if (taken.length) return { error: `ya existe ${taken.join(', ')}` }
  const text = P.read(epic.path)
  return { epic, files, path: epic.path, text: text.replace(/^status:\s*open[ \t]*$/m, 'status: active') }
}

function apply(root, result) {
  fs.mkdirSync(path.join(root, 'backlog'), { recursive: true })
  for (const one of result.files) fs.writeFileSync(path.join(root, one.file), one.text)
  fs.writeFileSync(result.path, result.text)
}

module.exports = { plan, apply }
