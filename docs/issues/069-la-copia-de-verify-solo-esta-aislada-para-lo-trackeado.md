---
caso: 069
titulo: La copia sobre la que corren los gates sólo está aislada para lo trackeado, y los gates escriben
estado: abierto
prioridad: media
version-detectada: 0.74.0
---

# 069 — Se enlaza lo ignorado al original, y un gate no sólo lee su entorno

**🔴 abierto** · detectado en 0.74.0 · prioridad **media** — ya ocurre en cada corrida y no rompe nada
visible, que es por lo que nadie lo notó

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

Pendiente de escribir como comando. Lo que hay es la lectura del código —el bucle de enlaces en
`engine/hooks/shell.js:399-406` enlaza toda entrada que `git status --ignored` marca con `!!`— y el
hecho de que los gates de `verifyGates` incluyen `build`.

Escribirla es barato: un proyecto con un `build` que escriba en un directorio ignorado, un commit con
algo sin stagear, y comprobar la marca de tiempo del directorio real antes y después.

## Síntoma

Ninguno visible, y eso es lo que lo vuelve interesante. Quien commitea termina con su `.next/`
regenerado, que es lo mismo que habría pasado corriendo el build a mano. El efecto no se distingue del
trabajo normal.

Se vuelve visible sólo cuando lo que escribe **destruye** en vez de regenerar, que es el caso que
reportó el [068](068-verify-sobre-el-indice-y-pnpm-quiere-borrar-node-modules.md): pnpm 11 decide
reinstalar y empieza borrando el `node_modules` del proyecto. Ahí el 068 puso `CI=true` y cerró **ese**
camino; el de abajo sigue abierto.

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
- **No medido cuánto daño hace hoy.** El único caso conocido de escritura destructiva es el de pnpm, ya
  cerrado por otra vía. Lo demás es regeneración, que no se distingue del trabajo normal.
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
