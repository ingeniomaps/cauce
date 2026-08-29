'use strict'

// Lo que todo workflow de GitHub Actions de este repositorio cumple, sea cual sea su trabajo: quién
// puede escribir, qué credencial ve cada job y cómo se fijan las acciones. Comparten la palabra
// «workflow» con los recorridos de Cauce y nada más — aquéllos están en `workflows*.test.js`.

const { workflow } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// La cadencia sale de las fuentes de cada cargo y el cron sólo pregunta cuál le toca hoy. Escribirla
// acá como lista de slugs la dejaría mintiendo el día que alguien le cambie las fuentes a un cargo,
// que es el mismo motivo por el que la matriz ya salía del árbol.
// `setup-node` v7 enciende el caché de npm por defecto cuando `package.json` declara `packageManager`,
// y ese caché exige un lock file. Este repo no tiene dependencias —ni una— así que no hay lock, y el
// paso falla entero: el CI se cayó en 16 segundos con el bump. El input ni siquiera existía en v4, así
// que revisar que los inputs que pasábamos siguieran ahí no podía verlo. Lo que se rompe es un default.
test('ningún setup-node deja encendido el caché que este repo no puede alimentar', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  const usos = []
  for (const name of fs.readdirSync(dir).filter((one) => one.endsWith('.yml'))) {
    const lineas = fs.readFileSync(path.join(dir, name), 'utf8').split('\n')
    lineas.forEach((linea, i) => {
      if (!/uses:\s*actions\/setup-node@/.test(linea)) return
      // El bloque `with:` de ese paso: hasta la próxima línea con menos sangría.
      const bloque = []
      for (let j = i + 1; j < lineas.length && (!lineas[j].trim() || lineas[j].startsWith('        ')); j += 1) {
        bloque.push(lineas[j])
      }
      usos.push({
        at: `${name}:${i + 1}`,
        apagado: bloque.some((one) => /package-manager-cache:\s*false/.test(one)),
      })
    })
  }
  assert.ok(usos.length, 'se encontró al menos un setup-node')
  assert.deepEqual(usos.filter((one) => !one.apagado).map((one) => one.at), [],
    'un setup-node sin package-manager-cache: false busca un lock file que no existe')
})

// El agente de investigación ingiere contenido web que nadie controla. Mientras corría en el mismo
// job que la credencial de escritura, cualquier instrucción que viniera en una página tenía un
// repositorio a mano. Ahora el informe sale por artifact y el commit lo hace otro job sin modelo.
test('quien corre el agente no puede escribir, y quien escribe no tiene la credencial', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  const jobs = source.split(/\n  (?=[a-z][a-z-]*:\n)/)
  const find = (name) => jobs.find((block) => block.trimStart().startsWith(`${name}:`)) || ''

  const research = find('research')
  assert.ok(research.includes('ANTHROPIC_API_KEY'), 'research es quien usa el modelo')
  assert.equal(/contents:\s*write/.test(research), false, 'y no puede escribir el repositorio')
  assert.ok(research.includes('upload-artifact'), 'entrega el informe por artifact')

  const pr = find('research-pr')
  assert.match(pr, /contents:\s*write/, 'research-pr es quien commitea')
  assert.equal(pr.includes('ANTHROPIC_API_KEY'), false, 'y no toca ningún modelo')
  assert.ok(pr.includes('agents list --json'), 'el destino se resuelve acá, no viene en el artifact')

  // El default del workflow tiene que ser el mínimo: si fuera `write`, un job nuevo nacería pudiendo
  // escribir sin que nadie lo decidiera.
  assert.match(source.slice(0, source.indexOf('jobs:')), /permissions:\n  contents: read/)
})

// Un tag de acción es mutable: quien controle el repositorio de la acción puede moverlo a otro commit,
// y el workflow que lo usa ejecuta código nuevo sin que cambie una línea acá.
test('las acciones están fijadas por SHA, no por tag', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const match of source.matchAll(/uses:\s*([^\s]+)/g)) {
      assert.match(match[1], /@[0-9a-f]{40}$/, `${name}: ${match[1]} no está fijada por SHA`)
    }
  }
})
