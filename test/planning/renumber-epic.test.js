'use strict'

// Mover una épica a otro número (caso 217). Lo que se mide: que `check` nombre las dos épicas y la salida,
// que el comando mueva sólo lo de la épica que se mueve —con el número repetido, las tareas de la otra citan
// lo mismo—, y que un pedido que no se puede cumplir no deje nada a medio mover.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}
const epic = (num, slug, story) => `---\nepic: ${num}\ntitle: ${slug}\nstatus: open\nservice: app\n---\n\n`
  + `# Épica ${num} — ${slug}\n\n## Criterios\n\n- **C1** — Cuando pasa algo, el cliente obtiene un resultado.\n\n`
  + `## Contexto relevante\n\n- Ver app/.\n\n## Historias\n\n`
  + `- [ ] **${story}** (→ C1) — Incremento. _Aceptación: se observa._ (service: app)\n`
const task = (slug) => `- [ ] **${slug}** [lite] — Algo. (→ C1) (epic: 001) (service: app)`

// Lo que deja el merge de dos líneas que tomaron el mismo número, con una tarea de cada una en la cola.
function collided(name, { envios = 'file' } = {}) {
  const target = path.join(tempRoot(name), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const dir = path.join(target, 'planning')
  write(dir, 'roadmap/epic-001-pagos.md', epic('001', 'pagos', 'cobrar-tarjeta'))
  write(dir, envios === 'file' ? 'roadmap/epic-001-envios.md' : 'roadmap/epic-001-envios/spec.md',
    epic('001', 'envios', 'cotizar-envio'))
  write(dir, 'backlog/pagos.md', `---\norder: 10\n---\n\n## Hito pagos — Pagos\n\n${task('cobrar-tarjeta')}\n`)
  write(dir, 'backlog/envios.md', `---\norder: 20\n---\n\n## Hito envios — Envíos\n\n${task('cotizar-envio')}\n\n`
    + 'Detalle en roadmap/epic-001-envios.md.\n')
  return dir
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8')
const check = (dir) => {
  const result = run(['check', dir])
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

test('check nombra las dos épicas con el mismo número y el comando que lo resuelve', () => {
  const dir = collided('cauce-renumber-check-')
  const result = check(dir)
  assert.notEqual(result.status, 0)
  assert.ok(result.out.includes('roadmap/epic-001-pagos.md: número de épica duplicado 001, también en '
    + 'roadmap/epic-001-envios.md. Mové la que todavía no llegó a la rama principal: '
    + 'node tools/ops.js renumber-epic planning <epic-001-slug> 002'), result.out)
})

test('renumber-epic mueve la épica y sólo las citas de sus tareas, y check vuelve a pasar', () => {
  const dir = collided('cauce-renumber-file-')
  const moved = run(['renumber-epic', dir, 'epic-001-envios.md', '002'])
  assert.equal(moved.status, 0, moved.stderr)
  assert.match(moved.stdout, /roadmap\/epic-001-envios\.md → roadmap\/epic-002-envios\.md/)
  assert.ok(!fs.existsSync(path.join(dir, 'roadmap/epic-001-envios.md')), 'no queda la vieja')
  assert.match(read(dir, 'roadmap/epic-002-envios.md'), /^epic: 002$/m)
  assert.match(read(dir, 'roadmap/epic-002-envios.md'), /^# Épica 002 — envios$/m)
  assert.match(read(dir, 'backlog/envios.md'), /\*\*cotizar-envio\*\* .*\(epic: 002\)/)
  assert.match(read(dir, 'backlog/envios.md'), /Detalle en roadmap\/epic-002-envios\.md\./, 'la ruta citada')
  assert.match(read(dir, 'backlog/pagos.md'), /\*\*cobrar-tarjeta\*\* .*\(epic: 001\)/, 'la otra épica no se toca')
  assert.equal(read(dir, 'roadmap/epic-001-pagos.md'), epic('001', 'pagos', 'cobrar-tarjeta'))
  const after = check(dir)
  assert.equal(after.status, 0, after.out)
})

test('una épica escrita como carpeta se mueve entera', () => {
  const dir = collided('cauce-renumber-dir-', { envios: 'dir' })
  assert.equal(run(['renumber-epic', dir, 'epic-001-envios', '002']).status, 0)
  assert.match(read(dir, 'roadmap/epic-002-envios/spec.md'), /^epic: 002$/m)
  assert.ok(!fs.existsSync(path.join(dir, 'roadmap/epic-001-envios')))
  const after = check(dir)
  assert.equal(after.status, 0, after.out)
})

test('un pedido que no se puede cumplir se niega y no mueve nada', () => {
  const dir = collided('cauce-renumber-refuse-')
  const before = run(['tree', dir, '--json']).stdout
  const snapshot = () => ['roadmap/epic-001-envios.md', 'backlog/envios.md', 'backlog/pagos.md']
    .map((file) => read(dir, file))
  const original = snapshot()
  for (const [args, reason] of [
    [['epic-001-envios.md', '001'], /ya tiene el número 001/],
    [['epic-001-pagos.md', '001'], /ya tiene el número 001/],
    [['epic-001-envios.md', '12'], /tres dígitos/],
    [['epic-001-nada.md', '002'], /no existe roadmap\/epic-001-nada\.md/],
    [['pagos', '002'], /no es el nombre de una épica/],
  ]) {
    const refused = run(['renumber-epic', dir, ...args])
    assert.notEqual(refused.status, 0, args.join(' '))
    assert.match(refused.stderr, reason)
    assert.match(refused.stderr, /no se movió nada/)
  }
  write(dir, 'roadmap/epic-003-otra.md', epic('003', 'otra', 'otra-historia'))
  const taken = run(['renumber-epic', dir, 'epic-001-envios.md', '003'])
  assert.match(taken.stderr, /el número 003 ya lo tiene roadmap\/epic-003-otra\.md/)
  fs.rmSync(path.join(dir, 'roadmap/epic-003-otra.md'))
  // Una épica cerrada ya no está en el roadmap, pero su número lo siguen citando sus tareas en `done/`.
  write(dir, 'done/vieja.md', '- [x] **vieja** (epic: 004) — Resultado\n')
  const archived = run(['renumber-epic', dir, 'epic-001-envios.md', '004'])
  assert.match(archived.stderr, /el número 004 lo cita una tarea cerrada \(done\/vieja\.md\)/)
  assert.match(check(dir).out, /renumber-epic planning <epic-001-slug> 005/, 'y check no lo ofrece')
  fs.rmSync(path.join(dir, 'done/vieja.md'))
  assert.deepEqual(snapshot(), original)
  assert.equal(run(['tree', dir, '--json']).stdout, before)
})
