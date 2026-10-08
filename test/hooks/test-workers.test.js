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
    // Con una comilla escapada adentro, que es como frenó en una instancia (caso 312).
    'grep -n "\\"test\\|jest" package.json',
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
  for (const command of ["sh -c 'npx jest'", 'bash -lc "cd api && vitest run"', 'grep -q x y; npx jest',
    'grep "a\\"b" x; npx jest']) {
    blocked('test-workers', run(root, command), /sin cota de workers/)
  }
})

// Caso 313. Un contenedor con tope de memoria y de CPU no puede tirar la máquina. Hacen falta los dos, con un
// número que acote, y entre las opciones del propio `run`.
test('un runner dentro de un contenedor con tope de memoria y de CPU no se frena', () => {
  const root = pushRoot('cauce-workers-contenedor-')
  const inside = "node:24 sh -c 'pnpm exec jest --config e2e.json'"
  for (const command of [
    `docker run --rm --memory 4g --memory-swap 4g --cpus 4 --pids-limit 4096 ${inside}`,
    "docker run --rm --memory=4g --cpus=2.5 node:24 sh -c 'npx jest'",
    "podman run -m 512m --cpus 2 node:24 sh -c 'npx vitest run'",
    'docker run --memory 4g --cpus 4 node:24 bash -lc "cd api && npx jest"',
    `/usr/bin/docker run -e "A=b c" --memory 4g --cpus 4 ${inside}`,
    `cd api && DOCKER_HOST=x docker run --memory 4g --cpus 4 ${inside}`,
    // Una variable para el contenedor, antes de los topes: es el valor de su opción, no una palabra de más.
    `A=1 B=2 docker run --rm -e NODE_ENV=test --label a=b --memory 2g --cpus 2 ${inside}`,
    // Como se escribe uno largo: en varios renglones, con sudo, con una sustitución ya cerrada entre las opciones.
    `sudo docker run --rm -it \\\n  --memory 4G \\\n  --cpus .5 \\\n  -v "$(pwd)":/app ${inside}`,
    // Y lo que el script trae entre comillas simples lo ejecuta el contenedor, sustituciones incluidas.
    "docker run --memory 4g --cpus 4 node:24 sh -c 'echo $(npx jest)'",
    // Un comentario al principio no cambia quién lanza lo del renglón siguiente.
    `# don't forget the cap\ndocker run --memory 4g --cpus 4 ${inside}`,
    // Un `#` pegado a una palabra no es comentario, y una sustitución escapada la resuelve el contenedor.
    `docker run --memory 4g --cpus 4 -e TAG=a#b ${inside}`,
    'docker run --memory 4g --cpus 4 node:24 sh -c "echo \\$(npx jest)"',
    // Una sustitución que ya cerró no cambia quién lanza: ni detrás de un separador, ni con los suyos adentro.
    `cd api && docker run --memory 4g --cpus 4 -v "$(pwd)":/app ${inside}`,
    `docker run --memory 4g --cpus 4 -v "$(cd ..; pwd)":/app -e N=$((1+2)) -e M="$( (cd x) )" ${inside}`,
    `docker run --memory 4g --cpus 4 -e A=\`id -u; true\` -e B=$'it\\'s' -e C="<(" ${inside}`,
    'docker run --memory 4g --cpus 4 node:24 sh -c "echo $(true); npx jest"',
    `true;# don't wait\ndocker run --memory 4g --cpus 4 ${inside}`,
    // Y adentro de una, el comando de afuera es el suyo.
    `out="$(docker run --memory 4g --cpus 4 ${inside})"`,
    `diff <(docker run --memory 4g --cpus 4 ${inside}) esperado`,
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
  // Cada opción que va sola, de la ayuda de las dos herramientas: ninguna se lleva la palabra que sigue.
  for (const lone of ['--detach', '--disable-content-trust', '--env-host', '--help', '--http-proxy', '--init',
    '--interactive', '--no-healthcheck', '--no-hosts', '--oom-kill-disable', '--passwd', '--privileged',
    '--publish-all', '--quiet', '--read-only', '--read-only-tmpfs', '--replace', '--rm', '--rmi', '--rootfs',
    '--sig-proxy', '--tls-verify', '--tty', '--unsetenv-all', '-d', '-i', '-t', '-P', '-q', '-dit']) {
    const command = `podman run --memory 4g ${lone} --cpus 4 ${inside}`
    assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
    // Y por eso lo que venga después de la imagen ya no es de `run`.
    blocked('test-workers', run(root, `docker run ${lone} img --memory 4g --cpus 4 sh -c 'npx jest'`),
      /sin cota de workers/)
  }
  for (const command of [
    `docker run --rm ${inside}`,
    `docker run --rm --memory 4g ${inside}`,
    `docker run --rm --cpus 4 ${inside}`,
    // Otra bandera que empieza igual no es el tope, y un tope en cero o sin número tampoco.
    `docker run --rm --memory-swap 4g --cpus 4 ${inside}`,
    `docker run --rm --memory 4g --cpu-shares 512 ${inside}`,
    `docker run --rm --memory 0 --cpus 4 ${inside}`,
    `docker run --rm --memory 4g --cpus 0.0 ${inside}`,
    `docker run --rm --memory $MEM --cpus 4 ${inside}`,
    // Adentro del script, o en otro comando del renglón, las banderas no acotan a nadie.
    "docker run --rm node:24 sh -c 'echo --memory 4g --cpus 4 ; pnpm exec jest'",
    'docker run --memory 4g --cpus 4 node:24 true; npx jest',
    `echo docker run --memory 4g --cpus 4; sh -c 'npx jest'`,
    // Y sólo `run` de docker o de podman: `exec` no acota, y de otro programa no se sabe qué hace con ellas.
    `docker exec --memory 4g --cpus 4 api sh -c 'npx jest'`,
    `docker compose run --memory 4g --cpus 4 api sh -c 'npx jest'`,
    `nerdctl run --memory 4g --cpus 4 ${inside}`,
    // Una opción corta que lleva valor se lo lleva, aunque el valor tenga forma de tope.
    `docker run -v --memory 4g --cpus 4 ${inside}`,
    `docker run --memory 4abc --cpus 4 ${inside}`,
    `docker run --memory 4,5 --cpus 4 ${inside}`,
    // Adentro de una sustitución la lectura vuelve a empezar: sus separadores cortan aunque afuera haya comillas.
    'out="$(docker run --memory 4g --cpus 4 node:24 true; npx jest)"',
    'echo "$(docker run --memory 4g --cpus 4 node:24 true && npx jest)"',
    `docker run --memory 4g --cpus 4 node:24 sh -c "echo $(echo ')'; npx jest)"`,
    'docker run --memory 4g --cpus 4 node:24 echo "$(echo "a)"; npx jest)"',
    'docker run --memory 4g --cpus 4 node:24 sh -c "echo $(echo $((1+2)); npx jest)"',
    'docker run --memory 4g --cpus 4 node:24 echo "$( (cd x); npx jest)"',
    'docker run --memory 4g --cpus 4 node:24 tee >(npx jest)',
    "docker run --memory 4g --cpus 4 node:24 echo `sh -c 'npx jest'`",
    'docker run --memory 4g --cpus 4 node:24 echo "`true; npx jest`"',
    "docker run --memory 4g --cpus 4 -e A=\\\\$(sh -c 'npx jest') node:24 true",
    // Lo que no es una sustitución no se lleva el separador que sigue.
    `docker run --memory 4g --cpus 4 node:24 echo "<(" ; x=")" sh -c 'npx jest'`,
    "docker run --memory 4g --cpus 4 node:24 echo $'a\\'b'; npx jest",
    "docker run --memory 4g --cpus 4 node:24 true;# don't wait\nnpx jest",
    'docker run node:24 bash -c "echo --memory 4g --cpus 4 ; npx jest"',
    // Después de la imagen las banderas son del programa de adentro, y el valor de otra opción no es una bandera.
    "docker run --rm node:24 env --memory 4g --cpus 4 sh -c 'npx jest'",
    `docker run --label --cpus 4 -m 4g ${inside}`,
    "docker run --rm -e A=b node:24 --memory 1g --cpus 1 sh -c 'npx jest'",
    // Repetido, tiene que acotar cada vez; y el número tiene que ser un número.
    `docker run --memory 4g --memory 0 --cpus 4 ${inside}`,
    `docker run --memory 4g --cpus 4 --cpus=0 ${inside}`,
    `docker run --memory 4g --cpus 4,5 ${inside}`,
    `docker run --memory 4g --cpus 4abc ${inside}`,
    `docker run --MEMORY 4g --cpus 4 ${inside}`,
    `docker run -M 4g --cpus 4 ${inside}`,
    // Lo que va en una sustitución lo ejecuta esta máquina, no el contenedor.
    'docker run --memory 4g --cpus 4 node:24 true $(npx jest)',
    'docker run --memory 4g --cpus 4 node:24 sh -c "echo $(npx jest)"',
    'docker run --memory 4g --cpus 4 -v $(npx jest):/x node:24 true',
    'docker run --memory 4g --cpus 4 node:24 cat <(npx jest)',
    // Una comilla que el shell no abre no esconde el separador que sigue.
    "docker run --memory 4g --cpus 4 node:24 echo it\\'s done; npx jest",
    "docker run --memory 4g --cpus 4 node:24 true # don't wait\nnpx jest",
    "docker run --memory 4g --cpus 4 node:24 true # don't wait\nsh -c 'npx jest'",
    // Lo que sigue a un `#` en el mismo renglón es comentario, haya o no otro renglón después.
    "docker run --memory 4g --cpus 4 node:24 true # nota; sh -c 'npx jest'",
    "docker run --memory 4g --cpus 4 node:24 true # nota; sh -c 'npx jest'\necho listo",
    // El segundo runner del renglón se juzga aunque el primero esté acotado.
    `docker run --memory 4g --cpus 4 ${inside}; npx jest`,
  ]) blocked('test-workers', run(root, command), /sin cota de workers/)
})

// Caso 329. El runner que un contenedor recibe como su comando, sin `sh -c`, no estaba en posición de comando:
// la forma más corta pasaba sin ningún tope y la otra frenaba. Se le pide lo mismo que a la otra.
test('un runner pasado directo a un contenedor se juzga como el que va detrás de sh -c', () => {
  const root = pushRoot('cauce-workers-directo-')
  for (const command of [
    'docker run --rm node:24 npx jest',
    'docker run --rm -v "$PWD":/app -w /app node:24 jest --config e2e.json',
    'docker run --rm node:24 pnpm exec vitest run', 'podman run --rm node:24 yarn jest',
    'docker run --rm node:24 pnpm vitest', 'docker run --rm node:24 bunx jest',
    'docker run --rm node:24 ./node_modules/.bin/jest', 'sudo docker run --rm node:24 npx jest',
    'cd api && time docker run --rm node:24 npx jest', 'CI=1 /usr/bin/docker run --rm node:24 npx jest',
    'docker run --rm \\\n  -v "$(pwd)":/app \\\n  node:24 npx jest', 'echo listo; docker run node:24 npx jest',
    // Un separador adentro de una opción entrecomillada no corta el comando del contenedor.
    'docker run --rm -e "A=b; c" node:24 npx jest',
    // Con un solo tope, o con los topes después de la imagen, el contenedor no está acotado.
    'docker run --rm --memory 4g node:24 npx jest', 'docker run --rm node:24 npx jest --memory 4g --cpus 2',
    // Y `sudo` o `time` delante de un runner suelto no lo esconden.
    'time npx jest', 'sudo npx vitest run', 'sudo time npx jest', 'timeout 300 npx jest',
    'time CI=1 docker run --rm node:24 npx jest', 'timeout 10m sudo docker run --rm node:24 npx jest',
    // Una sustitución en una opción es una sola palabra, y el paréntesis de un subshell no es del runner.
    'docker run --rm -u $(id -u) -v $(pwd):/app -w /app node:24 npx jest',
    '(docker run --rm node:24 npx jest)', 'out=$(docker run --rm node:24 npx jest)',
    'out=$(podman run --rm node:24 yarn jest)', 'docker run --rm -u $(id -u $(whoami)) node:24 npx jest',
    // El programa de `--entrypoint` es el comando del contenedor.
    'docker run --rm --entrypoint jest node:24', 'docker run --entrypoint=vitest --rm node:24 run',
  ]) blocked('test-workers', run(root, command), /sin cota de workers[^]*--memory y --cpus antes de la imagen/)
  for (const command of [
    'docker run --rm --memory 4g --cpus 2 node:24 npx jest', 'sudo podman run -m 1g --cpus 1 node:24 yarn jest',
    'docker run --rm node:24 npx jest --maxWorkers=2', 'docker run --rm node:24 npx vitest run --no-file-parallelism',
    'docker run --rm node:24 npx jest --version',
    // `jest` en otro lugar que el comando del contenedor no es correrlo.
    'docker run --rm jest', 'docker run --rm acme/jest-runner:1 npm test', 'docker run --rm node:24 echo jest',
    'docker run --rm node:24 npm test', 'docker run --rm --name jest -e TOOL=jest node:24 node server.js',
    'docker build -t jest .', 'docker run --rm node:24 npx tsc jest', 'docker run --rm node:24 pnpm exec tsc',
    'docker run --rm -e "A=b npx jest" node:24 node server.js', 'docker images | grep jest',
    // Lo que no es un `docker run`, aunque empiece igual o esté citado, no se juzga ni rompe el guard.
    'docker run-tests img npx jest', 'docker run>log', '(docker run)', 'echo docker run img npx jest',
    '# antes: sh -c "docker run node npm test"\ndocker run --rm node:24 npm test',
    'ls # bash -c "docker run img npx jest"',
    // Con `--entrypoint`, lo que sigue a la imagen son argumentos de ese programa.
    'docker run --rm --entrypoint which node:24 jest', 'docker run --entrypoint=ls --rm node:24 vitest',
    // Una sustitución anidada, o un paréntesis escapado, no cortan el comando antes de su cota.
    'docker run --rm node:24 npx jest --findRelatedTests $(git diff --name-only $(git merge-base HEAD main)) -w 2',
    'docker run --rm node:24 npx jest -t foo\\(bar\\) --runInBand',
    'timeout 300 docker run --rm --memory 4g --cpus 2 node:24 npx jest',
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
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
    // Con `sudo` o `time` delante sigue siendo ese comando (caso 329).
    `sudo ${inside}`, `time CI=1 scripts/${inside}`, `sudo time ${inside}`, `timeout 600 ${inside}`,
  ]) assert.doesNotThrow(() => execute('test-workers', run(root, command)), command)
  for (const command of [
    'npx jest', 'jest src/', "otro-run.sh -C api sh -c 'npx jest'",
    // Lo acotado es ese comando: lo que va después del separador corre afuera.
    "acme-run.sh -C api sh -c 'pnpm lint'; npx jest", 'acme-run.sh -C api true && npx vitest run',
    'echo acme-run.sh; npx jest',
    "sudo otro-run.sh -C api sh -c 'npx jest'", "sudo sh -c 'npx jest'",
    // Tampoco adentro de una sustitución entre comillas (caso 313).
    'out="$(acme-run.sh -C api true; npx jest)"', 'echo "res: $(acme-run.sh -C api true | npx jest)"',
  ]) blocked('test-workers', run(root, command), /sin cota de workers/)

  // Quien declaró el comando con su envoltorio declaró ese comando entero, y sigue valiendo.
  declare(['sudo acme-run.sh', 'time'])
  assert.doesNotThrow(() => execute('test-workers', run(root, `sudo ${inside}`)))
  assert.doesNotThrow(() => execute('test-workers', run(root, "time sh -c 'npx jest'")))
  blocked('test-workers', run(root, "sudo otro.sh sh -c 'npx jest'"), /sin cota de workers/)

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
