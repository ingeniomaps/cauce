// Arranque de una instancia recién creada: convierte un repositorio que nadie le explicó al toolkit en
// contexto escrito —`organization/`, el mapa real de `AGENTS.md`, las raíces de código— y en la primera
// épica.
//
// El orden importa y se pagó caro: la primera versión le pedía a un agente que «inventariara el
// repositorio», y en una carpeta vacía eso gastó doce minutos para no encontrar nada. Recorrer el árbol
// es determinista y lo hace `ops onboard` en milisegundos; el modelo entra después, y sólo si hay algo
// sobre lo que decidir.
//
// De ahí el techo: una llamada cuando falta contexto y tres cuando hay con qué escribir. No son fases
// separadas por prolijidad —escribir el contexto y registrar lo que le toca a una persona salen de la
// misma evidencia, así que salen juntas—, y ninguna sale a explorar: un arranque que hace esperar diez
// minutos ya no es un arranque.
//
// Escribe borradores y no decide por nadie: lo deducido queda marcado como supuesto, las credenciales y
// los sistemas externos van a HUMAN_ACTIONS —R12 se los prohíbe a un runner— y la épica queda sin
// promover, que sigue siendo la firma humana.
export const meta = {
  name: 'onboard',
  description: 'Inventaría el workspace y deja escrito el contexto de la empresa y la primera épica',
  whenToUse: 'Primera corrida después de "cauce init", cuando organization/ y el roadmap están vacíos.',
  phases: [
    { title: 'Scan', detail: 'Estado e inventario, resueltos por el CLI y no por un modelo' },
    { title: 'Draft', detail: 'organization/, mapa real, raíces y acciones humanas, de una pasada' },
    { title: 'Epic', detail: 'La épica que deja al ciclo poder correr, y su check' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
const P = `${ROOT}/planning`
const ORG = `${ROOT}/organization`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const INBOX = `${P}/INBOX.md`
const ROADMAP = `${P}/roadmap`

// Lo que la persona ya sabe y el repositorio no puede decir: `/onboard vendemos ruteo a PYMEs de
// logística`. Entra como hecho; lo que se deduce, no.
const input = typeof args === 'string' ? { context: args } : (args || {})
const CONTEXT = String(input.context || '').trim()
const FORCE = Boolean(input.force)

const BASE = `Nunca inventes clientes, métricas, ingresos, plazos ni responsables. Distinguí lo que leíste ` +
  `en un archivo de lo que estás suponiendo: lo segundo va marcado "(supuesto)" en el texto que escribas. ` +
  `No leas archivos de credenciales —.env, *.pem, claves— ni copies su contenido a ningún lado; ` +
  `.env.example sí, y sólo los nombres de las variables. No corras comandos del proyecto: este recorrido ` +
  `no ejecuta nada. No escribas en ningún sistema externo y no promuevas trabajo al BACKLOG.\n\n` +
  `Trabajá con lo que ya tenés: el inventario que devolvió el comando y lo que contestó la persona. No ` +
  `recorras directorios, no leas código fuente y no abras más archivos que los que vas a escribir. Esto ` +
  `es un arranque de cinco minutos, no una auditoría: lo que no esté a la vista se marca como supuesto o ` +
  `queda como pregunta abierta, que es más barato y más honesto que averiguarlo.\n\n` +
  `Lo que cuesta no son las palabras que escribís sino las vueltas que das: cada llamada arrastra tu ` +
  `contexto entero. Leé un archivo una sola vez y sólo si vas a escribirlo; escribilo completo de una, sin ` +
  `editarlo después; no lo releas para comprobar que quedó —si la escritura falla, te enterás—. Medido en ` +
  `una corrida real: la fase que escribe gastó veinte vueltas con seis lecturas y tres ediciones para ` +
  `producir cuatro archivos.\n\n` +
  `El arranque tiene tres objetivos y ninguno más: entender qué es este proyecto, dejar la instancia ` +
  `correcta para él —contexto, mapa, raíces, lo que espera a una persona— y que la primera tarea pueda ` +
  `empezar. El análisis profundo llega después, cuando alguien pida algo concreto; adelantarlo acá ` +
  `retrasa el único momento en que la herramienta todavía no sirve para nada.`

{{INCLUDE:shared/workflow-finish.js}}

const SCAN = {
  type: 'object', additionalProperties: false, required: ['fresh', 'services'],
  properties: {
    fresh: { type: 'boolean' },
    reason: { type: 'string' },
    // La conversación la enmarca el motor, no este recorrido: `ops onboard` da con qué pregunta empezar
    // y qué dimensiones hay que cubrir, y duplicarlas acá dejaría dos listas que envejecen por separado.
    opening: { type: 'string' },
    followUps: { type: 'integer' },
    dimensions: { type: 'array', items: { type: 'string' } },
    services: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['path'], properties: {
        path: { type: 'string' },
        runtimes: { type: 'array', items: { type: 'string' } },
        // Comando declarado y de qué archivo salió. Verificar que además corra es una historia de la
        // épica: correr la suite de cada servicio acá convertía el arranque en una espera larga.
        commands: { type: 'array', items: { type: 'object', additionalProperties: false,
          required: ['kind', 'command', 'source'], properties: {
            kind: { type: 'string' }, command: { type: 'string' }, source: { type: 'string' },
          } } },
        // Los nombres de variable que ese servicio espera, copiados del inventario. En un multirepo cada
        // repositorio trae su propio ejemplo, y sin esto las credenciales de tres repos no existían para
        // el arranque: las filas terminaban diciendo «la credencial del proveedor» sin nombrarla.
        env: { type: 'array', items: { type: 'string' } },
      } } },
    externals: { type: 'array', items: { type: 'string' } },
    secrets: { type: 'array', items: { type: 'string' } },
  },
}

const WRITTEN = {
  type: 'object', additionalProperties: false, required: ['files'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    humanActions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

phase('Scan')

// Una sola llamada, y todo lo que hace es correr dos comandos y mirar dos archivos. Lo que sigue depende
// de lo que devuelva, así que gastar más antes de saberlo es gastar a ciegas.
const state = await agent(
  `${BASE}\n\nFrom ${ROOT}, run exactly these two commands and report what they printed. Explore nothing ` +
  `else and open no file other than .env.example at the workspace root.\n` +
  `1. "node tools/ops.js onboard --json": the instance state, the workspace inventory, the opening ` +
  `question and the dimensions still uncovered. Copy fresh, opening, followUps, the "need" of each ` +
  `dimension, and every service with its path, its runtimes, its declared commands keeping the source ` +
  `file each command came from, and the variable names its "env" carries. Add nothing it did not print.\n` +
  `2. "node tools/ops.js check planning".\n` +
  `The inventory already names every credential each service expects: never open a .env file to look for ` +
  `more. Report those names in secrets and the services they point at in externals. A name the inventory ` +
  `carries is declared, and saying otherwise is a claim the repository contradicts.`,
  { schema: SCAN, label: 'inventario' },
)
if (!state) return stop('scan-unavailable', 'no se pudo leer el estado del workspace')
if (!state.fresh && !FORCE) {
  return stop('ya-arrancado', `${state.reason || 'la instancia ya tiene contexto escrito'}. ` +
    `Pasá force:true si querés reescribir los borradores.`)
}

const services = state.services || []
const listado = services.map((service) => service.path).join(', ')
log(`${services.length} servicio(s) en el workspace${listado ? `: ${listado}` : ''}`)

// Sin contexto no hay nada que escribir que no sea inventado. Lo que se devuelve no es una negativa
// sino la conversación: quien recién instaló no sabe qué es «volvé a correrlo con contexto», y adivinar
// qué se espera de él es exactamente el trabajo que esta herramienta viene a sacarle de encima.
//
// Y se devuelve una pregunta con sus dimensiones, no un cuestionario: preguntarle «qué vende» a un
// proyecto libre, interno o sin fines de lucro es empezar por una respuesta que nadie dio.
const dimensions = state.dimensions || []
if (!CONTEXT && state.opening) {
  log(`Falta lo que el repositorio no puede decir. Preguntale primero, con estas palabras:`)
  log(`  ${state.opening}`)
  const faltan = dimensions.map((need) => `  · ${need}`).join('\n')
  log(`Después, según lo que conteste, hasta ${state.followUps || 3} preguntas más, formuladas para este ` +
    `proyecto y no como formulario, hasta cubrir lo que haga falta de:\n${faltan}`)
  log('Con sus respuestas, volvé a invocar el arranque pasándoselas como contexto.')
  return finish({ needsContext: true, opening: state.opening, dimensions, services: services.length })
}

const INVENTARIO = { services, externals: state.externals || [], secrets: state.secrets || [] }
const EVIDENCE = `Inventario del workspace:\n${JSON.stringify(INVENTARIO)}` +
  `${CONTEXT ? `\n\nContexto aportado por la persona, que vale como hecho: ${CONTEXT}` : ''}` +
  `${services.length ? '' : '\n\nNo hay ningún servicio en el workspace: el código todavía no está acá.'}`

phase('Draft')

const drafted = await agent(
  `${BASE}\n\n${EVIDENCE}\n\nEscribí de una sola pasada el contexto de esta instancia, reemplazando el ` +
  `molde en vez de comentarlo:\n` +
  `1. ${ORG}/company.md y ${ORG}/product.md: lo que la persona contó y los nombres del repositorio ` +
  `permiten afirmar. Lo que nada sostiene queda "Por definir" y su pregunta va a openQuestions. Una ` +
  `dimensión que no llegaste a preguntar no se completa deduciéndola: queda "Por definir" con su ` +
  `pregunta en openQuestions, aunque puedas imaginar la respuesta. Y lo que sí deducís de otra ` +
  `respuesta va marcado "(supuesto)", por plausible que sea: sin la marca se lee con el mismo peso que ` +
  `lo que alguien dijo. No des ` +
  `por sentado que el proyecto vende algo: puede sostenerse con donaciones, presupuesto interno o ` +
  `trabajo voluntario, y una sección que no aplica se dice, no se completa con algo plausible.\n` +
  `2. La sección "## Mapa real" de ${ROOT}/AGENTS.md: una entrada por servicio con su ruta, su runtime y ` +
  `sus comandos **tal como los declara**, diciendo de qué archivo salió cada uno. No afirmes que ` +
  `funcionan: nadie los corrió. Un servicio sin comandos declarados se escribe así, que es información.\n` +
  `3. ${ROOT}/ops.config.json: dejá en workspaceRoots las raíces de código reales, que es lo que un guard ` +
  `usa para bloquear una escritura fuera de lugar. Una raíz de más lo apaga.\n` +
  `${services.length ? '' : 'Sin servicios, el mapa queda declarado como pendiente, diciendo qué lo ' +
    'completa.\n'}` +
  `4. ${HUMAN}: una fila por cada cosa que necesita a una persona, con la tarea, el estado pendiente, el ` +
  `origen "onboard" y la acción concreta que la desbloquea. Como mínimo, una por cada credencial que el ` +
  `inventario nombra, diciendo la variable y el servicio que la espera. El nombre ya está declarado, así ` +
  `que no pidas declararlo de nuevo: lo que falta es dónde se carga el valor y quién lo hace, y ningún ` +
  `valor se propone acá. Además, una por cada sistema externo o MCP a conectar, y una por la autoridad ` +
  `del runner, que hoy declara runner.allowPush=false.\n` +
  `5. Las preguntas que queden abiertas, en la sección Ideas de ${INBOX}, sin promover.\n` +
  `Devolvé en files cada archivo que tocaste y en assumptions cada supuesto que dejaste marcado.`,
  { schema: WRITTEN, label: 'contexto' },
)
if (!drafted) return stop('draft-unavailable', 'los borradores no devolvieron resultado')

phase('Epic')

const epic = await agent(
  `${BASE}\n\n${EVIDENCE}\n\nSupuestos que quedaron escritos: ${JSON.stringify(drafted.assumptions || [])}\n\n` +
  `Escribí en ${ROADMAP} la épica epic-001-<slug>.md siguiendo el contrato de ${P}/PROTOCOL.md: ` +
  `frontmatter epic/title/status/service con status open, criterios **CN** observables, "## Contexto ` +
  `relevante" con rutas reales e historias con (→ CN) y (service: ruta), cada una de menos de cuatro ` +
  `horas.\n\n` +
  `Su resultado es que una tarea pueda atravesar el ciclo entero sin que nadie tenga que volver a ` +
  `explicar este proyecto. Los criterios salen de lo que hoy falta y son verificables: que organization/ ` +
  `no tenga supuestos sin confirmar, que cada comando del mapa esté verificado corriéndolo y anotado con ` +
  `su resultado, que las raíces declaradas hagan que el guard de límites bloquee una escritura afuera y ` +
  `deje pasar una adentro, y que una tarea piloto real llegue a DONE con evidencia. ` +
  `${services.length
    ? 'Verificar los comandos es una historia: nadie los corrió todavía.'
    : 'La primera historia es traer los repos y declararlos en workspaceRoots.'} ` +
  `En "## Riesgos y decisiones humanas" citá las filas que quedaron en HUMAN_ACTIONS. No toques ` +
  `BACKLOG.md.\n\n` +
  `El contrato de una épica está en ${P}/PROTOCOL.md; si necesitás verlo, leé esa sección y no el archivo ` +
  `entero, y escribí la épica de una sola vez.\n\n` +
  `Cerrá corriendo "node tools/ops.js check planning" desde ${ROOT} y, si falla, reparando sólo lo que ` +
  `esta corrida escribió; nunca debilites un criterio para forzar el verde. Una sola corrida de check: si ` +
  `pasó, terminaste.`,
  { schema: { type: 'object', additionalProperties: false, required: ['file', 'passed'],
    properties: {
      file: { type: 'string' }, passed: { type: 'boolean' }, details: { type: 'string' },
      criteria: { type: 'array', items: { type: 'string' } },
      stories: { type: 'array', items: { type: 'string' } },
    } }, label: 'epica-001' },
)
if (!epic) return stop('epic-unavailable', 'la épica no devolvió resultado')
if (!epic.passed) return stop('check-failed', epic.details || 'check no pasó tras escribir la épica')

const supuestos = (drafted.assumptions || []).length
const acciones = (drafted.humanActions || []).length
log(`Contexto escrito con ${supuestos} supuesto(s) por confirmar y ${acciones} acción(es) humana(s) en ${HUMAN}.`)
log(`Épica en ${epic.file}, sin promover: revisala, promoví una historia a un hito del BACKLOG y corré /autobuild.`)

return finish({
  services: services.length,
  assumptions: supuestos,
  humanActions: acciones,
  epic: epic.file,
  promoted: false,
})
