'use strict'

// Qué frena el guard que cuida lo que se pierde y lo que se publica, y qué deja pasar.

const { tempRoot, linkEngine } = require('../support/environment')
const { blocked, git, initRepo, publishedRepo, chatSession } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, guards } = require('../../engine/hooks/run')

// R23 nombra la raíz, el home y el directorio padre, y la regla los reconocía sólo desnudos: con una
// comilla, con llaves, con `--` delante o con una barra al final, el mismo destino pasaba (caso 167). Por
// qué las comillas pesan más, en `engine/hooks/shell.js`.
//
// La segunda mitad es la que impide cerrarlo frenando todo: un borrado con destino concreto es trabajo
// corriente y tiene que seguir pasando, también entrecomillado.
test('el destino catastrófico se reconoce entrecomillado, con llaves y con barra final', () => {
  for (const command of [
    'rm -rf /', 'rm -rf "/"', "rm -rf '/'", 'rm -rf ~', 'rm -rf ~/',
    'rm -rf $HOME', 'rm -rf "$HOME"', 'rm -rf ${HOME}', 'rm -rf $HOME/',
    'rm -rf -- /', 'rm -rf ..', 'rm -rf "..";',
  ]) {
    blocked('destructive', { cwd: '/tmp', tool_input: { command } }, /catastrófico/)
  }

  for (const command of [
    'rm -rf ./dist', 'rm -rf node_modules', 'rm -rf /tmp/banco-123',
    'rm -rf "$HOME/proyecto/dist"', 'rm -rf ../otro/dist', 'rm -rf "$PWD/out"',
  ]) {
    assert.doesNotThrow(() => execute('destructive', { cwd: '/tmp', tool_input: { command } }), command)
  }
})

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
  // Y la forma estrecha pasa: un archivo nombrado, o cambiar de rama.
  for (const narrow of ['git checkout -- src/main.js', 'git restore src/a.js', 'git checkout main']) {
    assert.doesNotThrow(() => execute('destructive', { tool_input: { command: narrow } }), narrow)
  }
})

// Hasta 0.83.0 estas reglas no tenían ninguna salida —ni variable, ni línea en el archivo, ni «dale»—, así
// que `docker compose down` pedido con todas las letras se frenaba igual que si lo hubiera decidido el
// agente (caso 117). Las de R8 no entran acá: reescribir historia publicada y `rm -r` sobre la raíz o el
// home siguen sin salida, y por qué está escrito en `destructive`.
test('destructive deja pasar lo que la persona pidió, y sigue cerrado en lo que R8 prohíbe', () => {
  const runs = (command) => ({ tool_input: { command } })
  const published = publishedRepo('ops-amend-cerrado-')
  const chat = chatSession()
  try {
    for (const [command, reason] of [
      ['git reset --hard', /destruye cambios locales/],
      ['git clean -fd', /borra archivos sin seguimiento/],
      ['docker compose down', /stack Compose/],
      ['docker system prune', /limpieza global de Docker/],
      ['git restore .', /no sólo lo que estás mirando/],
    ]) {
      // Sin nadie que lo haya pedido se frena como siempre: lo que cambia es que ahora hay salida.
      blocked('destructive', runs(command), reason)
      assert.doesNotThrow(() => execute('destructive', chat.says(`corré ${command}`)(runs(command))), command)
    }
  } finally { chat.close() }

  // Los negativos van en una sesión nueva y no es cosmético: lo que un guard deja pasar queda concedido y
  // se hereda (caso 116), así que en la sesión de arriba `git reset --hard` ya estaría autorizado y esta
  // prueba pasaría diga lo que diga el guard. Es el mismo recaudo que toma la prueba del 118.
  const other = chatSession()
  try {
    // Nombrarlo sin pedirlo no autoriza, igual que en el resto de los guards (caso 109).
    blocked('destructive', other.says('¿qué hace git reset --hard?')(runs('git reset --hard')),
      /destruye cambios locales/)
    // Y lo que R8 prohíbe no se abre ni pidiéndolo: son las dos ramas que el comentario de arriba exceptúa.
    blocked('destructive', other.says('corré git push --force origin main')(runs('git push --force origin main')),
      /reescribe historia ya publicada/)
    // El amend se mide sobre historia **publicada**, que es donde R8 lo prohíbe: sin publicar no hay nada
    // que abrir porque no está cerrado. Por qué la distinción existe vive junto a la regla.
    blocked('destructive',
      { ...other.says('corré git commit --amend')(runs('git commit --amend')), cwd: published },
      /publicad/)
    blocked('destructive', other.says('corré rm -rf /')(runs('rm -rf /')), /catastrófico/)
  } finally { other.close() }
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
  process.env.OPS_ROOT = root
  const stopped = (session) => {
    try { fs.unlinkSync(path.join(os.tmpdir(), `cauce-drift-${session}`)) } catch { /* ya limpio */ }
    try { execute('planning-drift', { cwd: root, session_id: session }) } catch (error) { return error.message }
    return ''
  }
  try {
    // Sin el motor instalado lo que falla no es planning: se dice, y sin consejos para repararlo.
    const unbuilt = stopped('prueba-motor')
    assert.match(unbuilt, /quedaron desalineados:\nNo se encontró el motor de Cauce/)
    assert.doesNotMatch(unbuilt, /se repara sólo/)
    linkEngine(root)
    // Una épica que el parser no lee: el planning deja de estar sano y el cierre tiene que decirlo. Tampoco
    // lleva el consejo: no es una entrada de `done/`.
    fs.writeFileSync(path.join(root, 'planning', 'roadmap', 'epic-001.md'), '---\nepic: 001\n---\n')
    const epic = stopped('prueba-epica')
    assert.match(epic, /quedaron desalineados:\n[^]*epic-001[^]*error\(es\)/)
    assert.doesNotMatch(epic, /se repara sólo/)
    // Con una entrada de `done/` en rojo, después de la salida de `check` va qué se puede tocar y qué no, y
    // dónde anotarlo, con la ruta entera: en sidecar la sesión no está parada en la instancia (caso 322).
    fs.writeFileSync(path.join(root, 'planning', 'done', 'vieja.md'), '- [x] **vieja** — Vieja\n  acept: x\n')
    const said = stopped('prueba-drift')
    assert.match(said, /✗ done\/vieja\.md[^]*error\(es\)[^]*\nUna entrada de done\/ se repara sólo en lo que se/)
    assert.match(said, /lo que no entra en el formato se mueve dentro de la entrada, no se borra/)
    assert.match(said, /no se cambia ni se completa para que esto pase\. Si el error pide eso, dejalo como está/)
    assert.ok(said.endsWith(`anotalo en ${path.join(root, 'planning', 'human')} como una acción más.`))
    // La segunda vez no repite: el marcador de sesión existe y deja cerrar.
    assert.doesNotThrow(() => execute('planning-drift', { cwd: root, session_id: 'prueba-drift' }))
  } finally {
    delete process.env.OPS_ROOT
    for (const session of ['prueba-drift', 'prueba-motor', 'prueba-epica']) {
      try { fs.unlinkSync(path.join(os.tmpdir(), `cauce-drift-${session}`)) } catch { /* ya limpio */ }
    }
  }
})

test('guard-destructive respeta runner.allowPush del proyecto', () => {
  const root = tempRoot('ops-hook-push-')
  fs.mkdirSync(path.join(root, 'planning'))
  const declares = (allowPush) => fs.writeFileSync(
    path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush } }),
  )
  const push = { cwd: root, tool_input: { command: 'git push origin feat/x' } }

  declares(false)
  blocked('destructive', push, /publica cambios/)
  declares(true)
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
  const input = (command) => ({ cwd: root, tool_input: { command } })
  const document = (body) => `cat > nota.md <<'FIN'\n${body}\nFIN`

  for (const [guard, body] of [
    ['destructive', 'Este documento explica por qué rm -rf / es catastrófico.'],
    ['destructive', 'Y por qué no se hace git push --force, ni git reset --hard.'],
    ['git-add', 'Ni stagear con git add ., que exige rutas explícitas.'],
  ]) {
    assert.doesNotThrow(() => execute(guard, input(document(body))), `frenó un documento: ${body}`)
  }

  // La apertura no se toca: sigue siendo comando y su destino se sigue mirando.
  blocked('shell-boundary', input(document('hola').replace('nota.md', path.join(os.homedir(), 'x'))),
    /fuera de las raíces/)
  // La redirección escrita *después* del delimitador también sobrevive; por qué, en `commandOf`
  // (`engine/hooks/input.js`).
  blocked('shell-boundary', input(`cat <<FIN > ${path.join(os.homedir(), 'y')}\nhola\nFIN`),
    /fuera de las raíces/)
  // Y lo que va después del cierre tampoco: el recorte se lleva el cuerpo, no el resto del comando.
  blocked('destructive', input(`${document('hola')}\nrm -rf /`), /catastrófico/)
  // El cuerpo que corre un shell tampoco se lee acá como líneas sueltas: su `cd` no mueve lo de después (caso 456).
  blocked('destructive', input("bash <<'FIN'\ncd /tmp/borrador\nFIN\nrm -rf ."), /directorio actual/)
  // `<<<` no abre un heredoc, y `|&` también le pasa la salida a un shell.
  blocked('destructive', input('bash <<< X\nrm -rf ~\nX'), /catastrófico/)
  blocked('destructive', input("echo 'rm -rf ~' |& sh"), /catastrófico/)
})

test('guard-destructive reconoce el comando aunque venga envuelto, y sólo ése', () => {
  const runs = (command) => execute('destructive', { tool_input: { command } })

  for (const [command, reason] of [
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
    blocked('destructive', { tool_input: { command } }, reason)
  }

  // La otra mitad, que es la que decide si el guard sobrevive a su primera semana: lo que sigue a `-- ` es
  // un archivo nombrado, que la regla no toca desde siempre (por qué, en `engine/hooks/shell.js`).
  for (const command of [
    'rm -rf /srv/cache', 'rm -r build/cache', 'rm -rf ./tmp', 'rm archivo.txt',
    'git checkout -- src/app.js', 'git checkout rama-nueva', 'git restore src/app.js',
    'echo mkfsdocs', 'cat informe-shredder.md', 'docker compose up -d',
  ]) {
    assert.doesNotThrow(() => runs(command), `frenó lo corriente: ${command}`)
  }
})

test('guard-destructive separa publicar de reescribir historia', () => {
  const root = tempRoot('ops-hook-force-')
  fs.mkdirSync(path.join(root, 'planning'))
  const config = (allowPush) => fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'demo', mode: 'sidecar', workspaceRoots: [{ name: 'main', path: '.' }], runner: { allowPush },
  }))
  const input = (command) => ({ cwd: root, tool_input: { command } })

  config(true)
  assert.doesNotThrow(() => execute('destructive', input('git push origin rama')), 'la llave sigue habilitando')
  for (const form of ['--force', '--force-with-lease', '-f']) {
    blocked('destructive', input(`git push ${form} origin main`), /reescribe historia ya publicada/)
  }
  // El `+` del refspec es el mismo force, y con la llave prendida pasaba como un push normal.
  blocked('destructive', input('git push origin +rama'), /reescribe historia ya publicada/)
  blocked('destructive', input('git push origin +HEAD:rama'), /reescribe historia ya publicada/)
  blocked('destructive',
    { ...input('git commit --amend -m x'), cwd: publishedRepo('ops-amend-forma-') }, /publicad/)

  // Ni una bandera que apenas se le parece ni un commit corriente: el permiso lo decide la forma, no la
  // palabra suelta.
  assert.doesNotThrow(() => execute('destructive', input('git push --set-upstream origin rama')))
  assert.doesNotThrow(() => execute('destructive', input('git commit --fixup abc1234')))

  // Y con la llave apagada el force cae por su propia rama, no por la de publicación: el mensaje es lo
  // único que le dice a quien lo recibe que prender `allowPush` no lo va a desbloquear.
  config(false)
  blocked('destructive', input('git push --force origin main'), /R8 lo prohíbe y runner.allowPush no lo/)
})

// Los dos lados del perdón en una sola corrida, que es lo único que lo distingue de haber ablandado el
// guard: tres mensajes que nombran comandos y tres comandos que de verdad los ejecutan. `destructive`
// dice por qué el perdón llega hasta ahí.
test('guard-destructive lee el mensaje de un commit como dato y el resto como comando', () => {
  const runs = (command) => execute('destructive', { tool_input: { command } })

  assert.doesNotThrow(() => runs('git commit -m "fix: bloquear git push --force"'))
  assert.doesNotThrow(() => runs('git commit -m "docs: no corras rm -rf / nunca"'))
  assert.doesNotThrow(() => runs('git commit -m "chore: dejar de usar git reset --hard"'))

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
  const bounded = { file_path: 'migrations/003_fix.sql', content: 'DELETE FROM users WHERE id = 1;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: bounded }))
  const rename = { file_path: 'migrations/003_ren.sql', content: 'ALTER TABLE users RENAME COLUMN a TO b;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: rename }))
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

// Un `--amend` sobre un commit que nadie vio es la corrección, no el daño. Por qué se mira el remoto, junto
// a la regla en `engine/hooks/shell.js`.
//
// Se miden los dos lados: sin la primera el guard frena una corrección legítima y la salida real pasa a ser
// `reset --soft`, que consigue lo mismo y no lo nombra; sin la segunda, el amend abriría la puerta que el
// force-push tiene cerrada.
test('el amend se frena sobre historia publicada y no sobre la que nadie vio', () => {
  const root = tempRoot('ops-amend-')
  initRepo(root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'uno\n')
  git(['add', 'a.txt'], root)
  git(['commit', '-qm', 'uno'], root)
  const input = { cwd: root, tool_input: { command: 'git commit --amend' } }

  // Sin remoto: nadie lo vio, así que corregirlo es corregirlo.
  assert.doesNotThrow(() => execute('destructive', input),
    'frenó un amend sobre un commit que no salió de esta máquina')

  // Con el commit alcanzable desde un remoto: ahí sí es reescribir lo que otro leyó.
  const remote = tempRoot('ops-amend-remoto-')
  git(['init', '-q', '--bare'], remote)
  git(['remote', 'add', 'origin', remote], root)
  git(['push', '-q', 'origin', 'HEAD'], root)
  git(['fetch', '-q', 'origin'], root)
  blocked('destructive', input, /publicad/)

  // Y donde no hay con qué saber, cerrado por defecto (R27; por qué, en `engine/hooks/shell.js`). Ésta es la mitad que
  // se abre sola si nadie la mide — un guard que falla hacia el «pasá» deja de proteger sin que nada lo diga.
  blocked('destructive', { cwd: tempRoot('ops-amend-sin-git-'), tool_input: { command: 'git commit --amend' } },
    /publicad/)
})

// `rm -r` sobre el directorio actual, y sobre un destino que no se puede resolver, son las dos formas que
// R23 nombra como el desastre canónico —`cd $X && rm -rf .` con `X` vacío borra donde estabas— y las dos
// pasaban: la regla miraba `/`, `~`, `$HOME` y `..` escritos, no el destino resuelto (caso 337). La raíz
// ops y las raíces declaradas también cuentan, nombradas enteras o por un ancestro.
test('rm -r sobre el directorio actual, la instancia o un cd que no se resuelve se frena por el destino', () => {
  const root = tempRoot('ops-hook-rm-cwd-')
  fs.mkdirSync(path.join(root, 'ops', 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'apps', 'api'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops', 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'api', path: '../apps/api' }], runner: {} }))
  const before = process.env.OPS_ROOT
  process.env.OPS_ROOT = path.join(root, 'ops')
  try {
    for (const command of [
      'rm -rf .', 'rm -rf ./', 'rm -rf -- .', 'rm -rf "."', 'cd $X && rm -rf .', 'cd "$DIR" && rm -rf ./',
      'cd apps && rm -rf ..', `rm -rf ${root}`, `rm -rf ${path.join(root, 'ops')}`,
      `rm -rf ${path.join(root, 'apps', 'api')}`,
      `rm -rf ${path.dirname(root)}`, 'rm -rf apps/api', 'rm -rf ops/',
    ]) {
      blocked('destructive', { cwd: root, tool_input: { command } },
        /destino resuelto|carpeta personal|catastrófico/)
    }
    for (const command of [
      'rm -rf dist', 'rm -rf ./node_modules', 'rm -rf apps/api/dist', 'cd apps/api && rm -rf build',
      'cd $(mktemp -d) && rm -rf .', 'rm -rf /tmp/banco-123', 'rm dist/x.js', 'rm -r -- apps/web',
    ]) {
      assert.doesNotThrow(() => execute('destructive', { cwd: root, tool_input: { command } }), command)
    }
  } finally {
    if (before === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = before
  }
})

// Lo que la revisión del conjunto encontró en el 337: un prefijo o un subshell saltaban la regla del destino
// resuelto —`sudo rm -rf .`—, un glob vaciaba el cwd sin nombrarlo —`rm -rf *`—, y un `cd` a una variable
// frenaba cualquier borrado relativo después, aunque fuera una subcarpeta inocua.
test('la regla del destino resuelto ve prefijos y globs, y el cd sin resolver frena sólo al borrar el árbol', () => {
  const root = tempRoot('ops-hook-rm-formas-')
  for (const command of ['sudo rm -rf .', '(rm -rf .)', 'time rm -rf .', 'X=1 rm -rf .', 'rm -rf ./*', 'rm -rf *',
    'rm --recursive -f .',
    'cd $X && rm -rf .', 'cd $X && rm -rf ./*', 'cd "$DIR" && rm -rf ..',
    // Cada envoltorio que conoce `shell-wrappers.js`, con sus banderas y valores: la lista propia de este guard
    // tenía ocho y dejaba pasar el resto.
    'setsid rm -rf .', 'doas rm -rf .', 'stdbuf -oL rm -rf .', 'taskset 1 rm -rf .', 'ionice -c 3 rm -rf .',
    'sudo -u nobody rm -rf .', 'env -u HOME rm -rf .']) {
    blocked('destructive', { cwd: root, tool_input: { command } }, /destino resuelto|carpeta personal|catastrófico/)
  }
  for (const command of ['cd "$DIR" && rm -rf node_modules', 'cd $X && cd /tmp/zz && rm -rf build', 'cd ~ && rm -rf x',
    'cd $X && rm -rf ~/scratch/x', 'rm -rf dist/*', 'sudo rm -rf ./dist']) {
    assert.doesNotThrow(() => execute('destructive', { cwd: root, tool_input: { command } }), command)
  }
})

// Caso 452. La regla de `git clean` miraba sólo la primera opción: `-d -f` borraba sin preguntar, y una simulación
// con `-n` en el mismo racimo —`-fdn`, que no borra nada— se frenaba.
test('git clean se frena si no simula, en cualquier opción, y no si sólo simula', () => {
  for (const command of ['git clean -d -f', 'git clean -x -f', 'git clean -df', 'git clean --force', 'git clean -fd',
    'git -C app clean -d --force', 'git clean --forc -dx', 'git clean -dx', 'git clean -fdx -einit',
    'git -c clean.requireForce=false clean -dx', 'git clean -fdi']) {
    blocked('destructive', { tool_input: { command } }, /borra archivos sin seguimiento/)
  }
  for (const command of ['git clean -fdn', 'git clean -n -fd', 'git clean -fd --dry-run', 'git clean -nd',
    'git clean -e fixtures -n', 'git clean --dry -fd']) {
    assert.doesNotThrow(() => execute('destructive', { tool_input: { command } }), command)
  }
})

// Caso 528.
test('el borrado de disco frena también con el binario escrito por ruta', () => {
  const forms = ['/sbin/mkfs.ext4 /dev/sdb', '/usr/bin/shred -u secreto.txt', 'sudo /usr/sbin/mkfs -t ext4 /dev/sdb']
  for (const command of forms) {
    blocked('destructive', { cwd: '/tmp', tool_input: { command } }, /disco o dispositivo/)
  }
  assert.doesNotThrow(() => execute('destructive', { cwd: '/tmp', tool_input: { command: 'cat docs/mkfs.md' } }))
})
