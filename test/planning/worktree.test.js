'use strict'

// Dónde trabaja cada agente. Lo que se comprueba no es que `git worktree` funcione —eso es de git— sino
// que el comando resuelva el repositorio correcto desde el `service:` de la tarea, no monte sobre lo de
// otro, y entregue el id de runner hecho, que es el dato cuyo olvido deja a dos agentes indistinguibles.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// Una instancia sidecar con un repositorio al lado, que es el montaje que la guía recomienda para varios
// agentes: `ops/` una sola vez y los árboles de trabajo aparte.
function montar(nombre) {
  const base = tempRoot(nombre)
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
  fs.cpSync(MOLDE, path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({
    project: 'demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '../producto' }],
  }, null, 2))
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primero

- [ ] **alta** [lite] — Alta. _Aceptación: rechaza duplicado._ (service: api)
`)
  return { base, repo, planning: path.join(ops, 'planning') }
}

function como(runner, fn) {
  const previo = process.env.CAUCE_RUNNER
  process.env.CAUCE_RUNNER = runner
  try { return fn() } finally {
    if (previo === undefined) delete process.env.CAUCE_RUNNER
    else process.env.CAUCE_RUNNER = previo
  }
}

test('prepara un árbol por tarea sin clonar, y entrega el id del runner', () => {
  const { repo, planning } = montar('cauce-wt-')
  const hecho = como('/w/otro', () => run(['worktree', planning, 'alta']))
  assert.equal(hecho.status, 0, hecho.stderr)

  const arbol = `${repo}-alta`
  assert.ok(fs.existsSync(path.join(arbol, 'api', 'main.go')), 'el árbol trae los archivos')
  // Lo que separa un worktree de un clon: no hay un segundo `.git` con su propia historia, hay un
  // puntero al del repositorio original.
  assert.equal(fs.statSync(path.join(arbol, '.git')).isFile(), true, '.git es un puntero, no un repo')
  assert.equal(git(arbol, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'task/alta')
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'main',
    'y el árbol original no cambió de rama, que es lo que pisaría al otro agente')

  assert.match(hecho.stdout, new RegExp(`export CAUCE_RUNNER=${arbol}`))

  // Repetir no rompe ni crea un segundo árbol: devuelve el que ya existe para esa rama.
  const otra = como('/w/otro', () => run(['worktree', planning, 'alta']))
  assert.equal(otra.status, 0, otra.stderr)
  assert.match(otra.stdout, /^=/)
  const listados = git(repo, 'worktree', 'list').stdout.trim().split('\n')
  assert.equal(listados.length, 2, `un árbol principal y uno de la tarea: ${listados.join(' | ')}`)
})

test('vuelve a montar sobre la rama que quedó, y lo dice en JSON para un workflow', () => {
  const { repo, planning } = montar('cauce-wt-rehacer-')
  assert.equal(como('/w/uno', () => run(['worktree', planning, 'alta'])).status, 0)
  const arbol = `${repo}-alta`
  // Sacar el árbol no borra la rama, y ahí está el trabajo: rehacerlo tiene que retomar esa rama y no
  // empezar una nueva, o lo hecho queda huérfano sin que nada lo diga.
  git(repo, 'worktree', 'remove', arbol)
  assert.equal(fs.existsSync(arbol), false)

  const otra = como('/w/uno', () => run(['worktree', planning, 'alta', '--json']))
  assert.equal(otra.status, 0, otra.stderr)
  const json = JSON.parse(otra.stdout)
  assert.deepEqual(
    { branch: json.branch, path: json.path, runner: json.runner, reused: json.reused },
    { branch: 'task/alta', path: arbol, runner: arbol, reused: false },
  )
  assert.equal(git(arbol, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'task/alta')
})

test('no prepara un árbol para la tarea que tomó otro', () => {
  const { planning } = montar('cauce-wt-ajeno-')
  const tomada = como('/w/ana', () => run(['claim', planning, 'alta']))
  assert.equal(tomada.status, 0, tomada.stderr)

  const ajeno = como('/w/luis', () => run(['worktree', planning, 'alta']))
  assert.equal(ajeno.status, 1)
  assert.match(ajeno.stderr, /la tomó/)
})

test('sin repositorio para el servicio, lo dice en vez de adivinar', () => {
  const { planning } = montar('cauce-wt-sin-repo-')
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito uno — Primero

- [ ] **alta** [lite] — Alta. _Aceptación: x._ (service: no-existe)
`)
  const roto = como('/w/uno', () => run(['worktree', planning, 'alta']))
  assert.equal(roto.status, 2)
  assert.match(roto.stderr, /no encontré el repositorio/)
})
