'use strict'

// Hasta dónde puede escribir una herramienta y hasta dónde puede escribir un comando, que son
// la misma pregunta hecha a dos guards y tienen que contestar lo mismo.

const { tempRoot } = require('../support/environment')
const { blocked, git, chatSession } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute, guards } = require('../../engine/hooks/run')

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
// `>|` es el override de `noclobber` —escribe aunque el shell esté configurado para no pisar— y el
// guard no lo veía: `REDIRECT` cortaba antes del `|`, que además está fuera de la clase del destino. Como
// `writesWithBase` es la única fuente de los tres guards de escritura, se perdían los tres a la vez.
//
// El caso concreto que lo vuelve grave y no una curiosidad de parseo: lo que un agente se escribe con eso
// es su propia `.ops-approval`, o sea la aprobación que después le habilita el push a la rama viva. Es lo
// que cerraron el 098 y el 119, reabierto por una barra (caso 164).
test('el override de noclobber no es una puerta de atrás al destino', () => {
  const root = tempRoot('ops-hook-noclobber-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    workspaceRoots: [{ name: 'main', path: '.' }],
  }))
  const afuera = path.join(os.homedir(), 'afuera', 'nota.md')

  // Las tres formas de redirigir escriben lo mismo, así que las tres tienen que contestar lo mismo.
  for (const redirect of ['>', '>>', '>|']) {
    blocked('shell-boundary', { cwd: root, tool_input: { command: `echo x ${redirect} ${afuera}` } },
      /fuera de las raíces/)
  }

  // Y la otra mitad: adentro de la raíz sigue pasando, con la misma forma. Sin esto, «bloquea `>|`» se
  // cumple bloqueando todo comando que lo lleve.
  assert.doesNotThrow(() => execute('shell-boundary',
    { cwd: root, tool_input: { command: `echo x >| ${path.join(root, 'nota.md')}` } }))
})

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

  // Y si la persona lo pide, pasa: el guard cuida que el agente no parchee el motor por su cuenta, no que
  // ella no pueda tocarlo a sabiendas (caso 117).
  const motor = 'node_modules/@ingeniomaps/cauce/engine/cli/ops.js'
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('engine',
      chat.says(`editá ${motor}`)({ cwd: root, tool_input: { file_path: motor } })))
  } finally { chat.close() }

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
