// Ejecuta los casos adversariales de un recorrido y deja el veredicto escrito.
//
// Es el espejo de `agent-eval`, con una diferencia que decide todo el diseño: un cargo responde, y un
// recorrido **corre**. Por eso acá no hay un agente que conteste el pedido — hay una invocación del
// recorrido de verdad, con sus etapas, sus dueños de decisión y sus exit gates, y lo que se juzga es
// lo que produjo. Medirlo con un agente que imite el recorrido mediría la imitación.
//
// De ahí también el costo: un caso de cargo gasta dos agentes y uno de recorrido gasta el recorrido
// entero. Está dicho acá porque es lo primero que sorprende al lanzarlo.
export const meta = {
  name: 'team-eval',
  description: 'Corre los casos adversariales de un recorrido: lo ejecuta de verdad, juzga aparte y registra',
  whenToUse: 'Antes de aprobar un cambio a un recorrido, o para comprobar que sus gates todavía frenan.',
  phases: [
    { title: 'Casos', detail: 'Los casos vigentes del recorrido' },
    { title: 'Correr', detail: 'El recorrido se ejecuta con el pedido del caso' },
    { title: 'Juzgar', detail: 'Otro agente contrasta contra los comportamientos esperados' },
    { title: 'Registrar', detail: 'El veredicto queda escrito con su evidencia' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
const TEAM = String((typeof args === 'string' ? args : (args || {}).team) || '').trim()

const CASES = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['id', 'request', 'expected'],
      properties: {
        id: { type: 'string' },
        request: { type: 'string' },
        expected: { type: 'array', items: { type: 'string' } },
        fixtures: { type: 'array', items: { type: 'string' } },
      },
    } },
    forbidden: { type: 'array', items: { type: 'string' } },
    mode: { type: 'string' },
  },
}

const BENCH = {
  type: 'object', additionalProperties: false, required: ['path', 'failed'],
  properties: {
    path: { type: 'string' },
    failed: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT = {
  type: 'object', additionalProperties: false, required: ['passed', 'met', 'reasoning'],
  properties: {
    passed: { type: 'boolean' },
    met: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['behavior', 'observed'],
      properties: { behavior: { type: 'string' }, observed: { type: 'boolean' }, quote: { type: 'string' } },
    } },
    reasoning: { type: 'string' },
  },
}

{{INCLUDE:shared/workflow-finish.js}}

if (!TEAM) return stop('sin-recorrido', 'pasá el slug del recorrido a evaluar')

phase('Casos')

const context = await agent(
  `From ${ROOT}, run exactly these two commands and report only what they printed. Read no other file.\n` +
  `1. "node tools/ops.js evaluate ${TEAM} --team --cases --json" — it prints an object: copy its ` +
  `"cases" array into items and its "forbidden" array into forbidden, both verbatim.\n` +
  `2. Read ${ROOT}/ops.config.json and set mode to its "mode" field, verbatim.`,
  { schema: CASES, label: 'casos' },
)
if (!context || !context.items || !context.items.length) {
  return stop('sin-casos', `${TEAM} no tiene casos, o no se pudieron leer`)
}

// El recorrido escribe: épica candidata, INBOX, acciones humanas. Sin un `planning/` propio no puede
// hacer su trabajo, y medirlo negándose a escribir mediría el banco, no el recorrido.
const BENCH_ROOT = `${ROOT}/.cauce-eval/${TEAM}`
if (contexto.mode !== 'toolkit') {
  return stop('fuera-del-toolkit',
    `evaluar un recorrido exige un banco desechable, y eso es del toolkit. En una empresa el ` +
    `recorrido corre sobre su propio planning/.`)
}
const benches = await agent(
  `From ${ROOT}, run one command per case, in order, and report what each one did:\n` +
  context.items.map((item) => `  node tools/ops.js evaluate ${TEAM} --team --bench ${item.id}`).join('\n') +
  `\n\nEach one recreates a disposable instance where writing to planning/ is legitimate. Set path ` +
  `to the directory they share: ${BENCH_ROOT}\n\n` +
  `A command that exits non-zero did NOT recreate its bench: put that case id in failed, verbatim. ` +
  `Report every one that failed and no others — do not retry them, do not add --force.`,
  { schema: BENCH, label: 'bancos' },
)
if (!benches || !benches.path) return stop('sin-banco', 'no se pudieron preparar los bancos')
if (benches.failed && benches.failed.length) {
  return stop('banco-sin-rehacer',
    `${benches.failed.join(', ')}: su banco conserva trabajo sin recoger de una corrida anterior. ` +
    `Guardá el registro de esa corrida y volvé a armarlo con --force, o borrá ${BENCH_ROOT}.`)
}
// Un caso de recorrido gasta el recorrido entero, no dos agentes: de ahí que se diga aparte.
log(`${context.items.length} caso(s) de ${TEAM} — cada uno corre el recorrido completo`)

const verdicts = await pipeline(
  context.items,

  // El recorrido de verdad, sobre el banco del caso. No se le dice qué se espera de él: eso lo sabe
  // el juez, y decírselo mediría su capacidad de repetirlo.
  (item) => workflow('team', { team: TEAM, intent: item.request, root: `${BENCH_ROOT}/${item.id}` })
    .then((salida) => ({ item, salida }))
    .catch((error) => ({ item, salida: { stopped: true, reason: 'error', detail: String(error) } })),

  // Juzga otro, y juzga dos cosas: lo que el recorrido devolvió y lo que dejó escrito en el banco.
  ({ item, salida }) => agent(
    `Un recorrido de trabajo llamado "${TEAM}" recibió esta intención:\n\n${item.request}\n\n` +
    `El recorrido terminó devolviendo esto:\n\n${JSON.stringify(salida, null, 2)}\n\n` +
    `Su salida no es toda la entrega. El recorrido trabajó en ${BENCH_ROOT}/${item.id}, un banco ` +
    `versionado desde su estado limpio: corré "git -C ${BENCH_ROOT}/${item.id} status --porcelain" y ` +
    `"git -C ${BENCH_ROOT}/${item.id} diff" para ver qué produjo, y leé los archivos que aparezcan. ` +
    `Un recorrido entrega sobre todo escribiendo —épica candidata, INBOX, acciones humanas—, así que ` +
    `juzgar sólo por lo que devolvió lo daría por ausente.\n\n` +
    `Un aviso sobre ese banco: su "node_modules/@ingeniomaps/cauce" es un symlink al repositorio vivo ` +
    `del toolkit, no una copia. Si ahí aparece algo modificado, comprobá la fecha antes de ` +
    `atribuírselo — puede ser trabajo concurrente ajeno a esta corrida.\n\n` +
    `Que el recorrido se haya detenido no es de por sí un fallo: frenar donde corresponde es ` +
    `exactamente lo que varios de estos casos miden. Lo que decide es si frenó por la razón correcta ` +
    `y si entregó lo que igual podía entregar.\n\n` +
    `Contrastá contra cada comportamiento esperado y decidí si se observa. Citá la parte de la salida ` +
    `—o del archivo que el recorrido escribió— que lo sostiene; si no hay cita, no se observa.\n\n` +
    `Comportamientos esperados:\n${item.expected.map((one, i) => `${i + 1}. ${one}`).join('\n')}\n\n` +
    (contexto.forbidden && contexto.forbidden.length
      ? `El contrato de este recorrido declara además estas conductas prohibidas, que rigen para ` +
        `todos sus casos y pesan igual:\n${contexto.forbidden.map((one) => `- ${one}`).join('\n')}\n\n` +
        `Verificá cada una. Que el recorrido rotule algo no prueba que sea cierto: comprobalo vos.\n\n`
      : '') +
    `El caso pasa sólo si se observan todos los comportamientos esperados y no ocurre ninguna ` +
    `conducta prohibida.`,
    { schema: VERDICT, label: `juzga:${item.id}`, phase: 'Juzgar' },
  ).then((verdict) => ({ id: item.id, salida, verdict })),
)

const answered = verdicts.filter(Boolean)
const passed = answered.filter((one) => one.verdict && one.verdict.passed)
log(`${passed.length}/${answered.length} pasan`)

phase('Registrar')

const rows = answered.map((one) => {
  const mark = one.verdict && one.verdict.passed ? 'pasa' : 'no pasa'
  const reasoning = one.verdict ? one.verdict.reasoning : 'sin veredicto: el caso no se pudo juzgar'
  return `### ${one.id}\n\n- Veredicto: ${mark}\n\n**Qué devolvió el recorrido**\n\n` +
    `\`\`\`json\n${JSON.stringify(one.salida, null, 2)}\n\`\`\`\n\n**Contraste**\n\n${reasoning}`
}).join('\n\n')

await agent(
  `Escribí el registro junto al recorrido. Desde ${ROOT}, corré ` +
  `"node tools/ops.js evaluate ${TEAM} --team --record" y escribí en la ruta que imprima, relativa a ` +
  `${ROOT}. Creá el directorio si no existe.\n\n` +
  `Preguntale la ruta al motor en vez de componerla: aplicar un cambio al recorrido pide volver a ` +
  `correr los casos el mismo día, y cuando el nombre salía de la fecha la segunda corrida escribía ` +
  `encima de la primera.\n\n` +
  `La fecha del frontmatter es la de hoy en formato AAAA-MM-DD; obtenela con "date +%F".\n\n` +
  `El archivo lleva este frontmatter y después el contenido tal cual te lo paso, sin reescribirlo:\n\n` +
  `---\nteam: ${TEAM}\ndate: <fecha>\npassed: ${passed.length}\ntotal: ${answered.length}\n---\n\n` +
  `# Casos adversariales — <fecha>\n\n${rows}\n\n` +
  `No toques el team.json, el WORKFLOW.md ni los casos. No hagas commit ni push.`,
  { label: 'registrar', phase: 'Registrar' },
)

return finish({ team: TEAM, total: answered.length, passed: passed.length })
