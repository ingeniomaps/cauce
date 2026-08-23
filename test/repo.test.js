'use strict'

// Lo que este repositorio y su paquete se prometen a sí mismos: que la documentación no cite un comando
// que no existe, que el código siga sus propias convenciones y que el tarball no lleve lo que no debe.
//
// No prueba el producto sino su fábrica, y por eso no monta ninguna instancia. `ci.test.js` es el vecino
// que cubre la otra mitad de esa fábrica: la automatización de GitHub Actions.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Sin linter —el toolkit no tiene dependencias, ni siquiera de desarrollo— una convención sólo existe
// si algo la comprueba. El prefijo no es cosmético: `require('fs')` lo puede secuestrar un paquete
// llamado `fs`, y `require('node:fs')` no. Estaba en 31 de 46 lugares, que es la peor de las mezclas.
// El README de un adaptador mandaba a correr `make install-antigravity` y `make doctor-antigravity`:
// ninguno de los dos existió nunca, y una instancia instalada ni siquiera tiene `Makefile`. Ya había un
// test así para la documentación de los cargos; el resto del repositorio no lo tenía, que es donde
// estaba el error. Un comando inventado en un README no rompe nada hasta que alguien lo escribe.
test('ningún documento del repositorio cita un comando make que no existe', () => {
  const root = path.resolve(__dirname, '..')
  const defined = new Set()
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    for (const hit of fs.readFileSync(path.join(root, makefile), 'utf8').matchAll(/^([a-z][a-z0-9-]*):/gm)) {
      defined.add(hit[1])
    }
  }
  const invented = []
  const review = (file) => {
    for (const hit of fs.readFileSync(file, 'utf8').matchAll(/(?:^|[`\s])make ([a-z][a-z0-9-]*)/gm)) {
      if (!defined.has(hit[1])) invented.push(`${path.relative(root, file)}: make ${hit[1]}`)
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // `evaluations/results/` es la transcripción de una corrida, no un documento que alguien siga:
      // contiene comandos que el cargo propuso, y no tienen por qué existir. Misma razón que el test
      // hermano de `agents.test.js`.
      if (entry.name === 'node_modules' || entry.name === 'results' || entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.md')) review(file)
    }
  }
  for (const dir of ['automatization', 'engine', 'template', 'test', 'teams']) walk(path.join(root, dir))
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.md')) review(path.join(root, name))
  }
  assert.ok(defined.size > 5, 'los Makefiles deberían declarar varios objetivos')
  assert.deepEqual(invented, [])
})

test('los módulos de Node se importan con el prefijo node:', () => {
  const root = path.resolve(__dirname, '..')
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const current = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(current)
      else if (entry.name.endsWith('.js')) files.push(current)
    }
  }
  for (const dir of ['engine', 'automatization', 'template', 'test']) walk(path.join(root, dir))

  const loose = []
  for (const file of files) {
    // Sin los comentarios: este mismo test nombra `require('fs')` para explicar por qué no va.
    const source = fs.readFileSync(file, 'utf8').split('\n')
      .filter((line) => !line.trim().startsWith('//')).join('\n')
    for (const match of source.matchAll(/require\('([a-z_]+)'\)/g)) {
      if (require('node:module').builtinModules.includes(match[1])) {
        loose.push(`${path.relative(root, file)}: require('${match[1]}')`)
      }
    }
  }
  assert.deepEqual(loose, [], 'usan `node:` delante')
  assert.ok(files.length > 30, `el recorrido encontró ${files.length} archivos`)
})

// Informes, propuestas y veredictos son lo que produjo nuestra versión del contrato, y `fork` ya se
// niega a heredarlos —`engine/agents/fork.js`—. La misma decisión vale en el borde del paquete: sin
// esto, tres cuartas partes de lo que recibe una empresa es la contabilidad de cómo probamos nuestros
// cargos, y crece una tanda entera por cada corrida de evaluación.
test('el paquete no publica la evidencia de nuestras propias corridas', () => {
  const raiz = path.resolve(__dirname, '..')
  const salida = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: raiz, encoding: 'utf8' })
  assert.equal(salida.status, 0, salida.stderr)
  const archivos = JSON.parse(salida.stdout)[0].files.map((entry) => entry.path)

  for (const patron of [/evaluations\/results\//, /learning\/reports\//, /learning\/proposals\//]) {
    assert.deepEqual(archivos.filter((ruta) => patron.test(ruta)), [], `${patron} viaja en el paquete`)
  }
  // Y la negación no puede llevarse puesto lo que el consumidor sí necesita del cargo.
  for (const necesario of [/\/SKILL\.md$/, /evaluations\/cases\//, /\/references\//,
    /learning\/HISTORY\.md$/, /learning\/sources\.yaml$/, /expected-behaviors\.yaml$/]) {
    assert.ok(archivos.some((ruta) => necesario.test(ruta)), `${necesario} falta en el paquete`)
  }
  for (const pieza of ['engine/cli/ops.js', 'template/planning/PROTOCOL.md']) {
    assert.ok(archivos.includes(pieza), `${pieza} falta en el paquete`)
  }
})

// La tabla de equipos enumera lo que trae Cauce, y una enumeración afirma completitud aunque ninguna
// frase lo diga: dos recorridos entraron al catálogo y la tabla siguió diciendo tres. Se deriva del
// directorio, que es lo único que no envejece aparte.
test('el README de equipos nombra todos los que trae el catálogo', () => {
  const raiz = path.resolve(__dirname, '..')
  const readme = fs.readFileSync(path.join(raiz, 'template', 'teams', 'README.md'), 'utf8')
  const catalogo = fs.readdirSync(path.join(raiz, 'teams', 'system'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

  assert.ok(catalogo.length, 'el catálogo trae equipos')
  for (const slug of catalogo) {
    assert.ok(readme.includes(`\`system/${slug}\``), `el README no nombra ${slug}`)
  }
  const nombrados = [...new Set([...readme.matchAll(/`system\/([a-z-]+)`/g)].map((hit) => hit[1]))].sort()
  assert.deepEqual(nombrados, catalogo, 'y no nombra ninguno que ya no exista')
})

// Sin linter, un tope de largo sólo existe si algo lo cuenta, y tres líneas ya se habían pasado.
//
// Se cuentan caracteres y no bytes, que es lo que dice la convención y lo que casi hace fallar esta
// misma revisión: `awk` con locale UTF-8 cuenta bytes, y un comentario separador de 99 caracteres
// hecho con `─` mide 236. Medido en bytes, tres archivos limpios parecían estar en falta.
test('ninguna línea de código pasa los 120 caracteres que fija la convención', () => {
  const raiz = path.resolve(__dirname, '..')
  const codigo = (dir, salida = []) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, entrada.name)
      if (entrada.isDirectory()) { if (entrada.name !== 'node_modules') codigo(ruta, salida); continue }
      if (/\.(js|sh)$/.test(entrada.name)) salida.push(ruta)
    }
    return salida
  }
  const archivos = ['engine', 'automatization', 'test', 'template'].flatMap((d) => codigo(path.join(raiz, d)))
  const largas = archivos.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((linea, i) => ({ file, n: i + 1, largo: [...linea].length }))
    .filter((x) => x.largo > 120)
    .map((x) => `${path.relative(raiz, x.file)}:${x.n} (${x.largo})`))
  assert.deepEqual(largas, [], `pasan los 120 caracteres:\n  ${largas.join('\n  ')}`)
})
