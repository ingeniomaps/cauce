'use strict'

// Lo que el motor sabe de sí mismo: qué archivo es suyo y cuál del proyecto, qué trae una versión, qué
// entregó en una instancia, y el esquema con el que valida su propia configuración.
//
// Son las piezas de las que dependen `upgrade` e `install` para no pisar trabajo ajeno, y se prueban acá
// como unidades. Que el comando las use bien es de `instance.test.js`.

const { opsConfig, tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateOpsConfig } = require('../../engine/config/validate')
const P = require('../../engine/planning/parser')
const MF = require('../../engine/core/manifest')

test('valida el contrato completo de ops.config.json', () => {
  assert.deepEqual(validateOpsConfig(opsConfig()), [])
  const invalid = opsConfig()
  invalid.extra = true
  invalid.runner.allowPush = 'no'
  const errors = validateOpsConfig(invalid)
  assert.ok(errors.some((error) => error.includes('propiedad desconocida extra')))
  assert.ok(errors.some((error) => error.includes('allowPush debe ser boolean')))
})

// Toda instancia creada antes de 0.16 lleva `planningDir`, y el campo nunca hizo nada. Al actualizar
// tiene que llegar la instrucción —«borrá la línea»— y no un «propiedad desconocida» que deja a la
// persona averiguando si perdió una función.
test('un campo retirado se nombra en vez de caer en propiedad desconocida', () => {
  const old = opsConfig()
  old.planningDir = 'planning'
  const errors = validateOpsConfig(old)
  assert.equal(errors.length, 1, 'un solo error, no dos por la misma línea')
  assert.match(errors[0], /planningDir ya no se usa/)
  assert.match(errors[0], /planning\/ en la raíz/, 'dice dónde busca el motor de verdad')
  assert.match(errors[0], /Borrá la línea/, 'y qué hacer con ella')
  assert.ok(!errors[0].includes('propiedad desconocida'))
})

test('la frontera system/ separa lo del toolkit de lo del proyecto', () => {
  const O = require('../../engine/core/ownership')
  const root = tempRoot('cauce-ownership-')
  const rules = path.join(root, 'planning', 'rules')
  fs.mkdirSync(path.join(rules, 'system'), { recursive: true })
  fs.writeFileSync(path.join(rules, 'system', 'commits.md'), '# sistema\n')
  fs.writeFileSync(path.join(rules, 'system', 'process.md'), '# sistema\n')

  assert.deepEqual(O.overrides(root), [], 'sin archivos propios no hay override')

  // Una regla propia con otro nombre convive; con el mismo nombre, reemplaza.
  fs.writeFileSync(path.join(rules, 'acme-naming.md'), '# propia\n')
  assert.deepEqual(O.overrides(root), [], 'anexar no es sobrescribir')
  fs.writeFileSync(path.join(rules, 'commits.md'), '# propia\n')
  assert.deepEqual(
    O.overrides(root).map((entry) => [entry.collection, entry.id]),
    [['planning/rules', 'commits']],
  )

  // Las reglas de negocio se identifican por ID, no por nombre de archivo.
  const business = path.join(root, 'planning', 'business-rules')
  fs.mkdirSync(path.join(business, 'system'), { recursive: true })
  fs.writeFileSync(path.join(business, 'system', 'BR-OPS-002-propuestas.md'), '# sistema\n')
  fs.writeFileSync(path.join(business, 'BR-OPS-002-version-propia.md'), '# propia\n')
  assert.ok(
    O.overrides(root).some((entry) => entry.id === 'BR-OPS-002'),
    'un archivo con otro nombre pero el mismo ID sigue siendo un override',
  )

  // `upgrade` sólo puede tocar esto.
  const paths = O.systemPaths(root)
  assert.ok(paths.includes('planning/rules/system'))
  assert.ok(paths.includes('planning/business-rules/system'))
  assert.equal(paths.some((entry) => entry.includes('acme-naming')), false, 'nada propio es reemplazable')
})

test('el changelog dice qué trae una versión antes de reemplazar system/', () => {
  const CL = require('../../engine/core/changelog')
  const text = [
    '# Changelog', '',
    '## [0.3.0] - No publicado', '- lo que viene', '',
    '## [0.2.0] - 2026-08-14', '- cambió el protocolo', '',
    '## [0.1.0] - 2026-08-01', '- primera versión', '',
  ].join('\n')

  // Sólo lo estrictamente posterior a lo instalado y hasta la versión que se recibe: repetir lo ya
  // aplicado es ruido, y anunciar lo que el paquete todavía no trae sería mentir.
  assert.deepEqual(CL.between(text, '0.1.0', '0.2.0').map((entry) => entry.version), ['0.2.0'])
  assert.equal(CL.between(text, '0.1.0', '0.2.0')[0].body, '- cambió el protocolo')
  assert.deepEqual(CL.between(text, '0.2.0', '0.3.0').map((entry) => entry.version), ['0.3.0'])
  assert.deepEqual(CL.between(text, '0.3.0', '0.3.0'), [], 'al día no imprime nada')
  assert.deepEqual(
    CL.between(text, '', '0.2.0').map((entry) => entry.version), ['0.2.0', '0.1.0'],
    'sin versión previa se muestra todo lo que llega',
  )

  // Un encabezado sin número, como [Unreleased], no se puede ordenar: se muestra siempre.
  const unreleased = ['## [Unreleased]', '- en curso', '', '## [0.1.0] - 2026-08-01', '- vieja'].join('\n')
  assert.deepEqual(CL.between(unreleased, '0.1.0', '0.2.0').map((entry) => entry.version), ['Unreleased'])

  assert.ok(CL.compare('0.10.0', '0.9.0') > 0, 'compara por número, no por texto')
  assert.equal(CL.compare('1.2.3', '1.2.3'), 0)
})

test('el changelog del paquete cubre la versión que se publica', () => {
  const CL = require('../../engine/core/changelog')
  const repoRoot = path.resolve(__dirname, '..', '..')
  const version = require(path.join(repoRoot, 'package.json')).version
  const versions = CL.entries(CL.read(repoRoot)).map((entry) => entry.version)

  assert.ok(versions.length, 'el paquete lleva su changelog')
  assert.ok(
    versions.some((entry) => entry.startsWith(version)),
    `la versión ${version} no está documentada en CHANGELOG.md`,
  )

  // Una versión, una entrada. Resolver a mano el conflicto de cinco ramas que agregaban su renglón a
  // la misma versión dejó dos encabezados `## [0.49.0]` con fechas distintas, y `entries()` devuelve
  // uno por encabezado: quien actualizara habría visto la versión dos veces, con la mitad de las
  // novedades en cada una. El archivo se lee entero y bien formado, que es justo lo que R15 nombra.
  const repetidas = versions.filter((entry, index) => versions.indexOf(entry) !== index)
  assert.deepEqual([...new Set(repetidas)], [], 'ninguna versión aparece dos veces')

  // Y dentro de una versión, una sección por tipo: la misma resolución dejó dos `### Corregido`.
  for (const entry of CL.entries(CL.read(repoRoot))) {
    const secciones = [...entry.body.matchAll(/^###\s+(\S+)/gm)].map((hit) => hit[1])
    assert.deepEqual(
      secciones.filter((one, index) => secciones.indexOf(one) !== index), [],
      `${entry.version} repite una sección`,
    )
  }
})

test('toda ruta declarada del sistema existe en el paquete', () => {
  const O = require('../../engine/core/ownership')
  const repoRoot = path.resolve(__dirname, '..', '..')

  // Un archivo del sistema que el mapeo no sabe encontrar nunca llega, y falla en silencio:
  // upgrade lo saltea con un `continue` y nadie se entera.
  const lost = O.SYSTEM_FILES
    .map((file) => ({ file, source: O.sourceOf(file) }))
    .filter(({ source }) => !fs.existsSync(path.join(repoRoot, source)))
  assert.deepEqual(lost, [], 'hay rutas del sistema que no resuelven contra el paquete')

  for (const relative of O.RUNTIME_PATHS.concat(O.SYSTEM_COLLECTIONS)) {
    const source = O.sourceOf(relative)
    // `.ops/*` sólo existe en una instancia en modo copia; en el paquete es su origen real.
    if (relative.startsWith('.ops/')) {
      assert.equal(fs.existsSync(path.join(repoRoot, source)), true, `${relative} → ${source}`)
    }
  }
})

// El mismo texto entrando por las dos puertas, que es lo único que comprueba que quedó una sola
// lectura. `draft.md` es la superficie que una persona edita a mano: ahí se veía la diferencia.
test('el frontmatter se lee igual desde planning y desde integraciones', () => {
  const FM = require('../../engine/core/frontmatter')
  const S = require('../../engine/integrations/state')

  assert.deepEqual(FM.frontmatter('---\nepic: 001\nstatus: open\n---\n# Título\n'),
    { epic: '001', status: 'open' })
  assert.deepEqual(FM.frontmatter('---\n2fa: si\n---\n'), { '2fa': 'si' }, 'la clave admite lo que admite YAML')
  assert.deepEqual(FM.frontmatter('---\ntitle: "Con comillas"\n---\n'), { title: 'Con comillas' })

  // Frontmatter es lo que encabeza el documento: un `---` en el medio es una línea horizontal.
  assert.deepEqual(FM.frontmatter('# Título\n\n---\nepic: 001\n---\n'), {})
  assert.deepEqual(FM.frontmatter('sin frontmatter'), {})
  assert.deepEqual(FM.frontmatter(undefined), {}, 'no explota con lo que no es texto')

  // Las dos formas de llamarlo leen lo mismo; sólo cambia qué devuelven.
  const texto = '---\ntask: alta\nphase: Build\n---\n'
  assert.equal(P.frontmatter(texto)('phase'), 'Build')
  assert.equal(P.frontmatter(texto)('inexistente'), '', 'el contrato de planning devuelve vacío, no undefined')
  assert.deepEqual(S.frontmatter(texto), { task: 'alta', phase: 'Build' })
})

test('el manifiesto ausente se lee vacío y el ilegible se niega a ser leído', () => {
  const root = tempRoot('manifest-')
  // Ausente es legítimo: una instancia recién creada todavía no lo tiene, y leerlo vacío es correcto.
  assert.deepEqual(MF.read(root), {})
  assert.deepEqual(MF.readRunners(root), {})

  // Ilegible no. Vacío afirmaría que la empresa no editó nada, y `upgrade` decide con eso qué pisar.
  const file = path.join(root, '.cauce', 'manifest.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{"version":1,"files":{"AGENTS.m')
  assert.throws(() => MF.read(root), /manifest\.json: no se puede leer/)
  assert.throws(() => MF.readRunners(root), /manifest\.json: no se puede leer/, 'por cualquiera de sus lecturas')

  // Lo que sí parsea pero trae una sección de otro tipo se lee vacío en esa sección y no rompe: el
  // registro creció por versiones, y una instancia vieja no tiene todas las que hoy existen.
  fs.writeFileSync(file, JSON.stringify({ version: 1, files: { 'AGENTS.md': 'abc' }, runners: null }))
  assert.deepEqual(MF.read(root), { 'AGENTS.md': 'abc' })
  assert.deepEqual(MF.readRunners(root), {})
})
