// Aplica una propuesta ya firmada y comprueba que el cargo siga aguantando sus casos.
//
// Es el único recorrido que modifica un cargo, y por eso tiene dos candados que no se pueden saltar:
//
//   1. Se niega si «Aprobación humana» no está firmada con responsable. Un agente no se autoriza a sí
//      mismo, y `automatic_apply: false` sigue siendo cierto: esto no corre solo, lo corre alguien
//      después de firmar.
//   2. Invalida el registro de evaluación anterior y manda a rehacerlo. Aplicar deja un contrato
//      cambiado y nadie sabiendo si todavía se sostiene: el veredicto que había medía la versión
//      vieja. Correr los casos acá no sirve —son un recorrido propio, con su banco por caso y su
//      juez—, así que este termina nombrando `/agent-eval` en vez de fingir que ya verificó.
//
// Aplica **prosa**, no un parche, y es a propósito: la propuesta dice «agregar dos viñetas después de
// la última existente». Un parche envejece si alguien toca el archivo mientras la propuesta espera
// firma; la prosa sobrevive a eso, a cambio de exigir criterio al aplicar. Ese criterio queda visible:
// toda desviación se escribe en la propia propuesta.
export const meta = {
  name: 'agent-promote',
  description: 'Aplica una propuesta firmada, registra el cambio y vuelve a correr los casos',
  whenToUse: 'Después de firmar «Aprobación humana» en una propuesta mensual.',
  phases: [
    { title: 'Firma', detail: 'Sin aprobación humana no se toca nada' },
    { title: 'Aplicar', detail: 'El cambio, archivo por archivo' },
    { title: 'Registrar', detail: 'Historial del cargo' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
const AGENT = String((typeof args === 'string' ? args : (args || {}).agent) || '').trim()
const PERIOD = String((args || {}).period || '').trim()

const FIRMA = {
  type: 'object', additionalProperties: false, required: ['dir', 'proposal', 'approved'],
  properties: {
    dir: { type: 'string' },
    proposal: { type: 'string' },
    approved: { type: 'boolean' },
    signedBy: { type: 'string' },
    state: { type: 'string' },
    status: { type: 'string' },
    hasChange: { type: 'boolean' },
  },
}

const APLICADO = {
  type: 'object', additionalProperties: false, required: ['applied', 'files'],
  properties: {
    applied: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'string' },
    newCase: { type: 'string' },
  },
}

{{INCLUDE:shared/workflow-finish.js}}

if (!AGENT) return stop('sin-cargo', 'pasá el slug del cargo')

phase('Firma')

const signature = await agent(
  `From ${ROOT}, run "node tools/ops.js agents list --json" and take the path it printed for ${AGENT}. ` +
  `Set dir to "${ROOT}/<path>": that command prints paths relative to ${ROOT}.\n\n` +
  `Find the newest proposal under <dir>/learning/proposals/. They are named AAAA-MM.md, and a ` +
  `correction to an already applied one is AAAA-MM-rN.md — the revision is newer than the plain name ` +
  `for the same month, so sorting file names is not enough` +
  `${PERIOD ? `. Prefer the newest one for ${PERIOD}` : ''}. Set proposal to its full path. Read ` +
  `**only** its ` +
  `frontmatter and its "Aprobación humana" and "Cambio propuesto" sections and report, without ` +
  `interpreting in anyone's favour:\n` +
  `- approved: true only if the state says it is approved AND a named person is recorded. "pendiente", ` +
  `"por definir" or an empty responsible means false.\n` +
  `- signedBy: the person recorded, or empty.\n` +
  `- state: the literal state line.\n` +
  `- status: the literal value of the frontmatter "status:" field.\n` +
  `- hasChange: true only if "Cambio propuesto" carries a concrete change; "por definir" means false.`,
  { schema: FIRMA, label: 'signature' },
)
if (!signature) return stop('sin-propuesta', `no se pudo leer una propuesta de ${AGENT}`)
if (!signature.hasChange) {
  return stop('propuesta-vacia', `${signature.proposal} no tiene cambio concreto: corré /agent-propose primero`)
}
if (!signature.approved) {
  return stop('sin-firma', `${signature.proposal} no está aprobada (${signature.state || 'sin estado'}). ` +
    'Firmá «Aprobación humana» con un responsable y repetí: nadie se autoriza a sí mismo')
}
// Una propuesta aplicada no se vuelve a aplicar. La firma no alcanza como candado: sigue firmada
// después, y el estado en prosa pasa a decir «aprobada y aplicada», que también lee como aprobada.
// Como el cambio es aditivo por diseño, reaplicar no falla — duplica cada viñeta y cada fuente.
if ((signature.status || '').toLowerCase() === 'applied') {
  return stop('ya-aplicada', `${signature.proposal} ya está aplicada. Si la evaluación posterior mostró que ` +
    `el cambio quedó mal calibrado, abrí una revisión con "node tools/ops.js learn ${AGENT} --proposal": ` +
    'la aplicada queda sellada donde está y la corrección va con su propia firma')
}
log(`Aprobada por ${signature.signedBy}`)

// El período sale del nombre del archivo, que el motor ya garantiza: pedírselo otra vez al modelo sería
// preguntar dos veces lo mismo y arriesgar dos respuestas. Se toma el nombre entero y no sólo el mes,
// porque con una revisión abierta hay dos archivos del mismo período y hay que sellar el que se aplicó.
const PERIOD = (signature.proposal.match(/(\d{4}-\d{2}(?:-r\d+)?)\.md$/) || [])[1] || ''
if (!PERIOD) return stop('propuesta-sin-periodo', `${signature.proposal} no se llama AAAA-MM.md ni AAAA-MM-rN.md`)

phase('Aplicar')

const applied = await agent(
  `La propuesta ${signature.proposal} está aprobada por ${signature.signedBy}. Aplicá su sección «Cambio ` +
  `propuesto» al cargo ${AGENT} en ${signature.dir}, archivo por archivo, tal como la propuesta lo ` +
  `describe.\n\n` +
  `Reglas al aplicar:\n` +
  `- Preferí agregar sobre reescribir. Si la propuesta dice «agregar después de X», agregá; no ` +
  `reordenes ni reformules lo que ya estaba.\n` +
  `- Si la propuesta pide crear un caso adversarial nuevo, crealo con el enunciado que da y con ` +
  `**cuatro** comportamientos esperados, como todos los del catálogo. Si el enunciado trae más, ` +
  `fusioná los que se solapen sin perder ninguna idea.\n` +
  `- Si algo de la propuesta ya no aplica —el archivo cambió, la sección no existe— **no lo fuerces**: ` +
  `dejalo sin aplicar y reportalo como desviación.\n` +
  `- Toda desviación, por chica que sea, se escribe al final de «Aprobación humana» en la propia ` +
  `propuesta, explicando qué se hizo distinto y por qué. Quien firmó tiene derecho a saber qué se ` +
  `aplicó de lo que firmó.\n\n` +
  `No toques otros cargos. No hagas commit ni push. Devolvé qué archivos modificaste, el caso nuevo si ` +
  `lo creaste, y las desviaciones —o cadena vacía si no hubo—.`,
  { schema: APLICADO, label: `aplica:${AGENT}` },
)
if (!applied || !applied.applied) {
  return stop('no-aplicada', 'el cambio no se pudo aplicar; la propuesta queda como estaba')
}
log(`Aplicado en: ${(applied.files || []).join(', ')}`)

phase('Registrar')

await agent(
  `Agregá una fila a ${signature.dir}/learning/HISTORY.md con la fecha de hoy —obtenela con "date +%F"—, ` +
  `la propuesta ${signature.proposal}, decisión "Aprobada", quién firmó (${signature.signedBy}) y qué se ` +
  `aplicó: ${(applied.files || []).join(', ')}` +
  `${applied.newCase ? ` más el caso ${applied.newCase}` : ''}` +
  `${applied.deviations ? `. Desviaciones: ${applied.deviations}` : ''}.\n\n` +
  `Respetá el formato de tabla que ya tiene el archivo. No toques ninguna otra cosa, no hagas commit.`,
  { label: 'historial' },
)

// Sellar es lo último: hasta que el cambio no está aplicado y registrado, la propuesta sigue
// pendiente. Lo hace el motor y no vos, a mano, porque marcar el estado editando frontmatter es
// exactamente el paso que se hace mal en silencio.
await agent(
  `From ${ROOT}, run "node tools/ops.js learn ${AGENT} --applied --period ${PERIOD}" and report only ` +
  `what it printed. Change nothing else.`,
  { label: 'sella' },
)

log('El contrato cambió: los casos valen sólo si se vuelven a correr contra la versión nueva.')
return finish({
  agent: AGENT,
  proposal: signature.proposal,
  signedBy: signature.signedBy,
  files: applied.files || [],
  newCase: applied.newCase || '',
  deviations: applied.deviations || '',
  next: `corré /agent-eval ${AGENT}: el registro anterior quedó viejo y no vale para el contrato nuevo`,
})
