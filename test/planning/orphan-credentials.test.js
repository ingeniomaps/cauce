'use strict'

// El aviso de credenciales sin dueño de `check` (casos 102 y 111): qué cuenta como credencial, cuándo una
// variable está nombrada y qué pasa con lo que el escaneo corta. Se mira desde el CLI porque así lo lee
// quien lo recibe: una línea en stderr, con el gate en verde.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const secrets = require('../../engine/secrets')
const { sensitivePath } = require('../../engine/integrations/registry')

// Una instancia con una épica —recién creada el aviso no corre— y un servicio con el ejemplo dado. En
// sidecar el servicio es hermano de la instancia: adentro, el inventario lo saltea junto con la raíz ops.
function instance(prefix, mode, env) {
  const base = tempRoot(prefix)
  const ops = path.join(base, mode === 'sidecar' ? 'acme-ops' : 'acme')
  const init = run(['init', ops, '--name', 'Acme', '--mode', mode, '--no-install'])
  assert.equal(init.status, 0, init.stderr)
  const service = mode === 'sidecar' ? path.join(base, 'api') : path.join(ops, 'api')
  fs.mkdirSync(service, { recursive: true })
  fs.writeFileSync(path.join(service, 'package.json'), '{"name":"api","scripts":{"test":"node --test"}}\n')
  fs.writeFileSync(path.join(service, '.env.example'), env)
  const roadmap = path.join(ops, 'planning', 'roadmap')
  const epic = fs.readFileSync(path.join(roadmap, 'epic-000-template.md'), 'utf8')
    .replace(/^status: template/m, 'status: open').replace(/^epic: .*/m, 'epic: 001')
  fs.writeFileSync(path.join(roadmap, 'epic-001-primera.md'), epic)
  return { ops, service }
}

function warnings(ops) {
  const result = run(['check', path.join(ops, 'planning')])
  assert.equal(result.status, 0, `es advertencia, no rompe el gate:\n${result.stderr}`)
  return (result.stderr + result.stdout).split('\n').filter((line) => line.startsWith('⚠'))
}

const orphanLine = (ops) => warnings(ops).filter((line) => /nadie las carga/.test(line)).join('\n')

test('el aviso nombra la credencial y deja afuera la configuración, en los dos modos', () => {
  for (const mode of ['embedded', 'sidecar']) {
    const { ops } = instance(`cauce-102-${mode}-`,
      mode, 'IMAGE_NAME=api\nDOCKERFILE=Dockerfile\nPORT=3000\nLOG_LEVEL=info\nDB_PASSWORD=\n')
    const line = orphanLine(ops)
    assert.match(line, /credenciales por nombre sin dueño \(1, en api\): DB_PASSWORD \(api\) —/, mode)
    for (const name of ['IMAGE_NAME', 'DOCKERFILE', 'PORT', 'LOG_LEVEL']) {
      assert.doesNotMatch(line, new RegExp(name), `${mode}: ${name} es configuración`)
    }
    assert.match(line, /el criterio es el nombre/, `${mode}: el aviso dice qué no cubre`)
  }
})

// Los dos lados del límite, por separado: lo que va antes del nombre y lo que va después.
test('una variable cuenta como nombrada sólo si aparece entera', () => {
  const { ops } = instance('cauce-111-', 'embedded', 'IMAGE_NAME=api\nAPI_SECRET=\n')
  const workspace = path.join(ops, 'organization', 'workspace.md')
  assert.match(orphanLine(ops), /API_SECRET \(api\)/)

  fs.appendFileSync(workspace, '\nLa imagen sale de DOCKERFILE_PATH; ver API_SECRET_ROTATION.\n')
  assert.match(orphanLine(ops), /API_SECRET \(api\)/, 'un nombre que la contiene al principio no la carga')

  fs.appendFileSync(workspace, '\nLa vieja era LEGACY_API_SECRET y ya no se usa.\n')
  assert.match(orphanLine(ops), /API_SECRET \(api\)/, 'un nombre que la contiene al final tampoco')

  fs.appendFileSync(workspace, '\n- `API_SECRET`: la carga el equipo de infra.\n')
  assert.equal(orphanLine(ops), '', 'nombrada entera, deja de avisarse')
})

// Una regla para los dos: si el aviso tuviera su propia lista, un nombre podría ser credencial para uno y
// configuración para el otro sin que ninguna prueba de las suyas lo note.
test('el aviso y secrets check juzgan igual el mismo nombre', () => {
  const names = ['API_SECRET', 'DB_PASSWORD', 'GITHUB_TOKEN', 'API_KEY', 'STRIPE_KEY', 'SENTRY_DSN',
    'GCP_CREDENTIALS', 'IMAGE_NAME', 'TOKEN_TTL', 'SECRET_ENV', 'PORT', 'KEYCLOAK_URL']
  const { ops, service } = instance('cauce-102-regla-', 'embedded', 'PORT=3000\n')
  const warned = []
  const rejected = []
  for (const name of names) {
    fs.writeFileSync(path.join(service, '.env.example'), `${name}=\n`)
    if (orphanLine(ops)) warned.push(name)
    fs.writeFileSync(path.join(ops, 'organization', 'secrets.json'),
      JSON.stringify({ schemaVersion: 1, accounts: { principal: { [name]: 'x' } } }))
    if (secrets.check(ops).errors.some((error) => /tiene forma de secreto/.test(error))) rejected.push(name)
  }
  assert.deepEqual(warned, rejected)
  assert.deepEqual(warned, ['API_SECRET', 'DB_PASSWORD', 'GITHUB_TOKEN', 'API_KEY', 'STRIPE_KEY', 'SENTRY_DSN',
    'GCP_CREDENTIALS'])
})

// La clave del proyecto de Jira está en la configuración de instancias reales: extender la regla con la
// palabra entera la habría rechazado en su validación.
test('la clave cuenta como secreto sólo como palabra propia', () => {
  assert.equal(sensitivePath({ projectKey: 'DROP', auth: { tokenEnv: 'JIRA_API_TOKEN' } }), '')
  assert.equal(sensitivePath({ auth: { API_KEY: 'x' } }), 'auth.API_KEY')
})

test('lo que pasa del tope del escaneo se dice en vez de callarlo', () => {
  const config = Array.from({ length: 40 }, (_, index) => `CONFIG_${index}=`).join('\n')
  const { ops } = instance('cauce-102-tope-', 'embedded', `${config}\nDB_PASSWORD=\n`)
  const all = warnings(ops).join('\n')
  assert.match(all, /pasado el tope de variables por servicio: api \(1 de 41\)/)
})
