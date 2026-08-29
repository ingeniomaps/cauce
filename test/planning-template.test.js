'use strict'

// El molde y su documentación contra lo que el motor realmente acepta: que una copia de la
// plantilla se active tal cual, que el README enumere las piezas que existen y que el vocabulario
// tenga un solo dueño. Una guía que promete algo que el validador rechaza se descubre usándola.

const { tempRoot, run, workflow } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../engine/planning/parser')

// El lane estaba escrito en cuatro lugares y ninguno era el dueño: el regex del parser, el contrato y
// las descripciones del PROTOCOL, y dos schemas más el prompt del clasificador en el workflow. Un
// workflow corre en sandbox y no puede importar el motor, así que la única atadura posible es ésta:
// el motor manda y el test falla cuando una copia se despega.
test('el vocabulario de lanes tiene un dueño y las copias no se despegan', () => {
  const P = require('../engine/planning/parser')
  assert.deepEqual(P.LANES, ['express', 'directo', 'lite', 'full'], 'en orden de ceremonia creciente')

  const raiz = path.resolve(__dirname, '..')
  const protocolo = fs.readFileSync(path.join(raiz, 'template', 'planning', 'PROTOCOL.md'), 'utf8')
  assert.ok(protocolo.includes(`[${P.LANES.join('|')}]`), 'el contrato de tarea enumera los lanes')
  const seccion = protocolo.split(/^##\s+/m).find((parte) => /^Lanes/.test(parte))
  const descritos = [...seccion.matchAll(/^- `([a-z]+)`/gm)].map((match) => match[1])
  assert.deepEqual(descritos, P.LANES, 'y cada uno tiene su criterio escrito, en el mismo orden')

  const workflow = fs.readFileSync(path.join(raiz, 'automatization', 'workflows', 'autobuild.js'), 'utf8')
  const enums = [...workflow.matchAll(/enum:\s*\[([^\]]*)\]/g)]
    .map((match) => match[1].split(',').map((item) => item.trim().replace(/^'|'$/g, '')))
    .filter((values) => values.includes('express'))
  assert.equal(enums.length, 2, 'los dos schemas que aceptan un lane')
  for (const values of enums) {
    assert.deepEqual(values.filter(Boolean), P.LANES, 'cada schema enumera los mismos lanes')
  }
  for (const lane of P.LANES) {
    assert.ok(workflow.includes(`\`${lane}\``), `el prompt del clasificador nombra ${lane}`)
  }
})

// La tabla del README enumera las piezas de planning, y una tabla completa afirma completitud aunque
// ninguna frase lo diga: `reports/` existía con su propio README y no figuraba, así que nadie iba a
// pedir después lo que nada indicaba que faltara.
test('el README de planning enumera todas las piezas que existen', () => {
  const raiz = path.resolve(__dirname, '..', 'template', 'planning')
  const readme = fs.readFileSync(path.join(raiz, 'README.md'), 'utf8')
  const piezas = fs.readdirSync(raiz, { withFileTypes: true })
    .filter((entry) => entry.name !== 'README.md' && !entry.name.startsWith('.'))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  for (const pieza of piezas) {
    assert.ok(readme.includes(`\`${pieza}\``), `README no menciona ${pieza}`)
  }
})

// Una plantilla existe para copiarse, así que no puede traer nada que haya que borrar para que la copia
// funcione. La guía sobre el marcador de ambigüedad contenía el marcador, y toda épica nacida de acá
// fallaba al activarse por un renglón de instrucciones. La guía vive en el README, que no se copia.
test('una copia de la plantilla de épica se activa tal cual', () => {
  const base = tempRoot('cauce-plantilla-epica-')
  const planning = path.join(base, 'planning')
  const molde = path.resolve(__dirname, '..', 'template', 'planning')
  fs.cpSync(molde, planning, { recursive: true })

  const plantilla = fs.readFileSync(path.join(molde, 'roadmap', 'epic-000-template.md'), 'utf8')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-alta.md'), plantilla
    .replace(/^epic: 000$/m, 'epic: 001')
    .replace(/^status: template$/m, 'status: active')
    .replace(/^title: .*$/m, 'title: Alta de cuenta'))
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **slug-de-historia** [lite] — x. (→ C1) (epic: 001) (service: ruta)
- [ ] **slug-del-borde** [lite] — x. (→ C2) (epic: 001) (service: ruta)
`)
  const errores = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /epic-001|BACKLOG/.test(error))
  assert.deepEqual(errores, [], 'la copia no arrastra nada que haya que borrar')
})

// El README declara qué rango vive en cada archivo para no tener que grepear, y un rango que envejece
// es peor que ninguno: manda a buscar una regla donde ya no está. Se contrasta contra los archivos.
test('los rangos que declara el README de reglas son los que hay', () => {
  const rules = path.resolve(__dirname, '..', 'template', 'planning', 'rules')
  const readme = fs.readFileSync(path.join(rules, 'README.md'), 'utf8')
  const declarado = [...readme.matchAll(/^- `system\/([a-z-]+\.md)` — ([^:]+):/gm)]
  assert.ok(declarado.length >= 4, 'el README declara un rango por archivo del sistema')

  const expandir = (texto) => texto.split(',').flatMap((parte) => {
    const rango = parte.trim().match(/^R(\d+)\.\.R(\d+)$/)
    if (!rango) return [parte.trim()]
    const desde = Number(rango[1])
    return Array.from({ length: Number(rango[2]) - desde + 1 }, (_, paso) => `R${desde + paso}`)
  })

  const cubiertos = new Set()
  for (const [, archivo, rango] of declarado) {
    const reales = [...fs.readFileSync(path.join(rules, 'system', archivo), 'utf8')
      .matchAll(/^##\s+(R\d+)\s+[—-]/gm)].map((match) => match[1])
    assert.deepEqual(expandir(rango).sort(), reales.sort(), `el rango de ${archivo} no es el que hay`)
    for (const id of reales) cubiertos.add(id)
  }

  // Y ningún archivo del sistema queda sin declarar.
  const archivos = fs.readdirSync(path.join(rules, 'system')).filter((name) => name.endsWith('.md'))
  assert.equal(declarado.length, archivos.length, 'cada archivo del sistema tiene su línea')
  assert.equal(cubiertos.size, 22, 'las veintidós reglas están declaradas en alguna línea')
})

// La misma lección que la plantilla de épica: lo que se copia no puede traer algo que haya que borrar
// para que la copia valga. El molde de ADR traía el menú de estado entero, y tres decisiones reales se
// publicaron con él intacto.
test('una copia de la plantilla de ADR se valida tal cual', () => {
  const base = tempRoot('cauce-plantilla-adr-')
  const planning = path.join(base, 'planning')
  const molde = path.resolve(__dirname, '..', 'template', 'planning')
  fs.cpSync(molde, planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'adr', '001-algo.md'),
    fs.readFileSync(path.join(molde, 'adr', '000-template.md'), 'utf8'))

  const errores = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /adr\//.test(error))
  assert.deepEqual(errores, [], 'la copia nace válida y en Propuesto')
})
