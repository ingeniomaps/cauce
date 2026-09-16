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

// El aviso tenía una salida temprana que no corría nunca; por qué no se repone está junto al código que
// la reemplazó (engine/core/onboarding.js). Lo que esto fija es la conducta que la vuelve borrable, y por
// eso el caso deja los tres contratos en blanco: sobre ese árbol, resucitar la guarda cambia el
// resultado, así que el verde de acá dice que el aviso sigue saliendo y no que nadie lo mira.
test('un contrato vacío no apaga el aviso: nadie la nombra igual', () => {
  const { ops } = instance('cauce-contratos-vacios-', 'embedded', 'DB_PASSWORD=\n')
  assert.match(orphanLine(ops), /DB_PASSWORD \(api\)/, 'con los contratos como vienen')

  for (const file of [path.join('organization', 'workspace.md'), 'AGENTS.md',
    path.join('planning', 'HUMAN_ACTIONS.md')]) {
    const full = path.join(ops, file)
    if (fs.existsSync(full)) fs.writeFileSync(full, '')
  }
  assert.match(orphanLine(ops), /DB_PASSWORD \(api\)/, 'y con los tres vacíos, que es cuando más importa')
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

// El aviso nombra el servicio, y el servicio lo nombraba la carpeta de su raíz: con dos repositorios
// `…/keycloak` salía `KC_DB_PASSWORD (keycloak), KC_DB_PASSWORD (keycloak)`, dos secretos distintos con
// la misma etiqueta y ninguno atribuible (caso 113).
test('el aviso distingue dos raíces que terminan en la misma carpeta', () => {
  const { ops } = instance('cauce-113-', 'sidecar', 'PORT=3000\n')
  const base = path.dirname(ops)
  for (const org of ['gouduet', 'hypixo']) {
    const dir = path.join(base, org, 'keycloak')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"keycloak"}')
    fs.writeFileSync(path.join(dir, '.env.example'), 'KC_DB_PASSWORD=\n')
  }
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  config.workspaceRoots = [
    { name: 'gouduet', path: '../gouduet/keycloak' },
    { name: 'hypixo', path: '../hypixo/keycloak' },
  ]
  fs.writeFileSync(file, JSON.stringify(config, null, 2))
  const line = orphanLine(ops)
  assert.match(line, /en gouduet, hypixo\): KC_DB_PASSWORD \(gouduet\), KC_DB_PASSWORD \(hypixo\)/)
  assert.doesNotMatch(line, /\(keycloak\)/, 'la carpeta ya no nombra a ninguna de las dos')
})

// La posición 41, que es donde el 134 encontró dos credenciales invisibles en una instancia real. Por qué
// el tope recorta la lista y no el análisis está en `core/scan.js`, junto a la constante.
test('una credencial pasado el tope del escaneo se acusa igual', () => {
  const config = Array.from({ length: 40 }, (_, index) => `CONFIG_${index}=`).join('\n')
  const { ops } = instance('cauce-102-tope-', 'embedded', `${config}\nDB_PASSWORD=\n`)
  const all = warnings(ops).join('\n')
  assert.match(all, /DB_PASSWORD/, 'la credencial de la posición 41 se nombra')
  assert.match(all, /credenciales por nombre sin dueño/)
})

// Y el aviso de recorte sigue existiendo, porque un corte que no se anuncia hace pasar lo listado por
// todo lo que hay. Lo que cambió es lo que promete: no «no miré esto» sino «no te listo todo».
test('el recorte de la lista se sigue diciendo', () => {
  const config = Array.from({ length: 40 }, (_, index) => `CONFIG_${index}=`).join('\n')
  const { ops } = instance('cauce-102-recorte-', 'embedded', `${config}\nDB_PASSWORD=\n`)
  const all = warnings(ops).join('\n')
  assert.match(all, /pasado el tope de variables por servicio: api \(1 de 41\)/)
  assert.doesNotMatch(all, /sin revisar|quedó afuera puede incluir/, 'ya no promete ceguera')
})
