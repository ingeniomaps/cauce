'use strict'

// Que el plan exista antes del primer cambio, que es lo que R1 pide y nadie comprobaba.

const { tempRoot, writeWip } = require('../support/environment')
const {
  blocked, git, initRepo, planFirstRoot, WIP_IDLE,
  WIP_CON_PLAN, WIP_SIN_PLAN, BACKLOG_CON_TAREA, BACKLOG_VACIO,
} = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

test('guard-plan-first exige el plan antes de cambiar el producto', () => {
  const root = planFirstRoot('ops-hook-plan-', WIP_IDLE)
  const escribe = (file) => ({ cwd: root, tool_input: { file_path: file } })

  blocked('plan-first', escribe('src/altas.js'), /sin plan/)
  // Nombrar el estado es la mitad del mensaje: «IDLE» y «tarea sin pasos» piden cosas distintas.
  blocked('plan-first', escribe('src/altas.js'), /IDLE/)

  const conTarea = planFirstRoot('ops-hook-plan-sinpasos-', WIP_SIN_PLAN)
  blocked('plan-first', { cwd: conTarea, tool_input: { file_path: 'src/altas.js' } },
    /alta-de-cliente y ningún paso/)

  const conPlan = planFirstRoot('ops-hook-plan-ok-', WIP_CON_PLAN)
  assert.doesNotThrow(() => execute('plan-first', { cwd: conPlan, tool_input: { file_path: 'src/altas.js' } }))
})

test('guard-plan-first no juzga lo que la instancia posee', () => {
  const root = planFirstRoot('ops-hook-plan-exento-', WIP_IDLE)
  const escribe = (file) => execute('plan-first', { cwd: root, tool_input: { file_path: file } })

  // El plan se escribe acá: sin esta exención, escribirlo exigiría haberlo escrito.
  assert.doesNotThrow(() => escribe('planning/WIP.md'))
  assert.doesNotThrow(() => escribe('planning/roadmap/epic-001-alta.md'))
  // Y los recorridos que no pasan por la máquina de tareas tampoco tienen un WIP que mostrar.
  assert.doesNotThrow(() => escribe('organization/workspace.md'))
  assert.doesNotThrow(() => escribe('agents/roles/tech-lead/SKILL.md'))
  assert.doesNotThrow(() => escribe('integrations/jira/staging/draft.md'))
  // Un directorio que sólo empieza igual no es la raíz exenta.
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'planningtool/app.js' } }, /sin plan/)
  // En embedded la raíz de ops es la del producto: su configuración no es producto, su `package.json` sí.
  assert.doesNotThrow(() => escribe('ops.config.json'))
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'package.json' } }, /sin plan/)
})

test('guard-plan-first no juzga la instancia sidecar ni lo que queda fuera de las raíces', () => {
  const base = tempRoot('ops-hook-plan-sidecar-')
  const root = path.join(base, 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  writeWip(path.join(root, 'planning'), WIP_IDLE)
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), BACKLOG_CON_TAREA)
  const declare = (workspaceRoots) => fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots }))
  const write = (file) => ({ cwd: root, tool_input: { file_path: file } })
  const instance = ['ops.config.json', 'AGENTS.md', 'CLAUDE.md', 'package.json', '.gitignore']
    .map((name) => path.join(root, name))
  const service = path.join(base, 'app', 'src', 'a.js')

  // La raíz que escribe `init` en sidecar deja a la instancia adentro, y eso no la vuelve producto.
  declare([{ name: 'main', path: '..' }])
  for (const file of instance) assert.doesNotThrow(() => execute('plan-first', write(file)), file)
  blocked('plan-first', write(service), /sin plan/)

  // Con una raíz más angosta, lo que queda fuera de ella tampoco: es lo que el proyecto declaró escribible.
  declare([{ name: 'app', path: '../app' }])
  for (const file of instance) assert.doesNotThrow(() => execute('plan-first', write(file)), file)
  assert.doesNotThrow(() => execute('plan-first', write(path.join(base, 'otra-herramienta', 'caso.md'))))
  blocked('plan-first', write(service), /sin plan/)

  // Sin raíces legibles no hay contra qué comparar: frena como antes, que es el lado de errar.
  declare(undefined)
  blocked('plan-first', write(path.join(root, 'AGENTS.md')), /sin plan/)
  blocked('plan-first', write(service), /sin plan/)
})

test('guard-plan-first queda inerte mientras el planning no declara tareas', () => {
  // El día uno no hay trabajo de producto que cuidar, hay instalación: `onboard` deja el roadmap vacío
  // y pide que alguien lo llene. Un bloqueo ahí es un candado delante de la puerta.
  const nuevo = planFirstRoot('ops-hook-plan-nuevo-', WIP_IDLE, BACKLOG_VACIO)
  assert.doesNotThrow(() => execute('plan-first', { cwd: nuevo, tool_input: { file_path: 'src/altas.js' } }))

  // Y muerde en cuanto hay de dónde sacar una tarea, que es la mitad que vuelve útil a la otra.
  fs.writeFileSync(path.join(nuevo, 'planning', 'BACKLOG.md'), BACKLOG_CON_TAREA)
  blocked('plan-first', { cwd: nuevo, tool_input: { file_path: 'src/altas.js' } }, /sin plan/)

  // Una tarea ya terminada cuenta igual: el BACKLOG vacío de una instancia con historia no la devuelve
  // al día uno.
  const conHistoria = planFirstRoot('ops-hook-plan-historia-', WIP_IDLE, BACKLOG_VACIO)
  fs.mkdirSync(path.join(conHistoria, 'planning', 'done'), { recursive: true })
  fs.writeFileSync(path.join(conHistoria, 'planning', 'done', 'alta-de-cliente.md'),
    '- [x] **alta-de-cliente** — Alta\n')
  blocked('plan-first', { cwd: conHistoria, tool_input: { file_path: 'src/altas.js' } }, /sin plan/)
})

// Con `mode: sidecar` hay un solo `planning/` por máquina, así que el plan de un agente está al alcance
// del otro. Si el guard leyera cualquiera, el segundo escribiría producto amparado en el plan del primero
// y quedaría inerte justo donde más hace falta: dos agentes construyendo a la vez.
test('el plan de un runner no le sirve a otro para saltear plan-first', () => {
  const root = planFirstRoot('ops-hook-plan-por-runner-', WIP_IDLE)
  writeWip(path.join(root, 'planning'), '---\ntask: alta-de-cliente\nphase: Build\n---\n'
    + '\n## Plan aprobado\n1. [ ] Montar el alta\n')
  const escribir = { cwd: root, tool_input: { file_path: 'src/altas.js' } }

  assert.doesNotThrow(() => execute('plan-first', escribir), 'con su propio plan, escribe')

  const previo = process.env.CAUCE_RUNNER
  process.env.CAUCE_RUNNER = '/w/otro-agente'
  try {
    blocked('plan-first', escribir, /sin plan/)
  } finally { process.env.CAUCE_RUNNER = previo }
})

// Lo que ésta fija y las otras de `plan-first` no: que el bloqueo distinga sus dos causas. En las dos
// frenar es correcto —que el plan ajeno no autorice lo fija la prueba de arriba—, así que lo único que
// queda observable es a dónde manda el mensaje, y por eso acá se afirma sobre su texto y no sobre si
// frenó. Afirmar también lo que **no** dice es la mitad que importa: el bloqueo que ofrece la salida
// equivocada se ve igual de verde que el que ofrece la correcta (caso 152).
test('plan-first distingue no tener plan de no ver el plan de otro id', () => {
  const root = planFirstRoot('ops-hook-plan-otro-id-', WIP_IDLE)
  // Con pasos y bajo un nombre que no es el del runner de las pruebas: es un plan real y ajeno.
  fs.writeFileSync(path.join(root, 'planning', 'wip', 'w-otro-agente.md'),
    '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n## Plan aprobado\n1. [ ] Montar el alta\n')
  const escribir = { cwd: root, tool_input: { file_path: 'src/altas.js' } }
  const motivoDe = (input) => {
    try { execute('plan-first', input); return '' } catch (error) { return error.message }
  }

  blocked('plan-first', escribir, /sin plan/)
  const motivo = motivoDe(escribir)
  assert.doesNotMatch(motivo, /IDLE/,
    'el plan está escrito: decir IDLE manda a escribir de nuevo lo que ya existe')
  assert.match(motivo, /w-otro-agente/, 'nombra el id que sí tiene el plan')
  assert.match(motivo, /alta-de-cliente/, 'y con qué tarea, que es lo que permite reconocerlo como propio')
  assert.match(motivo, /CAUCE_RUNNER/, 'y cómo volver a ese id, que es la acción que destraba')
  // La aprobación por ruta escribe «esto no es trabajo de una tarea», y acá eso es falso: hay plan y hay
  // tarea. Ofrecerla es lo que convierte un bloqueo en una afirmación falsa firmada.
  assert.doesNotMatch(motivo, /Aprobalo pegando/,
    'con un plan a la vista, aprobar la ruta declara por escrito algo que no es cierto')

  // Y sin ningún plan ajeno el mensaje sigue siendo el de antes: son dos situaciones distintas.
  const solo = planFirstRoot('ops-hook-plan-sin-ninguno-', WIP_IDLE)
  assert.match(motivoDe({ cwd: solo, tool_input: { file_path: 'src/altas.js' } }), /IDLE/)
})

test('guard-plan-first se abre por aprobación, por variable y donde no hay instancia', () => {
  const root = planFirstRoot('ops-hook-plan-llaves-', WIP_IDLE)
  const escribe = { cwd: root, tool_input: { file_path: 'src/altas.js' } }

  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), 'src/altas.js\n')
  assert.doesNotThrow(() => execute('plan-first', escribe))
  // La aprobación vale para la ruta que nombra y para ninguna otra.
  blocked('plan-first', { cwd: root, tool_input: { file_path: 'src/bajas.js' } }, /sin plan/)
  fs.unlinkSync(path.join(root, 'planning', '.ops-approval'))
  blocked('plan-first', escribe, /sin plan/)

  process.env.OPS_PLAN_FIRST_OVERRIDE = '1'
  try { assert.doesNotThrow(() => execute('plan-first', escribe)) } finally {
    delete process.env.OPS_PLAN_FIRST_OVERRIDE
  }

  // Sin `planning/` no hay instancia que gobernar: es el estado de este mismo repositorio.
  const suelto = tempRoot('ops-hook-plan-suelto-')
  assert.doesNotThrow(() => execute('plan-first', { cwd: suelto, tool_input: { file_path: 'src/altas.js' } }))
})

// El registro que deja `verify` y el contraste que lo lee. Las dos mitades juntas porque el valor está
// en que sean independientes del autor: la corrida la escribe el guard al commitear, no quien redacta
// después la entrada de DONE.
test('verify deja registrado qué gate corrió y con qué código de salida', () => {
  const EV = require('../../engine/core/evidence')
  const root = tempRoot('ops-hook-evidencia-')
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e ""' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }

  assert.equal(EV.runs(root).length, 0, 'sin corridas, el registro está vacío')
  assert.doesNotThrow(() => execute('verify', commit))
  const runs = EV.runs(root)
  assert.equal(runs.length, 1, 'el gate que corrió quedó registrado')
  assert.equal(runs[0].gate, 'test')
  assert.equal(runs[0].status, 0)

  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  git(['add', 'package.json'], root)
  blocked('verify', commit, /Verify falló/)
  assert.equal(EV.runs(root).slice(-1)[0].status, 1, 'y con su código de salida real')

  // Rodante: lo que interesa es el trabajo en curso, no la historia entera.
  for (let i = 0; i < EV.MAX_RUNS + 5; i += 1) EV.record(root, 'test', 0)
  assert.equal(EV.runs(root).length, EV.MAX_RUNS)
})

