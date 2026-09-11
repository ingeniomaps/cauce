'use strict'

// Qué decide cada guard: qué bloquea y —lo que cuesta más— qué deja pasar. Los dos lados siempre, porque
// un guard que bloqueara todo pasaría entero un archivo que sólo probara frenos.
//
// Acá se ejecuta la decisión. Dónde aterriza el wiring que la invoca es de `runners.test.js`.

const { tempRoot, outsideTempRoot, writeWip } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, executeAll, guards, hookGroups, hookMetadata } = require('../../engine/hooks/run')

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

// Este ayudante escribe —`init`, `config`, y sus llamadores `add` y `commit`—, y `-C`/`cwd` no le ganan
// a `GIT_DIR`: heredada, cada uno de esos comandos opera sobre el repositorio que la haya exportado. El
// motor ya no la exporta (caso 045), así que esto es el segundo cierre y no el único.
function git(args, cwd) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env })
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
  const push = { cwd: root, tool_input: { command: 'git push origin feat/x' } }

  declara(false)
  blocked('destructive', push, /publica cambios/)
  declara(true)
  assert.doesNotThrow(() => execute('destructive', push))
  // La llave es para las ramas de trabajo: la viva necesita su permiso propio (caso 108).
  blocked('destructive', { ...push, tool_input: { command: 'git push origin main' } }, /main, la rama viva/)
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
  assert.doesNotThrow(() => execute('destructive', entrada('git push origin rama')), 'la llave sigue habilitando')
  for (const forma of ['--force', '--force-with-lease', '-f']) {
    blocked('destructive', entrada(`git push ${forma} origin main`), /reescribe historia ya publicada/)
  }
  // El `+` del refspec es el mismo force, y con la llave prendida pasaba como un push normal.
  blocked('destructive', entrada('git push origin +rama'), /reescribe historia ya publicada/)
  blocked('destructive', entrada('git push origin +HEAD:rama'), /reescribe historia ya publicada/)
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

// El salto de línea separa comandos igual que `;`, `&` y `|`, y las siete reglas que acotan «dentro de
// este comando» sólo excluían los tres primeros. Cualquier bandera de una línea posterior se leía como
// parte del comando de arriba: `git commit -m "x"` seguido de `ls -a` se bloqueaba como si stageara al
// commitear, y `git push origin main` seguido de `rm -f /tmp/x` como si fuera un force push — un mensaje
// que además nombraba una violación que no estaba.
//
// Se mide en las dos direcciones a propósito. Sólo lo primero pasaría con las reglas apagadas, y sólo lo
// segundo pasaría con el `[^;&|]` de antes: es el par lo que fija el corte donde va.
test('un guard no cruza el salto de línea, que también separa comandos', () => {
  const dosLineas = (primero, segundo) => ({ tool_input: { command: `${primero}\n${segundo}` } })

  // Sigue bloqueando lo que le toca, escrito en una sola línea.
  blocked('git-add', { tool_input: { command: 'git commit -am "x"' } }, /stagea al commitear/)
  blocked('destructive', { tool_input: { command: 'git push --force origin main' } }, /reescribe historia/)
  blocked('dependencies', { tool_input: { command: 'npm install -g cosa' } }, /acción humana/)

  // Y deja pasar lo que vive en la línea de abajo y no es asunto suyo.
  assert.doesNotThrow(() => execute('git-add', dosLineas('git commit -q -m "x"', 'set -a; . ./.env; set +a')))
  assert.doesNotThrow(() => execute('git-add', dosLineas('git commit -m "x"', 'ls -a')))
  assert.doesNotThrow(() => execute('git-add', dosLineas('git add uno.js', 'ls .')))
  assert.doesNotThrow(() => execute('dependencies', dosLineas('npm install', 'grep -g x archivo')))

  // El push de la línea de arriba sigue frenado, pero por lo que de verdad es: publicar pide una acción
  // humana (R10). Lo que dejó de decir es que fuera un force push.
  const push = dosLineas('git push origin main', 'rm -f /tmp/x.log')
  blocked('destructive', push, /requiere una acción humana/)
  assert.throws(() => execute('destructive', push), (error) => !/reescribe historia/.test(String(error)),
    'y ya no lo anuncia como una reescritura de historia publicada')
})

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
  // Sin repositorio —el banco no lo es— el guard se degrada a la conducta de antes y bloquea, y lo
  // dice tal cual: que existe y que acá no hay con qué saber si viajó. Caso 086.
  blocked('migrations', { cwd: root, tool_input: rewrite }, /no hay repositorio con el que saber/)
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

// Escribir una migración son dos pasos —crearla y completarla— y hasta 0.79.0 el segundo se bloqueaba:
// el guard preguntaba `existsSync`, que contesta «hay un archivo ahí» y no «esto ya viajó a otra copia».
// Ninguna herramienta lo esquivaba, así que la única salida a la vista apagaba el guard entero, incluida
// la protección contra SQL destructivo (caso 086).
//
// Los cuatro estados del mismo archivo —recién creado, completado, staged y commiteado— se recorren en
// orden porque lo que se mide es dónde cae la frontera, y ninguno solo la ubica.
test('una migración se frena por haber viajado, no por estar en disco', () => {
  const root = tempRoot('ops-hook-migrations-git-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'migrations'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'embedded' }))
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 'p@p')
  git('config', 'user.name', 'p')

  const escribir = (name, content) => ({ cwd: root, tool_input: { file_path: `migrations/${name}`, content } })
  const archivo = (name, texto) => fs.writeFileSync(path.join(root, 'migrations', name), texto)

  // 1. Crear: no hay nada en disco y no se le pregunta nada a git.
  assert.doesNotThrow(() => execute('migrations', escribir('001_init.sql', 'create table users (id int);')))
  archivo('001_init.sql', 'create table users (id int);\n')

  // 2. Completar, acto seguido y sin commitear: es el paso que costó una corrida.
  assert.doesNotThrow(() => execute('migrations', escribir('001_init.sql', 'create table users (id int, n text);')),
    'un stub de esta misma sesión no es historial de nadie')

  // 3. Staged y sin commitear: tampoco viajó. `git ls-files` lo daría por historial y por eso no se usa.
  git('add', 'migrations/001_init.sql')
  assert.doesNotThrow(() => execute('migrations', escribir('001_init.sql', 'create table users (id int, m text);')),
    'estar en el índice no es haber viajado')

  // 4. Commiteada: ahora sí, y el mensaje afirma el hecho que lo sostiene en vez de interpretarlo.
  git('commit', '-qm', 'la migración')
  blocked('migrations', escribir('001_init.sql', 'create table users (id int, z text);'),
    /ya está en el historial del repositorio/)
  // Y nombra la salida angosta, que es la mitad que faltaba: sin ella el único camino a la vista apaga
  // el guard entero.
  blocked('migrations', escribir('001_init.sql', 'create table users (id int, z text);'), /ops-approval/)
  blocked('migrations', escribir('001_init.sql', 'create table users (id int, z text);'),
    /OPS_MIGRATIONS_OVERRIDE/)
})

// La extensión es del proyecto y el default no cambió: sin declarar nada sigue viendo sólo `.sql`, así
// que una migración TypeORM con el mismo `DROP TABLE` pasa. Las dos mitades van juntas porque cualquiera
// sola deja pasar la otra — un guard que mirara todo reintroduciría el falso positivo del caso 039, y uno
// que no mirara nada es el 077.
test('guard-migrations juzga las extensiones que el proyecto declara, y `.sql` si no declara ninguna', () => {
  const root = tempRoot('ops-hook-migrations-ext-')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'migrations'), { recursive: true })
  const config = (extra) => fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }], ...extra,
  }))
  const escribe = (file) => ({
    cwd: root, tool_input: { file_path: `migrations/${file}`, content: 'DROP TABLE users' },
  })

  // Sin declarar: el default es `.sql` y nada más. Es lo que hacía que 409 migraciones TypeORM de una
  // instancia real fueran invisibles para un guard que aparecía cableado y en verde.
  config({})
  blocked('migrations', escribe('001.sql'), /SQL destructivo/)
  assert.doesNotThrow(() => execute('migrations', escribe('1700000000000-Foo.ts')),
    'sin declararlo, el guard no mira una migración de lenguaje')

  // Declarándolas, las mira — y sigue sin mirar lo que no es una migración, que es el falso positivo que
  // el 039 vino a cerrar.
  config({ migrations: { extensions: ['sql', 'ts'] } })
  blocked('migrations', escribe('1700000000000-Foo.ts'), /SQL destructivo/)
  blocked('migrations', escribe('001.sql'), /SQL destructivo/)
  assert.doesNotThrow(() => execute('migrations', escribe('notas.md')), 'un archivo que no es migración')

  // Y la ruta sigue decidiendo: un `.ts` fuera de una carpeta de migraciones no lo juzga nadie, aunque el
  // proyecto haya declarado esa extensión.
  assert.doesNotThrow(() => execute('migrations', {
    cwd: root, tool_input: { file_path: 'src/repositorio.ts', content: 'DROP TABLE users' },
  }))

  // Una extensión que el validador rechaza no llega a la expresión regular: con metacaracteres la
  // ampliaría a todo, que es peor que el defecto que el campo vino a cerrar. El guard cae al default en
  // vez de construirla — quien enseña a escribir la configuración es `check`, no un bloqueo.
  config({ migrations: { extensions: ['.*'] } })
  assert.doesNotThrow(() => execute('migrations', escribe('notas.md')), 'no se amplía a cualquier cosa')
  blocked('migrations', escribe('001.sql'), /SQL destructivo/)
})

// El guard dice qué cubre. La descripción prometía «protege migraciones» a secas, y un proyecto TypeORM la
// leía como cobertura que no tenía: eso es lo que vuelve a un guard peor que no tenerlo.
test('la descripción del guard de migraciones nombra su alcance real', () => {
  const migraciones = hookMetadata.find((one) => one.name === 'migrations')
  assert.ok(migraciones, hookMetadata.map((one) => one.name).join(', '))
  assert.match(migraciones.purpose, /migrations\.extensions/, 'nombra el campo que amplía la cobertura')
  assert.match(migraciones.purpose, /\.sql/, 'y el default de quien no lo declara')
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
    /no hay repositorio con el que saber/)
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

// Lo que un bloqueo dice pegar se pega tal cual, y de ahí lo saca la prueba: una ruta armada aparte
// mediría la forma que eligió la prueba, no la que el guard coteja (caso 089). Se agrega al archivo en vez
// de pisarlo, porque `verify` aprueba el conjunto entero y lo que ya aprobaron los otros sigue contando.
function pasteApproval(root, message) {
  const lines = message.split('\n')
  const start = lines.findIndex((line) => line.startsWith('Aprobalo pegando tal cual'))
  assert.ok(start >= 0, `el bloqueo no dice qué pegar:\n${message}`)
  const paste = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break
    paste.push(line.slice(2))
  }
  assert.ok(paste.length, `el bloqueo no nombra ninguna línea:\n${message}`)
  assert.doesNotMatch(message, /esa\(s\) ruta\(s\)/, 'nombra las rutas en vez de aludirlas')
  fs.appendFileSync(path.join(root, 'planning', '.ops-approval'), `${paste.join('\n')}\n`)
  return paste
}

function messageOf(name, input) {
  try { execute(name, input) } catch (error) {
    if (error.blocked) return error.message
    throw error
  }
  return assert.fail(`${name} no bloqueó`)
}

test('lo que un bloqueo dice pegar destraba ese mismo bloqueo', () => {
  // `plan-first` coteja la ruta que manda Write, que es absoluta.
  const plan = planFirstRoot('ops-hook-pegar-plan-', WIP_IDLE)
  const write = { cwd: plan, tool_input: { file_path: path.join(plan, 'src', 'altas.js') } }
  assert.deepEqual(pasteApproval(plan, messageOf('plan-first', write)), [path.join(plan, 'src', 'altas.js')])
  assert.doesNotThrow(() => execute('plan-first', write))

  // `test-evidence` tiene dos bloqueos con dos rutas: la del archivo que apaga una prueba y la del patch
  // que la borra.
  const skip = {
    cwd: plan, tool_input: { file_path: path.join(plan, 'alta.test.ts'), content: "describe.skip('a', () => {})" },
  }
  assert.deepEqual(pasteApproval(plan, messageOf('test-evidence', skip)), [path.join(plan, 'alta.test.ts')])
  assert.doesNotThrow(() => execute('test-evidence', skip))
  const removal = {
    cwd: plan, tool_input: { patch: '*** Begin Patch\n*** Delete File: tests/alta_test.go\n*** End Patch' },
  }
  assert.deepEqual(pasteApproval(plan, messageOf('test-evidence', removal)), ['tests/alta_test.go'])
  assert.doesNotThrow(() => execute('test-evidence', removal))

  // Los de commit cotejan rutas relativas al repositorio; el manifiesto va dentro de una carpeta, que es
  // donde `dependencies` mostraba la carpeta y el nombre por separado y la línea no aparecía en ningún lado.
  const repo = tempRoot('ops-hook-pegar-commit-')
  initRepo(repo)
  fs.mkdirSync(path.join(repo, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'engine'))
  fs.mkdirSync(path.join(repo, 'packages', 'app'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(repo, 'engine', 'x.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(repo, 'packages', 'app', 'package.json'), JSON.stringify({ dependencies: { a: '1' } }))
  fs.writeFileSync(path.join(repo, 'packages', 'app', 'package-lock.json'), '{}\n')
  git(['add', 'engine/x.js', 'packages/app/package.json'], repo)
  const commit = { cwd: repo, tool_input: { command: 'git commit -m x' } }
  assert.deepEqual(pasteApproval(repo, messageOf('governance', commit)), ['engine/x.js'])
  assert.doesNotThrow(() => execute('governance', commit))
  assert.deepEqual(pasteApproval(repo, messageOf('dependencies', commit)), ['packages/app/package.json'])
  assert.doesNotThrow(() => execute('dependencies', commit))

  // `verify` aprueba el conjunto staged, y su bloqueo no nombraba ninguna ruta.
  fs.mkdirSync(path.join(repo, 'openapi'))
  fs.writeFileSync(path.join(repo, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n')
  git(['add', 'openapi/api.yaml'], repo)
  assert.deepEqual(pasteApproval(repo, messageOf('verify', commit)), ['openapi/api.yaml'])
  assert.doesNotThrow(() => execute('verify', commit))

  // Y el bloqueo de un gate en rojo, que es el otro camino de `verify` y el que más se ve.
  const gate = tempRoot('ops-hook-pegar-gate-')
  initRepo(gate)
  fs.mkdirSync(path.join(gate, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(gate, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(gate, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  fs.writeFileSync(path.join(gate, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], gate)
  const commitGate = { cwd: gate, tool_input: { command: 'git commit -m x' } }
  assert.deepEqual(pasteApproval(gate, messageOf('verify', commitGate)).sort(), ['app.js', 'package.json'])
  assert.doesNotThrow(() => execute('verify', commitGate))

  // `migrations` coteja la ruta con las barras normalizadas, y lo que muestra tiene que ser ésa: con una
  // ruta que llega con `\`, la cruda no pegaría.
  const mig = planFirstRoot('ops-hook-pegar-mig-', WIP_CON_PLAN)
  const destructive = {
    cwd: mig, tool_input: { file_path: 'migrations\\001_init.sql', content: 'DROP TABLE users;\n' },
  }
  assert.deepEqual(pasteApproval(mig, messageOf('migrations', destructive)), ['migrations/001_init.sql'])
  assert.doesNotThrow(() => execute('migrations', destructive))
})

test('lo que verify enlaza a la copia no entra a su índice', () => {
  const root = tempRoot('ops-hook-verify-enlace-')
  initRepo(root)
  // Con la barra final, que es la forma corriente de ignorar un directorio y la que el enlace no cumple.
  fs.writeFileSync(path.join(root, '.gitignore'), 'cache/\n')
  fs.mkdirSync(path.join(root, 'cache'), { recursive: true })
  fs.writeFileSync(path.join(root, 'cache', 'dato.txt'), 'entorno\n')
  const visto = path.join(tempRoot('ops-hook-verify-enlace-visto-'), 'trackeado.txt')
  fs.writeFileSync(path.join(root, 'gate.js'), `require('node:fs').writeFileSync(${JSON.stringify(visto)}, `
    + `require('node:child_process').execSync('git ls-files', { encoding: 'utf8' }))\n`)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node gate.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  git(['add', '.gitignore', 'gate.js', 'package.json', 'app.js'], root)
  fs.writeFileSync(path.join(root, 'notas.txt'), 'suelto: es lo que obliga a materializar la copia\n')

  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))
  const tracked = fs.readFileSync(visto, 'utf8').split('\n').filter(Boolean)
  assert.ok(tracked.includes('app.js'), `el gate no corrió sobre la copia: ${tracked.join(', ')}`)
  assert.ok(!tracked.includes('cache'), `el enlace entró al índice de la copia: ${tracked.join(', ')}`)
})

test('lo que verify enlaza se excluye por su nombre literal, aunque tenga caracteres de glob', () => {
  const root = tempRoot('ops-hook-verify-glob-')
  initRepo(root)
  // `cache[1]` sin escapar es un patrón que nombra cache1, no este directorio.
  fs.writeFileSync(path.join(root, '.gitignore'), 'cache\\[1\\]/\n')
  fs.mkdirSync(path.join(root, 'cache[1]'), { recursive: true })
  fs.writeFileSync(path.join(root, 'cache[1]', 'dato.txt'), 'entorno\n')
  const visto = path.join(tempRoot('ops-hook-verify-glob-visto-'), 'trackeado.txt')
  fs.writeFileSync(path.join(root, 'gate.js'), `require('node:fs').writeFileSync(${JSON.stringify(visto)}, `
    + `require('node:child_process').execSync('git ls-files', { encoding: 'utf8' }))\n`)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node gate.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  git(['add', '.gitignore', 'gate.js', 'package.json', 'app.js'], root)
  fs.writeFileSync(path.join(root, 'notas.txt'), 'suelto: obliga a materializar la copia\n')

  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))
  const tracked = fs.readFileSync(visto, 'utf8').split('\n').filter(Boolean)
  assert.ok(tracked.includes('app.js'), `el gate no corrió sobre la copia: ${tracked.join(', ')}`)
  assert.ok(!tracked.includes('cache[1]'), `el enlace entró al índice de la copia: ${tracked.join(', ')}`)
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
  writeWip(path.join(root, 'planning'), wip)
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
  // En embedded la raíz de ops es la del producto: su configuración no es producto, su `package.json` sí.
  assert.doesNotThrow(() => escribe('ops.config.json'))
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'package.json' } }, /sin plan/)
})

test('guard-plan-first no juzga la instancia sidecar ni lo que queda fuera de las raíces', () => {
  const base = tempRoot('ops-hook-plan-sidecar-')
  const root = path.join(base, 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  writeWip(path.join(root, 'planning'), WIP_IDLE)
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), BACKLOG_CON_TAREA)
  const declare = (workspaceRoots) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots }))
  const write = (file) => ({ cwd: root, tool_input: { file_path: file } })
  const instance = ['ops.config.json', 'AGENTS.md', 'CLAUDE.md', 'package.json', '.gitignore']
    .map((name) => path.join(root, name))
  const service = path.join(base, 'app', 'src', 'a.js')

  // La raíz que escribe `init` en sidecar deja a la instancia adentro, y eso no la vuelve producto.
  declare([{ name: 'main', path: '..' }])
  for (const file of instance) assert.doesNotThrow(() => execute('plan-first', write(file)), file)
  blocked('plan-first', write(service), /sin plan/)

  // Con una raíz más angosta, lo que queda fuera de ella tampoco: es lo que el proyecto declaró escribible.
  declare([{ name: 'app', path: '../app' }])
  for (const file of instance) assert.doesNotThrow(() => execute('plan-first', write(file)), file)
  assert.doesNotThrow(() => execute('plan-first', write(path.join(base, 'otra-herramienta', 'caso.md'))))
  blocked('plan-first', write(service), /sin plan/)

  // Sin raíces legibles no hay contra qué comparar: frena como antes, que es el lado de errar.
  declare(undefined)
  blocked('plan-first', write(path.join(root, 'AGENTS.md')), /sin plan/)
  blocked('plan-first', write(service), /sin plan/)
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
  fs.mkdirSync(path.join(conHistoria, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(conHistoria, 'planning', 'done', 'alta-de-cliente.md'),
    '- [x] **alta-de-cliente** — Alta\n')
  blocked('plan-first', { cwd: conHistoria, tool_input: { file_path: 'src/altas.js' } }, /sin plan/)
})

// Con `mode: sidecar` hay un solo `planning/` por máquina, así que el plan de un agente está al alcance
// del otro. Si el guard leyera cualquiera, el segundo escribiría producto amparado en el plan del primero
// y quedaría inerte justo donde más hace falta: dos agentes construyendo a la vez.
test('el plan de un runner no le sirve a otro para saltear plan-first', () => {
  const root = planFirstRoot('ops-hook-plan-por-runner-', WIP_IDLE)
  writeWip(path.join(root, 'planning'), '---\ntask: alta-de-cliente\nphase: Build\n---\n'
    + '\n## Plan aprobado\n1. [ ] Montar el alta\n')
  const escribir = { cwd: root, tool_input: { file_path: 'src/altas.js' } }

  assert.doesNotThrow(() => execute('plan-first', escribir), 'con su propio plan, escribe')

  const previo = process.env.CAUCE_RUNNER
  process.env.CAUCE_RUNNER = '/w/otro-agente'
  try {
    blocked('plan-first', escribir, /sin plan/)
  } finally { process.env.CAUCE_RUNNER = previo }
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

// Qué entorno recibe un gate según dónde corra. Se mide por lo que el gate **recibe** y no por lo que
// devuelve `commitTree`, porque lo que importa es que llegue: entre una cosa y la otra está `run`, que
// mezcla el objeto sobre el entorno del proceso.
//
// Las dos mitades importan y la segunda es de ausencia. Acá estuvo `CI=true` y fue la regresión del caso
// 070: desarmaba la confirmación de cualquier herramienta en vez de quitarle a pnpm el motivo de
// preguntar. Comprobar que llega la palanca nueva no comprueba que la vieja se fue —las dos podrían
// convivir, y ahí el verde diría que ocurrió la mitad del cambio—.
// El error que produjo el 070 no fue elegir mal una variable: fue no ver que ponerla era una **quita**.
// `CI=true` no agregaba una conducta, sacaba la confirmación con la que pnpm frena antes de purgar — y
// una confirmación que estorba casi siempre está cuidando algo. R9 pide que una quita se pruebe por
// ausencia, y esa prueba no se escribió porque nadie extrañaba lo que se estaba sacando.
//
// La lista atrapa lo que conocemos y nada más, que es el límite honesto de una lista. Lo que agrega es
// que la próxima vez la decisión se tome a la vista y no dentro de un comentario.
const DESARMAN = {
  CI: 'pnpm deja de confirmar antes de purgar el node_modules, y npm y yarn cambian de modo (caso 070)',
  CONTINUOUS_INTEGRATION: 'el mismo efecto que CI en varias herramientas',
  npm_config_yes: 'npx deja de preguntar antes de bajar y ejecutar un paquete',
  npm_config_confirm_modules_purge: 'apaga exactamente la confirmación que protegía al proyecto',
}

test('la copia recibe la palanca que apaga la sincronización, y ya no la que desarma confirmaciones', () => {
  const root = tempRoot('ops-hook-ci-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  // El gate va en un archivo y no inline: tiene que quedar trackeado para que la copia lo materialice,
  // y anota fuera del árbol que se juzga para que las dos corridas escriban en el mismo lugar.
  const visto = path.join(tempRoot('ops-hook-ci-visto-'), 'visto.txt')
  fs.writeFileSync(path.join(root, 'gate.js'),
    `const d = ${JSON.stringify(DESARMAN)}\n`
    + `require('node:fs').appendFileSync(${JSON.stringify(visto)}, `
    + `'verify=' + (process.env.npm_config_verify_deps_before_run || 'vacio') `
    + `+ ' desarmadas=' + Object.keys(d).filter((k) => process.env[k]).join(',') + '\\n')\n`)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node gate.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, 'planning', '.keep'), '')
  // Todo staged y nada suelto: es la única forma de que no haya copia, y cuesta decirlo porque un solo
  // archivo sin trackear ya la dispara — `git status` lo lista y la condición mira cualquier diferencia,
  // no sólo un cambio sin stagear.
  git(['add', '-A'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  // Se despejan a mano para las dos mitades, porque lo que se mide es qué agrega el guard y no qué traía
  // el entorno. `CI` la exporta Actions: sin despejarla, la mitad de «no hay copia» pasaría en una laptop
  // y afirmaría en CI algo que ahí no es cierto. La otra la exporta el propio `verify` cuando esta suite
  // corre dentro de una copia, y sin despejarla la prueba frenaba todo commit con algo sin trackear
  // (caso 093).
  const ISOLATED = ['CI', 'npm_config_verify_deps_before_run']
  const antes = Object.fromEntries(ISOLATED.map((name) => [name, process.env[name]]))
  try {
    for (const name of ISOLATED) delete process.env[name]
    assert.doesNotThrow(() => execute('verify', commit))
    assert.match(fs.readFileSync(visto, 'utf8'), /^verify=vacio desarmadas=$/m,
      'sin copia no se le cambia el entorno a nadie')

    // Y ahora sí hay copia, por lo más barato que la dispara.
    fs.writeFileSync(visto, '')
    fs.writeFileSync(path.join(root, 'suelto.txt'), 'no trackeado\n')
    assert.doesNotThrow(() => execute('verify', commit))
    const enLaCopia = fs.readFileSync(visto, 'utf8')
    assert.match(enLaCopia, /^verify=false/m, 'la copia no sincroniza nada antes de correr el gate')
    assert.match(enLaCopia, /desarmadas=$/m,
      `y ninguna de éstas llega al gate:\n${Object.entries(DESARMAN)
        .map(([k, why]) => `  ${k}: ${why}`).join('\n')}`)
  } finally {
    for (const name of ISOLATED) {
      if (antes[name] === undefined) delete process.env[name]
      else process.env[name] = antes[name]
    }
  }
})

// La regresión del caso 070, medida como R9 pide que se mida una quita: por ausencia de daño. Poner
// `CI=true` en la copia no agregaba una conducta, **quitaba** una —la confirmación con la que pnpm frena
// antes de purgar—, y esa confirmación era lo único que protegía al `node_modules` del proyecto. Sin
// ella la reinstalación avanza y borra por el enlace; el gate igual termina en verde, así que nada lo
// dice.
//
// Se usa un `pnpm` de mentira porque el de verdad exige una instalación real y salir a la red, y lo que
// hay que fijar no es qué hace pnpm sino **qué le pedimos**: con la comprobación previa apagada no toca
// nada, y con cualquier otro valor empieza borrando. Es la conducta documentada de `verify-deps-before-run`,
// reproducida a mano con pnpm 10.30.2 antes de escribir esto.
test('un gate no puede purgar el node_modules del proyecto por el enlace', () => {
  const root = tempRoot('ops-hook-purga-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e ""' } }))
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'marca.txt'), 'el árbol del proyecto\n')
  git(['add', 'package.json', 'app.js', '.gitignore', 'pnpm-lock.yaml'], root)

  // El `pnpm` de mentira: reinstala —o sea, empieza borrando— salvo que se le haya apagado la
  // comprobación previa. Sigue el enlace, que es exactamente por donde ocurrió el daño.
  const falso = tempRoot('ops-hook-purga-bin-')
  fs.writeFileSync(path.join(falso, 'pnpm'), '#!/usr/bin/env bash\n'
    + 'if [ "${npm_config_verify_deps_before_run:-}" != "false" ]; then\n'
    + '  rm -f node_modules/marca.txt\n'
    + 'fi\n'
    + 'exit 0\n', { mode: 0o755 })

  // Árbol e índice difieren, que es cuando se materializa la copia y aparece el enlace.
  fs.writeFileSync(path.join(root, 'suelto.txt'), 'no trackeado\n')
  const antes = process.env.PATH
  try {
    process.env.PATH = `${falso}${path.delimiter}${antes}`
    assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))
  } finally {
    process.env.PATH = antes
  }

  // La aserción es de ausencia de daño: que el gate haya pasado no dice nada: en la regresión también
  // pasaba, y el árbol del proyecto ya no estaba.
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'marca.txt')), true,
    'el node_modules del proyecto sigue entero')
})

// La copia mide el índice, así que lo que un gate escriba en lo enlazado queda con la versión **staged**
// mientras el fuente en disco tiene otra — y nada lo dice. Medido con un `dist/` que pasaba de lo que el
// usuario editaba a lo que estaba en el índice (caso 069). Las dos mitades importan y por eso van
// juntas: dejar de enlazar la salida no vale nada si además se deja de enlazar la dependencia.
test('un gate no pisa lo que el usuario ya construyó, y sigue viendo sus dependencias', () => {
  const root = tempRoot('ops-hook-aislado-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'planning', '.keep'), '')
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\nnode_modules/\n')
  fs.writeFileSync(path.join(root, 'build.js'), 'const fs = require("node:fs")\n'
    + 'if (!fs.existsSync("node_modules/dep/marca.txt")) { console.error("falta la dependencia"); process.exit(1) }\n'
    + 'fs.mkdirSync("dist", { recursive: true })\n'
    + 'fs.copyFileSync("app.js", "dist/app.js")\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'node build.js' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'VERSION = "staged"\n')
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'marca.txt'), 'soy la dependencia\n')
  git(['add', '-A'], root)

  // El usuario sigue editando y ya había construido con lo suyo.
  fs.writeFileSync(path.join(root, 'app.js'), 'VERSION = "lo-que-estoy-editando"\n')
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(root, 'app.js'), path.join(root, 'dist', 'app.js'))

  // Que pase es la mitad que prueba que la dependencia sigue enlazada: sin ella el build sale en rojo.
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }),
    'la dependencia se enlaza igual, que es lo que el gate no puede fabricar')
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8').trim(),
    'VERSION = "lo-que-estoy-editando"', 'y la salida de build del usuario queda como estaba')
})

// El mensaje decía `test (exit 1)` y tiraba la salida de la herramienta, así que una suite en rojo y un
// gestor que se negó a arrancar el script llegaban con el mismo texto — y la salida que el guard ofrece
// empuja a aprobar el commit como «rojo conocido». Es la misma forma de fallar que el caso 066 encontró
// en una prueba, acá en lo que lee una persona.
test('un gate que falla dice cuánto tardó y qué dijo la herramienta', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-mudo-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: 'node -e "console.error(\'ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY\');process.exit(1)"' },
  }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = 1\n')
  git(['add', 'package.json', 'app.js'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  blocked('verify', commit, /ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY/)
  blocked('verify', commit, /test \(exit 1, \d+\.\d s\)/)
  // Y el número va con el hecho, no con un veredicto: un lint puede fallar rápido y de verdad.
  blocked('verify', commit, /no alcanza para correr una suite/)
  assert.equal(typeof EV.runs(root).slice(-1)[0].ms, 'number', 'la duración queda en el registro')
})

// Qué cita el bloqueo cuando el reporte trae pruebas verdes y rojas, en cada formato comprobado (caso 094).
test('el bloqueo de verify cita la prueba que falló, no una verde que dice error', () => {
  const root = tempRoot('ops-hook-cita-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'alta.test.js'), "const test = require('node:test')\n"
    + "const assert = require('node:assert')\n"
    + "test('el error de validación se informa', () => assert.ok(true))\n"
    + "test('el alta guarda el cliente', () => assert.equal(1, 2))\n")
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }
  const cites = (script, expected) => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: script } }))
    git(['add', 'package.json', 'alta.test.js'], root)
    const cited = messageOf('verify', commit).split('\n')[0]
    assert.match(cited, expected)
    assert.doesNotMatch(cited, /✔|: ok \d|--- PASS| PASSED/, 'no cita una prueba en verde')
  }
  const prints = (...lines) => `node -e "${lines.map((line) => `console.log('${line}')`).join(';')};process.exit(1)"`

  cites('node --test', /✖ el alta guarda el cliente/)
  cites('node --test --test-reporter=tap', /not ok 2 - el alta guarda el cliente/)
  // La salida de `go test -v`, copiada de una corrida real con go 1.26, la escribe un script: la suite no
  // puede suponer que go esté instalado. La primera línea no tiene marca y dice «Error», así que es la
  // marca de fallo lo que evita citarla.
  cites(prints('=== RUN   TestElErrorSeInforma', '--- PASS: TestElErrorSeInforma (0.00s)',
    '=== RUN   TestElAltaGuarda', '    a_test.go:4: no', '--- FAIL: TestElAltaGuarda (0.00s)', 'FAIL'),
  /--- FAIL: TestElAltaGuarda/)
  // Jest, vitest, mocha y pytest, copiados de corridas reales entubadas —las versiones, en `shell.js`—. La
  // primera línea de cada uno es la que se citaba antes: el archivo, el resumen o la verde.
  cites(prints('FAIL ./alta.test.js', '  ● el alta guarda el cliente', '    expect(received).toBe(expected)'),
    /● el alta guarda el cliente/)
  cites(prints(' ❯ alta.test.mjs (2 tests | 1 failed) 7ms', '   × el alta guarda el cliente 4ms'),
    /× el alta guarda el cliente/)
  cites(prints('  ✔ el error de validación se informa al usuario', '  1) el alta guarda el cliente', '  1 failing'),
    /1\) el alta guarda el cliente/)
  cites(prints('test_alta.py::test_el_error_de_validacion_se_informa PASSED [ 50%]',
    'test_alta.py::test_el_alta_guarda_el_cliente FAILED [100%]', '=== FAILURES ===',
    'FAILED test_alta.py::test_el_alta_guarda_el_cliente - assert 1 == 2'), /FAILED test_alta\.py::test_el_alta/)
  // Sin marca de fallo sigue la búsqueda por palabra, que ya no puede quedarse con una verde.
  cites(prints('✔ el error se informa', 'Error: cannot connect'), /Error: cannot connect/)
  cites(prints('test_a.py::test_el_error_se_informa PASSED [ 50%]', 'ERROR: file not found'), /ERROR: file not found/)
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

// La fuga que el caso 045 nombra: `verify` corría los gates con `GIT_DIR` del repositorio real, así que
// un gate que escribe con git —la suite de un proyecto levantando repos de prueba, típicamente— escribía
// en el repositorio que el guard estaba juzgando. Se mide por el efecto y no por el entorno: lo que
// importa no es qué variable se exporta sino que el repo de verdad no gane nada.
test('verify no deja que un gate escriba en el repositorio que juzga', () => {
  const root = tempRoot('ops-hook-fuga-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: 'git commit --allow-empty -m fuga-desde-el-gate || true' },
  }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  // Sin esto el árbol está limpio, `commitTree` no materializa nada y la fuga no se puede ejercer.
  fs.writeFileSync(path.join(root, 'sucio.txt'), 'algo sin stagear\n')

  // El caso enumera tres daños y el commit es sólo uno: también aparecieron archivos trackeados que
  // nadie agregó, y un `git add` sin commit no toca el log. Se compara el estado entero contra el de
  // antes en vez de enumerar lo esperado: enumerar deja pasar lo que uno no pensó en escribir.
  // Se descuenta `planning/`: es donde `verify` deja su propio registro de gates, que sí es una
  // escritura suya y esperada. Todo lo demás tiene que quedar idéntico.
  const estado = () => spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n').filter((line) => !/planning\//.test(line)).join('\n')
  const antes = estado()

  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }))

  const log = spawnSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' }).stdout
  assert.equal(/fuga-desde-el-gate/.test(log), false, 'el gate commiteó en el repositorio de verdad')
  assert.equal(estado(), antes, 'el índice o el árbol del repositorio de verdad cambiaron durante el gate')
  const config = spawnSync('git', ['config', '--local', '--get', 'core.worktree'],
    { cwd: root, encoding: 'utf8' }).stdout.trim()
  assert.equal(config, '', 'el repositorio quedó apuntando a un árbol que ya no existe')
})

// Lo que la persona pidió en el chat, visto por los guards (caso 098). El registro lo escribe el hook de
// mensaje y lo lee cada guard con la sesión y el mensaje de la llamada. Cada prueba abre una sesión propia
// para no leer el registro de otra, y saca `CI` del entorno: en la puerta está puesta, y ahí no hay persona.
let sesiones = 0
function chatSession() {
  const { DIR } = require('../../engine/hooks/chat')
  const session = `prueba-${process.pid}-${sesiones += 1}`
  const ci = process.env.CI
  delete process.env.CI
  let turno = 0
  return {
    // La persona manda un mensaje; devuelve cómo se ve una llamada originada por él, con el campo que
    // mande el runner —cuál es cuál lo dice chat.js—.
    says(prompt, field = 'prompt_id') {
      const id = field ? { [field]: `m${turno += 1}` } : {}
      execute('chat', { session_id: session, ...id, prompt })
      return (extra) => ({ session_id: session, ...id, ...extra })
    },
    close() {
      fs.rmSync(path.join(DIR, `${session}.json`), { force: true })
      if (ci !== undefined) process.env.CI = ci
    },
  }
}

test('lo que la persona nombró en el chat pasa; lo que no nombró, negó o no pidió ella se sigue frenando', () => {
  const root = planFirstRoot('ops-hook-chat-nombra-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const pidio = chat.says('leé el .env y decime qué variables tiene')
    assert.doesNotThrow(() => execute('secrets-read', lee(pidio)))
    // La orden era para ese mensaje y para eso: otro mensaje, un subagente u otra credencial, no.
    blocked('secrets-read', lee((extra) => ({ ...pidio(extra), prompt_id: 'otro' })), /leerla/)
    blocked('secrets-read', lee((extra) => pidio({ agent_id: 'a1', ...extra })), /leerla/)
    blocked('secrets-read', lee(pidio, 'id_ed25519'), /leerla/)
    blocked('secrets-read', { cwd: root, tool_input: { file_path: path.join(root, '.env') } }, /leerla/)
    // Nombrar no es pedir, y un nombre tiene que estar entero.
    blocked('secrets-read', lee(chat.says('no leas el .env, mirá el README')), /leerla/)
    blocked('secrets-read', lee(chat.says('leé el .env.example')), /leerla/)
    // Un aviso del runner no lo escribió la persona, y un recorrido de Cauce es trabajo del agente.
    // El nombre va entero a propósito: pegado a la etiqueta no contaría, y la prueba no vería la marca.
    blocked('secrets-read', lee(chat.says('<task-notification>\nleé el .env\n</task-notification>')), /leerla/)
    blocked('secrets-read', lee(chat.says('/autobuild leé el .env')), /leerla/)
    blocked('secrets-read', lee(chat.says('$flow leé el .env')), /leerla/)
    // Los otros dos runners, cada uno con su forma de atar la llamada.
    const codex = chat.says('leé el .env', 'turn_id')
    assert.doesNotThrow(() => execute('secrets-read', lee(codex)))
    blocked('secrets-read', lee((extra) => ({ ...codex(extra), turn_id: 'otro' })), /leerla/)
    assert.doesNotThrow(() => execute('secrets-read', lee(chat.says('leé el .env', null))))
    // En CI no hay persona, aunque el registro diga lo contrario.
    const otra = chat.says('leé el .env')
    process.env.CI = 'true'
    try { blocked('secrets-read', lee(otra), /leerla/) } finally { delete process.env.CI }
  } finally { chat.close() }
})

test('un «dale» aprueba exactamente lo que quedó frenado, y nada más', () => {
  const root = planFirstRoot('ops-hook-chat-dale-', WIP_CON_PLAN)
  const lee = (call, file = '.env') => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    const pedido = chat.says('revisá cómo arranca el servicio')
    // Con persona, el archivo es de ella: el mensaje no le dice al agente que se lo escriba.
    const frenado = messageOf('secrets-read', lee(pedido))
    assert.match(frenado, /si contesta «dale», reintentá el mismo cambio/)
    assert.doesNotMatch(frenado, /Aprobalo pegando/)
    const dale = chat.says('dale')
    assert.doesNotThrow(() => execute('secrets-read', lee(dale)))
    blocked('secrets-read', lee(dale, 'id_ed25519'), /leerla/)
    // La aprobación era de esa respuesta: el mensaje siguiente empieza de cero.
    blocked('secrets-read', lee(chat.says('ahora otra cosa')), /leerla/)
    // Y lo que la respuesta niega no se aprueba.
    messageOf('secrets-read', lee(chat.says('revisá todo')))
    blocked('secrets-read', lee(chat.says('sí, pero no el .env')), /leerla/)
  } finally { chat.close() }
})

// Nombrar no es pedir (caso 109): la frase del nombre tiene que pedir algo. Una pregunta o un comentario al
// pasar no autorizan; un pedido con verbo sí, también con el pronombre pegado o en inglés.
test('mencionar algo en el chat no lo autoriza: la frase tiene que pedirlo', () => {
  const root = planFirstRoot('ops-hook-chat-pide-', WIP_CON_PLAN)
  const lee = (call, file) => call({ cwd: root, tool_input: { file_path: path.join(root, file) } })
  const chat = chatSession()
  try {
    for (const [mensaje, archivo] of [
      ['el deploy falla por las credentials de AWS, revisá el pipeline', 'credentials'],
      ['¿para qué sirven las credentials?', 'credentials'],
      ['el .env tiene algo raro? no sé', '.env'],
    ]) blocked('secrets-read', lee(chat.says(mensaje), archivo), /leerla/)
    for (const [mensaje, archivo] of [
      ['leé el archivo credentials', 'credentials'], ['abrime el .env', '.env'],
      ['mostrame el .npmrc', '.npmrc'], ['please read the .env', '.env'], ['¿el .env lo podés abrir?', '.env'],
    ]) assert.doesNotThrow(() => execute('secrets-read', lee(chat.says(mensaje), archivo)), mensaje)
  } finally { chat.close() }
})

test('plan-first no frena lo que la persona pidió en el chat, y sí el trabajo del agente', () => {
  const root = planFirstRoot('ops-hook-chat-plan-', WIP_IDLE)
  const escribe = (call) => call({ cwd: root, tool_input: { file_path: path.join(root, 'src', 'altas.js') } })
  const chat = chatSession()
  try {
    const pedido = chat.says('arreglá el typo del mensaje de altas')
    assert.doesNotThrow(() => execute('plan-first', escribe(pedido)))
    blocked('plan-first', escribe((extra) => pedido({ agent_id: 'a1', ...extra })), /sin plan/)
    blocked('plan-first', escribe(chat.says('/autobuild alta-de-cliente')), /sin plan/)
    blocked('plan-first', escribe((extra) => extra), /sin plan/)
  } finally { chat.close() }
})

test('los guards de límites no dejan al agente escribirse la aprobación ni el registro del chat', () => {
  const { DIR } = require('../../engine/hooks/chat')
  const root = planFirstRoot('ops-hook-autoaprueba-', WIP_CON_PLAN)
  const approval = path.join(root, 'planning', '.ops-approval')
  const escribe = (file) => ({ cwd: root, tool_input: { file_path: file, content: 'src/x.js\n' } })
  const corre = (command) => ({ cwd: root, tool_input: { command } })

  blocked('workspace-boundary', escribe(approval), /aprobarse solo/)
  blocked('shell-boundary', corre('echo src/x.js >> planning/.ops-approval'), /aprobarse solo/)
  blocked('workspace-boundary', escribe(path.join(DIR, 'x.json')), /registro de lo que la persona dijo/)
  // El temporal es un destino neutro para `shell-boundary`, y el registro vive ahí: se juzga igual.
  blocked('shell-boundary', corre(`echo {} > ${path.join(DIR, 'x.json')}`), /registro de lo que la persona dijo/)
  // Los dos grupos de escritura lo corren.
  assert.throws(() => executeAll(['pre-files'], escribe(approval)), /aprobarse solo/)
  assert.throws(() => executeAll(['pre-shell'], corre('echo src/x.js >> planning/.ops-approval')), /aprobarse solo/)
  // Lo corriente pasa: otra ruta, o leer el archivo.
  assert.doesNotThrow(() => execute('workspace-boundary', escribe(path.join(root, 'src', 'x.js'))))
  assert.doesNotThrow(() => execute('shell-boundary', corre('cat planning/.ops-approval')))
  // Si la persona se lo pide nombrándolo, la que aprueba es ella.
  const chat = chatSession()
  try {
    const pidio = chat.says('agregá src/x.js a .ops-approval')
    assert.doesNotThrow(() => execute('workspace-boundary', pidio(escribe(approval))))
  } finally { chat.close() }
})

test('en sidecar el bloqueo nombra el archivo que el guard lee, y pegar ahí destraba (caso 097)', () => {
  const workspace = tempRoot('ops-hook-sidecar-aprueba-')
  const root = path.join(workspace, 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '..' }] }))
  const antes = { OPS_ROOT: process.env.OPS_ROOT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
    GEMINI_PROJECT_DIR: process.env.GEMINI_PROJECT_DIR }
  const restore = () => {
    for (const [name, value] of Object.entries(antes)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  const leer = (cwd, file) => ({ cwd, tool_input: { file_path: path.join(cwd, file) } })
  const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Como lo lanza el runner: la sesión en el workspace y la raíz de ops la que exporta `run-hook.sh`.
  process.env.OPS_ROOT = root
  process.env.CLAUDE_PROJECT_DIR = workspace
  delete process.env.GEMINI_PROJECT_DIR
  try {
    const lee = leer(workspace, '.env')
    const message = messageOf('secrets-read', lee)
    assert.match(message, /pegando tal cual en acme-ops\/planning\/\.ops-approval estas líneas/)
    // Donde decía antes —el `planning/` de la carpeta de la sesión— no destraba: ése era el defecto.
    fs.mkdirSync(path.join(workspace, 'planning'))
    fs.writeFileSync(path.join(workspace, 'planning', '.ops-approval'), `${path.join(workspace, '.env')}\n`)
    blocked('secrets-read', lee, /leerla/)
    pasteApproval(root, message)
    assert.doesNotThrow(() => execute('secrets-read', lee))

    // Gemini nombra la carpeta de la sesión con su propia variable.
    delete process.env.CLAUDE_PROJECT_DIR
    process.env.GEMINI_PROJECT_DIR = workspace
    assert.match(messageOf('secrets-read', leer(workspace, 'id_ed25519')),
      /pegando tal cual en acme-ops\/planning\/\.ops-approval estas líneas/)
    // Una sesión abierta en un proyecto hermano no tiene la instancia adentro: ahí va la ruta entera.
    delete process.env.GEMINI_PROJECT_DIR
    const api = path.join(workspace, 'api')
    fs.mkdirSync(api)
    assert.match(messageOf('secrets-read', leer(api, '.env')),
      new RegExp(`pegando tal cual en ${literal(path.join(root, 'planning', '.ops-approval'))} estas líneas`))
  } finally { restore() }

  // En embedded la sesión y la instancia son la misma carpeta, y el mensaje no cambia. Sin instancia no
  // hay aprobación que leer, y el mensaje dice la forma de siempre.
  delete process.env.OPS_ROOT
  delete process.env.CLAUDE_PROJECT_DIR
  delete process.env.GEMINI_PROJECT_DIR
  try {
    const embedded = planFirstRoot('ops-hook-embedded-aprueba-', WIP_CON_PLAN)
    assert.match(messageOf('secrets-read', leer(embedded, '.env')),
      /pegando tal cual en planning\/\.ops-approval estas líneas/)
    const suelto = tempRoot('ops-hook-sin-raiz-')
    assert.match(messageOf('secrets-read', leer(suelto, '.env')), /pegando tal cual en planning\/\.ops-approval estas/)
  } finally { restore() }
})

test('el hook de mensaje nunca frena ni imprime, reciba lo que reciba', () => {
  const { DIR } = require('../../engine/hooks/chat')
  const shim = path.resolve(__dirname, '..', '..', 'automatization', 'hooks', 'guard-chat.sh')
  const session = `prueba-${process.pid}-shim`
  for (const stdin of [JSON.stringify({ session_id: session, prompt_id: 'm1', prompt: 'hola' }), '{roto', '']) {
    const result = spawnSync('bash', [shim], { input: stdin, encoding: 'utf8' })
    assert.equal(result.status, 0, `con ${JSON.stringify(stdin)}: ${result.stderr}`)
    assert.equal(result.stdout, '', 'lo que imprime el hook de mensaje le llega al modelo como contexto')
  }
  assert.ok(fs.existsSync(path.join(DIR, `${session}.json`)), 'y con una entrada válida registra el mensaje')
  fs.rmSync(path.join(DIR, `${session}.json`), { force: true })
})

// Leer una credencial por shell, en cualquier runner (caso 104): lo que la muestra se frena, lo que sólo la
// nombra pasa, y lo que la persona pidió en el chat también.
test('secrets-shell frena leer una credencial por shell y deja pasar lo demás', () => {
  const root = planFirstRoot('ops-hook-lee-shell-', WIP_CON_PLAN)
  const corre = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of ['cat .env', 'head -3 ./.env', 'grep TOKEN .env', 'sed -n 1p .env', 'source .env',
    '. .env', 'wc -l < .env', 'cat id_ed25519 | base64', 'X=1 cat .env', 'echo $(cat .npmrc)',
    `node -e "console.log(require('node:fs').readFileSync('.env','utf8'))"`,
    `python3 -c "print(open('.env').read())"`,
    // Las dos formas con que un agente lo leyó en una sesión real, cuando el guard no las veía.
    'nl -ba .env', "rg -n KEY -g '.env*'", "grep -rn KEY --include='*.env' .",
    // El verbo se busca detrás de prefijos con sus banderas, con ruta, dentro de un subshell y entre tramos vacíos.
    'xargs -0 cat .env', '/bin/cat .env', '(cat .env)', 'true; ; cat .env']) {
    blocked('secrets-shell', corre(command), /lee .*credencial/)
  }
  for (const command of ['cat .env.example', 'ls -la .env', 'test -f .env', 'rm .env', 'cp .env.example .env',
    'git add .env.example', 'git commit -m "no leer el .env; cat .env"', 'grep -r TOKEN src', 'ls .env*',
    'cat *.md']) {
    assert.doesNotThrow(() => execute('secrets-shell', corre(command)), command)
  }
  assert.throws(() => executeAll(['pre-shell'], corre('cat .env')), /lee .*credencial/)
  // Sin chat queda la aprobación por archivo; con chat, pasa lo que la persona nombró.
  pasteApproval(root, messageOf('secrets-shell', corre('cat .env')))
  assert.doesNotThrow(() => execute('secrets-shell', corre('cat .env')))
  const chat = chatSession()
  try {
    const pidio = chat.says('mostrame qué hay en el .npmrc')
    assert.doesNotThrow(() => execute('secrets-shell', pidio(corre('cat .npmrc'))))
    blocked('secrets-shell', corre('cat .npmrc'), /lee .*credencial/)
  } finally { chat.close() }
})

// Publicar (casos 103 y 108). Una raíz sin git, así que las ramas vivas son `main` y `master`; la rama por
// defecto de un remoto se prueba aparte, con un repositorio de verdad.
function pushRoot(prefijo, runner = {}) {
  const root = tempRoot(prefijo)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush: false, ...runner } }))
  return root
}
const WORK = /publica cambios y requiere una acción humana/
const LIVE = /la rama viva/

test('un push que la persona ordena con su remoto y su rama pasa, y ningún otro', () => {
  const root = pushRoot('ops-hook-push-orden-')
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    const pidio = chat.says('Subí la rama: git push origin feat/x')
    assert.doesNotThrow(() => execute('destructive', push(pidio, 'git push origin feat/x')))
    blocked('destructive', push(pidio, 'git push origin feat/y'), WORK)
    blocked('destructive', push(pidio, 'git push upstream feat/x'), WORK)
    blocked('destructive', push(pidio, 'git push origin feat/x feat/y'), WORK)
    const conBandera = push(chat.says('subí feat/x a origin'), 'git push -u origin feat/x')
    assert.doesNotThrow(() => execute('destructive', conBandera))
    // Nombrar no es ordenar: sin verbo de publicar, con otro verbo, negado, o un nombre dentro de otro. Y el
    // basename no cuenta, que es por lo que esto no pasa por `mentions`.
    for (const [mensaje, command] of [
      ['Arreglá el login y no subas nada', 'git push origin feat/login'],
      ['revisá feat/x en origin', 'git push origin feat/x'],
      ['no subas feat/x a origin', 'git push origin feat/x'],
      // Con el verbo presente, lo único que frena es la negación.
      ['no hay que subir feat/x a origin', 'git push origin feat/x'],
      ["don't push feat/x to origin", 'git push origin feat/x'],
      ['¿qué tiene origin feat/x?', 'git push origin feat/x'],
      ['subí feat/xy a origin2', 'git push origin feat/x'],
    ]) blocked('destructive', push(chat.says(mensaje), command), WORK)
    // Sin persona no hay orden: un subagente, CI o el registro de otro mensaje.
    const orden = chat.says('subí feat/x a origin')
    blocked('destructive', push((extra) => orden({ ...extra, agent_id: 'sub' }), 'git push origin feat/x'),
      /desde un subagente/)
    blocked('destructive', push((extra) => orden({ ...extra, prompt_id: 'otro' }), 'git push origin feat/x'), WORK)
    process.env.CI = '1'
    try { blocked('destructive', push(orden, 'git push origin feat/x'), WORK) } finally { delete process.env.CI }
    // La orden no habilita el force, ni un push sin destino que comparar.
    blocked('destructive', push(chat.says('git push --force origin feat/x'), 'git push --force origin feat/x'),
      /R8 lo prohíbe/)
    blocked('destructive', push(chat.says('pusheá'), 'git push'), /nombralos/)
  } finally { chat.close() }
})

test('un «dale» a un push frenado aprueba ese push y ningún otro', () => {
  const root = pushRoot('ops-hook-push-dale-')
  const push = (call, command) => call({ cwd: root, tool_input: { command } })
  const chat = chatSession()
  try {
    const frenado = messageOf('destructive', push(chat.says('subí la rama'), 'git push origin feat/x'))
    assert.match(frenado, /si contesta «dale», reintentá el mismo push/)
    assert.match(frenado, /\n {2}push origin feat\/x\n/)
    const dale = chat.says('dale')
    assert.doesNotThrow(() => execute('destructive', push(dale, 'git push origin feat/x')))
    blocked('destructive', push(dale, 'git push origin feat/y'), WORK)
    // Un push sin destino que resolver también queda pendiente: no hay línea que aprobar, pero sí «dale».
    messageOf('destructive', push(chat.says('pusheá'), 'git push'))
    assert.doesNotThrow(() => execute('destructive', push(chat.says('dale'), 'git push')))
  } finally { chat.close() }
})

test('.ops-approval aprueba un push por su línea exacta, sin patrones', () => {
  const root = pushRoot('ops-hook-push-archivo-')
  const push = (command) => ({ cwd: root, tool_input: { command } })
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'),
    'push origin feat/x\npush origin main\npush origin feat/*\ngit push\n')
  assert.doesNotThrow(() => execute('destructive', push('git push origin feat/x')))
  blocked('destructive', push('git push origin feat/y'), WORK)
  // La línea exacta alcanza la rama viva: la escribe una persona a mano, y el agente no puede.
  assert.doesNotThrow(() => execute('destructive', push('git push origin main')))
  blocked('destructive', push('git push origin master'), LIVE)
  // Una línea sin destino sería un permiso para cualquier rama.
  blocked('destructive', push('git push'), /nombralos/)
})

test('allowPush no alcanza la rama viva sin su permiso, ni a un subagente con ningún permiso', () => {
  const root = pushRoot('ops-hook-push-viva-', { allowPush: true })
  const push = (command, extra = {}) => ({ cwd: root, tool_input: { command }, ...extra })
  const declara = (runner) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner }))
  assert.doesNotThrow(() => execute('destructive', push('git push origin feat/x')))
  for (const command of ['git push origin main', 'git push origin master', 'git push origin HEAD:main',
    'git push origin :main', 'git push origin --delete main', 'git push --all origin',
    'git push origin feat/x refs/heads/main']) {
    blocked('destructive', push(command), LIVE)
  }
  const frenado = messageOf('destructive', push('git push origin main'))
  assert.match(frenado, /runner\.pushToLiveBranches/)
  assert.match(frenado, /\n {2}push origin main\n/)
  blocked('destructive', push('git push origin feat/x', { agent_id: 'sub' }), /desde un subagente/)

  // Nombrada, la rama viva queda como una de trabajo: la alcanza la llave, y la otra sigue afuera.
  declara({ allowPush: true, pushToLiveBranches: ['main'] })
  assert.doesNotThrow(() => execute('destructive', push('git push origin main')))
  blocked('destructive', push('git push origin master'), LIVE)
  blocked('destructive', push('git push origin main', { agent_id: 'sub' }), /desde un subagente/)
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'push origin feat/x\n')
  blocked('destructive', push('git push origin feat/x', { agent_id: 'sub' }), /desde un subagente/)
  fs.rmSync(path.join(root, 'planning', '.ops-approval'))

  // La orden del chat sola tampoco la alcanza; con la rama nombrada, sí.
  const chat = chatSession()
  try {
    declara({ allowPush: false })
    blocked('destructive', chat.says('subí main a origin')(push('git push origin main')), LIVE)
    declara({ allowPush: false, pushToLiveBranches: ['main'] })
    assert.doesNotThrow(() => execute('destructive', chat.says('subí main a origin')(push('git push origin main'))))
  } finally { chat.close() }
})

test('la rama por defecto del remoto es viva, y un push sin argumentos se resuelve por su upstream', () => {
  const base = tempRoot('ops-hook-push-git-')
  git(['init', '-q', '--bare', '-b', 'develop', 'remote.git'], base)
  const root = path.join(base, 'work')
  git(['clone', '-q', 'remote.git', 'work'], base)
  git(['config', 'user.email', 'prueba@ejemplo'], root)
  git(['config', 'user.name', 'Prueba'], root)
  git(['commit', '-q', '--allow-empty', '-m', 'x'], root)
  // Publicar de verdad, contra un remoto que es un directorio del banco: es lo que deja el upstream puesto.
  git(['push', '-q', '-u', 'origin', 'HEAD:develop'], root)
  git(['remote', 'set-head', 'origin', 'develop'], root)
  git(['switch', '-q', '-c', 'feat/x'], root)
  git(['push', '-q', '-u', 'origin', 'feat/x'], root)
  fs.mkdirSync(path.join(root, 'planning'))
  const declara = (allowPush) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush } }))
  declara(true)
  const push = (command, call = (one) => one) => call({ cwd: root, tool_input: { command } })

  blocked('destructive', push('git push origin develop'), /develop, la rama viva/)
  assert.doesNotThrow(() => execute('destructive', push('git push')), 'en feat/x publica en origin feat/x')
  assert.doesNotThrow(() => execute('destructive', push('git push origin')))
  git(['switch', '-q', 'develop'], root)
  blocked('destructive', push('git push'), /develop, la rama viva/)
  blocked('destructive', push('git push origin HEAD'), /develop, la rama viva/)

  git(['switch', '-q', 'feat/x'], root)
  declara(false)
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive', push('git push', chat.says('subí feat/x a origin'))))
    blocked('destructive', push('git push', chat.says('subí feat/y a origin')), WORK)
  } finally { chat.close() }
})
