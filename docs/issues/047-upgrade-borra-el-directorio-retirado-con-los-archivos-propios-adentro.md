---
caso: 047
titulo: `upgrade` borra un directorio retirado entero, con los archivos propios del proyecto adentro
estado: abierto
prioridad: alta
version-detectada: 0.67.0
---

# 047 — Lo retirado se borra entero: `automatization/workflows/` se lleva el loop del proyecto

**🔴 abierto** · detectado en 0.67.0 · prioridad **alta** — pérdida de contenido propio, irrecuperable sin backup

## Resumen

`upgrade` protege archivo por archivo lo que el proyecto editó —desde 0.67.0 conserva cada uno y lo
nombra— y en la misma corrida borra **directorios enteros** de la lista `RETIRED` sin mirar qué hay
adentro. Si el proyecto puso ahí archivos suyos, se van con el directorio.

Las dos políticas conviven en la misma salida y se contradicen: diecinueve líneas `= conservado …`
seguidas de un `− retirado automatization/workflows` que se lleva tres archivos que nadie escribió desde
el toolkit.

El reconocimiento de que hay contenido irreponible ahí adentro ya existe, y **no salva nada**:
`retiredWithLearning` no rescata, **detiene la corrida** (`engine/cli/instance.js:291-298`) para que
alguien mueva esos archivos a mano, y con `--force` los borra igual. Cubre sólo
`learning/(reports|proposals)/`; todo lo demás se borra sin que nada se detenga ni se pregunte.

Y desde 0.67.0 esas dos políticas conviven en el mismo comando: para un archivo editado, conservar y
avisar; para uno dentro de una ruta retirada, detener la corrida si es aprendizaje y borrarlo en silencio
si es cualquier otra cosa.

## Reproducción

Desde un directorio vacío, con una instancia de 0.66.0 y el motor 0.67.0:

```bash
BANCO=~/.cache/sonda-045 && rm -rf "$BANCO" && mkdir -p "$BANCO" && cd "$BANCO"
npx @ingeniomaps/cauce@0.66.0 init . --mode embedded --force --install

# Archivos del proyecto, en un directorio que Cauce dejó de distribuir.
mkdir -p automatization/workflows
printf '// El loop propio del proyecto, 1100 lineas.\n' > automatization/workflows/autobuild.js
printf '// Sync con Jira, propio.\n'                    > automatization/workflows/jira-sync.js

npx @ingeniomaps/cauce@0.67.0 upgrade .
ls automatization/workflows/
```

*Verificado* el 2026-09-07. No hay `--force` en ninguna línea.

## Síntoma

La corrida imprime una sola línea sobre esto, entre otras sesenta:

```
− retirado automatization/workflows: Cauce ya no lo distribuye
```

Y después:

```
ls: no se puede acceder a 'automatization/workflows/': No existe el archivo o el directorio
```

No dice cuántos archivos había, ni cuáles, ni que son del proyecto, ni que la operación no se deshace.
La línea es idéntica tanto si el directorio tenía sólo lo que Cauce puso como si tenía el loop entero de
la empresa.

Agrava el ruido que en la misma salida, justo antes, van diecinueve `− descartado tu cambio en …` que
**no son acciones ni un preview**: son una afirmación que dejó de ser cierta en 0.67.0 y que nadie
retiró ([048](048-upgrade-dice-descartado-sobre-archivos-que-conservo.md)). El lector que llega al
`− retirado` con esos veinte renglones encima ya no sabe cuáles de ese bloque ocurrieron. Éste ocurrió.

## Causa raíz

Son dos lugares y conviene no confundirlos: uno declara la lista y otro la ejecuta.

`engine/core/ownership.js:220` declara qué se retira:

```js
const RETIRED = [
  'agents/roles/system',
  'flows/system',
  '.github/workflows/agent-learning.yml',
  'automatization/runners',
  'automatization/workflows',
  'automatization/config.json',
]
```

`engine/cli/instance.js:373-379` es quien borra, y no mira nada más que si la ruta existe —tampoco
mira `--force`:

```js
for (const relative of O.RETIRED) {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) continue
  F.assertNoSymlinkPath(root, target)
  fs.rmSync(target, { recursive: true, force: true })
  retired.push(relative)
}
```

Lo único que corre antes es `retiredWithLearning`, en `ownership.js:234`, y su efecto no es filtrar sino
detener la corrida entera cuando encuentra aprendizaje:

```js
function retiredWithLearning(root) {
  for (const relative of RETIRED) {
    for (const file of treeFiles(dir)) {
      if (!/(^|\/)learning\/(reports|proposals)\//.test(file)) continue
      …
```

Todo lo que no case con ese patrón se elimina sin consultarse. Para los paths *tracked* la comparación
es por archivo (`localChanges` → `manifest.edited`); para los *retirados* no hay comparación de ninguna
clase.

`automatization/workflows` es además el caso peor de la lista: es el nombre natural para los workflows
propios de un proyecto, y quien adoptó Cauce cuando ese directorio **sí** se distribuía tiene los suyos
justo ahí.

## Fix propuesto

Aplicar a lo retirado el mismo criterio que ya rige para lo tracked: mirar archivo por archivo y no
borrar lo que el toolkit no puso.

El diff de abajo es **la forma, no código**: `manifest.delivered`, `remove` y `removeDelivered` no
existen todavía —el manifiesto expone `read`, `edited`, `record` y `prune`— y quien tome el caso tiene
que escribirlas o resolverlo con lo que hay.

```diff
-for (const relative of RETIRED) { remove(path.join(root, relative)) }
+// Un directorio retirado puede tener archivos que el proyecto puso ahí, y de ésos el toolkit no es
+// dueño: retirar la ruta no lo vuelve dueño de su contenido. Se borra lo que Cauce entregó —el
+// manifest lo sabe— y lo demás se conserva, nombrándolo, como ya se hace con lo editado.
+for (const relative of RETIRED) {
+  const ajenos = treeFiles(path.join(root, relative)).filter((f) => !manifest.delivered(relative, f))
+  if (!ajenos.length) { remove(path.join(root, relative)); continue }
+  removeDelivered(root, relative)
+  for (const f of ajenos) console.log(`= conservado ${relative}/${f} (es tuyo; la ruta se retiró)`)
+}
```

Con eso `retiredWithLearning` deja de ser un caso especial: el aprendizaje se conserva porque es del
proyecto, igual que todo lo demás que el toolkit no entregó.

Si se prefiere no cambiar la política, el mínimo es que la línea diga qué se lleva y pida confirmación:
`− retirado automatization/workflows: 3 archivo(s) que Cauce no entregó — se borran (--force para
confirmar)`. Borrar en silencio contenido ajeno no debería ser el default de un comando que en la misma
corrida se toma el trabajo de conservar diecinueve archivos de a uno.

## Tradeoffs

Conservar deja restos: un directorio retirado que sobrevive a medias, con archivos que ya no cuelgan de
ningún mecanismo. Es exactamente el ruido que la lista `RETIRED` vino a evitar. Pero el ruido se limpia
mirándolo, y el contenido borrado no vuelve — y quien tiene ahí su loop no lo tiene versionado, porque
la instancia de planning suele no ser un repositorio.

El otro costo es que `check` debería contar esos restos para que no se vuelvan permanentes, igual que
ahora cuenta los archivos congelados por edición local.

## Prioridad

**Alta.** Es pérdida de contenido propio, sin confirmación y sin vuelta atrás salvo backup. Se llega por
el camino principal —adoptar Cauce sobre un proyecto que ya existía y actualizar— y le pega justo a
quien más trabajo tiene puesto: el que llegó con sus propios workflows. En la instancia real donde
apareció se llevó `autobuild.js` de 99 KB y los dos workflows de Jira; se recuperaron de un snapshot
tomado minutos antes, por precaución y no porque nada lo advirtiera.

## Contexto de descubrimiento

Actualizando `roax-ops` de 0.66.0 a 0.67.0 el 2026-09-07, justo después de que 0.67.0 arreglara el
[044](044-upgrade-no-tiene-resolucion-por-archivo.md) y volviera a `upgrade` seguro de correr. La
corrida informó los diecinueve archivos conservados —el arreglo funcionando— y en el mismo bloque borró
`automatization/workflows/`. Se detectó diffeando contra un snapshot previo, no leyendo la salida: la
línea del retiro estaba, pero enterrada entre veinte renglones de un preview hipotético.

## Relacionados

- [044](044-upgrade-no-tiene-resolucion-por-archivo.md) — el arreglo que volvió `upgrade` corrible sin
  miedo. Este caso es el hueco que quedó: la resolución por archivo llegó a lo tracked y no a lo
  retirado.
- [001](001-upgrade-pisa-lo-que-init-force-conservo.md) — misma familia: `upgrade` llevándose contenido
  que otro paso había conservado.
- [010](010-upgrade-no-crea-los-archivos-propios-nuevos-del-molde.md) — la otra mitad de qué hace
  `upgrade` con lo que es del proyecto.
