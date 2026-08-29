'use strict'

// La publicación: que la versión salga del CHANGELOG y no de una mano, que el tag y el manifiesto
// digan lo mismo, y que la credencial sea OIDC y no un token guardado. Es el único workflow que
// escribe fuera del repositorio, y por eso lo que se le exige es distinto.

const { tempRoot, run, workflow, workflowStep } = require('./environment')
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
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'release-pr.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /grep -m1 -oE .*CHANGELOG\.md/, 'la versión sale del encabezado más nuevo')
  assert.equal(/npm version|semantic-release|conventional/i.test(source), false,
    'y no de contar commits ni de una herramienta que reescriba el CHANGELOG')

  // El PR toca `package.json` y nada más: si trae otra cosa, alguien empujó a la rama de release.
  assert.match(source, /grep -v -F 'package\.json'/, 'el diff del PR se acota a la versión')

  // El tag lo empuja una persona, y la razón es un mecanismo verificado, no una preferencia: un tag
  // empujado con GITHUB_TOKEN no dispararía `release.yml`, así que automatizarlo pediría un PAT
  // guardado — justo la credencial que `release.yml` evita publicando por OIDC.
  // Se mira lo que se ejecuta, no lo que se escribe: el cuerpo del PR le dice a la persona qué comando
  // correr, así que la cadena `git tag …` aparece en el archivo y no es el bot tagueando. Las líneas del
  // cuerpo empiezan con comilla; las que se ejecutan, no.
  const empuja = source.split('\n').map((one) => one.trim())
    .filter((one) => one.startsWith('git push'))
  assert.deepEqual(empuja, ['git push --force-with-lease origin "$branch"'],
    'lo único que el workflow empuja es la rama del PR')

  // `--force-with-lease` se niega con «stale info» cuando no conoce el estado remoto de la rama, y la
  // rama se crea desde main en cada corrida. Falla justo en la segunda —cuando ya existe allá y no
  // acá—, que es la que importa: la primera pudo haber fallado después de empujarla.
  assert.match(source, /git fetch origin "\$branch"/, 'se trae la referencia antes de empujar con lease')
  // El comentario envuelve, así que se contrasta sobre el texto sin los saltos ni las almohadillas.
  const prosa = source.split('\n').map((one) => one.replace(/^\s*#\s?/, '')).join(' ')
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

// La release no vuelve a preguntar después del tag, así que sus dos guardas son lo único que separa
// una publicación correcta de una que ya no se puede deshacer: npm no republica una versión. Se
// prueban ejecutándolas, porque lo que falla no es el texto sino lo que el texto hace.
test('la release no publica si el tag y package.json no dicen lo mismo', { skip: process.platform === 'win32' }, () => {
  const step = workflowStep(workflow('release'), 'id: version')
  assert.ok(step.length, 'no se encontró el paso que compara el tag')

  const repo = tempRoot('cauce-release-')
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }))
  const run = (ref) => spawnSync('bash', ['-c', step], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_NAME: ref, GITHUB_OUTPUT: path.join(repo, 'out') },
  })

  const ok = run('v1.2.3')
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(fs.readFileSync(path.join(repo, 'out'), 'utf8'), /^version=1\.2\.3$/m, 'la versión sale del árbol')

  // El caso que importa: el tag de una versión que el árbol no tiene. Publicarla dejaría npm y la
  // historia contando cosas distintas, y no hay vuelta atrás.
  const wrong = run('v9.9.9')
  assert.notEqual(wrong.status, 0, 'un tag que no coincide detiene la publicación')
  assert.match(wrong.stderr, /no coincide/, 'y dice por qué')
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
  // El tag es el acto humano que R10 exige. Un `push` a una rama publicaría sin que nadie lo decida.
  assert.match(source, /^ {4}tags: \['v\*'\]$/m, 'sólo un tag dispara la publicación')
  assert.equal(/branches:/.test(source), false, 'ninguna rama publica')
})
