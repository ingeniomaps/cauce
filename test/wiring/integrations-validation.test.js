'use strict'

// Lo que los validadores de una integración **rechazan**: la configuración de Jira y una propuesta, campo
// por campo. Vive aparte de `integrations.test.js` porque tiene otro reloj: ahí se prueba qué hace el
// registro cuando todo está bien —paginar, stagear, curar—, y acá qué pasa cuando un campo está mal, que
// cambia cuando cambia una regla de validación y no cuando cambia Jira.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PR = require('../../engine/integrations/proposals')
const { validateConfig } = require('../../engine/integrations/providers/jira')

// Un validador probado sólo por lo que acepta no prueba nada: su trabajo es rechazar. Los diez
// rechazos de Jira no tenían una sola aserción, así que quitarle cualquiera —el que exige HTTPS, el
// que fija `writeBack` en false— pasaba CI en verde. Cada caso muta un solo campo de una
// configuración válida, para que el error que se observa sea el de esa mutación y no otro.
test('la configuración de Jira se rechaza campo por campo', () => {
  const validates = () => ({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    jql: 'project = DEMO',
    auth: { type: 'bearer', tokenEnv: 'JIRA_TOKEN' },
    writeBack: false,
  })
  const errors = (change) => {
    const found = []
    validateConfig({ ...validates(), ...change }, found)
    return found
  }

  assert.deepEqual(errors({}), [], 'la base no dispara ningún rechazo')

  const cases = [
    [{ enabled: 'si' }, /enabled debe ser boolean/],
    [{ baseUrl: 'http://example.atlassian.net' }, /baseUrl debe ser HTTPS/],
    [{ baseUrl: 'https://example.atlassian.net/jira' }, /baseUrl debe ser HTTPS/],
    [{ jql: '   ' }, /falta jql/],
    [{ auth: { type: 'oauth', tokenEnv: 'T' } }, /auth\.type debe ser basic\|bearer/],
    [{ auth: { type: 'bearer' } }, /falta auth\.tokenEnv/],
    [{ auth: { type: 'basic', tokenEnv: 'T' } }, /basic exige auth\.emailEnv/],
    [{ writeBack: true }, /writeBack debe permanecer false/],
    [{ timeoutMs: 999 }, /timeoutMs debe ser un entero/],
    [{ timeoutMs: 1500.5 }, /timeoutMs debe ser un entero/],
    [{ maxPages: 0 }, /maxPages debe ser un entero positivo/],
    [{ candidateAssigneeEnv: 'no-es-una-variable' }, /candidateAssigneeEnv debe nombrar/],
  ]
  for (const [change, expected] of cases) {
    const found = errors(change)
    assert.ok(
      found.some((error) => expected.test(error)),
      `${JSON.stringify(change)} no fue rechazado; salió: ${JSON.stringify(found)}`,
    )
  }

  // Y lo opcional sigue siendo opcional: ausente no es inválido.
  assert.deepEqual(errors({ timeoutMs: undefined, maxPages: undefined }), [])
  assert.deepEqual(errors({ timeoutMs: 1000, maxPages: 1, candidateAssigneeEnv: 'JIRA_ME' }), [])
})

// Los once rechazos de una propuesta tampoco tenían aserción, y son los que sostienen que nada llegue
// a Jira sin destino, sin estimación o colgando de un padre inventado. Cada caso escribe una propuesta
// válida con un solo campo cambiado.
test('una propuesta se rechaza campo por campo', () => {
  const root = tempRoot('ops-proposals-')
  const proposed = path.join(root, 'integrations', 'jira', 'proposed')
  fs.mkdirSync(proposed, { recursive: true })
  fs.mkdirSync(path.join(root, 'integrations', 'jira', 'staging', 'epics', 'DEMO-1'), { recursive: true })
  fs.writeFileSync(path.join(root, 'integrations', 'jira', 'staging', 'epics', 'DEMO-1', 'remote.json'), '{}')
  fs.mkdirSync(path.join(root, 'app'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ runner: { maxTaskHours: 4 } }))

  const errors = (fields = {}) => {
    const f = { provider: 'jira', state: 'draft', type: 'Epic', summary: 'Un título', desc: 'Un texto', ...fields }
    const frontmatter = ['provider', 'state', 'type', 'parent', 'service', 'estimateHours', 'remote', 'justification']
      .filter((key) => f[key] !== undefined)
      .map((key) => `${key}: ${f[key]}`)
      .join('\n')
    const md = `---\n${frontmatter}\n---\n\n# ${f.summary}\n\n## Descripción\n\n${f.desc}\n`
    fs.writeFileSync(path.join(proposed, '01.md'), md)
    return PR.validate(root, 'jira', [{ resolved: root }])
  }

  assert.deepEqual(errors(), [], 'la base no dispara ningún rechazo')

  const cases = [
    [{ provider: 'otro' }, /provider debe ser jira/],
    [{ state: 'raro' }, /state inválido/],
    [{ type: 'Raro' }, /type inválido/],
    [{ summary: '' }, /falta título/],
    [{ desc: '' }, /falta Descripción/],
    [{ parent: 'no valido' }, /parent no es una clave remota válida/],
    [{ type: 'Story' }, /Story exige parent/],
    [{ type: 'Story', parent: 'DEMO-99' }, /DEMO-99 no está presente en staging/],
    [{ state: 'approved' }, /approved exige service/],
    [{ state: 'approved', service: 'no-existe' }, /service no existe/],
    [{ state: 'approved', service: 'app' }, /approved exige estimateHours mayor que cero/],
    [{ state: 'approved', service: 'app', estimateHours: 8 }, /supera 4h; debe dividirse/],
    [{ state: 'published' }, /published exige remote/],
  ]
  for (const [fields, expected] of cases) {
    const found = errors(fields)
    assert.ok(
      found.some((error) => expected.test(error)),
      `${JSON.stringify(fields)} no fue rechazado; salió: ${JSON.stringify(found)}`,
    )
  }

  // Y una propuesta aprobada completa pasa: el rechazo mira el campo, no el estado.
  assert.deepEqual(errors({ state: 'approved', service: 'app', estimateHours: 3 }), [])
  assert.deepEqual(errors({ state: 'approved', service: 'app', estimateHours: 8, justification: 'x' }), [])
  assert.deepEqual(errors({ type: 'Story', parent: 'DEMO-1' }), [])

  // Cuarenta horas y no ocho: el tope que se está midiendo es el default, y un número apenas por encima
  // de cuatro no distingue «cayó al default» de «quedó en el declarado». El porqué del `||` que lo
  // sostiene está donde se lee la configuración (engine/integrations/proposals.js).
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ runner: {} }))
  assert.match(
    errors({ state: 'approved', service: 'app', estimateHours: 40 }).join('\n'),
    /supera 4h; debe dividirse/,
    'sin maxTaskHours declarado el tope cae al default, no desaparece',
  )
})

// Por qué el campo también se valida cuando la promoción es una épica está junto a la regla
// (engine/integrations/registry.js). Lo que el caso agrega es la consecuencia, que ahí no se puede
// probar: se corre `promote` además de `check`, porque lo que importa no es el error sino que no quede
// nada escrito fuera del roadmap.
//
// El draft lo produce `sync` y no se arma a mano: la validación corre sobre un item de staging entero
// —snapshot, señales, secciones— y un directorio escrito a mano falla antes de llegar a este campo.
function readyDraft(fields) {
  const base = tempRoot('ops-promotion-epic-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  fs.mkdirSync(path.join(base, 'app'))
  const registryFile = path.join(target, 'integrations', 'config.json')
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  registry.providers.jira.enabled = true
  fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2))
  assert.equal(run(['integration', 'enable', target, 'jira']).status, 0)
  const jiraFile = path.join(target, 'integrations', 'jira', 'config.json')
  const jira = JSON.parse(fs.readFileSync(jiraFile, 'utf8'))
  Object.assign(jira, { enabled: true, baseUrl: 'https://example.atlassian.net', jql: 'project = DEMO' })
  fs.writeFileSync(jiraFile, JSON.stringify(jira, null, 2))
  const fixture = path.resolve(__dirname, '..', 'support', 'fixtures', 'jira-search.json')
  assert.equal(run(['integration', 'sync', target, 'jira', '--fixture', fixture]).status, 0)

  const draftFile = path.join(target, 'integrations', 'jira', 'staging', 'stories', 'DEMO-42', 'draft.md')
  let draft = fs.readFileSync(draftFile, 'utf8')
    .replace('state: pending', 'state: ready')
    .replace('- Definir destino de promoción.', '- La incidencia se convertirá en épica local.')
  for (const [key, value] of Object.entries(fields)) draft = draft.replace(`${key}: ""`, `${key}: ${value}`)
  fs.writeFileSync(draftFile, draft)
  return target
}

test('promotionEpic tiene que ser NNN también cuando la promoción es una épica', () => {
  const sano = readyDraft({ promotionKind: 'epic' })
  assert.equal(run(['integration', 'check', sano, 'jira']).status, 0, 'sin el campo sigue siendo válido')
  assert.equal(run(['integration', 'promote', sano, 'jira', 'DEMO-42']).status, 0)
  assert.ok(fs.readdirSync(path.join(sano, 'planning', 'roadmap')).some((file) => /^epic-001-/.test(file)))

  // Un número sin rellenar produce `epic-7-…`, que el roadmap no reconoce como épica: la promoción se
  // anuncia bien y lo escrito queda invisible para la cola.
  const corto = readyDraft({ promotionKind: 'epic', promotionEpic: '7' })
  const cortoCheck = run(['integration', 'check', corto, 'jira'])
  assert.equal(cortoCheck.status, 1, cortoCheck.stdout)
  assert.match(cortoCheck.stderr + cortoCheck.stdout, /promotionEpic debe ser NNN/)

  // Y un `..` sacaba la épica de `roadmap/` con `promote` devolviendo 0 y diciendo «promovido como epic».
  const fuga = readyDraft({ promotionKind: 'epic', promotionEpic: '../../../pwned' })
  assert.equal(run(['integration', 'check', fuga, 'jira']).status, 1)
  const promote = run(['integration', 'promote', fuga, 'jira', 'DEMO-42'])
  assert.equal(promote.status, 1, 'y promote se niega, que es lo que impide la escritura')
  assert.deepEqual(fs.readdirSync(path.join(fuga, 'planning')).filter((file) => /pwned/.test(file)), [],
    'nada escrito fuera del roadmap')
})
