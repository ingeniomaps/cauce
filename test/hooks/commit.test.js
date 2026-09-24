'use strict'

// Lo que se exige en el momento de commitear: gates, gobernanza, migraciones y dependencias.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { spawnSync } = require('node:child_process')
const { execute, hookMetadata } = require('../../engine/hooks/run')

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
  // podía dejar de mirar SQL sin que nada se pusiera rojo. Sin un `sqlc.yaml` en el repositorio no dispara.
  fs.mkdirSync(path.join(root, 'db', 'queries'), { recursive: true })
  fs.writeFileSync(path.join(root, 'db', 'queries', 'altas.sql'), 'SELECT 1;\n')
  fs.writeFileSync(path.join(root, 'sqlc.yaml'), 'version: "2"\n')
  git(['add', 'db/queries/altas.sql', 'sqlc.yaml'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }, /consulta SQL fuente/)
  fs.mkdirSync(path.join(root, 'sqlc'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sqlc', 'altas.go'), 'package sqlc\n')
  git(['add', 'sqlc/altas.go'], root)
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }))
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

// El mismo apagado silencioso, por la otra puerta: el ancla de `COMMIT` admitía `;`, `&` y `|` como
// separadores y no el salto de línea, aunque el léxico de `shell.js` ya declara que el salto separa un
// comando igual que `;`. Dos líneas en un solo Bash es como un agente escribe dos pasos, y ahí los tres
// guards que sólo corren sobre un commit dejaban de correr (caso 165). El subshell va con el salto
// porque es el mismo hueco: `(` abre un comando y tampoco estaba en el ancla.
test('un salto de línea o un subshell no apagan los guards que sólo corren sobre un commit', () => {
  const root = tempRoot('ops-hook-salto-')
  git(['init'], root)
  git(['config', 'user.email', 'x@y.z'], root)
  git(['config', 'user.name', 'x'], root)
  const gobernado = 'agents/roles/system/qa-engineer/SKILL.md'
  fs.mkdirSync(path.join(root, path.dirname(gobernado)), { recursive: true })
  fs.writeFileSync(path.join(root, gobernado), 'contenido\n')
  git(['add', gobernado], root)

  for (const command of [`echo listo\n  git commit -m x`, '(git commit -m x)']) {
    blocked('governance', { cwd: root, tool_input: { command } }, /gobernanza protegida/)
  }

  // Y la forma más común —stagear y commitear en el mismo Bash— cae en el bloqueo que existe para eso,
  // que también estaba apagado: sin ver el commit, nadie miraba el índice. Se asercia el motivo y no sólo
  // que frene, porque frenar por la razón equivocada ya lo encontró esta suite una vez.
  blocked('governance', { cwd: root, tool_input: { command: `git add ${gobernado}\ngit commit -m x` } },
    /stagea y commitea a la vez/)

  // Lo que no es un commit sigue sin serlo, que es lo que impide cerrar esto frenando todo.
  const I = require('../../engine/hooks/input')
  assert.equal(I.isCommit('git add x.js\ngit status'), false, 'dos comandos y ninguno commitea')
  assert.equal(I.isCommit('git log --format=%s'), false)
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

// Un cambio que el lockfile no registra no tiene lock que actualizar (caso 181). Lo que sí lo mueve se
// midió con npm 11.16.0 y sigue frenando, y con otro gestor, sin medir, no se afloja nada.
test('guard-dependencies deja pasar lo que no llega al lockfile de npm, y sólo eso', () => {
  const commit = (root) => ({ cwd: root, tool_input: { command: 'git commit -m x' } })
  const base = { name: 'app', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { a: '1.0.0' } }
  const repo = (lock, change, { tracked = true } = {}) => {
    const root = tempRoot('ops-hook-deps-inerte-')
    initRepo(root)
    fs.writeFileSync(path.join(root, lock), '{}\n')
    if (tracked) {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(base, null, 2))
      git(['add', 'package.json', lock], root)
      git(['commit', '-q', '-m', 'base'], root)
    } else {
      git(['add', lock], root)
      git(['commit', '-q', '-m', 'base'], root)
    }
    const next = tracked ? JSON.parse(JSON.stringify(base)) : {}
    change(next)
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(next, null, 2))
    git(['add', 'package.json'], root)
    return root
  }

  for (const [what, change] of [
    ['un script', (p) => { p.scripts.cov = 'node --test --experimental-test-coverage' }],
    ['la configuración de jest', (p) => { p.jest = { coverageThreshold: { global: { lines: 80 } } } }],
    ['la descripción', (p) => { p.description = 'otra' }],
  ]) {
    assert.doesNotThrow(() => execute('dependencies', commit(repo('package-lock.json', change))), what)
  }

  for (const [, change] of [
    ['una dependencia', (p) => { p.dependencies.a = '2.0.0' }],
    ['la versión', (p) => { p.version = '1.0.1' }],
    ['un script de instalación', (p) => { p.scripts.postinstall = 'node setup.js' }],
    ['engines', (p) => { p.engines = { node: '>=24' } }],
    ['un script y una dependencia a la vez', (p) => { p.scripts.cov = 'x'; p.dependencies.b = '1.0.0' }],
  ]) {
    blocked('dependencies', commit(repo('package-lock.json', change)), /sin actualizar su lockfile/)
  }

  // Sin medir el lock de otro gestor, un script tampoco pasa. Y un manifiesto que HEAD no tenía no se
  // compara contra nada, aunque sólo traiga scripts.
  blocked('dependencies', commit(repo('pnpm-lock.yaml', (p) => { p.scripts.cov = 'x' })), /sin actualizar su lockfile/)
  blocked('dependencies', commit(repo('package-lock.json', (p) => { p.scripts = { cov: 'x' } }, { tracked: false })),
    /sin actualizar su lockfile/)
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
