'use strict'

// Caso 531: un enlace relativo roto en `planning/` u `organization/` se avisa en `check`. El molde no trae ninguno, lo
// que es ejemplo —un bloque de código, un placeholder de plantilla, lo cerrado en done/— no cuenta, y es aviso.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const L = require('../../engine/planning/links')

const ROOT = path.join(__dirname, '..', '..')

test('el molde no trae enlaces rotos', () => {
  assert.deepEqual(L.linkWarnings(path.join(ROOT, 'template')), [])
})

test('avisa el archivo que no existe y el ancla que falta, y deja pasar lo que no es un enlace del árbol', () => {
  const ops = tempRoot('cauce-enlaces-')
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(ops, rel)), { recursive: true })
    fs.writeFileSync(path.join(ops, rel), text)
  }
  write('planning/PROTOCOL.md', '# Protocolo\n\n## Gates de arranque\n\n## Cierre — final\n\n## Cierre — final\n'
    + '\n<a id="a-mano"></a>\n')
  write('organization/company.md', '# Empresa\n')
  write('planning/done/vieja.md', '[roto](./no-existe.md)\n')
  write('planning/rules/README.md', [
    '[bien](../PROTOCOL.md#gates-de-arranque) [repetido](../PROTOCOL.md#cierre--final-1)',
    '[a mano](../PROTOCOL.md#a-mano) [carpeta](../done) [empresa](../../organization/company.md)',
    '[web](https://ejemplo.com/x) [correo](mailto:a@b.c) [local](#nada) [absoluta](/etc/x)',
    '[plantilla](../adr/NNN-slug.md) [llaves]({{ruta}}) [en código](`./x.md`) `[span](./y.md)`',
    '```md\n[ejemplo](./no-existe.md)\n```',
    '[falta](../no-existe.md) [sin ancla](../PROTOCOL.md#no-existe) [con espacio](./mi%20archivo.md)',
    '[mal codificado](./x%E0.md)',
    '1. paso\n   ```md\n   [indentado](./no-existe.md)\n   ```\n<!-- [comentado](./no-existe.md) -->',
  ].join('\n'))
  write('organization/roles/a.md', '[roto](../no-esta.md)\n')
  assert.deepEqual(L.linkWarnings(ops).sort(), [
    'planning/rules/README.md: el enlace a ../no-existe.md apunta a un archivo que no existe',
    'planning/rules/README.md: el enlace a ../PROTOCOL.md#no-existe apunta a un ancla que PROTOCOL.md no tiene',
    'planning/rules/README.md: el enlace a ./mi%20archivo.md apunta a un archivo que no existe',
    'planning/rules/README.md: el enlace a ./x%E0.md apunta a un archivo que no existe',
    'planning/rules/README.md: el enlace a #nada apunta a un ancla que README.md no tiene',
    'organization/roles/a.md: el enlace a ../no-esta.md apunta a un archivo que no existe',
  ].sort())
  write('planning/rules/mi archivo.md', '# Mío\n')
  assert.doesNotMatch(L.linkWarnings(ops).join('\n'), /mi%20archivo/, 'un %20 se decodifica')
  assert.ok(L.anchorsOf('## Uno\n```\n## No\n```\n## Uno\n').has('uno-1'))
  assert.ok(!L.anchorsOf('## Uno\n```\n## No\n```\n').has('no'), 'un título en un bloque de código no cuenta')
  const seen = L.anchorsOf('## El `service:` de una tarea\n\n## Ver [la guía](./g.md)\n## Siguiente\n'
    + '<a id="Mayus"></a>\n'
    + '1. paso\n   ```md\n   ## Adentro\n   ```\n````md\n```\n## Envuelto\n```\n````\n<!-- ## Comentado -->\n')
  for (const one of ['el-service-de-una-tarea', 'ver-la-guía', 'siguiente', 'mayus']) assert.ok(seen.has(one), one)
  for (const one of ['adentro', 'envuelto', 'comentado']) assert.ok(!seen.has(one), one)
  assert.ok(!L.anchorsOf('##\n\nTexto suelto\n').has('texto-suelto'), 'un título vacío no se come la siguiente')
  // Un fence cierra con uno igual o más largo del mismo carácter, y uno sin cierre llega hasta el final.
  assert.ok(L.anchorsOf('```\n## No\n````\n## Sí\n').has('sí'))
  assert.ok(!L.anchorsOf('```\n## No\n~~~\n## Tampoco\n').has('tampoco'))
  assert.ok(!L.anchorsOf('## Antes\n```\n## Nunca\n').has('nunca'))
  // Lineal: un título con miles de espacios y cientos de aperturas sin cierre no cuelgan check.
  const started = Date.now()
  L.anchorsOf(`# a${' '.repeat(50000)}b\n${'```js\n'.repeat(16000)}${'<!--'.repeat(250000)}`)
  L.anchorsOf(`${'{#'.repeat(40000)}\n# ${'[x'.repeat(30000)}\n`)
  assert.ok(Date.now() - started < 2000, `tardó ${Date.now() - started} ms`)
  // Una línea de backticks que repite backticks no abre un bloque.
  assert.ok(L.anchorsOf('``` `x` ```\n## Después\n').has('después'))
  const titles = L.anchorsOf('## C#\n## Título ##\n## ##\n##Pegado\n<!-- ## Oculto\n## Tampoco\n')
  assert.deepEqual([...titles], ['c', 'título'])
  assert.ok(L.anchorsOf('Usá `<!--` para comentar.\n## Después\n').has('después'), 'un `<!--` citado no abre')
  // Un backtick suelto dentro del comentario no se empareja con uno de afuera ni tapa el cierre.
  assert.ok(L.anchorsOf('<!-- usa ` para código --> ver `x\n## Después\n').has('después'), 'el comentario cierra')
  assert.ok(!L.anchorsOf('a `\n<!--\n## Oculto\n-->\n`b\n').has('oculto'), 'un span no cruza la línea')
  assert.ok(L.anchorsOf('## Final\nfin `x` y un ` suelto').has('final'), 'un span en la última línea, sin salto')
})

test('una tira de enlaces sin cerrar no cuelga check', () => {
  const ops = tempRoot('cauce-enlaces-costo-')
  fs.mkdirSync(path.join(ops, 'planning'))
  fs.writeFileSync(path.join(ops, 'planning', 'a.md'), `${'](x'.repeat(100000)}\n`)
  const started = Date.now()
  assert.deepEqual(L.linkWarnings(ops), [])
  assert.ok(Date.now() - started < 2000, `tardó ${Date.now() - started} ms`)
})

test('mira también los enlaces entre <…>, los de referencia y los títulos setext', () => {
  const ops = tempRoot('cauce-enlaces-formas-')
  fs.mkdirSync(path.join(ops, 'planning'))
  fs.writeFileSync(path.join(ops, 'planning', 'mi guia.md'), '---\ntitulo: x\n---\nSubrayado\n=========\n\n'
    + '- item\n---\n\nOtro\n----\n')
  fs.writeFileSync(path.join(ops, 'planning', 'a.md'), '[bien](<mi guia.md>) [mal](<no esta.md>)\n'
    + '[ref]: ./falta.md\n[ok]: <mi guia.md#subrayado>\n[sub](mi%20guia.md#otro) [no](mi%20guia.md#item)\n'
    + '[fm](mi%20guia.md#titulo-x)\n')
  assert.deepEqual(L.linkWarnings(ops).sort(), [
    'planning/a.md: el enlace a ./falta.md apunta a un archivo que no existe',
    'planning/a.md: el enlace a mi%20guia.md#item apunta a un ancla que mi guia.md no tiene',
    'planning/a.md: el enlace a mi%20guia.md#titulo-x apunta a un ancla que mi guia.md no tiene',
    'planning/a.md: el enlace a no esta.md apunta a un archivo que no existe',
  ])
  assert.equal(L.anchorsOf('- item\n---\n').size, 0, 'tras un ítem de lista, el --- es una regla y no un título')
})

test('check lo avisa sin volverlo error', () => {
  const ops = path.join(tempRoot('cauce-enlaces-check-'), 'ops')
  assert.equal(run(['init', ops, '--name', 'Banco', '--no-install']).status, 0)
  fs.appendFileSync(path.join(ops, 'planning', 'METHODOLOGY.md'), '\n- Ver [diseño](./diseno-borrado.md).\n')
  const out = run(['check', path.join(ops, 'planning')])
  assert.equal(out.status, 0)
  assert.match(out.stdout + out.stderr, /METHODOLOGY\.md: el enlace a \.\/diseno-borrado\.md apunta a un archivo/)
})
