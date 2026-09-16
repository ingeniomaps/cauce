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
  const nombrados = []

  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const name of owned) if (text.includes(name)) nombrados.push(`${file} nombra ${name}`)
  }

  assert.deepEqual(nombrados, [], `una regla manda a un archivo del toolkit:\n  ${nombrados.join('\n  ')}`)
})

// La pasada que contrasta la línea de una tarea contra su propia descripción es prosa, así que se borra
// sin que nada falle — y es justo lo que no puede pasar: `check` valida la forma de la línea y ninguna
// fase la revisa después, porque cualquiera donde viviera es una que su propio carril puede saltar.
//
// Se afirman los tres ejes que la vuelven accionable y no la redacción: reescribirla conservándolos deja
// la regla viva, que es lo que hay que cuidar. Perder uno la deja pareciendo completa y cubriendo menos,
// que es la forma que R15 nombra.
test('el protocolo manda contrastar la línea de una tarea contra su descripción', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const protocolo = fs.readFileSync(path.join(raiz, 'template', 'planning', 'PROTOCOL.md'), 'utf8')
  const lanes = protocolo.split(/^##\s+/m).find((parte) => /^Lanes/.test(parte))
  assert.ok(lanes, 'la sección Lanes existe')

  for (const [eje, patron] of [
    ['la aceptación cubre lo que la descripción promete', /descripción frase por frase/],
    ['el carril se lee contra la superficie', /carril contra la superficie/],
    ['el cast entrega a quien construye', /cast entregue a quien construye/],
  ]) {
    assert.match(lanes, patron, `la pasada perdió el eje: ${eje}`)
  }
})

// R9 exige la mutación desde siempre; lo nuevo es que quede **escrita**. Se afirma por ejes y no por
// redacción, por lo mismo que la pasada de lanes de acá arriba.
//
// Lo propio de éste es qué se pierde si se cae: la mutación que no se escribió no la puede reponer quien
// revisa, sólo rehacerla. Los tres ejes se comprobaron por separado — quitar cualquiera de los tres deja
// la puerta en rojo sola.
test('R9 pide que la mutación se declare, no sólo que se corra', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const commits = fs.readFileSync(path.join(raiz, 'template', 'planning', 'rules', 'system', 'commits.md'), 'utf8')
  const r9 = commits.split(/^##\s+/m).find((parte) => /^R9\b/.test(parte))
  assert.ok(r9, 'R9 existe en commits.md')

  for (const [eje, patron] of [
    ['la mutación se escribe, no sólo se corre', /mutación se declara por escrito/],
    ['dice qué romper y qué tiene que ponerse rojo', /qué se rompe\s*\n?\s*y qué prueba tiene que ponerse roja/],
    ['sin eso, revisar obliga a volver a correrla', /volver a correrla/],
  ]) {
    assert.match(r9, patron, `R9 perdió el eje: ${eje}`)
  }
})

// El umbral de R17 son cinco condiciones y nunca decía qué es una, así que no se podía contar. Se afirma
// por ejes y no por redacción, igual que las dos pasadas de acá arriba.
//
// Lo propio de éste es que la simetría es la mitad que importa: contar de más parte lo que era uno solo
// —se ve y se corrige—, y contar de menos no dispara nada y se lee igual que una unidad chica. Un eje
// por cada dirección, y la prueba operable aparte, que es lo único que se puede aplicar sin criterio.
test('R17 dice qué cuenta como una condición, en las dos direcciones', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const proceso = fs.readFileSync(path.join(raiz, 'template', 'planning', 'rules', 'system', 'process.md'), 'utf8')
  const r17 = proceso.split(/^##\s+/m).find((parte) => /^R17\b/.test(parte))
  assert.ok(r17, 'R17 existe en process.md')

  for (const [eje, patron] of [
    ['una condición es un resultado, no una viñeta', /resultado que se puede mirar por separado/],
    ['contar de más parte lo que era uno solo', /mismo invariante[\s\S]{0,120}\*\*una\*\* condición/],
    ['contar de menos no dispara nada', /Contar de menos no dispara nada/],
    ['y hay una prueba que no pide criterio', /se pueden entregar por separado/],
  ]) {
    assert.match(r17, patron, `R17 perdió el eje: ${eje}`)
  }
})

// Se afirma por ejes y no por redacción, igual que las pasadas de acá arriba.
//
// Lo propio de éste es que las dos mitades se sostienen entre sí y por separado no sirven: sin la
// primera, la puerta cobra deuda ajena y alguien la apaga entera; sin la segunda, «lo preexistente no
// frena» ampara a la línea que este cambio acaba de escribir. Perder cualquiera de las dos deja una
// regla que se lee completa y hace lo contrario de lo que promete.
test('R3 acota qué bloquea sin volverlo una escapatoria', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const proceso = fs.readFileSync(path.join(raiz, 'template', 'planning', 'rules', 'system', 'process.md'), 'utf8')
  const r3 = proceso.split(/^##\s+/m).find((parte) => /^R3\b/.test(parte))
  assert.ok(r3, 'R3 existe en process.md')

  for (const [eje, patron] of [
    ['bloquea lo que el cambio tocó', /Lo que bloquea es lo que este cambio tocó/],
    ['lo preexistente se registra y no frena', /deuda\s*\n?\s*que ya estaba[\s\S]{0,80}no frena nada/],
    ['lo que se apaga es la puerta entera', /no es esa exigencia sino la puerta entera/],
    ['y no ampara la línea nueva', /exime al archivo, nunca a la línea/],
  ]) {
    assert.match(r3, patron, `R3 perdió el eje: ${eje}`)
  }
})

// Se afirma por ejes y no por redacción, igual que las pasadas de acá arriba.
//
// Lo propio de éste es el segundo eje, que es el que la vuelve cumplible: la firma no la tipea nadie, la
// agrega la herramienta al final de lo que uno escribió. Una regla que sólo dijera «no la escribas» se
// cumple creyendo que se cumplió, porque nunca se escribió — y sale publicada igual.
test('R8 prohíbe la firma de IA en todo lo que se publica, no sólo en el commit', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const commits = fs.readFileSync(path.join(raiz, 'template', 'planning', 'rules', 'system', 'commits.md'), 'utf8')
  const r8 = commits.split(/^##\s+/m).find((parte) => /^R8\b/.test(parte))
  assert.ok(r8, 'R8 existe en commits.md')

  for (const [eje, patron] of [
    ['cubre todo lo publicado, no sólo el commit', /cubre todo lo que este trabajo publica/],
    ['nombra dónde: título, cuerpo y comentarios', /título y el cuerpo del pull request[\s\S]{0,60}comentarios/],
    ['la agrega la herramienta, no la tipea nadie', /lo agrega la herramienta, sola/],
    ['por eso se cumple revisando la salida', /revisar la salida antes de publicarla/],
  ]) {
    assert.match(r8, patron, `R8 perdió el eje: ${eje}`)
  }
})

// Se afirma por ejes y no por redacción, igual que las pasadas de acá arriba.
//
// Lo propio de éste es el tercer eje. Los dos primeros se pueden leer como una preferencia de flujo; el
// que los vuelve regla es que el daño no se deshace — el PR mal apuntado ya se vio, ya notificó, y
// cerrarlo no borra nada de eso. Sin él, «va al fork» se negocia el día que apura.
test('R10 dice a dónde va lo que se publica, no sólo quién lo autoriza', () => {
  const raiz = path.resolve(__dirname, '..', '..')
  const commits = fs.readFileSync(path.join(raiz, 'template', 'planning', 'rules', 'system', 'commits.md'), 'utf8')
  const r10 = commits.split(/^##\s+/m).find((parte) => /^R10\b/.test(parte))
  assert.ok(r10, 'R10 existe en commits.md')

  for (const [eje, patron] of [
    ['la autorización no dice a dónde', /autorización dice si se publica, nunca a dónde/],
    ['va al repo en el que se trabaja, y al fork si lo es', /Si ese remoto es un fork, va al fork/],
    ['la rama se corta de la suya', /rama\s*\n?\s*se corta de la suya/],
    ['que la herramienta lo resuelva no autoriza', /resuelva sola el repositorio de origen no es una/],
    ['y no tiene vuelta atrás', /cerrarlo no deshace nada/],
  ]) {
    assert.match(r10, patron, `R10 perdió el eje: ${eje}`)
  }
})

test('el vocabulario de lanes tiene un dueño y las copias no se despegan', () => {
  const P = require('../../engine/planning/parser')
  assert.deepEqual(P.LANES, ['express', 'directo', 'lite', 'full'], 'en orden de ceremonia creciente')

  const raiz = path.resolve(__dirname, '..', '..')
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
  const raiz = path.resolve(__dirname, '..', '..', 'template', 'planning')
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
  const molde = path.resolve(__dirname, '..', '..', 'template', 'planning')
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

// Una regla de merge que nombra un archivo que el molde ya no trae no falla: deja de aplicarse, y el
// conflicto que evitaba vuelve sin que nadie relacione una cosa con la otra. Es la misma clase de
// silencio que el `continue` de `upgrade`, un nivel más abajo.
// Rutas que una regla de merge nombra y el molde no puede traer porque no existen hasta que alguien las
// usa. Cada una con su razón, porque la exención es lo que le saca fuerza a la comprobación: sin la
// lista, la salida barata sería aflojar el guard para todos.
const CREADAS_EN_USO = {
  'planning/done/human-actions.md':
    'La escribe `ops archive human-actions` la primera vez que hay una fila resuelta. El molde trae el '
    + 'directorio y no el archivo, porque un histórico vacío no es un histórico.',
}

test('las reglas de merge del molde apuntan a archivos que el molde trae', () => {
  const molde = path.resolve(__dirname, '..', '..', 'template')
  const reglas = fs.readFileSync(path.join(molde, '.gitattributes'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/)[0])

  assert.ok(reglas.length, 'el molde declara al menos una regla de merge')
  const rotas = reglas.filter((ruta) => !CREADAS_EN_USO[ruta] && !fs.existsSync(path.join(molde, ruta)))
  assert.deepEqual(rotas, [], `el molde no trae: ${rotas.join(', ')}`)

  // Y una exención que ya no hace falta se retira: si el molde pasa a traer el archivo, la lista queda
  // cuidando algo que nadie necesita y esconde el próximo caso real.
  for (const ruta of Object.keys(CREADAS_EN_USO)) {
    assert.ok(reglas.includes(ruta), `${ruta}: exenta y ninguna regla la nombra`)
    assert.equal(fs.existsSync(path.join(molde, ruta)), false, `${ruta}: el molde ya la trae; sacala`)
    // El directorio sí tiene que estar: si no, la ruta está mal escrita y nadie se entera.
    assert.ok(fs.existsSync(path.join(molde, path.dirname(ruta))), `${ruta}: su directorio no existe`)
  }
})

// El README declara qué rango vive en cada archivo para no tener que grepear, y un rango que envejece
// es peor que ninguno: manda a buscar una regla donde ya no está. Se contrasta contra los archivos.
test('los rangos que declara el README de reglas son los que hay', () => {
  const rules = path.resolve(__dirname, '..', '..', 'template', 'planning', 'rules')
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
  assert.equal(cubiertos.size, 28, 'las veintiocho reglas están declaradas en alguna línea')
})

// La misma lección que la plantilla de épica: lo que se copia no puede traer algo que haya que borrar
// para que la copia valga. El molde de ADR traía el menú de estado entero, y tres decisiones reales se
// publicaron con él intacto.
test('una copia de la plantilla de ADR se valida tal cual', () => {
  const base = tempRoot('cauce-plantilla-adr-')
  const planning = path.join(base, 'planning')
  const molde = path.resolve(__dirname, '..', '..', 'template', 'planning')
  fs.cpSync(molde, planning, { recursive: true })
  fs.writeFileSync(path.join(planning, 'adr', '001-algo.md'),
    fs.readFileSync(path.join(molde, 'adr', '000-template.md'), 'utf8'))

  const errores = JSON.parse(run(['check', planning, '--json']).stdout).errors
    .filter((error) => /adr\//.test(error))
  assert.deepEqual(errores, [], 'la copia nace válida y en Propuesto')
})
