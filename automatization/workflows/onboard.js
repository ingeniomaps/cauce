// Arranque de una instancia recién creada: convierte un repositorio que nadie le explicó al toolkit en
// contexto escrito —`organization/`, el mapa real de `AGENTS.md`, las raíces de código— y en la primera
// épica. Es el paso que `init` no puede dar: instalar es determinista, y leer un repositorio para decidir
// qué es el producto, qué carpeta es legacy y cuál es el comando que de verdad lo valida, no lo es.
//
// Escribe borradores y no decide por nadie: cada dato deducido queda marcado como supuesto, las
// credenciales y los sistemas externos van a HUMAN_ACTIONS —R12 se los prohíbe a un runner— y la épica
// queda en roadmap/ sin promover, que sigue siendo la firma humana.
export const meta = {
  name: 'onboard',
  description: 'Escanea el repositorio y deja escrito el contexto de la empresa y la primera épica',
  whenToUse: 'Primera corrida después de "cauce init", cuando organization/ y el roadmap están vacíos.',
  phases: [
    { title: 'Scan', detail: 'Servicios, manifiestos y comandos declarados' },
    { title: 'Verify', detail: 'Los comandos se corren: el mapa no se copia del README' },
    { title: 'Draft', detail: 'organization/, mapa real, raíces y acciones humanas' },
    { title: 'Epic', detail: 'La épica que deja al ciclo poder correr' },
    { title: 'Closing', detail: 'check y lo que queda esperando a una persona' },
  ],
}

// El prefijo lo completa `automation install`. Igual que en los demás workflows: el runtime no expone
// `process`, así que la ruta de la raíz ops viaja escrita, relativa a donde se abre la herramienta.
const ROOT = '{{OPS_DIR}}'.replace(/\/+$/, '') || '.'
const P = `${ROOT}/planning`
const ORG = `${ROOT}/organization`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const INBOX = `${P}/INBOX.md`
const ROADMAP = `${P}/roadmap`

// Lo que la persona ya sabe y no hace falta deducir: `/onboard vendemos ruteo a PYMEs de logística`.
// Entra como contexto, no como verdad: lo que diga acá se escribe como hecho, y lo deducido no.
const input = typeof args === 'string' ? { context: args } : (args || {})
const CONTEXT = String(input.context || '').trim()
const FORCE = Boolean(input.force)

const BASE = `Nunca inventes clientes, métricas, ingresos, plazos ni responsables. Distinguí siempre lo ` +
  `que verificaste corriendo algo, lo que leíste en un archivo del repositorio y lo que estás ` +
  `suponiendo: lo tercero va marcado como "(supuesto)" en el texto que escribas. No leas archivos de ` +
  `credenciales —.env, *.pem, claves— ni copies su contenido a ningún lado; .env.example sí, y sólo los ` +
  `nombres de las variables. No escribas en ningún sistema externo, no conectes nada y no promuevas ` +
  `trabajo al BACKLOG.`

function finish(result) {
  log(`Fin: ${JSON.stringify(result)}`)
  return result
}

const stop = (reason, detail = '') => {
  log(`Checkpoint: ${reason}${detail ? ` — ${detail}` : ''}`)
  return finish({ stopped: true, reason, detail })
}

const STATE = {
  type: 'object', additionalProperties: false, required: ['fresh'],
  properties: {
    fresh: { type: 'boolean' },
    reason: { type: 'string' },
    mode: { type: 'string' },
    workspaceRoots: { type: 'array', items: { type: 'string' } },
  },
}

const INVENTORY = {
  type: 'object', additionalProperties: false, required: ['services'],
  properties: {
    services: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['path', 'runtime'], properties: {
        path: { type: 'string' }, runtime: { type: 'string' }, purpose: { type: 'string' },
        test: { type: 'string' }, lint: { type: 'string' }, build: { type: 'string' },
        source: { type: 'string' },
      } } },
    legacy: { type: 'array', items: { type: 'string' } },
    ci: { type: 'array', items: { type: 'string' } },
    externals: { type: 'array', items: { type: 'string' } },
    secrets: { type: 'array', items: { type: 'string' } },
    productHints: { type: 'string' },
  },
}

const CHECKED = {
  type: 'object', additionalProperties: false, required: ['path', 'results'],
  properties: {
    path: { type: 'string' },
    results: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['kind', 'command', 'status'], properties: {
        kind: { type: 'string', enum: ['test', 'lint', 'build'] },
        command: { type: 'string' },
        // `ausente` es un resultado, no un fallo: un servicio sin lint declarado no tiene nada roto.
        status: { type: 'string', enum: ['verificado', 'falla', 'ausente'] },
        detail: { type: 'string' },
      } } },
  },
}

const WRITTEN = {
  type: 'object', additionalProperties: false, required: ['files', 'assumptions'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    humanActions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

phase('Scan')

// Arrancar dos veces sobre la misma instancia reescribiría contexto que una persona ya corrigió, y el
// borrador se lee igual que el original: nada delataría la pérdida. Se comprueba antes de leer nada más.
const state = await agent(
  `${BASE}\n\nFrom the workspace root, report whether this instance is still untouched. Read ` +
  `${ROOT}/ops.config.json for its mode and workspaceRoots, ${ORG}/company.md and ${ORG}/product.md, and ` +
  `list ${ROADMAP}. Set fresh=true only if the organization files still carry the mold's "Por completar" ` +
  `or "Por definir" placeholders and the roadmap holds nothing but its template and README. Otherwise ` +
  `set fresh=false and say in reason what is already written.`,
  { schema: STATE, label: 'estado-inicial' },
)
if (!state) return stop('estado-desconocido', 'no se pudo leer el estado de la instancia')
if (!state.fresh && !FORCE) {
  return stop('ya-arrancado', `${state.reason || 'la instancia ya tiene contexto escrito'}. ` +
    `Pasá force:true si querés reescribir los borradores.`)
}

const inventory = await agent(
  `${BASE}\n\nInventariá el repositorio desde la raíz del workspace, sin entrar en ${ROOT}/ ni en ` +
  `node_modules, vendor, dist o build. Para cada subproyecto con manifiesto propio —package.json, ` +
  `go.mod, pyproject.toml, Cargo.toml, composer.json, pom.xml, Gemfile, Makefile, Dockerfile o ` +
  `docker-compose— reportá su ruta relativa, el runtime, para qué parece servir, y los comandos de test, ` +
  `lint y build que el propio proyecto declara, con source apuntando al archivo y la clave de donde los ` +
  `sacaste. Un comando que no está declarado se omite: no lo adivines.\n\n` +
  `Reportá además qué directorios parecen legacy o fuera de alcance, qué corre en CI, qué servicios ` +
  `externos aparecen nombrados en configuración o dependencias, y qué credenciales espera el proyecto ` +
  `—sólo los nombres de variable, leídos de .env.example o de la configuración de CI—. En productHints ` +
  `resumí lo que el repositorio deja ver sobre qué se construye.` +
  `${CONTEXT ? `\n\nLa persona ya aportó este contexto, que vale como hecho: ${CONTEXT}` : ''}`,
  { schema: INVENTORY, label: 'inventario' },
)
if (!inventory) return stop('inventario-vacio', 'el escaneo no devolvió resultado')
const services = inventory.services || []
if (!services.length) {
  return stop('sin-servicios', 'no encontré ningún subproyecto con manifiesto propio: revisá desde ' +
    'dónde corriste el workflow')
}
log(`${services.length} servicio(s): ${services.map((service) => service.path).join(', ')}`)

phase('Verify')

// Un mapa copiado del README envejece sin avisar y el primer Verify de una tarea real descubre que el
// comando no existe. Correrlos acá es barato y es lo que separa "documentado" de "verificado".
const checks = (await parallel(services.map((service) => () => agent(
  `${BASE}\n\nFrom the workspace root, check the commands declared by the service at "${service.path}": ` +
  `test=${service.test || '(ninguno)'}, lint=${service.lint || '(ninguno)'}, ` +
  `build=${service.build || '(ninguno)'}. Run each one that exists, from that directory, and report what ` +
  `happened: "verificado" when it finished green, "falla" with the first meaningful error line when it ` +
  `did not, "ausente" when the service declares none. Never run migrations, deploys, publishes, or ` +
  `anything that writes outside this repository, even if a script has that name: report it as ausente ` +
  `and say why.`,
  { schema: CHECKED, label: `verify:${service.path}`, phase: 'Verify' },
)))).filter(Boolean)

const green = checks.flatMap((entry) => entry.results.filter((result) => result.status === 'verificado')).length
const broken = checks.flatMap((entry) => entry.results.filter((result) => result.status === 'falla'))
log(`${green} comando(s) verificados, ${broken.length} con fallo. Un fallo no detiene el arranque: se escribe.`)

phase('Draft')

const EVIDENCE = `Inventario:\n${JSON.stringify(inventory)}\n\nComandos comprobados:\n${JSON.stringify(checks)}` +
  `${CONTEXT ? `\n\nContexto aportado por la persona, que vale como hecho: ${CONTEXT}` : ''}`

const drafted = await agent(
  `${BASE}\n\n${EVIDENCE}\n\nEscribí los borradores de contexto de esta instancia. Reemplazá el molde, no ` +
  `lo comentes:\n` +
  `1. ${ORG}/company.md y ${ORG}/product.md: lo que el repositorio y el contexto aportado permiten ` +
  `afirmar. Lo deducido va marcado "(supuesto)"; lo que nada sostiene queda como "Por definir" y su ` +
  `pregunta va a openQuestions. No inventes clientes, ingresos ni objetivos.\n` +
  `2. La sección "## Mapa real" de ${ROOT}/AGENTS.md: una entrada por servicio con su ruta, para qué ` +
  `sirve y sus comandos, cada uno con el resultado que obtuviste —verificado, falla o ausente—. Enlazá ` +
  `la fuente en vez de duplicar documentación técnica, y nombrá lo legacy y lo fuera de alcance.\n` +
  `3. ${ROOT}/ops.config.json: dejá en workspaceRoots las raíces de código reales. Es lo que un guard usa ` +
  `para bloquear una escritura fuera de lugar, así que una raíz de más lo apaga.\n` +
  `Devolvé en files cada archivo que tocaste y en assumptions cada supuesto que dejaste marcado.`,
  { schema: WRITTEN, label: 'contexto' },
)
if (!drafted) return stop('draft-unavailable', 'los borradores no devolvieron resultado')

// Credenciales, MCP y permiso de push no son trabajo del runner: R12 se los prohíbe y R13 exige dejar
// dicho quién los resuelve y con qué. La fila vale más que la negativa.
const pending = await agent(
  `${BASE}\n\n${EVIDENCE}\n\nRegistrá en ${HUMAN} una fila por cada cosa que necesita a una persona, con ` +
  `la tarea, el estado pendiente, el origen "onboard" y la acción concreta que la desbloquea. Como mínimo, ` +
  `una por cada credencial que el proyecto espera —diciendo dónde se cargan en este proyecto y quién lo ` +
  `hace, sin proponer ningún valor—, una por cada servicio externo o MCP a conectar —con su alcance y ` +
  `contra qué entorno—, y una por la autoridad del runner: hoy ops.config.json declara ` +
  `runner.allowPush=false y cambiarlo es una decisión humana. Las preguntas que quedaron abiertas van a ` +
  `la sección Ideas de ${INBOX}, sin promover: ${JSON.stringify(drafted.openQuestions || [])}`,
  { schema: WRITTEN, label: 'acciones-humanas' },
)

phase('Epic')

const epic = await agent(
  `${BASE}\n\n${EVIDENCE}\n\nSupuestos que quedaron escritos: ${JSON.stringify(drafted.assumptions || [])}\n` +
  `Comandos que fallaron: ${JSON.stringify(broken)}\n\n` +
  `Escribí en ${ROADMAP} la épica epic-001-<slug>.md siguiendo el contrato de ${P}/PROTOCOL.md: ` +
  `frontmatter epic/title/status/service con status open, criterios **CN** observables, "## Contexto ` +
  `relevante" con rutas verificadas, e historias con (→ CN) y (service: ruta), cada una de menos de ` +
  `cuatro horas.\n\n` +
  `Su resultado es que una tarea pueda atravesar el ciclo entero sin que nadie tenga que volver a ` +
  `explicar este proyecto. Los criterios salen de lo que hoy falta y son verificables: que ` +
  `organization/ no tenga supuestos sin confirmar, que cada servicio del mapa tenga su comando ` +
  `corriendo en verde, que las raíces declaradas hagan que el guard de límites bloquee una escritura ` +
  `afuera y deje pasar una adentro, y que una tarea piloto real llegue a DONE con evidencia. Si algún ` +
  `comando falló, arreglarlo es una historia, no un criterio aparte. En "## Riesgos y decisiones ` +
  `humanas" citá las filas que dejaste en HUMAN_ACTIONS. No toques BACKLOG.md.`,
  { schema: { type: 'object', additionalProperties: false, required: ['file', 'criteria', 'stories'],
    properties: {
      file: { type: 'string' }, title: { type: 'string' },
      criteria: { type: 'array', items: { type: 'string' } },
      stories: { type: 'array', items: { type: 'string' } },
    } }, label: 'epica-001' },
)
if (!epic) return stop('epic-unavailable', 'la épica no devolvió resultado')

phase('Closing')

const closing = await agent(
  `${BASE}\n\nFrom ${ROOT}, run "node tools/ops.js check planning" and report whether it passed. If it ` +
  `failed, repair only what this run wrote —the epic, the config— so it satisfies the contract; never ` +
  `weaken a criterion to force green.`,
  { schema: { type: 'object', additionalProperties: false, required: ['passed', 'details'],
    properties: { passed: { type: 'boolean' }, details: { type: 'string' } } }, label: 'closing-check' },
)
if (!closing || !closing.passed) return stop('check-failed', closing ? closing.details : 'sin resultado')

const supuestos = (drafted.assumptions || []).length
const acciones = ((pending || {}).humanActions || []).length
log(`Contexto escrito con ${supuestos} supuesto(s) por confirmar y ${acciones} acción(es) humana(s) en ${HUMAN}.`)
log(`Épica en ${epic.file}, sin promover: revisala, promoví una historia a un hito del BACKLOG y corré /autobuild.`)

return finish({
  services: services.length,
  verified: green,
  broken: broken.length,
  assumptions: supuestos,
  humanActions: acciones,
  epic: epic.file,
  promoted: false,
})
