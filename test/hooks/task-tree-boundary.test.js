'use strict'

// El árbol de una tarea es escribible aunque caiga fuera de las raíces (caso 360). Se mide con repositorios
// y árboles de verdad, y junto a lo que tiene que seguir cerrado: todo lo que no es la carpeta de una tarea
// reclamada, en el lugar donde `ops worktree` la arma, registrada en el repositorio de algo declarado.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { execute } = require('../../engine/hooks/run')
const { taskTrees } = require('../../engine/core/task-trees')

// Una instancia con una raíz por repositorio: `api` es el repositorio y la raíz, al lado de la instancia.
function instance(prefix, rootPath = '../api') {
  const base = fs.realpathSync(tempRoot(prefix))
  const root = path.join(base, 'ops')
  const api = path.join(base, 'api')
  fs.mkdirSync(path.join(root, 'planning', 'claims'), { recursive: true })
  fs.mkdirSync(path.join(api, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'api', path: rootPath }] }))
  const git = (cwd, ...args) => {
    const out = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { encoding: 'utf8' })
    assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
  }
  git(api, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(api, 'src', 'a.js'), 'module.exports = 1\n')
  git(api, 'add', 'src/a.js')
  git(api, 'commit', '-qm', 'base')
  const writes = (file, cwd = root) => {
    execute('workspace-boundary', { cwd, tool_input: { file_path: file } })
    execute('shell-boundary', { cwd, tool_input: { command: `echo x > ${file}` } })
  }
  // Sólo por la herramienta de archivos: las pruebas viven en el temporal del sistema, que para un comando
  // es destino corriente y nunca se frena. Las dos leen la misma lista, y eso lo fija `boundaries.test.js`.
  const refused = (file, cwd = root) => blocked('workspace-boundary', { cwd, tool_input: { file_path: file } },
    /fuera de las raíces/)
  const claim = (slug, at = root) => fs.writeFileSync(path.join(at, 'planning', 'claims', `${slug}.md`),
    `---\ntask: ${slug}\nowner: t@t\nrunner: /w/uno\nstarted: 2026-10-09\n---\n`)
  const release = (slug) => fs.unlinkSync(path.join(root, 'planning', 'claims', `${slug}.md`))
  return { base, root, api, git, writes, refused, claim, release }
}

test('el árbol de una tarea reclamada se puede escribir aunque quede al lado de su raíz', () => {
  const { base, api, git, writes, refused, claim, release } = instance('ops-hook-task-tree-')
  const tree = path.join(base, 'api-t-uno')
  // Las tres cosas hacen falta: el reclamo solo no alcanza, y el árbol solo tampoco.
  claim('t-uno')
  refused(path.join(tree, 'a.js'))
  release('t-uno')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', tree)
  refused(path.join(tree, 'a.js'))
  claim('t-uno')
  assert.doesNotThrow(() => writes(path.join(tree, 'a.js')), 'por las dos herramientas')
  assert.doesNotThrow(() => writes(path.join(tree, 'src', 'nuevo.js')))
  // La rama no decide nada: el recorrido la renombra al commitear, y un rebase la deja sin nombre.
  git(tree, 'branch', '-m', 'feat/t-uno')
  assert.doesNotThrow(() => writes(path.join(tree, 'a.js')))
  git(tree, 'checkout', '-q', '--detach')
  assert.doesNotThrow(() => writes(path.join(tree, 'a.js')))

  // Movido con git a otro lado, deja de estar donde se arma: cerrado, allá y acá.
  const elsewhere = path.join(base, 'en-otro-lado')
  git(api, 'worktree', 'move', tree, elsewhere)
  refused(path.join(elsewhere, 'a.js'))
  refused(path.join(tree, 'a.js'))
  // Una carpeta que aparezca en su lugar no es el árbol, ni con un `.git` que apunte a la entrada.
  fs.mkdirSync(tree)
  fs.writeFileSync(path.join(tree, '.git'), fs.readFileSync(path.join(elsewhere, '.git')))
  refused(path.join(tree, 'a.js'))
  fs.unlinkSync(path.join(tree, '.git'))
  fs.rmdirSync(tree)
  git(api, 'worktree', 'move', elsewhere, tree)
  assert.doesNotThrow(() => writes(path.join(tree, 'a.js')), 'de vuelta en su lugar, vuelve a serlo')

  // Al soltarse la tarea se cierra solo, con el árbol todavía ahí.
  release('t-uno')
  refused(path.join(tree, 'a.js'))
})

// Que git lo tenga registrado no alcanza, y un reclamo tampoco lo abre en cualquier lado.
test('lo que no está donde se arma el árbol de una tarea sigue cerrado', () => {
  const { base, api, git, refused, claim } = instance('ops-hook-task-tree-ajeno-')
  claim('suelta')
  claim('auth')
  const own = path.join(base, 'en-cualquier-lado')
  git(api, 'worktree', 'add', '-q', '-b', 'task/suelta', own)
  refused(path.join(own, 'a.js'))

  // En el lugar justo, pero árbol de otro repositorio: no es de nada que el proyecto haya declarado.
  const other = path.join(base, 'otro')
  fs.mkdirSync(other)
  git(other, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(other, 'a.js'), 'x\n')
  git(other, 'add', 'a.js')
  git(other, 'commit', '-qm', 'base')
  git(other, 'worktree', 'add', '-q', '-b', 'task/auth', path.join(base, 'api-auth'))
  refused(path.join(base, 'api-auth', 'a.js'))

  // Y el del repositorio de otro, en su propio lugar, tampoco.
  claim('t-dos')
  git(other, 'worktree', 'add', '-q', '-b', 'task/t-dos', path.join(base, 'otro-t-dos'))
  refused(path.join(base, 'otro-t-dos', 'a.js'))
})

// El lugar justo no alcanza si es un enlace: lo que se abre es la carpeta, no adonde lleve.
test('un enlace puesto donde va el árbol no abre adonde lleva', () => {
  const { base, api, git, refused, claim } = instance('ops-hook-task-tree-enlazado-')
  const far = path.join(base, 'lejos', 'cualquiera')
  fs.mkdirSync(path.dirname(far))
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', far)
  claim('t-uno')
  fs.symlinkSync(far, path.join(base, 'api-t-uno'), 'dir')
  refused(path.join(base, 'api-t-uno', 'a.js'))
  refused(path.join(far, 'a.js'))
})

// En la carpeta de una línea el producto es un enlace al repositorio original, o a una carpeta suya. El
// árbol se arma donde lo arma `ops worktree`: al lado del enlace si lleva al repositorio, y al lado del
// repositorio de verdad si lleva más adentro.
test('con la raíz enlazada al repositorio, o a una carpeta suya, se abre el árbol que ops worktree arma', () => {
  const { base, root, api, git, writes, refused, claim } = instance('ops-hook-task-tree-raiz-enlazada-')
  const home = path.join(base, 'linea')
  fs.mkdirSync(home)
  fs.symlinkSync(api, path.join(home, 'api'), 'dir')
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'api', path: '../linea/api' }] }))
  claim('t-uno')
  const beside = path.join(home, 'api-t-uno')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', beside)
  assert.doesNotThrow(() => writes(path.join(beside, 'src', 'a.js')))

  fs.unlinkSync(path.join(home, 'api'))
  fs.symlinkSync(path.join(api, 'src'), path.join(home, 'api'), 'dir')
  claim('t-dos')
  const real = path.join(base, 'api-t-dos')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-dos', real)
  assert.doesNotThrow(() => writes(path.join(real, 'src', 'a.js')))
  refused(path.join(real, 'README.md'))
})

// Con la raíz en una carpeta del repositorio, en el árbol principal sólo esa carpeta es escribible. En el
// árbol de la tarea vale lo mismo: la misma carpeta, no el árbol entero.
test('el árbol de una tarea abre lo mismo que su raíz, no más', () => {
  const { base, api, git, writes, refused, claim } = instance('ops-hook-task-tree-carpeta-', '../api/src')
  const tree = path.join(base, 'api-t-uno')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', tree)
  claim('t-uno')
  assert.doesNotThrow(() => writes(path.join(tree, 'src', 'a.js')))
  refused(path.join(tree, 'README.md'))
  refused(path.join(tree, '.github', 'workflows', 'ci.yml'))
})

// En una instancia embebida la instancia entera es escribible en el árbol principal, aunque la raíz de
// código sea una carpeta. En el árbol de la tarea tiene que valer lo mismo: ni más, ni menos.
test('en una instancia embebida, el árbol de la tarea abre también lo que abre la instancia', () => {
  const base = fs.realpathSync(tempRoot('ops-hook-task-tree-embebida-'))
  const repo = path.join(base, 'producto')
  fs.mkdirSync(path.join(repo, 'planning', 'claims'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'src'))
  fs.writeFileSync(path.join(repo, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'src', path: 'src' }] }))
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'x\n')
  fs.writeFileSync(path.join(repo, 'planning', 'claims', 't-uno.md'), '---\ntask: t-uno\n---\n')
  const git = (cwd, ...args) => assert.equal(spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c',
    'user.email=t@t', ...args], { encoding: 'utf8' }).status, 0, args.join(' '))
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', 'ops.config.json', 'src/a.js')
  git(repo, 'commit', '-qm', 'base')
  const tree = path.join(base, 'producto-t-uno')
  git(repo, 'worktree', 'add', '-q', '-b', 'task/t-uno', tree)
  const write = (file) => execute('workspace-boundary', { cwd: repo, tool_input: { file_path: file } })
  assert.doesNotThrow(() => write(path.join(repo, 'package.json')), 'la precondición: en el principal se puede')
  assert.doesNotThrow(() => write(path.join(tree, 'package.json')))
  assert.doesNotThrow(() => write(path.join(tree, 'src', 'a.js')))
})

// En una línea embebida la raíz declarada es ella misma un árbol del repositorio: su `.git` es un archivo, y
// el registro vive en el repositorio del que salió. El árbol de la tarea se arma al lado del de la línea.
test('desde una raíz que ya es un árbol, se abren los árboles de tarea de su repositorio', () => {
  const { base, root, api, git, writes, refused, claim } = instance('ops-hook-task-tree-linea-')
  const line = path.join(base, 'api-linea')
  git(api, 'worktree', 'add', '-q', '-b', 'line/auth', line)
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'api', path: '../api-linea/src' }] }))
  claim('t-tres')
  const tree = path.join(base, 'api-linea-t-tres')
  refused(path.join(tree, 'src', 'a.js'))
  git(line, 'worktree', 'add', '-q', '-b', 'task/t-tres', tree)
  assert.doesNotThrow(() => writes(path.join(tree, 'src', 'a.js')))
  refused(path.join(tree, 'otra', 'a.js'))
  // El árbol de la línea no es el de una tarea, aunque haya una tarea que se llame como ella.
  claim('linea')
  refused(path.join(line, 'README.md'))
})

// La carpeta de una línea embebida se llama `<repositorio>-<línea>` y es un árbol del mismo repositorio: el
// lugar y el registro coinciden con los de una tarea. Una tarea que se llame como una línea no la abre, esté
// la línea en la rama que esté.
test('la carpeta de una línea no se abre por una tarea que se llame igual', () => {
  const { base, api, git, refused, claim } = instance('ops-hook-task-tree-homonima-')
  const line = path.join(base, 'api-pagos')
  git(api, 'worktree', 'add', '-q', '-b', 'line/pagos', line)
  claim('pagos')
  refused(path.join(line, 'src', 'a.js'))
  git(line, 'checkout', '-q', '--detach')
  refused(path.join(line, 'src', 'a.js'))
  // Con las ramas empaquetadas, igual.
  git(api, 'pack-refs', '--all')
  refused(path.join(line, 'src', 'a.js'))
})

// Con `worktree.useRelativePaths` git escribe el registro relativo a la entrada, no a donde corre el guard.
test('un registro con rutas relativas se lee igual', () => {
  const { base, api, git, writes, claim } = instance('ops-hook-task-tree-relativo-')
  const tree = path.join(base, 'api-t-uno')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', tree)
  claim('t-uno')
  const entry = path.join(api, '.git', 'worktrees', 'api-t-uno')
  fs.writeFileSync(path.join(entry, 'gitdir'), `${path.relative(entry, path.join(tree, '.git'))}\n`)
  fs.writeFileSync(path.join(tree, '.git'), `gitdir: ${path.relative(tree, entry)}\n`)
  assert.doesNotThrow(() => writes(path.join(tree, 'a.js')))
})

// La sesión escribe por el enlace y git anota la ruta real: por qué eso importa lo dice `task-trees.js`.
test('con la carpeta de trabajo detrás de un enlace, el árbol se abre por donde la sesión lo ve', () => {
  const { base, git, api, claim } = instance('ops-hook-task-tree-enlace-')
  const alias = `${base}-alias`
  fs.symlinkSync(base, alias, 'dir')
  const seen = path.join(alias, 'ops')
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', path.join(base, 'api-t-uno'))
  claim('t-uno')
  const write = (file) => execute('workspace-boundary', { cwd: seen, tool_input: { file_path: file } })
  assert.doesNotThrow(() => write(path.join(alias, 'api', 'src', 'b.js')), 'la precondición: la raíz se puede')
  assert.doesNotThrow(() => write(path.join(alias, 'api-t-uno', 'src', 'b.js')))
  // Y por la ruta real, que es la que `ops worktree` imprime: git no conoce el enlace.
  assert.doesNotThrow(() => write(path.join(base, 'api-t-uno', 'src', 'b.js')))
  fs.unlinkSync(alias)
})

// Sin repositorio o sin reclamos no hay árboles que abrir, y no rompe nada.
test('una raíz sin repositorio, o un planning sin reclamos, no abren nada', () => {
  const { base, root, api, git, claim } = instance('ops-hook-task-tree-sin-git-')
  fs.mkdirSync(path.join(base, 'suelta'))
  claim('x')
  assert.deepEqual(taskTrees(path.join(root, 'planning'), [path.join(base, 'suelta'), path.join(base, 'no')]), [])
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', path.join(base, 'api-t-uno'))
  assert.deepEqual(taskTrees(path.join(base, 'sin-planning'), [api]), [])
  assert.deepEqual(taskTrees(path.join(root, 'planning'), [api]), [], 'el reclamo es de otra tarea')
})

// El árbol de la tarea es donde se construye, así que lo que cuida una prueba en la raíz la cuida ahí.
test('borrar por shell una prueba commiteada del árbol de una tarea se frena igual que en la raíz', () => {
  const { base, root, api, git, claim } = instance('ops-hook-task-tree-prueba-')
  fs.mkdirSync(path.join(api, 'test'))
  fs.writeFileSync(path.join(api, 'test', 'a.test.js'), 'x\n')
  git(api, 'add', 'test/a.test.js')
  git(api, 'commit', '-qm', 'prueba')
  const tree = path.join(base, 'api-t-uno')
  const remove = { cwd: root, tool_input: { command: `rm ${path.join(tree, 'test', 'a.test.js')}` } }
  git(api, 'worktree', 'add', '-q', '-b', 'task/t-uno', tree)
  assert.doesNotThrow(() => execute('test-evidence-shell', remove), 'sin reclamo no es del proyecto')
  claim('t-uno')
  blocked('test-evidence-shell', remove, /borra .*que es una prueba/)
  blocked('test-evidence-shell', { cwd: root, tool_input: { command: `rm ${api}/test/a.test.js` } },
    /borra .*que es una prueba/)
})
