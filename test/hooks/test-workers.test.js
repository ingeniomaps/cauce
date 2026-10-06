'use strict'

// Los runners jest y vitest llamados sin cota de workers (caso 232). Lo que se mide: que cada forma de
// llamarlos sin cota frene, que cada cota que su documentación acepta deje pasar, que lo que no corre pruebas
// no se frene, y que se apruebe como el resto.

const { blocked, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { execute } = require('../../engine/hooks/run')

const run = (root, command) => ({ cwd: root, tool_input: { command } })

test('jest y vitest sin cota frenan, como sea que se los llame', () => {
  const root = pushRoot('cauce-workers-')
  for (const command of [
    'npx jest', 'jest src/', 'pnpm exec jest --ci', 'yarn jest', 'node_modules/.bin/jest --watch',
    'npx vitest run', 'vitest', 'bunx vitest run src', 'cd api && npx jest && cd ..',
    'CI=1 npx jest', 'bash -c "npx jest"',
  ]) blocked('test-workers', run(root, command), /sin cota de workers/)
})

test('cada cota que la herramienta acepta deja pasar, y lo que no corre pruebas también', () => {
  const root = pushRoot('cauce-workers-pasa-')
  for (const command of [
    'npx jest --maxWorkers=2', 'npx jest --maxWorkers 50%', 'jest -w 2', 'jest -w=2', 'npx jest --runInBand',
    'npx jest -i', 'npx vitest run --maxWorkers=2', 'vitest --no-file-parallelism', 'npx jest --version',
    'npx vitest --help', 'npm test', 'npm run test:unit', 'git commit -m "test: agregar jest a la doc"',
    'grep -r jest package.json', 'cat jest.config.js',
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
})

test('se aprueba como el resto, con la línea exacta en .ops-approval', () => {
  const root = pushRoot('cauce-workers-salida-')
  const call = run(root, 'npx jest')
  const message = messageOf('test-workers', call)
  assert.match(message, /--maxWorkers=2 \(o --runInBand\)/)
  pasteApproval(root, message)
  assert.doesNotThrow(() => execute('test-workers', call))
})

// Caso 286. La comilla contaba como posición de comando, así que el patrón de un `grep` y lo que seguía a la
// comilla de cierre de cualquier argumento se leían como una corrida. Los dos primeros son los que frenaron
// un recorrido real. Van con su contraparte: lo entrecomillado detrás del `-c` de un shell sí se ejecuta.
test('leer la configuración de las pruebas no es correrlas', () => {
  const root = pushRoot('cauce-workers-lectura-')
  for (const command of [
    "grep -n 'jest' -A25 package.json", "grep -rn -E 'swc' jest.config.* package.json",
    "cat 'notas de hoy' jest.config.js", 'echo "npx jest"', "rg 'vitest' -l", 'ls "mis pruebas" vitest.config.ts',
    // Con un separador adentro del patrón: lo que un `grep` sólo lee no se parte en comandos.
    "grep -n 'lint; npx jest' Makefile",
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
  for (const command of ["sh -c 'npx jest'", 'bash -lc "cd api && vitest run"', 'grep -q x y; npx jest']) {
    blocked('test-workers', run(root, command), /sin cota de workers/)
  }
})

// Caso 291. Un runner lanzado con el envoltorio del proyecto corre dentro de un contenedor con memoria y CPU
// acotadas: no puede tirar la máquina, que es lo único que este guard cuida. Lo declara el proyecto, y vale
// para lo que ese comando lanza y para nada más del mismo renglón.
test('un runner lanzado con un comando que el proyecto declaró acotado no se frena', () => {
  const root = pushRoot('cauce-workers-acotado-')
  const declare = (boundedCommands) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush: false }, boundedCommands }))
  const inside = "acme-run.sh -C api sh -c 'pnpm exec jest src/decisions; echo listo'"
  blocked('test-workers', run(root, inside), /boundedCommands de ops\.config\.json/)

  declare(['acme-run.sh'])
  for (const command of [inside, `scripts/${inside}`, `/opt/acme/bin/${inside}`, `CI=1 ./${inside}`,
    'acme-run.sh -C web sh -c "npx vitest run"',
    // El segundo comando real: el runner va después de un separador, pero adentro de las comillas.
    "acme-run.sh -C api sh -c 'pnpm exec tsc --noEmit; pnpm lint; pnpm exec jest src/decisions'",
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
  for (const command of [
    'npx jest', 'jest src/', "otro-run.sh -C api sh -c 'npx jest'",
    // Lo acotado es ese comando: lo que va después del separador corre afuera.
    "acme-run.sh -C api sh -c 'pnpm lint'; npx jest", 'acme-run.sh -C api true && npx vitest run',
    'echo acme-run.sh; npx jest',
  ]) blocked('test-workers', run(root, command), /sin cota de workers/)

  // Con más de una palabra, tienen que coincidir todas: `docker compose exec` no es `docker compose run`.
  declare(['docker compose exec'])
  assert.doesNotThrow(() => execute('test-workers', run(root, "docker compose exec api sh -c 'npx jest'")))
  blocked('test-workers', run(root, "docker compose run api sh -c 'npx jest'"), /sin cota de workers/)
  blocked('test-workers', run(root, "docker run api sh -c 'npx jest'"), /sin cota de workers/)

  const C = require('../../engine/config/validate')
  assert.ok(C.validateOpsConfig({ project: 'x', mode: 'embedded', boundedCommands: ['acme-run.sh', ''] })
    .includes('ops.config.json: boundedCommands debe ser una lista de comandos, tal como se escriben'))
  assert.ok(!C.validateOpsConfig({ project: 'x', mode: 'embedded', boundedCommands: ['acme-run.sh'] })
    .some((one) => /boundedCommands/.test(one)))
})
