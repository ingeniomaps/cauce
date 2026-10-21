'use strict'

// `secrets-shell`: qué lee y qué escribe un comando de shell cuando lo que toca es una credencial, y cuándo lo pedido
// en el chat lo deja pasar. Salió de `chat-effects.test.js` cuando ésta pasó las 500 líneas: es un guard con sus
// propias pruebas, y lo que comparte con aquélla es sólo el ayudante del chat.

const {
  blocked, chatSession, messageOf, planFirstRoot, pasteApproval, WIP_CON_PLAN,
} = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')

const { execute, executeAll } = require('../../engine/hooks/run')

// Caso 287. Lo que un `grep` busca y lo que un `sed`, un `awk` o un `jq` ejecutan no es un archivo. Leído como
// ruta, buscar en el código el nombre de un archivo de entorno frenaba como si se lo abriera. Las dos mitades
// van juntas: el patrón pasa, y el archivo que viene después se sigue frenando.
test('secrets-shell no toma por un archivo el patrón de una búsqueda', () => {
  const root = planFirstRoot('ops-hook-patron-', WIP_CON_PLAN)
  const runs = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of [
    // Los tres que frenaron recorridos reales.
    String.raw`grep -rn "\.env\.schema" src`, String.raw`grep -rn "process\.env\." src | head`,
    'grep -rln "credentials.json" src',
    String.raw`sed -n '/\.env/p' README.md`, String.raw`rg -e '\.env' -e 'id_rsa' src`,
    "awk -F= '/.env/ {print $1}' notas.txt", "jq '.env' package.json", 'grep --regexp=.env src/a.js',
    "jq --arg file .env '.x' package.json",
  ]) assert.doesNotThrow(() => execute('secrets-shell', runs(command)), command)
  for (const command of [
    'grep KEY .env', 'grep -e KEY .env', 'grep -rn "x" src .env', "sed -n '1,5p' .env", "sed -e 1p .env",
    "awk -F= '{print $1}' .env", 'grep -f .env notas.txt', "jq -r .token credentials.json", 'rg KEY .env',
    // Con una bandera cuyo valor no se conoce, lo que sigue se mira entero: se confunde hacia el lado que frena.
    'grep --max-count 3 KEY .env',
  ]) blocked('secrets-shell', runs(command), /lee .*credencial/)
})

// Leer una credencial por shell, en cualquier runner (caso 104): lo que la muestra se frena, lo que sólo la
// nombra pasa, y lo que la persona pidió en el chat también.
test('secrets-shell frena leer una credencial por shell y deja pasar lo demás', () => {
  const root = planFirstRoot('ops-hook-lee-shell-', WIP_CON_PLAN)
  const runs = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of ['cat .env', 'head -3 ./.env', 'grep TOKEN .env', 'sed -n 1p .env', 'source .env',
    '. .env', 'wc -l < .env', 'cat id_ed25519 | base64', 'X=1 cat .env', 'echo $(cat .npmrc)',
    `node -e "console.log(require('node:fs').readFileSync('.env','utf8'))"`,
    `python3 -c "print(open('.env').read())"`,
    // Las dos formas con que un agente lo leyó en una sesión real, cuando el guard no las veía.
    'nl -ba .env', "rg -n KEY -g '.env*'", "grep -rn KEY --include='*.env' .",
    // Y con el comodín antes del patrón, que el README nombra y el guard leía como si fuera el patrón (caso 342).
    "rg -g '.env*' KEY", "rg --glob '.env*' KEY .", "grep --include='*.env' -rn KEY .",
    // El verbo se busca detrás de prefijos con sus banderas, con ruta, dentro de un subshell y entre tramos vacíos.
    'xargs -0 cat .env', '/bin/cat .env', '(cat .env)', 'true; ; cat .env']) {
    blocked('secrets-shell', runs(command), /lee .*credencial/)
  }
  for (const command of ['cat .env.example', 'ls -la .env', 'test -f .env', 'rm .env', 'cp .env.example .env',
    'git add .env.example', 'git commit -m "no leer el .env; cat .env"', 'grep -r TOKEN src', 'ls .env*',
    'cat *.md']) {
    assert.doesNotThrow(() => execute('secrets-shell', runs(command)), command)
  }
  assert.throws(() => executeAll(['pre-shell'], runs('cat .env')), /lee .*credencial/)
  // Sin chat queda la aprobación por archivo; con chat, pasa lo que la persona nombró.
  pasteApproval(root, messageOf('secrets-shell', runs('cat .env')))
  assert.doesNotThrow(() => execute('secrets-shell', runs('cat .env')))
  const chat = chatSession()
  try {
    const asked = chat.says('mostrame qué hay en el .npmrc')
    assert.doesNotThrow(() => execute('secrets-shell', asked(runs('cat .npmrc'))))
    blocked('secrets-shell', runs('cat .npmrc'), /lee .*credencial/)
    // Nombrar sin pedir tampoco autoriza por esta vía (caso 109). El 109 lo dio por cubierto porque este
    // guard coteja por el mismo `unauthorized` que el de lectura, y eso es un argumento: la vía que el
    // propio caso señaló con nombre y línea no tenía ninguna aserción. Va con un archivo que esta prueba
    // no aprobó antes —`.env` y `.npmrc` ya están concedidos acá—, porque si no lo dejaría pasar el 116.
    blocked('secrets-shell', chat.says('¿para qué sirve el id_ed25519?')(runs('cat id_ed25519')),
      /lee .*credencial/)
  } finally { chat.close() }
})

// Un commit en el mismo comando no apaga la escritura, y su mensaje no es una: lo que dice entre comillas o en un
// heredoc es dato. Bajo un `cd` que no se resuelve no hay ruta que aprobar, así que se frena pidiéndola.
test('secrets-shell juzga la escritura de una credencial aunque el comando commitee, y no la ubica bajo un cd perdido',
  () => {
    const root = planFirstRoot('ops-hook-escribe-commit-', WIP_CON_PLAN)
    const runs = (command) => ({ cwd: root, tool_input: { command } })
    for (const command of ['git commit -m wip && echo "//r/:_authToken=x" > .npmrc',
      'echo "//r/:_authToken=x" > .npmrc && git commit -m wip']) {
      blocked('secrets-shell', runs(command), /\.npmrc es un archivo de credenciales/)
    }
    // Un dígito pegado a la palabra es parte de ella: esto lee `cert.pem2`, que no es una credencial.
    assert.doesNotThrow(() => execute('secrets-shell', runs('cat cert.pem2>/dev/null')))
    for (const command of ['git commit -m "fix: stop writing > .npmrc"',
      'git commit -F - <<\'EOF\'\nfix: echo x > .npmrc\nEOF', 'cat > s.sh <<END-1\necho "$T" > ~/.npmrc\nEND-1']) {
      assert.doesNotThrow(() => execute('secrets-shell', runs(command)), command)
    }
    const lost = messageOf('secrets-shell', runs('cd $DIR && echo x > .npmrc'))
    assert.match(lost, /^\.npmrc es un archivo de credenciales/, 'se le inventó una carpeta')
    assert.match(lost, /escribí la ruta absoluta/)
    assert.doesNotMatch(lost, /\.ops-approval/, 'ofrece aprobar una ruta que no se sabe')
    assert.doesNotThrow(() => execute('secrets-shell', runs('cd $DIR && echo x > notas.txt')))
    // `$HOME` sí se resuelve, y entonces se ofrece aprobarlo como cualquier otra ruta.
    assert.match(messageOf('secrets-shell', runs('cd "$HOME/x" && echo x > .npmrc')),
      new RegExp(`${path.join(os.homedir(), 'x', '.npmrc').replace(/[.]/g, '\\.')} es un archivo de credenciales`))
    // Lo que la persona pidió en el chat nombrándolo pasa también bajo un `cd` que no se resuelve.
    const chat = chatSession()
    try {
      const asked = chat.says('escribí el token en el .npmrc de $DIR')
      assert.doesNotThrow(() => execute('secrets-shell', asked(runs('cd $DIR && echo x > .npmrc'))))
    } finally { chat.close() }
    // El `>` redirige pegado a lo de antes, igual que con espacio.
    for (const command of ['echo x>.npmrc', 'cat>.npmrc <<EOF\nx\nEOF', 'echo a>b>.npmrc']) {
      blocked('secrets-shell', runs(command), /\.npmrc es un archivo de credenciales/)
    }
  })

// Casos 405 y 402. Escribir una credencial desde el shell frena igual que con las herramientas de edición, y
// por lo que es —una escritura—: el destino de un `>` ya no se lee como lo que el comando lee.
test('secrets-shell frena escribir una credencial por shell como escritura, y no como lectura', () => {
  const root = planFirstRoot('ops-hook-escribe-shell-', WIP_CON_PLAN)
  const runs = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of ['echo "//r/:_authToken=x" > .npmrc', 'cat > .npmrc <<EOF\n//r/:_authToken=x\nEOF',
    'printf x >> ~/.netrc', 'tee .pypirc < plantilla', 'cp clave id_ed25519', 'cd sub && echo x > credentials']) {
    blocked('secrets-shell', runs(command), /archivo de credenciales que su herramienta mantiene/)
    assert.doesNotMatch(messageOf('secrets-shell', runs(command)), /lee /, command)
  }
  // Lo que sigue siendo lectura se sigue frenando como lectura, aunque el comando también escriba.
  for (const command of ['cat .npmrc', 'cat .npmrc > copia', 'cat < .npmrc > copia']) {
    blocked('secrets-shell', runs(command), /lee .*credencial/)
  }
  // El `.env` se arma desde su plantilla en el shell, y eso no es leerlo: es la excepción declarada.
  // Y ahí se ve el 402 solo: escribir el `.env` con `cat >` no es leerlo.
  for (const command of ['cp .env.example .env', 'echo PORT=3000 >> .env', 'cat > .env <<EOF\nPORT=3000\nEOF',
    'echo x > notas.txt', 'ls > .npmrc.md', 'cp .env.sample .env.local']) {
    assert.doesNotThrow(() => execute('secrets-shell', runs(command)), command)
  }
  // Caso 417: la excepción es la del setup, `.env` y `.env.local`; el resto de la familia frena como en la edición.
  for (const command of ['echo DOTENV_PRIVATE_KEY=x > .env.keys', 'echo T=x >> .env.production',
    'cp .env.example .env.development']) {
    blocked('secrets-shell', runs(command), /parece contener secretos/)
  }
  // La variable que apaga la lectura no apaga la escritura: es otro guard con otra pregunta.
  process.env.OPS_SECRETS_READ_OVERRIDE = '1'
  try {
    blocked('secrets-shell', runs('echo x > .npmrc'), /archivo de credenciales/)
  } finally { delete process.env.OPS_SECRETS_READ_OVERRIDE }
  // Se aprueba como cualquier otra escritura de una credencial: por archivo, o pidiéndolo en el chat.
  pasteApproval(root, messageOf('secrets-shell', runs('echo x > .npmrc')))
  assert.doesNotThrow(() => execute('secrets-shell', runs('echo x > .npmrc')))
  const chat = chatSession()
  try {
    const asked = chat.says('escribí el token en el .pypirc')
    assert.doesNotThrow(() => execute('secrets-shell', asked(runs('echo x > .pypirc'))))
  } finally { chat.close() }
})
