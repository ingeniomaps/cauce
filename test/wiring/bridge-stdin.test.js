'use strict'

// Cómo termina el puente de Antigravity según lo que tenga en stdin (caso 198). Es el mismo contrato que
// el motor cumple desde el caso 190 —`test/hooks/stdin.test.js`—, medido acá sobre el puente porque el
// puente leía por su cuenta: se colgaba con stdin abierto y convertía un JSON ilegible en `allow`.
//
// Se lanza el puente como proceso, igual que lo lanza `agy`: lo que se cuida es qué escribe y que
// termine. Cada hijo tiene su tope y se mata al final pase lo que pase.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { tempRoot } = require('../support/environment')

const { FIRST_BYTE_MS } = require('../../engine/hooks/input')

const REPO = path.resolve(__dirname, '..', '..')
const BRIDGE = path.join(REPO, 'automatization', 'runners', 'antigravity', 'hook.js')
const LIMIT = FIRST_BYTE_MS + 6000

// Sin las variables que fijan la raíz desde afuera: el puente la resuelve desde el `Cwd` del payload, que
// acá es este repositorio —una raíz de toolkit—, como en la reproducción del caso.
const env = { ...process.env }
delete env.NODE_TEST_CONTEXT
delete env.OPS_ROOT
delete env.CLAUDE_PROJECT_DIR

const shell = (command) => JSON.stringify({ toolCall: { args: { CommandLine: command, Cwd: REPO } } })
const FORCED = shell('git push --force origin main')

function launch(command, args, { stdio = 'pipe', feed, detached = false } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(command, args, { cwd: REPO, env, stdio: [stdio, 'pipe', 'pipe'], detached })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    let killed = false
    const kill = () => {
      try { detached ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL') } catch { /* ya terminó */ }
    }
    const timer = setTimeout(() => { killed = true; kill() }, LIMIT)
    child.on('close', (status) => {
      clearTimeout(timer)
      if (detached) kill()
      let answer = null
      try { answer = JSON.parse(stdout.trim()) } catch { /* sin respuesta legible: la aserción lo dice */ }
      resolve({ status, stdout, stderr, answer, killed, elapsed: Date.now() - started })
    })
    if (feed) feed(child.stdin)
  })
}

const bridge = (event, options) => launch(process.execPath, [BRIDGE, event], options)

test('el puente con stdin abierto termina negando', { concurrency: true }, async (t) => {
  t.test('socket que nadie cierra', async () => {
    let stdin
    const result = await bridge('pre-shell', { feed: (s) => { stdin = s } })
    stdin.destroy()
    assert.equal(result.killed, false, `el puente no terminó solo en ${LIMIT} ms`)
    assert.equal(result.answer && result.answer.decision, 'deny', result.stdout + result.stderr)
    assert.match(result.answer.reason, /no llegó nada por stdin/)
    assert.match(result.answer.reason, /hook\.js pre-shell/, 'dice cómo invocar el puente a mano')
  })

  t.test('pipe que nadie cierra', async () => {
    const script = `exec "${process.execPath}" "${BRIDGE}" pre-shell < <(exec sleep 60 2>/dev/null)`
    const result = await launch('bash', ['-c', script], { stdio: 'ignore', detached: true })
    assert.equal(result.killed, false, `el puente no terminó solo en ${LIMIT} ms`)
    assert.equal(result.answer && result.answer.decision, 'deny', result.stdout + result.stderr)
    assert.match(result.answer.reason, /no llegó nada por stdin/)
  })
})

// C y D de la reproducción: el mismo comando, entero y sin la última llave. Con el JSON entero el guard lo
// niega; sin la llave el puente decía `allow`, que es un `push --force` a `main` pasando por una llave.
test('el puente no autoriza lo que no puede leer', { concurrency: true }, async (t) => {
  t.test('JSON válido de un push forzado: niega el guard', async () => {
    const result = await bridge('pre-shell', { feed: (s) => s.end(FORCED) })
    assert.equal(result.answer && result.answer.decision, 'deny', result.stdout + result.stderr)
    assert.match(result.answer.reason, /push --force/)
  })

  t.test('el mismo JSON sin la última llave: niega el puente', async () => {
    const result = await bridge('pre-shell', { feed: (s) => s.end(FORCED.slice(0, -1)) })
    assert.equal(result.answer && result.answer.decision, 'deny', result.stdout + result.stderr)
    assert.match(result.answer.reason, /no es JSON válido/)
  })

  t.test('JSON ilegible en pre-files', async () => {
    const result = await bridge('pre-files', { feed: (s) => s.end('{"toolCall":{"args":{"TargetFile":".env"}') })
    assert.equal(result.answer && result.answer.decision, 'deny', result.stdout + result.stderr)
    assert.match(result.answer.reason, /no es JSON válido/)
  })

  // En `stop` no hay `deny`: el puente elige entre retener al agente y dejarlo cerrar. Una entrada que no
  // se lee es una falla del puente y no un guard que bloquea, así que deja cerrar —como cuando no encuentra
  // la raíz— pero con la razón a la vista, que antes no aparecía.
  t.test('JSON ilegible en stop', async () => {
    const result = await bridge('stop', { feed: (s) => s.end('{roto') })
    assert.equal(result.answer && result.answer.decision, 'stop', result.stdout + result.stderr)
    assert.match(result.answer.reason || '', /no es JSON válido/)
  })
})

test('el puente con stdin que termina juzga como siempre', { concurrency: true }, async (t) => {
  t.test('JSON válido inocuo', async () => {
    const result = await bridge('pre-shell', { feed: (s) => s.end(shell('git status --short')) })
    assert.deepEqual(result.answer, { decision: 'allow' }, result.stdout + result.stderr)
  })

  // Sin entrada no hay llamada que juzgar: los guards caen a las variables de entorno, igual que en el
  // motor, y no esperan el plazo.
  t.test('/dev/null', async () => {
    const result = await bridge('pre-shell', { stdio: fs.openSync('/dev/null', 'r') })
    assert.deepEqual(result.answer, { decision: 'allow' }, result.stdout + result.stderr)
    assert.ok(result.elapsed < FIRST_BYTE_MS, `/dev/null no espera el plazo: tardó ${result.elapsed} ms`)
  })

  t.test('stdin cerrado', async () => {
    const result = await launch('bash', ['-c', `exec "${process.execPath}" "${BRIDGE}" pre-shell <&-`],
      { stdio: 'ignore' })
    assert.deepEqual(result.answer, { decision: 'allow' }, result.stdout + result.stderr)
  })
})

// La raíz declarada es la primera candidata y no la única: si el proyecto se movió o quedó un placeholder,
// el lector se busca desde donde corre el puente, como la raíz de los guards (caso 198). Sin ninguna de
// las dos lo dice nombrando el archivo que buscó, en vez del error genérico de `require`. El cwd se fija en
// un proceso aparte porque es lo que decide.
test('el puente busca con qué leer también desde donde corre, y si no lo encuentra lo dice', () => {
  const nowhere = tempRoot('cauce-bridge-without-root-')
  const markers = JSON.stringify(
    { dir: '{{OPS_DIR}}', root: path.join(nowhere, 'x'), plugin: path.join(nowhere, 'a', 'b', 'c') })
  const probe = (cwd) => spawnSync(process.execPath, ['-e', `const { inputReader } = require(${JSON.stringify(BRIDGE)})
    try { console.log(typeof inputReader(${markers}).readInput) } catch (error) { console.log(error.message) }`],
  { cwd, encoding: 'utf8' }).stdout.trim()
  assert.match(probe(nowhere), /No se encontró engine\/hooks\/input\.js/)
  assert.equal(probe(REPO), 'function', 'desde adentro de un proyecto, lo encuentra aunque la raíz declarada no exista')
})
