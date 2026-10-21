'use strict'

// El banco de las pruebas de `ops worktree`: lo comparten las de un árbol por tarea (`test/planning/worktree.test.js`)
// y las de una línea (`test/planning/line-worktree.test.js`), que no entraban en un solo archivo.

const { tempRoot } = require('./environment')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const TEMPLATE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// Una instancia sidecar con un repositorio al lado, que es el montaje que la guía recomienda para varios
// agentes: `ops/` una sola vez y los árboles de trabajo aparte.
function mount(prefix) {
  const base = tempRoot(prefix)
  const repo = path.join(base, 'producto')
  fs.mkdirSync(path.join(repo, 'api'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'api', 'main.go'), 'package main\n')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'test@test')
  git(repo, 'config', 'user.name', 'test')
  git(repo, 'add', 'api/main.go')
  git(repo, 'commit', '-q', '-m', 'base')

  const ops = path.join(base, 'producto-ops')
  fs.mkdirSync(ops, { recursive: true })
  fs.cpSync(TEMPLATE, path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({
    project: 'demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '../producto' }],
  }, null, 2))
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primero

- [ ] **alta** [lite] — Alta. _Aceptación: rechaza duplicado._ (service: api)
`)
  return { base, repo, planning: path.join(ops, 'planning') }
}

module.exports = { mount, git }
