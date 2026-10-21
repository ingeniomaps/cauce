'use strict'

// La publicación: que la versión salga del CHANGELOG y no de una mano, que el tag y el manifiesto
// digan lo mismo, y que la credencial sea OIDC y no un token guardado. Es el único workflow que
// escribe fuera del repositorio, y por eso lo que se le exige es distinto.

const { tempRoot, workflow, workflowStep } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// El número de versión se lee, no se calcula. La regla del repo es «un cambio en el protocolo, en las
// reglas del sistema o en un guard sube minor aunque no toque una sola línea de código», o sea que mide
// qué le cambia a quien recibe el `upgrade` y no qué se tocó acá. Contar `feat:` contra `fix:` se
// equivocaría en las dos direcciones: una regla nueva en `template/` es cero código y sube minor, y tres
// workflows cambiados no mueven nada porque la empresa no los recibe.
test('la versión sale del CHANGELOG y el tag no lo empuja el bot', () => {
  const file = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'release-pr.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /grep -m1 -oE .*CHANGELOG\.md/, 'la versión sale del encabezado más nuevo')
  assert.equal(/npm version|semantic-release|conventional/i.test(source), false,
    'y no de contar commits ni de una herramienta que reescriba el CHANGELOG')

  // El PR toca `package.json` y nada más: si trae otra cosa, alguien empujó a la rama de release.
  assert.match(source, /grep -v -F 'package\.json'/, 'el diff del PR se acota a la versión')

  // El bot no empuja ni taguea nada fuera de la rama del PR: lo que publica es el merge de una persona,
  // y un push del GITHUB_TOKEN no dispararía `release.yml`. Se mira lo que se ejecuta —las líneas que
  // empiezan con el comando—, no lo que el cuerpo del PR le cuenta a quien lo lee.
  const empuja = source.split('\n').map((one) => one.trim())
    .filter((one) => one.startsWith('git push') || one.startsWith('git tag'))
  assert.deepEqual(empuja, ['git push --force-with-lease origin "$branch"'],
    'lo único que el workflow empuja es la rama del PR')

  // `--force-with-lease` se niega con «stale info» cuando no conoce el estado remoto de la rama, y la
  // rama se crea desde main en cada corrida. Falla justo en la segunda —cuando ya existe allá y no
  // acá—, que es la que importa: la primera pudo haber fallado después de empujarla.
  assert.match(source, /git fetch origin "\$branch"/, 'se trae la referencia antes de empujar con lease')
  // Por qué alcanza con el merge vive en `release.yml`, con su cita. El comentario envuelve, así que se
  // contrasta sobre el texto sin los saltos ni las almohadillas.
  const prosa = workflow('release').split('\n').map((one) => one.replace(/^\s*#\s?/, '')).join(' ')
  assert.match(prosa, /will not create a new workflow run/, 'deja escrito por qué, con su cita')
  assert.match(prosa, /docs\.github\.com/, 'y de dónde salió')
  assert.match(source, /Falta el tag/, 'lo que sí hace es avisar cuando la versión quedó sin taguear')

  // Sólo hacia adelante. La condición era «distintas», y con `package.json` por delante del CHANGELOG
  // eso abría un PR que bajaba la versión — proponiendo pisar npm con un número ya publicado.
  assert.match(source, /sort -V \| tail -1/, 'se comparan como versiones, no como cadenas')
  assert.match(source, /va por delante del CHANGELOG/, 'y frena diciendo qué falta')

  // Los tags alcanzan: con `fetch-depth: 0` se traía el repo entero en cada push a main.
  assert.match(source, /fetch-tags: true/)
  // Sobre las líneas que se ejecutan: el comentario nombra `fetch-depth: 0` para decir qué se sacó.
  const opciones = source.split('\n').map((one) => one.trim()).filter((one) => !one.startsWith('#'))
  assert.equal(opciones.some((one) => /^fetch-depth:/.test(one)), false, 'sin clonar la historia completa')
})

// La release no vuelve a preguntar después del merge, y npm no republica una versión: lo que decide qué
// falta es lo único que separa publicar de intentar pisar algo que ya salió. Se prueba ejecutándolo con
// un `git` y un `npm` falsos, porque lo que falla no es el texto sino lo que el texto decide.
test('la release publica sólo lo que todavía no salió', { skip: process.platform === 'win32' }, () => {
  const step = workflowStep(workflow('release'), 'id: version')
  assert.ok(step.length, 'no se encontró el paso que decide')

  const repo = tempRoot('cauce-release-')
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: '@x/y', version: '1.2.3' }))
  const bin = path.join(repo, 'bin')
  fs.mkdirSync(bin)
  // Lo que contesta el `npm view` real, medido con npm 11.16.0: la versión por `stdout`, o `E404` por `stderr`
  // cuando no está —también mientras el registro todavía no muestra la que se acaba de publicar (caso 425)—.
  const answers = {
    yes: 'echo 1.2.3',
    no: 'echo "npm error code E404" >&2; echo "npm error 404 No match found for version 1.2.3" >&2; exit 1',
    down: 'echo "npm error code ECONNREFUSED" >&2; exit 1',
  }
  const attempt = ({ tagged, npm }) => {
    fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env bash\nexit ${tagged ? 0 : 2}\n`, { mode: 0o755 })
    fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env bash\n${answers[npm]}\n`, { mode: 0o755 })
    const out = path.join(repo, 'out')
    fs.rmSync(out, { force: true })
    const done = spawnSync('bash', ['-c', step], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: out },
    })
    return { done, out }
  }
  const decide = (state) => {
    const { done, out } = attempt(state)
    assert.equal(done.status, 0, done.stderr)
    return Object.fromEntries(fs.readFileSync(out, 'utf8').trim().split('\n').map((one) => one.split('=')))
  }

  assert.deepEqual(decide({ tagged: false, npm: 'no' }), { version: '1.2.3', release: 'true', published: 'false' },
    'una versión nueva se publica')
  assert.deepEqual(decide({ tagged: false, npm: 'yes' }), { version: '1.2.3', release: 'true', published: 'true' },
    'si npm ya la tiene, falta sólo la release: no se republica')
  assert.deepEqual(decide({ tagged: true, npm: 'yes' }), { version: '1.2.3', release: 'false' },
    'con su tag, ya salió entera y no se toca')
  // Sin poder preguntarle a npm, «no está» sería una suposición, y publicar sobre ella corre la puerta entera
  // para terminar rechazado si la versión ya salió.
  const down = attempt({ tagged: false, npm: 'down' })
  assert.notEqual(down.done.status, 0, 'un npm que no contesta no se lee como una versión sin publicar')
  assert.match(down.done.stderr, /No se pudo preguntarle a npm/, 'y dice por qué frena')
  assert.match(down.done.stderr, /ECONNREFUSED/, 'con lo que contestó npm')
  assert.equal(/published=/.test(fs.readFileSync(down.out, 'utf8')), false, 'sin decidir nada')

  // Las dos salidas gobiernan los pasos que escriben afuera: sin esto, decidir no frenaría nada.
  const source = workflow('release')
  const gate = "steps\\.version\\.outputs\\.release == 'true' && steps\\.version\\.outputs\\.published != 'true'"
  assert.match(source, new RegExp(`- name: Publish to npm\\n(?:\\s+id: publish\\n)?\\s+if: ${gate}`))
  assert.match(source, /- name: Create GitHub release\n\s+if: steps\.version\.outputs\.release == 'true'/)
})

// Caso 425: con el rechazo de npm y la versión a la vista, el paso sigue a la release. El porqué, en el paso
// `Publish to npm` de `release.yml`.
const unix = { skip: process.platform === 'win32' }
test('un publish que npm rechaza porque la versión ya salió sigue a la release', unix, () => {
  const step = workflowStep(workflow('release'), 'id: publish')
  assert.ok(step.length, 'no se encontró el paso que publica')

  const repo = tempRoot('cauce-publish-')
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: '@x/y', version: '1.2.3' }))
  const bin = path.join(repo, 'bin')
  fs.mkdirSync(bin)
  // `sleep` falso: la espera es entre consultas al registro, y acá no hay registro que esperar.
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  const conflict = 'echo "npm error You cannot publish over the previously published versions: 1.2.3." >&2; exit 1'
  const run = ({ publish, view }) => {
    const calls = path.join(repo, 'calls')
    fs.writeFileSync(calls, '')
    fs.writeFileSync(path.join(bin, 'npm'), [
      '#!/usr/bin/env bash', `echo "$1" >> ${JSON.stringify(calls)}`,
      `case "$1" in publish) ${publish} ;; view) ${view} ;; esac`, '',
    ].join('\n'), { mode: 0o755 })
    const done = spawnSync('bash', ['-e', '-c', step], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERSION: '1.2.3' },
    })
    return { ...done, calls: fs.readFileSync(calls, 'utf8').trim().split('\n') }
  }

  const fresh = run({ publish: 'echo "+ @x/y@1.2.3"', view: 'exit 1' })
  assert.equal(fresh.status, 0, fresh.stderr)
  assert.deepEqual(fresh.calls, ['publish'], 'un publish que sale no pregunta nada más')

  const late = run({ publish: conflict, view: 'echo 1.2.3' })
  assert.equal(late.status, 0, `${late.stdout}${late.stderr}`)
  assert.match(late.stdout, /ya estaba en npm/, 'dice que la versión ya había salido')
  assert.deepEqual(late.calls, ['publish', 'view'], 'y lo confirma con el registro, sin volver a publicar')

  // Lo que falla por otra razón falla como antes, sin esperar a un registro que no tiene nada que mostrar.
  const broken = run({ publish: 'echo "npm error code ELIFECYCLE" >&2; exit 3', view: 'echo 1.2.3' })
  assert.equal(broken.status, 3, 'la puerta en rojo deja el paso en rojo')
  assert.deepEqual(broken.calls, ['publish'], 'sin preguntarle nada al registro')

  // npm dice que la versión existe y el registro nunca la muestra: no se anuncia lo que nadie puede instalar.
  const missing = run({ publish: conflict, view: 'echo "npm error code E404" >&2; exit 1' })
  assert.notEqual(missing.status, 0, 'sin la versión a la vista no hay release')
  assert.match(missing.stderr, /no la muestra/, 'y dice qué falta')
  assert.ok(missing.calls.filter((one) => one === 'view').length > 1, 'después de volver a preguntar')

  const gate = "steps\\.version\\.outputs\\.release == 'true' && steps\\.version\\.outputs\\.published != 'true'"
  assert.match(workflow('release'), new RegExp(`- name: Publish to npm\\n\\s+id: publish\\n\\s+if: ${gate}`),
    'y sigue siendo el paso que sólo corre si falta publicar')
})

// `upgrade` le imprime la entrada del CHANGELOG a quien está por aplicar la versión. Sin entrada, la
// release sale muda y el que actualiza no tiene qué leer antes de que le reemplacen `system/`.
test('la release extrae su entrada del CHANGELOG y se detiene si falta', { skip: process.platform === 'win32' }, () => {
  const step = workflowStep(workflow('release'), 'id: notes')
  assert.ok(step.length, 'no se encontró el paso que extrae la entrada')

  const repo = tempRoot('cauce-notes-')
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), [
    '# Changelog', '', '## [1.2.3] - 2099-01-01', '', '### Cambiado', '', '- lo de esta versión', '',
    '## [1.2.2] - 2098-12-31', '', '- lo de la anterior', '',
  ].join('\n'))
  const run = (version) => spawnSync('bash', ['-c', step], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, VERSION: version },
  })

  assert.equal(run('1.2.3').status, 0)
  const notes = fs.readFileSync(path.join(repo, 'notes.md'), 'utf8')
  assert.match(notes, /lo de esta versión/, 'trae su propia entrada')
  assert.equal(notes.includes('lo de la anterior'), false, 'y se corta en la versión siguiente')
  assert.equal(notes.includes('## [1.2.3]'), false, 'sin repetir el encabezado que la release ya pone')

  const missing = run('4.5.6')
  assert.notEqual(missing.status, 0, 'una versión sin entrada no se publica')
  assert.match(missing.stderr, /no tiene entrada/, 'y dice por qué')
})

// Publicar sin NPM_TOKEN es el punto: la credencial es el token OIDC que GitHub emite para esa
// corrida y no sobrevive a ella. Un secreto de npm en este archivo sería volver a lo que se sacó.
test('la release se autentica por OIDC y no guarda un token de npm', () => {
  const source = workflow('release')
  assert.match(source, /^ {6}id-token: write$/m, 'pide el token OIDC del trusted publishing')
  // Sin los comentarios: el archivo explica por qué no hay NPM_TOKEN, y nombrarlo para explicarlo no
  // es usarlo. Lo que la prueba tiene que mirar es lo que el workflow ejecuta.
  const code = source.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n')
  assert.equal(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./.test(code), false, 'y no hay ningún secreto guardado')
  // El merge del PR de release es el acto humano que R10 exige: un push a `main` que cambia la versión.
  // Cualquier otro push no tiene nada que publicar, y un tag ya no dispara nada — lo crea la release.
  assert.match(source, /^ {2}push:\n {4}branches: \[main\]\n(?: {4}#.*\n)* {4}paths: \[package\.json\]$/m,
    'sólo un cambio de versión en main dispara la publicación')
  assert.equal(/tags:/.test(source), false, 'un tag ya no publica')
})
