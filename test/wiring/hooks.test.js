'use strict'

// Qué decide cada guard: qué bloquea y —lo que cuesta más— qué deja pasar. Los dos lados siempre, porque
// un guard que bloqueara todo pasaría entero un archivo que sólo probara frenos.
//
// Acá se ejecuta la decisión. Dónde aterriza el wiring que la invoca es de `runners.test.js`.

const { tempRoot, outsideTempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute, executeAll, guards, hookGroups } = require('../../engine/hooks/run')

// Que un guard frene no alcanza: tiene que frenar por lo que corresponde, y el motivo es lo único que
// el usuario recibe. Sin exigirlo, cambiarle a un bloqueo el mensaje de otra regla dejaba la suite entera
// en verde — medido mutando los 22 bloqueos del motor, 17 no tenían nada que los comprobara. El motivo es
// obligatorio para que un sitio nuevo no pueda saltearlo por olvido.
function blocked(name, input, motivo) {
  if (!(motivo instanceof RegExp)) throw new Error(`blocked(${name}) exige el motivo esperado`)
  assert.throws(() => execute(name, input), (error) => {
    assert.equal(error.blocked, true, `${name} lanzó algo que no es un bloqueo: ${error.message}`)
    assert.match(error.message, motivo, `${name} bloqueó, pero por otro motivo`)
    return true
  })
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

// Un repositorio de prueba en el que además se commitea. La identidad es lo que lo separa de un `init`
// a secas: `git commit` la exige, acá la toma de la configuración global de quien corre las pruebas y
// en CI no hay ninguna, así que sin esto la prueba pasa en la máquina y falla en la puerta — que es la
// peor forma de fallar, porque el veredicto local dice lo contrario del que decide.
function initRepo(root) {
  git(['init', '-q'], root)
  git(['config', 'user.email', 'prueba@ejemplo'], root)
  git(['config', 'user.name', 'Prueba'], root)
}

test('guard-destructive bloquea pérdida o publicación y permite lecturas', () => {
  blocked('destructive', { tool_input: { command: 'git push origin main' } }, /publica cambios/)
  blocked('destructive', { tool_input: { command: 'git reset --hard HEAD' } }, /destruye cambios locales/)
  blocked('destructive', { tool_input: { command: 'docker compose down' } }, /stack Compose/)
  blocked('destructive', { tool_input: { command: 'rm -rf /' } }, /catastrófico/)
  assert.doesNotThrow(() => execute('destructive', { tool_input: { command: 'git status --short' } }))
  assert.doesNotThrow(() => execute('destructive', { tool_input: { command: 'rm -r build/cache' } }))

  // Cuatro escrituras de la misma destrucción, y van las cuatro: `restore` es la forma moderna,
  // `--staged` la que parece tocar sólo el índice, y `checkout --` sin ruta la que se lee como un
  // comando a medio escribir. Por qué se bloquea la forma ancha, en `destructive`.
  for (const wide of ['git checkout -- .', 'git restore .', 'git restore --staged .', 'git checkout --']) {
    blocked('destructive', { tool_input: { command: wide } }, /no sólo lo que estás mirando/)
  }
  // Revertir un archivo nombrado es trabajo corriente y no se toca. Bloquearlo empujaría a la forma
  // ancha, que es justo la peligrosa.
  for (const narrow of ['git checkout -- src/main.js', 'git restore src/a.js', 'git checkout main']) {
    assert.doesNotThrow(() => execute('destructive', { tool_input: { command: narrow } }), narrow)
  }
})

// La mitad que importa es que `true` deje pasar: `allowPush` existía sólo para el validador, el guard
// bloqueaba igual, y un cargo que lo leyó dio por imposible un push que nadie había configurado.
// Sin raíz —lo que pasa en este mismo repositorio, que no tiene `planning/`— no hay permiso que leer.
// El guard del cierre corre `check` y bloquea si el planning quedó desalineado. Se prueba el lado que
// bloquea porque el otro —salir en verde— lo ejercita cualquier corrida sana, y es el que no avisa nada.
test('guard planning-drift bloquea el cierre con el planning roto', () => {
  const base = tempRoot('ops-hook-drift-')
  const root = path.join(base, 'demo-ops')
  const cli = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
  assert.equal(spawnSync(process.execPath, [cli, 'init', root, '--name', 'D', '--mode', 'sidecar',
    '--no-install'], { encoding: 'utf8' }).status, 0)
  // Una épica que el parser no lee: el planning deja de estar sano y el cierre tiene que decirlo.
  fs.writeFileSync(path.join(root, 'planning', 'roadmap', 'epic-001.md'), '---\nepic: 001\n---\n')
  process.env.OPS_ROOT = root
  try {
    blocked('planning-drift', { cwd: root, session_id: 'prueba-drift' }, /quedaron desalineados/)
    // La segunda vez no repite: el marcador de sesión existe y deja cerrar.
    assert.doesNotThrow(() => execute('planning-drift', { cwd: root, session_id: 'prueba-drift' }))
  } finally {
    delete process.env.OPS_ROOT
    try { fs.unlinkSync(path.join(os.tmpdir(), 'cauce-drift-prueba-drift')) } catch { /* ya limpio */ }
  }
})

test('guard-destructive respeta runner.allowPush del proyecto', () => {
  const root = tempRoot('ops-hook-push-')
  fs.mkdirSync(path.join(root, 'planning'))
  const declara = (allowPush) => fs.writeFileSync(
    path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush } }),
  )
  const push = { cwd: root, tool_input: { command: 'git push origin main' } }

  declara(false)
  blocked('destructive', push, /publica cambios/)
  declara(true)
  assert.doesNotThrow(() => execute('destructive', push))
  blocked('destructive', { cwd: root, tool_input: { command: 'git reset --hard HEAD' } }, /destruye cambios locales/)
})

// Las tres escrituras del force, el amend, y las dos banderas que apenas se les parecen: lo que decide
// es la forma y no la palabra suelta. Y las dos posiciones de la llave, porque de las tres reglas que
// tocan `git push` sólo una la consulta — `destructive` dice por qué.
// Las nueve formas envueltas y las diez corrientes en la misma corrida, que es lo único que separa
// arreglar un anclaje de haber ablandado el guard: medir sólo la primera mitad deja verde un patrón que
// frena todo. `destructive` dice por qué son dos cierres y no uno.
// Escribir un documento que menciona lo que los guards vigilan se bloqueaba por mencionarlo, y la
// salida era cambiar de herramienta para escribir un archivo. Se miden las dos mitades: el cuerpo deja
// de juzgarse y la línea que lo abre sigue juzgándose entera. `commandOf` dice qué se pierde a cambio.
test('el cuerpo de un heredoc es texto, y su línea de apertura sigue siendo comando', () => {
  const root = tempRoot('ops-hook-heredoc-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))
  const entrada = (command) => ({ cwd: root, tool_input: { command } })
  const documento = (cuerpo) => `cat > nota.md <<'FIN'\n${cuerpo}\nFIN`

  for (const [guard, cuerpo] of [
    ['destructive', 'Este documento explica por qué rm -rf / es catastrófico.'],
    ['destructive', 'Y por qué no se hace git push --force, ni git reset --hard.'],
    ['git-add', 'Ni stagear con git add ., que exige rutas explícitas.'],
  ]) {
    assert.doesNotThrow(() => execute(guard, entrada(documento(cuerpo))), `frenó un documento: ${cuerpo}`)
  }

  // La apertura no se toca: sigue siendo comando y su destino se sigue mirando.
  blocked('shell-boundary', entrada(documento('hola').replace('nota.md', path.join(os.homedir(), 'x'))),
    /fuera de las raíces/)
  // La redirección escrita *después* del delimitador también sobrevive: `cat <<FIN > salida` es válido y
  // su destino está ahí. Recortando desde el delimitador se perdía, y no lo notaba nadie porque en la
  // forma común el destino va antes del `<<`.
  blocked('shell-boundary', entrada(`cat <<FIN > ${path.join(os.homedir(), 'y')}\nhola\nFIN`),
    /fuera de las raíces/)
  // Y lo que va después del cierre tampoco: el recorte se lleva el cuerpo, no el resto del comando.
  blocked('destructive', entrada(`${documento('hola')}\nrm -rf /`), /catastrófico/)
})

test('guard-destructive reconoce el comando aunque venga envuelto, y sólo ése', () => {
  const corre = (command) => execute('destructive', { tool_input: { command } })

  for (const [command, motivo] of [
    // Sin una sola comilla: lo que decidía era el espacio antes del punto y coma.
    ['rm -rf /; echo listo', /catastrófico/],
    ['bash -c "rm -rf /"', /catastrófico/],
    ["sh -c 'rm -rf ~'", /catastrófico/],
    ['eval "rm -rf .."', /catastrófico/],
    ['(rm -rf ~)', /catastrófico/],
    ['bash -c "git checkout -- ."', /revierte todo lo no commiteado/],
    ['(git restore .)', /revierte todo lo no commiteado/],
    ['bash -c "mkfs.ext4 /dev/sda1"', /disco o dispositivo/],
    ['(shred /dev/sda)', /disco o dispositivo/],
  ]) {
    blocked('destructive', { tool_input: { command } }, motivo)
  }

  // La otra mitad, que es la que decide si el guard sobrevive a su primera semana. `-- ` seguido de un
  // espacio significa que viene un archivo nombrado, y eso la regla no lo toca desde siempre.
  for (const command of [
    'rm -rf /srv/cache', 'rm -r build/cache', 'rm -rf ./tmp', 'rm archivo.txt',
    'git checkout -- src/app.js', 'git checkout rama-nueva', 'git restore src/app.js',
    'echo mkfsdocs', 'cat informe-shredder.md', 'docker compose up -d',
  ]) {
    assert.doesNotThrow(() => corre(command), `frenó lo corriente: ${command}`)
  }
})

test('guard-destructive separa publicar de reescribir historia', () => {
  const root = tempRoot('ops-hook-force-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = (allowPush) => fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '.' }], runner: { allowPush },
  }))
  const entrada = (command) => ({ cwd: root, tool_input: { command } })

  config(true)
  assert.doesNotThrow(() => execute('destructive', entrada('git push origin main')), 'la llave sigue habilitando')
  for (const forma of ['--force', '--force-with-lease', '-f']) {
    blocked('destructive', entrada(`git push ${forma} origin main`), /reescribe historia ya publicada/)
  }
  blocked('destructive', entrada('git commit --amend -m x'), /reescribe un commit ya creado/)

  // Ni una bandera que apenas se le parece ni un commit corriente: el permiso lo decide la forma, no la
  // palabra suelta.
  assert.doesNotThrow(() => execute('destructive', entrada('git push --set-upstream origin rama')))
  assert.doesNotThrow(() => execute('destructive', entrada('git commit --fixup abc1234')))

  // Y con la llave apagada el force cae por su propia rama, no por la de publicación: el mensaje es lo
  // único que le dice a quien lo recibe que prender `allowPush` no lo va a desbloquear.
  config(false)
  blocked('destructive', entrada('git push --force origin main'), /R8 lo prohíbe y runner.allowPush no lo/)
})

// Los dos lados del perdón en una sola corrida, que es lo único que lo distingue de haber ablandado el
// guard: tres mensajes que nombran comandos y tres comandos que de verdad los ejecutan. `destructive`
// dice por qué el perdón llega hasta ahí.
test('guard-destructive lee el mensaje de un commit como dato y el resto como comando', () => {
  const corre = (command) => execute('destructive', { tool_input: { command } })

  assert.doesNotThrow(() => corre('git commit -m "fix: bloquear git push --force"'))
  assert.doesNotThrow(() => corre('git commit -m "docs: no corras rm -rf / nunca"'))
  assert.doesNotThrow(() => corre('git commit -m "chore: dejar de usar git reset --hard"'))

  // Y nada de eso ablanda el resto: lo entrecomillado de un comando que no es un commit se ejecuta, y
  // lo que va fuera de las comillas de un commit también.
  blocked('destructive', { tool_input: { command: 'bash -c "git push origin main"' } }, /publica cambios/)
  blocked('destructive', { tool_input: { command: 'eval "git reset --hard"' } }, /destruye cambios/)
  blocked('destructive', { tool_input: { command: 'git commit -m "x" && git reset --hard' } }, /destruye/)
})

test('guard-git-add exige stage explícito', () => {
  for (const command of ['git add .', 'git add -A', 'git add --all']) blocked('git-add', { tool_input: { command } },
    /Stagea rutas explícitas/)
  assert.doesNotThrow(() => execute('git-add', { tool_input: { command: 'git add src/app.js' } }))
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

test('guard-governance bloquea commits con reglas staged', () => {
  const root = tempRoot('ops-hook-gov-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'planning', 'PROTOCOL.md'), '# protocol\n')
  git(['add', 'planning/PROTOCOL.md'], root)
  blocked('governance', { cwd: root, tool_input: { command: 'git commit -m test' } }, /gobernanza protegida/)
})

test('guard-verify ejecuta gates reales antes del commit', () => {
  const root = tempRoot('ops-hook-verify-')
  initRepo(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }, /Verify falló/)
})

test('guard-verify exige regenerar después de cambiar OpenAPI o SQL fuente', () => {
  const root = tempRoot('ops-hook-generated-drift-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'openapi'))
  fs.writeFileSync(path.join(root, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n')
  git(['add', 'openapi/api.yaml'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }, /OpenAPI\/Swagger/)
  fs.writeFileSync(path.join(root, 'client_generated.go'), 'package client\n')
  git(['add', 'client_generated.go'], root)
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }))

  // La otra mitad de lo que este caso dice cuidar: estaba en el nombre y no en el cuerpo, y el guard
  // podía dejar de mirar SQL sin que nada se pusiera rojo.
  fs.mkdirSync(path.join(root, 'db', 'queries'), { recursive: true })
  fs.writeFileSync(path.join(root, 'db', 'queries', 'altas.sql'), 'SELECT 1;\n')
  git(['add', 'db/queries/altas.sql'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }, /consulta SQL fuente/)
  fs.mkdirSync(path.join(root, 'sqlc'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sqlc', 'altas.go'), 'package sqlc\n')
  git(['add', 'sqlc/altas.go'], root)
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }))
})

test('guard-workspace-boundary limita escrituras a las raíces declaradas', () => {
  const root = tempRoot('ops-hook-boundary-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'service'))
  const config = { workspaceRoots: [{ name: 'service', path: 'service' }] }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  assert.doesNotThrow(() => execute('workspace-boundary', { cwd: root, tool_input: { file_path: 'service/app.js' } }))
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../outside.txt' } }, /fuera de las raíces/)
})

test('guard-workspace-boundary deja pasar lo que el proyecto declaró escribible', () => {
  const root = tempRoot('ops-hook-exempt-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'service'))
  const memoria = path.join(os.homedir(), '.claude', 'projects', 'demo', 'memory')
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    workspaceRoots: [{ name: 'service', path: 'service' }],
    writableOutsideRoots: ['~/.claude/projects/demo/memory', '../salidas'],
  }))
  const escribe = (file) => execute('workspace-boundary', { cwd: root, tool_input: { file_path: file } })

  assert.doesNotThrow(() => escribe(path.join(memoria, 'nota.md')), '`~` se expande a la casa del usuario')
  assert.doesNotThrow(() => escribe('../salidas/informe.csv'), 'y lo relativo se resuelve contra la raíz')

  // Exentar una ruta no exenta a su padre ni a su vecina: es una lista de rutas, no un permiso de zona.
  // Sin esto, `startsWith` sobre la ruta escrita habría dejado pasar media casa por una sola línea.
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: path.join(os.homedir(), '.claude', 'otro.md') } },
    /fuera de las raíces/)
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../outside.txt' } }, /fuera de las raíces/)
})

// Las cinco escrituras que el guard reconoce y las seis que no le tocan. Por qué existe y hasta dónde
// llega lo cuenta `shellBoundary`; acá lo que importa es que las dos listas se midan juntas, porque un
// guard sólo se puede juzgar por lo que frena y lo que deja pasar a la vez.
test('guard-shell-boundary mira el destino de un comando, sin morder lo corriente', () => {
  const root = tempRoot('ops-hook-shell-boundary-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    workspaceRoots: [{ name: 'main', path: '.' }],
    writableOutsideRoots: ['~/.claude/projects/demo/memory'],
  }))
  const corre = (command) => execute('shell-boundary', { cwd: root, tool_input: { command } })
  const afuera = path.join(os.homedir(), 'afuera')

  for (const command of [
    `echo x > ${afuera}/nota.md`,
    'cat > ~/afuera/nota.md <<EOF',
    'echo x > $HOME/afuera/nota.md',
    `printf x | tee ${afuera}/nota.md`,
    `cp nota.md ${afuera}/nota.md`,
    `sed -i 's/a/b/' ${afuera}/nota.md`,
    `truncate -s 0 ${afuera}/registro.log`,
  ]) {
    blocked('shell-boundary', { cwd: root, tool_input: { command } }, /fuera de las raíces/)
  }

  for (const command of [
    'npm test > /dev/null 2>&1',
    'make build >> logs/build.log 2>&1',
    'node x.js > salidas/informe.json',
    'git status --short',
    'grep -rn "escribe > /etc/passwd" src/',
    'printf x | tee ~/.claude/projects/demo/memory/nota.md',
    // `sed` sin `-i` lee y manda a stdout: el destino de afuera es el archivo que abre, no uno que
    // escriba. Va con una ruta fuera de las raíces a propósito — con una de adentro el caso pasaría
    // aunque el guard dejara de exigir el flag.
    `sed 's/a/b/' ${afuera}/entrada.txt`,
    'cp solo',
  ]) {
    assert.doesNotThrow(() => corre(command), `frenó lo corriente: ${command}`)
  }
})

// La misma ruta por las dos herramientas, exenta y prohibida. Es lo único que comprueba que
// `writableRoots` sigue siendo el único lugar donde se contesta: si alguien la vuelve a escribir en uno
// de los dos guards, los cuatro veredictos de acá dejan de coincidir.
test('los dos guards de límites responden lo mismo sobre la misma ruta', () => {
  const root = tempRoot('ops-hook-boundary-par-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    workspaceRoots: [{ name: 'main', path: '.' }],
    writableOutsideRoots: ['~/.claude/projects/demo/memory'],
  }))
  const exenta = path.join(os.homedir(), '.claude', 'projects', 'demo', 'memory', 'nota.md')
  const prohibida = path.join(os.homedir(), '.claude', 'projects', 'demo', 'otra.md')

  assert.doesNotThrow(() => execute('workspace-boundary', { cwd: root, tool_input: { file_path: exenta } }))
  assert.doesNotThrow(() => execute('shell-boundary', { cwd: root, tool_input: { command: `echo x > ${exenta}` } }))
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: prohibida } }, /fuera de las raíces/)
  blocked('shell-boundary', { cwd: root, tool_input: { command: `echo x > ${prohibida}` } }, /fuera de las raíces/)
})

// El salto de línea no terminaba una lista de argumentos, así que el destino de un `cp` se leía de la
// línea de abajo y el bloqueo nombraba una ruta que no estaba en el comando. Se asercia **qué destino
// lee**, no si pasa: con la clase vieja la variante sin heredoc también leía mal y pasaba igual, porque
// el último token era la marca de lo entrecomillado. `writeTargets` cuenta por qué el heredoc no era la
// causa.
test('el salto de línea termina la lista de argumentos de un comando', () => {
  const root = tempRoot('ops-hook-salto-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'api'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'api', path: 'api' }] }))
  const entrada = (command) => ({ cwd: root, tool_input: { command } })
  const afuera = path.join(os.homedir(), 'afuera', 'x')

  // Las dos formas de segunda línea, con heredoc y sin él, contra las tres familias que leen argumentos:
  // la que toma el último (`cp`), la que toma todos (`tee`) y la que exige `-i` (`sed`). Cambiar una
  // sola y probar una sola deja las otras dos leyendo la línea de abajo.
  // El intérprete va con ruta absoluta a propósito: si el token de la segunda línea resolviera adentro
  // de la raíz, leerlo mal no bloquearía y el caso pasaría con el defecto puesto.
  for (const segunda of ["/usr/bin/python3 - <<'PY'\nprint(1)\nPY", '/usr/bin/python3 -c "print(1)"']) {
    for (const primera of ['cp /etc/hostname api/h', 'printf x | tee api/log', "sed -i 's/a/b/' api/f"]) {
      assert.doesNotThrow(() => execute('shell-boundary', entrada(`${primera}\n${segunda}`)),
        `acusó una escritura que no está en el comando: ${primera}`)
    }
  }

  // Y la dirección contraria, que es la que se rompe si uno corta de más: un destino real de la primera
  // línea se sigue viendo aunque haya otra línea debajo.
  blocked('shell-boundary', entrada(`cp /etc/hostname ${afuera}\npython3 -c "print(1)"`), /fuera de las raíces/)
  blocked('shell-boundary', entrada(`echo hola\ncp /etc/hostname ${afuera}`), /fuera de las raíces/)
})

// El agujero declarado, fijado para que se note si alguien lo «arregla»: `writeTargets` dice por qué un
// destino que no se puede resolver no se juzga, y este caso es lo que se pone rojo el día que alguien
// decida adivinarlo.
test('guard-shell-boundary no juzga un destino que no puede resolver', () => {
  const root = tempRoot('ops-hook-shell-boundary-var-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))

  for (const command of ['echo x > $SALIDA/nota.md', 'echo x > "$HOME/afuera/nota.md"']) {
    assert.doesNotThrow(() => execute('shell-boundary', { cwd: root, tool_input: { command } }))
  }
})

test('guard-engine protege el motor instalado y deja trabajar al toolkit', () => {
  const root = tempRoot('ops-hook-engine-')
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine')
  fs.mkdirSync(pkg, { recursive: true })
  fs.mkdirSync(path.join(root, 'agents'))
  fs.mkdirSync(path.join(root, 'planning'))

  // En una empresa el motor es de sólo lectura: llega por npm y se arregla arriba.
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  blocked('engine', { cwd: root, tool_input: { file_path: 'node_modules/@ingeniomaps/cauce/engine/cli/ops.js' } },
    /pertenece al motor de Cauce/)
  // Lo que sí es suyo sigue abierto: el guard no puede volverse un candado general.
  assert.doesNotThrow(() => execute('engine', { cwd: root, tool_input: { file_path: 'agents/roles/mio.md' } }))

  // En el toolkit el motor es el producto: acá editarlo es el trabajo, no una infracción.
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'toolkit' }))
  const own = { file_path: 'node_modules/@ingeniomaps/cauce/engine/cli/ops.js' }
  assert.doesNotThrow(() => execute('engine', { cwd: root, tool_input: own }))
})

// El mensaje es la única guía que recibe quien se choca con el guard, así que el comando tiene que
// funcionar de verdad. `npm update` no sirve: `declareEngine` clava la versión exacta y npm no mueve
// un pin exacto —dice «up to date» y no hace nada—. Y `install @latest` a secas escribe `^`, que
// rompe esa disciplina; de ahí `--save-exact`. Traer el motor tampoco alcanza: las rutas del sistema
// de la instancia se refrescan con `upgrade`, que es el segundo paso.
test('guard-engine indica un camino de actualización que funciona', () => {
  const root = tempRoot('ops-hook-engine-msg-')
  fs.mkdirSync(path.join(root, 'node_modules', '@ingeniomaps', 'cauce'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const input = { cwd: root, tool_input: { file_path: 'node_modules/@ingeniomaps/cauce/x.js' } }
  let message = ''
  try { execute('engine', input) } catch (error) { message = error.message }
  assert.ok(message, 'el guard tiene que haber bloqueado')
  assert.match(message, /npm install --save-dev --save-exact @ingeniomaps\/cauce@latest/)
  assert.match(message, /ops\.js upgrade/, 'y el segundo paso, o la instancia queda a medias')
  assert.ok(!message.includes('npm update'), 'npm update no mueve un pin exacto')
})

// `agent-promote` se niega si «Aprobación humana» no está firmada, pero lo único que impedía que la
// escribiera un agente era una frase en un prompt. Alrededor de la firma van las otras piezas del
// mismo acto: el contrato que la propuesta cambia y el denominador con que se lo juzga.
// Cinco formas de escribir el mismo commit y las dos direcciones en la misma corrida. Van juntas porque
// `isCommit` decide dos cosas opuestas —qué se deja de juzgar y qué se empieza a juzgar— y medir una
// sola deja la otra libre para romperse. `isCommit` dice qué admite un shell delante del verbo.
test('un prefijo de entorno no apaga los guards que sólo corren sobre un commit', () => {
  const root = tempRoot('ops-hook-prefijo-')
  git(['init'], root)
  git(['config', 'user.email', 'x@y.z'], root)
  git(['config', 'user.name', 'x'], root)
  const gobernado = 'agents/roles/system/qa-engineer/SKILL.md'
  fs.mkdirSync(path.join(root, path.dirname(gobernado)), { recursive: true })
  fs.writeFileSync(path.join(root, gobernado), 'contenido\n')
  git(['add', gobernado], root)

  for (const prefijo of ['', 'FOO=1 ', 'OPS_GOVERNANCE_OVERRIDE=1 ', 'env FOO=1 ', 'sudo ']) {
    blocked('governance', { cwd: root, tool_input: { command: `${prefijo}git commit -m x` } },
      /gobernanza protegida/)
  }

  // La otra dirección: con el prefijo, el mensaje volvía a juzgarse como comando. Es la mitad ruidosa,
  // la que sí se ve, y la que hace notar que algo anda mal antes de que importe la silenciosa.
  assert.doesNotThrow(() => execute('destructive', {
    cwd: root, tool_input: { command: 'FOO=1 git commit -m "build: no usar git push --force"' },
  }))
})

// Los tres consumidores contra la misma lectura fallida, y el mensaje aparte: es lo único que comprueba
// que el bloqueo llega por los tres caminos y no sólo por el primero que uno prueba. `stagedFiles`
// cuenta por qué una lectura fallida no autoriza.
test('un índice que no se puede leer no autoriza el commit', () => {
  const root = tempRoot('ops-hook-indice-')
  git(['init'], root)
  git(['config', 'user.email', 'x@y.z'], root)
  git(['config', 'user.name', 'x'], root)

  // Los tres son `dependencies`, `governance` y `verify` — el tercero es el que mira OpenAPI y SQL
  // generados, y no es el guard llamado `generated`, que vive en el grupo de archivos y no lee el
  // índice. Confundirlos manda a medir el que no era y a concluir que el arreglo no llegó.
  for (const guard of ['governance', 'dependencies', 'verify']) {
    blocked(guard, { cwd: root, tool_input: { command: 'git -C $OPS commit -m x' } },
      /no se pudo leer el índice/)
  }

  // Y el mensaje nombra la causa que quien lo lea va a tener delante y no va a sospechar.
  assert.throws(() => execute('governance', { cwd: root, tool_input: { command: 'git -C $OPS commit -m x' } }),
    /escribí la ruta literal/)

  // La contracara, que este mismo arreglo estuvo a punto de romper: un commit cuyo **mensaje** cita ese
  // comando no está eligiendo repositorio, lo está citando. El commit que explica todo esto se bloqueó
  // a sí mismo hasta que `gitDirectory` empezó a leer el mensaje como dato.
  assert.doesNotThrow(() => execute('governance', {
    cwd: root, tool_input: { command: 'git commit -m "no escribas git -C $OPS commit"' },
  }))
})

// Lo que se mide acá es que la aprobación valga para lo que nombra **y para nada más**: sin eso sería
// la misma puerta abierta que vino a cerrar, con otra forma. Por qué existe y por qué se coteja en vez
// de consumirse, en `approval`.
test('una aprobación de gobernanza vale para lo que nombra y deja de valer al cambiar', () => {
  const root = tempRoot('ops-hook-aprobacion-')
  git(['init'], root)
  git(['config', 'user.email', 'x@y.z'], root)
  git(['config', 'user.name', 'x'], root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  // La aprobación se busca desde la raíz ops, que es lo que `findOpsRoot` reconoce por tener
  // `ops.config.json` y `planning/`. Sin el archivo de configuración no hay raíz y no hay aprobación
  // que leer — el guard bloquea igual, que es la dirección correcta de fallar.
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  const write = (relative) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'contenido\n')
    git(['add', relative], root)
    return relative
  }
  // Con cabecera: quien lo escribe a mano va a explicar qué autorizó y cuándo, y eso no es una ruta.
  const aprobar = (...rutas) => fs.writeFileSync(path.join(root, 'planning', '.ops-approval'),
    `# Aprobado por X el 2026-09-06 para el commit de la propuesta 2026-08.\n${rutas.join('\n')}\n`)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  const regla = write('planning/rules/system/conduct.md')
  const cargo = write('agents/roles/system/qa-engineer/SKILL.md')
  blocked('governance', commit, /gobernanza protegida/)

  // Parcial no alcanza, y el mensaje nombra sólo lo que falta: mandar a revisar lo ya aprobado es lo
  // que hace que la próxima vez nadie lea el mensaje.
  aprobar(regla)
  assert.throws(() => execute('governance', commit), (error) => {
    assert.match(error.message, new RegExp(cargo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(error.message, /conduct\.md/, 'lo aprobado no se vuelve a reportar')
    return true
  })

  aprobar(regla, cargo)
  assert.doesNotThrow(() => execute('governance', commit), 'lo aprobado entero pasa')

  // Y la propiedad que la hace de un solo uso sin borrarse: con la misma aprobación puesta, un archivo
  // que se suma después no está cubierto. Es lo que separa una llave por operación de una puerta.
  git(['reset'], root)
  write('planning/rules/system/process.md')
  blocked('governance', commit, /process\.md/)
})

test('guard-governance protege el contrato de un cargo, su medición y su firma', () => {
  const root = tempRoot('ops-hook-gov-')
  git(['init'], root)
  git(['config', 'user.email', 'x@y.z'], root)
  git(['config', 'user.name', 'x'], root)
  const write = (relative) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'contenido\n')
    git(['add', relative], root)
    return relative
  }
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  for (const gobernado of [
    'agents/roles/system/qa-engineer/learning/proposals/2026-08.md',
    'agents/roles/curador/learning/proposals/2026-08.md',
    'agents/roles/system/qa-engineer/SKILL.md',
    'agents/roles/system/qa-engineer/evaluations/cases/01-caso.md',
    'agents/roles/system/qa-engineer/evaluations/expected-behaviors.yaml',
    'agents/roles/system/qa-engineer/references/operating-model.md',
  ]) {
    write(gobernado)
    blocked('governance', commit, /gobernanza protegida/)
    git(['reset'], root)
  }

  // La mitad que tiene que pasar: las dos rutas de evidencia, que viven adentro de un árbol gobernado
  // y aun así se escriben. Sin ellas el caso mediría sólo que el patrón bloquea algo.
  write('agents/roles/system/qa-engineer/learning/reports/2026-08-16.md')
  write('agents/roles/system/qa-engineer/evaluations/results/2026-08-16.md')
  write('agents/roles/system/qa-engineer/learning/HISTORY.md')
  assert.doesNotThrow(() => execute('governance', commit))

  // Y el override sigue siendo la única salida, explícita.
  write('agents/roles/system/qa-engineer/SKILL.md')
  process.env.OPS_GOVERNANCE_OVERRIDE = '1'
  try { assert.doesNotThrow(() => execute('governance', commit)) } finally {
    delete process.env.OPS_GOVERNANCE_OVERRIDE
  }
})

test('guard-migrations protege historial y SQL destructivo', () => {
  const root = tempRoot('ops-hook-migrations-')
  fs.mkdirSync(path.join(root, 'migrations'))
  fs.writeFileSync(path.join(root, 'migrations', '001_init.sql'), 'CREATE TABLE users (id int);\n')
  const rewrite = { file_path: 'migrations/001_init.sql', new_string: 'ALTER TABLE users ADD name text;' }
  blocked('migrations', { cwd: root, tool_input: rewrite }, /migración existente/)
  const destructive = { file_path: 'migrations/002_drop.sql', content: 'DROP TABLE users;' }
  blocked('migrations', { cwd: root, tool_input: destructive }, /SQL destructivo/)
  const additive = { file_path: 'migrations/002_add.sql', content: 'ALTER TABLE users ADD name text;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: additive }))

  // El único caso que este guard cubría era el que la prueba usaba. `DELETE FROM x;` pasaba por el límite
  // de palabra que seguía al `;`, y borrar una columna no figuraba: un cargo lo encontró evaluando una
  // migración destructiva y lo comprobó contra este archivo.
  for (const sql of [
    'DELETE FROM users;',
    'DELETE FROM users',
    'ALTER TABLE users DROP COLUMN name;',
    'ALTER TABLE users DROP CONSTRAINT users_pkey;',
    'TRUNCATE users;',
  ]) {
    blocked('migrations', { cwd: root, tool_input: { file_path: 'migrations/003_x.sql', content: sql } },
      /SQL destructivo/)
  }
  // Un borrado acotado sigue pasando: es una corrección de datos, no un vaciado de tabla.
  const acotado = { file_path: 'migrations/003_fix.sql', content: 'DELETE FROM users WHERE id = 1;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: acotado }))
  const renombre = { file_path: 'migrations/003_ren.sql', content: 'ALTER TABLE users RENAME COLUMN a TO b;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: renombre }))
})

test('guard-dependencies exige consistencia y bloquea publicación', () => {
  blocked('dependencies', { tool_input: { command: 'npm publish' } }, /Publicar paquetes/)
  blocked('dependencies', { tool_input: { command: 'pnpm add -g typescript' } }, /Publicar paquetes/)
  const root = tempRoot('ops-hook-deps-')
  initRepo(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n')
  git(['add', 'package.json'], root)
  blocked('dependencies', { cwd: root, tool_input: { command: 'git commit -m deps' } }, /sin actualizar su lockfile/)
  git(['add', 'package-lock.json'], root)
  assert.doesNotThrow(() => execute('dependencies', { cwd: root, tool_input: { command: 'git commit -m deps' } }))

  // Un lockfile que se mueve solo: o el manifest cambió y no se stageó, o lo regeneró algo que nadie
  // pidió. Las dos merecen mirarse, y ninguna se distingue de la otra sin el manifest al lado.
  const solo = tempRoot('ops-hook-deps-lock-solo-')
  git(['init', '-q'], solo)
  fs.writeFileSync(path.join(solo, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
  fs.writeFileSync(path.join(solo, 'package-lock.json'), '{}\n')
  git(['add', 'package-lock.json'], solo)
  blocked('dependencies', { cwd: solo, tool_input: { command: 'git commit -m deps' } },
    /sin un cambio explícito en el manifest/)
  git(['add', 'package.json'], solo)
  assert.doesNotThrow(() => execute('dependencies', { cwd: solo, tool_input: { command: 'git commit -m deps' } }))

  // Y dos lockfiles conviviendo: cuál manda lo decide el gestor que corra, así que el árbol ya no dice
  // qué versiones se instalan. Se mira lo que hay en disco, no lo que se stageó.
  const dos = tempRoot('ops-hook-deps-dos-locks-')
  initRepo(dos)
  fs.writeFileSync(path.join(dos, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
  fs.writeFileSync(path.join(dos, 'package-lock.json'), '{}\n')
  fs.writeFileSync(path.join(dos, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  git(['add', 'package.json', 'package-lock.json'], dos)
  blocked('dependencies', { cwd: dos, tool_input: { command: 'git commit -m deps' } }, /varios lockfiles/)
  fs.rmSync(path.join(dos, 'pnpm-lock.yaml'))
  assert.doesNotThrow(() => execute('dependencies', { cwd: dos, tool_input: { command: 'git commit -m deps' } }))
})

test('los grupos cubren cada guard exactamente una vez', () => {
  const grouped = Object.values(hookGroups).flat()
  assert.deepEqual([...grouped].sort(), Object.keys(guards).sort(), 'ningún guard queda fuera ni duplicado')
  for (const name of grouped) assert.ok(guards[name], `${name} no existe como guard`)
})

test('executeAll corre el grupo entero, no sólo su primer guard', () => {
  assert.throws(
    () => executeAll(['pre-shell'], { tool_input: { command: 'git push origin main' } }),
    (error) => error.blocked === true,
    'destructive es el primero del grupo',
  )
  assert.throws(
    () => executeAll(['pre-shell'], { cwd: os.tmpdir(), tool_input: { command: 'npm publish' } }),
    (error) => error.blocked === true,
    'dependencies está en el medio del grupo',
  )
  assert.throws(
    () => executeAll(['pre-files'], {
      tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/remote.json' },
    }),
    (error) => error.blocked === true,
    'integration-snapshot es el último del grupo',
  )
  assert.doesNotThrow(() => executeAll(['pre-shell'], { tool_input: { command: 'git status --short' } }))
  assert.doesNotThrow(() => executeAll(['pre-files'], {
    tool_input: { file_path: 'docs/README.md', content: '# hola' },
  }))
  assert.throws(() => executeAll(['grupo-inexistente'], {}), /Hook desconocido/)
  assert.throws(() => executeAll([], {}), /guard o de un grupo/)
})

test('un guard suelto sigue siendo invocable por nombre', () => {
  assert.throws(
    () => executeAll(['git-add'], { tool_input: { command: ['git', 'add', '.'].join(' ') } }),
    (error) => error.blocked === true,
  )
})

// `run-hook.sh` lo dice de su propio motor: «un guard que no encuentra su motor bloquea, nunca
// permite». No valía para la configuración: `workspace-boundary` y `engine` hacían `catch { return }`
// al parsearla, así que una coma de más los apagaba a los dos sin imprimir nada. Y `findOpsRoot` sólo
// devuelve una raíz cuando `ops.config.json` existe, o sea que ese catch nunca fue «no aplica».
test('un guard que no puede leer la configuración bloquea, no permite', () => {
  const root = tempRoot('ops-failopen-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = path.join(root, 'ops.config.json')
  const afuera = { cwd: root, tool_input: { file_path: '/etc/passwd' } }
  const engine = {
    cwd: root,
    tool_input: { file_path: path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'x.js') },
  }

  fs.writeFileSync(config, JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], runner: {},
  }))
  blocked('workspace-boundary', afuera, /fuera de las raíces/)
  blocked('engine', engine, /pertenece al motor de Cauce/)

  // Una configuración que parsea pero trae un tipo cambiado no es «no se puede leer»: el guard sigue
  // juzgando con lo que entiende, y lo que no entiende no exenta nada. Un `.filter` sobre un string sale
  // como TypeError, que no es un bloqueo — y en `check`, dentro del try, se leía como «JSON inválido».
  fs.writeFileSync(config, JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }],
    writableOutsideRoots: '/etc', runner: {},
  }))
  blocked('workspace-boundary', afuera, /fuera de las raíces/)

  fs.writeFileSync(config, '{"project":"x",,"mode":"embedded"}')
  for (const guard of ['workspace-boundary', 'engine']) {
    assert.throws(
      () => execute(guard, afuera),
      (error) => error.blocked === true && /no se puede leer/.test(error.message),
      `${guard} permitió con la configuración rota`,
    )
  }
})

// La misma regla, un paso antes: si la entrada del hook no se puede parsear, cada guard veía `{}`
// —sin comando y sin archivos— y dejaba pasar todo. Sin stdin sí es «no hay nada que leer», y ahí los
// guards caen a las variables de entorno; se comprueban las dos ramas para no cerrar la buena.
test('una entrada de hook ilegible bloquea; la ausencia de entrada no', () => {
  const runtime = path.resolve(__dirname, '..', '..', 'engine', 'hooks', 'run.js')
  const invoke = (payload, env = {}) => spawnSync(
    process.execPath,
    [runtime, 'destructive'],
    { input: payload, encoding: 'utf8', env: { ...process.env, ...env } },
  )

  const broken = invoke('{"tool_input": esto no es json')
  assert.equal(broken.status, 2)
  assert.match(broken.stderr, /no es JSON válido/)

  assert.equal(invoke('').status, 0, 'sin entrada no hay nada que decidir')
  assert.equal(
    invoke('', { OPS_HOOK_COMMAND: 'git push origin main' }).status, 2,
    'y sin entrada el guard sigue leyendo el entorno',
  )
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
    /migración existente/)
  blocked('secrets', sobre('*** Add File: .env\n+AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE'),
    /parece contener secretos/)

  // Un comando de shell no es un parche: sin el encabezado, `command` no se lee como contenido.
  assert.doesNotThrow(() => execute('migrations', {
    cwd: root,
    tool_input: { command: 'grep -r "*** Update File: migrations/001_init.sql" .' },
  }))
})

// Se cruzan todas las reglas contra todas las formas, y no una contra una, porque lo que falló no fue
// un patrón sino que cada uno resolvía la posición por su cuenta —el porqué, en `withoutGitGlobals`—.
// Con una sola pareja, el próximo patrón que se escriba pegado vuelve a entrar sin que nada lo note.
test('una opción global de git no desactiva la regla que mira el subcomando', () => {
  // La lista es la de `git --help` entera y no una muestra: una opción que el patrón nombra y ningún
  // caso ejercita se puede borrar sin que nada se ponga rojo —comprobado sacando `--bare` y
  // `--no-replace-objects`, que pasaba en verde—, y entonces no está cubierta, está escrita.
  const GLOBALS = [
    '-C /tmp', '-c core.pager=cat', '-p', '-P', '--paginate', '--no-pager',
    '--git-dir /tmp/.git', '--git-dir=/tmp/.git', '--work-tree /tmp', '--work-tree=/tmp',
    '--namespace ns', '--namespace=ns', '--config-env=k=V', '--exec-path=/usr/lib/git-core',
    '--no-replace-objects', '--bare', '--no-optional-locks',
    '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs',
    '-c a=b -C /tmp',
  ]
  const forms = (command) => [command, ...GLOBALS.map((one) => command.replace('git ', `git ${one} `))]
  const rules = [
    ['git-add', 'git add -A', /está prohibido/],
    ['destructive', 'git push origin main --force', /reescribe historia ya publicada/],
    ['destructive', 'git push origin main', /publica cambios/],
    ['destructive', 'git reset --hard HEAD', /destruye cambios locales/],
    ['destructive', 'git commit --amend -m x', /reescribe un commit ya creado/],
    ['destructive', 'git clean -fd', /sin seguimiento/],
    ['destructive', 'git checkout -- .', /no sólo lo que estás mirando/],
  ]
  for (const [guard, command, motivo] of rules) {
    for (const form of forms(command)) blocked(guard, { tool_input: { command: form } }, motivo)
  }
})

// La contracara, que es la que evita que el arreglo se cumpla bloqueando de más: sacar las opciones
// globales no puede convertir en prohibido lo que no lo era, y `-C` después del subcomando es otra
// cosa —`git commit -C <commit>` reusa el mensaje de otro commit— que no se toca.
test('sacar las opciones globales no inventa un bloqueo', () => {
  for (const fine of [
    'git -C /tmp status --short',
    'git -c core.pager=cat log --oneline -5',
    'git -P diff --staged --name-only',
    'git checkout -- src/main.js',
    'git -C /tmp checkout -- src/main.js',
  ]) {
    assert.doesNotThrow(() => execute('destructive', { tool_input: { command: fine } }), fine)
    assert.doesNotThrow(() => execute('git-add', { tool_input: { command: fine } }), fine)
  }
})

// `git commit -a` stagea al commitear, o sea **después** de este hook, y `git add … && git commit` lo
// stagea dentro del mismo comando: en los dos casos los guards que juzgan mirando el índice leen el de
// antes y concluyen que no hay nada que revisar. No fallan, dejan pasar.
//
// Se separan porque las razones son distintas y viven en lugares distintos. `-a` viola R8 por escrito
// —stagear rutas explícitas— y por eso lo frena el guard de esa regla; encadenar `add` y `commit` no
// viola ninguna, sólo rompe el momento en que se pregunta, y lo frena quien lee el índice.
test('git-add frena `commit -a`, que es stagear todo con otra ortografía', () => {
  for (const command of ['git commit -a -m sonda', 'git commit -am sonda', 'git commit --all -m sonda',
    'git -C /tmp commit -am sonda', 'git commit -v -a -m sonda']) {
    blocked('git-add', { tool_input: { command } }, /stagea al commitear/)
  }
  // `--amend` no es `-a`: lo frena `destructive` por otra razón, y confundirlos daría el mensaje
  // equivocado sobre la regla equivocada.
  assert.doesNotThrow(() => execute('git-add', { tool_input: { command: 'git commit --amend -m x' } }))
  for (const fine of ['git commit -m sonda', 'git commit -v -m sonda', 'git commit -s -m sonda']) {
    assert.doesNotThrow(() => execute('git-add', { tool_input: { command: fine } }), fine)
  }
})

// El mensaje de un commit es dato, no código: `destructive` ya lo resolvía y este guard no. Bloqueaba
// el commit que explica la prohibición, que es exactamente el que hay que poder escribir — y frenó
// tres veces la sesión que escribió este arreglo.
test('git-add no lee el mensaje de un commit como si fuera un comando', () => {
  for (const command of [
    `git commit -m 'no usar git add -A nunca'`,
    `git commit -m "prohibido git add -A"`,
  ]) {
    assert.doesNotThrow(() => execute('git-add', { tool_input: { command } }), command)
  }
  // Y lo que va entre comillas fuera de un commit sí se ejecuta, así que ahí sigue cayendo. Las dos
  // formas pasaban hasta este arreglo, por dónde terminaba la palabra: el límite, en `gitAdd`.
  blocked('git-add', { tool_input: { command: `bash -c "git add -A"` } }, /está prohibido/)
  blocked('git-add', { tool_input: { command: `eval 'git add -A'` } }, /está prohibido/)
})

test('un comando que stagea y commitea a la vez no se puede juzgar, y se dice', () => {
  const root = tempRoot('ops-hook-blind-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'planning', 'PROTOCOL.md'), '# protocol\n')
  // El índice queda vacío a propósito: es el estado en que el guard no ve nada y concluía que no había
  // nada que revisar. Con el índice ya lleno el bloqueo podría venir de la regla de gobernanza y la
  // prueba no distinguiría cuál de las dos actuó.
  const command = 'git add planning/PROTOCOL.md && git commit -m sonda'
  for (const guard of ['governance', 'dependencies', 'verify']) {
    blocked(guard, { cwd: root, tool_input: { command } }, /stagea y commitea a la vez/)
  }
  // Un commit que no stagea nada se juzga como siempre: con el índice vacío no hay nada que reportar.
  for (const guard of ['governance', 'dependencies', 'verify']) {
    assert.doesNotThrow(() => execute(guard, { cwd: root, tool_input: { command: 'git commit -m sonda' } }))
  }
  // Y el mensaje que cita un `add` no es un `add`.
  assert.doesNotThrow(() => execute('governance', {
    cwd: root, tool_input: { command: `git commit -m 'sin git add adentro'` },
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

// La aprobación por operación existía y la usaba un guard solo; los otros cuatro que se pueden abrir
// tenían una única salida, una variable de entorno, que es **por sesión**: se lee del proceso del
// runner, así que la forma que funciona deja el guard apagado hasta que la sesión cierre.
//
// Aprobar el conjunto exacto es lo que expresa «autorizo esta operación» en los cuatro: en cuanto
// cambia lo que se está por escribir o commitear, la aprobación deja de valer. Por eso el archivo es
// uno solo y ya no se llama de gobernanza — una aprobación escrita a mano nombra rutas, y quién las
// mira lo decide qué guard esté juzgando esa ruta.
test('la aprobación por operación abre los guards que deciden sobre una ruta', () => {
  const root = tempRoot('ops-hook-approval-todos-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  const aprobar = (...rutas) => fs.writeFileSync(path.join(root, 'planning', '.ops-approval'),
    `# Aprobado por X el 2026-09-07.\n${rutas.join('\n')}\n`)
  const limpiar = () => fs.rmSync(path.join(root, 'planning', '.ops-approval'), { force: true })

  // En `migrations` lo que se decide es la ruta del archivo que se está por escribir.
  fs.mkdirSync(path.join(root, 'migrations'), { recursive: true })
  const sql = { file_path: 'migrations/010_drop.sql', content: 'DROP TABLE pedidos;' }
  limpiar()
  blocked('migrations', { cwd: root, tool_input: sql }, /SQL destructivo/)
  aprobar('migrations/010_drop.sql')
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: sql }))
  // Y vale para lo que nombra y nada más.
  aprobar('migrations/999_otra.sql')
  blocked('migrations', { cwd: root, tool_input: sql }, /SQL destructivo/)

  // En `test-evidence` es la ruta de la prueba que se borra.
  const borrado = { patch: '*** Begin Patch\n*** Delete File: test/pagos.test.js\n*** End Patch' }
  limpiar()
  blocked('test-evidence', { cwd: root, tool_input: borrado }, /borra una prueba/)
  aprobar('test/pagos.test.js')
  assert.doesNotThrow(() => execute('test-evidence', { cwd: root, tool_input: borrado }))

  // En `dependencies` es el manifiesto staged que va sin su lockfile.
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n')
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n')
  git(['add', 'package.json'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }
  limpiar()
  blocked('dependencies', commit, /lockfile/i)
  aprobar('package.json')
  assert.doesNotThrow(() => execute('dependencies', commit))
})

// La que no encaja, dicha donde se decide y no en una nota al pie: publicar un paquete o instalar algo
// global no tiene ninguna ruta sobre la cual aprobar, así que ahí la variable sigue siendo la salida.
// Declararlo es lo que evita que alguien busque la forma angosta y no la encuentre.
test('publicar un paquete no se aprueba por ruta, porque no hay ruta', () => {
  const root = tempRoot('ops-hook-approval-sin-ruta-')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'package.json\n')
  blocked('dependencies', { cwd: root, tool_input: { command: 'npm publish' } }, /acción humana/)
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

// Un gate mide para poder decir «esto pasa», y lo que va a quedar es el índice, no el árbol. Las dos
// mitades de `verify` respondían a preguntas distintas: elegía qué correr mirando el índice y corría
// sobre el disco. El sentido que importa es el silencioso — se stagea algo roto, se arregla el archivo
// encima, el gate pasa y el commit graba lo roto con un verde escrito al lado.
test('verify mide el índice y no el árbol de trabajo', () => {
  const root = tempRoot('ops-hook-verify-indice-')
  initRepo(root)
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')
  // El gate necesita un módulo instalado: es entorno que el commit no lleva y sin él no corre nada.
  fs.mkdirSync(path.join(root, 'node_modules', 'marca'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'marca', 'package.json'),
    JSON.stringify({ name: 'marca', main: 'index.js' }))
  fs.writeFileSync(path.join(root, 'node_modules', 'marca', 'index.js'), 'module.exports = true\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {
    test: 'node -e "require(\'marca\');'
      + ' process.exit(/ROTO/.test(require(\'fs\').readFileSync(\'app.js\',\'utf8\'))?1:0)"',
  } }))
  fs.writeFileSync(path.join(root, 'app.js'), '// sano\n')
  git(['add', 'package.json', 'app.js', '.gitignore'], root)
  git(['commit', '-qm', 'base'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  // Árbol e índice iguales: el árbol **es** el próximo commit y el veredicto no cambia.
  fs.writeFileSync(path.join(root, 'app.js'), '// sano v2\n')
  git(['add', 'app.js'], root)
  assert.doesNotThrow(() => execute('verify', commit), 'sin diferencia, lo sano pasa')

  // Que el índice difiera del árbol no puede volverse un bloqueo por sí solo: acá lo staged está sano y
  // lo único distinto es un archivo suelto que nadie va a commitear. El gate corre sobre el índice
  // materializado y tiene que pasar, lo que exige que `node_modules` haya viajado — sin el enlace,
  // `require('marca')` no resuelve y el guard frenaría un commit correcto por su propia mecánica.
  fs.writeFileSync(path.join(root, 'app.js'), '// sano v3\n')
  git(['add', 'app.js'], root)
  fs.writeFileSync(path.join(root, 'notas.txt'), 'apuntes sueltos\n')
  assert.doesNotThrow(() => execute('verify', commit), 'el entorno ignorado viaja y lo sano pasa')
  fs.rmSync(path.join(root, 'notas.txt'))

  // Un gate que llama a git tiene que seguir funcionando sobre el índice materializado, que no trae
  // `.git`. Sin el contexto apuntado al repositorio real, el guard frenaría un commit correcto porque
  // su propia copia no es un repositorio — pasó con la suite de este repositorio al probarlo.
  const conGit = tempRoot('ops-hook-verify-git-')
  initRepo(conGit)
  fs.writeFileSync(path.join(conGit, 'package.json'), JSON.stringify({ scripts: {
    test: 'node -e "const r=require(\'child_process\').spawnSync(\'git\',[\'ls-files\'],'
      + '{encoding:\'utf8\'}); process.exit(r.status === 0 && r.stdout.trim() ? 0 : 1)"',
  } }))
  fs.writeFileSync(path.join(conGit, 'app.js'), '// sano\n')
  git(['add', 'package.json', 'app.js'], conGit)
  git(['commit', '-qm', 'base'], conGit)
  fs.writeFileSync(path.join(conGit, 'app.js'), '// v2\n')
  git(['add', 'app.js'], conGit)
  fs.writeFileSync(path.join(conGit, 'suelto.txt'), 'x\n')
  assert.doesNotThrow(() => execute('verify', { cwd: conGit, tool_input: { command: 'git commit -m x' } }),
    'un gate que llama a git sigue viendo un repositorio')

  // Lo que este caso cierra: el índice tiene lo roto y el disco lo bueno.
  fs.writeFileSync(path.join(root, 'app.js'), '// ROTO\n')
  git(['add', 'app.js'], root)
  fs.writeFileSync(path.join(root, 'app.js'), '// arreglado\n')
  blocked('verify', commit, /Verify falló/)

  // La copia se borra siempre, también cuando el gate falla: es el árbol entero del proyecto, y una por
  // commit llena el disco sin que nadie lo note hasta que no queda espacio.
  //
  // Se cuenta lo que aparece **de nuevo** y no lo que hay: el temporal del sistema es compartido, así
  // que afirmar sobre su contenido entero hace fallar esta prueba por lo que dejó cualquier otra cosa.
  const copias = () => new Set(fs.readdirSync(os.tmpdir()).filter((one) => one.startsWith('ops-verify-')))
  const antes = copias()
  fs.writeFileSync(path.join(root, 'app.js'), '// ROTO\n')
  git(['add', 'app.js'], root)
  fs.writeFileSync(path.join(root, 'app.js'), '// tambien roto\n')
  assert.throws(() => execute('verify', commit), 'el gate falla sobre el índice')
  assert.deepEqual([...copias()].filter((one) => !antes.has(one)), [],
    'ni cuando pasa ni cuando falla queda una copia')

  // Y el olvido de siempre: el fuente nuevo que nadie agregó. El gate local pasa porque el archivo está
  // en disco; sobre el índice no está, que es lo que va a pasar en cualquier otra máquina.
  const limpio = tempRoot('ops-hook-verify-olvido-')
  initRepo(limpio)
  fs.writeFileSync(path.join(limpio, 'package.json'), JSON.stringify({ scripts: {
    test: 'node -e "require(\'./extra.js\')"',
  } }))
  fs.writeFileSync(path.join(limpio, 'app.js'), '// sano\n')
  git(['add', 'package.json', 'app.js'], limpio)
  git(['commit', '-qm', 'base'], limpio)
  fs.writeFileSync(path.join(limpio, 'app.js'), '// v2\n')
  git(['add', 'app.js'], limpio)
  fs.writeFileSync(path.join(limpio, 'extra.js'), 'module.exports = 1\n')
  blocked('verify', { cwd: limpio, tool_input: { command: 'git commit -m x' } }, /Verify falló/)
  // Agregarlo es lo que lo destraba, que es el consejo que el bloqueo tiene que dejar cierto.
  git(['add', 'extra.js'], limpio)
  assert.doesNotThrow(() => execute('verify', { cwd: limpio, tool_input: { command: 'git commit -m x' } }))
})

// La misma forma que el 040 en chico, y por eso va con él: `dependencies` preguntaba al disco qué
// lockfiles hay para juzgar un manifiesto staged. Borrar el lock en el árbol y no stagear el borrado
// dejaba la comprobación sin disparar, así que el manifiesto se commiteaba sin que nadie dijera nada.
// Lo que hay que mirar es el índice, que es lo que el commit va a grabar.
test('dependencies mira el índice para saber qué lockfiles va a haber', () => {
  const root = tempRoot('ops-hook-deps-indice-')
  initRepo(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }))
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}')
  git(['add', 'package.json', 'package-lock.json'], root)
  git(['commit', '-qm', 'base'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: { a: '1' } }))
  git(['add', 'package.json'], root)
  blocked('dependencies', commit, /sin actualizar su lockfile/)

  // El lock desaparece del disco y nadie stagea el borrado: sigue en el índice, así que sigue estando
  // en el próximo commit y la comprobación tiene que seguir valiendo.
  fs.rmSync(path.join(root, 'package-lock.json'))
  blocked('dependencies', commit, /sin actualizar su lockfile/)

  // Y cuando el borrado sí se stagea, el próximo commit no lo lleva y la comprobación deja de aplicar.
  git(['rm', '--cached', '-q', 'package-lock.json'], root)
  assert.doesNotThrow(() => execute('dependencies', commit))

  // La otra mitad, que es la que se rompe si se unifican las dos preguntas: uno que sigue en el índice
  // pero ya no está en disco no convive con nadie. Por qué esa mira sólo el disco, en `dependencies`.
  const dos = tempRoot('ops-hook-deps-dos-')
  initRepo(dos)
  fs.writeFileSync(path.join(dos, 'package.json'), JSON.stringify({ name: 'y' }))
  fs.writeFileSync(path.join(dos, 'package-lock.json'), '{}')
  fs.writeFileSync(path.join(dos, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  git(['add', 'package.json', 'package-lock.json', 'pnpm-lock.yaml'], dos)
  git(['commit', '-qm', 'base'], dos)
  fs.writeFileSync(path.join(dos, 'package.json'), JSON.stringify({ name: 'y', dependencies: { a: '1' } }))
  git(['add', 'package.json'], dos)
  const commitDos = { cwd: dos, tool_input: { command: 'git commit -m x' } }
  blocked('dependencies', commitDos, /hay varios lockfiles/)
  fs.rmSync(path.join(dos, 'pnpm-lock.yaml'))
  blocked('dependencies', commitDos, /sin actualizar su lockfile/)
})

// Los dos sentidos del mismo defecto van juntos y en la misma prueba: con uno solo, el arreglo se
// puede «cumplir» bloqueando todo o dejando pasar todo. Por qué el `cd` cambia la respuesta, en
// `writesWithBase`.
test('shell-boundary resuelve las rutas contra el cd del propio comando', () => {
  const base = outsideTempRoot('ops-hook-cd-')
  const root = path.join(base, 'proyecto')
  const afuera = path.join(base, 'afuera')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(afuera, { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))
  const desde = (cwd, command) => ({ cwd, tool_input: { command } })

  // El sentido silencioso: la ruta real sale de las raíces y la resuelta contra el cwd caía adentro.
  blocked('shell-boundary', desde(root, `cd ${afuera} && echo x > nota.md`), /fuera de las raíces/)
  // Y el bloqueo nombra la ruta que se iba a escribir, no la que el guard había supuesto.
  assert.throws(() => execute('shell-boundary', desde(root, `cd ${afuera} && echo x > nota.md`)),
    (error) => {
      assert.match(error.message, new RegExp(path.join(afuera, 'nota.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      return true
    })

  // La cara de falso positivo, que llega cuando el runner está abierto fuera de las raíces: el destino
  // real es el temporal del sistema, que este guard no juzga por diseño, y la resolución equivocada lo
  // sacaba de esa exención para mandarlo a una ruta que nadie iba a escribir.
  const antes = process.env.CLAUDE_PROJECT_DIR
  process.env.CLAUDE_PROJECT_DIR = root
  try {
    assert.doesNotThrow(() => execute('shell-boundary',
      desde(afuera, `cd ${os.tmpdir()} && echo v1 > sonda.txt`)))
    assert.doesNotThrow(() => execute('shell-boundary', desde(afuera, `cd ${root} && echo v1 > sonda.txt`)))
    // Sin `cd` sigue bloqueando, que es lo correcto: ahí la ruta resuelta sí es la que se escribe.
    blocked('shell-boundary', desde(afuera, 'echo v1 > sonda.txt'), /fuera de las raíces/)
  } finally {
    if (antes === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = antes
  }

  // Un `cd` que no se puede resolver, con su contraparte inmediata: lo que no puede convertirse es en
  // una excusa para bloquear lo que sí se sabe juzgar.
  blocked('shell-boundary', desde(root, 'cd $TRABAJO && echo x > nota.md'), /no se puede resolver/)
  // Pero no se bloquea de más: con la ruta absoluta escrita, el `cd` deja de importar.
  assert.doesNotThrow(() => execute('shell-boundary',
    desde(root, `cd $TRABAJO && echo x > ${path.join(root, 'nota.md')}`)))

  // `cd` a secas va a HOME, y eso también cambia contra qué se resuelve lo que sigue.
  blocked('shell-boundary', desde(root, 'cd && echo x > nota.md'), /fuera de las raíces/)

  // Y cada escritura se juzga contra el `cd` que la precede, no contra el primero del comando.
  blocked('shell-boundary',
    desde(root, `cd ${root} && echo a > uno.md && cd ${afuera} && echo b > dos.md`), /fuera de las raíces/)
  assert.doesNotThrow(() => execute('shell-boundary',
    desde(root, `cd ${afuera} && cd ${root} && echo a > uno.md`)))
})

// Las dos mitades de `plan-first`: qué frena —el cambio de producto sin plan— y, sobre todo, qué deja
// pasar. La segunda es la que decide si el guard sirve: si frenara la escritura del propio WIP sería un
// candado con la llave adentro, y si frenara a `onboard` o a una evaluación, quien lo sufra lo apaga.
const BACKLOG_CON_TAREA = '# Backlog promovido\n\n## Hito primero — Primer resultado\n\n'
  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n'
const BACKLOG_VACIO = '# Backlog promovido\n'

function planFirstRoot(prefijo, wip, backlog = BACKLOG_CON_TAREA) {
  const root = tempRoot(prefijo)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  fs.writeFileSync(path.join(root, 'planning', 'WIP.md'), wip)
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), backlog)
  return root
}

const WIP_IDLE = 'status: IDLE\n'
const WIP_CON_PLAN = '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n'
  + '## Plan aprobado\n1. [ ] Escribir el handler\n'
const WIP_SIN_PLAN = '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n## Plan aprobado\n'

test('guard-plan-first exige el plan antes de cambiar el producto', () => {
  const root = planFirstRoot('ops-hook-plan-', WIP_IDLE)
  const escribe = (file) => ({ cwd: root, tool_input: { file_path: file } })

  blocked('plan-first', escribe('src/altas.js'), /sin plan/)
  // Nombrar el estado es la mitad del mensaje: «IDLE» y «tarea sin pasos» piden cosas distintas.
  blocked('plan-first', escribe('src/altas.js'), /IDLE/)

  const conTarea = planFirstRoot('ops-hook-plan-sinpasos-', WIP_SIN_PLAN)
  blocked('plan-first', { cwd: conTarea, tool_input: { file_path: 'src/altas.js' } },
    /alta-de-cliente y ningún paso/)

  const conPlan = planFirstRoot('ops-hook-plan-ok-', WIP_CON_PLAN)
  assert.doesNotThrow(() => execute('plan-first', { cwd: conPlan, tool_input: { file_path: 'src/altas.js' } }))
})

test('guard-plan-first no juzga lo que la instancia posee', () => {
  const root = planFirstRoot('ops-hook-plan-exento-', WIP_IDLE)
  const escribe = (file) => execute('plan-first', { cwd: root, tool_input: { file_path: file } })

  // El plan se escribe acá: sin esta exención, escribirlo exigiría haberlo escrito.
  assert.doesNotThrow(() => escribe('planning/WIP.md'))
  assert.doesNotThrow(() => escribe('planning/roadmap/epic-001-alta.md'))
  // Y los recorridos que no pasan por la máquina de tareas tampoco tienen un WIP que mostrar.
  assert.doesNotThrow(() => escribe('organization/workspace.md'))
  assert.doesNotThrow(() => escribe('agents/roles/tech-lead/SKILL.md'))
  assert.doesNotThrow(() => escribe('integrations/jira/staging/draft.md'))
  // Un directorio que sólo empieza igual no es la raíz exenta.
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'planningtool/app.js' } }, /sin plan/)
})

test('guard-plan-first queda inerte mientras el planning no declara tareas', () => {
  // El día uno no hay trabajo de producto que cuidar, hay instalación: `onboard` deja el roadmap vacío
  // y pide que alguien lo llene. Un bloqueo ahí es un candado delante de la puerta.
  const nuevo = planFirstRoot('ops-hook-plan-nuevo-', WIP_IDLE, BACKLOG_VACIO)
  assert.doesNotThrow(() => execute('plan-first', { cwd: nuevo, tool_input: { file_path: 'src/altas.js' } }))

  // Y muerde en cuanto hay de dónde sacar una tarea, que es la mitad que vuelve útil a la otra.
  fs.writeFileSync(path.join(nuevo, 'planning', 'BACKLOG.md'), BACKLOG_CON_TAREA)
  blocked('plan-first', { cwd: nuevo, tool_input: { file_path: 'src/altas.js' } }, /sin plan/)

  // Una tarea ya terminada cuenta igual: el BACKLOG vacío de una instancia con historia no la devuelve
  // al día uno.
  const conHistoria = planFirstRoot('ops-hook-plan-historia-', WIP_IDLE, BACKLOG_VACIO)
  fs.writeFileSync(path.join(conHistoria, 'planning', 'DONE.md'),
    '# Done activo\n\n## Hito primero — Primer resultado\n\n- [x] **alta-de-cliente** — Alta\n')
  blocked('plan-first', { cwd: conHistoria, tool_input: { file_path: 'src/altas.js' } }, /sin plan/)
})

test('guard-plan-first se abre por aprobación, por variable y donde no hay instancia', () => {
  const root = planFirstRoot('ops-hook-plan-llaves-', WIP_IDLE)
  const escribe = { cwd: root, tool_input: { file_path: 'src/altas.js' } }

  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'src/altas.js\n')
  assert.doesNotThrow(() => execute('plan-first', escribe))
  // La aprobación vale para la ruta que nombra y para ninguna otra.
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'src/bajas.js' } }, /sin plan/)
  fs.unlinkSync(path.join(root, 'planning', '.ops-approval'))
  blocked('plan-first', escribe, /sin plan/)

  process.env.OPS_PLAN_FIRST_OVERRIDE = '1'
  try { assert.doesNotThrow(() => execute('plan-first', escribe)) } finally {
    delete process.env.OPS_PLAN_FIRST_OVERRIDE
  }

  // Sin `planning/` no hay instancia que gobernar: es el estado de este mismo repositorio.
  const suelto = tempRoot('ops-hook-plan-suelto-')
  assert.doesNotThrow(() => execute('plan-first', { cwd: suelto, tool_input: { file_path: 'src/altas.js' } }))
})

// El registro que deja `verify` y el contraste que lo lee. Las dos mitades juntas porque el valor está
// en que sean independientes del autor: la corrida la escribe el guard al commitear, no quien redacta
// después la entrada de DONE.
test('verify deja registrado qué gate corrió y con qué código de salida', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-evidencia-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e ""' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  assert.equal(EV.runs(root).length, 0, 'sin corridas, el registro está vacío')
  assert.doesNotThrow(() => execute('verify', commit))
  const runs = EV.runs(root)
  assert.equal(runs.length, 1, 'el gate que corrió quedó registrado')
  assert.equal(runs[0].gate, 'test')
  assert.equal(runs[0].status, 0)

  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  git(['add', 'package.json'], root)
  blocked('verify', commit, /Verify falló/)
  assert.equal(EV.runs(root).slice(-1)[0].status, 1, 'y con su código de salida real')

  // Rodante: lo que interesa es el trabajo en curso, no la historia entera.
  for (let i = 0; i < EV.MAX_RUNS + 5; i += 1) EV.record(root, 'test', 0)
  assert.equal(EV.runs(root).length, EV.MAX_RUNS)
})

test('el contraste de evidencia separa lo que existe de lo que no se puede buscar', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-contraste-')
  fs.mkdirSync(path.join(root, 'api'), { recursive: true })
  fs.writeFileSync(path.join(root, 'api', 'alta_test.go'), 'func TestAltaResponde201(t *testing.T) {}\n')
  const roots = [path.join(root, 'api')]

  const veredicto = (tests) => EV.contrast(tests, roots).map((trace) => trace.verdict)
  assert.deepEqual(veredicto('C1 → TestAltaResponde201'), ['encontrado'])
  // La prueba inventada es lo que este contraste existe para atrapar.
  assert.deepEqual(veredicto('C1 → TestQueNoExiste'), ['ausente'])
  // Y la descrita en prosa no se da por ausente: el molde admite «nombre de prueba o comando», así que
  // confundir «no lo encontré» con «no existe» convertiría la forma documentada en un error.
  assert.deepEqual(veredicto('C1 → prueba de alta de cliente'), ['inbuscable'])
  assert.deepEqual(veredicto('n/a — no hay superficie ejecutable'), [])
  // Sin raíces declaradas no hay dónde mirar, y afirmar ausencia ahí sería inventar el hallazgo.
  assert.deepEqual(EV.contrast('C1 → TestAltaResponde201', []).map((t) => t.verdict), ['inbuscable'])
})
