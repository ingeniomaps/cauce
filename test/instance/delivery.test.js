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
  const dictates = ['README.md', path.join('template', 'Makefile'),
    path.join('engine', 'cli', 'instance.js'), path.join('engine', 'hooks', 'files.js')]
  let found = 0
  for (const file of dictates) {
    const body = fs.readFileSync(path.join(root, file), 'utf8')
    const hits = body.match(invocation) || []
    assert.ok(hits.length, `${file} dicta el comando y hay que revisarlo acá`)
    for (const hit of hits) {
      assert.match(hit, /--save-exact/, `${file} dicta el comando sin el pin: ${hit}`)
      found += 1
    }
  }
  assert.ok(found >= dictates.length, 'se revisó al menos una invocación por archivo')
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
