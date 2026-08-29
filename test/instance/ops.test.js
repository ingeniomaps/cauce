'use strict'

// La puerta de entrada del CLI: cómo parsea sus argumentos, qué banderas rechaza y cuándo se niega a
// correr. Es `engine/cli/ops.js`, el despacho, antes de que ningún comando haga trabajo.
//
// Las familias que despacha viven aparte —`instance`, `planning` y `wiring`, cada una con su archivo—,
// y todas comparten el mismo arnés: el CLI en un proceso aparte, contra una instancia de verdad.

const { MIN_ROLES, tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Una bandera antes del último posicional se comía su lugar: `agents list --json` tomaba `--json`
// como la raíz y devolvía `[]` sin error. Quien lo consumía —un agente, en el caso que lo destapó—
// no tenía forma de distinguir "no hay cargos" de "me contestaste con nada".
test('una bandera no ocupa el lugar de un argumento', () => {
  const repo = path.resolve(__dirname, '..', '..')
  const withRoot = run(['agents', 'list', repo, '--json'])
  const withoutRoot = run(['agents', 'list', '--json'], repo)
  assert.equal(withRoot.status, 0, withRoot.stderr)
  assert.ok(JSON.parse(withRoot.stdout).length >= MIN_ROLES, 'con raíz explícita antes de la bandera')
  assert.ok(JSON.parse(withoutRoot.stdout).length >= MIN_ROLES, 'y con la bandera sola')
})

// `upgrade` e `install` son para una empresa: reemplazan lo que el toolkit mantiene por lo que el
// toolkit trae. Corridos acá se llevarían puestos los archivos de la raíz —`AGENTS.md` entre ellos,
// donde vive esta misma regla—, y el catálogo se duplicaría en punteros a sí mismo. `fork` ya se
// negaba; estos dos entraban y hacían el daño en silencio.
test('los comandos de una instancia se niegan a correr contra el toolkit', () => {
  const root = tempRoot('cauce-toolkit-')
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'toolkit' }))

  const upgraded = run(['upgrade', root])
  assert.equal(upgraded.status, 2)
  assert.match(upgraded.stderr, /es el toolkit/)

  const installed = run(['automation', 'install', root, 'claude'])
  assert.equal(installed.status, 2)
  assert.match(installed.stderr, /se fabrica Cauce/)

  // Y una instancia de verdad sigue pudiendo: la negativa mira el modo, no el comando.
  const demo = path.join(root, 'demo-ops')
  assert.equal(run(['init', demo, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  linkEngine(demo)
  assert.equal(run(['automation', 'install', demo, 'claude']).status, 0)
})

// Misma distinción que en los guards, un nivel más arriba: `mode()` devolvía '' ante una
// configuración rota, así que `upgrade` no reconocía el modo `toolkit` y seguía adelante — sobre el
// repo donde vive la regla que se lo prohíbe. Ausente sigue siendo ausente y da el error de siempre.
test('una configuración ilegible detiene el comando en vez de pasar por desconocida', () => {
  const root = tempRoot('cauce-config-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = path.join(root, 'ops.config.json')

  fs.writeFileSync(config, '{"project":"x",,"mode":"toolkit"}')
  for (const args of [['upgrade', root], ['automation', 'install', root, 'claude']]) {
    const result = run(args)
    assert.notEqual(result.status, 0, `${args[0]} siguió con la configuración rota`)
    assert.match(result.stderr, /ops\.config\.json no se puede leer/)
  }

  fs.rmSync(config)
  assert.match(run(['upgrade', root]).stderr, /falta ops\.config\.json/, 'ausente no es ilegible')
})

// Una bandera con un typo se ignoraba: `check --jsonn` imprimía la salida humana con código 0, así
// que quien esperaba JSON recibía texto sin señal de nada. Es la misma familia que el bug ya
// documentado en `parse()` (engine/cli/args.js) —`--json` tomado como raíz—: ahí se arreglaron los posicionales y no
// las banderas. Y `--help` sólo valía como primer argumento.
test('el CLI rechaza una bandera que no existe en vez de ignorarla', () => {
  const planning = path.resolve(__dirname, '..', '..', 'template', 'planning')

  const typo = run(['check', planning, '--jsonn'])
  assert.equal(typo.status, 2)
  assert.match(typo.stderr, /bandera desconocida --jsonn/)
  assert.match(typo.stderr, /Acepta: --json/, 'y dice cuáles sí valen')

  // Una bandera real pero de otro comando tampoco pasa.
  assert.equal(run(['check', planning, '--force']).status, 2)
  assert.match(run(['archive', planning, '001', '--json']).stderr, /No acepta banderas/)

  // Lo que sí existe sigue funcionando, incluidas las banderas que consumen su valor.
  assert.equal(run(['check', planning, '--json']).status, 0)
  assert.equal(run(['tree', planning, '--json', '--no-color']).status, 0)

  // Y `--help` explica el comando en vez de ejecutarlo contra el directorio actual.
  const help = run(['check', '--help'])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /^Uso:/)

  assert.equal(run(['inventado']).status, 2, 'un comando desconocido sigue fallando')
})

// La línea de comandos se leía de `process.argv` en veinticinco puntos, así que nada de esto se podía
// comprobar sin levantar un proceso y `evaluationBench` sacaba `--force` de una variable global en vez
// de recibirlo. Ahora se parsea una vez al entrar y esto es una función pura.
test('la línea de comandos se parsea una vez y se puede probar sin proceso', () => {
  const { parse } = require('../../engine/cli/args')

  const simple = parse(['check', 'planning', '--json'])
  assert.deepEqual(simple.positional, ['check', 'planning'])
  assert.equal(simple.has('--json'), true)
  assert.equal(simple.has('--force'), false)

  // Una bandera con valor se lleva el argumento siguiente: no es un posicional.
  const withValue = parse(['init', 'destino', '--name', 'Demo', '--mode', 'sidecar'])
  assert.deepEqual(withValue.positional, ['init', 'destino'], 'el valor no se cuela como posicional')
  assert.equal(withValue.value('--name'), 'Demo')
  assert.equal(withValue.value('--mode'), 'sidecar')
  assert.equal(withValue.value('--fixture', 'por defecto'), 'por defecto', 'ausente cae al fallback')

  // Y una sin valor declarado no se lleva nada: el caso de `--bench` queda de posicional.
  const bench = parse(['evaluate', 'qa-engineer', '--bench', '01-caso'])
  assert.deepEqual(bench.positional, ['evaluate', 'qa-engineer', '01-caso'])
  assert.equal(bench.has('--bench'), true)

  assert.deepEqual(parse(['check', '--jsonn']).unknown('check'), ['--jsonn'])
  assert.deepEqual(parse(['check', '--json']).unknown('check'), [])
  assert.deepEqual(parse(['archive', 'planning', '001']).unknown('archive'), [])
})
