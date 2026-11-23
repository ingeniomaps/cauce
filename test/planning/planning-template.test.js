'use strict'

// El molde y su documentación contra lo que el motor realmente acepta: que una copia de la
// plantilla se active tal cual, que el README enumere las piezas que existen y que el vocabulario
// tenga un solo dueño. Una guía que promete algo que el validador rechaza se descubre usándola.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// El lane estaba escrito en cuatro lugares y ninguno era el dueño: el regex del parser, el contrato y
// las descripciones del PROTOCOL, y dos schemas más el prompt del clasificador en el workflow. Un
// workflow corre en sandbox y no puede importar el motor, así que la única atadura posible es ésta:
// el motor manda y el test falla cuando una copia se despega.
// Una regla que nombra un archivo del toolkit manda a escribir donde `upgrade` pasa por encima: lo que
// el proyecto escriba ahí desaparece en la siguiente actualización y nada lo avisa. R12 lo hacía —las
// excepciones sobre sistemas externos iban al `AGENTS.md` del proyecto, que el propio `AGENTS.md` dice
// que se reemplaza entero— y no fue un descuido suelto: el día que el mapa se mudó a
// `organization/workspace.md` quedaron tres archivos apuntando al lugar viejo, y éste fue el tercero en
// aparecer, con meses de diferencia entre uno y otro. Lo que faltaba era que el cuarto no dependiera de
// que alguien volviera a leer las reglas enteras.
//
// La lista sale de `SYSTEM_FILES`, que es la misma con la que `upgrade` decide qué reemplaza: escrita a
// mano acá, una de las dos copias envejecería y esta prueba pasaría a cuidar un archivo que ya no es del
// toolkit. Si alguna vez una regla necesita nombrar uno para *leerlo*, esto se pone rojo y se decide;
// hoy ninguna lo hace.
test('ninguna regla del sistema manda a escribir en un archivo que `upgrade` reemplaza', () => {
  const dir = path.resolve(__dirname, '..', '..', 'template', 'planning', 'rules', 'system')
  const O = require('../../engine/core/ownership')
  // Por nombre de archivo y sin repetir: tres rutas de `SYSTEM_FILES` terminan en `AGENTS.md`, y
  // nombrarlas todas convertía un hallazgo en tres líneas que señalan archivos que la regla no nombró.
  const owned = new Set(O.SYSTEM_FILES.map((one) => path.basename(one)))
  const named = []

  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const name of owned) if (text.includes(name)) named.push(`${file} nombra ${name}`)
  }

  assert.deepEqual(named, [], `una regla manda a un archivo del toolkit:\n  ${named.join('\n  ')}`)
})

// La pasada que contrasta la línea de una tarea contra su propia descripción es prosa, así que se borra
// sin que nada falle — y es justo lo que no puede pasar: `check` valida la forma de la línea y ninguna
// fase la revisa después, porque cualquiera donde viviera es una que su propio carril puede saltar.
//
// Se afirman los tres ejes que la vuelven accionable y no la redacción: reescribirla conservándolos deja
// la regla viva, que es lo que hay que cuidar. Perder uno la deja pareciendo completa y cubriendo menos,
// que es la forma que R15 nombra.
test('el protocolo manda contrastar la línea de una tarea contra su descripción', () => {
  const root = path.resolve(__dirname, '..', '..')
  const protocol = fs.readFileSync(path.join(root, 'template', 'planning', 'PROTOCOL.md'), 'utf8')
  const lanes = protocol.split(/^##\s+/m).find((part) => /^Lanes/.test(part))
  assert.ok(lanes, 'la sección Lanes existe')

  for (const [axis, pattern] of [
    ['la aceptación cubre lo que la descripción promete', /descripción frase por frase/],
    ['el carril se lee contra la superficie', /carril contra la superficie/],
    ['el cast entrega a quien construye', /cast entregue a quien construye/],
  ]) {
    assert.match(lanes, pattern, `la pasada perdió el eje: ${axis}`)
  }
})

// R29 exige la mutación desde siempre —antes en R9, de donde salió en el caso 440—; lo nuevo es que quede
// **escrita**. Se afirma por ejes y no por redacción, por lo mismo que la pasada de lanes de acá arriba.
//
// Lo propio de éste es qué se pierde si se cae: la mutación que no se escribió no la puede reponer quien
// revisa, sólo rehacerla. Los tres ejes se comprobaron por separado — quitar cualquiera de los tres deja
// la puerta en rojo sola.
test('R29 pide que la mutación se declare, no sólo que se corra', () => {
  const root = path.resolve(__dirname, '..', '..')
  const testing = fs.readFileSync(path.join(root, 'template', 'planning', 'rules', 'system', 'proof.md'), 'utf8')
  const r29 = testing.split(/^##\s+/m).find((part) => /^R29\b/.test(part))
  assert.ok(r29, 'R29 existe en proof.md')

  for (const [axis, pattern] of [
    ['la mutación se escribe, no sólo se corre', /mutación se declara por escrito/],
    ['dice qué romper y qué tiene que ponerse rojo', /qué se rompe\s*\n?\s*y qué prueba tiene que ponerse roja/],
    ['sin eso, revisar obliga a volver a correrla', /volver a correrla/],
  ]) {
    assert.match(r29, pattern, `R29 perdió el eje: ${axis}`)
  }
})

// El umbral de R17 son cinco condiciones y nunca decía qué es una, así que no se podía contar. Se afirma
// por ejes y no por redacción, igual que las dos pasadas de acá arriba.
//
// Lo propio de éste es que la simetría es la mitad que importa: contar de más parte lo que era uno solo
// —se ve y se corrige—, y contar de menos no dispara nada y se lee igual que una unidad chica. Un eje
// por cada dirección, y la prueba operable aparte, que es lo único que se puede aplicar sin criterio.
test('R17 dice qué cuenta como una condición, en las dos direcciones', () => {
  const root = path.resolve(__dirname, '..', '..')
  const processRules = fs.readFileSync(path.join(root, 'template', 'planning', 'rules', 'system', 'process.md'), 'utf8')
  const r17 = processRules.split(/^##\s+/m).find((part) => /^R17\b/.test(part))
  assert.ok(r17, 'R17 existe en process.md')

  for (const [axis, pattern] of [
    ['una condición es un resultado, no una viñeta', /resultado que se puede mirar por separado/],
    ['contar de más parte lo que era uno solo', /mismo invariante[\s\S]{0,120}\*\*una\*\* condición/],
    ['contar de menos no dispara nada', /Contar de menos no dispara nada/],
    ['y hay una prueba que no pide criterio', /se pueden entregar por separado/],
  ]) {
    assert.match(r17, pattern, `R17 perdió el eje: ${axis}`)
  }
})


// Se afirma por ejes y no por redacción, igual que las pasadas de acá arriba.
//
// Lo propio de éste es el segundo eje, que es el que la vuelve cumplible: la firma no la tipea nadie, la
// agrega la herramienta al final de lo que uno escribió. Una regla que sólo dijera «no la escribas» se
// cumple creyendo que se cumplió, porque nunca se escribió — y sale publicada igual.
test('R8 prohíbe la firma de IA en todo lo que se publica, no sólo en el commit', () => {
  const root = path.resolve(__dirname, '..', '..')
  const commits = fs.readFileSync(path.join(root, 'template', 'planning', 'rules', 'system', 'commits.md'), 'utf8')
  const r8 = commits.split(/^##\s+/m).find((part) => /^R8\b/.test(part))
  assert.ok(r8, 'R8 existe en commits.md')

  for (const [axis, pattern] of [
    ['cubre todo lo publicado, no sólo el commit', /cubre todo lo que este trabajo publica/],
    ['nombra dónde: título, cuerpo y comentarios', /título y el cuerpo del pull request[\s\S]{0,60}comentarios/],
    ['la agrega la herramienta, no la tipea nadie', /lo agrega la herramienta, sola/],
    ['por eso se cumple revisando la salida', /revisar la salida antes de publicarla/],
  ]) {
    assert.match(r8, pattern, `R8 perdió el eje: ${axis}`)
  }
})

// Como las de arriba, por ejes. Lo propio de éste es el tercer eje. Los dos primeros se pueden leer como
// una preferencia de flujo; el
// que los vuelve regla es que el daño no se deshace — el PR mal apuntado ya se vio, ya notificó, y
// cerrarlo no borra nada de eso. Sin él, «va al fork» se negocia el día que apura.
test('R10 dice a dónde va lo que se publica, no sólo quién lo autoriza', () => {
  const root = path.resolve(__dirname, '..', '..')
  const commits = fs.readFileSync(path.join(root, 'template', 'planning', 'rules', 'system', 'commits.md'), 'utf8')
  const r10 = commits.split(/^##\s+/m).find((part) => /^R10\b/.test(part))
  assert.ok(r10, 'R10 existe en commits.md')

  for (const [axis, pattern] of [
    ['la autorización no dice a dónde', /autorización dice si se publica, nunca a dónde/],
    ['va al repo en el que se trabaja, y al fork si lo es', /Si ese remoto es un fork, va al fork/],
    ['la rama se corta de la suya', /rama\s*\n?\s*se corta de la suya/],
    ['que la herramienta lo resuelva no autoriza', /resuelva sola el repositorio de origen no es una/],
    ['y no tiene vuelta atrás', /cerrarlo no deshace nada/],
  ]) {
    assert.match(r10, pattern, `R10 perdió el eje: ${axis}`)
  }
})


// Por ejes, como las anteriores. Lo propio de éste es que la regla tiene dos bordes y sin los dos se
// vuelve su propio opuesto: sin la
// condición de borrado, deprecar es no quitar nunca; sin «lo que nadie llama se borra», es deprecar
// todo. R29 ya decía cómo se prueba una quita y nunca cuándo se puede hacer.
test('R29 dice cuándo se puede quitar lo que está en uso', () => {
  const root = path.resolve(__dirname, '..', '..')
  const testing = fs.readFileSync(path.join(root, 'template', 'planning', 'rules', 'system', 'proof.md'), 'utf8')
  const r29 = testing.split(/^##\s+/m).find((part) => /^R29\b/.test(part))
  assert.ok(r29, 'R29 existe en proof.md')

  for (const [axis, pattern] of [
    ['lo que está en uso se depreca, no se corta', /está en uso no se corta: se depreca/],
    ['la marca dice qué lo reemplaza', /qué lo reemplaza/],
    ['y qué condición permite borrarlo', /qué\s*\n?\s*condición permite borrarlo/],
    ['sin eso queda para siempre', /código muerto con un cartel puesto/],
    ['y lo que nadie llama se borra', /Lo que no llama nadie es otra cosa y se borra/],
  ]) {
    assert.match(r29, pattern, `R29 perdió el eje: ${axis}`)
  }
})

test('el vocabulario de lanes tiene un dueño y las copias no se despegan', () => {
  const P = require('../../engine/planning/parser')
  assert.deepEqual(P.LANES, ['manual', 'express', 'directo', 'lite', 'full'], 'en orden de ceremonia creciente')

  const root = path.resolve(__dirname, '..', '..')
  const protocol = fs.readFileSync(path.join(root, 'template', 'planning', 'PROTOCOL.md'), 'utf8')
  assert.ok(protocol.includes(`[${P.LANES.join('|')}]`), 'el contrato de tarea enumera los lanes')
  const section = protocol.split(/^##\s+/m).find((part) => /^Lanes/.test(part))
  const described = [...section.matchAll(/^- `([a-z]+)`/gm)].map((match) => match[1])
  assert.deepEqual(described, P.LANES, 'y cada uno tiene su criterio escrito, en el mismo orden')

  const workflow = fs.readFileSync(path.join(root, 'automatization', 'workflows', 'autobuild.js'), 'utf8')
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
  const root = path.resolve(__dirname, '..', '..', 'template', 'planning')
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  const pieces = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.name !== 'README.md' && !entry.name.startsWith('.'))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  for (const piece of pieces) {
    assert.ok(readme.includes(`\`${piece}\``), `README no menciona ${piece}`)
  }
})

// Una plantilla existe para copiarse, así que no puede traer nada que haya que borrar para que la copia
// funcione. La guía sobre el marcador de ambigüedad contenía el marcador, y toda épica nacida de acá
// fallaba al activarse por un renglón de instrucciones. La guía vive en el README, que no se copia.
test('una copia de la plantilla de épica se activa tal cual', () => {
  const base = tempRoot('cauce-plantilla-epica-')
  const planning = path.join(base, 'planning')
  const templateText = path.resolve(__dirname, '..', '..', 'template', 'planning')
  fs.cpSync(templateText, planning, { recursive: true })

  const templateDir = fs.readFileSync(path.join(templateText, 'roadmap', 'epic-000-template.md'), 'utf8')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-alta.md'), templateDir
    .replace(/^epic: 000$/m, 'epic: 001')
    .replace(/^status: template$/m, 'status: active')
    .replace(/^title: .*$/m, 'title: Alta de cuenta'))
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **slug-de-historia** [lite] — x. (→ C1) (epic: 001) (service: ruta)
- [ ] **slug-del-borde** [lite] — x. (→ C2) (epic: 001) (service: ruta)
`)
  const errorList = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /epic-001|BACKLOG/.test(error))
  assert.deepEqual(errorList, [], 'la copia no arrastra nada que haya que borrar')
})

// Una regla de merge que nombra un archivo que el molde ya no trae no falla: deja de aplicarse, y el
// conflicto que evitaba vuelve sin que nadie relacione una cosa con la otra. Es la misma clase de
// silencio que el `continue` de `upgrade`, un nivel más abajo.
// Rutas que una regla de merge nombra y el molde no puede traer porque no existen hasta que alguien las
// usa. Cada una con su razón, porque la exención es lo que le saca fuerza a la comprobación: sin la
// lista, la salida barata sería aflojar el guard para todos.
const CREATED_IN_USE = {
  'planning/done/human-actions.md':
    'La escribe `ops archive human-actions` la primera vez que hay una fila resuelta. El molde trae el '
    + 'directorio y no el archivo, porque un histórico vacío no es un histórico.',
}

test('las reglas de merge del molde apuntan a archivos que el molde trae', () => {
  const templateText = path.resolve(__dirname, '..', '..', 'template')
  const rules = fs.readFileSync(path.join(templateText, '.gitattributes'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/)[0])

  assert.ok(rules.length, 'el molde declara al menos una regla de merge')
  const broken = rules.filter((route) => !CREATED_IN_USE[route] && !fs.existsSync(path.join(templateText, route)))
  assert.deepEqual(broken, [], `el molde no trae: ${broken.join(', ')}`)

  // Y una exención que ya no hace falta se retira: si el molde pasa a traer el archivo, la lista queda
  // cuidando algo que nadie necesita y esconde el próximo caso real.
  for (const route of Object.keys(CREATED_IN_USE)) {
    assert.ok(rules.includes(route), `${route}: exenta y ninguna regla la nombra`)
    assert.equal(fs.existsSync(path.join(templateText, route)), false, `${route}: el molde ya la trae; sacala`)
    // El directorio sí tiene que estar: si no, la ruta está mal escrita y nadie se entera.
    assert.ok(fs.existsSync(path.join(templateText, path.dirname(route))), `${route}: su directorio no existe`)
  }
})

// El README declara qué rango vive en cada archivo para no tener que grepear, y un rango que envejece
// es peor que ninguno: manda a buscar una regla donde ya no está. Se contrasta contra los archivos.
test('los rangos que declara el README de reglas son los que hay', () => {
  const rules = path.resolve(__dirname, '..', '..', 'template', 'planning', 'rules')
  const readme = fs.readFileSync(path.join(rules, 'README.md'), 'utf8')
  const declared = [...readme.matchAll(/^- `system\/([a-z-]+\.md)` — ([^:]+):/gm)]
  assert.ok(declared.length >= 4, 'el README declara un rango por archivo del sistema')

  const expand = (text) => text.split(',').flatMap((part) => {
    const range = part.trim().match(/^R(\d+)\.\.R(\d+)$/)
    if (!range) return [part.trim()]
    const from = Number(range[1])
    return Array.from({ length: Number(range[2]) - from + 1 }, (_, step) => `R${from + step}`)
  })

  const covered = new Set()
  for (const [, file, range] of declared) {
    const actual = [...fs.readFileSync(path.join(rules, 'system', file), 'utf8')
      .matchAll(/^##\s+(R\d+)\s+[—-]/gm)].map((match) => match[1])
    assert.deepEqual(expand(range).sort(), actual.sort(), `el rango de ${file} no es el que hay`)
    for (const id of actual) covered.add(id)
  }

  // Y ningún archivo del sistema queda sin declarar.
  const files = fs.readdirSync(path.join(rules, 'system')).filter((name) => name.endsWith('.md'))
  assert.equal(declared.length, files.length, 'cada archivo del sistema tiene su línea')
  assert.equal(covered.size, 29, 'las veintinueve reglas están declaradas en alguna línea')
})

// La misma lección que la plantilla de épica: lo que se copia no puede traer algo que haya que borrar
// para que la copia valga. El molde de ADR traía el menú de estado entero, y tres decisiones reales se
// publicaron con él intacto.
test('una copia de la plantilla de ADR se valida tal cual', () => {
  const base = tempRoot('cauce-plantilla-adr-')
  const planning = path.join(base, 'planning')
  const templateText = path.resolve(__dirname, '..', '..', 'template', 'planning')
  fs.cpSync(templateText, planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'adr', '001-algo.md'),
    fs.readFileSync(path.join(templateText, 'adr', '000-template.md'), 'utf8'))

  const errorList = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /adr\//.test(error))
  assert.deepEqual(errorList, [], 'la copia nace válida y en Propuesto')
})
