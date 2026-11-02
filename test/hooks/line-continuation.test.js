'use strict'

// Una línea continuada es una sola para el shell, y lo tiene que ser para los guards (caso 478).

const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const I = require('../../engine/hooks/input')
const { execute } = require('../../engine/hooks/run')

const at = (command) => ({ tool_input: { command } })
const read = (command) => I.commandOf(at(command))

test('una línea continuada se une antes de leer el comando', () => {
  assert.equal(read('git \\\n  push'), 'git   push')
  assert.equal(read('cat .en\\\nv'), 'cat .env')
  assert.equal(read('echo "a \\\n b"'), 'echo "a  b"')
  assert.equal(read("echo 'a \\\n b'"), "echo 'a \\\n b'", 'en comillas simples el salto es dato')
  assert.equal(read('ls # nota \\\ngit push'), 'ls # nota \\\ngit push', 'un comentario termina en su línea')
  assert.equal(read('echo a\\\\\nb'), 'echo a\\\\\nb', 'una barra escapada no continúa')
  assert.equal(read("cat > a <<'EOF'\ngit push \\\nEOF\nls").includes('git push'), false)
  assert.equal(I.isCommit(read('git \\\n  commit -m x')), true)
})

test('los guards ven lo que una continuación partía', () => {
  blocked('destructive', at('git \\\n  push -f origin feat'), /push --force/)
  blocked('git-add', at('git add \\\n  -A'), /prohibido/)
  blocked('git-add', at('git commit -m "x" \\\n  -a'), /stagea al commitear/)
  assert.doesNotThrow(() => execute('git-add', at('git status \\\n  --short')))
  assert.doesNotThrow(() => execute('destructive', at("echo 'git \\\n push -f'")))
})

test('un mensaje con una sustitución anidada no parte el commit', () => {
  const run = (command) => I.asRun(read(command))
  const nested = 'git commit -m "$(cat <<EOF\nfix $(date)\nEOF\n)"'
  assert.match(run(`${nested} --amend`), /git commit -m \S* --amend/)
  assert.match(run('git commit -m "$(echo $(rm -rf x))" -a'), /git commit -m \S* -a ; .*rm -rf x/)
  assert.doesNotMatch(run(nested), /--amend/)
})

// Lo que un prefijo tiene delante no cambia lo que corre, en una línea o en dos (caso 479).
const PREFIXES = ['if a; then', 'for f in a; do', 'else', '!', 'timeout 5', 'timeout -k 1 5', 'nice', 'nice -n 5',
  'time', 'nohup', 'stdbuf -oL', 'cross-env CI=1', 'env A=1', 'command', 'exec', '{', 'then (']
const BOTH = [' ', ' \\\n  ']

test('leer una credencial detrás de un prefijo frena', () => {
  for (const prefix of PREFIXES) {
    for (const gap of BOTH) blocked('secrets-shell', at(`${prefix}${gap}cat .env`), /credencial/)
  }
  for (const command of ['timeout 5 cat README.md', 'timeout 5 ls .env', 'if [ -f .env ]; then echo si; fi',
    'do_thing .env', 'nice -n 5 ls .env', 'time.sh .env']) {
    assert.doesNotThrow(() => execute('secrets-shell', at(command)), command)
  }
})

test('un commit detrás de un envoltorio es un commit, y su mensaje es dato', () => {
  for (const wrapper of ['timeout 60', 'time', 'nice', 'nohup', 'env', 'exec', 'command', 'stdbuf -oL', 'cross-env']) {
    for (const gap of BOTH) {
      assert.equal(I.isCommit(read(`${wrapper}${gap}git commit -m x`)), true, wrapper)
      assert.doesNotMatch(I.asRun(read(`${wrapper}${gap}git commit -m "cita git push -f"`)), /git push/, wrapper)
    }
  }
  assert.equal(I.isCommit('time.sh git commit'), false)
  assert.doesNotMatch(I.asRun('time grep -rn "git add -A" src'), /git add/)
  assert.doesNotMatch(I.asRun('timeout 5 grep "git add -A" src'), /git add/)
  assert.match(I.asRun('timeout 5 sh -c "git add -A"'), /git add/)
})

test('una corrida de pruebas detrás de un prefijo se juzga', () => {
  const session = (command) => ({ tool_input: { command } })
  for (const prefix of ['cross-env CI=1', 'for f in a; do', 'nice', 'env A=1', 'if a; then', '!', 'command', 'xargs',
    'stdbuf -oL']) {
    for (const gap of BOTH) blocked('test-workers', session(`${prefix}${gap}npx jest`), /worker|jest/i)
  }
  assert.doesNotThrow(() => execute('test-workers', session('nice npx jest --maxWorkers=2')))
  blocked('test-workers', session('stdbuf -oL docker run node:24 npx jest'), /./)
  const runs = ['npx jest-cli', './jest.js', 'scripts/jest.js --ci', 'jest.cmd', './vitest.mjs run', 'jest,']
  for (const command of runs) {
    blocked('test-workers', session(command), /sin cota/)
  }
  for (const command of ['echo then jest', 'command -v jest', 'command -V vitest', 'exec -a jest node x.js',
    './jest.sh', 'nohup ./scripts/jest-ci.sh &', 'nice jest-junit x', 'env jest=1 node x',
    'xargs -a jest-files.txt npx prettier --write', 'xargs --arg-file jest.txt cat',
    'if command -v jest >/dev/null; then echo si; fi', 'JEST=$(command -v jest)', 'which jest || command -v jest']) {
    assert.doesNotThrow(() => execute('test-workers', session(command)), command)
  }
})

test('lo que escribe una línea continuada se juzga en la lectura por tramos', () => {
  const { steps, writes, asRead } = require('../../engine/hooks/shell-changes')
  assert.equal(steps('nice \\\n rm -rf /etc/foo', '/r').some((one) => one.verb === 'rm'), true)
  assert.equal(writes('echo a > \\\n /etc/x', '/r').some((one) => one.raw === '/etc/x'), true)
  assert.equal(asRead("cat > a <<'EOF'\nrm \\\nEOF").includes('rm'), false)
})

// Un envoltorio con banderas, un lanzador de paquetes y un `sh -c` tampoco cambian lo que corre.
test('un commit detrás de banderas de un envoltorio o en un sh -c se juzga', () => {
  for (const wrapper of ['time -p', 'nice -n 5', 'nice -5', 'sudo -u a', 'env -u X', 'timeout -k 1 5', 'exec -a n',
    'stdbuf -o L']) assert.equal(I.isCommit(`${wrapper} git commit -m x`), true, wrapper)
  assert.equal(I.isCommit('bash -c "git commit -m x"'), true)
  assert.equal(I.isCommit('bash -lc "cd a && git commit -m x"'), true)
  assert.equal(I.isCommit('command -v git commit'), false)
  for (const away of ['docker exec c sh -c "git commit -m x"', `ssh h "sh -c 'git commit -m x'"`,
    `node x.js "corre bash -c 'git commit -m x'"`]) assert.equal(I.isCommit(away), false, away)
  assert.equal(I.isCommit('time -p echo git commit'), false)
  assert.equal(I.isCommit(`env${' -u'.repeat(40)} ls`), false, 'sin volver atrás sin fin')
})

test('lo citado de lo que sólo muestra no es un commit, y lo que un shell recibe sí', () => {
  for (const command of ['echo \'f() { git commit -m x; }\'', 'echo "paso; git commit -m x"', 'grep "; git commit" a',
    'time printf "; git commit"', 'ls "a"; echo "; git commit -m y"']) assert.equal(I.isCommit(command), false, command)
  for (const command of ['echo "x; git commit -m y" | sh', 'echo "$(git commit -m x)"', 'echo a; git commit -m "b"',
    'echo "a"; git commit -m x']) assert.equal(I.isCommit(command), true, command)
})

test('el mensaje de un commit en un sh -c es dato, y lo demás corre', () => {
  const run = (command) => I.asRun(command)
  assert.doesNotMatch(run(`bash -c "git status; git commit -m 'cita git push -f'"`), /git push/)
  assert.doesNotMatch(run(`sh -c 'git commit -m "cita rm -rf /"'`), /rm -rf/)
  assert.match(run('bash -c "git commit -m x; git push -f origin b"'), /git push -f/)
  assert.match(run(`bash -c "git commit -m x" extra; git push -f`), /git push -f/)
  blocked('test-workers', at('bash -c "npx jest; git commit -m x"'), /sin cota/)
  blocked('test-workers', at(`git commit -m x && bash -c 'jest'`), /sin cota/)
  assert.doesNotMatch(run(`git commit -m x; echo bash -c "rm -rf /"`), /rm -rf/)
})

test('un lanzador de paquetes con banderas lanza la corrida', () => {
  const session = (command) => ({ tool_input: { command } })
  for (const command of ['xargs -n 1 jest', 'nice -n 5 jest', 'npx -y jest', 'pnpm dlx jest', 'npm exec jest',
    'npm exec -- jest', 'pnpm --filter web jest', 'yarn dlx jest', 'time -p npx jest', 'bunx -y vitest run']) {
    blocked('test-workers', session(command), /sin cota/)
  }
  blocked('test-workers', session('nice -n 19 docker run --rm img npx jest'), /./)
  for (const command of ['xargs -a jest.txt cat', 'xargs -I jest echo jest', 'npx -y prettier jest.config.js',
    'npm exec prettier', 'pnpm dlx create-foo', 'pnpm --filter web test', 'npx -y jest --maxWorkers=2',
    'npm exec jest -- --maxWorkers=2', 'npx -p jest bar', 'npm install jest']) {
    assert.doesNotThrow(() => execute('test-workers', session(command)), command)
  }
})
