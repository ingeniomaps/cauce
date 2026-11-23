'use strict'

// El contrato de fuentes de un cargo: que cada una declare su tipo dentro del vocabulario cerrado,
// que ninguna URL viva bajo dos nombres, y que la cadencia salga de ahí y no de una lista paralela.
// Es el reloj de la profesión, no el del ciclo que consume su resultado.

const { tempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const learning = require('../../engine/agents/learning')
const { documentUrls, sourceUrls } = require('../../engine/agents/learning-sources')
const { REPO, installedProject, writeSkill } = require('../support/agents-fixtures')

const CONTRACTS_IN_REFERENCE = [
  'analytics-engineer', 'backend-engineer', 'customer-support-specialist', 'data-analyst',
  'data-governance-steward', 'data-scientist', 'database-administrator', 'developer-relations-engineer',
  'devops-engineer', 'fraud-risk-analyst', 'frontend-engineer', 'implementation-manager',
  'kyc-aml-specialist', 'machine-learning-engineer', 'mlops-engineer', 'mobile-engineer',
  'people-operations-manager', 'product-marketing-manager', 'qa-engineer', 'release-manager',
  'security-engineer', 'site-reliability-engineer', 'solutions-engineer', 'tech-lead', 'treasury-analyst',
]

// La mitad que ve `evaluate`: un solo archivo, que es lo que corre en una empresa. Entre cargos no lo
// ve nadie y ése es el caso de al lado. Por qué es error y no aviso, en `evaluate`.
test('evaluate rechaza la misma URL bajo dos nombres', () => {
  const root = tempRoot('cauce-dup-fuente-')
  const dir = path.join(root, 'agents', 'roles', 'probe')
  fs.mkdirSync(path.join(dir, 'learning'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'),
    '---\nname: probe\ndescription: x\nsummary: y\n---\nno inventar autorización evidencia observable\n')
  const writeSources = (second) => fs.writeFileSync(path.join(dir, 'learning', 'sources.yaml'),
    `sources:\n  - name: Uno\n    url: https://ej.test/a\n    tier: standard\n${second}`)

  // La barra final no hace otra fuente: es la misma página escrita distinto.
  writeSources('  - name: Otro nombre\n    url: https://ej.test/a/\n    tier: platform\n')
  assert.match(learning.evaluate(root, 'probe').errors.join('\n'),
    /https:\/\/ej\.test\/a está dos veces, como "Uno" y como "Otro nombre"/)

  // El mismo nombre repetido no es el defecto que esto busca: eso es una entrada duplicada, no un alias.
  writeSources('  - name: Uno\n    url: https://ej.test/a\n    tier: standard\n')
  assert.equal(learning.evaluate(root, 'probe').errors.some((one) => one.includes('dos veces')), false)
})

// Una URL, un nombre. `evaluate` sólo ve el archivo de un cargo, así que la misma fuente bajo dos
// nombres en dos cargos distintos se le escapa — y es la forma que de verdad apareció: la
// especificación OpenAPI vivía como `OpenAPI Specification`, `...latest published` y `...3.2.0`, así
// que corregirle el `tier` a un cargo no se lo corregía a los otros dos.
test('el catálogo no repite una fuente bajo dos nombres', () => {
  const dir = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system')
  const byUrl = new Map()
  const repeated = []
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, 'learning', 'sources.yaml')
    if (!fs.existsSync(file)) continue
    let name = ''
    const text = fs.readFileSync(file, 'utf8')
    const cut = text.search(/^pending:/m)
    for (const line of (cut === -1 ? text : text.slice(0, cut)).split('\n')) {
      const label = line.match(/^\s*-\s*name:\s*(.+?)\s*$/)
      if (label) { name = label[1].replace(/^['"]|['"]$/g, ''); continue }
      const url = line.match(/^\s*url:\s*(\S+)/)
      if (!url || !name) continue
      const key = url[1].replace(/\/+$/, '')
      const earlier = byUrl.get(key)
      if (earlier && earlier.name !== name) repeated.push(`${key}: "${earlier.name}" y "${name}"`)
      else byUrl.set(key, { name, slug })
    }
  }
  assert.deepEqual([...new Set(repeated)], [], 'una URL, un nombre en todo el catálogo')
})

// `www.iso.org` devuelve 403 al catálogo entero; por qué la ficha de una norma vive en otro host lo
// explica `agents/README.md`. Lo que se cuida acá es que no vuelva, y por eso la aserción es de
// ausencia: ver que las 41 entradas apuntan a otro lado no dice que ninguna haya vuelto a éste.
test('ninguna fuente del catálogo se cita en www.iso.org', () => {
  const dir = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system')
  const blockedOnes = []
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, 'learning', 'sources.yaml')
    if (!fs.existsSync(file)) continue
    for (const one of sourceUrls(fs.readFileSync(file, 'utf8'))) {
      if (/^https?:\/\/(www\.)?iso\.org\//.test(one.url)) blockedOnes.push(`${slug}: ${one.name} → ${one.url}`)
    }
  }
  assert.deepEqual(blockedOnes, [], 'la ficha legible es la del IEC Webstore o la de committee.iso.org')
})

// Las URLs que un cargo cita fuera de `sources.yaml`. Lo que se cuida es la exclusión —el porqué lo
// explica `documentUrls`—, y se comprueba por ausencia: que las URLs de `references/` aparezcan no dice
// nada sobre si además se coló alguna de las que un caso inventa.
test('el lector de documentos toma references y SKILL, y deja afuera lo inventado', () => {
  const qa = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system', 'qa-engineer')
  const read = documentUrls(qa)
  assert.ok(read.length > 5, `leyó ${read.length} URLs de qa-engineer`)
  assert.ok(read.some((one) => one.origin.startsWith('references/')), 'entra references/')
  assert.deepEqual(read.filter((one) => /evaluations|learning/.test(one.origin)), [],
    'y no entra ni lo inventado ni la evidencia')

  // El origen viaja con la URL porque decide quién la arregla, y la prueba lo fija: sin él el aviso
  // semanal nombra una URL y no el archivo donde está escrita.
  const dir = tempRoot('cauce-docs-')
  fs.mkdirSync(path.join(dir, 'references', 'hondo'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'ver https://ej.test/skill\n')
  fs.writeFileSync(path.join(dir, 'references', 'hondo', 'metodo.md'), '[m](https://ej.test/hondo).\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'cases', 'uno.md'), 'https://inventado.example/x\n')
  assert.deepEqual(documentUrls(dir).sort((a, b) => a.url.localeCompare(b.url)), [
    { url: 'https://ej.test/hondo', origin: 'references/hondo/metodo.md' },
    { url: 'https://ej.test/skill', origin: 'SKILL.md' },
  ], 'recorre subcarpetas, corta el punto final y nombra el archivo')

  // Lo que no es markdown no se lee, y una URL repetida se comprueba una vez: el paso paga una vuelta de
  // red por cada línea que sale de acá, así que repetirla cuesta y no dice nada nuevo.
  fs.writeFileSync(path.join(dir, 'references', 'notas.txt'), 'https://ej.test/txt\n')
  fs.writeFileSync(path.join(dir, 'references', 'otra.md'), 'https://ej.test/hondo otra vez\n')
  const other = documentUrls(dir).map((one) => one.url)
  assert.equal(other.filter((url) => url === 'https://ej.test/hondo').length, 1, 'una vez, no dos')
  assert.equal(other.includes('https://ej.test/txt'), false, 'y el .txt no se lee')

  // Un cargo a medio escribir todavía no tiene ninguna de las dos cosas, y eso no es un error: se está
  // escribiendo. Devolver vacío es lo que deja que el paso siga con sus fuentes.
  assert.deepEqual(documentUrls(tempRoot('cauce-vacio-')), [], 'sin references/ ni SKILL.md, ninguna')
})

test('el inventario de contratos en las referencias es el que está declarado', () => {
  const roles = path.join(REPO, 'agents', 'roles', 'system')
  const withTwo = fs.readdirSync(roles).filter((slug) => {
    const file = path.join(roles, slug, 'references', 'operating-model.md')
    if (!fs.existsSync(file)) return false
    const text = fs.readFileSync(file, 'utf8')
    return [...text.matchAll(/```markdown\n([\s\S]*?)\n```/g)].some((block) => {
      const fieldCount = block[1].split('\n').filter((line) => line.trimEnd().endsWith(':')).length
      const heads = [...text.slice(0, block.index).matchAll(/^## (.+)$/gm)]
      const head = heads.length ? heads[heads.length - 1][1] : ''
      return fieldCount >= 6 && head.toLowerCase().startsWith('contrato')
    })
  })

  const fresh = withTwo.filter((slug) => !CONTRACTS_IN_REFERENCE.includes(slug))
  assert.deepEqual(fresh, [], 'apareció un contrato en una referencia: decidí si duplica la entrega')

  const closed = CONTRACTS_IN_REFERENCE.filter((slug) => !withTwo.includes(slug))
  assert.deepEqual(closed, [], 'estos ya no tienen dos listas: sacalos de CONTRATOS_EN_LA_REFERENCIA')
})

// El `tier` de una fuente decidía nada: el motor comprobaba que `sources.yaml` existiera y nunca lo
// abría, así que el catálogo acumuló etiquetas sinónimas sin que nadie se enterara —cuántas y por qué,
// en `learning-sources.js`—. Deja de ser decorativo
// cuando la cadencia del ciclo de aprendizaje sale de ahí: un cargo cuyas fuentes son normas no
// necesita investigar cada lunes, y uno que sigue avisos de seguridad sí.
//
// Un vocabulario abierto no se puede usar para eso, y una etiqueta mal escrita no avisa sola.
test('una fuente declara su tipo dentro del vocabulario cerrado', () => {
  const target = installedProject('Vocabulario de fuentes')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  fs.mkdirSync(path.join(own, 'learning'), { recursive: true })
  const sources = path.join(own, 'learning', 'sources.yaml')
  const write = (tier) => fs.writeFileSync(sources, 'version: 1\nsources:\n'
    + `  - name: Alguna norma\n    url: https://example.org/x\n    tier: ${tier}\n`)

  for (const tier of learning.SOURCE_TIERS) {
    write(tier)
    const errorList = learning.evaluate(target, 'probe').errors.filter((one) => one.includes('tier'))
    assert.deepEqual(errorList, [], `${tier} es del vocabulario y no debería objetarse`)
  }

  write('primary-standard')
  const bad = learning.evaluate(target, 'probe').errors.filter((one) => one.includes('tier'))
  assert.equal(bad.length, 1, 'una etiqueta fuera del vocabulario es un error, no un silencio')
  assert.match(bad[0], /primary-standard/, 'y dice cuál')
  assert.match(bad[0], new RegExp(learning.SOURCE_TIERS.join('|')), 'y cuáles sí valen')

  // Sin fuentes el ciclo semanal no tiene qué investigar, pero un cargo a medio escribir es legítimo:
  // avisa, no bloquea.
  fs.writeFileSync(sources, 'version: 1\n')
  const empty = learning.evaluate(target, 'probe')
  assert.deepEqual(empty.errors.filter((one) => one.includes('fuente')), [])
  assert.ok(empty.warnings.some((one) => one.includes('sin fuentes')), 'avisa que no hay qué investigar')
})

// Cada cuánto investiga un cargo no puede vivir en una lista escrita a mano: el día que alguien le
// cambia las fuentes, la lista sigue diciendo lo de antes y nadie se entera. Sale del árbol, como la
// matriz del cron, y la fija la fuente más rápida que el cargo declara.
test('la cadencia de investigación se deriva de las fuentes, no de una lista', () => {
  const target = installedProject('Cadencia')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  fs.mkdirSync(path.join(own, 'learning'), { recursive: true })
  const declare = (...tiers) => fs.writeFileSync(path.join(own, 'learning', 'sources.yaml'),
    'version: 1\nsources:\n' + tiers.map((tier, i) =>
      `  - name: F${i}\n    url: https://example.org/${i}\n    tier: ${tier}\n`).join(''))

  declare('standard')
  assert.equal(learning.cadence(target, 'probe'), 'mensual', 'una norma se revisa por edición')
  declare('profession')
  assert.equal(learning.cadence(target, 'probe'), 'trimestral')
  declare('advisory')
  assert.equal(learning.cadence(target, 'probe'), 'mensual', 'un aviso también: el contrato cambia una vez al mes')

  // Basta una fuente rápida: mirar antes no le cuesta nada a las lentas.
  declare('standard', 'profession', 'platform')
  assert.equal(learning.cadence(target, 'probe'), 'mensual', 'la manda la más rápida, no la mayoría')

  // La cadencia semanal se quitó (caso 182): ningún tipo de fuente la devuelve, ni solo ni combinado.
  for (const tier of learning.SOURCE_TIERS) {
    declare(tier)
    assert.notEqual(learning.cadence(target, 'probe'), 'semanal', `${tier} no vuelve a investigar cada semana`)
  }
  declare(...learning.SOURCE_TIERS)
  assert.notEqual(learning.cadence(target, 'probe'), 'semanal', 'ni todos juntos')

  // Sin fuentes no hay cadencia que derivar, y eso ya lo avisa `evaluate`: no se inventa una.
  fs.writeFileSync(path.join(own, 'learning', 'sources.yaml'), 'version: 1\n')
  assert.equal(learning.cadence(target, 'probe'), '')
})

// El catálogo escribe una entrada de dos formas —seis cargos la ponen en una línea y cuarenta y siete la
// reparten— y el lector sólo veía la segunda. Lo que se perdía no era cosmético: la validación de URL
// duplicada es un **error**, y esos seis nunca la tuvieron. No fallaba nada porque no encontrar
// duplicados y no mirar producen el mismo silencio.
test('una fuente se lee escrita en una línea o repartida en varias', () => {
  const { sourceUrls } = require('../../engine/agents/learning-sources')

  const spread = `version: 1
sources:
  - name: Repartida
    url: https://example.org/a
    tier: standard
`
  assert.deepEqual(sourceUrls(spread), [{ name: 'Repartida', url: 'https://example.org/a' }])

  const inLine = `version: 1
sources:
  - {name: En Linea, url: "https://example.org/b", tier: standard, topics: [x, y]}
  - {name: Sin Comillas, url: https://example.org/c, tier: platform}
`
  assert.deepEqual(sourceUrls(inLine), [
    { name: 'En Linea', url: 'https://example.org/b' },
    { name: 'Sin Comillas', url: 'https://example.org/c' },
  ])

  // Mezcladas en el mismo archivo, que es lo que hace un cargo al que se le agrega una fuente a mano.
  assert.equal(sourceUrls(`${spread}  - {name: Tercera, url: "https://example.org/d", tier: project}\n`).length, 2)

  // Y la validación que dependía de esto vuelve a ver a los que no miraba.
  const duplicated = `version: 1
sources:
  - {name: Uno, url: "https://example.org/z", tier: standard}
  - {name: Otro, url: "https://example.org/z", tier: platform}
`
  const urls = sourceUrls(duplicated)
  assert.equal(urls.length, 2, 'las dos entradas se ven')
  assert.equal(urls[0].url, urls[1].url, 'y comparten URL, que es lo que evaluate rechaza')
})

// Todo cargo del catálogo declara sus fuentes de una de las dos formas, y el lector tiene que verlas
// todas: una entrada que no se ve no se valida ni se comprueba, y eso no deja rastro.
test('el lector no se saltea ninguna fuente del catálogo', () => {
  const { sourceUrls } = require('../../engine/agents/learning-sources')
  const root = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system')
  const mismatches = []
  let total = 0
  for (const slug of fs.readdirSync(root)) {
    const file = path.join(root, slug, 'learning', 'sources.yaml')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    // El corte en `pending:` se transcribe acá en vez de reusar el del motor: si las dos cuentas
    // salieran del mismo código, la prueba no comprobaría nada.
    const body = text.slice(text.indexOf('sources:'))
    const until = body.search(/^pending:/m)
    const declaredOnes = ((until === -1 ? body : body.slice(0, until)).match(/url:/g) || []).length
    const readCount = sourceUrls(text).length
    total += declaredOnes
    if (readCount !== declaredOnes) mismatches.push(`${slug}: declara ${declaredOnes} y se leen ${readCount}`)
  }
  assert.ok(total > 200, `el recorrido tiene que ver el catálogo entero, vio ${total}`)
  assert.deepEqual(mismatches, [], `fuentes que el lector no ve:\n  ${mismatches.join('\n  ')}`)
})

// Una pendiente no es una fuente y confundirlas cuesta en las dos direcciones: leída como fuente, el
// chequeo semanal la reporta rota para siempre; ignorada del todo, vuelve a ser el comentario que nadie
// mira. Se comprueba por ausencia en la primera dirección, que es la que no deja rastro.
// Lo que un cargo probó, no pudo abrir y va a volver a necesitar. `url` es opcional porque la mitad de
// esas entradas están pendientes justamente porque no hay ninguna URL que responda; `why` no lo es.
test('una pendiente se lee con o sin URL, y su razón sobrevive al salto de línea', () => {
  const { pendingSources } = require('../../engine/agents/learning-sources')
  const text = 'version: 1\nsources:\n  - name: A\n    url: https://a.test\n    tier: standard\n'
    + 'pending:\n'
    + '  - name: IEEE 1028\n    url: https://ieee.test/1028\n'
    + '    why: la ficha se arma con JavaScript y sirve el título genérico, así\n'
    + '      que no se pudo confirmar la edición\n    since: 2026-08-22\n'
    + '  - name: ISO 24765\n    why: no hay URL primaria que responda\n    since: 2026-08-22\n'
  assert.deepEqual(pendingSources(text), [
    {
      name: 'IEEE 1028',
      url: 'https://ieee.test/1028',
      why: 'la ficha se arma con JavaScript y sirve el título genérico, así que no se pudo confirmar la edición',
      since: '2026-08-22',
    },
    { name: 'ISO 24765', why: 'no hay URL primaria que responda', since: '2026-08-22' },
  ], 'las dos formas, y la razón entera')

  // La aserción que importa es de ausencia: la pendiente no puede salir por el lector de fuentes. Si
  // saliera, el chequeo semanal la reportaría rota para siempre — el aviso permanente que esto evita.
  assert.deepEqual(sourceUrls(text), [{ name: 'A', url: 'https://a.test' }],
    'y ninguna de las dos aparece como fuente')
})

test('las pendientes no entran como fuentes declaradas', () => {
  const { pendingSources, sourceUrls } = require('../../engine/agents/learning-sources')
  const root = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system')
  const slipped = []
  let pending = 0
  for (const slug of fs.readdirSync(root)) {
    const file = path.join(root, slug, 'learning', 'sources.yaml')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const declaredOnes = new Set(sourceUrls(text).map((one) => one.url))
    for (const one of pendingSources(text)) {
      pending += 1
      if (one.url && declaredOnes.has(one.url.replace(/\/+$/, ''))) slipped.push(`${slug}: ${one.url}`)
    }
  }
  assert.ok(pending > 0, 'el catálogo declara alguna pendiente, o esta prueba no mide nada')
  assert.deepEqual(slipped, [], 'una pendiente leída como fuente se reporta rota todas las semanas')
})

// `learning/HISTORY.md` es el mismo artefacto en los 53 cargos y su encabezado llegó a decir trece cosas
// distintas, nueve de ellas contradiciendo la tabla que llevan debajo: «registrar únicamente cambios
// aprobados», cuando la columna se llama «Decisión» y hay dos —aplicar y archivar—.
//
// Nadie generó estos archivos desde un molde: cada uno se escribió a mano al entrar su cargo al catálogo.
// Sin algo que lo mida, vuelven a divergir con el próximo.
test('el historial dice lo mismo en todos los cargos, y coincide con su tabla', () => {
  const root = path.resolve(__dirname, '..', '..', 'agents', 'roles', 'system')
  const headers = new Map()
  const withoutTable = []
  let seen = 0
  for (const slug of fs.readdirSync(root)) {
    const file = path.join(root, slug, 'learning', 'HISTORY.md')
    if (!fs.existsSync(file)) continue
    seen += 1
    const text = fs.readFileSync(file, 'utf8')
    const line = text.split('\n')[2] || ''
    headers.set(line, [...(headers.get(line) || []), slug])
    if (!/^\| Fecha \| Propuesta \| Decisión \| Aprobó \| Cambio aplicado \|$/m.test(text)) withoutTable.push(slug)
  }
  assert.ok(seen > 40, `el recorrido tiene que ver el catálogo entero, vio ${seen}`)
  assert.equal(headers.size, 1,
    `el encabezado dice ${headers.size} cosas distintas:\n  ${[...headers.keys()].join('\n  ')}`)
  assert.deepEqual(withoutTable, [], `sin la tabla que su encabezado describe:\n  ${withoutTable.join('\n  ')}`)

  // Lo que la unificación no puede borrar: una exigencia propia del cargo va como línea aparte, así que
  // el encabezado común sigue siendo uno solo y lo suyo no se pierde.
  const own = (slug) => fs.readFileSync(path.join(root, slug, 'learning', 'HISTORY.md'), 'utf8')
  assert.match(own('kyc-aml-specialist'), /país alcanzado/, 'kyc-aml conserva el país')
  assert.match(own('legal-counsel'), /jurisdicción/, 'legal-counsel conserva la jurisdicción')
})
