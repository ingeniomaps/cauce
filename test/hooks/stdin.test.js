'use strict'

// Cómo termina un guard según lo que tenga en stdin (caso 190). Invocado a mano, stdin es lo que haya
// heredado, y un pipe, un socket o una terminal que nadie cierra dejaban al proceso dormido hasta que el
// otro extremo se cerrara: horas, en la corrida que lo encontró. Estas pruebas lanzan el runner de verdad,
// porque lo que se cuida es que el proceso termine, y eso no se ve llamando a una función.
//
// Cada hijo tiene un tope propio y se mata al final pase lo que pase: una regresión acá no puede dejar un
// `node` vivo detrás de la suite, que es justamente el defecto que se prueba.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { PassThrough } = require('node:stream')

const { readInput, FIRST_BYTE_MS } = require('../../engine/hooks/input')

const RUN = path.resolve(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
const BLOCKED = JSON.stringify({ tool_input: { command: 'git add .' } })
// Holgura sobre el plazo para que una máquina cargada no dé un falso rojo; lo que se mide es que termine,
// no cuán rápido.
const LIMIT = FIRST_BYTE_MS + 6000

// Lanza el hijo y devuelve cómo terminó. `feed` recibe su stdin cuando es un pipe del padre; el hijo se
// mata al vencer `LIMIT` y el resultado lo dice (`killed`), así que un cuelgue es un rojo y no una suite
// que no vuelve.
function launch(command, args, { stdio = 'pipe', feed, detached = false } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(command, args, { stdio: [stdio, 'pipe', 'pipe'], detached })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.stdout.resume()
    let killed = false
    const kill = () => {
      try { detached ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL') } catch { /* ya terminó */ }
    }
    const timer = setTimeout(() => { killed = true; kill() }, LIMIT)
    child.on('close', (status) => {
      clearTimeout(timer)
      if (detached) kill()
      resolve({ status, stderr, killed, elapsed: Date.now() - started })
    })
    if (feed) feed(child.stdin)
  })
}

test('stdin abierto sin datos: el guard termina bloqueando', { concurrency: true }, async (t) => {
  // `spawn` con stdio 'pipe' le da al hijo un socket Unix en Linux: es la forma del colgado original.
  t.test('socket que nadie cierra', async () => {
    let stdin
    const result = await launch(process.execPath, [RUN, 'git-add'], { feed: (s) => { stdin = s } })
    stdin.destroy()
    assert.equal(result.killed, false, `el guard no terminó solo en ${LIMIT} ms`)
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /BLOQUEADO: no llegó nada por stdin/)
    assert.match(result.stderr, /<\/dev\/null/, 'el mensaje dice cómo invocarlo a mano')
  })

  t.test('pipe que nadie cierra', async () => {
    // La sustitución de proceso da un pipe, y el `exec` deja al `node` como el hijo que se mide; el `sleep`
    // queda en el grupo del hijo y muere con él.
    const script = `exec "${process.execPath}" "${RUN}" git-add < <(exec sleep 60 2>/dev/null)`
    const result = await launch('bash', ['-c', script], { stdio: 'ignore', detached: true })
    assert.equal(result.killed, false, `el guard no terminó solo en ${LIMIT} ms`)
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /BLOQUEADO: no llegó nada por stdin/)
  })

  // El plazo es sobre el primer byte y no sobre la lectura: el segundo trozo llega después de que el plazo
  // venció, y aun así se lee entero. Un plazo sobre el total cortaría acá un `Write` grande.
  t.test('JSON en dos trozos, el segundo después del plazo', async () => {
    const half = Math.floor(BLOCKED.length / 2)
    const result = await launch(process.execPath, [RUN, 'git-add'], {
      feed: (stdin) => {
        stdin.write(BLOCKED.slice(0, half))
        setTimeout(() => stdin.end(BLOCKED.slice(half)), FIRST_BYTE_MS + 500)
      },
    })
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /git add -A\/--all\/\./, 'el guard juzgó el comando, no la espera')
  })
})

test('stdin que termina: el guard corre como siempre', { concurrency: true }, async (t) => {
  t.test('JSON cerrado que bloquea', async () => {
    const result = await launch(process.execPath, [RUN, 'git-add'], { feed: (s) => s.end(BLOCKED) })
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /git add -A\/--all\/\./)
  })

  t.test('JSON cerrado que pasa', async () => {
    const allowed = JSON.stringify({ tool_input: { command: 'git status --short' } })
    const result = await launch(process.execPath, [RUN, 'git-add'], { feed: (s) => s.end(allowed) })
    assert.equal(result.status, 0, result.stderr)
  })

  t.test('/dev/null', async () => {
    const result = await launch(process.execPath, [RUN, 'git-add'], { stdio: fs.openSync('/dev/null', 'r') })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.elapsed < FIRST_BYTE_MS, `/dev/null no espera el plazo: tardó ${result.elapsed} ms`)
  })

  t.test('stdin cerrado', async () => {
    const result = await launch('bash', ['-c', `exec "${process.execPath}" "${RUN}" git-add <&-`],
      { stdio: 'ignore' })
    assert.equal(result.status, 0, result.stderr)
  })
})

test('readInput: plazo al primer byte, lectura entera después', async () => {
  const empty = new PassThrough()
  const pending = readInput(empty, 50)
  empty.end()
  assert.deepEqual(await pending, {}, 'vacío sigue siendo «sin entrada»')

  const silent = new PassThrough()
  await assert.rejects(readInput(silent, 50), (error) => error.blocked === true && /50 ms/.test(error.message))
  assert.equal(silent.destroyed, true, 'suelta el stream al rendirse, para que no retenga el proceso')

  const slow = new PassThrough()
  const reading = readInput(slow, 50)
  slow.write('{"a":')
  await new Promise((done) => setTimeout(done, 120))
  slow.end('1}')
  assert.deepEqual(await reading, { a: 1 })

  const broken = new PassThrough()
  const parsing = readInput(broken, 50)
  broken.end('{roto')
  await assert.rejects(parsing, (error) => error.blocked === true && /no es JSON válido/.test(error.message))

  const failing = new PassThrough()
  const erroring = readInput(failing, 50)
  failing.destroy(new Error('EBADF'))
  assert.deepEqual(await erroring, {}, 'un stdin que no se puede leer es «sin stdin», como antes')
})
