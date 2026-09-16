'use strict'

// Qué archivo puede tocar una herramienta: secretos, plantillas, y la prueba que juzga el cambio.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, chatSession, messageOf } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute, guards } = require('../../engine/hooks/run')

// Qué frenan los dos guards de credenciales, con los nombres conocidos y con una identidad declarada (caso 092).
test('secrets y secrets-read frenan una credencial conocida o declarada, al escribirla y al leerla', () => {
  const root = tempRoot('ops-hook-secretos-')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'organization'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded',
    workspaceRoots: [{ name: 'main', path: '.' }] }))
  const identity = path.join(tempRoot('ops-hook-secretos-casa-'), 'local-dev.env')
  fs.writeFileSync(path.join(root, 'organization', 'secrets.json'), JSON.stringify({ schemaVersion: 1,
    identities: { 'local-dev': { account: 'principal', source: 'file', file: identity } } }))
  const at = (file) => ({ cwd: root, tool_input: { file_path: file } })

  blocked('secrets', at(identity), /identidad declarada/)
  for (const file of [path.join(root, '.env'), path.join(root, 'id_ed25519'), identity]) {
    blocked('secrets-read', at(file), /leerla/)
  }
  assert.doesNotThrow(() => execute('secrets-read', at(path.join(root, '.env.example'))))
  assert.doesNotThrow(() => execute('secrets-read', at(path.join(root, 'src', 'app.js'))))
  // Las herramientas de búsqueda nombran por comodín: el `glob` del Grep de Claude y el `include_pattern`
  // del `grep_search` de Gemini (caso 104).
  blocked('secrets-read', { cwd: root, tool_input: { pattern: '.', glob: '.env*' } }, /leerla/)
  blocked('secrets-read', { cwd: root, tool_input: { pattern: '.', include_pattern: '.env' } }, /leerla/)
  assert.doesNotThrow(() => execute('secrets-read', { cwd: root, tool_input: { pattern: '.', glob: '*.md' } }))
  // Sin declaración, un nombre que no parece credencial vuelve a ser un archivo cualquiera.
  fs.rmSync(path.join(root, 'organization', 'secrets.json'))
  assert.doesNotThrow(() => execute('secrets', at(identity)))
})

test('guards de archivos protegen secretos y snapshots, pero permiten plantillas y drafts', () => {
  blocked('secrets', { tool_input: { file_path: '/project/.env.production' } }, /parece contener secretos/)
  blocked('secrets', { tool_input: { patch: '*** Begin Patch\n*** Add File: .env\n+TOKEN=x\n*** End Patch' } },
    /parece contener secretos/)
  blocked('secrets', { tool_input: { file_path: '/project/service-account.json' } }, /credenciales en texto plano/)
  assert.doesNotThrow(() => execute('secrets', { tool_input: { file_path: '/project/.env.example' } }))
  // Nombres que la herramienta escribe sola y que la lista original no cubría. Los encontró la
  // investigación semanal del cargo de seguridad corriendo el guard sobre trece nombres: `.env`
  // bloqueaba y `.npmrc`, `.netrc` e `id_rsa` pasaban, que es donde vive el token de publicación.
  for (const credencial of ['.npmrc', '.netrc', 'id_rsa', 'id_ed25519', '.pypirc', 'credentials']) {
    blocked('secrets', { tool_input: { file_path: `/project/${credencial}` } },
      /credenciales que su herramienta mantiene/)
  }
  // Tapa un caso conocido, no vuelve completo al guard: sigue decidiendo por el nombre del archivo.
  assert.doesNotThrow(() => execute('secrets', { tool_input: { file_path: '/project/.npmrc.example' } }))
  blocked('integration-snapshot', { tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/remote.json' } },
    /pertenece al sincronizador/)
  blocked('integration-snapshot', {
    tool_input: { file_path: '/project/integrations/jira/staging/stories/KEY-1/remote.json' },
  }, /pertenece al sincronizador/)
  const snapshotPatch = '*** Begin Patch\n'
    + '*** Update File: integrations/jira/staging/KEY-1/remote.json\n'
    + '*** End Patch'
  blocked('integration-snapshot', { tool_input: { patch: snapshotPatch } }, /pertenece al sincronizador/)
  const draft = { tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/draft.md' } }
  assert.doesNotThrow(() => execute('integration-snapshot', draft))
  blocked('generated', { tool_input: { file_path: '/project/api/client_generated.go' } }, /parece código generado/)
  blocked('generated', { tool_input: { patch: '*** Begin Patch\n*** Update File: src/api.gen.ts\n*** End Patch' } },
    /parece código generado/)
  assert.doesNotThrow(() => execute('generated', { tool_input: { file_path: '/project/src/client.go' } }))
})

// Los tres tenían la misma forma que `secrets-read` y ninguna de sus salidas: `secrets-read` consultaba la
// aprobación desde 0.80.0 y estos frenaban sin ofrecer nada, así que escribir una credencial no se podía
// autorizar ni pidiéndolo, mientras que leerla sí (caso 117).
test('los guards de archivo dejan pasar el archivo que la persona nombró', () => {
  const at = (file) => ({ tool_input: { file_path: file } })

  // Y su bloqueo no ofrece ninguna variable, porque no tienen apagado por sesión: anunciar el permiso más
  // ancho cuando alcanza el angosto es lo que hizo que la variable quedara como la vía a mano (caso 089).
  // El contraste con `secrets-read`, que sí tiene una, es lo que prueba que el cambio es condicional.
  assert.doesNotMatch(messageOf('secrets', at('/project/.env.production')), /La variable/)
  assert.match(messageOf('secrets-read', at('/project/.env')), /OPS_SECRETS_READ_OVERRIDE/)
  const chat = chatSession()
  try {
    for (const [guard, file] of [
      ['secrets', '/project/.env.production'],
      ['generated', '/project/api/client_generated.go'],
      ['integration-snapshot', '/project/integrations/jira/staging/KEY-1/remote.json'],
    ]) {
      assert.doesNotThrow(() => execute(guard, chat.says(`editá ${file}`)(at(file))), guard)
    }
  } finally { chat.close() }

  // En sesión nueva, por lo mismo que en `destructive`: lo concedido arriba se hereda y taparía el negativo.
  const otra = chatSession()
  try {
    // Nombrar sin pedir no autoriza, y la negación revoca: las dos mitades que el 109 y el 116 fijaron.
    blocked('secrets', otra.says('¿el /project/.env.production tiene algo raro?')(at('/project/.env.production')),
      /parece contener secretos/)
    blocked('secrets', otra.says('no toques /project/.env.production')(at('/project/.env.production')),
      /parece contener secretos/)
  } finally { otra.close() }
})

// El guard decide sobre el contenido entrante, así que hay dos ejes que se pueden romper por separado:
// reconocer el archivo como prueba y reconocer la marca que la apaga. Se prueban los dos, y sobre todo
// que un archivo que no es de prueba pueda decir "skip" sin que nadie lo frene.
test('guard-test-evidence no deja apagar ni borrar la prueba que juzga el cambio', () => {
  const cases = [
    ['users_test.go', 'func TestAlta(t *testing.T) { t.Skip("flaky") }'],
    ['alta.test.ts', "describe.skip('alta', () => {})"],
    ['alta.spec.js', "it.only('alta', () => {})"],
    ['tests/alta.py', '@pytest.mark.skip\ndef test_alta(): pass'],
    ['test_alta.py', '@unittest.skip("wip")\ndef test_alta(): pass'],
    ['alta_spec.rb', 'xit "alta" do end'],
  ]
  for (const [name, content] of cases) {
    blocked('test-evidence', { tool_input: { file_path: `/project/${name}`, content } }, /apaga una prueba/)
  }
  // Borrar la prueba es la otra forma de que el verde deje de significar algo.
  blocked('test-evidence', { tool_input: {
    patch: '*** Begin Patch\n*** Delete File: internal/users/alta_test.go\n*** End Patch',
  } }, /borra una prueba/)
  // Escribir una prueba de verdad no se toca, y el mismo texto fuera de una prueba tampoco: el guard
  // mira qué archivo es antes que qué dice.
  assert.doesNotThrow(() => execute('test-evidence', { tool_input: {
    file_path: '/project/users_test.go', content: 'func TestAlta(t *testing.T) { want(t, 1, alta()) }',
  } }))
  assert.doesNotThrow(() => execute('test-evidence', { tool_input: {
    file_path: '/project/src/runner.ts', content: 'export const skip = (n) => n.only',
  } }))
  // Apagar una prueba puede ser correcto; lo que no puede es ser invisible.
  process.env.OPS_TEST_EVIDENCE_OVERRIDE = '1'
  try {
    assert.doesNotThrow(() => execute('test-evidence', { tool_input: {
      file_path: '/project/users_test.go', content: 't.Skip("infra")',
    } }))
  } finally {
    delete process.env.OPS_TEST_EVIDENCE_OVERRIDE
  }
})

// Codex manda el sobre de `apply_patch` entero como `tool_input.command`, no como `patch`. El matcher
// engancha y el guard se ejecuta, pero sin reconocer ese campo no ve un solo archivo y deja pasar todo:
// en una sesión real reescribió una migración existente sin decir una palabra. El encabezado es lo que
// separa un parche de un comando de shell, y por eso se exige en vez de aceptar cualquier `command`.
test('guard-files lee el sobre de apply_patch aunque llegue como command', () => {
  const root = tempRoot('ops-hook-patch-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'migrations'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'migrations', '001_init.sql'), 'create table pedidos (id serial);\n')

  const sobre = (cuerpo) => ({
    cwd: root,
    tool_name: 'apply_patch',
    tool_input: { command: `*** Begin Patch\n${cuerpo}\n*** End Patch` },
  })
  blocked('migrations', sobre('*** Update File: migrations/001_init.sql\n@@\n+alter table pedidos add column x int;'),
    /no hay repositorio con el que saber/)
  blocked('secrets', sobre('*** Add File: .env\n+AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE'),
    /parece contener secretos/)

  // Un comando de shell no es un parche: sin el encabezado, `command` no se lee como contenido.
  assert.doesNotThrow(() => execute('migrations', {
    cwd: root,
    tool_input: { command: 'grep -r "*** Update File: migrations/001_init.sql" .' },
  }))
})

// Los tres de afuera son las formas en que el SQL aparece sin ser una migración: el ADR que la cita, el
// comentario que advierte que eso no se hace, el runbook que lo lista. Van los tres porque lo que se
// cuida no es una extensión sino el alcance —el porqué, en `migrations`—, y con un solo caso el próximo
// que se escriba entra igual.
test('el SQL destructivo se juzga sobre una migración, no sobre cualquier archivo', () => {
  const root = tempRoot('ops-hook-migrations-alcance-')
  fs.mkdirSync(path.join(root, 'migrations'))
  for (const fuera of [
    { file_path: 'docs/adr/003-particionar-pedidos.md', content: 'La migración corre `DROP TABLE pedidos;`.' },
    { file_path: 'src/repo.js', content: '// nunca hacer DELETE FROM pedidos;' },
    { file_path: 'docs/runbook.md', content: 'Paso 4: TRUNCATE sesiones;' },
  ]) {
    assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: fuera }), fuera.file_path)
  }
  // Y el guard sigue haciendo su trabajo donde le toca. Se asercia el nombre del archivo dentro del
  // mensaje y no sólo el motivo: es lo que separa este bloqueo de los tres de arriba.
  blocked('migrations', {
    cwd: root, tool_input: { file_path: 'migrations/004_drop.sql', content: 'DROP TABLE pedidos;' },
  }, /migrations\/004_drop\.sql contiene SQL destructivo/)
  // El borde que trae el alcance compartido, aserciado para que no se pierda de vista; por qué es
  // deliberado, en `migrations`.
  assert.doesNotThrow(() => execute('migrations', {
    cwd: root, tool_input: { file_path: 'sql/004_drop.sql', content: 'DROP TABLE pedidos;' },
  }))
})

// `verify` es el único cuyo objeto no es un archivo sino el commit entero: lo que se aprueba es el
// conjunto staged, o sea «autorizo commitear exactamente esto aunque el gate esté en rojo». Stagear una
// cosa más lo invalida, que es lo que lo vuelve una operación y no un permiso abierto.
test('verify se aprueba por el conjunto staged, no por un archivo', () => {
  const root = tempRoot('ops-hook-approval-verify-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  const aprobar = (...rutas) => fs.writeFileSync(path.join(root, 'planning', '.ops-approval'),
    `${rutas.join('\n')}\n`)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  blocked('verify', commit, /Verify falló/)
  // Aprobar una parte no alcanza: el objeto es el conjunto, no cada archivo por separado.
  aprobar('app.js')
  blocked('verify', commit, /Verify falló/)
  aprobar('app.js', 'package.json')
  assert.doesNotThrow(() => execute('verify', commit), 'el conjunto entero aprobado pasa')
  // Y en cuanto se suma un archivo, la aprobación deja de cubrirlo.
  fs.writeFileSync(path.join(root, 'otro.js'), 'module.exports = 1\n')
  git(['add', 'otro.js'], root)
  blocked('verify', commit, /Verify falló/)

  // La otra mitad del guard, que también es sobre el conjunto: una fuente cambiada sin regenerar.
  const api = tempRoot('ops-hook-approval-verify-api-')
  git(['init', '-q'], api)
  fs.mkdirSync(path.join(api, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(api, 'openapi'), { recursive: true })
  fs.writeFileSync(path.join(api, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(api, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n')
  git(['add', 'openapi/api.yaml'], api)
  const commitApi = { cwd: api, tool_input: { command: 'git commit -m x' } }
  blocked('verify', commitApi, /OpenAPI\/Swagger/)
  fs.writeFileSync(path.join(api, 'planning', '.ops-approval'), 'openapi/api.yaml\n')
  assert.doesNotThrow(() => execute('verify', commitApi))
})

