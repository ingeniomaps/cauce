'use strict'

// El catálogo de cargos: cómo se resuelve uno, qué gana cuando hay dos, y qué exige su
// documentación. Acá el cargo es del catálogo y sigue siéndolo — `fork.test.js` empieza donde éste
// termina, cuando una empresa lo adopta. Lo que le pasa a su contrato con el tiempo está en
// `learning.test.js`, y lo que lo mide en `evaluations.test.js`.

const { tempRoot, run } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const automation = require('../../engine/automation')
const catalog = require('../../engine/agents/catalog')
const learning = require('../../engine/agents/learning')
const { SUMMARY_MAX } = learning
const { REPO, AGENTS, installedProject, writeSkill, agentDocs } = require('../support/agents-fixtures')

test('todos los agentes se resuelven desde el paquete y pasan sus controles', async (context) => {
  const target = installedProject('Agents')
  // El catálogo no se copia: la instancia no tiene por qué llevar 700 archivos que no escribió.
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'system')), false)

  for (const agent of AGENTS) {
    await context.test(`${agent.type}/${agent.slug}`, () => {
      const evaluated = run(['evaluate', agent.slug], target)
      assert.equal(evaluated.status, 0, evaluated.stderr || evaluated.stdout)
    })
  }
})

// Una empresa que tiene una tarea y no sabe a quién asignarla no puede tener que abrir 47 carpetas. El
// `description` no sirve para eso: ronda los 500 caracteres porque lo lee el runner al seleccionar.
test('el catálogo se puede recorrer con una línea por cargo', () => {
  const target = installedProject('Index')
  const listing = run(['agents', 'list'], target)
  assert.equal(listing.status, 0, listing.stderr)
  const lines = listing.stdout.trim().split('\n').filter((line) => /^[a-z0-9-]+ {2,}\S/.test(line))
  assert.equal(lines.length, AGENTS.length, 'una línea por cargo, ninguna sin resumen')
  // El renglón es el slug alineado a la columna más ancha, dos espacios y el `summary`, que ya tiene
  // su propio tope —`SUMMARY_MAX`, que valida `learn`—. El techo sale de ahí y no de un número escrito
  // a mano: el que había se quedaba corto por un carácter y pasaba de casualidad, porque el resumen
  // más largo no le había tocado al cargo de nombre más largo.
  const columna = Math.max(...AGENTS.map((role) => role.slug.length))
  const techo = columna + 2 + SUMMARY_MAX
  for (const line of lines) assert.ok(line.length <= techo, `pasa de ${techo}: ${line}`)

  assert.match(listing.stdout, /Si ninguno encaja/, 'dice qué hacer cuando no hay cargo que sirva')
  assert.match(listing.stdout, /agents\/roles\//, 'y nombra dónde va el propio')

  // Y sirve para una máquina, que es quien elige cuando el que asigna es un agente.
  const json = JSON.parse(run(['agents', 'list', '--json'], target).stdout)
  assert.equal(json.length, AGENTS.length)
  for (const role of json) assert.ok(role.summary, `${role.slug} sin summary en --json`)
})

test('un slug duplicado entre tipos se rechaza como ambiguo', () => {
  const target = installedProject('Ambiguous agents')
  const duplicate = path.join(target, 'agents', 'specialists', 'product-manager')
  fs.mkdirSync(duplicate, { recursive: true })
  fs.writeFileSync(path.join(duplicate, 'SKILL.md'), 'duplicado\n')
  assert.throws(
    () => learning.evaluate(target, 'product-manager'),
    /agente ambiguo product-manager/,
  )
})

// Una cita del catálogo dentro de un documento. La extensión es parte de la ruta: sin ella el patrón
// cortaba en el punto y comprobaba un archivo sin `.md`, que nunca existe. Y el comienzo va anclado al
// borde: sin eso, `engine/agents/evaluations.js` —una ruta correcta— matcheaba el trozo
// `agents/evaluations.js` y se preguntaba por él en la raíz.
const CITED_PATH = /(?<![\w/-])agents\/[a-z0-9/-]+(?:\.(?:md|ya?ml|json|js))?/g

// El guard de abajo vive de ese patrón, y sobre los documentos de hoy no distingue un patrón sano de
// uno roto: hasta que un cargo citó un archivo del motor por primera vez, ninguno lo ejercitaba. Acá se
// lo mide contra las dos formas de romperlo — dejar pasar una ruta inventada, o tirar una correcta —.
test('el patrón de citas mira rutas enteras, no trozos de otra ruta', () => {
  const citas = (text) => [...text.matchAll(CITED_PATH)].map((hit) => hit[0])
  assert.deepEqual(citas('en `engine/agents/evaluations.js` o en otra parte'), [],
    'una ruta del motor no es una cita del catálogo')
  assert.deepEqual(citas('el molde en `template/agents/x.md`'), [], 'ni una que viva bajo otra raíz')
  assert.deepEqual(citas('ver `agents/roles/system/qa-engineer/learning/sources.yaml`'),
    ['agents/roles/system/qa-engineer/learning/sources.yaml'], 'y la cita de verdad se sigue viendo')
  assert.deepEqual(citas('ver agents/roles/system/no-existe/learning/sources.yaml'),
    ['agents/roles/system/no-existe/learning/sources.yaml'], 'incluida la inventada, que es lo que se caza')
  // La clase no lleva mayúsculas, así que una ruta que termina en `SKILL.md` se comprueba hasta su
  // directorio. Se afirma para que quede dicho: es el alcance real del guard, no un descuido del caso.
  assert.deepEqual(citas('ver `agents/roles/system/qa-engineer/SKILL.md`'),
    ['agents/roles/system/qa-engineer/'], 'una ruta con mayúsculas se comprueba hasta el directorio')
})

test('la documentación de agentes no cita rutas del toolkit ni rutas inexistentes', () => {
  // Un informe de aprendizaje es evidencia como una transcripción: registra qué se investigó un día, y
  // cuando el cargo investiga sobre Cauce cita las rutas de Cauce con razón. El molde sí se revisa
  // —ése sí es un documento que alguien sigue—, así que la exención es del contenido, no del directorio.
  const docs = agentDocs().filter((file) => {
    const dir = path.dirname(file).replace(/\\/g, '/')
    return !(dir.endsWith('learning/reports') && path.basename(file) !== '_template.md')
  })
  assert.ok(docs.length >= AGENTS.length, 'se esperaba al menos un documento por agente')

  for (const file of docs) {
    const text = fs.readFileSync(file, 'utf8')
    const at = path.relative(REPO, file)
    // `engine/cli/ops.js` sólo existe en el toolkit; estos documentos viajan a cada instancia.
    assert.equal(text.includes('engine/cli/ops.js'), false, `${at} cita el CLI del toolkit`)
    // La extensión es parte de la ruta: sin ella el patrón cortaba en el punto y comprobaba la
    // existencia de un archivo sin `.md`, que nunca existe.
    //
    // Y el comienzo se ancla al borde: sin eso, una cita **correcta** de `engine/agents/evaluations.js`
    // matcheaba el trozo `agents/evaluations.js` y se preguntaba por él en la raíz, donde no existe. El
    // guard tiraba en rojo un documento cuya ruta era buena, y no se vio hasta que un cargo citó por
    // primera vez un archivo del motor: la propuesta de `qa-engineer` para 2026-08-r3.
    for (const match of text.matchAll(CITED_PATH)) {
      assert.equal(fs.existsSync(path.join(REPO, match[0])), true, `${at} cita ${match[0]}, que no existe`)
    }
  }
})

test('los comandos make citados por los agentes existen en ambos Makefiles', () => {
  const targets = new Set()
  for (const file of agentDocs()) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/`make ([a-z-]+)/g)) targets.add(match[1])
  }
  assert.ok(targets.size, 'los agentes deberían citar algún comando make')
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    const source = fs.readFileSync(path.join(REPO, makefile), 'utf8')
    for (const target of targets) {
      assert.match(source, new RegExp(`^${target}:`, 'm'), `${makefile} no define ${target}`)
    }
  }
})

test('un cargo propio reemplaza al del sistema y el runner apunta al que gana', () => {
  const root = tempRoot('cauce-precedencia-')
  const system = path.join(root, 'agents', 'roles', 'system', 'demo')
  const own = path.join(root, 'agents', 'roles', 'demo')

  writeSkill(system, 'demo', 'La versión que trae Cauce.')
  assert.equal(catalog.resolve(root, 'demo'), system)
  assert.deepEqual(catalog.list(root).map((role) => role.system), [true])

  writeSkill(own, 'demo', 'La versión del proyecto.')
  assert.equal(catalog.resolve(root, 'demo'), own, 'el del proyecto manda')
  const listed = catalog.list(root)
  assert.equal(listed.length, 1, 'el slug no aparece dos veces')
  assert.equal(listed[0].system, false)

  // El puntero que lee el runner debe describir al que ganó, no al que quedó debajo.
  const generated = automation.roleSkill(automation.roleCatalog(root)[0])
  assert.ok(generated.includes('La versión del proyecto.'))
  assert.match(generated, /agents\/roles\/demo\/SKILL\.md/)

  fs.rmSync(own, { recursive: true, force: true })
  assert.equal(catalog.resolve(root, 'demo'), system, 'al quitarlo vuelve el del sistema')
})

test('un slug repetido entre tipos distintos sigue siendo ambiguo', () => {
  const root = tempRoot('cauce-ambiguo-')
  for (const type of ['roles', 'specialists']) writeSkill(path.join(root, 'agents', type, 'demo'), 'demo', 'x')
  assert.throws(() => catalog.resolve(root, 'demo'), /agente ambiguo demo/)
})

test('una empresa puede acotar el catálogo a lo que sí mantiene', () => {
  const target = installedProject('Propios')
  writeSkill(path.join(target, 'agents', 'roles', 'curador'), 'curador', 'Cargo propio.')

  const own = JSON.parse(run(['agents', 'list', target, '--own', '--json']).stdout)
  assert.deepEqual(own.map((role) => role.slug), ['curador'])
  const system = JSON.parse(run(['agents', 'list', target, '--system', '--json']).stdout)
  assert.equal(system.length, AGENTS.length, 'el catálogo entero, sin el propio')
  assert.equal(system.some((role) => role.slug === 'curador'), false)
  // El ciclo corre sobre el suyo, mientras uno del catálogo sigue rechazado con explicación.
  assert.equal(run(['learn', 'curador'], target).status, 0)
  assert.match(run(['learn', 'qa-engineer'], target).stderr, /se hace en el toolkit/)
})

// El único párrafo que todos los cargos comparten palabra por palabra: el recorrido de artefactos que
// cierra «Entrega mínima». No se puede factorizar a un archivo compartido — un `SKILL.md` lo lee el
// agente tal cual del paquete, sin que cauce lo renderice, así que un `{{INCLUDE:}}` le llegaría
// literal; y un puntero convertiría en lectura opcional justamente el paso que tiene que estar en
// contexto al entregar. Copiado en cada cargo el daño posible es uno solo, que una copia se pudra, y
// esto es lo que lo detiene. No fija el texto sino que sea el mismo, así que cambiarlo en todos a la
// vez sigue siendo una edición legítima del catálogo.
test('el paso de entrega que comparten los cargos no se parte en variantes', () => {
  const roles = catalog.list(REPO).filter((role) => fs.existsSync(path.join(role.dir, 'SKILL.md')))
  assert.ok(roles.length > 40, `el catálogo se quedó en ${roles.length} cargos`)
  const closing = (role) => {
    const text = fs.readFileSync(path.join(role.dir, 'SKILL.md'), 'utf8')
    const start = text.indexOf('## Entrega mínima')
    if (start < 0) return ''
    const blocks = text.slice(start).split(/\n## /)[0].split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
    return blocks[blocks.length - 1] || ''
  }
  const closings = roles.map((role) => [role.slug, closing(role)])
  assert.deepEqual(closings.filter(([, block]) => !block).map(([slug]) => slug), [],
    'cargos sin «Entrega mínima» o con la sección vacía')
  const variants = new Map()
  for (const [slug, block] of closings) variants.set(block, [...(variants.get(block) || []), slug])
  const odd = [...variants.entries()].sort((a, b) => b[1].length - a[1].length).slice(1)
  assert.deepEqual(odd.map(([, slugs]) => slugs.join(', ')), [],
    'el paso de entrega quedó en más de una redacción')
})
