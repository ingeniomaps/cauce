'use strict'

// Qué frenan los guards de git y qué dejan pasar cuando el comando trae banderas, varios comandos encadenados
// o texto entre comillas.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, publishedRepo } = require('../support/hooks-harness')

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

// Un `cd` en una subcapa o en un `$(…)` que ya cerró no mueve al comando de después: tomarlo hacía que el `git add -A`
// del repositorio de la sesión se leyera como de otro, y dejaba de frenar (regresión hallada al cerrar el caso 540).
test('un cd en una subcapa cerrada no saca al git add del repositorio de la sesión', () => {
  const root = tempRoot('cauce-git-add-subcapa-')
  initRepo(root)
  const other = tempRoot('cauce-git-add-otro-')
  initRepo(other)
  const saved = process.env.CLAUDE_PROJECT_DIR
  process.env.CLAUDE_PROJECT_DIR = root
  try {
    for (const command of [`(cd ${other} && ls); git add -A`, `x=$(cd ${other} && pwd); git add -A`]) {
      blocked('git-add', { cwd: root, tool_input: { command } }, /Stagea rutas explícitas/)
    }
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = saved
  }
})

// Caso 067: `git commit -m "x"` seguido de `ls -a` en otra línea no es stagear al commitear. El porqué del
// corte está en `SAME_COMMAND` de `engine/hooks/quoting.js`.
//
// Se mide en las dos direcciones a propósito. Sólo lo primero pasaría con las reglas apagadas, y sólo lo
// segundo pasaría con el `[^;&|]` de antes: es el par lo que fija el corte donde va.
test('un guard no cruza el salto de línea, que también separa comandos', () => {
  const twoLines = (first, second) => ({ tool_input: { command: `${first}\n${second}` } })

  // Sigue bloqueando lo que le toca, escrito en una sola línea.
  blocked('git-add', { tool_input: { command: 'git commit -am "x"' } }, /stagea al commitear/)
  blocked('destructive', { tool_input: { command: 'git push --force origin main' } }, /reescribe historia/)
  blocked('dependencies', { tool_input: { command: 'npm install -g cosa' } }, /acción humana/)

  // Y deja pasar lo que vive en la línea de abajo y no es asunto suyo.
  assert.doesNotThrow(() => execute('git-add', twoLines('git commit -q -m "x"', 'set -a; . ./.env; set +a')))
  assert.doesNotThrow(() => execute('git-add', twoLines('git commit -m "x"', 'ls -a')))
  assert.doesNotThrow(() => execute('git-add', twoLines('git add uno.js', 'ls .')))
  assert.doesNotThrow(() => execute('dependencies', twoLines('npm install', 'grep -g x archivo')))

  // El push de la línea de arriba sigue frenado, pero por lo que de verdad es: publicar pide una acción
  // humana (R10). Lo que dejó de decir es que fuera un force push.
  const push = twoLines('git push origin main', 'rm -f /tmp/x.log')
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

// Un comando seguido de otra línea, con heredoc y sin él; el defecto, sobre EVERY_ARG en `shell-writes.js`.
// Se asercia **qué destino lee**, no si pasa: con la clase vieja la variante sin heredoc pasaba igual.
test('el salto de línea termina la lista de argumentos de un comando', () => {
  const root = tempRoot('ops-hook-salto-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'api'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'api', path: 'api' }] }))
  const entry = (command) => ({ cwd: root, tool_input: { command } })
  const outside = path.join(os.homedir(), 'afuera', 'x')

  // Las dos formas de segunda línea, con heredoc y sin él, contra las tres familias que leen argumentos:
  // la que toma el último (`cp`), la que toma todos (`tee`) y la que exige `-i` (`sed`). Cambiar una
  // sola y probar una sola deja las otras dos leyendo la línea de abajo.
  // El intérprete va con ruta absoluta a propósito: si el token de la segunda línea resolviera adentro
  // de la raíz, leerlo mal no bloquearía y el caso pasaría con el defecto puesto.
  for (const second of ["/usr/bin/python3 - <<'PY'\nprint(1)\nPY", '/usr/bin/python3 -c "print(1)"']) {
    for (const first of ['cp /etc/hostname api/h', 'printf x | tee api/log', "sed -i 's/a/b/' api/f"]) {
      assert.doesNotThrow(() => execute('shell-boundary', entry(`${first}\n${second}`)),
        `acusó una escritura que no está en el comando: ${first}`)
    }
  }

  // Y la dirección contraria, que es la que se rompe si uno corta de más: un destino real de la primera
  // línea se sigue viendo aunque haya otra línea debajo.
  blocked('shell-boundary', entry(`cp /etc/hostname ${outside}\npython3 -c "print(1)"`), /fuera de las raíces/)
  blocked('shell-boundary', entry(`echo hola\ncp /etc/hostname ${outside}`), /fuera de las raíces/)
})

// Se cruzan todas las reglas contra todas las formas, y no una contra una, porque lo que falló no fue
// un patrón sino que cada uno resolvía la posición por su cuenta —el porqué, en `withoutGitGlobals`—.
// Con una sola pareja, el próximo patrón que se escriba pegado vuelve a entrar sin que nada lo note.
test('una opción global de git no desactiva la regla que mira el subcomando', () => {
  // La lista es la de `git --help` entera y no una muestra: una opción que el patrón nombra y ningún
  // caso ejercita se puede borrar sin que nada se ponga rojo —comprobado sacando `--bare` y
  // `--no-replace-objects`, que pasaba en verde—, y entonces no está cubierta, está escrita.
  const GLOBALS = [
    '-C .', '-c core.pager=cat', '-p', '-P', '--paginate', '--no-pager',
    '--git-dir /tmp/.git', '--git-dir=/tmp/.git', '--work-tree /tmp', '--work-tree=/tmp',
    '--namespace ns', '--namespace=ns', '--config-env=k=V', '--exec-path=/usr/lib/git-core',
    '--no-replace-objects', '--bare', '--no-optional-locks',
    '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs',
    '-c a=b -C .',
  ]
  const forms = (command) => [command, ...GLOBALS.map((one) => command.replace('git ', `git ${one} `))]
  const rules = [
    ['git-add', 'git add -A', /está prohibido/],
    ['destructive', 'git push origin main --force', /reescribe historia ya publicada/],
    ['destructive', 'git push origin main', /publica cambios/],
    ['destructive', 'git reset --hard HEAD', /destruye cambios locales/],
    // El amend va sobre historia publicada: sin ella no hay bloqueo que las opciones globales desactiven.
    ['destructive', 'git commit --amend -m x', /publicad/, publishedRepo('ops-amend-globals-')],
    ['destructive', 'git clean -fd', /sin seguimiento/],
    ['destructive', 'git checkout -- .', /no sólo lo que estás mirando/],
  ]
  for (const [guard, command, reason, cwd] of rules) {
    for (const form of forms(command)) {
      blocked(guard, { ...(cwd ? { cwd } : {}), tool_input: { command: form } }, reason)
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

// Cada ortografía de `commit -a`, también con la bandera después del mensaje. Por qué la frena `git-add` y
// no el guard que lee el índice está en `engine/hooks/input.js`.
test('git-add frena `commit -a`, que es stagear todo con otra ortografía', () => {
  for (const command of ['git commit -a -m sonda', 'git commit -am sonda', 'git commit --all -m sonda',
    'git -C . commit -am sonda', 'git commit -v -a -m sonda', 'git commit -aF m',
    'git commit -m "v$(date)" -a', 'git commit -m "$(cat m)" --all']) {
    blocked('git-add', { tool_input: { command } }, /stagea al commitear/)
  }
  // El valor pegado de otra bandera no es un `-a` (caso 477).
  for (const command of ['git commit -mUpdate', 'git commit -Fmessage.txt', 'git commit -Salice -m x',
    'git commit -Cmain', 'git commit -tTemplate.md', 'git commit -m x -Tag']) {
    assert.doesNotThrow(() => execute('git-add', { tool_input: { command } }), command)
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
