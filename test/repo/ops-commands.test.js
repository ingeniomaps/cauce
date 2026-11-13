'use strict'

// La hermana de «ningún documento cita un comando make que no existe» (`repo.test.js`), para `ops` (caso 493). El
// precedente es el 012: el Makefile del molde llamaba a `ops team`, que nunca existió, y nada falló hasta que
// alguien lo corrió.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { FLAGS } = require('../../engine/cli/args')

const ROOT = path.resolve(__dirname, '..', '..')
// Las formas de un comando, no la palabra: «la raíz ops es…» o «ops.js corre al ser…» son prosa. Los recorridos
// nombran el CLI por una variable (`node <cli> X`, `node ${context.cli} X`, `node "$OPS" X`), y el texto que le
// pasan al agente lo cita entre comillas. `cauce` es el alias del `bin`.
const FORMS = {
  quoted: /[`"'](?:ops|cauce) ([a-z][a-z-]*)/g,
  node: /\bnode +(?:\S*ops\.js|<cli>|"?\$OPS"?|\$\{[^}]*\}) +([a-z][a-z-]*)/g,
  line: /^\s*ops ([a-z][a-z-]*)/gm,
  npm: /npm run ops -- ([a-z][a-z-]*)/g,
  npx: /\bnpx +(?:-y +)?[@\w/.-]*cauce(?:@\S+)? +([a-z][a-z-]*)/g,
}
// Hoy nadie cita por `npm run ops --`: la forma queda para el día que alguien lo haga, sin piso.
const UNUSED = new Set(['npm'])
// Registros: citan lo que existía cuando se escribieron. Y un caso de eval puede citar un comando inventado a
// propósito. `test/` no se recorre porque esta misma prueba cita `ops team`, ni `docs/issues/` y el CHANGELOG.
const RECORDS = [/\/evaluations\/(results|cases)\//, /\/learning\/(reports|proposals)\//, /\/learning\/HISTORY\.md$/]

function cited() {
  const found = []
  const review = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    for (const [form, pattern] of Object.entries(FORMS)) {
      for (const hit of text.matchAll(pattern)) found.push({ file: path.relative(ROOT, file), form, command: hit[1] })
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.name === 'node_modules' || RECORDS.some((one) => one.test(`/${path.relative(ROOT, file)}`))) continue
      if (entry.isDirectory()) walk(file)
      else if (/\.(md|js|sh|ya?ml|toml)$/.test(entry.name) || entry.name === 'Makefile') review(file)
    }
  }
  for (const dir of ['agents', 'flows', 'template', 'automatization', 'engine', '.github']) walk(path.join(ROOT, dir))
  for (const name of fs.readdirSync(ROOT)) {
    if ((name.endsWith('.md') && name !== 'CHANGELOG.md') || name === 'Makefile') review(path.join(ROOT, name))
  }
  return found
}

test('ningún documento ni recorrido cita un subcomando de ops que no existe', () => {
  const found = cited()
  for (const form of Object.keys(FORMS).filter((one) => !UNUSED.has(one))) {
    assert.ok(found.some((one) => one.form === form), `la forma ${form} dejó de reconocer las citas`)
  }
  const invented = found.filter(({ command }) => !Object.hasOwn(FLAGS, command))
    .map(({ file, command }) => `${file}: ops ${command}`)
  assert.deepEqual([...new Set(invented)], [])
})
