'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { codeOnly } = require('../support/lexer')

// Un `/` abre un regex o divide, y hasta 0.78.0 el lexer no lo decidía: leía el `//` que queda al
// cerrar un regex escapado como el arranque de un comentario y se comía el resto de la línea. Las dos
// direcciones van juntas porque una sola deja pasar a la otra — un lexer que tratara toda barra como
// regex pasaría las tres primeras y se comería cada división.
test('una barra se lee como regex o como división según lo que tenga delante', () => {
  const casos = [
    ['const p = u.replace(/x\\//g, "") + noExiste(1)\n', /noExiste\(1\)/,
      'lo que sigue a un regex con // adentro tiene que quedar a la vista'],
    ['const x = t.replace(/^["\']+/g, "")\nconst z = "prosa."\n', /^(?!.*prosa)[\s\S]*$/,
      'y una comilla adentro del regex no puede volver código a la prosa que sigue'],
    ['const r = /[a-z/]+/g\nconst sigue = otro.campo\n', /otro\.campo/,
      'una barra dentro de una clase no cierra el regex'],
    ['if (x) return /ab/.test(y)\n', /^(?!.*ab)[\s\S]*test/,
      'después de `return` la barra abre un regex, aunque `return` termine en letra'],
    ['const media = total / dos\n', /total \/ dos/, 'una división sigue siendo una división'],
    ['const m = (a + b) / 2\n', /\) \/ 2/, 'y también la que viene después de un paréntesis'],
    ['const r = a / b / c\n', /a \/ b \/ c/,
      'dos divisiones en una línea no son un regex entre medio, que es lo que parecen'],
    ['const a = /sin cerrar\nconst b = x.y / z\n', /x\.y/,
      'un regex no cruza líneas: lo que no cierra en la suya no era uno y no se traga la siguiente'],
  ]
  for (const [fuente, espera, porque] of casos) {
    assert.match(codeOnly(fuente), espera, porque)
  }
})

// Lo que el lexer ya hacía antes de saber de regex, acá para que enseñarle no se lo lleve puesto: el
// caso que originó `codeOnly` fue un template anidado dentro de una interpolación (`autobuild` los
// tiene), y el `/*` de un comentario de bloque se parece a un regex que arranca con `*`.
test('los literales que el lexer ya leía siguen leyéndose igual', () => {
  assert.match(codeOnly('const a = 1 /* nota */ + 2\nconst z = "prosa."\n'), /1\s+\+ 2/,
    'un comentario de bloque no es un regex, aunque quepa uno en ese lugar')
  assert.doesNotMatch(codeOnly('const s = "hola mundo"\n'), /hola/, 'una cadena no deja rastro')
  assert.doesNotMatch(codeOnly('const t = `afuera ${`adentro ${x.y}`} fin`\nconst z = "prosa."\n'),
    /afuera|adentro|prosa/, 'ni un template anidado dentro de una interpolación')
  assert.match(codeOnly('const t = `afuera ${x.y} fin`\n'), /x\.y/,
    'y lo que sí es código adentro de una interpolación se conserva')
})

// La medición que abrió el caso 084: nueve recorridos, cuarenta literales de regex, y cuatro líneas en
// dos de ellos que el lexer viejo truncaba. Se comprueba sobre los recorridos reales porque lo que el
// caso afirmaba —«hoy ninguno usa un regex»— era falso, y quien lo vuelva a afirmar tiene acá el número.
test('los recorridos que hoy existen se desnudan enteros, con sus regex adentro', () => {
  const path = require('node:path')
  const fs = require('node:fs')
  const A = require('../../engine/automation')
  const WF = path.resolve(__dirname, '..', '..', 'automatization', 'workflows')
  const automation = path.resolve(__dirname, '..', '..', 'automatization')
  const files = []
  for (const one of fs.readdirSync(WF, { withFileTypes: true, recursive: true })) {
    if (one.isFile() && one.name.endsWith('.js')) files.push(path.join(one.parentPath, one.name))
  }
  assert.ok(files.length >= 8, 'el recorrido encontró los workflows')
  for (const file of files) {
    const source = A.render(file, '{{OPS_DIR}}', automation, '{{OPS_ROOT}}')
    // Se mide el balance de paréntesis y corchetes, que es lo que el modo de fallo rompe: comerse el
    // resto de una línea deja abiertos los que esa línea cerraba. Contar líneas no sirve —un template
    // multilínea se va entero y con razón—, y esto no depende de qué diga cada recorrido.
    const abiertos = { '(': 0, '[': 0 }
    for (const ch of codeOnly(source)) {
      if (ch in abiertos) abiertos[ch] += 1
      if (ch === ')') abiertos['('] -= 1
      if (ch === ']') abiertos['['] -= 1
    }
    assert.deepEqual(abiertos, { '(': 0, '[': 0 },
      `${path.relative(WF, file)}: el lexer se comió el cierre de algo`)
  }
})
