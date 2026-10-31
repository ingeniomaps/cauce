'use strict'

// Un `git worktree` de la instancia es la instancia en otra carpeta (caso 465). Los guards la comparaban sólo contra
// la raíz de la sesión, así que el mismo archivo cambiaba de respuesta según el árbol: de más en `plan-first`, y de
// menos en `ops-config`, que no veía la llave de push de esa copia.

const { tempRoot, writeWip } = require('../support/environment')
const { blocked, git, initRepo, WIP_IDLE, WIP_CON_PLAN, BACKLOG_WITH_TASK } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const { instanceTreeOf } = require('../../engine/hooks/instance-tree')

function sidecar(name, wip = WIP_IDLE, mode = 'sidecar') {
  const base = fs.realpathSync(tempRoot(name))
  const root = path.join(base, 'ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  const roots = [{ name: 'main', path: mode === 'sidecar' ? '..' : '.' }]
  const config = { mode, runner: { allowPush: false }, workspaceRoots: roots }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), BACKLOG_WITH_TASK)
  initRepo(root)
  git(['add', 'ops.config.json', 'planning/BACKLOG.md'], root)
  git(['commit', '-qm', 'base'], root)
  writeWip(path.join(root, 'planning'), wip)
  const tree = path.join(base, 'ops-wt')
  git(['worktree', 'add', '-q', '-b', 'wt', tree], root)
  return { base, root, tree, config }
}

const previous = process.env.OPS_ROOT
const writes = ({ root, base }, file, content = 'x\n') => {
  process.env.OPS_ROOT = root
  return { cwd: base, tool_input: { file_path: file, content } }
}
test.afterEach(() => {
  if (previous === undefined) delete process.env.OPS_ROOT
  else process.env.OPS_ROOT = previous
})

test('lo que la instancia posee responde igual en su worktree que en el checkout principal', () => {
  const at = sidecar('cauce-wt-posee-')
  for (const file of ['automatization/bin/n.js', 'planning/reports/n.md']) {
    assert.doesNotThrow(() => execute('plan-first', writes(at, path.join(at.root, file))))
    assert.doesNotThrow(() => execute('plan-first', writes(at, path.join(at.tree, file))))
  }
})

test('el producto sigue pidiendo plan, y también lo que está en un worktree y la instancia no posee', () => {
  const at = sidecar('cauce-wt-producto-')
  fs.mkdirSync(path.join(at.base, 'app'))
  blocked('plan-first', writes(at, path.join(at.base, 'app', 'x.js')), /sin plan/)
  blocked('plan-first', writes(at, path.join(at.tree, 'src', 'x.js')), /sin plan/)
})

test('una carpeta ajena con su propio planning/ no pasa por la instancia', () => {
  const at = sidecar('cauce-wt-ajena-')
  const other = path.join(at.base, 'otro')
  fs.mkdirSync(path.join(other, 'planning'), { recursive: true })
  initRepo(other)
  blocked('plan-first', writes(at, path.join(other, 'planning', 'n.md')), /sin plan/)
  assert.equal(instanceTreeOf(at.root, path.join(other, 'planning', 'n.md')), '')
})

// El reconocimiento sólo cambia lo que `plan-first` llama producto: el límite de raíces sigue juzgando aparte.
test('reconocer el worktree no abre el límite de raíces', () => {
  const at = sidecar('cauce-wt-embebido-', WIP_IDLE, 'embedded')
  blocked('workspace-boundary', writes(at, path.join(at.tree, 'planning', 'n.md')), /fuera de las raíces/)
})

test('en embedded con una raíz que contiene al worktree, sólo se exime lo que la instancia posee', () => {
  const at = sidecar('cauce-wt-embebido-raiz-', WIP_IDLE, 'embedded')
  const roots = [{ name: 'main', path: '..' }]
  fs.writeFileSync(path.join(at.root, 'ops.config.json'), JSON.stringify({ ...at.config, workspaceRoots: roots }))
  assert.doesNotThrow(() => execute('plan-first', writes(at, path.join(at.tree, 'planning', 'n.md'))))
  blocked('plan-first', writes(at, path.join(at.tree, 'src', 'x.js')), /sin plan/)
})

test('instanceTreeOf reconoce el árbol aunque el archivo todavía no exista, y no responde dentro de la raíz', () => {
  const at = sidecar('cauce-wt-arbol-')
  assert.equal(instanceTreeOf(at.root, path.join(at.tree, 'a', 'b', 'c.md')), at.tree)
  assert.equal(instanceTreeOf(at.root, path.join(at.root, 'planning', 'n.md')), '')
  assert.equal(instanceTreeOf(at.root, path.join(at.base, 'nada', 'n.md')), '')
})

test('la llave de push en el ops.config.json de un worktree se frena igual que en el principal', () => {
  const at = sidecar('cauce-wt-llave-', WIP_CON_PLAN)
  const open = JSON.stringify({ ...at.config, runner: { allowPush: true } })
  blocked('ops-config', writes(at, path.join(at.root, 'ops.config.json'), open), /allowPush/)
  blocked('ops-config', writes(at, path.join(at.tree, 'ops.config.json'), open), /allowPush/)
  const same = JSON.stringify({ ...at.config, project: 'otro nombre' })
  assert.doesNotThrow(() => execute('ops-config', writes(at, path.join(at.tree, 'ops.config.json'), same)))
})

test('escribir por shell el ops.config.json de un worktree se frena igual que en el principal', () => {
  const at = sidecar('cauce-wt-shell-', WIP_CON_PLAN)
  process.env.OPS_ROOT = at.root
  const command = (file) => ({ cwd: at.base, tool_input: { command: `printf x > ${file}` } })
  blocked('ops-config-shell', command(path.join(at.root, 'ops.config.json')), /ops\.config\.json/)
  blocked('ops-config-shell', command(path.join(at.tree, 'ops.config.json')), /ops\.config\.json/)
  assert.doesNotThrow(() => execute('ops-config-shell', command(path.join(at.tree, 'README.md'))))
})

test('la llave de push no se saltea entrando al worktree por un enlace', () => {
  const at = sidecar('cauce-wt-enlace-', WIP_CON_PLAN)
  const link = path.join(at.base, 'lnk')
  fs.symlinkSync(at.tree, link)
  const open = JSON.stringify({ ...at.config, runner: { allowPush: true } })
  blocked('ops-config', writes(at, path.join(link, 'ops.config.json'), open), /allowPush/)
})

test('un archivo que sólo se llama ops.config.json responde igual en los dos árboles', () => {
  const at = sidecar('cauce-wt-nombre-', WIP_CON_PLAN)
  for (const tree of [at.root, at.tree]) {
    const file = path.join(tree, 'test', 'fix', 'ops.config.json')
    assert.doesNotThrow(() => execute('ops-config', writes(at, file, 'no json')), tree)
    process.env.OPS_ROOT = at.root
    const command = { cwd: at.base, tool_input: { command: `printf x > ${file}` } }
    assert.doesNotThrow(() => execute('ops-config-shell', command))
  }
})

test('lo que la instancia posee se reconoce también entrando por un enlace', () => {
  const at = sidecar('cauce-wt-enlace-plan-')
  const link = path.join(at.base, 'lnk')
  fs.symlinkSync(at.tree, link)
  assert.doesNotThrow(() => execute('plan-first', writes(at, path.join(link, 'planning', 'n.md'))))
})

test('la llave de push también se cuida en un worktree dentro de la raíz, y por un enlace con otro nombre', () => {
  const at = sidecar('cauce-wt-adentro-', WIP_CON_PLAN)
  const open = JSON.stringify({ ...at.config, runner: { allowPush: true } })
  const nested = path.join(at.root, '.wt')
  git(['worktree', 'add', '-q', '-b', 'adentro', nested], at.root)
  blocked('ops-config', writes(at, path.join(nested, 'ops.config.json'), open), /allowPush/)
  const alias = path.join(at.base, 'alias.json')
  fs.symlinkSync(path.join(at.tree, 'ops.config.json'), alias)
  blocked('ops-config', writes(at, alias, open), /allowPush/)
})
