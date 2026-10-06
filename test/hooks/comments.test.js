'use strict'

// La pasada de comentarios de R11 (caso 233). Lo que se mide: que sin `comments` declarado no frene nada; que
// con él frene una vez el commit que agrega comentarios, listándolos, y entre con el token de esa lista y no
// con otro; que sólo cuente lo agregado, también en un merge; y que el idioma y el largo frenen sólo si se
// declaran, aprobables como el resto de los gates.

const { tempRoot } = require('../support/environment')
const { blocked, messageOf, git, initRepo, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const CM = require('../../engine/hooks/comments')
const { validateOpsConfig } = require('../../engine/config/validate')

const commit = (root, prefix = '') => ({ cwd: root, tool_input: { command: `${prefix}git commit -m cambio` } })

function repo(comments) {
  const root = tempRoot('cauce-comments-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], ...(comments && { comments }),
  }))
  initRepo(root)
  fs.writeFileSync(path.join(root, 'app.js'), '// Encabezado que ya estaba.\nfunction uno() {\n  return 1\n}\n')
  git(['add', 'app.js'], root)
  git(['commit', '-qm', 'base'], root)
  return root
}
const stage = (root, file, content) => {
  fs.writeFileSync(path.join(root, file), content)
  git(['add', file], root)
}
const tokenIn = (message) => message.match(/CAUCE_COMMENTS_REVIEWED=([0-9a-f]{12})/)[1]

test('sin comments declarado no frena nada', () => {
  const root = repo(null)
  stage(root, 'app.js', '// Encabezado que ya estaba.\n// Uno nuevo.\nfunction uno() {\n  return 1\n}\n')
  assert.doesNotThrow(() => execute('comments', commit(root)))
})

test('frena una vez, lista lo agregado, y entra con el token de esa lista y no con otro', () => {
  const root = repo({})
  stage(root, 'app.js', '// Encabezado que ya estaba.\nfunction uno() {\n  // Por qué uno y no dos.\n  return 1\n}\n')
  const message = messageOf('comments', commit(root))
  assert.match(message, /recorrelos antes de que entren \(R11\)/)
  assert.match(message, /app\.js\n {2}3-3 \(dentro\)\n {4}\| Por qué uno y no dos\./)
  assert.doesNotMatch(message, /Encabezado que ya estaba/, 'lo que ya estaba no se lista')
  const tok = tokenIn(message)
  assert.doesNotThrow(() => execute('comments', commit(root, `CAUCE_COMMENTS_REVIEWED=${tok} `)))

  stage(root, 'app.js', '// Encabezado que ya estaba.\nfunction uno() {\n  // Por qué uno, y no dos.\n  return 1\n}\n')
  blocked('comments', commit(root, `CAUCE_COMMENTS_REVIEWED=${tok} `), /recorrelos/)
  assert.notEqual(tokenIn(messageOf('comments', commit(root))), tok, 'otro comentario, otro token')
})

// Caso 258: la instancia declaró la pasada para sus repositorios, no para el que un comando visita.
test('un commit en un repositorio ajeno a la sesión no pasa por la pasada', () => {
  const root = repo({})
  const foreign = tempRoot('cauce-comments-ajeno-')
  initRepo(foreign)
  stage(foreign, 'app.js', '// Un comentario nuevo en un repositorio que no es de esta sesión.\nmodule.exports = 1\n')
  const elsewhere = { cwd: root, tool_input: { command: `git -C ${foreign} commit -m cambio` } }
  assert.doesNotThrow(() => execute('comments', elsewhere))
  stage(root, 'app.js', '// Encabezado que ya estaba.\n// Uno nuevo.\nfunction uno() {\n  return 1\n}\n')
  blocked('comments', commit(root), /recorrelos/)
})

test('un commit que no agrega comentarios pasa', () => {
  const root = repo({ language: 'en', inlineMax: 1 })
  stage(root, 'app.js', '// Encabezado que ya estaba.\nfunction uno() {\n  return 2\n}\n')
  assert.doesNotThrow(() => execute('comments', commit(root)))
})

test('en un merge no se lista lo que trae la otra rama', () => {
  const root = repo({})
  git(['checkout', '-qb', 'otra'], root)
  fs.writeFileSync(path.join(root, 'otra.js'), '// De la otra rama.\nmodule.exports = 1\n')
  git(['add', 'otra.js'], root)
  git(['commit', '-qm', 'otra'], root)
  git(['checkout', '-q', '-'], root)
  stage(root, 'app.js', '// Encabezado que ya estaba.\nfunction uno() {\n  return 3\n}\n')
  git(['commit', '-qm', 'aca'], root)
  git(['merge', '-q', '--no-commit', '--no-ff', 'otra'], root)
  assert.doesNotThrow(() => execute('comments', commit(root)))
})

test('el idioma frena sólo si se declara, y en los dos sentidos', () => {
  const es = '// Esto existe porque la API devuelve un error cuando el campo está vacío.\nmodule.exports = 1\n'
  const en = '// This exists because the API returns an error when the field is empty.\nmodule.exports = 1\n'
  const english = repo({ language: 'en' })
  stage(english, 'nuevo.js', es)
  blocked('comments', commit(english), /nuevo\.js:1: está en es y acá los comentarios van en en/)
  const spanish = repo({ language: 'es' })
  stage(spanish, 'nuevo.js', en)
  blocked('comments', commit(spanish), /nuevo\.js:1: está en en y acá los comentarios van en es/)
  stage(spanish, 'nuevo.js', es)
  blocked('comments', commit(spanish), /recorrelos/)
})

test('el largo frena dentro de una unidad y no encabezándola, y lo duro se aprueba', () => {
  const root = repo({ inlineMax: 2 })
  const header = '// Una.\n// Dos.\n// Tres.\nfunction dos() {\n  return 2\n}\n'
  stage(root, 'cabeza.js', header)
  blocked('comments', commit(root), /recorrelos/)
  stage(root, 'cuerpo.js', 'function tres() {\n  // Una.\n  // Dos.\n  // Tres.\n  return 3\n}\n')
  const message = messageOf('comments', commit(root))
  assert.match(message, /cuerpo\.js:2: 3 líneas dentro de una unidad \(máximo 2\)/)
  assert.doesNotMatch(message, /cabeza\.js:1/)
  pasteApproval(root, message)
  // Aprobar lo duro no saltea la pasada: lo que levanta la persona es lo declarado, no R11.
  const listed = messageOf('comments', commit(root))
  assert.match(listed, /recorrelos/)
  assert.doesNotThrow(() => execute('comments', commit(root, `CAUCE_COMMENTS_REVIEWED=${tokenIn(listed)} `)))
})

test('los bloques: lo de después de código cuenta, una marca entre comillas no, y el shebang tampoco', () => {
  const js = CM.commentBlocks('a.js',
    'const u = "http://x" // la de verdad\nconst v = \'a // no\'\n/* uno\n * dos */\n')
  assert.deepEqual(js.map((one) => [one.start, one.end, one.lines.map((line) => line.text)]),
    [[1, 1, ['la de verdad']], [3, 4, ['uno', 'dos']]])
  const sh = CM.commentBlocks('a.sh', '#!/usr/bin/env bash\n# Encabezado.\necho "#no" # sí\n')
  assert.deepEqual(sh.map((one) => one.lines[0].text), ['Encabezado.', 'sí'])
  assert.deepEqual(CM.commentBlocks('a.md', '// no es código\n'), [])
  assert.equal(CM.languageOf('ok'), null, 'con poco texto no se decide')
  assert.equal(CM.languageOf('the `para los que sin` flag, when set'), 'en', 'lo que va entre backticks es un nombre')
})

test('la configuración rechaza lo que no chequearía nada', () => {
  const base = { project: 'p', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }
  const errors = (comments) => validateOpsConfig({ ...base, comments }).filter((one) => /comments/.test(one))
  assert.deepEqual(errors({}), [])
  assert.deepEqual(errors({ language: 'es', inlineMax: 2 }), [])
  assert.equal(errors({ language: 'fr' }).length, 1)
  assert.equal(errors({ inlineMax: 0 }).length, 1)
  assert.equal(errors({ idioma: 'es' }).length, 1)
  assert.equal(errors([]).length, 1)
})
