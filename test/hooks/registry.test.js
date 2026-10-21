'use strict'

// El registro de guards y cómo se los invoca: que el grupo los cubra a todos, que correr un grupo no se
// detenga en el primero, y que una entrada ilegible frene en vez de dejar pasar.
//
// Es otra pregunta que qué se exige al commitear, que es de `commit.test.js`: acá el sujeto es el runner
// y no el momento.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const { execute, executeAll, guards, hookGroups } = require('../../engine/hooks/run')

test('los grupos cubren cada guard exactamente una vez', () => {
  const grouped = Object.values(hookGroups).flat()
  assert.deepEqual([...grouped].sort(), Object.keys(guards).sort(), 'ningún guard queda fuera ni duplicado')
  for (const name of grouped) assert.ok(guards[name], `${name} no existe como guard`)
})

test('executeAll corre el grupo entero, no sólo su primer guard', () => {
  assert.throws(
    () => executeAll(['pre-shell'], { tool_input: { command: 'git push origin main' } }),
    (error) => error.blocked === true,
    'destructive es el primero del grupo',
  )
  assert.throws(
    () => executeAll(['pre-shell'], { cwd: os.tmpdir(), tool_input: { command: 'npm publish' } }),
    (error) => error.blocked === true,
    'dependencies está en el medio del grupo',
  )
  assert.throws(
    () => executeAll(['pre-files'], {
      tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/remote.json' },
    }),
    (error) => error.blocked === true,
    'integration-snapshot es el último del grupo',
  )
  assert.doesNotThrow(() => executeAll(['pre-shell'], { tool_input: { command: 'git status --short' } }))
  assert.doesNotThrow(() => executeAll(['pre-files'], {
    tool_input: { file_path: 'docs/README.md', content: '# hola' },
  }))
  assert.throws(() => executeAll(['grupo-inexistente'], {}), /Hook desconocido/)
  assert.throws(() => executeAll([], {}), /guard o de un grupo/)
})

test('un guard suelto sigue siendo invocable por nombre', () => {
  assert.throws(
    () => executeAll(['git-add'], { tool_input: { command: ['git', 'add', '.'].join(' ') } }),
    (error) => error.blocked === true,
  )
})

// `run-hook.sh` lo dice de su propio motor: «un guard que no encuentra su motor bloquea, nunca
// permite». No valía para la configuración: `workspace-boundary` y `engine` hacían `catch { return }`
// al parsearla, así que una coma de más los apagaba a los dos sin imprimir nada. Y `findOpsRoot` sólo
// devuelve una raíz cuando `ops.config.json` existe, o sea que ese catch nunca fue «no aplica».
test('un guard que no puede leer la configuración bloquea, no permite', () => {
  const root = tempRoot('ops-failopen-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = path.join(root, 'ops.config.json')
  const afuera = { cwd: root, tool_input: { file_path: '/etc/passwd' } }
  const engine = {
    cwd: root,
    tool_input: { file_path: path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'x.js') },
  }

  fs.writeFileSync(config, JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], runner: {},
  }))
  blocked('workspace-boundary', afuera, /fuera de las raíces/)
  blocked('engine', engine, /pertenece al motor de Cauce/)

  // Una configuración que parsea pero trae un tipo cambiado no es «no se puede leer»: el guard sigue
  // juzgando con lo que entiende, y lo que no entiende no exenta nada. Un `.filter` sobre un string sale
  // como TypeError, que no es un bloqueo — y en `check`, dentro del try, se leía como «JSON inválido».
  fs.writeFileSync(config, JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }],
    writableOutsideRoots: '/etc', runner: {},
  }))
  blocked('workspace-boundary', afuera, /fuera de las raíces/)

  fs.writeFileSync(config, '{"project":"x",,"mode":"embedded"}')
  for (const guard of ['workspace-boundary', 'engine']) {
    assert.throws(
      () => execute(guard, afuera),
      (error) => error.blocked === true && /no se puede leer/.test(error.message),
      `${guard} permitió con la configuración rota`,
    )
  }
})

// Caso 419. Con la configuración ilegible pasa una sola cosa, volver a la del último commit, y el bloqueo la nombra. El
// porqué y lo que sigue frenando, en `restoresConfig`.
test('con la configuración ilegible pasa volver a la del último commit, y nada más', () => {
  const root = tempRoot('ops-config-roto-')
  fs.mkdirSync(path.join(root, 'planning'))
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0)
  const config = path.join(root, 'ops.config.json')
  fs.writeFileSync(config, '{\n<<<<<<< Updated upstream\n  "x": 1\n=======\n  "x": 2\n>>>>>>> Stashed changes\n}\n')
  const shell = (command, cwd = root) => () => executeAll(['pre-shell'], { cwd, tool_input: { command } })
  for (const command of ['git checkout HEAD -- ops.config.json', `git -C "${root}" checkout HEAD -- ops.config.json`,
    `git checkout HEAD -- ${config}`, 'git restore --source=HEAD ops.config.json',
    'git restore --source HEAD --staged --worktree ops.config.json']) {
    assert.doesNotThrow(shell(command), command)
  }
  assert.doesNotThrow(shell('git checkout HEAD -- ../ops.config.json', path.join(root, 'planning')), 'desde planning/')
  // Lo demás frena como antes: otro comando, otro origen —una rama o el índice— y lo que se cuelga detrás.
  for (const command of ['ls', 'git checkout otra -- ops.config.json', 'git checkout -- ops.config.json',
    'git restore ops.config.json', 'git checkout HEAD -- otro.json',
    'git checkout HEAD -- ops.config.json && rm -rf src',
    'git checkout HEAD -- ops.config.json; echo x > .npmrc', 'GIT_DIR=/otro git checkout HEAD -- ops.config.json',
    // Sin espacios la forma coincide igual, y lo que el shell expande correría sin guard.
    `git -C $(id)x checkout HEAD -- ${config}`, `git -C \`id\`x checkout HEAD -- ${config}`]) {
    assert.throws(shell(command), (error) => error.blocked && /no se puede leer/.test(error.message), command)
  }
  // Lo que restaurar correría sin guards, y una raíz donde no se puede preguntar: el porqué, en `runsCode`.
  const hook = path.join(root, '.git', 'hooks', 'post-checkout')
  fs.writeFileSync(hook, '#!/bin/sh\n', { mode: 0o755 })
  assert.throws(shell('git checkout HEAD -- ops.config.json'), /post-checkout/, 'con post-checkout')
  fs.rmSync(hook)
  fs.writeFileSync(path.join(root, '.gitattributes'), 'ops.config.json filter=x\n')
  assert.throws(shell('git checkout HEAD -- ops.config.json'), /no se puede leer/, 'con un filtro')
  fs.rmSync(path.join(root, '.gitattributes'))
  assert.equal(spawnSync('git', ['config', 'core.fsmonitor', 'true'], { cwd: root }).status, 0)
  assert.throws(shell('git checkout HEAD -- ops.config.json'), /no se puede leer/, 'con fsmonitor')
  assert.equal(spawnSync('git', ['config', '--unset', 'core.fsmonitor'], { cwd: root }).status, 0)
  fs.renameSync(path.join(root, '.git'), path.join(root, 'git-aparte'))
  assert.throws(shell('git checkout HEAD -- ops.config.json'), /no se puede leer/, 'sin repositorio')
  fs.renameSync(path.join(root, 'git-aparte'), path.join(root, '.git'))
  const files = () => executeAll(['pre-files'], { cwd: root, tool_input: { file_path: config, content: '{}' } })
  assert.throws(files, /no se puede leer/, 'escribir el archivo entero sigue sin con qué compararse')
  // El bloqueo dice cuál es la salida, con la ruta de esta raíz, y la de la persona para cuando no hay commit.
  assert.throws(shell('ls'), (error) => error.message.includes(`git -C "${root}" checkout HEAD -- ops.config.json`)
    && /con `!` delante/.test(error.message))
  // Avisa que restaurar descarta el cambio local, que puede ser de la persona. Y con una ruta que la excepción rechaza
  // no ofrece el comando: se volvería a frenar.
  assert.throws(shell('ls'), /si ese cambio no es tuyo, preguntale antes a la persona/)
  const { unreadableConfig } = require('../../engine/hooks/unreadable-config')
  const odd = unreadableConfig(path.join(os.tmpdir(), 'Cliente (2025)', 'ops'), new Error('x'))
  assert.doesNotMatch(odd, /checkout HEAD/)
  assert.match(odd, /Con esta ruta, o si restaurar corre código.*con `!` delante/)
  // Con la configuración sana la excepción no decide nada: los guards miran ese mismo comando como cualquier otro.
  fs.writeFileSync(config, JSON.stringify({ project: 'x', mode: 'embedded', workspaceRoots: [], runner: {} }))
  const { restoresConfig } = require('../../engine/hooks/ops-config')
  assert.equal(restoresConfig({ cwd: root, tool_input: { command: 'git checkout HEAD -- ops.config.json' } }), false)
})

// La misma regla, un paso antes: si la entrada del hook no se puede parsear, cada guard veía `{}`
// —sin comando y sin archivos— y dejaba pasar todo. Sin stdin sí es «no hay nada que leer», y ahí los
// guards caen a las variables de entorno; se comprueban las dos ramas para no cerrar la buena.
test('una entrada de hook ilegible bloquea; la ausencia de entrada no', () => {
  const runtime = path.resolve(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
  const invoke = (payload, env = {}) => spawnSync(
    process.execPath,
    [runtime, 'destructive'],
    { input: payload, encoding: 'utf8', env: { ...process.env, ...env } },
  )

  const broken = invoke('{"tool_input": esto no es json')
  assert.equal(broken.status, 2)
  assert.match(broken.stderr, /no es JSON válido/)

  assert.equal(invoke('').status, 0, 'sin entrada no hay nada que decidir')
  assert.equal(
    invoke('', { OPS_HOOK_COMMAND: 'git push origin main' }).status, 2,
    'y sin entrada el guard sigue leyendo el entorno',
  )
})
