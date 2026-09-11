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
    'planning/rules/code-shape.md',
    'planning/rules/security.md',
  ])
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
