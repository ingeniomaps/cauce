'use strict'

// Lo que todo workflow de GitHub Actions de este repositorio cumple, sea cual sea su trabajo: quién
// puede escribir, qué credencial ve cada job y cómo se fijan las acciones. Comparten la palabra
// «workflow» con los recorridos de Cauce y nada más — aquéllos están en `workflows*.test.js`.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// `setup-node` v7 enciende el caché de npm por defecto cuando `package.json` declara `packageManager`,
// y ese caché exige un lock file. Este repo no tiene dependencias —ni una— así que no hay lock, y el
// paso falla entero: el CI se cayó en 16 segundos con el bump. El input ni siquiera existía en v4, así
// que revisar que los inputs que pasábamos siguieran ahí no podía verlo. Lo que se rompe es un default.
test('ningún setup-node deja encendido el caché que este repo no puede alimentar', () => {
  const dir = path.resolve(__dirname, '..', '..', '.github', 'workflows')
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
  const file = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'agent-learning.yml')
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
  const dir = path.resolve(__dirname, '..', '..', '.github', 'workflows')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const match of source.matchAll(/uses:\s*([^\s]+)/g)) {
      assert.match(match[1], /@[0-9a-f]{40}$/, `${name}: ${match[1]} no está fijada por SHA`)
    }
  }
})

// Cada `run:` con su cuerpo: los de bloque —`run: |`— y los de una línea. Se arma acá y no en el
// soporte compartido porque lo usa una sola prueba, y un helper con un solo llamador es una copia
// esperando a divergir.
function runBlocks(source) {
  const lines = source.split('\n')
  const bloques = []
  for (let i = 0; i < lines.length; i += 1) {
    const found = lines[i].match(/^(\s*)run:\s*(.*)$/)
    if (!found) continue
    const [, sangria, resto] = found
    if (!/^[|>]/.test(resto)) { bloques.push(resto); continue }
    const cuerpo = []
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() && !lines[j].startsWith(`${sangria} `)) break
      cuerpo.push(lines[j])
    }
    bloques.push(cuerpo.join('\n'))
  }
  return bloques
}

// Una expresión dentro de un `run:` no llega como dato: se sustituye en el texto del script antes de
// que el shell exista, así que el título de un issue o el nombre de una rama con `$(...)` adentro
// ejecuta lo que traiga. La forma correcta es la que este repositorio ya usa en todos sus bloques:
// «For inline scripts, the preferred approach to handling untrusted input is to set the value
// of the expression to an intermediate environment variable», porque así «the value ... is stored in
// memory and used as a variable, and doesn't interact with the script generation process»
// —docs.github.com, «Secure use reference», consultado 2026-08-29—. Lo que faltaba no era la
// convención sino algo que la sostuviera: se cumple sola hasta el día que alguien la rompe.
test('ningún `run:` interpola una expresión: lo de afuera entra por `env:`', () => {
  const dir = path.resolve(__dirname, '..', '..', '.github', 'workflows')
  let vistos = 0
  for (const name of fs.readdirSync(dir)) {
    for (const cuerpo of runBlocks(fs.readFileSync(path.join(dir, name), 'utf8'))) {
      vistos += 1
      assert.equal(/\$\{\{/.test(cuerpo), false,
        `${name}: un run: interpola una expresión en vez de recibirla por env:`)
    }
  }
  // Sin esto la prueba pasa igual el día que `runBlocks` deje de encontrar nada, que es la única forma
  // de que una aserción sobre ausencias mienta.
  assert.ok(vistos >= 25, `se esperaban los run: de los cuatro workflows y aparecieron ${vistos}`)
})

// Las dos garantías se aserían sobre `agent-learning.yml` y no sobre los otros tres, que las cumplen
// hoy sin que nada las sostenga. Un default `write` deja que un job nuevo nazca pudiendo escribir sin
// que nadie lo decida, y un job sin `timeout-minutes` corre hasta el tope del runner: «Each job in a
// workflow can run for up to 6 hours of execution time» —docs.github.com, «Actions limits», consultado
// 2026-08-29—.
test('todo workflow nace sin poder escribir y ningún job hereda las seis horas', () => {
  const dir = path.resolve(__dirname, '..', '..', '.github', 'workflows')
  let jobs = 0
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    const cabecera = source.slice(0, source.indexOf('jobs:'))
    assert.match(cabecera, /^permissions:\n  contents: read$/m, `${name}: el default no es el mínimo`)
    for (const block of source.split(/\n  (?=[a-z][a-z-]*:\n)/)) {
      if (!/\n    runs-on:/.test(block)) continue
      jobs += 1
      assert.match(block, /timeout-minutes:/, `${name}: ${block.trimStart().split(':')[0]} sin timeout`)
    }
  }
  assert.ok(jobs >= 8, `se esperaban los jobs de los cuatro workflows y aparecieron ${jobs}`)
})

// La prueba de pines crea una obligación y no la cumple: un SHA es reproducible y **nunca** recibe un
// arreglo de seguridad por su cuenta, así que sin algo que lo mueva se queda donde está para siempre.
// Quien lo mueve es dependabot, y nada ataba las dos cosas: borrar ese archivo deja la prueba de pines
// en verde y los cuatro pines congelados sin que nada lo diga. La ruta es la que el ecosistema exige:
// «For GitHub Actions, use the value `/`. Dependabot will search the `/.github/workflows` directory»
// —docs.github.com, «Dependabot options reference», consultado 2026-08-29—.
test('los pines por SHA tienen quien los mueva', () => {
  const file = path.resolve(__dirname, '..', '..', '.github', 'dependabot.yml')
  assert.ok(fs.existsSync(file), 'sin dependabot, un pin no recibe nunca un arreglo de seguridad')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /package-ecosystem: github-actions/, 'y lo que hay que mover son las acciones')
  assert.match(source, /directory: \//, 'con la raíz, que es donde busca `.github/workflows`')
})

