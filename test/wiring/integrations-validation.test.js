'use strict'

// Lo que los validadores de una integración **rechazan**: la configuración de Jira y una propuesta, campo
// por campo. Vive aparte de `integrations.test.js` porque tiene otro reloj: ahí se prueba qué hace el
// registro cuando todo está bien —paginar, stagear, curar—, y acá qué pasa cuando un campo está mal, que
// cambia cuando cambia una regla de validación y no cuando cambia Jira.

const { tempRoot } = require('../support/environment')
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
