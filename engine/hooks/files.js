'use strict'

// Los guards que juzgan lo que está por escribirse: un secreto, un archivo generado, una prueba que se
// apaga, el motor de la dependencia. Todos leen el contenido entrante y no el disco —lo que ya estaba no
// lo escribió este cambio— y son el grupo `pre-files` del registro, junto con `migrations.js`.

const fs = require('node:fs')
const path = require('node:path')
const {
  patchOf, filesOf, contentOf, cwdOf, block, configOf, opsRoot,
  writableRoots, outsideRoots, DECLARE_IT,
} = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')
const { selfApproval } = require('./self-approval')
const { readWip, readWips } = require('../planning/parser')
const { runner } = require('../planning/claims')
const { hasTasks } = require('../planning/state')
const { TEMPLATE_PREFIXES } = require('../core/ownership')

// Si la ruta que este guard está por bloquear está aprobada, no hay nada que decir. Es la salida
// angosta: vale para esa ruta y deja de valer en cuanto cambie, a diferencia de la variable, que apaga
// el guard hasta que cierre la sesión.
const approved = (input, file) => !AP.pending(opsRoot(input), [file], input).length

// Qué archivo es una credencial, para los dos guards que la cuidan: `secrets`, que frena escribirla, y
// `secrets-read`, que frena leerla. Devuelve el motivo, o vacío.
function credential(input, raw) {
  const base = path.basename(raw)
  if (/^(?:\.env|\.env\..+)$/.test(base) && !/\.(?:example|sample|template|schema|dist|tpl)$/.test(base)) {
    return 'parece contener secretos. Edita una plantilla o registra una acción humana.'
  }
  if (/^(?:accesos\.md|credenciales.*|credentials.*\.json|.*service-account.*\.json|.*\.(?:pem|key))$/i.test(base)) {
    return 'parece un archivo de credenciales en texto plano.'
  }
  // Nombres de credencial que la herramienta escribe sola y que la lista anterior no cubría:
  // `.npmrc` guarda el token de publicación, `.netrc` el de cualquier host, `id_rsa` y sus tres
  // hermanas una clave privada de SSH, y `credentials` las de AWS. Los cuatro son estándar, no
  // exóticos — y las claves SSH van por nombre de algoritmo, no por prefijo.
  //
  // Esto tapa un caso conocido; no vuelve completo al guard. La forma de decidir sigue siendo el
  // nombre del archivo, así que otro formato pasa igual — ver «Qué son y qué no son» en el README.
  if (/^(?:\.npmrc|\.netrc|_netrc|\.pypirc|\.dockercfg|id_(?:rsa|dsa|ecdsa|ed25519)|credentials)$/i.test(base)) {
    return 'es un archivo de credenciales que su herramienta mantiene. No lo edites a mano.'
  }
  // Lo que ningún nombre delata: una identidad de máquina que el 088 declara puede llamarse
  // `local-dev.env` (caso 092). Se lee sólo si la declaración existe, para no cargarla en cada hook.
  const root = opsRoot(input)
  if (!root || !fs.existsSync(path.join(root, 'organization', 'secrets.json'))) return ''
  return require('../secrets').identityFiles(root).includes(path.resolve(cwdOf(input), raw))
    ? 'es una identidad declarada en organization/secrets.json: la carga una persona.'
    : ''
}

// Escribir una credencial se autoriza igual que leerla. `secrets-read` consulta la aprobación desde 0.80.0
// y éste frenaba sin ofrecer nada, así que la misma persona podía aprobar leer su `.env` y no podía aprobar
// escribirlo. La asimetría no la decidió nadie (caso 117).
function secrets(input) {
  for (const file of filesOf(input)) {
    const reason = credential(input, file)
    if (!reason || approved(input, file)) continue
    block(`${file} ${reason}\n${AP.HOW(null, [file], input)}`)
  }
}

// Leer una credencial la deja en el contexto de la sesión, y de ahí en los transcripts. Corre en su propio
// grupo porque los guards de escritura frenarían leer fuera de las raíces o con el WIP vacío.
// Un comodín también nombra: `rg -g '.env*'`, el `glob` del Grep de Claude o el `include_pattern` del
// `grep_search` de Gemini recorren la carpeta buscando justo eso, y así leyeron el `.env` dos agentes en
// sesiones reales (caso 104). Se prueba el nombre con el comodín vacío, la forma más corta que el patrón
// acepta.
const patternNames = (token) => (/[*?]/.test(token) ? [token.replace(/[*?]/g, '')] : [token]).filter(Boolean)

function secretsRead(input) {
  if (process.env.OPS_SECRETS_READ_OVERRIDE === '1') return
  const fields = input.tool_input || {}
  const patterns = [fields.glob, fields.include_pattern].filter((one) => typeof one === 'string')
  for (const file of [...filesOf(input), ...patterns]) {
    if (!patternNames(file).some((name) => credential(input, name)) || approved(input, file)) continue
    block(`${file} es una credencial: leerla la deja en el contexto de la sesión. Si hace falta un valor, `
      + `pedíselo a una persona.\n${AP.HOW('OPS_SECRETS_READ_OVERRIDE', [file], input)}`)
  }
}

function integrationSnapshot(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    if (!/(?:^|\/)integrations\/[^/]+\/staging\/(?:.+\/remote\.json|sync-state\.json)$/.test(file)) continue
    if (approved(input, raw)) continue
    block(`${file} pertenece al sincronizador. Cura draft.md; no edites snapshots a mano.\n`
      + AP.HOW(null, [raw], input))
  }
}

function generated(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    const base = path.basename(file)
    if (!/(?:^|[._-])generated\.[^.]+$/i.test(base) && !/(?:^|[._-])gen\.(?:go|ts|js|py)$/i.test(base)) continue
    if (approved(input, raw)) continue
    block(`${file} parece código generado. Modifica su fuente y ejecuta el generador; no lo edites a mano.\n`
      + AP.HOW(null, [raw], input))
  }
}

// Las dos formas de que una prueba deje de juzgar sin que nadie lo note: apagarla o borrarla. Ninguna
// sale roja —el runner informa una suite verde más corta—, así que el verde pasa de decir «el
// comportamiento está» a decir «nadie lo miró», y `verify` tampoco lo ve porque también lee exit codes.
// Lo que se inspecciona es el contenido entrante, no el archivo: una marca que ya estaba no la apagó
// este cambio.
const TEST_OFF = [
  [/\b(?:describe|context|it|test|suite)\s*\.\s*(?:skip|only|todo)\b/, 'skip/only'],
  [/\b[xf](?:it|test|describe|context)\s*[("'`]/, 'xit/fit'],
  [/\bt\.Skip(?:Now)?\s*\(/, 't.Skip'],
  [/@pytest\.mark\.(?:skip|skipif|xfail)\b/, 'pytest.mark.skip'],
  [/@unittest\.skip/, 'unittest.skip'],
  [/@(?:Ignore|Disabled)\b/, 'Ignore/Disabled'],
  [/#\[ignore\]/, 'ignore'],
]

function isTestFile(raw) {
  const file = raw.replace(/\\/g, '/')
  const base = path.basename(file)
  return /(?:^|\/)(?:tests?|specs?|__tests__)\//i.test(file)
    || /\.(?:test|spec)\.[jt]sx?$/i.test(base)
    || /_(?:test|spec)\.(?:go|py|rb|ts|js|jsx|tsx|rs|exs?)$/i.test(base)
    || /^test_.+\.py$/i.test(base)
}

function testEvidence(input) {
  if (process.env.OPS_TEST_EVIDENCE_OVERRIDE === '1') return
  const why = 'Una prueba apagada no falla y una suite sin ella sale verde igual: el verde deja de ' +
    'decir que el comportamiento está y pasa a decir que nadie lo miró.\n' +
    'Si la aserción está mal, corregila; si el comportamiento cambió, cambialo junto con la prueba que ' +
    'lo fija. Si tiene que quedar afuera igual —flake conocido, entorno que acá no existe—, es una ' +
    'decisión con dueño.\n'
  const how = (file) => AP.HOW('OPS_TEST_EVIDENCE_OVERRIDE', [file], input)
  for (const match of patchOf(input).matchAll(/^\*\*\* Delete File:\s*(.+)$/gm)) {
    const removed = match[1].trim()
    if (isTestFile(removed) && !approved(input, removed)) block(`${removed} borra una prueba.\n${why}${how(removed)}`)
  }
  const content = contentOf(input)
  if (!content) return
  for (const raw of filesOf(input)) {
    if (!isTestFile(raw) || approved(input, raw)) continue
    for (const [marca, nombre] of TEST_OFF) {
      if (marca.test(content)) block(`${raw} apaga una prueba con ${nombre}.\n${why}${how(raw)}`)
    }
  }
}

// Lo que la instancia recibe del molde, más los cargos que forkeó. `plan-first` no lo juzga, y no es una
// concesión: el plan se escribe en `planning/`, así que exigirlo ahí sería un candado cuya llave está
// adentro. Los recorridos que no pasan por la máquina de tareas escriben en las otras raíces —`onboard`
// en `organization/`, una evaluación en `agents/`, el sincronizador en `integrations/`— y tampoco tienen
// un WIP que mostrar. Sale de `ownership` para que una raíz nueva del molde quede exenta sola; `agents/`
// se suma acá porque no viene del molde, la escribe `fork` en la instancia.
const OPS_OWNED = [...TEMPLATE_PREFIXES, 'agents/']

function opsOwned(root, file) {
  const relative = path.relative(root, file).replace(/\\/g, '/')
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return false
  return OPS_OWNED.some((prefix) => relative.startsWith(prefix))
}

// Producto es el código de una raíz declarada, y la instancia sidecar no lo es aunque viva dentro de una:
// `init` escribe `..` como raíz en sidecar, así que la carpeta de la instancia cae adentro. En embedded la
// raíz de ops **es** una raíz de producto, y ahí sólo se exime lo que la instancia posee. Lo que queda
// fuera de toda raíz tampoco es producto: el límite de raíces ya lo juzgó, y si pasó es porque el proyecto
// lo declaró en `writableOutsideRoots` (casos 089 y 090).
//
// `ops.config.json` se exime por nombre porque es la llave del límite de raíces: su mensaje manda a
// editarlo, y frenar esa edición era el candado de arriba con otra forma.
const INSTANCE_CONFIG = 'ops.config.json'

function isProduct(root, file) {
  if (opsOwned(root, file) || file === path.join(root, INSTANCE_CONFIG)) return false
  const declared = configOf(root).workspaceRoots
  const roots = (Array.isArray(declared) ? declared : [])
    .filter((entry) => entry && typeof entry.path === 'string')
    .map((entry) => path.resolve(root, entry.path))
  // Sin raíces legibles no hay contra qué comparar, y se juzga como antes: frenar de más.
  if (!roots.length) return true
  if (outsideRoots(file, roots)) return false
  return outsideRoots(file, [root]) || roots.includes(root)
}

// R1 y el paso 7 del protocolo piden el plan antes del primer cambio, y hasta acá nadie lo comprobaba:
// tocar el archivo primero y redactar después la aceptación que lo justifica sale igual de verde que
// hacerlo al revés, y se lee igual en DONE. Lo que se exige es lo mínimo que separa un plan de una
// intención —WIP activo con al menos un paso escrito—, no que el paso sea bueno; eso lo mira Critique.
//
// El conteo sale del mismo parser que `check` y `context`, así que lo que el guard llama plan es lo que
// el resto del motor llama plan. Un WIP con frontmatter y sin pasos es el estado intermedio que esto
// vigila: la tarea ya está nombrada y el plan todavía no existe.
function planFirst(input) {
  if (process.env.OPS_PLAN_FIRST_OVERRIDE === '1') return
  // El plan lo exige el flujo, que es donde piensa el agente. Cuando la persona pide un cambio directo en
  // el chat la que decidió es ella, y frenarla para que escriba un plan o apruebe una ruta es limitarla en
  // lo que acaba de pedir (caso 098). Un subagente o un recorrido de Cauce no cuentan: `said` los descarta.
  if (CHAT.said(input)) return
  const root = opsRoot(input)
  if (!root) return
  const planning = path.join(root, 'planning')
  const wip = readWip(planning, runner())
  if (wip && wip.complete + wip.pending > 0) return
  // Una instancia recién creada no tiene de dónde sacar una tarea: `onboard` deja el roadmap vacío y
  // dice que alguien lo llene. Exigir el plan ahí es un candado delante de la puerta, y la salida que
  // enseña es apagar el guard en el entorno, que lo deja sin morder para siempre. Se pregunta recién
  // acá: en una instancia con trabajo el camino común sale por el WIP de arriba y no paga esta lectura.
  // Que el guard quede inerte lo dice `automation check`, porque una condición invisible es peor que
  // no tenerla.
  if (!hasTasks(planning)) return
  // No tener plan y no ver el propio piden cosas opuestas: escribirlo, o volver al id desde el que ya se
  // escribió. `runner()` sale del árbol donde corre el proceso, así que con una instancia al lado de dos
  // repositorios el mismo cambio cae de un lado o del otro según el directorio, y el mensaje mandaba a
  // escribir un plan que estaba a la vista (caso 152).
  //
  // Se lista recién acá, después de las dos salidas de arriba: quien tiene su plan sale por la primera y
  // no paga esta lectura, que es la misma razón por la que `hasTasks` se pregunta donde se pregunta.
  const foreign = readWips(planning).filter((one) => one.complete + one.pending > 0)
  const state = wip ? `WIP tiene la tarea ${wip.task} y ningún paso` : 'WIP está en IDLE'
  const why = foreign.length
    ? `hay plan escrito, pero bajo otro id: ${foreign.map((one) => `${one.runner} (${one.task})`).join(', ')}.\n`
      + 'Si ese plan es tuyo, volvé a su id con `export CAUCE_RUNNER=<id>` —`ops runners <planning>` los lista '
      + 'con su tarea y su avance— y repetí el cambio. Si vas a trabajar en paralelo, montá tu propio árbol '
      + 'con `ops worktree <planning> <tarea>`, que te devuelve el id hecho.\n'
    : `${state}, así que el plan todavía no está escrito.\n`
      + 'Escribí en tu planning/wip/<runner>.md la tarea y su plan aprobado —pasos numerados, cada uno con '
      + 'un estado verificable— y volvé al cambio. Si esto no es trabajo de una tarea, aprobá la ruta.\n'
  for (const raw of filesOf(input)) {
    if (!isProduct(root, path.resolve(cwdOf(input), raw))) continue
    if (approved(input, raw)) continue
    // Con un plan a la vista no se ofrece ninguna de las dos salidas: aprobar la ruta escribe «esto no es
    // trabajo de una tarea», que ahí es falso, y anunciar la variable ofrece el permiso más ancho cuando
    // la acción correcta es angosta y concreta —el mismo criterio con que `HOW` decide no nombrarla—.
    const how = foreign.length
      ? AP.HOW(null, [], input, [])
      : AP.HOW('OPS_PLAN_FIRST_OVERRIDE', [raw], input)
    block(`${raw} cambia el producto sin plan. ${why}${how}`)
  }
}

function workspaceBoundary(input) {
  const allowed = writableRoots(input)
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    // Lo mismo que en `shell-boundary`: la aprobación de la persona se juzga aunque no haya raíces.
    const own = selfApproval(input, file)
    if (own) block(own)
    if (allowed && outsideRoots(file, allowed)) {
      block(`${file} está fuera de las raíces declaradas en ops.config.json. ${DECLARE_IT}`)
    }
  }
}

// Hace falta un guard aparte porque `workspace-boundary` no lo cubre: `node_modules/` cae dentro de
// la raíz declarada, así que editar el motor le parece legítimo.
//
// Editarlo rompe dos veces: el próximo `npm install` borra el cambio sin avisar, y hasta entonces la
// empresa corre un motor que no coincide con la versión que declara —la clase de diferencia que
// aparece como un bug irreproducible—. En modo `toolkit` no aplica: ahí el motor es el producto.
function engineWrites(input) {
  const root = opsRoot(input)
  if (!root) return
  const config = configOf(root)
  if (config.mode === 'toolkit') return
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce')
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (file !== pkg && !file.startsWith(`${pkg}${path.sep}`)) continue
    if (approved(input, raw)) continue
    block(`${raw} pertenece al motor de Cauce, que llega por npm.\n` +
      'Un cambio acá lo borra el próximo install y mientras tanto corrés un motor que no coincide ' +
      'con la versión que declarás. Para traer una versión nueva son dos pasos —el motor y después ' +
      'las rutas del sistema de tu instancia—:\n' +
      '  npm install --save-dev --save-exact @ingeniomaps/cauce@latest\n' +
      '  node tools/ops.js upgrade\n' +
      'Y reportá el problema arriba. Lo que sí es tuyo son tus cargos, equipos e integraciones.')
  }
}

module.exports = {
  credential, patternNames,
  secrets, secretsRead, integrationSnapshot, generated, testEvidence, planFirst, workspaceBoundary,
  engineWrites,
}
