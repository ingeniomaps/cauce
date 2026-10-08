'use strict'

// Lo que `governance` juzga según dónde esté la instancia respecto del repositorio (casos 334 y su revisión):
// el layout por defecto de `init`, con `ops/` dentro del repo, y la instancia alcanzada por un enlace
// simbólico. Lo que el guard protege y cómo se aprueba sigue en `commit.test.js`, junto a los otros gates.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')

// El layout por defecto de `init` —`ops/` dentro del repositorio— dejaba a `governance` sin nada que
// frenar: el índice de git nombra `ops/planning/rules/…` y el patrón anclaba en `^planning/`. Los tres
// layouts tienen que dar lo mismo, así que se mide el que fallaba junto al embebido, que ya pasaba, y con
// el commit lanzado desde la raíz del repo y desde `ops/` (caso 334).
test('governance juzga las rutas relativas a la raíz ops, también con ops/ dentro del repositorio', () => {
  const root = tempRoot('ops-hook-gov-sidecar-')
  initRepo(root)
  const ops = path.join(root, 'ops')
  fs.mkdirSync(path.join(ops, 'planning', 'rules', 'system'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }], runner: {} }))
  fs.writeFileSync(path.join(ops, 'planning', 'rules', 'system', 'process.md'), '# regla\n')
  git(['add', 'ops/planning/rules/system/process.md', 'ops/ops.config.json'], root)
  const before = process.env.OPS_ROOT
  process.env.OPS_ROOT = ops
  try {
    blocked('governance', { cwd: root, tool_input: { command: 'git commit -m x' } }, /gobernanza protegida/)
    blocked('governance', { cwd: ops, tool_input: { command: 'git commit -m x' } }, /gobernanza protegida/)
    // Lo que está fuera de la instancia no es gobernanza de nadie, aunque el repositorio sea el mismo.
    git(['reset', '-q'], root)
    fs.writeFileSync(path.join(root, 'planning.md'), 'no es planning\n')
    git(['add', 'planning.md'], root)
    assert.doesNotThrow(() => execute('governance', { cwd: root, tool_input: { command: 'git commit -m x' } }))
  } finally {
    if (before === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = before
  }
})

// La revisión del conjunto lo encontró: `run-hook.sh` exporta la raíz ops con el `pwd` lógico, que conserva un
// enlace simbólico, y git devuelve el toplevel real. Relativizar una contra el otro daba `../../…` y el guard
// volvía a no frenar nada, en silencio, exactamente lo que el 334 cerró. Los dos lados se comparan reales.
test('governance frena igual cuando la instancia se alcanza por un enlace simbólico',
  { skip: process.platform === 'win32' }, () => {
  const real = tempRoot('ops-hook-gov-real-')
  initRepo(real)
  const link = path.join(tempRoot('ops-hook-gov-link-'), 'repo')
  fs.symlinkSync(real, link, 'dir')
  fs.mkdirSync(path.join(real, 'ops', 'planning', 'rules', 'system'), { recursive: true })
  fs.writeFileSync(path.join(real, 'ops', 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }], runner: {} }))
  fs.writeFileSync(path.join(real, 'ops', 'planning', 'rules', 'system', 'process.md'), '# regla\n')
  git(['add', 'ops/planning/rules/system/process.md', 'ops/ops.config.json'], real)
  const before = process.env.OPS_ROOT
  process.env.OPS_ROOT = path.join(link, 'ops')
  try {
    blocked('governance', { cwd: link, tool_input: { command: 'git commit -m x' } }, /gobernanza protegida/)
  } finally {
    if (before === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = before
  }
})
