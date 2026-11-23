'use strict'

// Qué cambio de cada llave de `ops.config.json` afloja lo que frena a un agente —un guard, o un freno del recorrido de
// `autobuild`—, para que no se lo escriba solo y lo confirme una persona (caso 498). Están todas las llaves de primer
// nivel y las de `runner` que acepta `validate.js`, y `test/hooks/ops-config-keys.test.js` falla si falta una: la
// próxima nace en rojo y no abierta (R27). Una subllave nueva de un objeto no: la cubre su regla, o nada.
//
// Cada regla devuelve qué afloja, y lo que angosta no se pregunta. Lo que devuelve va en el ítem que la persona
// confirma o pega, así que una línea pegada abre ese valor y no cualquier cambio futuro de la llave.

const M = require('../core/migrations')

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const list = (value) => (Array.isArray(value) ? value : [])
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value))
const added = (before, after) => list(after).filter((one) => !list(before).some((old) => same(old, one)))
  .map((one) => `+${text(one)}`)
const removed = (before, after) => list(before).filter((one) => !list(after).some((now) => same(now, one)))
  .map((one) => `-${text(one)}`)
const turnedOn = (before, after) => (after === true && before !== true ? ['true'] : [])
const turnedOff = (before, after) => (before === true && after !== true ? [text(after ?? 'sin declarar')] : [])
// Como número, que es como lo lee `autobuild` (`cli/contract.js`).
const raised = (before, after) => (Number.isFinite(Number(after)) && Number(after) > Number(before)
  ? [String(after)] : [])
// Un piso que baja o se quita: sin declarar no frena nada.
const lowered = (before, after) => (Number(before) > 0 && !(Number(after) >= Number(before))
  ? [String(after ?? 'sin declarar')] : [])
// Por grupo: cada evento de `guards`, cada línea de `lines`.
const byGroup = (rule) => (before, after) => {
  const groups = new Set([...Object.keys(object(before)), ...Object.keys(object(after))])
  return [...groups].flatMap((name) => rule(object(before)[name], object(after)[name])
    .map((one) => `${name} ${one}`))
}
// Lo que deja de mirarse, con los defaults puestos: declarar por primera vez los reemplaza.
const uncovered = (before, after) => {
  const [was, now] = [M.coverage({ migrations: before }), M.coverage({ migrations: after })]
  return [...removed(was.paths, now.paths), ...removed(was.extensions, now.extensions).map((one) => `.${one.slice(1)}`)]
}
// El guard vuelve sin mirar cuando la llave es falsa (`comments.js`), así que eso es apagarlo.
const comments = (before, after) => {
  if (!before) return []
  if (!after) return ['sin declarar']
  const [was, now] = [object(before), object(after)]
  return [
    ...(was.language !== undefined && now.language === undefined ? ['-language'] : []),
    ...(was.inlineMax !== undefined && (now.inlineMax === undefined || now.inlineMax > was.inlineMax)
      ? [`inlineMax ${now.inlineMax ?? 'sin tope'}`] : []),
  ]
}
const toolkit = (before, after) => (after === 'toolkit' && before !== 'toolkit' ? ['toolkit'] : [])

// La llave, qué frena, y con qué cambio deja de frenarlo. `null` es que no frena nada, o que lo cuida este mismo guard.
const KEYS = {
  'runner.commitToLiveBranch': turnedOn, // live-commit
  'runner.allowAiSignature': turnedOn, // ai-signature
  'runner.humanCheckpointBetweenMilestones': turnedOff, // autobuild: el checkpoint entre hitos
  'runner.maxTaskHours': raised, // autobuild: el tope con que se parte una tarea
  'runner.gateMinFreeMb': lowered, // verify: la memoria libre con que arranca un gate (caso 550)
  boundedCommands: added, // test-workers
  reviewExempt: added, // autobuild: los archivos que la revisión tiene que abrir (caso 485)
  lines: byGroup(added), // cada repositorio de una línea es una raíz escribible
  deployCommands: removed, // delivery
  mcpSandbox: added, // mcp-writes: un servidor que deja de frenarse
  mcpReads: added, // mcp-writes: una herramienta que pasa como lectura
  guards: byGroup(removed), // los guards propios del proyecto, por evento
  comments, // comments: quitarlo apaga el guard; subir `inlineMax` lo afloja
  migrations: uncovered, // migrations
  mode: toolkit, // en `toolkit` no corre engine-writes
  // Los cuida este mismo guard: el permiso de push (caso 114) y las raíces (caso 373).
  'runner.allowPush': null,
  'runner.pushToLiveBranches': null,
  'runner.liveBranches': null,
  workspaceRoots: null,
  writableOutsideRoots: null,
  // Libres. `gateTimeoutMinutes` vencido marca el gate como `cortado` y no lo deja pasar (`verify.js`); con
  // `commitPerTask` apagado la revisión mira el árbol igual.
  $schema: null,
  cauceVersion: null,
  project: null,
  inbox: null,
  timeZone: null,
  runner: null,
  'runner.commitPerTask': null,
  'runner.gateTimeoutMinutes': null,
}

const valueOf = (config, key) => {
  const [head, tail] = key.split('.')
  const value = object(config)[head]
  return tail ? object(value)[tail] : value
}

// Lo que este cambio afloja, una entrada por valor: `llave detalle`.
function loosened(before, after) {
  return Object.entries(KEYS).filter(([, rule]) => rule)
    .flatMap(([key, rule]) => rule(valueOf(before, key), valueOf(after, key)).map((one) => `${key} ${one}`))
}

module.exports = { KEYS, loosened }
