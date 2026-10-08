'use strict'

// Caso 315. Una regla que la empresa escribe después de instalar el runner no llega a la sesión hasta que
// alguien reinstala. Mientras tanto, la sesión recibe en cada mensaje cuáles son y que rigen igual.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { notice } = require('../../engine/hooks/rules-notice')

function instance(name) {
  const base = tempRoot(name)
  const target = path.join(base, 'ops')
  assert.equal(run(['init', target, '--name', 'Aviso', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  return { base, target }
}
const own = (target, name = 'commits.md') => fs.writeFileSync(path.join(target, 'planning', 'rules', name),
  '# Commits de Acme\n\n## R8 — A nuestra manera\n\nEl asunto va en español.\n')

test('sin desfase no se dice nada, y con una regla sin cargar se nombra con lo que hay que hacer', () => {
  const { target } = instance('cauce-aviso-reglas-')
  assert.equal(notice(target, 'claude'), '', 'recién instalado no hay nada que avisar')

  own(target)
  const text = notice(target, 'claude')
  assert.match(text, /Rigen y no están cargadas, en .+: planning\/rules\/commits\.md\./)
  assert.match(text, /donde contradigan a una de system\/ rige la del proyecto/)
  // La que quedó cargada y ya no rige también se dice: es la que la sesión está siguiendo.
  assert.match(text, /Están cargadas y ya no rigen: planning\/rules\/system\/commits\.md\. No las apliques/)
  assert.ok(text.includes(`hay que correr "make install-claude" en ${target} y abrir una sesión nueva`))
  assert.match(text, /Eso lo hace la persona: no lo corras vos\.$/)
  assert.ok(text.split('\n')[1].includes(target), 'la regla se nombra con la raíz donde hay que leerla')

  // Una regla que no reemplaza a ninguna sólo falta: no hay nada cargado de más.
  fs.rmSync(path.join(target, 'planning', 'rules', 'commits.md'))
  own(target, 'contenedores.md')
  const added = notice(target, 'claude')
  assert.match(added, /Rigen y no están cargadas, en .+: planning\/rules\/contenedores\.md\./)
  assert.doesNotMatch(added, /ya no rigen/)

  // Reinstalado, el aviso se va.
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(notice(target, 'claude'), '')
})

// Lo que reinstalar no cierra no se avisa: el remedio del aviso no lo apagaría y saldría en cada mensaje.
test('un archivo de instrucciones propio y una regla importada a mano no producen aviso', () => {
  const { base, target } = instance('cauce-aviso-propio-')
  const file = path.join(base, 'CLAUDE.md')
  const installed = fs.readFileSync(file, 'utf8')

  own(target, 'contenedores.md')
  assert.match(notice(target, 'claude'), /contenedores\.md/)
  fs.writeFileSync(file, `${installed}\n@ops/planning/rules/contenedores.md\n`)
  assert.equal(notice(target, 'claude'), '', 'la importó la empresa fuera del bloque: está cargada')

  // Sin el bloque, reinstalar conserva el archivo: avisarlo sería decirlo para siempre.
  fs.writeFileSync(file, '# CLAUDE de Acme\n')
  assert.equal(notice(target, 'claude'), '')
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), '# CLAUDE de Acme\n', 'el archivo propio se conserva')
  assert.equal(notice(target, 'claude'), '')
})

test('un runner que la instancia no instaló, o una raíz sin instancia, no produce aviso ni error', () => {
  const { target } = instance('cauce-aviso-otro-')
  own(target)
  assert.equal(notice(target, 'gemini'), '', 'el desfase es de Claude, no de un runner que no está')
  assert.equal(notice(tempRoot('cauce-aviso-vacio-'), 'claude'), '')
})

// El gancho entero, como lo corre el runner: lo que imprime es lo que llega a la sesión, y sale con 0 siempre.
test('el gancho imprime el aviso por stdout y nunca frena el mensaje de la persona', () => {
  const { base, target } = instance('cauce-aviso-gancho-')
  const hook = path.join(target, 'automatization', 'hooks', 'guard-rules-notice.sh')
  const message = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hola', cwd: base })
  const fire = (runner = 'claude', input = message) => spawnSync('bash', [hook, runner], { cwd: base,
    encoding: 'utf8', input, env: { ...process.env, CLAUDE_PROJECT_DIR: base } })
  const quiet = fire()
  assert.equal(quiet.status, 0)
  assert.equal(quiet.stdout, '', 'sin desfase no agrega nada a la sesión')

  own(target)
  const loud = fire()
  assert.equal(loud.status, 0, 'avisa, no frena')
  assert.match(loud.stdout, /^\[Cauce\] Las reglas de este proyecto cambiaron después de instalar el runner/)
  assert.match(loud.stdout, /planning\/rules\/commits\.md/)
  // El runner lo dice quien engancha: el mismo gancho, llamado por uno que la instancia no instaló, calla.
  assert.equal(fire('gemini').stdout, '')
  // Sin que el shim diga para qué runner, no hay contra qué comparar: no se supone uno.
  const unnamed = spawnSync('bash', [path.join(path.dirname(hook), 'run-hook.sh'), 'rules-notice'], { cwd: base,
    encoding: 'utf8', input: message, env: { ...process.env, CLAUDE_PROJECT_DIR: base, CAUCE_NOTICE_RUNNER: '' } })
  assert.deepEqual([unnamed.status, unnamed.stdout], [0, ''])
  // Y con el motor fallando no le llega nada a la sesión ni se frena el mensaje.
  const broken = fire('claude', '{no es json')
  assert.deepEqual([broken.status, broken.stdout, broken.stderr], [0, '', ''])

  const settings = fs.readFileSync(path.join(base, '.claude', 'settings.json'), 'utf8')
  assert.match(settings, /guard-rules-notice\.sh claude/, 'el runner lo engancha en cada mensaje')
})
