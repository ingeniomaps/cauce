'use strict'

// Qué frena el guard que cuida lo que se pierde y lo que se publica, y qué deja pasar.

const { tempRoot } = require('../support/environment')
const { blocked, git, chatSession } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, guards } = require('../../engine/hooks/run')

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

// Hasta 0.83.0 estas reglas no tenían ninguna salida —ni variable, ni línea en el archivo, ni «dale»—, así
// que `docker compose down` pedido con todas las letras se frenaba igual que si lo hubiera decidido el
// agente (caso 117). Las de R8 no entran acá: reescribir historia publicada y `rm -r` sobre la raíz o el
// home siguen sin salida, y por qué está escrito en `destructive`.
test('destructive deja pasar lo que la persona pidió, y sigue cerrado en lo que R8 prohíbe', () => {
  const corre = (command) => ({ tool_input: { command } })
  const chat = chatSession()
  try {
    for (const [command, motivo] of [
      ['git reset --hard', /destruye cambios locales/],
      ['git clean -fd', /borra archivos sin seguimiento/],
      ['docker compose down', /stack Compose/],
      ['docker system prune', /limpieza global de Docker/],
      ['git restore .', /no sólo lo que estás mirando/],
    ]) {
      // Sin nadie que lo haya pedido se frena como siempre: lo que cambia es que ahora hay salida.
      blocked('destructive', corre(command), motivo)
      assert.doesNotThrow(() => execute('destructive', chat.says(`corré ${command}`)(corre(command))), command)
    }
  } finally { chat.close() }

  // Los negativos van en una sesión nueva y no es cosmético: lo que un guard deja pasar queda concedido y
  // se hereda (caso 116), así que en la sesión de arriba `git reset --hard` ya estaría autorizado y esta
  // prueba pasaría diga lo que diga el guard. Es el mismo recaudo que toma la prueba del 118.
  const otra = chatSession()
  try {
    // Nombrarlo sin pedirlo no autoriza, igual que en el resto de los guards (caso 109).
    blocked('destructive', otra.says('¿qué hace git reset --hard?')(corre('git reset --hard')),
      /destruye cambios locales/)
    // Y lo que R8 prohíbe no se abre ni pidiéndolo: son las dos ramas que el comentario de arriba exceptúa.
    blocked('destructive', otra.says('corré git push --force origin main')(corre('git push --force origin main')),
      /reescribe historia ya publicada/)
    blocked('destructive', otra.says('corré git commit --amend')(corre('git commit --amend')),
      /reescribe un commit ya creado/)
    blocked('destructive', otra.says('corré rm -rf /')(corre('rm -rf /')), /catastrófico/)
  } finally { otra.close() }
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
