'use strict'

// Hasta dónde puede escribir una herramienta y hasta dónde puede escribir un comando, que son
// la misma pregunta hecha a dos guards y tienen que contestar lo mismo.

const { outsideTempRoot, tempRoot } = require('../support/environment')
const { blocked, git, chatSession, messageOf } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute, guards } = require('../../engine/hooks/run')

test('guard-workspace-boundary limita escrituras a las raíces declaradas', () => {
  const root = outsideTempRoot('ops-hook-boundary-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'service'))
  const config = { workspaceRoots: [{ name: 'service', path: 'service' }] }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  assert.doesNotThrow(() => execute('workspace-boundary', { cwd: root, tool_input: { file_path: 'service/app.js' } }))
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../outside.txt' } }, /fuera de las raíces/)
})

// Una sustitución corre aunque el comando de afuera sólo imprima (caso 475). Lo citado no corre, y lo que sólo lee no
// se juzga: frenar eso es lo que enseñaría a apagar el guard.
test('lo que una sustitución borra o crea fuera de las raíces se frena', () => {
  const root = outsideTempRoot('ops-hook-sustitucion-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ workspaceRoots: [{ name: 'r', path: '.' }] }))
  const at = (command) => ({ cwd: root, tool_input: { command } })
  for (const command of ['echo $(rm -rf /etc/foo)', 'x=$(rm -rf /etc/foo)', 'echo "$(rm -rf /etc/foo)"',
    'echo `rm -rf /etc/foo`', 'echo $(echo $(rm -rf /etc/foo))', 'echo $(true; rm -rf /etc/foo)',
    'cd $(rm -rf /etc/foo; echo .)', 'x=$(mkdir -p /etc/foo)', 'echo $(echo a > /etc/foo)',
    "sh -c 'echo $(rm -rf /etc/foo)'", 'echo "$(rm -rf "/etc/foo")"', 'echo $((1 + $(rm -rf /etc/foo)))',
    'echo $(if true; then rm -rf /etc/foo; fi)', 'echo "it\'s $(rm -rf /etc/foo) it\'s"']) {
    blocked('shell-boundary', at(command), /fuera de las raíces/)
  }
  for (const command of ["echo '$(rm -rf /etc/foo)'", 'echo "\\$(rm -rf /etc/foo)"', 'echo \\$\\(rm -rf /etc/foo\\)',
    'x=$(ls /etc)', 'x=$(cat /etc/hosts | wc -l)', 'x=$(cd /etc && pwd); echo $x', 'x=$(cd /etc); rm -rf foo',
    'echo $(rm -rf sub)', 'x=$(mktemp -d)', 'echo $((1 + 2))', 'rm -f $(ls /etc)']) {
    assert.doesNotThrow(() => execute('shell-boundary', at(command)), command)
  }
})

// Un grupo detrás de una palabra de bloque corre igual, y lo que un cuerpo sin comillas sustituye corre al armarlo.
test('lo que corre en un grupo de un bloque o en el cuerpo de un heredoc se juzga (caso 477)', () => {
  const root = outsideTempRoot('ops-hook-grupo-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ workspaceRoots: [{ name: 'r', path: '.' }] }))
  const at = (command) => ({ cwd: root, tool_input: { command } })
  for (const word of ['then', 'else', 'elif', 'do', 'if', 'while', 'until', '!', 'then !']) {
    blocked('shell-boundary', at(`x; ${word} (rm -rf /etc/foo); y`), /fuera de las raíces/)
    blocked('shell-boundary', at(`x; ${word} { rm -rf /etc/foo; }; y`), /fuera de las raíces/)
    blocked('shell-boundary', at(`x; ${word} { (rm -rf /etc/foo); }; y`), /fuera de las raíces/)
  }
  for (const command of ['cat <<EOF\n$(rm -rf /etc/foo)\nEOF', 'cat > a <<EOF\n`rm -rf /etc/foo`\nEOF',
    "cat <<EOF\nit's $(rm -rf /etc/foo)\nEOF", 'cat <<-EOF\n$(rm -rf /etc/foo)\n\tEOF']) {
    blocked('shell-boundary', at(command), /fuera de las raíces/)
  }
  for (const command of ["cat <<'EOF'\n$(rm -rf /etc/foo)\nEOF", 'cat <<"EOF"\n$(rm -rf /etc/foo)\nEOF',
    'cat <<\\EOF\n$(rm -rf /etc/foo)\nEOF', 'cat <<EOF\n\\$(rm -rf /etc/foo)\nEOF', 'cat <<EOF\nrm -rf /etc/foo\nEOF',
    'cat <<EOF\nit\'s $(ls /etc)\nEOF', 'if a; then (ls /etc); fi', 'echo then (rm']) {
    assert.doesNotThrow(() => execute('shell-boundary', at(command)), command)
  }
})

test('guard-workspace-boundary deja pasar lo que el proyecto declaró escribible', () => {
  const root = outsideTempRoot('ops-hook-exempt-')
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
  const root = outsideTempRoot('ops-hook-shell-boundary-')
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
  const root = outsideTempRoot('ops-hook-noclobber-')
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
  const root = outsideTempRoot('ops-hook-boundary-par-')
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
  const root = outsideTempRoot('ops-hook-shell-boundary-var-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))

  for (const command of ['echo x > $SALIDA/nota.md', 'echo x > "$HOME/afuera/nota.md"']) {
    assert.doesNotThrow(() => execute('shell-boundary', { cwd: root, tool_input: { command } }))
  }
})

test('guard-engine protege el motor instalado y deja trabajar al toolkit', () => {
  const root = outsideTempRoot('ops-hook-engine-')
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
  const root = outsideTempRoot('ops-hook-engine-msg-')
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

// Caso 269. El plan del modo plan de Claude Code vive en `~/.claude/plans/`, fuera de toda raíz, y es del
// runner: frenarlo dejaba al modo plan sin poder escribir lo único que escribe. Sólo esa carpeta y un
// `.md`: el resto de `~/.claude` —configuración, memoria— sigue adentro del límite.
test('el archivo de plan del runner no es una escritura fuera de las raíces', () => {
  const root = outsideTempRoot('ops-hook-boundary-plan-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'main', path: '.' }] }))
  const home = (...parts) => path.join(os.homedir(), '.claude', ...parts)
  const write = (file) => ({ cwd: root, tool_input: { file_path: file } })

  assert.doesNotThrow(() => execute('workspace-boundary', write(home('plans', 'un-plan-cualquiera.md'))))
  for (const other of [home('settings.json'), home('plans', 'script.sh'), home('plans-de-otro', 'x.md'),
    home('projects', 'demo', 'memory', 'nota.md')]) {
    blocked('workspace-boundary', write(other), /fuera de las raíces/)
  }
})

// Caso 288. El scratchpad que el runner le da a la sesión es un lugar de paso, y un agente escribe ahí sus
// sondas y sus scripts. Los dos guards de límites tienen que contestar lo mismo, y sólo vale lo que cuelga
// del temporal: la ruta llega en la entrada, y no cualquier cosa escrita ahí se vuelve escribible.
test('el scratchpad de la sesión se puede escribir, y sólo si cuelga del temporal', () => {
  const root = outsideTempRoot('ops-hook-scratch-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ workspaceRoots: [] }))
  const scratch = path.join(os.tmpdir(), 'runner-x', 'sesion-1', 'scratchpad')
  const write = (file, dir) => ({ cwd: root, scratchpad_dir: dir, tool_input: { file_path: file } })
  const shell = (file, dir) => ({ cwd: root, scratchpad_dir: dir, tool_input: { command: `echo x > ${file}` } })
  const inside = path.join(scratch, 'sonda.mjs')
  assert.doesNotThrow(() => execute('workspace-boundary', write(inside, scratch)))
  assert.doesNotThrow(() => execute('shell-boundary', shell(inside, scratch)))

  // Desde el caso 510 el temporal entero es desechable también para la herramienta de archivos, como ya lo era para el
  // shell (caso 360): la misma ruta pasa sin el dato. Lo que el dato no puede es abrir lo que no es desechable.
  assert.doesNotThrow(() => execute('workspace-boundary', write(inside)))
  assert.doesNotThrow(() => execute('workspace-boundary', write(path.join(os.tmpdir(), 'suelto.txt'), os.tmpdir())))
  const home = path.join(os.homedir(), 'trabajo')
  blocked('workspace-boundary', write(path.join(home, 'a.txt'), home), /fuera de las raíces/)
  blocked('workspace-boundary', write('/etc/a.txt', '/'), /fuera de las raíces/)
})

// Caso 516: Gemini no deja escribir en `/tmp` y su único lugar desechable es su temporal de proyecto,
// `~/.gemini/tmp/<proyecto>`, que llega a los hooks en `transcript_path`. Cuenta ese y sólo ése, con la forma exacta.
test('el temporal de proyecto de Gemini se puede escribir, y sólo el de la sesión', () => {
  const root = outsideTempRoot('ops-hook-gemini-temporal-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ workspaceRoots: [] }))
  const temp = path.join(os.homedir(), '.gemini', 'tmp', 'proyecto-1')
  const transcript = path.join(temp, 'chats', 'session-2026-11-15T13-32-abc.jsonl')
  const write = (file, given = transcript) => ({ cwd: root, transcript_path: given, tool_input: { file_path: file } })
  const shell = (file) => ({ cwd: root, transcript_path: transcript, tool_input: { command: `echo x > ${file}` } })
  assert.doesNotThrow(() => execute('workspace-boundary', write(path.join(temp, 'mut', 'cart.js'))))
  assert.doesNotThrow(() => execute('shell-boundary', shell(path.join(temp, 'sonda.js'))))

  // Sin el dato, otro proyecto, una forma que no es la de Gemini o una que sale con `..`: nada se abre.
  const message = messageOf('workspace-boundary', write(path.join(temp, 'mut.js'), ''))
  assert.match(message, /fuera de las raíces/)
  blocked('workspace-boundary', write(path.join(os.homedir(), '.gemini', 'tmp', 'otro', 'x.js')), /fuera de las raíces/)
  blocked('workspace-boundary', write(path.join(os.homedir(), 'notas.md'),
    path.join(os.homedir(), 'chats', 'x.jsonl')), /fuera de las raíces/)
  blocked('workspace-boundary', write(path.join(os.homedir(), '.gemini', 'settings.json'),
    path.join(os.homedir(), '.gemini', 'tmp', '..', 'chats', 'x.jsonl')), /fuera de las raíces/)
  blocked('workspace-boundary', write(path.join(temp, 'mut.js'), path.join(temp, 'otra', 'x.jsonl')),
    /fuera de las raíces/)

  // Y el bloqueo le nombra ese lugar, no `/tmp`, que Gemini no le deja usar.
  const hinted = messageOf('workspace-boundary', write('/etc/fuera.txt'))
  assert.match(hinted, new RegExp(`va en el temporal de esta sesión, ${temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.doesNotMatch(hinted, /temporal del sistema/)
})

// De la revisión del 516: una carpeta de la sesión que es un enlace abriría lo que tiene detrás —el home entero, si
// alguien la enlaza ahí—, porque el límite juzga por dónde cae la escritura. Ni la de Gemini ni el scratchpad cuentan
// si son un enlace. El home es falso y cuelga de /var/tmp: ninguna prueba arma nada bajo el home real.
test('una carpeta de la sesión que es un enlace no abre nada', () => {
  const root = outsideTempRoot('ops-hook-sesion-enlace-')
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ workspaceRoots: [] }))
  const home = outsideTempRoot('ops-hook-home-falso-')
  fs.mkdirSync(path.join(home, '.gemini', 'tmp'), { recursive: true })
  fs.symlinkSync(home, path.join(home, '.gemini', 'tmp', 'p1'))
  const previous = process.env.HOME
  process.env.HOME = home
  try {
    const transcript = path.join(home, '.gemini', 'tmp', 'p1', 'chats', 'x.jsonl')
    blocked('workspace-boundary', { cwd: root, transcript_path: transcript,
      tool_input: { file_path: path.join(home, '.gemini', 'tmp', 'p1', '.bashrc') } }, /fuera de las raíces/)
  } finally { process.env.HOME = previous }

  const scratch = path.join(tempRoot('ops-hook-scratch-enlace-'), 'scratchpad')
  fs.symlinkSync(home, scratch)
  blocked('workspace-boundary', { cwd: root, scratchpad_dir: scratch,
    tool_input: { file_path: path.join(scratch, '.bashrc') } }, /fuera de las raíces/)
})
