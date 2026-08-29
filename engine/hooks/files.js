'use strict'

// Los guards que juzgan lo que está por escribirse: un secreto, un archivo generado, una migración,
// una prueba que se apaga, el motor de la dependencia. Todos leen el contenido entrante y no el disco
// —lo que ya estaba no lo escribió este cambio— y son el grupo `pre-files` del registro.

const fs = require('node:fs')
const path = require('node:path')
const { patchOf, filesOf, contentOf, cwdOf, block, configOf, findOpsRoot } = require('./input')

function secrets(input) {
  for (const file of filesOf(input)) {
    const base = path.basename(file)
    if (/^(?:\.env|\.env\..+)$/.test(base) && !/\.(?:example|sample|template|schema|dist|tpl)$/.test(base)) {
      block(`${file} parece contener secretos. Edita una plantilla o registra una acción humana.`)
    }
    if (/^(?:accesos\.md|credenciales.*|credentials.*\.json|.*service-account.*\.json|.*\.(?:pem|key))$/i.test(base)) {
      block(`${file} parece un archivo de credenciales en texto plano.`)
    }
    // Nombres de credencial que la herramienta escribe sola y que la lista anterior no cubría:
    // `.npmrc` guarda el token de publicación, `.netrc` el de cualquier host, `id_rsa` y sus tres
    // hermanas una clave privada de SSH, y `credentials` las de AWS. Los cuatro son estándar, no
    // exóticos — y las claves SSH van por nombre de algoritmo, no por prefijo.
    //
    // Esto tapa un caso conocido; no vuelve completo al guard. La forma de decidir sigue siendo el
    // nombre del archivo, así que otro formato pasa igual — ver «Qué son y qué no son» en el README.
    if (/^(?:\.npmrc|\.netrc|_netrc|\.pypirc|\.dockercfg|id_(?:rsa|dsa|ecdsa|ed25519)|credentials)$/i.test(base)) {
      block(`${file} es un archivo de credenciales que su herramienta mantiene. No lo edites a mano.`)
    }
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
    'decisión con dueño: OPS_TEST_EVIDENCE_OVERRIDE=1 y que conste en el commit.'
  for (const match of patchOf(input).matchAll(/^\*\*\* Delete File:\s*(.+)$/gm)) {
    const removed = match[1].trim()
    if (isTestFile(removed)) block(`${removed} borra una prueba.\n${why}`)
  }
  const content = contentOf(input)
  if (!content) return
  for (const raw of filesOf(input)) {
    if (!isTestFile(raw)) continue
    for (const [marca, nombre] of TEST_OFF) {
      if (marca.test(content)) block(`${raw} apaga una prueba con ${nombre}.\n${why}`)
    }
  }
}

function workspaceBoundary(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  const config = configOf(root)
  const allowed = [root, ...(config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path))]
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (!allowed.some((base) => file === base || file.startsWith(`${base}${path.sep}`))) {
      block(`${file} está fuera de las raíces declaradas en ops.config.json.`)
    }
  }
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
  if (destructiveSql.test(contentOf(input))) {
    block('La migración contiene SQL destructivo. Requiere revisión y OPS_MIGRATIONS_OVERRIDE=1.')
  }
  for (const raw of filesOf(input)) {
    const normalized = raw.replace(/\\/g, '/')
    if (!/(?:^|\/)(?:migrations?|migrate)\/.*\.sql$/i.test(normalized)) continue
    const file = path.resolve(cwdOf(input), raw)
    if (fs.existsSync(file)) {
      block(`${raw} es una migración existente. Crea una nueva en vez de reescribir historial.`)
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

module.exports = { secrets, integrationSnapshot, generated, testEvidence, workspaceBoundary, migrations, engineWrites }
