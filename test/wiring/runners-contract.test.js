'use strict'

// Lo que vale para los cuatro adaptadores a la vez, y para el que se agregue después: que ningún comando
// de hook quede relativo al workspace, que ninguna ruta dé por sentado dónde se instaló, que lo que un
// manifiesto anuncia exista.
//
// Vive aparte de `runners.test.js` —que mide un adaptador por caso— porque estos recorren la lista
// entera: partirlos por runner es justamente lo que no se puede hacer, y así el archivo donde viven lo
// dice solo.

const { MIN_ROLES } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..', 'automatization', 'runners')

test('cada runner declara un manifest instalable y fuentes existentes', () => {
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const dir = path.join(root, name)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.name, name)
    assert.equal(typeof manifest.capabilities.nativeHooks, 'boolean')
    assert.equal(fs.existsSync(path.resolve(dir, manifest.config.source)), true)
    for (const item of [...manifest.instructions, ...manifest.artifacts]) {
      assert.equal(fs.existsSync(path.resolve(dir, item.source)), true, `${name}: ${item.source}`)
    }
  }
})

// El nombre del recorrido es el mismo en todos los runners; el prefijo lo pone cada uno. Lo que no puede
// pasar es que un runner anuncie un recorrido que no instala: Gemini documentaba `/ops:onboard` y no
// existía ningún archivo detrás, así que el usuario lo buscaba en su lista y no estaba.
test('cada recorrido anunciado tiene un archivo que lo instala', () => {
  const expected = ['onboard', 'flow', 'autobuild', 'integration-sync', 'integration-promote']
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const commands = manifest.commands || { invocation: '', names: [] }
    if (!commands.invocation) {
      assert.deepEqual(commands.names, [], `${name}: anuncia nombres sin saber cómo se los invoca`)
      continue
    }
    assert.match(commands.invocation, /\{name\}/, `${name}: la invocación no dice dónde va el nombre`)
    // Y empieza por lo que la vuelve una invocación. Antigravity declaraba `cauce:{name}`, así que el
    // instalador imprimía `cauce:onboard` mientras la sesión real sólo respondía a `/cauce:onboard`:
    // un nombre pelado se lee como invocación y no lo es.
    assert.match(commands.invocation, /^[^a-z0-9]/, `${name}: ${commands.invocation} es un nombre, no una invocación`)
    assert.deepEqual(commands.names, expected, `${name}: no ofrece los mismos recorridos que el resto`)
    for (const command of commands.names) {
      const installed = manifest.artifacts.some((item) => item.target.includes(command))
      assert.equal(installed, true, `${name}: anuncia ${command} y no instala nada que lo provea`)
    }
  }
})

test('los runners con hooks nativos registran el grupo, no un hook por guard', () => {
  const { hookGroups } = require('../../engine/hooks/run')
  for (const name of ['claude', 'codex']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name, 'manifest.json'), 'utf8'))
    const config = fs.readFileSync(path.resolve(root, name, manifest.config.source), 'utf8')
    assert.match(config, /guard-shell\.sh/, `${name}: falta el grupo de shell`)
    assert.match(config, /guard-files\.sh/, `${name}: falta el grupo de archivos`)
    for (const group of ['pre-shell', 'pre-files']) {
      for (const guard of hookGroups[group]) {
        assert.equal(config.includes(`guard-${guard}.sh`), false, `${name}: ${guard} quedó registrado suelto`)
      }
    }
  }
})

test('los runners con skills nativas exponen el catálogo completo de cargos', () => {
  const A = require('../../engine/automation')
  const repoRoot = path.resolve(__dirname, '..', '..')
  const slugs = require('../../engine/agents/catalog').list(repoRoot).map((role) => role.slug)
  assert.ok(slugs.length >= MIN_ROLES, 'el catálogo debería tener decenas de cargos')

  // Los cuatro tienen skills. Codex se sumó último: su adaptador lo daba por incapaz desde 0.39.0 y el
  // CLI ya las descubría en `.agents/skills/`, así que operaba el protocolo a mano sin necesidad.
  for (const name of A.RUNNER_NAMES) {
    const manifest = A.runnerManifest(path.resolve(__dirname, '..', '..'), name)
    assert.equal(manifest.capabilities.nativeSkills, true, `${name}: declara skills nativas`)
    assert.ok(manifest.roleSkills, `${name}: declara dónde instalarlas`)
  }
})

// Un comando de hook se ejecuta con el cwd que el runner elija, y ninguno promete cuál. Codex usa el
// de la sesión y su propia guía pide resolver desde la raíz del git; Antigravity lo resuelve contra la
// carpeta del plugin, que ni siquiera está en el proyecto. Una ruta relativa al workspace sólo funciona
// si el CLI se abrió exactamente ahí: desde un subdirectorio el script no existe, el guard no corre, y
// como no hay error visible la instalación sigue diciendo que está operativa. Cada runner ancla como
// puede —`$CLAUDE_PROJECT_DIR`, `$GEMINI_PROJECT_DIR`, `{{OPS_ROOT}}` o una ruta propia del plugin—,
// pero ninguno puede no anclar.
test('ningún comando de hook queda relativo al workspace', () => {
  const A = require('../../engine/automation')
  const REPO = path.resolve(__dirname, '..', '..')
  const automation = path.join(REPO, 'automatization')
  const loose = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(automation, 'runners', name)
    // Con los marcadores puestos: lo que se comprueba es que el comando declare su ancla, no el
    // valor que toma en una instalación concreta.
    const sourceFile = path.resolve(dir, runner.config.source)
    const config = A.render(sourceFile, '{{OPS_DIR}}', automation, '{{OPS_ROOT}}')
    for (const hit of config.matchAll(/"command":\s*"([^"]+)"/g)) {
      const command = hit[1]
      const anchored = /^\$[A-Z_]+\//.test(command)          // variable de proyecto del runner
        || /\{\{OPS_ROOT\}\}/.test(command)                  // ruta absoluta escrita al instalar
        || /^\S+ [^/]*$/.test(command)                       // relativo a la carpeta del propio plugin
      if (!anchored) loose.push(`${name}: ${command}`)
    }
  }
  assert.deepEqual(loose, [])
})

// El nombre del recorrido es el mismo en los cuatro y el prefijo lo pone cada uno, así que un archivo
// puede nombrar una invocación que en su runner no existe y nada falla: el usuario la escribe, no pasa
// nada, y no tiene cómo saber si se equivocó él o el toolkit. Pasó dos veces. `GEMINI.md` siguió
// diciendo `/ops:autobuild` después de que los comandos se mudaran a `/cauce:`, y el manifest de
// Antigravity anunciaba `cauce:onboard` sin la barra mientras la sesión real usaba `/cauce:onboard`.
test('ningún archivo instalable nombra una invocación que su runner no tiene', () => {
  const A = require('../../engine/automation')
  const REPO = path.resolve(__dirname, '..', '..')
  const automation = path.join(REPO, 'automatization')
  const FLOWS = ['onboard', 'flow', 'autobuild', 'integration-sync', 'integration-promote']
  // Precedido por `/` o `$` y no por parte de una ruta: `.claude/workflows/autobuild.js` no es una
  // invocación, y `integration-sync jira` sin prefijo tampoco.
  const invoked = new RegExp(
    String.raw`(?<![\w./-])([/$][a-z]*:?)(${FLOWS.join('|')})(?![\w./-])`, 'g',
  )
  const foreign = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const ownFiles = new Set(FLOWS.map(
      (pase) => ((runner.commands && runner.commands.invocation) || '').replace('{name}', pase),
    ))
    const dir = path.join(automation, 'runners', name)
    const copied = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copied) {
      const file = path.resolve(dir, relative)
      if (!fs.existsSync(file)) continue
      for (const hit of A.render(file, '', automation).matchAll(invoked)) {
        if (!ownFiles.has(hit[0])) foreign.push(`${name}:${relative} → ${hit[0]}`)
      }
    }
  }
  assert.deepEqual(foreign, [])
})

// Cada archivo que un adaptador copia se lee desde donde se abre la herramienta, que en modo sidecar
// no es la raíz ops. Una ruta sin `{{OPS_DIR}}` apunta a un lugar que no existe, y el modelo que la
// sigue no encuentra el protocolo ni el catálogo. Se escapó tres veces revisando de a un archivo:
// esto lo declara de una vez para todo lo instalable, incluido lo que se agregue después.
test('ninguna ruta de un adaptador da por sentado dónde se instala', () => {
  const REPO = path.resolve(__dirname, '..', '..')
  const A = require('../../engine/automation')
  const root = new RegExp(
    String.raw`(?<!\{\{OPS_DIR\}\}|\.|\/)\b(planning\/|organization\/|integrations\/`
    + String.raw`|flows\/|automatization\/|tools\/ops\.js|ops\.config\.json)`,
    'g',
  )
  const looseOnes = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(REPO, 'automatization', 'runners', name)
    const copied = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copied) {
      const file = path.resolve(dir, relative)
      // Los `.js` quedan afuera, y por qué **está medido** (caso 145): correr este regex sobre los nueve
      // recorridos da 52 coincidencias y **ninguna** es un defecto. Se reparten en tres familias, todas
      // legítimas: prosa de comentarios, comandos dictados que ya anclan —«corré X **desde `${ROOT}`**»,
      // y desde 0.89.0 esa raíz es absoluta— y código que compara rutas en disco, que no viaja a nadie.
      //
      // Lo que este regex sabe buscar es una ruta suelta en prosa. En un `.js` no distingue la que se le
      // dicta a un agente de la que vive en una expresión, así que incluirlos daría 52 avisos y cero
      // hallazgos: una puerta que nace apagada. Lo que separa un dictado sano de uno roto no es la ruta
      // sino si la consigna dice desde dónde, y eso lo cuida `workflows-build.test.js` sobre `ROOT`.
      if (!fs.existsSync(file) || file.endsWith('.js')) continue
      // Renderizado con el marcador por prefijo: resuelve los `INCLUDE` sin tocar los `{{OPS_DIR}}`,
      // así lo compartido se revisa una vez por cada adaptador que lo enmarca y no queda afuera.
      const text = A.render(file, '{{OPS_DIR}}', path.join(REPO, 'automatization'))
      for (const hit of text.matchAll(root)) {
        looseOnes.push(`${name}:${relative} → ${hit[1]}`)
      }
    }
  }
  assert.deepEqual(looseOnes, [])
})

// La exclusión de arriba se justificó con un número, y un número envejece. Esto lo vuelve a medir: si
// algún día un recorrido trae una ruta que el regex marcaría **y** que no sea una de las tres familias
// inofensivas, este conteo se mueve y hay que volver a mirar si la exclusión sigue valiendo.
//
// Cuenta en vez de exigir cero porque cero es imposible: los 52 son legítimos y seguirán ahí. Lo que se
// vigila es que no crezcan sin que nadie lo note, que es cómo una exclusión medida se vuelve una supuesta.
test('lo que el guard de rutas se saltea en los recorridos sigue siendo inofensivo', () => {
  const REPO = path.resolve(__dirname, '..', '..')
  const A = require('../../engine/automation')
  const automation = path.join(REPO, 'automatization')
  const root = new RegExp(
    String.raw`(?<!\{\{OPS_DIR\}\}|\.|\/)\b(planning\/|organization\/|integrations\/`
    + String.raw`|flows\/|automatization\/|tools\/ops\.js|ops\.config\.json)`,
    'g',
  )
  let hits = 0
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const dir = path.join(automation, 'runners', name)
    const copied = [
      runner.config.source,
      ...(runner.instructions || []).map((item) => item.source),
      ...(runner.artifacts || []).map((item) => item.source),
    ]
    for (const relative of copied) {
      const file = path.resolve(dir, relative)
      if (!fs.existsSync(file) || !file.endsWith('.js')) continue
      hits += [...A.render(file, '{{OPS_DIR}}', automation).matchAll(root)].length
    }
  }
  // El número exacto del 2026-09-14, clasificado a mano una por una. Se mueve al agregar un recorrido o
  // una consigna, y entonces toca clasificar las nuevas antes de actualizarlo.
  assert.equal(hits, 52, 'cambió lo que el guard se saltea: clasificá las coincidencias nuevas')
})
