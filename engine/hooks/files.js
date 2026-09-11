'use strict'

// Los guards que juzgan lo que está por escribirse: un secreto, un archivo generado, una migración,
// una prueba que se apaga, el motor de la dependencia. Todos leen el contenido entrante y no el disco
// —lo que ya estaba no lo escribió este cambio— y son el grupo `pre-files` del registro.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  patchOf, filesOf, contentOf, cwdOf, block, configOf, findOpsRoot,
  writableRoots, outsideRoots, DECLARE_IT,
} = require('./input')
const AP = require('./approval')
const { readWip } = require('../planning/parser')
const { runner } = require('../planning/claims')
const { hasTasks } = require('../planning/state')
const { TEMPLATE_PREFIXES } = require('../core/ownership')

// La raíz donde vive `planning/`, que es donde se busca la aprobación por operación.
function opsRoot(input) {
  return findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
}

// Si la ruta que este guard está por bloquear está aprobada, no hay nada que decir. Es la salida
// angosta: vale para esa ruta y deja de valer en cuanto cambie, a diferencia de la variable, que apaga
// el guard hasta que cierre la sesión.
const approved = (input, file) => !AP.pending(opsRoot(input), [file]).length

// Si la migración ya viajó a otra copia, que es lo que el bloqueo de abajo quiere saber y `existsSync`
// no contesta. Devuelve el motivo del bloqueo o cadena vacía.
//
// **`HEAD` y no el índice**: un archivo apenas `git add`eado no viajó a ninguna parte, y `git ls-files`
// lo daría por historial. Y **resolver la raíz es una pregunta aparte** de si el archivo está en `HEAD`:
// las dos fallan con 128 y confundirlas repite el error que este caso arregla —decidir por la respuesta
// equivocada—. Sin raíz resoluble se degrada a la conducta de antes, que bloquea de más, porque cuando
// no se puede saber ése es el lado correcto para equivocarse. Es la degradación que `check` ya declara
// cuando no puede resolver el repositorio de un servicio. Caso 086.
function alreadyShipped(file) {
  if (!fs.existsSync(file)) return ''
  const cwd = path.dirname(file)
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' })
  if (top.status !== 0) {
    return 'existe, y acá no hay repositorio con el que saber si ya viajó a otra copia'
  }
  const rel = path.relative(top.stdout.trim(), file).split(path.sep).join('/')
  return spawnSync('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd }).status === 0
    ? 'ya está en el historial del repositorio'
    : ''
}


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

function secrets(input) {
  for (const file of filesOf(input)) {
    const reason = credential(input, file)
    if (reason) block(`${file} ${reason}`)
  }
}

// Leer una credencial la deja en el contexto de la sesión, y de ahí en los transcripts. Corre en su propio
// grupo porque los guards de escritura frenarían leer fuera de las raíces o con el WIP vacío.
function secretsRead(input) {
  if (process.env.OPS_SECRETS_READ_OVERRIDE === '1') return
  for (const file of filesOf(input)) {
    if (!credential(input, file) || approved(input, file)) continue
    block(`${file} es una credencial: leerla la deja en el contexto de la sesión. Si hace falta un valor, `
      + `pedíselo a una persona.\n${AP.HOW('OPS_SECRETS_READ_OVERRIDE', [file])}`)
  }
}

function integrationSnapshot(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    if (/(?:^|\/)integrations\/[^/]+\/staging\/(?:.+\/remote\.json|sync-state\.json)$/.test(file)) {
      block(`${file} pertenece al sincronizador. Cura draft.md; no edites snapshots a mano.`)
    }
  }
}

function generated(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    const base = path.basename(file)
    if (/(?:^|[._-])generated\.[^.]+$/i.test(base) || /(?:^|[._-])gen\.(?:go|ts|js|py)$/i.test(base)) {
      block(`${file} parece código generado. Modifica su fuente y ejecuta el generador; no lo edites a mano.`)
    }
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
  const how = (file) => AP.HOW('OPS_TEST_EVIDENCE_OVERRIDE', [file])
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
  const estado = wip ? `WIP tiene la tarea ${wip.task} y ningún paso` : 'WIP está en IDLE'
  const why = `${estado}, así que el plan todavía no está escrito.\n`
    + 'Escribí en tu planning/wip/<runner>.md la tarea y su plan aprobado —pasos numerados, cada uno con un estado '
    + 'verificable— y volvé al cambio. Si esto no es trabajo de una tarea, aprobá la ruta.\n'
  for (const raw of filesOf(input)) {
    if (!isProduct(root, path.resolve(cwdOf(input), raw))) continue
    if (approved(input, raw)) continue
    block(`${raw} cambia el producto sin plan. ${why}${AP.HOW('OPS_PLAN_FIRST_OVERRIDE', [raw])}`)
  }
}

function workspaceBoundary(input) {
  const allowed = writableRoots(input)
  if (!allowed) return
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (outsideRoots(file, allowed)) {
      block(`${file} está fuera de las raíces declaradas en ops.config.json. ${DECLARE_IT}`)
    }
  }
}

// Qué archivos son migraciones para este proyecto. La ruta la fija el motor —`migrations/`, `migration/`
// o `migrate/`, que es donde las ponen todas las herramientas— y **la extensión la declara el proyecto**,
// con `sql` de default.
//
// Sin esto el guard sólo veía `.sql`, así que en TypeORM, Prisma, Django, Rails o Alembic no miraba nada:
// ni frenaba el SQL destructivo, ni protegía una migración existente de ser reescrita. Y no lo decía —
// aparecía cableado y en verde—. Medido en una instancia real: 64 migraciones `.sql` cubiertas y **409
// TypeORM `.ts` invisibles** (caso 077).
//
// No se amplía el default a `.ts`/`.py`/`.rb` por su cuenta: eso reintroduciría el falso positivo del
// caso 039 —un archivo de lenguaje que menciona `DROP TABLE` en un comentario o en un string— por otra
// puerta. Declararlo es opt-in porque el que sabe si sus migraciones son de lenguaje es el proyecto, y
// porque así el costo lo elige quien lo paga.
//
// La extensión inválida no se descarta en silencio: descartarla dejaría al proyecto creyendo que declaró
// una cobertura que no tiene, que es exactamente el defecto que este helper vino a cerrar. La valida
// `validateOpsConfig`, y acá se ignora lo que no pasa ese filtro porque el guard no es el lugar donde se
// enseña a escribir la configuración.
const DEFAULT_MIGRATION_EXTENSIONS = ['sql']

function migrationPattern(input) {
  const root = opsRoot(input)
  const declared = root ? (configOf(root).migrations || {}).extensions : null
  const extensions = (Array.isArray(declared) ? declared : DEFAULT_MIGRATION_EXTENSIONS)
    .filter((one) => typeof one === 'string' && /^[a-z0-9]+$/.test(one))
  const usable = extensions.length ? extensions : DEFAULT_MIGRATION_EXTENSIONS
  return new RegExp(`(?:^|/)(?:migrations?|migrate)/.*\\.(?:${usable.join('|')})$`, 'i')
}

function migrations(input) {
  if (process.env.OPS_MIGRATIONS_OVERRIDE === '1') return
  // Cada rama cierra su propio límite. Cuando el `\b` estaba al final del grupo se aplicaba a las tres, y
  // la de `delete` termina a propósito en `;`: después de un punto y coma no hay límite de palabra, así que
  // `DELETE FROM pedidos;` —la forma que tiene en cualquier migración— pasaba y sólo frenaba la variante sin
  // punto y coma. `drop column` y `drop constraint` faltaban: pierden datos y garantías igual que `drop table`.
  const destructiveSql = new RegExp(
    String.raw`\bdrop\s+(?:table|database|schema|column|constraint)\b` +
      String.raw`|\btruncate\b` +
      String.raw`|\bdelete\s+from\s+\S+\s*(?:;|$)`,
    'i',
  )
  // Las dos condiciones deciden sobre el mismo alcance, y por eso comparten el filtro. El bloqueo por
  // SQL destructivo corría antes de este bucle, o sea sobre el contenido y sin mirar la ruta que ya
  // tenía a mano: frenaba un ADR que citaba la migración o un comentario que advertía que eso no se
  // hace, y encima afirmaba «La migración contiene…» sobre un archivo que no lo era. Un guard que
  // frena donde no corresponde enseña a apagarlo, que es la salida más ancha que hay.
  //
  // El mensaje nombra el archivo por lo mismo: un falso positivo se lee igual que un bloqueo correcto
  // mientras no diga sobre qué está decidiendo.
  //
  // El precio de compartir el filtro es que una migración escrita fuera de un directorio con ese nombre
  // deja de frenarse. Es deliberado: el otro chequeo ya vivía con esa convención, y dos condiciones de
  // la misma función con dos alcances distintos es lo que hizo falta arreglar acá.
  const esMigracion = migrationPattern(input)
  for (const raw of filesOf(input)) {
    const normalized = raw.replace(/\\/g, '/')
    if (!esMigracion.test(normalized)) continue
    if (approved(input, normalized)) continue
    if (destructiveSql.test(contentOf(input))) {
      block(`${raw} contiene SQL destructivo.\n${AP.HOW('OPS_MIGRATIONS_OVERRIDE', [normalized])}`)
    }
    // El mensaje nombra el hecho que sostiene el bloqueo y no su interpretación: «historial» era una
    // lectura que `existsSync` no podía dar, y se la daba igual sobre stubs de la misma sesión. Y lleva
    // la salida angosta, que hasta 0.79.0 sólo tenía el bloqueo hermano: éste es el que aparece en el
    // flujo normal de escribir una migración, así que era justo el que no podía quedarse sin decirla.
    const file = path.resolve(cwdOf(input), raw)
    const shipped = alreadyShipped(file)
    if (shipped) {
      block(`${raw} ${shipped}. Crea una nueva en vez de reescribirla.\n`
        + AP.HOW('OPS_MIGRATIONS_OVERRIDE', [normalized]))
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
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  const config = configOf(root)
  if (config.mode === 'toolkit') return
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce')
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (file !== pkg && !file.startsWith(`${pkg}${path.sep}`)) continue
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
  secrets, secretsRead, integrationSnapshot, generated, testEvidence, planFirst, workspaceBoundary,
  migrations, engineWrites,
}
