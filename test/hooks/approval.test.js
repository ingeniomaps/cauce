'use strict'

// Cómo se destraba un bloqueo: qué alcanza a aprobar lo que el mensaje manda pegar, y qué no.

const { tempRoot, outsideTempRoot } = require('../support/environment')
const {
  blocked, git, initRepo, messageOf,
  planFirstRoot, pasteApproval, WIP_IDLE, WIP_CON_PLAN,
} = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')

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
  // Se cuenta en un temporal propio y no en el del sistema, que es compartido: la suite de otra sesión
  // corriendo a la vez deja ahí sus copias mientras ésta mira, y contar sólo las nuevas no alcanzaba —
  // la de la otra también es nueva—. Falló así al commitear con tres sesiones corriendo suites.
  const propio = tempRoot('ops-hook-verify-tmp-')
  const previo = process.env.TMPDIR
  process.env.TMPDIR = propio
  try {
    fs.writeFileSync(path.join(root, 'app.js'), '// ROTO\n')
    git(['add', 'app.js'], root)
    fs.writeFileSync(path.join(root, 'app.js'), '// tambien roto\n')
    assert.throws(() => execute('verify', commit), 'el gate falla sobre el índice')
  } finally {
    if (previo === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previo
  }
  assert.deepEqual(fs.readdirSync(propio).filter((one) => one.startsWith('ops-verify-')), [],
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

  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n'

  + '## Plan aprobado\n1. [ ] Escribir el handler\n'
