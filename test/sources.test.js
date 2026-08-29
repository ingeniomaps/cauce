'use strict'

// El contrato de fuentes de un cargo: que cada una declare su tipo dentro del vocabulario cerrado,
// que ninguna URL viva bajo dos nombres, y que la cadencia salga de ahí y no de una lista paralela.
// Es el reloj de la profesión, no el del ciclo que consume su resultado.

const { tempRoot } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const evaluations = require('../engine/agents/evaluations')
const learning = require('../engine/agents/learning')
const { REPO, installedProject, writeSkill } = require('./agents-fixtures')

const CONTRATOS_EN_LA_REFERENCIA = [
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
  const fuentes = (segunda) => fs.writeFileSync(path.join(dir, 'learning', 'sources.yaml'),
    `sources:\n  - name: Uno\n    url: https://ej.test/a\n    tier: standard\n${segunda}`)

  // La barra final no hace otra fuente: es la misma página escrita distinto.
  fuentes('  - name: Otro nombre\n    url: https://ej.test/a/\n    tier: platform\n')
  assert.match(learning.evaluate(root, 'probe').errors.join('\n'),
    /https:\/\/ej\.test\/a está dos veces, como "Uno" y como "Otro nombre"/)

  // El mismo nombre repetido no es el defecto que esto busca: eso es una entrada duplicada, no un alias.
  fuentes('  - name: Uno\n    url: https://ej.test/a\n    tier: standard\n')
  assert.equal(learning.evaluate(root, 'probe').errors.some((one) => one.includes('dos veces')), false)
})

// Una URL, un nombre. `evaluate` sólo ve el archivo de un cargo, así que la misma fuente bajo dos
// nombres en dos cargos distintos se le escapa — y es la forma que de verdad apareció: la
// especificación OpenAPI vivía como `OpenAPI Specification`, `...latest published` y `...3.2.0`, así
// que corregirle el `tier` a un cargo no se lo corregía a los otros dos.
test('el catálogo no repite una fuente bajo dos nombres', () => {
  const dir = path.resolve(__dirname, '..', 'agents', 'roles', 'system')
  const porUrl = new Map()
  const repetidas = []
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, 'learning', 'sources.yaml')
    if (!fs.existsSync(file)) continue
    let name = ''
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const nombre = line.match(/^\s*-\s*name:\s*(.+?)\s*$/)
      if (nombre) { name = nombre[1].replace(/^['"]|['"]$/g, ''); continue }
      const url = line.match(/^\s*url:\s*(\S+)/)
      if (!url || !name) continue
      const clave = url[1].replace(/\/+$/, '')
      const antes = porUrl.get(clave)
      if (antes && antes.name !== name) repetidas.push(`${clave}: "${antes.name}" y "${name}"`)
      else porUrl.set(clave, { name, slug })
    }
  }
  assert.deepEqual([...new Set(repetidas)], [], 'una URL, un nombre en todo el catálogo')
})

test('el inventario de contratos en las referencias es el que está declarado', () => {
  const roles = path.join(REPO, 'agents', 'roles', 'system')
  const conDos = fs.readdirSync(roles).filter((slug) => {
    const file = path.join(roles, slug, 'references', 'operating-model.md')
    if (!fs.existsSync(file)) return false
    const text = fs.readFileSync(file, 'utf8')
    return [...text.matchAll(/```markdown\n([\s\S]*?)\n```/g)].some((block) => {
      const campos = block[1].split('\n').filter((line) => line.trimEnd().endsWith(':')).length
      const heads = [...text.slice(0, block.index).matchAll(/^## (.+)$/gm)]
      const head = heads.length ? heads[heads.length - 1][1] : ''
      return campos >= 6 && head.toLowerCase().startsWith('contrato')
    })
  })

  const nuevos = conDos.filter((slug) => !CONTRATOS_EN_LA_REFERENCIA.includes(slug))
  assert.deepEqual(nuevos, [], 'apareció un contrato en una referencia: decidí si duplica la entrega')

  const cerrados = CONTRATOS_EN_LA_REFERENCIA.filter((slug) => !conDos.includes(slug))
  assert.deepEqual(cerrados, [], 'estos ya no tienen dos listas: sacalos de CONTRATOS_EN_LA_REFERENCIA')
})

// El `tier` de una fuente decidía nada: el motor comprobaba que `sources.yaml` existiera y nunca lo
// abría, así que el catálogo acumuló 51 etiquetas para seis cosas —`primary-standard`,
// `standards-primary` y `public-standard` eran la misma— y nadie se enteró. Deja de ser decorativo
// cuando la cadencia del ciclo de aprendizaje sale de ahí: un cargo cuyas fuentes son normas no
// necesita investigar cada lunes, y uno que sigue avisos de seguridad sí.
//
// Un vocabulario abierto no se puede usar para eso, y una etiqueta mal escrita no avisa sola.
test('una fuente declara su tipo dentro del vocabulario cerrado', () => {
  const target = installedProject('Vocabulario de fuentes')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  fs.mkdirSync(path.join(own, 'learning'), { recursive: true })
  const sources = path.join(own, 'learning', 'sources.yaml')
  const escribir = (tier) => fs.writeFileSync(sources, 'version: 1\nsources:\n'
    + `  - name: Alguna norma\n    url: https://example.org/x\n    tier: ${tier}\n`)

  for (const tier of learning.SOURCE_TIERS) {
    escribir(tier)
    const errores = learning.evaluate(target, 'probe').errors.filter((one) => one.includes('tier'))
    assert.deepEqual(errores, [], `${tier} es del vocabulario y no debería objetarse`)
  }

  escribir('primary-standard')
  const malo = learning.evaluate(target, 'probe').errors.filter((one) => one.includes('tier'))
  assert.equal(malo.length, 1, 'una etiqueta fuera del vocabulario es un error, no un silencio')
  assert.match(malo[0], /primary-standard/, 'y dice cuál')
  assert.match(malo[0], new RegExp(learning.SOURCE_TIERS.join('|')), 'y cuáles sí valen')

  // Sin fuentes el ciclo semanal no tiene qué investigar, pero un cargo a medio escribir es legítimo:
  // avisa, no bloquea.
  fs.writeFileSync(sources, 'version: 1\n')
  const vacio = learning.evaluate(target, 'probe')
  assert.deepEqual(vacio.errors.filter((one) => one.includes('fuente')), [])
  assert.ok(vacio.warnings.some((one) => one.includes('sin fuentes')), 'avisa que no hay qué investigar')
})

// Cada cuánto investiga un cargo no puede vivir en una lista escrita a mano: el día que alguien le
// cambia las fuentes, la lista sigue diciendo lo de antes y nadie se entera. Sale del árbol, como la
// matriz del cron, y la fija la fuente más rápida que el cargo declara.
test('la cadencia de investigación se deriva de las fuentes, no de una lista', () => {
  const target = installedProject('Cadencia')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  fs.mkdirSync(path.join(own, 'learning'), { recursive: true })
  const declarar = (...tiers) => fs.writeFileSync(path.join(own, 'learning', 'sources.yaml'),
    'version: 1\nsources:\n' + tiers.map((tier, i) =>
      `  - name: F${i}\n    url: https://example.org/${i}\n    tier: ${tier}\n`).join(''))

  declarar('standard')
  assert.equal(learning.cadence(target, 'probe'), 'mensual', 'una norma se revisa por edición')
  declarar('profession')
  assert.equal(learning.cadence(target, 'probe'), 'trimestral')
  declarar('advisory')
  assert.equal(learning.cadence(target, 'probe'), 'semanal', 'un aviso publica todos los días')

  // Basta una fuente rápida: mirar antes no le cuesta nada a las lentas, y llegar tarde a un aviso sí.
  declarar('standard', 'profession', 'platform')
  assert.equal(learning.cadence(target, 'probe'), 'semanal', 'la manda la más rápida, no la mayoría')

  // Sin fuentes no hay cadencia que derivar, y eso ya lo avisa `evaluate`: no se inventa una.
  fs.writeFileSync(path.join(own, 'learning', 'sources.yaml'), 'version: 1\n')
  assert.equal(learning.cadence(target, 'probe'), '')
})
