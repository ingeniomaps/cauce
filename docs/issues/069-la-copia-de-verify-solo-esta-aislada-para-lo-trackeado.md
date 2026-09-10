---
caso: 069
titulo: La copia sobre la que corren los gates sólo está aislada para lo trackeado, y los gates escriben
estado: resuelto
resuelto-en: 0.74.0
prioridad: media
version-detectada: 0.74.0
---

# 069 — Se enlaza lo ignorado al original, y un gate no sólo lee su entorno

**🟢 resuelto en 0.74.0** · detectado en 0.74.0 · prioridad **media** — sí rompía algo, y en silencio

## Resumen

`verify` materializa el índice en un temporal para medir lo que el commit va a grabar, y lo que está
ignorado no se copia: **se enlaza al original**. La razón es correcta y está escrita en el código —
`node_modules` es entorno y no código del commit, y copiarlo por corrida sería inviable.

Lo que la decisión no contempla es que **un gate escribe en su entorno**. Los gates que corren son
`test`, `lint`, `typecheck` y `build`, y `build` escribe la salida de build —`.next/`, `dist/`— que es
justamente uno de los directorios ignorados, o sea enlazado, o sea el del árbol de quien commitea. Con
cobertura activada, `test` escribe su reporte por el mismo camino.

O sea que la copia está aislada **para lo trackeado y para nada más**.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

node -e '
const fs = require("node:fs"), path = require("node:path")
const { tempRoot } = require("./test/support/environment")
const { execFileSync } = require("node:child_process")
const root = tempRoot("d069-")
const git = (a) => execFileSync("git", a, { cwd: root })
execFileSync("git", ["init", "-q", "."], { cwd: root })
git(["config", "user.email", "t@t"]); git(["config", "user.name", "t"])
fs.mkdirSync(path.join(root, "planning"), { recursive: true })
fs.writeFileSync(path.join(root, "planning", ".keep"), "")
fs.writeFileSync(path.join(root, "ops.config.json"), JSON.stringify({ project: "x", mode: "embedded" }))
fs.writeFileSync(path.join(root, ".gitignore"), "dist/
")
fs.writeFileSync(path.join(root, "build.js"),
  `const fs=require("node:fs");fs.mkdirSync("dist",{recursive:true});fs.copyFileSync("app.js","dist/app.js")
`)
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "node build.js" } }))
fs.writeFileSync(path.join(root, "app.js"), `VERSION = "staged"
`)
git(["add", "-A"])
fs.writeFileSync(path.join(root, "app.js"), `VERSION = "lo-que-estoy-editando"
`)   // seguís editando
fs.mkdirSync(path.join(root, "dist"), { recursive: true })                            // y ya buildeaste
fs.copyFileSync(path.join(root, "app.js"), path.join(root, "dist", "app.js"))
console.log("dist ANTES :", fs.readFileSync(path.join(root, "dist", "app.js"), "utf8").trim())
try { require("./engine/hooks/shell.js").verify({ cwd: root, tool_input: { command: "git commit -m x" } }) } catch {}
console.log("dist DESPUÉS:", fs.readFileSync(path.join(root, "dist", "app.js"), "utf8").trim())
console.log("app.js      :", fs.readFileSync(path.join(root, "app.js"), "utf8").trim())'
```

## Síntoma

Medido el 2026-09-10:

```
dist ANTES del commit : VERSION = "lo-que-estoy-editando"
dist DESPUÉS          : VERSION = "staged"
app.js en el árbol    : VERSION = "lo-que-estoy-editando"
```

**No es regeneración inocua, y este caso lo suponía.** ~~Ninguno visible… el efecto no se distingue del
trabajo normal.~~ El gate corre sobre el índice, así que lo que deja en tu salida de build es **la
versión staged**, no la que estás editando. Tu fuente en disco dice una cosa y tu `dist/` dice otra, y
nada lo anuncia. Si corrés la app después de commitear, corrés algo que no es lo que estás mirando.

Se vuelve **destructivo** —y no sólo confuso— cuando lo que escribe borra en vez de regenerar, que es lo
que reportó el [068](068-verify-sobre-el-indice-y-pnpm-quiere-borrar-node-modules.md): pnpm 11 decide
reinstalar y empieza borrando el `node_modules` del proyecto. Ahí el 068 puso `CI=true` y cerró **ese**
camino; éste sigue abierto.

**Y sólo pasa con lo que ya existe.** Un `dist/` que no existe no lo lista `git status --ignored`, así
que no se enlaza y el gate lo crea adentro de la copia, donde se descarta con ella. El daño es
exactamente sobre lo que ya habías construido.

## Causa raíz

`engine/hooks/shell.js`, `commitTree()`, línea 405: `symlinkSync(path.join(dir, name), link)`. El enlace
es de lectura y escritura porque un symlink no tiene permisos propios: los tiene el destino.

## Fix propuesto

Ninguno cerrado, y es una decisión con costo de plataforma:

- **Bind mount de sólo lectura** donde el sistema lo permita. Es lo más completo y lo más dependiente
  del sistema operativo: en Linux pide `mount --bind -o ro` y privilegios, en macOS no hay equivalente
  directo, en Windows es otra cosa.
- **Enlazar el almacén y no el árbol** —en pnpm, el `.pnpm/` del store— para que lo que se toque sea
  contenido direccionado por hash y no el árbol del proyecto. Más barato y sólo cubre a pnpm.
- **Copiar en vez de enlazar lo que un gate suele escribir** —la salida de build— y enlazar sólo lo que
  suele leer. Pide una lista, que es exactamente el tipo de heurística que envejece.
- **No hacer nada y declararlo.** Con `CI=true` puesto, lo que queda es que un gate regenere en el árbol
  del usuario lo que ese gate regenera igual. Puede ser aceptable, y decirlo es más honesto que una
  lista de directorios que nadie mantiene.

## Tradeoffs

- **La opción más completa es la menos portable**, y este toolkit corre en las tres plataformas.
- ~~**No medido cuánto daño hace hoy.**~~ **Medido el 2026-09-10, y no era regeneración**: la salida de
  build queda con la versión del índice mientras el fuente en disco tiene otra. Lo que sigue sin medirse
  es la **frecuencia** —cuántos commits reales pasan por ahí—, y eso decide si conviene la vía cara.
- **Aislar de más rompe gates legítimos**: un gate que necesita escribir un caché para terminar en un
  tiempo razonable dejaría de poder hacerlo, y ahí el guard pasa de correcto a insoportable.

## Contexto de descubrimiento

Arreglando el 068. Ese caso reportó el síntoma de pnpm y atribuyó la causa a «herramientas que se
auto-sincronizan»; leyendo el código para aplicar su fix apareció que el enlace no distingue quién lee
de quién escribe, y que `build` ya escribe por ahí en cada corrida.

## Relacionados

- [068](068-verify-sobre-el-indice-y-pnpm-quiere-borrar-node-modules.md) — de donde sale. Cerró el
  camino de pnpm con `CI=true`; esto es la propiedad de la que ese camino era una instancia.
- [045](045-los-gates-corren-con-git-dir-del-repo-real-y-la-suite-commitea-ahi.md) — el mismo error una capa
  más arriba: los gates escribían con git en el repositorio que se estaba juzgando.

## Cierre

**Resuelto en 0.74.0.** El recorrido de lo que enumeró:

- **Se tomó la tercera vía y su objeción se cayó al mirarla de cerca.** El caso decía que copiar unos y
  enlazar otros «pide una lista, que es exactamente el tipo de heurística que envejece». La lista
  envejece, sí, y pesa mucho menos de lo que parecía: **sólo se aplica a rutas que git ya marcó como
  ignoradas**. Un `dist/` ignorado es generado por definición, así que la lista no decide si algo es
  salida de build — decide sobre cosas que git ya declaró generadas.
- **Y sus dos formas de errar no son simétricas, que es lo que la vuelve segura.** Que falte un nombre
  deja el comportamiento de antes; que sobre uno hace que el gate reconstruya, que es más lento y no
  incorrecto. Ninguna rompe un gate por falta de dependencias, porque lo que un gate no puede fabricar
  —`node_modules`, un `.env`, las credenciales de una herramienta— se sigue enlazando.
- **La primera vía —bind mount de sólo lectura— no se tomó, y la razón es la que el caso ya decía:** es
  lo único que garantiza que ningún gate escriba, y es lo menos portable. Este toolkit corre en Linux,
  macOS y Windows, y en dos de los tres no hay equivalente directo.
- **La segunda —enlazar el almacén y no el árbol— tampoco**: sólo cubre a pnpm, y el daño medido no es
  de pnpm sino de cualquier gate que construya.
- **La cuarta —declararlo y no cambiar nada— era la salida honesta mientras el daño fuera regeneración.
  Dejó de serlo al medirlo.**
- **Tradeoff «la opción más completa es la menos portable» — se pagó eligiendo la portable.** Lo que se
  pierde es la garantía: un gate que escriba en una ruta ignorada que no está en la lista sigue
  escribiendo en el árbol del usuario.
- **Tradeoff «no medido cuánto daño hace hoy» — medido**, y era lo que cambió la decisión: la salida de
  build quedaba con la versión del índice mientras el fuente en disco tenía otra.
- **Tradeoff «aislar de más rompe gates legítimos» — acotado por dónde se aplica.** Un gate que
  necesitaba un caché lo reconstruye; uno que necesita una dependencia la sigue teniendo.

**Lo que apareció y el enunciado no preveía: enlazar la salida de build también contaminaba al gate.**
El caso lo planteó como un daño al usuario, y son dos. El build de la copia se hacía **sobre restos de
la corrida anterior del usuario**, así que el veredicto del gate dependía de un estado que nadie
declaró y que cambia entre commits. No enlazarlo arregla las dos cosas con el mismo cambio.

**Probado sobre el escenario medido**, con las dos mitades juntas porque separadas no dicen nada:

```
dist ANTES  : VERSION = "lo-que-estoy-editando"
dist DESPUÉS: VERSION = "lo-que-estoy-editando"     ← antes decía "staged"
el gate encontró node_modules/dep/marca.txt: sí
```

Dos mutaciones comprobadas: volver a enlazar lo recreable —la salida del usuario se pisa otra vez— y
dejar de enlazar todo —el gate se queda sin dependencias y sale en rojo—. Las dos ponen la prueba en
rojo, y hacen falta las dos: la primera sola pasaría con un guard que no enlaza nada.

**Lo que este arreglo no garantiza, y queda declarado.** Una ruta ignorada que un gate escriba y que no
esté en la lista sigue cayendo en el árbol del usuario. Lo que lo reabriría es que aparezca una: ahí se
agrega el nombre, y si aparecen varias, la pregunta vuelve a ser la del bind mount.
