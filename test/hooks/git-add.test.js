'use strict'

// Cómo se lee un comando de git: dónde empieza una palabra, dónde termina un comando, y qué
// parte de su texto es dato y no orden.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, repoPublicado } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute, guards } = require('../../engine/hooks/run')

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

test('guard-governance bloquea commits con reglas staged', () => {
  const root = tempRoot('ops-hook-gov-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'planning', 'PROTOCOL.md'), '# protocol\n')
  git(['add', 'planning/PROTOCOL.md'], root)
  blocked('governance', { cwd: root, tool_input: { command: 'git commit -m test' } }, /gobernanza protegida/)
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
    // El amend se mide sobre historia publicada, que es donde la regla aplica: sin publicar no hay
    // bloqueo que las opciones globales puedan desactivar. Por qué, junto a la regla en `shell.js`.
    ['destructive', 'git commit --amend -m x', /publicad/, repoPublicado('ops-amend-globals-')],
    ['destructive', 'git clean -fd', /sin seguimiento/],
    ['destructive', 'git checkout -- .', /no sólo lo que estás mirando/],
  ]
  for (const [guard, command, motivo, cwd] of rules) {
    for (const form of forms(command)) {
      blocked(guard, { ...(cwd ? { cwd } : {}), tool_input: { command: form } }, motivo)
    }
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
