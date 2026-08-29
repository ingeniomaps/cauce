'use strict'

// Los casos adversariales de un recorrido y sus veredictos: que se lean como los de un cargo, que
// envejezcan cuando cambia el `flow.json` que miden, y que el vigente se componga sobre todas las
// corridas en vez de salir de la última.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const flows = require('../../engine/flows/registry')
const EV = require('../../engine/agents/evaluations')

const ROOT = path.resolve(__dirname, '..', '..')
const CLI = path.join(ROOT, 'engine', 'cli', 'ops.js')

// Un recorrido se mide como un cargo: una tentación escrita, los comportamientos que debería
// exhibir y un veredicto registrado. Hasta acá sólo se validaba su estructura —que las etapas
// existan, que los agentes existan, que los gates estén escritos—, así que nadie comprobaba nunca
// que un `exitGate` frenara lo que dice frenar.
test('los casos de un recorrido se leen como los de un cargo', () => {
  const casos = EV.list(ROOT, 'technical-design', 'flow')
  assert.ok(casos.length >= 4, 'el recorrido declara sus casos')
  for (const caso of casos) {
    assert.ok(caso.request.trim(), `${caso.id}: sin solicitud`)
    assert.equal(caso.expected.length, 4, `${caso.id}: cuatro comportamientos, como en todo el catálogo`)
  }

  const prohibido = EV.behaviors(ROOT, 'technical-design', 'flow').forbidden
  assert.ok(prohibido.includes('security_turned_into_an_approval'), 'la conducta prohibida llega a quien juzga')

  // El registro vive junto al recorrido, no junto a un cargo.
  assert.match(EV.resultsDir(ROOT, 'technical-design', 'flow').replace(ROOT, ''),
    /^\/flows\/system\/technical-design\/evaluations\/results$/)

  // Y sin nombrar el tipo se busca un cargo, que es lo que protege de la colisión.
  assert.throws(() => EV.list(ROOT, 'technical-design'), /no existe agents/)
})

// El sujeto que no tiene `SKILL.md`. Mirando sólo ése —lo que hacía `contractChangedAt`— un recorrido
// no envejecía nunca, así que el caso endurece el `flow.json` y espera el aviso que faltaba.
test('cambiar el flow.json de un recorrido envejece sus veredictos', () => {
  const root = tempRoot('cauce-flow-contrato-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'cases', '01-uno.md'),
    '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2099-01-07.md'),
    '---\nflow: probe\n---\n\n### 01-uno\n\n- Veredicto: pasa\n\nx\n')
  const contrato = path.join(dir, 'flow.json')
  fs.writeFileSync(contrato, JSON.stringify({ schemaVersion: 1, slug: 'probe' }))

  // El repositorio es lo que fecha el contrato: sin commit no hay fecha, y sin fecha no hay aviso.
  // `%cs` lee la fecha del committer, no la del autor, así que `--date` no alcanza: se fija por entorno.
  const git = (fecha, ...args) => spawnSync('git', ['-C', root, ...args],
    { encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: fecha, GIT_AUTHOR_DATE: fecha } })
  const inicial = '2099-01-01T00:00:00'
  git(inicial, 'init', '-q')
  git(inicial, 'config', 'user.email', 'probe@example.test')
  git(inicial, 'config', 'user.name', 'Probe')
  git(inicial, 'add', '-A')
  git(inicial, 'commit', '-qm', 'contrato inicial')

  assert.equal(EV.validate(root, 'probe', 'flow').warnings.some((one) => /contrato cambió/.test(one)),
    false, 'un contrato anterior a la corrida no envejece nada')

  // Se le agrega una dimensión al contrato, después de que el caso se midiera.
  fs.writeFileSync(contrato, JSON.stringify({ schemaVersion: 1, slug: 'probe', completion: ['algo más'] }))
  const despues = '2099-02-01T00:00:00'
  git(despues, 'add', '-A')
  git(despues, 'commit', '-qm', 'una dimensión más')

  assert.match(EV.validate(root, 'probe', 'flow').warnings.join('\n'),
    /el contrato cambió el 2099-02-01 y la última corrida es del 2099-01-07/,
    'el flow.json es el contrato de un recorrido, y cambiarlo envejece lo medido')
})

// `--cases` hace que una corrida cubra menos casos de los que el sujeto tiene, a propósito. Leyendo
// sólo la última, `evaluate` decía «cubre 1 de 4: el resultado no vale» de sujetos con los cuatro
// medidos, y anunciaba «1/1 pasan». Componer por caso —la última corrida gana— es lo que ya hace el
// ciclo de aprendizaje y lo que un humano venía haciendo a mano.
test('el veredicto se compone sobre todas las corridas, no sale de la última', () => {
  const root = tempRoot('cauce-eval-compuesto-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'probe' }))
  for (const id of ['01-uno', '02-dos', '03-tres']) {
    fs.writeFileSync(path.join(dir, 'evaluations', 'cases', `${id}.md`),
      '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  }
  const corrida = (name, cuerpo) => fs.writeFileSync(
    path.join(dir, 'evaluations', 'results', name), `---\nflow: probe\n---\n${cuerpo}`)

  // La primera midió dos y uno falló; la segunda re-corrió sólo ése y ahora pasa.
  corrida('2099-01-07.md', '\n### 01-uno\n\n- Veredicto: pasa\n\nx\n\n### 02-dos\n\n- Veredicto: no pasa\n\ny\n')
  corrida('2099-01-09.md', '\n### 02-dos\n\n- Veredicto: pasa\n\nya no falla\n')

  const estado = EV.composed(root, 'probe', 'flow')
  assert.equal(estado.total, 2, 'dos casos tienen veredicto, aunque ninguna corrida midiera los dos')
  assert.equal(estado.passed, 2, 'y el re-corrido cuenta con su veredicto nuevo')
  assert.deepEqual(estado.failed, [])
  // Lo compuesto es tan viejo como su parte más rancia: `01-uno` no se volvió a medir desde el 7.
  assert.equal(estado.oldest, '2099-01-07')
  assert.equal(estado.newest, '2099-01-09')

  const runs = EV.validate(root, 'probe', 'flow')
  assert.match(runs.warnings.join('\n'), /2 de 3 caso\(s\) con veredicto: sin medir 03-tres/,
    'lo que falta se nombra por su id, no como un conteo de una corrida')
  assert.equal(/el resultado no vale/.test(runs.warnings.join('\n')), false,
    'y lo medido en dos tandas no se descarta por venir en dos archivos')
})

// Declarar la columna y dejarla vacía es peor que no tenerla: el recorrido se lee entero y su
// medición no existe. La advertencia distingue no tener casos de tenerlos y no haber corrido.
test('un recorrido sin casos lo dice', () => {
  // Sobre un recorrido montado acá y no sobre uno del catálogo: el ejemplo era `incident-review`
  // mientras no tenía casos, y en cuanto los ganó la prueba pasó a medir el catálogo en vez de la
  // advertencia. Hoy los cinco tienen casos, así que ninguno serviría de ejemplo.
  const root = tempRoot('cauce-flow-empty-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'probe' }))
  assert.deepEqual(EV.validate(root, 'probe', 'flow').warnings,
    ['no declara casos: nada mide si su contrato aguanta'])

  // El otro lado de la advertencia, y también montado acá. Tomarlo del catálogo ya rompió dos veces
  // esta prueba: primero cuando `incident-review` ganó casos, y hoy cuando `defect-triage` ganó su
  // primer registro. El ejemplo tiene que ser del tamaño de lo que la prueba mide, no del catálogo,
  // que avanza por su cuenta.
  const conCasos = path.join(root, 'flows', 'con-casos')
  fs.mkdirSync(path.join(conCasos, 'evaluations', 'cases'), { recursive: true })
  fs.writeFileSync(path.join(conCasos, 'FLOW.md'), '# Con casos\n')
  fs.writeFileSync(path.join(conCasos, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'con-casos' }))
  fs.writeFileSync(path.join(conCasos, 'evaluations', 'cases', '01-uno.md'),
    '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  const medido = EV.validate(root, 'con-casos', 'flow')
  assert.match(medido.warnings.join('\n'), /sin resultados de casos: corré el recorrido/)
  assert.equal(medido.cases, 1)
})
