'use strict'

// Caso 508: lo que Cauce entregó para que corran los guards —sus scripts, el registro de lo entregado y lo que recibió
// el runner— no se reescribe, mueve ni borra sin que una persona lo confirme, por archivo ni por shell. Un guard propio
// al lado sí, y lo demás del proyecto también.

const { installedProject, tempRoot } = require('../support/environment')
const { blocked, chatSession, messageOf } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { execute } = require('../../engine/hooks/run')

const RUNTIME = /(?:es|son) de lo que Cauce entregó a la instancia/
const HOOKS = 'automatization/hooks'
const SHIM = `${HOOKS}/guard-files.sh`

function instance(name) {
  const { workspace, target } = installedProject(name, 'claude')
  const write = (file) => ({ cwd: target, tool_input: { file_path: file, content: 'exit 0' } })
  const shell = (command) => ({ cwd: target, tool_input: { command } })
  return { workspace, target, write, shell }
}

test('por archivo se frena lo entregado, también por un enlace, y lo del proyecto no', () => {
  const { workspace, target, write } = instance('cauce-runtime-')
  fs.symlinkSync(path.join(target, SHIM), path.join(workspace, 'enlace.sh'))
  for (const file of [path.join(target, SHIM), path.join(target, HOOKS, 'run-hook.sh'),
    path.join(target, '.cauce/manifest.json'), path.join(target, 'engine/hooks/run.js'),
    path.join(workspace, '.claude/settings.json'), path.join(workspace, '.claude/workflows/autobuild.js'),
    path.join(workspace, 'enlace.sh')]) {
    blocked('runtime', write(file), RUNTIME)
  }
  for (const file of [path.join(target, HOOKS, 'guard-propio.sh'), path.join(target, HOOKS, 'guard-git'),
    path.join(target, HOOKS, 'README.md'),
    path.join(target, 'AGENTS.md'), path.join(target, 'Makefile'),
    path.join(target, 'planning/rules/system/process.md'),
    path.join(workspace, 'CLAUDE.md'), path.join(workspace, 'src/app.js')]) {
    assert.doesNotThrow(() => execute('runtime', write(file)), file)
  }
})

test('por shell se frena tocarlo de cualquier forma que lo apague, y copiar desde él no', () => {
  const { shell } = instance('cauce-runtime-shell-')
  for (const command of [`sed -i s/exec/true/ ${SHIM}`, `rm ${HOOKS}/run-hook.sh`, `rm -rf ${HOOKS}`,
    `rm ${HOOKS}/*`, `rm ${HOOKS}/guard-*.sh`, `find ${HOOKS} -name 'guard-f*' -delete`, `mv ${HOOKS} h2`,
    `mv ${SHIM} /tmp/fuera`, `ln -sf /bin/true ${SHIM}`, `chmod -x ${SHIM}`, 'chmod -R a-x automatization',
    `cp /tmp/guard-files.sh ${HOOKS}/`, `cp -t ${HOOKS} /tmp/guard-files.sh`, `git rm ${SHIM}`,
    `git checkout HEAD~1 -- ${SHIM}`, "echo '{}' > .cauce/manifest.json", `sh -c 'printf x > ${SHIM}'`,
    `git -C . rm ${SHIM}`, `git --attr-source HEAD rm ${SHIM}`, `git --config-env x=Y rm ${SHIM}`,
    `git restore --source=HEAD~1 ${HOOKS}`, 'rm -rf automat*', `find ${HOOKS} -delete`,
    `find ${HOOKS} -name 'guard-f*' -delete`, `git checkout HEAD~1 -- ${HOOKS}`, `git checkout HEAD~1 ${HOOKS}`,
    'git restore -sHEAD~1 automatization', 'git restore --staged -W --source=HEAD~1 automatization',
    'git restore -sSTABLE automatization']) {
    blocked('runtime-shell', shell(command), RUNTIME)
  }
  // Desde la raíz del proyecto, con `-C` hacia la instancia; y un glob que nombra la carpeta. Ahí `OPS_ROOT` lo exporta
  // `run-hook.sh`, como en una sesión real.
  const from = (command) => ({ cwd: path.dirname(shell('').cwd), tool_input: { command } })
  const before = process.env.OPS_ROOT
  process.env.OPS_ROOT = shell('').cwd
  try {
    blocked('runtime-shell', from(`git -C ops rm ${SHIM}`), RUNTIME)
    blocked('runtime-shell', from('chmod -R a-x ops/automat*'), RUNTIME)
  } finally {
    if (before === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = before
  }
  for (const command of [`cat ${SHIM}`, `chmod +x ${HOOKS}/guard-propio.sh`, `cp /tmp/x ${HOOKS}/`,
    `cp ${SHIM} /tmp/copia`, `ln -s ${SHIM} /tmp/enlace`, `echo x > ${HOOKS}/README.md`,
    // Volver a `HEAD` o al índice, o tocar sólo el índice, no cambia nada que no se haya escrito antes.
    'git restore .', 'git checkout -- .', 'git restore --staged .', 'git rm --cached -r .', 'git checkout main',
    "find . -name '*.log' -delete", 'rm -rf node_modules', `git checkout -- ${HOOKS}`, 'echo x > automat']) {
    assert.doesNotThrow(() => execute('runtime-shell', shell(command)), command)
  }
})

// Cerrado por defecto: cualquier programa que nombre un archivo entregado cuenta como que lo toca, salvo el que lo lee
// o lo ejecuta. Antes sólo contaban los que el guard conocía, y `dd of=` o `perl -pi` pasaban.
test('por shell se frena el programa que no conoce, y el que sólo lee o ejecuta no', () => {
  const { shell } = instance('cauce-runtime-ajeno-')
  for (const command of [`dd if=/dev/null of=${SHIM}`, `perl -pi -e 's/exec/true/' ${SHIM}`, `patch ${SHIM} < x.diff`,
    `node -e "require('node:fs').writeFileSync('${SHIM}', '')"`, `python3 -c "open('${SHIM}', 'w')"`,
    `./propio.sh ${SHIM}`, `git clean -fdx ${HOOKS}`, `git apply --include=${SHIM} x.diff`,
    `perl -pi -e 's/a/b/' ${HOOKS}/*.sh`,
    // Las rutas de git cuentan desde su `-C`, y en un pathspec el `*` cruza `/`. `sort`, `uniq`, `awk`, `yq` y `find`
    // cuentan aunque lean. `git clean` sin ruta borra el árbol, aunque deje algo con `-e` o no lleve `-f`.
    `git -C ${HOOKS} clean -fdx guard-files.sh`, `git -C ${HOOKS} apply --include=guard-files.sh x.diff`,
    "git apply --include='automatization/*' x.diff", "git checkout -- 'automatization/*.sh'",
    `find ${SHIM} -exec truncate -s0 {} +`, `find . -fprint0 ${SHIM}`, `uniq -f 1 /dev/null ${SHIM}`,
    `sort -uo ${SHIM} /dev/null`, `sort -o${SHIM} /dev/null`, `yq -Pi '.x=1' ${SHIM}`,
    `git checkout HEAD~1 -- '${HOOKS}/[!z]*'`, `git -c clean.requireForce=false clean -dx ${HOOKS}`,
    `git clean --forc -dx ${HOOKS}`, `git clean -dx ${HOOKS}`, 'git clean -d', 'git clean',
    `sort -o ${SHIM} /dev/null`, `uniq /dev/null ${SHIM}`, `awk -i inplace '{print}' ${SHIM}`, `find . -fprint ${SHIM}`,
    `yq -i '.x=1' ${SHIM}`, 'git clean -fdx', 'git clean -fdx -e keep', 'git clean -fdx --exclude=keep']) {
    blocked('runtime-shell', shell(command), RUNTIME)
  }
  for (const command of [`bash ${SHIM}`, `diff ${SHIM} /tmp/x`, `git log -p ${SHIM}`, `shellcheck ${SHIM}`,
    './propio.sh .', 'tar -czf /tmp/b.tgz .', `for f in ${HOOKS}/*.sh; do echo "$f"; done`, "./propio.sh -d '*'",
    'tar czf /tmp/x.tgz automatization/*', 'git clean -n', 'git clean -fdn', "git restore '*'",
    // Por qué no rompen el guard, en `spec` de `engine/hooks/runtime.js`.
    "git stash push -m 'wip [b'", "git stash push -m 'nota [z-a]'",
    "git checkout -- '*'",
    `node -e "console.log(require('./.cauce/manifest.json').files)"`, 'node --test test/x.test.js',
    // Un patrón que no es un glob válido no alcanza nada, y no rompe el guard.
    "./propio.sh 'a/[[:space:]]+required: true[[:space:]]*\\$/'"]) {
    assert.doesNotThrow(() => execute('runtime-shell', shell(command)), command)
  }
})

// Lo que alcanza a un guard sin nombrarlo: un diff aplicado en el repositorio de la instancia, un `find` que le pasa lo
// que encuentra a otro programa, un pathspec mágico o que no se sabe traducir, y un `git clean` que se disfraza de
// simulación. Un diff se frena sin leerse, venga de donde venga: por qué, en `patched` de `engine/hooks/runtime.js`.
test('por shell se frena lo que alcanza un guard sin nombrarlo', () => {
  const { target, shell } = instance('cauce-runtime-alcance-')
  for (const command of ['git apply x.diff', 'git apply ok.diff', 'patch -p1 < x.diff',
    'cat x.diff | env git apply ok.diff -',
    `git apply <<'EOF'\n--- a/src/x.js\nEOF`, 'git apply --directory=sub x.diff', 'git am x.diff', 'git am --continue',
    'git am --skip', 'git am --abort', 'git apply --check x.diff', 'git apply --check --app x.diff', 'git am --quit',
    'git apply --stat x.diff', 'git apply --numstat x.diff', 'git am --show-current-patch',
    'patch --dry-run -p1 < x.diff',
    'git apply --exclude --check x.diff', 'cd .. && patch -p1 < x.diff', `git --work-tree=${target} am x.diff`,
    `GIT_WORK_TREE=${target} git apply x.diff`, `cd ${HOOKS} && patch < ../../sub.diff`,
    'git clean -fdx -e -n', 'git clean -fdx -- -n',
    `find ${HOOKS} -exec truncate -s0 {} +`, "find automatization -name 'guard*' -exec rm {} +",
    "git clean -fdx ':!keep'", "git checkout HEAD~5 -- ':/'",
    `git checkout HEAD~1 -- '${HOOKS}/guard[[:punct:]]files.sh'`, `git checkout HEAD~1 -- '${SHIM}[[:alpha:]]'`,
    `git checkout HEAD~1 -- '${HOOKS}/guard\\-files.sh'`, 'git clean -fdx -einit', 'git clean -fdx --excl foo',
    'git clean -fdx --excl=foo', 'git clean -fdxe foo', "printf 'c\\n' | git clean -dxi"]) {
    blocked('runtime-shell', shell(command), RUNTIME)
  }
  for (const command of ['git -C /tmp/otra apply /tmp/otra/x.diff',
    'git -C /tmp/otra am x.diff', 'git commit -m apply', 'git log --grep am', 'git branch am',
    "find . -name '*.log' -exec rm {} +", `find ${HOOKS} -exec grep -l x {} +`, "git checkout -- ':/'",
    'git clean -fdn',
    'git clean --dry-run', "git tag -a v1 -m '[x'"]) {
    assert.doesNotThrow(() => execute('runtime-shell', shell(command)), command)
  }
  // El freno nombra también lo que el diff podría crear: el motor sombra todavía no existe y se pide igual.
  blocked('runtime-shell', shell('git apply x.diff'), /engine\/hooks\/run\.js/)
  // Con repositorio, una carpeta hermana de la instancia también cuenta (`topOf`).
  const repo = path.dirname(target)
  spawnSync('git', ['init', '-q', repo])
  blocked('runtime-shell', shell('git -C ../app am x.diff'), RUNTIME)
  // Y desde afuera, nombrando la instancia con `-d` o eligiéndola como árbol, con `OPS_ROOT` como arriba.
  const before = process.env.OPS_ROOT
  process.env.OPS_ROOT = target
  try {
    for (const command of [`patch -d ${target} -p1 -i x.diff`, `git --work-tree=${target} am x.diff`,
      `GIT_WORK_TREE=${target} git apply x.diff`, 'git apply --unsafe-paths ../x.diff',
      `patch --dir=${target} -i x.diff`, `patch -Rd ${target} -i x.diff`, `patch -d /tmp/otra -d ${target} -i x.diff`,
      `patch -i x.diff -o${target}/${SHIM}`, `patch -d /tmp/otra -o ../..${target}/${SHIM} -i x.diff`,
      'patch --suffix -d/tmp/otra -i x.diff', 'git apply --unsafe ../x.diff', 'git am --direc=x y.diff',
      `patch -d /tmp -d otra -i x.diff`, 'cd "$X" && git -C sub apply x.diff']) {
      blocked('runtime-shell', { cwd: tempRoot('cauce-runtime-afuera-'), tool_input: { command } }, RUNTIME)
    }
    // Con las opciones conocidas de `patch` se ubica, y afuera no se juzga.
    for (const command of ['patch -Np1 -i x.diff', 'patch -Rp 1 --dry-run < x.diff', 'git apply x.diff']) {
      execute('runtime-shell', { cwd: tempRoot('cauce-runtime-afuera-'), tool_input: { command } })
    }
  } finally {
    if (before === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = before
  }
})

test('sin un registro legible se protege la carpeta entera', () => {
  const { target, write } = instance('cauce-runtime-registro-')
  fs.writeFileSync(path.join(target, '.cauce/manifest.json'), '{roto')
  blocked('runtime', write(path.join(target, HOOKS, 'guard-propio.sh')), RUNTIME)
  fs.rmSync(path.join(target, '.cauce/manifest.json'))
  blocked('runtime', write(path.join(target, SHIM)), RUNTIME)
  // También un diff que aplica adentro, que no nombra el archivo.
  blocked('runtime-shell', { cwd: target, tool_input: { command: 'git apply x.diff' } }, RUNTIME)
})

test('la persona lo confirma en el turno, sin línea que lo deje abierto', () => {
  const { target, write } = instance('cauce-runtime-confirma-')
  const file = path.join(target, SHIM)
  const chat = chatSession()
  try {
    const message = messageOf('runtime', chat.says('arreglá el guard')(write(file)))
    assert.match(message, RUNTIME)
    assert.doesNotMatch(message, /pegue ella tal cual/, 'no ofrece una línea para pegar')
    assert.doesNotThrow(() => execute('runtime', chat.says('dale')(write(file))))
    blocked('runtime', chat.says('ahora el login')(write(file)), RUNTIME)
  } finally { chat.close() }
  // Pedirlo nombrando el archivo es decidirlo ella.
  const named = chatSession()
  try {
    assert.doesNotThrow(() => execute('runtime', named.says(`editá ${SHIM}`)(write(file))))
  } finally { named.close() }
  // Pegada igual, la línea no abre nada. En una sesión propia: el mensaje que sigue a un bloqueo lo confirma.
  fs.appendFileSync(path.join(target, 'planning/.ops-approval'), `escribe ${fs.realpathSync(file)}\n`)
  const other = chatSession()
  try { blocked('runtime', other.says('hacé lo tuyo')(write(file)), RUNTIME) } finally { other.close() }
})

// En el repositorio de Cauce los scripts son el producto que se edita: ahí no hay instancia, así que no hay raíz ops.
test('en el toolkit no protege nada', () => {
  const root = tempRoot('cauce-runtime-toolkit-')
  fs.mkdirSync(path.join(root, HOOKS), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'T', mode: 'toolkit' }))
  const file = path.join(root, SHIM)
  assert.doesNotThrow(() => execute('runtime', { cwd: root, tool_input: { file_path: file, content: 'x' } }))
  assert.doesNotThrow(() => execute('runtime-shell', { cwd: root, tool_input: { command: `rm ${SHIM}` } }))
})

// En modo embebido la raíz ops es la del producto, que puede tener su propio `engine/`: sólo se protege el archivo que
// `run-hook.sh` usaría como motor.
test('en modo embebido se protege el motor sombra, y no el engine/ del producto', () => {
  const { target, write } = instance('cauce-runtime-embebido-')
  fs.writeFileSync(path.join(target, 'ops.config.json'), JSON.stringify({
    ...JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')), mode: 'embedded' }))
  blocked('runtime', write(path.join(target, 'engine/hooks/run.js')), RUNTIME)
  assert.doesNotThrow(() => execute('runtime', write(path.join(target, 'engine/physics.js'))))
  assert.doesNotThrow(() => execute('runtime-shell', { cwd: target, tool_input: { command: 'rm -rf engine' } }))
})
