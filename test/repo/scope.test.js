'use strict'

// El alcance declarado de una puerta, probado sin levantar un guard. Vive en su propio módulo
// justamente para esto: la decisión —¿este delta puede cambiar el veredicto?— es una función de rutas y
// patrones, y mezclarla con el guard obligaría a materializar un repositorio para ejercer cada borde.
//
// Lo que se fija acá son los bordes que apagan el aislamiento en silencio. Un alcance escrito de menos
// no falla: deja de materializar cuando hacía falta, y el verde pasa a calcularse sobre código que
// nadie va a commitear, que es el defecto que `commitTree` existe para cerrar.

const test = require('node:test')
const assert = require('node:assert/strict')
const SC = require('../../engine/core/scope')

const raiz = (scope) => [{ name: 'web', path: '.', ...(scope ? { scope } : {}) }]
const alcanza = (scope, files, repo = '/p') => SC.reachesGate(raiz(scope), repo, files)

// La compatibilidad, que es la mitad del diseño: el campo baja a todos los consumidores en su próximo
// `upgrade` y ninguno lo declara todavía. Si esto se rompe, el arreglo dejó de ser opcional.
test('sin scope declarado, cualquier delta cuenta — como antes de que el campo existiera', () => {
  assert.equal(alcanza(null, ['NOTAS.md']), true)
  assert.equal(alcanza(null, ['lo/que/sea.txt']), true)
})

test('con scope, sólo cuenta lo que la puerta lee', () => {
  assert.equal(alcanza(['src/**'], ['NOTAS.md']), false, 'un archivo ajeno no fuerza la copia')
  assert.equal(alcanza(['src/**'], ['src/app.ts']), true, 'uno que el gate abre, sí')
  assert.equal(alcanza(['src/**'], ['NOTAS.md', 'src/app.ts']), true, 'basta uno adentro')
})

// `*` dentro de un segmento y `**` cruzando segmentos no son lo mismo, y confundirlos es la forma más
// fácil de declarar un alcance que no cubre lo que su autor cree.
test('un asterisco no cruza la barra y dos sí', () => {
  assert.equal(alcanza(['src/*.ts'], ['src/app.ts']), true)
  assert.equal(alcanza(['src/*.ts'], ['src/hondo/app.ts']), false, '* no baja un nivel')
  assert.equal(alcanza(['src/**/*.ts'], ['src/hondo/app.ts']), true)
  // El cero: es la mitad que se escribe sola al traducir el patrón y que nadie extraña hasta que un
  // archivo en la raíz del alcance queda afuera. El porqué, en `toRegExp`.
  assert.equal(alcanza(['src/**/*.ts'], ['src/app.ts']), true, '**/ admite cero segmentos')
})

test('un patrón sin comodines es la ruta exacta', () => {
  assert.equal(alcanza(['package.json'], ['package.json']), true)
  assert.equal(alcanza(['package.json'], ['otro/package.json']), false)
  assert.equal(alcanza(['package.json'], ['package.json.bak']), false, 'ancla el final')
})

// Los tres casos que delatarían un escape incompleto, uno por familia: el punto que `ESCAPE` cubre y
// los paréntesis y el `+` que se olvidan primero al escribir esa lista a mano.
test('los metacaracteres de regex viajan como texto', () => {
  assert.equal(alcanza(['package.json'], ['packageXjson']), false)
  assert.equal(alcanza(['a+b/x.ts'], ['a+b/x.ts']), true)
  assert.equal(alcanza(['a(b)/x.ts'], ['a(b)/x.ts']), true)
})

test('la interrogación es un carácter y tampoco cruza la barra', () => {
  assert.equal(alcanza(['src/a?.ts'], ['src/ab.ts']), true)
  assert.equal(alcanza(['src/a?.ts'], ['src/abc.ts']), false)
  assert.equal(alcanza(['a?c'], ['a/c']), false, '? no se come una barra')
})

// `git status` escribe los directorios con barra final y nadie declara el alcance así. Si no se
// contemplara, declarar `build/**` y ver `?? build/` en el status dejaría la copia sin forzar.
test('un directorio del status entra por su forma sin barra', () => {
  assert.equal(alcanza(['build/**'], ['build/']), true)
  assert.equal(alcanza(['src/**'], ['src/']), true)
})

// En un monorepo el `scope` de `apps/web` habla de `src/**`, no de `apps/web/src/**`: lo escribe quien
// vive en esa raíz. Si se comparara contra la ruta del repositorio, todo alcance de un subdirectorio
// fallaría en silencio y la copia se forzaría siempre — el defecto de hoy, con un campo nuevo al lado.
test('el patrón es relativo a su raíz, no al repositorio', () => {
  const roots = [{ name: 'web', path: 'apps/web', scope: ['src/**'] }]
  assert.equal(SC.reachesGate(roots, '/p', ['apps/web/src/app.ts']), true)
  assert.equal(SC.reachesGate(roots, '/p', ['apps/web/README.md']), false)
})

// Por qué lo ajeno a toda raíz cuenta como adentro lo decide `reachesGate`, y está escrito ahí. Acá se
// fija el caso que lo delataría: una ruta que no cuelga de ninguna raíz **y** otra que sí cuelga pero
// queda fuera del alcance, juntas — si el default se invirtiera, la segunda taparía a la primera.
test('lo que no cuelga de ninguna raíz declarada fuerza la copia igual', () => {
  const roots = [{ name: 'web', path: 'apps/web', scope: ['src/**'] }]
  assert.equal(SC.reachesGate(roots, '/p', ['infra/deploy.yaml']), true)
  assert.equal(SC.reachesGate(roots, '/p', ['apps/web/README.md', 'infra/deploy.yaml']), true)
})

// Una raíz con alcance y otra sin él: la que no declara no restringe nada, así que cualquier ruta suya
// cuenta. Mezclar las dos formas tiene que dar el comportamiento viejo para la vieja.
test('una raíz sin scope no queda restringida por la que sí lo declara', () => {
  const roots = [
    { name: 'web', path: 'apps/web', scope: ['src/**'] },
    { name: 'api', path: 'apps/api' },
  ]
  assert.equal(SC.reachesGate(roots, '/p', ['apps/api/cualquiera.txt']), true)
  assert.equal(SC.reachesGate(roots, '/p', ['apps/web/README.md']), false)
})
