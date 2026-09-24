'use strict'

// Qué es una migración para un proyecto, qué parte de ella aplica y qué cuenta como destruir. Lo preguntan
// el guard `migrations`, que juzga cada escritura, y `check`, que mira si lo declarado alcanza a algún
// archivo; la respuesta tiene que ser la misma en los dos, y por eso vive una sola vez acá.

const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Sin esto el guard sólo veía `.sql`, así que en TypeORM, Prisma, Django, Rails o Alembic no miraba nada:
// ni frenaba el SQL destructivo, ni protegía una migración existente de ser reescrita. Y no lo decía —
// aparecía cableado y en verde—. Medido en una instancia real: 64 migraciones `.sql` cubiertas y **409
// TypeORM `.ts` invisibles** (caso 077).
//
// No se amplía el default a `.ts`/`.py`/`.rb` por su cuenta: eso reintroduciría el falso positivo del
// caso 039 —un archivo de lenguaje que menciona `DROP TABLE` en un comentario o en un string— por otra
// puerta. Declararlo es opt-in porque el que sabe si sus migraciones son de lenguaje es el proyecto, y
// porque así el costo lo elige quien lo paga.
const DEFAULT_EXTENSIONS = ['sql']

// Las carpetas se declaran por lo mismo que las extensiones: ninguna lista del motor alcanza a Alembic,
// cuya carpeta es el argumento de `alembic init` y puede moverse con `version_locations` (caso 196). El
// default son los tres nombres que el motor usaba antes, así que quien no declara nada no ve diferencia.
const DEFAULT_PATHS = ['migrations', 'migration', 'migrate']

// Una carpeta relativa, de segmentos que no empiezan con punto: así no hay `..`, `.` ni ruta absoluta, y
// lo que entra en la expresión regular no trae metacaracteres salvo el punto, que se escapa al usarla.
const PATH_SHAPE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/
const EXTENSION_SHAPE = /^[a-z0-9]+$/

// Lo inválido no se descarta en silencio: descartarlo dejaría al proyecto creyendo que declaró una
// cobertura que no tiene. Lo valida `validateOpsConfig`, y acá se ignora lo que no pasa ese filtro porque
// el guard no es el lugar donde se enseña a escribir la configuración.
function declared(config, key, shape, fallback) {
  const value = ((config && config.migrations) || {})[key]
  const usable = (Array.isArray(value) ? value : []).filter((one) => typeof one === 'string' && shape.test(one))
  return usable.length ? usable : fallback
}

function pattern(config) {
  const extensions = declared(config, 'extensions', EXTENSION_SHAPE, DEFAULT_EXTENSIONS)
  const folders = declared(config, 'paths', PATH_SHAPE, DEFAULT_PATHS).map((one) => one.replace(/\./g, '\\.'))
  return new RegExp(`(?:^|/)(?:${folders.join('|')})/.*\\.(?:${extensions.join('|')})$`, 'i')
}

// Dónde empieza la reversión, por formato. Cada marcador es el que su herramienta reconoce y no uno
// parecido, porque partir donde la herramienta no parte deja sin juzgar algo que sí corre:
//
// - goose (`internal/sqlparser/parser.go` de pressly/goose, `main`): la línea empieza con `--` sin
//   espacio antes, y la anotación se compara con `strings.EqualFold`, así que `--+goose down` vale.
// - dbmate (`pkg/dbmate/migration.go` de amacneil/dbmate, `main`): `(?m)^--\s*migrate:down(\s*$|\s+\S+)`,
//   sensible a mayúsculas.
//
// El `Up` también se reconoce porque devuelve al lado que aplica: lo que venga después de él se juzga.
const SQL_MARKERS = [
  { up: /^--\s*\+goose\s*up\s*$/i, down: /^--\s*\+goose\s*down\s*$/i, label: '-- +goose Down' },
  { up: /^--\s*migrate:up(?:\s*$|\s+\S+)/, down: /^--\s*migrate:down(?:\s*$|\s+\S+)/, label: '-- migrate:down' },
]

// El método de reversión de cada herramienta de lenguaje: `downgrade()` de Alembic, `down` de Rails
// (también el `self.down` de las versiones viejas), `down()` de TypeORM y `exports.down` o `export function
// down` de Knex. Se lo reconoce al principio de la línea, así que una llamada a `this.down(...)` dentro de
// `up` no cuenta.
const LANGUAGE_HEADERS = [
  { header: /^(\s*)(?:async\s+)?def\s+downgrade\s*\(/, label: 'downgrade()' },
  { header: /^(\s*)def\s+(?:self\.)?down\b/, label: 'down' },
  { header: /^(\s*)(?:(?:public|protected|private)\s+)?(?:async\s+)?down\s*\(/, label: 'down()' },
  { header: /^(\s*)(?:module\.)?exports\.down\s*=/, label: 'exports.down' },
  { header: /^(\s*)export\s+(?:async\s+)?function\s+down\s*\(|^(\s*)export\s+const\s+down\s*=/, label: 'down()' },
]

// Las herramientas golang-migrate y sqlx guardan la reversión en otro archivo, `{version}_{title}.down.{extension}`
// (`MIGRATIONS.md` de golang-migrate/migrate), y ése es reversión entera.
const DOWN_FILE = /\.down\.[^./]+$/i

const indent = (line) => line.match(/^\s*/)[0].length

// Qué líneas aplican: una lista de booleanos, uno por línea, y el marcador que parte. `null` si no hay nada
// que partir, para que quien pregunta juzgue el texto entero: sin marcador reconocido se degrada al
// comportamiento de antes en vez de fallar abierto. Los marcadores son comentarios y no aplican.
function sqlMask(lines) {
  const markers = SQL_MARKERS.filter((one) => lines.some((line) => one.up.test(line) || one.down.test(line)))
  if (!markers.length) return null
  let applies = true
  const mask = lines.map((line) => {
    if (markers.some((one) => one.up.test(line))) {
      applies = true
      return false
    }
    if (markers.some((one) => one.down.test(line))) {
      applies = false
      return false
    }
    return applies
  })
  return { mask, label: markers[0].label }
}

// En una migración de lenguaje el bloque termina donde la indentación vuelve a la del encabezado: la línea
// que lo cierra —`}`, `end`, `};`— queda del lado que aplica, y da igual porque no destruye nada. Es la
// forma en que las herramientas generan sus migraciones; lo que se aparta de ella acorta el bloque en vez de
// alargarlo, así que un archivo con formato raro se juzga de más y no de menos. El borde que queda abierto
// es escribir `up` en la misma línea que el encabezado de `down`, y eso no lo genera ninguna.
function languageMask(lines) {
  let label = ''
  let depth = null
  const mask = lines.map((line) => {
    if (depth !== null) {
      if (!line.trim() || indent(line) > depth) return false
      depth = null
    }
    const found = LANGUAGE_HEADERS.find((one) => one.header.test(line))
    if (!found) return true
    label = found.label
    depth = indent(line)
    return false
  })
  return label ? { mask, label } : null
}

function applyMask(file, lines) {
  if (DOWN_FILE.test(file)) return { mask: lines.map(() => false), label: path.basename(file) }
  return /\.sql$/i.test(file) ? sqlMask(lines) : languageMask(lines)
}

// Lo que hay que juzgar de una escritura: el texto de las líneas que aplican y el marcador que partió, o
// el texto entero sin marcador si no había nada que partir.
//
// En un `Edit` el guard no ve el archivo, sólo el fragmento. Se reconstruye el archivo como va a quedar
// —`old` reemplazado en `disk`— y se juzga la parte del fragmento que cae del lado que aplica, así que un
// fragmento que mueve un marcador se lee en su lugar y no suelto. Sin `disk` o sin `old` adentro se juzga
// el fragmento entero, como antes.
function judged(file, text, edit = {}) {
  const { disk, old, all } = edit
  let result = String(text)
  let spans = [[0, result.length]]
  if (old && typeof disk === 'string' && disk.includes(old)) {
    const at = disk.indexOf(old)
    const pieces = all ? disk.split(old) : [disk.slice(0, at), disk.slice(at + old.length)]
    result = pieces[0]
    spans = []
    for (const piece of pieces.slice(1)) {
      spans.push([result.length, result.length + String(text).length])
      result += String(text) + piece
    }
  } else if (old) return { text: String(text), label: '' }
  const lines = result.split('\n')
  const split = applyMask(file, lines.map((line) => line.replace(/\r$/, '')))
  if (!split && spans.length === 1 && spans[0][0] === 0 && spans[0][1] === result.length) {
    return { text: result, label: '' }
  }
  const kept = []
  let at = 0
  lines.forEach((line, index) => {
    const [from, to] = [at, at + line.length]
    at = to + 1
    if (split && !split.mask[index]) return
    for (const [start, end] of spans) {
      if (Math.max(start, from) <= Math.min(end, to)) {
        kept.push(result.slice(Math.max(start, from), Math.min(end, to)))
      }
    }
  })
  return { text: kept.join('\n'), label: split ? split.label : '' }
}

// Lo que destruye escrito en SQL. Cada rama cierra su propio límite. Cuando el `\b` estaba al final del
// grupo se aplicaba a las tres, y la de `delete` termina a propósito en `;`: después de un punto y coma no
// hay límite de palabra, así que `DELETE FROM pedidos;` —la forma que tiene en cualquier migración— pasaba
// y sólo frenaba la variante sin punto y coma. `drop column` y `drop constraint` faltaban: pierden datos y
// garantías igual que `drop table`.
const DESTRUCTIVE_SQL = new RegExp(
  String.raw`\bdrop\s+(?:table|database|schema|column|constraint)\b` +
    String.raw`|\btruncate\b` +
    String.raw`|\bdelete\s+from\s+\S+\s*(?:;|$)`,
  'i',
)

// Lo que destruye escrito con la API de la herramienta (caso 193). Son los nombres que la documentación
// pública de cada una define, comprobados el 2026-09-23 y no más: Alembic (`ops.html`), Rails
// (`active_record_migrations.md`), TypeORM (`migrations/09-api.md`), Knex (`schema-builder.md`) y Django
// (`ref/migration-operations`). La lista envejece nombrando: lo que no está sigue pasando, igual que antes.
// Sensible a mayúsculas porque la API lo es, y así `DeleteModel` no se confunde con prosa.
const DESTRUCTIVE_API = new RegExp(
  String.raw`\b(?:drop_table|drop_column|remove_columns?|drop_join_table` +
    String.raw`|dropTable|dropTableIfExists|dropColumns?|DeleteModel|RemoveField)\b`,
)

// Qué destruye en `text`, o vacío: el fragmento que lo delata y de qué clase es, para que el mensaje pueda
// nombrar la sentencia y no sólo el archivo.
function destructive(text) {
  const sql = String(text).match(DESTRUCTIVE_SQL)
  if (sql) return { kind: 'SQL destructivo', what: sql[0].replace(/\s+/g, ' ').toUpperCase() }
  const api = String(text).match(DESTRUCTIVE_API)
  return api ? { kind: 'un borrado destructivo', what: api[0] } : null
}

// Lo declarado en `migrations` que no alcanza a ningún archivo del producto: una extensión o una carpeta
// que el guard promete mirar y no mira nada. Es lo que el 077 y el 196 tienen en común —cobertura
// declarada que no cubre, en silencio—, y va en `check` y no en el guard porque recorre el repositorio y el
// guard corre en cada escritura (R26).
//
// Sólo mira lo que el proyecto declaró: sin declarar, el default no promete nada que alguien haya elegido.
// Lee `git ls-files` de cada repositorio de las raíces, que es barato y deja afuera lo generado; sin
// repositorio no dice nada, como el resto de los avisos que preguntan a git.
function coverageWarnings(repos, config) {
  const migrations = (config && config.migrations) || {}
  const askExtensions = Array.isArray(migrations.extensions)
  const askPaths = Array.isArray(migrations.paths)
  if (!askExtensions && !askPaths) return []
  const files = repos.flatMap((repo) => {
    const listed = spawnSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : []
  })
  if (!files.length) return []
  const matcher = pattern(config)
  const covered = files.filter((file) => matcher.test(file))
  const warnings = []
  if (askExtensions) {
    for (const one of declared(config, 'extensions', EXTENSION_SHAPE, [])) {
      if (covered.some((file) => file.toLowerCase().endsWith(`.${one}`))) continue
      warnings.push(`ops.config.json: migrations.extensions "${one}" no alcanza a ningún archivo bajo `
        + `${declared(config, 'paths', PATH_SHAPE, DEFAULT_PATHS).join(', ')}: el guard no mira ninguna `
        + 'migración con esa extensión. Si viven en otra carpeta, declarala en migrations.paths')
    }
  }
  if (askPaths) {
    for (const one of declared(config, 'paths', PATH_SHAPE, [])) {
      const only = pattern({ migrations: { ...migrations, paths: [one] } })
      if (files.some((file) => only.test(file))) continue
      warnings.push(`ops.config.json: migrations.paths "${one}" no alcanza a ningún archivo con las extensiones `
        + `${declared(config, 'extensions', EXTENSION_SHAPE, DEFAULT_EXTENSIONS).join(', ')}`)
    }
  }
  return warnings
}

module.exports = {
  PATH_SHAPE, EXTENSION_SHAPE, pattern, judged, destructive, coverageWarnings,
}
