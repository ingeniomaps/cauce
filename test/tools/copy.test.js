'use strict'

// Caso 536: `ops copy` arma la copia que R23 pide para mutar. Lleva lo trackeado y lo nuevo no ignorado —la prueba
// recién escrita—, deja afuera lo ignorado y el `.git`, mide antes y se niega pasado el tope, y nunca borra el destino.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function repo(prefix) {
  const root = tempRoot(prefix)
  execFileSync('git', ['-C', root, 'init', '-q'])
  fs.writeFileSync(path.join(root, '.gitignore'), '.cache/\n')
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 1\n')
  execFileSync('git', ['-C', root, 'add', '.gitignore', 'src/app.js'])
  fs.writeFileSync(path.join(root, 'src', 'app.test.js'), 'test("nuevo", () => {})\n')
  fs.mkdirSync(path.join(root, '.cache'))
  fs.writeFileSync(path.join(root, '.cache', 'big.bin'), Buffer.alloc(2 * 1024 * 1024))
  return root
}
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))

test('copia lo trackeado y lo nuevo no ignorado, sin lo ignorado ni el .git, y da la ruta sola', () => {
  const root = repo('cauce-copia-')
  const dest = path.join(tempRoot('cauce-copia-destino-'), 'copia')
  const out = run(['copy', path.join(root, 'src'), dest])
  assert.equal(out.status, 0, out.stderr)
  assert.equal(out.stdout, `${dest}\n`, 'la ruta sale sola por stdout')
  for (const rel of ['.gitignore', 'src/app.js', 'src/app.test.js']) assert.ok(exists(dest, rel), rel)
  for (const rel of ['.cache', '.git']) assert.ok(!exists(dest, rel), rel)
  assert.match(out.stderr, /No vino lo que git ignora/)
  // Sin destino, va al temporal del sistema.
  const tmp = tempRoot('cauce-copia-tmp-')
  const free = run(['copy', root], undefined, { TMPDIR: tmp })
  assert.equal(free.status, 0, free.stderr)
  assert.ok(exists(free.stdout.trim(), 'src/app.test.js'))
  assert.ok(free.stdout.startsWith(`${tmp}${path.sep}cauce-copy-`), free.stdout)
})

test('no borra un destino ocupado, se niega pasado el tope y pide un repositorio', () => {
  const root = repo('cauce-copia-limites-')
  const dest = tempRoot('cauce-copia-ocupado-')
  fs.writeFileSync(path.join(dest, 'mio.txt'), 'no se toca\n')
  const busy = run(['copy', root, dest])
  assert.equal(busy.status, 1)
  assert.match(busy.stderr, /ya existe y no es una carpeta vacía; ops copy no borra nada/)
  assert.equal(fs.readFileSync(path.join(dest, 'mio.txt'), 'utf8'), 'no se toca\n')
  assert.deepEqual(fs.readdirSync(dest), ['mio.txt'])
  const empty = tempRoot('cauce-copia-vacio-')
  assert.equal(run(['copy', root, empty]).status, 0, 'una carpeta vacía sí sirve')
  const big = run(['copy', root, path.join(tempRoot('cauce-copia-tope-'), 'c'), '--max-mb', '0.00001'])
  assert.equal(big.status, 1)
  assert.match(big.stderr, /pesa .* MB sin lo ignorado, y el tope es/)
  assert.equal(run(['copy', root, '--max-mb', 'x']).status, 2)
  assert.equal(run(['copy', tempRoot('cauce-copia-sin-git-')]).status, 2)
  assert.equal(run(['copy']).status, 2)
})

test('no copia adentro del repo, avisa lo que no copia y los enlaces que salen, y nombra una copia a medias', () => {
  const root = repo('cauce-copia-bordes-')
  const inside = run(['copy', root, path.join(root, 'copia')])
  assert.equal(inside.status, 1)
  assert.match(inside.stderr, /está dentro de .*: la copia quedaría en el árbol que copia/)
  assert.ok(!exists(root, 'copia'), 'no la crea')
  fs.symlinkSync(path.join(root, 'src', 'app.js'), path.join(root, 'vivo'))
  fs.symlinkSync('src/app.js', path.join(root, 'adentro'))
  const nested = path.join(root, 'anidado')
  fs.mkdirSync(nested)
  execFileSync('git', ['-C', nested, 'init', '-q'])
  const dest = path.join(tempRoot('cauce-copia-bordes-destino-'), 'c')
  const out = run(['copy', root, dest])
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stderr, /apuntan fuera de la copia, y lo que se escriba por ellos cae ahí: vivo$/m)
  assert.match(out.stderr, /No se copió lo que no es archivo —submódulos, repos anidados—: anidado\//)
  assert.match(out.stderr, /^5 archivo\(s\)/m, 'cuenta lo copiado')
  assert.ok(fs.lstatSync(path.join(dest, 'adentro')).isSymbolicLink())
  // Un archivo que no se puede leer corta la copia, y el mensaje dice dónde quedó.
  if (process.getuid && process.getuid() !== 0) {
    fs.chmodSync(path.join(root, 'src', 'app.test.js'), 0)
    const half = path.join(tempRoot('cauce-copia-media-'), 'c')
    const broken = run(['copy', root, half])
    fs.chmodSync(path.join(root, 'src', 'app.test.js'), 0o644)
    assert.equal(broken.status, 1)
    assert.match(broken.stderr, new RegExp(`La copia quedó a medias en ${half} \\(EACCES\\); ops copy no la borra`))
  }
  const linked = path.join(tempRoot('cauce-copia-enlace-'), 'repo')
  fs.symlinkSync(root, linked)
  assert.match(run(['copy', linked, path.join(linked, 'a', 'b', 'c')]).stderr, /está dentro de/)
  assert.ok(!exists(root, 'a'))
  // Un destino que no se puede crear se dice con el mensaje del comando.
  const flat = path.join(tempRoot('cauce-copia-plano-'), 'plano.txt')
  fs.writeFileSync(flat, 'x\n')
  assert.match(run(['copy', root, path.join(flat, 'c')]).stderr, /^No se pudo crear .* \(ENOTDIR\)\./m)
  // Un destino que es un enlace colgante se niega con el mensaje del comando, no con el error crudo.
  const dangling = path.join(tempRoot('cauce-copia-colgante-'), 'c')
  fs.symlinkSync('no-existe', dangling)
  assert.match(run(['copy', root, dangling]).stderr, /ya existe y no es una carpeta vacía/)
})
