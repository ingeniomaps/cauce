'use strict'

// Una redirección no termina el comando: `2>&1`, `&> log` y `>| log` son parte de él, y el shell la admite en
// cualquier lugar, también entre `git` y su subcomando (caso 526).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempRoot } = require('../support/environment')
const { blocked, publishedRepo } = require('../support/hooks-harness')
const { execute } = require('../../engine/hooks/run')
const I = require('../../engine/hooks/input')

function bench(allowPush) {
  const root = tempRoot('ops-redirect-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '.' }], runner: { allowPush },
  }))
  return (command, cwd = root) => ({ cwd, tool_input: { command } })
}

test('la bandera que reescribe historia se ve detrás de una redirección', () => {
  const at = bench(true)
  const published = publishedRepo('ops-redirect-amend-')
  for (const command of [
    'git push origin rama 2>&1 --force', 'git push origin rama &> log -f', 'git push origin rama >| log +rama',
    'git 2>&1 push --force origin rama', 'git > log push -f origin rama', 'git 2>&1 -C . push --force origin rama',
    'git >& log push -f origin rama', 'git &>log push -f origin rama', 'git >|log push -f origin rama',
    'git 1>|log push -f origin rama',
  ]) {
    blocked('destructive', at(command), /reescribe historia ya publicada/)
  }
  for (const command of [
    'git commit -m x 2>&1 --amend', 'git commit -m x &> log --amend', 'git commit -m x >| log --amend',
    'git 2>&1 commit --amend -m x', 'git 2> /dev/null commit --amend -m x',
  ]) {
    blocked('destructive', at(command, published), /--amend' sobre un commit ya publicado/)
  }
})

test('las reglas que leen un subcomando lo ven detrás de una redirección', () => {
  const at = bench(true)
  for (const command of ['git clean 2>&1 -fd', 'git 2>&1 clean -fd', 'git 2>&1 checkout -- .']) {
    assert.throws(() => execute('destructive', at(command)), /borra|revierte/, command)
  }
})

// Sin esto, `git 2>&1 push` no era un push para ninguna regla: publicaba sin aprobación, con `allowPush` apagado.
test('un push con una redirección antes del subcomando pide la aprobación de cualquier push', () => {
  const at = bench(false)
  for (const command of ['git 2>&1 push origin rama', 'git > log push origin rama', 'git 2>&- push origin rama']) {
    blocked('destructive', at(command), /requiere una acción/)
  }
})

// Lo que sigue a un separador real es otro comando, y una redirección sola no frena nada.
test('el separador sigue cortando y la redirección sola deja pasar', () => {
  const at = bench(true)
  const published = publishedRepo('ops-redirect-pasa-')
  for (const command of ['git push origin rama 2>&1', 'git 2>&1 push origin rama', 'git push origin rama | tee -f']) {
    assert.doesNotThrow(() => execute('destructive', at(command)), command)
  }
  for (const command of [
    'git 2>&1 status', 'git commit -m x 2>&1', 'git commit -m x 2>&1 | grep --amend', 'git commit -m x & echo --amend',
  ]) {
    assert.doesNotThrow(() => execute('destructive', at(command, published)), command)
  }
})

test('la redirección entre git y su subcomando queda a la vista, delante', () => {
  const clean = I.withoutGitGlobals
  assert.equal(clean('git 2>&1 push -f origin main'), '2>&1 ; git push -f origin main')
  assert.equal(clean('git > /dev/sda push'), '> /dev/sda ; git push')
  assert.equal(clean('git 2>/dev/null -C /r commit -m x'), '2>/dev/null ; git commit -m x')
  assert.equal(clean('git push origin main 2>&1'), 'git push origin main 2>&1')
  assert.equal(clean('git <<EOF push'), 'git <<EOF push')
  assert.equal(clean('git > ; ls'), 'git > ; ls')
  assert.equal(clean('rm -rf .git 2>/dev/null'), 'rm -rf .git 2>/dev/null')
  assert.equal(clean('echo git > x'), 'echo git > x')
  assert.equal(I.gitDirectory('git 2>&1 -C /r commit -m x', '/sesion'), '/r')
  assert.equal(I.gitDirectory('git 2>/dev/null status; git -C /otro push origin x', '/sesion'), '/otro')
})

test('la redirección detrás de un git que es argumento no esconde el resto del comando', () => {
  for (const command of ['rm -rf git 2>/dev/null ~', 'rm -rf build.git 2>/dev/null ~']) {
    blocked('destructive', { cwd: '/tmp', tool_input: { command } }, /carpeta personal/)
  }
})

// Leer una redirección de dos formas volvía exponencial cada regla que no matchea.
test('leer lo que sigue a una redirección cuesta lineal', () => {
  const started = Date.now()
  for (const form of [' >&11', '>&1-', ' &>>', ' 2>&1', ' >|x', ' >&>', ' <&>', '<&>&>']) {
    const command = `git push origin rama${form.repeat(40)} ;`
    assert.throws(() => execute('destructive', { cwd: '/tmp', tool_input: { command } }), /BLOQUEADO|publica/)
  }
  const spent = Date.now() - started
  assert.ok(spent < 3000, `tardó ${spent} ms`)
})
