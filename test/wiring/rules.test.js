'use strict'

// El conjunto de reglas vigentes, su render en cada adaptador, el aviso de lo desactualizado y la línea RULES
// (casos 099 y 105). El reparto a los subagentes vive en `autobuild-review.test.js`, junto a su arnés.

const { installedProject } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const O = require('../../engine/core/ownership')
const { inline } = require('../../engine/automation/runners')

// El banco de los dos casos: una regla que sobrescribe una del sistema y una propia nueva.
function ownRules(target) {
  const rules = path.join(target, 'planning', 'rules')
  fs.writeFileSync(path.join(rules, 'code-shape.md'),
    '# Forma del cambio (propia)\n\n## P1 — Archivos de hasta 400 líneas\n\nRegla de la empresa.\n')
  fs.writeFileSync(path.join(rules, 'security.md'),
    '# Seguridad (propia)\n\n## P2 — Autenticación cerrada por defecto\n\nRegla de la empresa.\n')
}
// `installedProject` arma un sidecar: el runner se abre en el padre y las rutas llevan el prefijo `ops/`.
const OWN = ['ops/planning/rules/code-shape.md', 'ops/planning/rules/security.md']
const RETIRED = 'ops/planning/rules/system/code-shape.md'
const read = (file) => fs.readFileSync(file, 'utf8')

test('las reglas vigentes son las propias y las del sistema que el proyecto no sobrescribió', () => {
  const { target } = installedProject('cauce-rules-set-')
  ownRules(target)
  // Ni el índice ni lo que cuelga de un subdirectorio: `check` tampoco lee más allá del primer nivel.
  fs.mkdirSync(path.join(target, 'planning', 'rules', 'borradores'))
  fs.writeFileSync(path.join(target, 'planning', 'rules', 'borradores', 'x.md'), '# x\n')
  assert.deepEqual(O.effectiveRules(target), [
    'planning/rules/system/commits.md',
    'planning/rules/system/conduct.md',
    'planning/rules/system/process.md',
    'planning/rules/system/runs.md',
    'planning/rules/code-shape.md',
    'planning/rules/security.md',
  ])
})

// Reemplazar «pensar antes de editar» por la versión de la empresa es lo primero que hace cualquiera que
// adopta Cauce sobre su propio proceso, y el override es por nombre de archivo: se llevaba puesto el
// archivo entero. R16, R20, R21 y R22 —lo que cuesta una corrida, cuándo una medición vale, cómo se
// retoma, qué no se toca mientras se mide— dejaban de llegarle a todo agente sin que nadie lo decidiera.
// Una instancia real las declaró «adoptadas por referencia» en una tabla de prosa que el motor no lee, y
// dos de ellas no estaban rigiendo el día que le costaron una sesión (caso 160).
//
// Por eso viven en `runs.md`: la prueba no es que el override ande —eso ya se mide arriba— sino que el
// archivo que una empresa reemplaza no arrastre lo que nadie reemplaza.
test('sobrescribir el proceso propio no se lleva puesto lo que cuesta una corrida', () => {
  const { target } = installedProject('cauce-rules-proceso-')
  fs.writeFileSync(path.join(target, 'planning', 'rules', 'process.md'),
    '# Proceso (propio)\n\n## R1 — Pensar antes de codear\n\nLa versión de la empresa.\n')

  const vigentes = O.effectiveRules(target)
  assert.equal(vigentes.includes('planning/rules/system/process.md'), false, 'el override rige')
  assert.ok(vigentes.includes('planning/rules/system/runs.md'), `se perdió runs.md: ${vigentes.join(', ')}`)

  // Y llegan de verdad, no sólo en la lista: es el texto lo que un agente lee.
  const texto = read(path.join(target, 'planning', 'rules', 'system', 'runs.md'))
  for (const id of ['R16', 'R20', 'R21', 'R22']) assert.match(texto, new RegExp(`^## ${id} — `, 'm'), id)
})

test('cada runner instala las reglas vigentes y ninguna que el proyecto retiró', () => {
  const { workspace, target, runCli } = installedProject('cauce-rules-runners-')
  ownRules(target)
  const files = {
    claude: 'CLAUDE.md',
    gemini: 'GEMINI.md',
    antigravity: '.agents/plugins/cauce/rules/cauce.md',
    codex: 'AGENTS.md',
  }
  for (const [runner, file] of Object.entries(files)) {
    const result = runCli(['automation', 'install', target, runner])
    assert.equal(result.status, 0, result.stderr)
    const text = read(path.join(workspace, file))
    for (const rule of OWN) assert.ok(text.includes(rule), `${runner}: ${file} no nombra ${rule}`)
    assert.equal(text.includes(RETIRED), false, `${runner}: ${file} sigue nombrando la regla sobrescrita`)
    // La prosa de antes mandaba a leer la carpeta entera, que incluye la sobrescrita.
    assert.equal(/planning\/rules\/system\/`/.test(text), false, `${runner}: ${file} manda a leer system/ entero`)
  }
  // Donde la herramienta carga con `@`, van como import: nombrada en prosa, una regla no la carga nadie.
  for (const file of ['CLAUDE.md', 'GEMINI.md']) {
    for (const rule of OWN) assert.match(read(path.join(workspace, file)), new RegExp(`^@${rule}$`, 'm'), file)
  }
})

test('una regla escrita después de instalar hace avisar a check y a doctor hasta reinstalar', () => {
  const { target, runCli } = installedProject('cauce-rules-stale-', 'claude')
  const planning = path.join(target, 'planning')
  const fresh = runCli(['check', planning])
  assert.equal(fresh.status, 0, fresh.stderr)
  assert.doesNotMatch(fresh.stderr, /claude: CLAUDE\.md/, 'recién instalado no hay nada que avisar')

  ownRules(target)
  const stale = runCli(['check', planning])
  assert.equal(stale.status, 0, 'avisa, no frena: la instancia sigue siendo válida')
  assert.match(stale.stderr, new RegExp('claude: CLAUDE\\.md no carga planning/rules/code-shape\\.md, '
    + 'planning/rules/security\\.md y carga planning/rules/system/code-shape\\.md, que ya no rige'))
  const doctor = runCli(['automation', 'doctor', target, 'claude'])
  assert.match(doctor.stderr, /CLAUDE\.md no carga planning\/rules\/code-shape\.md/)
  assert.doesNotMatch(doctor.stderr, /CLAUDE\.md: Cauce trae una versión más nueva/, 'el aviso genérico calla')

  // Una regla que trae un `upgrade` llega por el mismo lado: al `system/` de la instancia, sin reinstalar.
  fs.writeFileSync(path.join(planning, 'rules', 'system', 'nueva.md'), '# Nueva\n\n## R99 — Nueva\n\nX.\n')
  assert.match(runCli(['check', planning]).stderr, /no carga .*planning\/rules\/system\/nueva\.md/)

  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.doesNotMatch(runCli(['check', planning]).stderr, /claude: CLAUDE\.md/, 'reinstalado, calla')
  assert.doesNotMatch(runCli(['automation', 'doctor', target, 'claude']).stderr, /reglas|no carga/)
})

test('un CLAUDE.md con cambios propios recibe las reglas vigentes sin perder lo suyo', () => {
  const { workspace, target, runCli } = installedProject('cauce-rules-own-', 'claude')
  const file = path.join(workspace, 'CLAUDE.md')
  fs.appendFileSync(file, '\n## Lo nuestro\n\nNunca toques la carpeta legacy/.\n')
  ownRules(target)
  const result = runCli(['automation', 'install', target, 'claude'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /CLAUDE\.md conserva tus cambios y recibió las reglas vigentes/)
  const check = (text) => {
    assert.match(text, /Nunca toques la carpeta legacy/, 'lo propio sigue ahí')
    for (const rule of OWN) assert.match(text, new RegExp(`^@${rule}$`, 'm'))
    assert.equal(text.includes(RETIRED), false, 'y la sobrescrita se fue')
  }
  check(read(file))

  // Uno editado antes de que existiera el bloque: los imports fijos se reemplazan donde estaban.
  const legacy = ['process', 'code-shape', 'commits', 'conduct'].map((one) => `@ops/planning/rules/system/${one}.md`)
  fs.writeFileSync(file, read(file).replace(/<!-- cauce:reglas inicio[\s\S]*<!-- cauce:reglas fin -->/,
    legacy.join('\n')))
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  check(read(file))
  assert.equal(read(file).split('@ops/planning/rules/system/process.md').length, 2, 'el import quedó una vez')

  // Y uno que es de la empresa sin nada de Cauce no se toca: `check` dice qué le falta y cómo dárselo.
  fs.writeFileSync(file, '# Propio\n\nSin imports.\n')
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(read(file), '# Propio\n\nSin imports.\n')
  assert.match(runCli(['check', path.join(target, 'planning')]).stderr,
    /CLAUDE\.md no carga las reglas vigentes; .*marcá dónde va el bloque/)
})

test('context dice qué reglas rigen, en texto y en --json', () => {
  const { target, runCli } = installedProject('cauce-rules-context-')
  ownRules(target)
  const planning = path.join(target, 'planning')
  const json = runCli(['context', planning, '--json'])
  assert.equal(json.status, 0, json.stderr)
  const { rules } = JSON.parse(json.stdout)
  assert.ok(Array.isArray(rules), 'context --json no trae rules')
  for (const rule of ['planning/rules/code-shape.md', 'planning/rules/security.md']) assert.ok(rules.includes(rule))
  assert.equal(rules.includes('planning/rules/system/code-shape.md'), false, 'la sobrescrita no rige')
  assert.match(runCli(['context', planning]).stdout, /^RULES {2}.*planning\/rules\/security\.md/m)
})

// Las cuatro propiedades de una regla declarada por superficie, y la quinta que protege a las demás: que
// una sin declarar no cambie. Por qué se decidió así lo explica `engine/automation/rules.js`, junto a la
// partición; acá se mide que las cinco se cumplan a la vez, que es lo que ninguna sola asegura.
test('una regla que declara su superficie se nombra sin cargarse, y una sin declarar no cambia', () => {
  const { workspace, target, runCli } = installedProject('cauce-rules-superficie-', 'claude')
  const rules = path.join(target, 'planning', 'rules')
  fs.writeFileSync(path.join(rules, 'pagos.md'),
    '---\naplica: pagos\n---\n\n# Pagos (propia)\n\n## P3 — Conciliar antes de cerrar\n\nRegla de la empresa.\n')
  // La vecina sin frontmatter: el default de hoy, que este cambio no puede tocar.
  fs.writeFileSync(path.join(rules, 'security.md'),
    '# Seguridad (propia)\n\n## P2 — Autenticación cerrada por defecto\n\nRegla de la empresa.\n')
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  const text = read(path.join(workspace, 'CLAUDE.md'))

  // 1. No se carga: es el token que se ahorra.
  assert.doesNotMatch(text, /^@ops\/planning\/rules\/pagos\.md$/m, 'la condicional no entra como import')
  // 2. Pero se ve, y con qué la dispara: nombrarla es lo único que la separa de no existir.
  assert.match(text, /^- .*ops\/planning\/rules\/pagos\.md.*\(aplica: pagos\)/m, 'nombrada, con su superficie')
  // 3. Y la que no declara nada sigue cargándose igual que antes de este cambio.
  assert.match(text, /^@ops\/planning\/rules\/security\.md$/m, 'sin `aplica:` se carga como siempre')

  // 4. `context` las devuelve las dos: es por donde el recorrido arma qué reglas rigen.
  const { rules: rigen } = JSON.parse(runCli(['context', path.join(target, 'planning'), '--json']).stdout)
  assert.ok(rigen.includes('planning/rules/pagos.md'), 'la condicional sigue rigiendo')
  assert.ok(rigen.includes('planning/rules/security.md'))

  // 5. Y el aviso de deriva calla, que es lo que evita que una instancia con una regla condicional pida
  // reinstalar para siempre. Lo sostiene `listed`, que lee del bloque tanto los imports como las líneas
  // nombradas, así que el audit ve la condicional y no la extraña.
  assert.doesNotMatch(runCli(['check', path.join(target, 'planning')]).stderr, /claude: CLAUDE\.md/,
    'recién instalado, nada que avisar')
  assert.doesNotMatch(runCli(['automation', 'doctor', target, 'claude']).stderr, /no carga/,
    'doctor no reporta como faltante la que a propósito no se carga')
})

// Escribir una regla propia encarece todas las corridas futuras de todos los agentes, y hasta acá eso no
// lo decía nadie: había que sumar los tamaños a mano después de una corrida cara (caso 141). Las dos
// mitades de decirlo son distintas — `install` lo declara cuando se elige, `check` avisa cuando ya pesa—
// y las dos cuentan lo mismo: lo que el bloque **carga**. Una regla con `aplica:` no suma, porque si
// sumara declararla no serviría de nada.
// ~13,0 KB cada una. El tamaño se elige midiendo y no estimando, para que el banco tenga margen de los
// dos lados: con las dos el bloque llega a 72,0 KB y cruza el umbral de 64, y quitando una queda en 58,9
// y no. Era de 18,6 KB cuando el piso del toolkit eran 38,3; con el piso en 45,9 —las cinco reglas que
// R24..R28 sumaron— quitar una dejaba 64,5 KB, que sigue cruzando por medio KB, y la prueba habría
// culpado al motor por un fixture que envejeció. Es el mismo ajuste que ya se había hecho una vez, y por
// eso el número va acá con su medición al lado: se recalibra cada vez que el piso se mueve.
const heavyRule = (n) => `# Propia ${n}\n\n## P${n} — Regla de la empresa\n\n${'Texto de la regla. '.repeat(700)}\n`

test('install declara lo que el bloque de reglas va a pesar en cada agente', () => {
  const { target, runCli } = installedProject('cauce-rules-peso-')
  const salida = runCli(['automation', 'install', target, 'claude'])
  assert.equal(salida.status, 0, salida.stderr)
  // En bytes y no en tokens: los bytes los mide el motor, y la equivalencia en tokens depende del
  // modelo. Un número inventado en la salida es peor que uno exacto, porque se cita para decidir.
  // Cinco desde que `runs.md` salió de `process.md` (caso 160). Los KB se mueven cuando el toolkit enseña
  // algo nuevo —39,1 con cuatro archivos, 45,9 con R24..R28, 48,1 con lo agregado a R9, R17 y R3— y
  // la ventana se deja angosta a propósito: que esta prueba falle en cada edición de una regla **es** la
  // función. Es lo único que obliga a medir lo que cada agente paga antes de mover el número.
  assert.match(salida.stdout, /claude: el bloque de reglas carga 5 archivo\(s\), 4[78]\.\d KB en cada agente/,
    'declara cuántas y cuánto pesan')
})

test('check avisa cuando el bloque se pasa del umbral, y calla en una instancia limpia', () => {
  const { target, runCli } = installedProject('cauce-rules-umbral-', 'claude')
  const planning = path.join(target, 'planning')
  assert.doesNotMatch(runCli(['check', planning]).stderr, /bloque de reglas/,
    'recién creada no avisa: el piso que trae Cauce no es deuda de nadie')

  const rules = path.join(target, 'planning', 'rules')
  for (const n of [1, 2]) fs.writeFileSync(path.join(rules, `P${n}-propia.md`), heavyRule(n))
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  const avisa = runCli(['check', planning])
  assert.equal(avisa.status, 0, 'avisa y no frena: la instancia sigue siendo válida')
  assert.match(avisa.stderr, /el bloque de reglas carga 7 archivo\(s\), \d+\.\d KB en cada agente/,
    'dice cuánto pesa')
  assert.match(avisa.stderr, /P1-propia\.md/, 'y nombra las más grandes, que es lo accionable')

  // Y una regla declarada por superficie no cuenta: es justamente lo que se apartó del arranque.
  fs.writeFileSync(path.join(rules, 'P1-propia.md'), `---\naplica: pagos\n---\n\n${heavyRule(1)}`)
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.doesNotMatch(runCli(['check', planning]).stderr, /bloque de reglas/,
    'declarada por superficie, deja de pesar y el aviso calla')
})

// Un prompt que cita una regla por su número la exige aunque el proyecto la haya retirado, y a quien lee la
// fila le promete un texto que en su instancia no existe (caso 105). Se mira lo que un runner instala, con los
// includes resueltos; los comentarios de un workflow quedan afuera porque no los lee ningún agente.
test('ningún texto que un runner instala cita una regla por número', () => {
  const automation = path.resolve(__dirname, '..', '..', 'automatization')
  const found = []
  for (const name of ['claude', 'codex', 'gemini', 'antigravity']) {
    const dir = path.join(automation, 'runners', name)
    const manifest = JSON.parse(read(path.join(dir, 'manifest.json')))
    for (const item of [...manifest.instructions, ...manifest.artifacts]) {
      const source = path.resolve(dir, item.source)
      inline(read(source), automation).split('\n').forEach((line, index) => {
        if (source.endsWith('.js') && /^\s*\/\//.test(line)) return
        if (/\bR\d{1,2}\b/.test(line)) found.push(`${name} ${item.target}:${index + 1}: ${line.trim()}`)
      })
    }
  }
  assert.deepEqual(found, [], `citas por número:\n${found.join('\n')}`)
})
