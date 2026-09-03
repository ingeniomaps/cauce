'use strict'

// Lo que el repositorio **declara** sobre lo que una instancia recibe, leído del árbol y de las fuentes
// en vez de montando una instancia. Es otro reloj que el de `upgrade.test.js`, que mide qué hace el
// comando cuando corre: acá lo que cambia es el contrato de entrega —qué archivo llega por qué vía, qué
// comando dictamos— y una divergencia no se ve corriendo nada, sólo comparando las dos mitades.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// «init fija la versión exacta, así que npm update no la mueve» es lo que el README da como razón para
// no saltear el primer paso del upgrade, y el comando que documentaba a continuación desarmaba esa
// premisa: npm guarda con caret por defecto, y dentro de 0.x el caret alcanza a los patches —los hay—.
// Lo que este caso cuida es que los tres lugares que dictan el comando lo dicten preservando el pin:
// el README, el atajo del molde y la salida de `--check`. Comprobado contra npm 11.16.0: con
// `--save-exact` el manifiesto queda en `0.55.0` y sin él en `^0.55.0`.
test('todo lo que documenta el upgrade preserva la versión exacta', () => {
  const root = path.resolve(__dirname, '..', '..')
  // La propiedad es que el flag esté, no en qué orden: `guard-engine` ya lo dictaba bien con las
  // banderas al revés, y buscar la forma literal lo habría dado por roto —o, peor, por ausente—.
  const invocation = /npm install[^\n'"`]*@ingeniomaps\/cauce@latest/g
  // Los archivos se buscan, no se listan: una lista se rompe al mover código de lugar —pasó— y lo que
  // se cuida es que ninguno dicte el comando sin el flag, esté donde esté. El CHANGELOG queda afuera
  // porque es un histórico: nombra a propósito la forma vieja al contar que cambió.
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .stdout.trim().split('\n')
    .filter((file) => /\.(js|md|sh|json)$/.test(file) || file.endsWith('Makefile'))
    .filter((file) => file !== 'CHANGELOG.md' && !file.startsWith('docs/issues/') && !file.startsWith('test/'))
  let found = 0
  const sueltos = []
  for (const file of tracked) {
    for (const hit of fs.readFileSync(path.join(root, file), 'utf8').match(invocation) || []) {
      found += 1
      if (!/--save-exact/.test(hit)) sueltos.push(`${file}: ${hit}`)
    }
  }
  assert.ok(found >= 4, 'el comando se dicta en varios lugares y hay que verlos todos')
  assert.deepEqual(sueltos, [], `dictan el comando sin el pin:\n  ${sueltos.join('\n  ')}`)
})

// `upgrade` sólo reemplaza lo del sistema y el runtime, así que un archivo propio del molde no llega a
// una instancia que ya existe por ninguna otra vía. Cada uno declara la suya en `TEMPLATE_OWN`, y esto
// es lo que obliga a decidirla: agregar un archivo al molde sin clasificarlo rompe la puerta.
//
// Sin esto pasó lo que tenía que pasar. 0.57.0 agregó `organization/workspace.md` y lo nombró tres
// veces desde un `AGENTS.md` que sí se reemplaza: la instancia que actualizaba quedaba leyendo una
// instrucción hacia un archivo que no tenía, y el arreglo llegaba entero sólo a las instancias nuevas.
test('cada archivo propio del molde declara cómo llega a una instancia que ya existe', () => {
  const root = path.resolve(__dirname, '..', '..')
  const O = require('../../engine/core/ownership')
  const tracked = spawnSync('git', ['ls-files', 'template'], { cwd: root, encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean).map((file) => file.replace(/^template\//, ''))
  assert.ok(tracked.length > 40, 'el recorrido tiene que ver el molde entero')

  const delSistema = (relative) => O.SYSTEM_FILES.includes(relative)
    || O.SYSTEM_COLLECTIONS.some((collection) => relative.startsWith(`${collection}/system/`))
    || O.RUNTIME_PATHS.some((base) => relative.startsWith(`${base}/`))

  const propios = tracked.filter((file) => !delSistema(file)).sort()
  const declarados = Object.keys(O.TEMPLATE_OWN).sort()
  assert.deepEqual(propios, declarados,
    'un archivo propio del molde sin declarar no llega a quien actualiza: decidí si toda instancia ya '
    + 'lo tiene (init) o si esta versión lo agrega (upgrade)')

  for (const [file, via] of Object.entries(O.TEMPLATE_OWN)) {
    assert.ok(['init', 'upgrade'].includes(via), `${file}: la vía es init o upgrade, no ${via}`)
  }

  // Y lo que el molde nombra como ruta tiene que existir en el molde: es por donde entró el caso, con
  // un `AGENTS.md` que apuntaba a un archivo que la instancia no tenía.
  const enElMolde = new Set(tracked)
  const rotas = []
  for (const file of tracked.filter((name) => name.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(root, 'template', file), 'utf8')
    for (const hit of text.matchAll(/`(organization\/[a-z][a-zA-Z0-9._-]*\.md)`/g)) {
      if (!enElMolde.has(hit[1])) rotas.push(`${file}: nombra ${hit[1]}, que el molde no trae`)
    }
  }
  assert.deepEqual(rotas, [])
})

// El Makefile es la superficie que el dev escribe a mano, y un rename del CLI no lo alcanza solo. Pasó
// con `teams/` → `flows/`: el cambio llegó al motor, al README y al CHANGELOG —que hasta le pide a cada
// usuario renombrar sus propias automatizaciones— y dejó `make team-check` y `make team-show` llamando
// a un comando que ya no existe, en toda instancia nueva o actualizada.
//
// Se compara contra el despacho del CLI y no contra una lista escrita acá: la lista envejecería con el
// mismo silencio que el Makefile.
test('ningún atajo del molde llama a un comando que el CLI no tiene', () => {
  const root = path.resolve(__dirname, '..', '..')
  const makefile = fs.readFileSync(path.join(root, 'template', 'Makefile'), 'utf8')
  const help = spawnSync(process.execPath, [path.join(root, 'engine', 'cli', 'ops.js'), '--help'],
    { encoding: 'utf8' })
  const acepta = new Set((`${help.stdout}${help.stderr}`.match(/^ {2}ops ([a-z-]+)/gm) || [])
    .map((line) => line.trim().split(' ')[1]))
  assert.ok(acepta.size > 8, 'el uso del CLI tiene que listar sus comandos')

  const rotos = []
  let mirados = 0
  for (const hit of makefile.matchAll(/ops\.js ([a-z-]+)/g)) {
    mirados += 1
    if (!acepta.has(hit[1])) rotos.push(`template/Makefile llama a "ops ${hit[1]}", que el CLI no tiene`)
  }
  assert.ok(mirados > 10, 'el molde envuelve varios comandos y hay que verlos todos')
  assert.deepEqual([...new Set(rotos)], [], `atajos rotos:\n  ${[...new Set(rotos)].join('\n  ')}`)
})

// Un workflow le dice a un agente dónde escribir, y esa instrucción envejece con el molde sin que nada
// falle: `/onboard` siguió mandando el mapa real a `AGENTS.md` después de que 0.57.0 lo sacara de ahí,
// así que el primer recorrido de una instancia nueva deshacía el arreglo. Es la misma clase que el
// Makefile llamando a un comando retirado, en la superficie que ejecuta un agente en vez de un dev.
//
// Se comprueba el par archivo-sección, no el archivo solo: lo que engaña es la ruta que existe con la
// sección que ya no.
test('ningún workflow manda a escribir en una sección que el molde no tiene', () => {
  const root = path.resolve(__dirname, '..', '..')
  const dir = path.join(root, 'automatization', 'workflows')
  const seccionesDe = (file) => {
    try {
      return new Set((fs.readFileSync(path.join(root, 'template', file), 'utf8')
        .match(/^##\s+(.+)$/gm) || []).map((line) => line.replace(/^##\s+/, '').trim()))
    } catch { return null }
  }

  const perdidas = []
  let miradas = 0
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    // `"## X" de ${ALGO}/ruta.md` y `${ALGO}/ruta.md … "## X"`: las dos formas que usan los recorridos.
    for (const hit of text.matchAll(/"##\s+([^"]+)"\s+de\s+\$\{[A-Z]+\}\/([a-zA-Z0-9/_.-]+\.md)/g)) {
      const [, seccion, ruta] = hit
      const secciones = seccionesDe(ruta) || seccionesDe(path.join('organization', ruta))
      if (!secciones) continue
      miradas += 1
      if (!secciones.has(seccion)) perdidas.push(`${name}: manda a "## ${seccion}" de ${ruta}, que no la tiene`)
    }
  }
  assert.deepEqual(perdidas, [], `secciones que el molde no tiene:\n  ${perdidas.join('\n  ')}`)
})
