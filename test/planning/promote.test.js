'use strict'

// `ops promote`: una persona pasa una épica `open` a la cola, un `backlog/<hito>.md` por cada hito que la épica
// propone, con su `line:`. Lo que se mide: que cada hito salga con su orden, su línea y sus historias como
// tareas válidas; que la épica quede `active`; que sin `## Hitos` salga un solo hito con el slug de la épica;
// y que se niegue —sin escribir nada— sobre una épica que no está open, con marcadores, con el reparto mal
// escrito o con un hito que ya existe.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const epic = (milestones, extra = '') => `---
epic: 004
title: Pedidos
status: open
service: app
---

# Épica 004 — Pedidos

## Resultado

Pedidos.${extra}

## Criterios

- **C1** — Se valida el stock.
- **C2** — Se crea el pedido.

## Contexto relevante

- Contexto.

## Historias

- [ ] **validar-stock** (→ C1) — Rechazar sin stock. _Aceptación: 409._ (service: app)
- [ ] **crear-pedido** (→ C2) — Crear. _Aceptación: 201._ (service: app)
- [ ] **ver-pedido** (→ C2) — Ver. _Aceptación: 200._ (service: app)

## Riesgos y decisiones humanas

- Ninguno.
${milestones}`

const MILESTONES = `
## Hitos

- **alta-pedidos** — Alta de pedidos
  - validar-stock
  - crear-pedido
- **consola** (line: admin) — Consola de pedidos
  - ver-pedido
`

function instance(name, text) {
  const ops = path.join(tempRoot(`cauce-promote-${name}-`), 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(ops, 'planning')
  fs.mkdirSync(path.join(planning, 'backlog'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'backlog', 'base.md'),
    '---\norder: 10\n---\n\n## Hito base — Base\n\n- [ ] **x** — X. _Aceptación: x._ (service: app)\n')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), text)
  return planning
}

test('promote escribe un hito por cada uno propuesto, con su orden, su línea y sus historias', () => {
  const planning = instance('hitos', epic(MILESTONES))
  // La línea está declarada (caso 394): no hay nada que avisar sobre ella.
  const ops = path.dirname(planning)
  const config = JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8'))
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ ...config, lines: { admin: ['app'] } }))
  const result = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.includes('no está armada'), false, 'la línea admin existe')
  assert.match(result.stdout, /backlog\/alta-pedidos\.md.*2 tarea/)
  assert.match(result.stdout, /backlog\/consola\.md.*line: admin.*1 tarea/)
  const alta = fs.readFileSync(path.join(planning, 'backlog', 'alta-pedidos.md'), 'utf8')
  assert.match(alta, /^---\norder: 20\n---\n\n## Hito alta-pedidos — Alta de pedidos\n/)
  assert.match(alta, new RegExp('^- \\[ \\] \\*\\*validar-stock\\*\\* — Rechazar sin stock\\. _Aceptación: 409\\._ '
    + '\\(service: app\\) \\(→ C1\\) \\(epic: 004\\)$', 'm'))
  const consola = fs.readFileSync(path.join(planning, 'backlog', 'consola.md'), 'utf8')
  assert.match(consola, /^---\norder: 30\nline: admin\n---\n/)
  assert.match(consola, /\*\*ver-pedido\*\*/)
  assert.match(fs.readFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), 'utf8'), /^status: active$/m)

  const check = run(['check', planning])
  assert.equal(check.status, 0, check.stderr)
  const context = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(context.task.slug, 'x', 'el hito base sigue primero')
  assert.deepEqual(context.otherLines, ['consola'], 'el hito de la línea no se le ofrece al principal')

  const again = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(again.status, 1)
  assert.match(again.stderr, /está active: sólo se promueve una épica open/)
})

test('sin ## Hitos la épica entra como un solo hito con su slug, también graduada a carpeta', () => {
  const planning = instance('plano', epic(''))
  // Graduada a carpeta, y con una historia que ya cita su épica: no se la cita dos veces.
  const dir = path.join(planning, 'roadmap', 'epic-004-pedidos')
  fs.mkdirSync(dir)
  fs.renameSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), path.join(dir, 'spec.md'))
  fs.writeFileSync(path.join(dir, 'spec.md'), fs.readFileSync(path.join(dir, 'spec.md'), 'utf8')
    .replace('_Aceptación: 200._ (service: app)', '_Aceptación: 200._ (service: app) (epic: 004)'))
  assert.equal(run(['promote', planning, 'epic-004-pedidos']).status, 0)
  const file = fs.readFileSync(path.join(planning, 'backlog', 'pedidos.md'), 'utf8')
  assert.match(file, /^order: 20$/m)
  assert.equal((file.match(/^- \[ \] /gm) || []).length, 3)
  assert.equal((file.match(/\(epic: 004\)/g) || []).length, 3, 'una cita por tarea, aunque ya viniera')
  assert.match(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), /^status: active$/m)
  assert.match(file, /## Hito pedidos — Pedidos/)
  assert.equal(run(['check', planning]).status, 0)
})

test('promote se niega sin escribir nada: marcadores, reparto mal escrito, hito ya existente, épica ausente', () => {
  const planning = instance('niega', epic(MILESTONES, ' Por definir.'))
  const placeholder = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(placeholder.status, 1)
  assert.match(placeholder.stderr, /marcador.*Por definir/)
  assert.equal(fs.existsSync(path.join(planning, 'backlog', 'alta-pedidos.md')), false)

  const trimmed = MILESTONES.replace('  - ver-pedido\n', '')
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), epic(trimmed))
  const broken = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /ver-pedido sin hito/)

  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), epic(MILESTONES))
  fs.writeFileSync(path.join(planning, 'backlog', 'consola.md'), '---\norder: 15\n---\n\n## Hito consola — Ya\n')
  const taken = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(taken.status, 1)
  assert.match(taken.stderr, /ya existe el hito consola en backlog\/consola\.md/)
  assert.equal(fs.existsSync(path.join(planning, 'backlog', 'alta-pedidos.md')), false, 'todo o nada')
  assert.match(fs.readFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), 'utf8'), /^status: open$/m)

  assert.equal(run(['promote', planning, 'epic-009-nada']).status, 1)
  assert.equal(run(['promote', planning]).status, 2)
})

test('promote avisa de una línea que todavía no tiene árbol ni rama, y promueve igual', () => {
  const planning = instance('sin-linea', epic(MILESTONES.replace('(line: admin)', '(line: admn)')))
  const result = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /line admn no está armada todavía: nadie la toma hasta "ops line \. admn <repo>\.\.\."/)
  assert.match(fs.readFileSync(path.join(planning, 'backlog', 'consola.md'), 'utf8'), /^line: admn$/m)
})

// Una línea de antes de 0.111.0 no está declarada: existe porque tiene su rama en la instancia.
test('promote cuenta como armada una línea de antes, que tiene su rama', () => {
  const planning = instance('linea-vieja', epic(MILESTONES))
  const ops = path.dirname(planning)
  const git = (...args) => assert.equal(spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: ops, encoding: 'utf8' }).status, 0)
  git('init', '-q', '-b', 'main'); git('add', '.gitignore', 'planning'); git('commit', '-qm', 'base')
  git('branch', 'line/admin')
  const result = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.includes('no está armada'), false, result.stdout)
})

test('promote se niega, sin escribir, ante un hito que ya está en BACKLOG.md y ante uno que pasa R17', () => {
  const planning = instance('en-backlog', epic(''))
  fs.appendFileSync(path.join(planning, 'BACKLOG.md'),
    '\n## Hito pedidos — Ya en la cola\n\n- [ ] **z** — Z. _Aceptación: z._ (service: app)\n')
  const taken = run(['promote', planning, 'epic-004-pedidos'])
  assert.equal(taken.status, 1)
  assert.match(taken.stderr, /ya existe el hito pedidos en BACKLOG\.md/)
  assert.equal(fs.existsSync(path.join(planning, 'backlog', 'pedidos.md')), false)
  assert.match(fs.readFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), 'utf8'), /^status: open$/m)

  const many = [...Array(10)].map((_, i) => `- [ ] **h-${i}** (→ C${1 + (i % 2)}) — H. _Aceptación: h._ (service: app)`)
    .join('\n')
  const big = epic('').replace(/- \[ \] \*\*validar-stock[\s\S]*?\(service: app\)\n(?=\n## Riesgos)/, `${many}\n`)
  const planning2 = instance('grande', big)
  const oversized = run(['promote', planning2, 'epic-004-pedidos'])
  assert.equal(oversized.status, 1)
  assert.match(oversized.stderr, /hito pedidos: tareas: 10 \(umbral 9 de R17\)/)
  assert.equal(fs.existsSync(path.join(planning2, 'backlog', 'pedidos.md')), false)
})

test('promote activa la épica aunque el estado venga entre comillas', () => {
  const planning = instance('comillas', epic('').replace('status: open', 'status: "open"'))
  assert.equal(run(['promote', planning, 'epic-004-pedidos']).status, 0)
  assert.match(fs.readFileSync(path.join(planning, 'roadmap', 'epic-004-pedidos.md'), 'utf8'), /^status: active$/m)
})
