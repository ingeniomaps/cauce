'use strict'

// Caso 530: lo que imprime la URL de un remoto frena si esa URL trae una credencial, y nada más. El mensaje nombra el
// remoto y da el comando que la saca, sin mostrarla; `check` lo avisa aunque nadie teclee el comando.

const { blocked, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')
const { run: cli, tempRoot } = require('../support/environment')
const path = require('node:path')
const RC = require('../../engine/core/remote-credentials')

const TOKEN = 'ghp_FALSO0000000000000000000000000000000'
const run = (cwd, command) => ({ cwd, tool_input: { command } })
const SHOWS = /imprime la URL del remoto origin .*lleva una credencial/
function repo(prefix, url) {
  const root = pushRoot(prefix)
  execFileSync('git', ['-C', root, 'init', '-q'])
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', url])
  return root
}

test('lo que imprime la URL de un remoto con credencial frena, sin mostrarla', () => {
  const root = repo('cauce-remoto-', `https://usuario:${TOKEN}@github.com/acme/app.git`)
  for (const command of ['git remote -v', 'git remote --verbose', 'git remote show origin', 'git remote get-url origin',
    'git config --get remote.origin.url', 'git config --get-regexp remote', 'git config -l', 'git config --list',
    `git -C ${root} remote -v`, 'git ls-remote --get-url', 'cat .git/config', 'grep url .git/config',
    'git status && git remote -v', 'git --no-pager remote -v', 'git remote -vv', 'bash -c "git remote -v"',
    "sh -c 'git remote get-url origin'", 'git config get remote.origin.url', '/usr/bin/git remote -v',
  ]) blocked('secrets-shell', run(root, command), SHOWS)
  const clean = repo('cauce-remoto-vecino-', 'https://github.com/acme/vecino.git')
  blocked('secrets-shell', run(clean, `cat ${root}/.git/config`), SHOWS)
  // Las opciones globales se recorren sin retroceso: con muchas, el guard no se cuelga.
  const started = Date.now()
  assert.doesNotThrow(() => execute('secrets-shell', run(clean, `git${' -C -C'.repeat(22)} remote add x y`)))
  assert.ok(Date.now() - started < 2000, `tardó ${Date.now() - started} ms`)
  // Desde otra carpeta, el repositorio es el que nombra el `-C`.
  const elsewhere = pushRoot('cauce-remoto-otra-')
  blocked('secrets-shell', run(elsewhere, `git -C ${root} remote -v`), SHOWS)
  assert.doesNotThrow(() => execute('secrets-shell', run(elsewhere, 'git remote -v')))
  const message = messageOf('secrets-shell', run(root, 'git remote -v'))
  assert.doesNotMatch(message, new RegExp(TOKEN), 'el mensaje no muestra la credencial')
  assert.match(message, /git -C .* remote set-url origin https:\/\/github\.com\/acme\/app\.git/)
})

test('un remoto sin credencial se lee como siempre, y lo que no imprime URLs pasa', () => {
  const clean = ['https://github.com/acme/app.git', 'git@github.com:acme/app.git', 'https://ana@github.com/acme/a']
  for (const url of clean) {
    const root = repo('cauce-remoto-limpio-', url)
    for (const command of ['git remote -v', 'git remote get-url origin', 'cat .git/config', 'git config -l']) {
      assert.doesNotThrow(() => execute('secrets-shell', run(root, command)), `${url}: ${command}`)
    }
  }
  const root = repo('cauce-remoto-nombres-', `https://usuario:${TOKEN}@github.com/acme/app.git`)
  for (const command of ['git remote', 'git status', 'git log --oneline -1', 'git config user.name',
    'git remote add up https://github.com/x/y.git && npm test -- --verbose', 'git remote rename origin up; ls -v']) {
    assert.doesNotThrow(() => execute('secrets-shell', run(root, command)), command)
  }
})

test('qué es una credencial en la URL: usuario y clave, o un token suelto; un usuario solo no lo es', () => {
  for (const url of [`https://u:${TOKEN}@github.com/a/b`, `https://${TOKEN}@github.com/a/b`,
    'https://x-access-token:abc@github.com/a/b', 'https://oauth2:glpat-xyz@gitlab.com/a/b']) {
    assert.ok(RC.credentialed(url), url)
  }
  for (const url of ['https://github.com/a/b', 'https://ana@github.com/a/b', 'git@github.com:a/b.git',
    'ssh://git@host:22/a/b']) {
    assert.ok(!RC.credentialed(url), url)
  }
  assert.equal(RC.stripped(`https://u:${TOKEN}@github.com/a/b.git`), 'https://github.com/a/b.git')
  assert.equal(RC.stripped('https://u:CLAVE@PARTE@github.com/a/b'), 'https://github.com/a/b', 'nada de la clave queda')
})

test('una pushurl con credencial cuenta igual, y el arreglo la nombra', () => {
  const root = repo('cauce-remoto-push-', 'https://github.com/acme/app.git')
  execFileSync('git', ['-C', root, 'remote', 'set-url', '--push', 'origin', `https://u:${TOKEN}@github.com/acme/app`])
  blocked('secrets-shell', run(root, 'git remote -v'), SHOWS)
  assert.match(messageOf('secrets-shell', run(root, 'git remote -v')), /remote set-url --push origin/)
})

test('se aprueba con la línea en .ops-approval, y check lo avisa sin mostrarla', () => {
  const root = repo('cauce-remoto-salida-', `https://usuario:${TOKEN}@github.com/acme/app.git`)
  pasteApproval(root, messageOf('secrets-shell', run(root, 'git remote -v')))
  assert.doesNotThrow(() => execute('secrets-shell', run(root, 'git remote -v')))
  // Por el comando `check`, sobre una instancia de verdad.
  const ops = path.join(tempRoot('cauce-remoto-check-'), 'ops')
  assert.equal(cli(['init', ops, '--name', 'Remoto', '--no-install']).status, 0)
  execFileSync('git', ['-C', ops, 'init', '-q'])
  execFileSync('git', ['-C', ops, 'remote', 'add', 'origin', `https://usuario:${TOKEN}@github.com/acme/ops.git`])
  const checked = cli(['check', path.join(ops, 'planning')])
  assert.match(checked.stdout + checked.stderr, /ops: el remoto origin lleva una credencial en la URL/)
  assert.doesNotMatch(checked.stdout + checked.stderr, new RegExp(TOKEN))
  const warnings = RC.remoteWarnings(root)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /el remoto origin lleva una credencial en la URL/)
  assert.doesNotMatch(warnings[0], new RegExp(TOKEN))
  execFileSync('git', ['-C', root, 'remote', 'set-url', 'origin', 'https://github.com/acme/app.git'])
  assert.deepEqual(RC.remoteWarnings(root), [])
})

// El comando que se imprime se pega tal cual: una ruta con un espacio lo partía en dos palabras.
test('el arreglo que se imprime lleva entre comillas una carpeta con espacios', () => {
  const fix = RC.fixOf('/tmp/Mis Proyectos/app', { key: 'url', name: 'origin', url: 'https://github.com/acme/app.git' })
  assert.equal(fix, "git -C '/tmp/Mis Proyectos/app' remote set-url origin https://github.com/acme/app.git")
})
