'use strict'

// El recorrido interactivo posterior a `init`, probado sin npm, sin terminal y sin red: las dependencias
// entran por parámetro, así que se puede preguntar, cancelar y fallar sin tocar nada.
//
// Es la única parte del CLI que conversa, y por eso no está en `instance.test.js`: ahí se mide qué queda
// escrito en el disco, y acá qué se pregunta y qué se hace con la respuesta.

const test = require('node:test')
const assert = require('node:assert/strict')
const BOOT = require('../../engine/cli/bootstrap')

// El recorrido posterior a `init` se prueba entero sin npm, sin terminal y sin escribir en el repo del
// usuario: las tres cosas entran como dependencias, que es para lo que se separaron del CLI.
function bootDeps(answers = []) {
  const facts = { npm: 0, runners: [], providers: [], questions: [], said: [] }
  const queue = [...answers]
  return {
    facts,
    deps: {
      ask: (question) => { facts.questions.push(question); return Promise.resolve(queue.shift() ?? '') },
      log: (message) => facts.said.push(message),
      npm: () => { facts.npm += 1; return facts.npmStatus ?? 0 },
      installRunner: (name) => facts.runners.push(name),
      enableProvider: (name) => facts.providers.push(name),
    },
  }
}

const bootOptions = (extra) => ({
  runner: '', integration: '', runners: ['claude', 'codex'], providers: ['jira'],
  interactive: false, install: false, ...extra,
})

test('sin terminal ni banderas, init no pregunta ni toca nada', async () => {
  const { facts, deps } = bootDeps()
  const result = await BOOT.run('/tmp/x', bootOptions(), deps)
  assert.deepEqual(facts.questions, [], 'nadie a quién preguntar')
  assert.equal(facts.npm, 0)
  assert.deepEqual(result, {
    runner: BOOT.NO_RUNNER, provider: BOOT.NO_PROVIDER, installed: false, pending: 'npm install',
  })
})

test('con banderas, init habilita, instala y deja el runner puesto', async () => {
  const { facts, deps } = bootDeps()
  const result = await BOOT.run('/tmp/x', bootOptions({ runner: 'codex', integration: 'jira', install: true }), deps)
  assert.deepEqual(facts.providers, ['jira'])
  assert.equal(facts.npm, 1)
  assert.deepEqual(facts.runners, ['codex'], 'y el runner va después de npm, que es lo que lo resuelve')
  assert.equal(result.installed, true)
})

test('si npm falla, el runner no se instala y el error se dice', async () => {
  const { facts, deps } = bootDeps()
  facts.npmStatus = 1
  const result = await BOOT.run('/tmp/x', bootOptions({ runner: 'claude', install: true }), deps)
  assert.deepEqual(facts.runners, [], 'instalarlo sin la dependencia sólo produce un error peor')
  assert.equal(result.installed, false)
  assert.match(result.error, /npm install/)
})

test('una bandera con un valor que no existe se rechaza antes de tocar el disco', async () => {
  const { facts, deps } = bootDeps()
  await assert.rejects(
    () => BOOT.run('/tmp/x', bootOptions({ runner: 'emacs', install: true }), deps),
    /--runner debe ser claude, codex, ninguno/,
  )
  await assert.rejects(
    () => BOOT.run('/tmp/x', bootOptions({ integration: 'trello' }), deps),
    /--integration debe ser jira, ninguna/,
  )
  assert.equal(facts.npm, 0)
})

test('en una terminal, init pregunta runner e integración y entiende número o nombre', async () => {
  const { facts, deps } = bootDeps(['2', 'jira'])
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(facts.questions.length, 2)
  assert.equal(result.runner, 'codex', 'el 2 de la lista')
  assert.equal(result.provider, 'jira', 'o el nombre escrito')
})

// Cortar la terminal a mitad de camino no puede terminar la corrida con un error de readline y la
// instancia recién creada sin decir cómo seguir.
test('un Ctrl+D en mitad de la pregunta vale como no elegir', async () => {
  const { facts, deps } = bootDeps()
  deps.ask = () => Promise.reject(new Error('Aborted with Ctrl+D'))
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(result.runner, BOOT.NO_RUNNER)
  assert.equal(result.provider, BOOT.NO_PROVIDER)
  assert.deepEqual(facts.runners, [])
  assert.ok(facts.said.some((line) => line.includes('sin respuesta')))
})

// Enter es la respuesta más probable de quien no sabe qué elegir, y no puede dejar archivos en el repo.
test('un Enter deja todo como estaba, y un dedazo se repregunta', async () => {
  const { facts, deps } = bootDeps(['', ''])
  const blank = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), deps)
  assert.equal(blank.runner, BOOT.NO_RUNNER)
  assert.deepEqual(facts.providers, [])

  const other = bootDeps(['gemini', 'nada', '1', ''])
  const result = await BOOT.run('/tmp/x', bootOptions({ interactive: true }), other.deps)
  assert.equal(result.runner, 'claude', 'dos intentos fallidos y el tercero vale')
  assert.equal(other.facts.questions.length, 4)
  assert.ok(other.facts.said.some((line) => line.includes('no está en la lista')))
})
