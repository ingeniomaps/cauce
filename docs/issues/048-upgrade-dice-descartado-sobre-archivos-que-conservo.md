---
caso: 048
titulo: `upgrade` dice «descartado tu cambio» sobre los archivos que acaba de conservar
estado: resuelto
resuelto-en: 0.68.0
prioridad: alta
version-detectada: 0.67.0
---

# 048 — La salida afirma un descarte que no ocurrió, y con eso tapa el borrado que sí

**🟢 resuelto en 0.68.0** · detectado en 0.67.0 · prioridad **alta** — la salida miente sobre lo que hizo, y esconde la única línea destructiva real

## Resumen

Sin `--force`, `upgrade` conserva los archivos editados —es lo que 0.67.0 vino a hacer, y funciona—. Pero
la salida los enumera igual con `− descartado tu cambio en <archivo>`, uno por uno, **después** de la
línea `✓ Cauce X → Y` que anuncia que terminó bien. Ninguno se descartó.

La invariante que sostenía esa línea era cierta hasta 0.66.0: sin `--force` el comando abortaba antes de
llegar a imprimirla, así que llegar ahí con archivos editados **implicaba** `--force`. 0.67.0 quitó el
corte y no quitó la afirmación.

El daño no es sólo la línea falsa. En la misma corrida, con el mismo glifo `−` y en el mismo bloque, va
la única acción destructiva de verdad: `− retirado automatization/workflows: Cauce ya no lo distribuye`
([047](047-upgrade-borra-el-directorio-retirado-con-los-archivos-propios-adentro.md)). Diecinueve
renglones falsos delante la vuelven indistinguible.

Y la contracara: `planning, organization y todo lo propio quedaron intactos` **se suprime** justo cuando
hay archivos conservados, que es cuando quedaron intactos y hay que decirlo.

## Reproducción

```bash
BANCO=~/.cache/sonda-048 && rm -rf "$BANCO" && mkdir -p "$BANCO" && cd "$BANCO"
npx @ingeniomaps/cauce@0.66.0 init . --mode embedded --force --install

printf '\n# Marca de la empresa que no debe perderse.\n' >> planning/PROTOCOL.md
sha256sum planning/PROTOCOL.md

npx @ingeniomaps/cauce@0.67.0 upgrade .     # sin --force
sha256sum planning/PROTOCOL.md
grep -c 'Marca de la empresa' planning/PROTOCOL.md
```

*Verificado* el 2026-09-07.

## Síntoma

```
✓ Cauce 0.66.0 → 0.67.0
− descartado tu cambio en planning/PROTOCOL.md
```

Y el archivo, medido antes y después del comando:

```
sha antes:   da824a1c1d30d188
sha después: da824a1c1d30d188
la marca sigue en el archivo: 1
```

En la instancia real fueron diecinueve de estas líneas —seis guards propios y trece docs, todos intactos,
comprobados uno por uno con `cmp`— seguidas del `− retirado` que sí borró tres archivos.

## Causa raíz

`engine/cli/upgrade-report.js:79`, dentro de `reportUpgrade`:

```js
console.log(`✓ Cauce ${from || '(previa)'} → ${to}`)
// Descartar con --force es legítimo; hacerlo sin dejar rastro no. Queda en la salida del comando,
// que es la evidencia que el protocolo pide para cualquier cambio.
for (const file of changed) console.log(`− descartado tu cambio en ${file}`)
```

El comentario declara la premisa: esas líneas son el rastro de `--force`. Y `:93` la repite:

```js
// Sólo cuando es cierto: llegar acá con algo en `changed` es haber descartado contenido de la
// empresa con --force, que las líneas de arriba enumeran.
if (!changed.length) console.log('  planning, organization y todo lo propio quedaron intactos')
```

«Llegar acá con algo en `changed` es haber descartado con `--force`» dejó de ser cierto cuando
`instance.js:296` pasó de abortar a conservar y seguir. `reportUpgrade` sigue recibiendo el mismo
`changed` y no tiene con qué distinguir una cosa de la otra.

## Fix propuesto

Que el informe reciba lo que pasó en vez de deducirlo de una condición que ya no vale. **`reportUpgrade`
no recibe `force` hoy** —`instance.js:407` le pasa `{root, from, to, system, changed, retired, added,
overrides, pinned, droppedBlocks}`—, así que el diff de abajo pide además hacérselo llegar. Mejor que
pasar la bandera es pasar el hecho: quien escribe ya sabe qué conservó, y mandarle esa lista al informe
evita que vuelva a deducirlo de una condición.

```diff
-for (const file of changed) console.log(`− descartado tu cambio en ${file}`)
+// `changed` es «lo que estaba editado», no «lo que se descartó»: sin --force se conserva. Cuál de
+// las dos cosas ocurrió lo sabe quien escribió, no quien informa.
+for (const file of changed) {
+  console.log(force ? `− descartado tu cambio en ${file}` : `= conservado ${file} (editado localmente)`)
+}
```

Y la línea de tranquilidad, por el mismo criterio:

```diff
-if (!changed.length) console.log('  planning, organization y todo lo propio quedaron intactos')
+if (!force) console.log('  planning, organization y todo lo propio quedaron intactos')
```

Aparte, y aunque se arregle lo anterior: **el retiro de una ruta no debería compartir glifo con el
descarte de un archivo.** Son dos cosas de peso distinto —una borra un directorio entero— y hoy se leen
igual. Un marcador propio, o imprimirlo fuera de ese bloque, es lo que lo vuelve visible.

## Verificado

Contra `0.67.0`, leyendo el código: las dos líneas están donde el caso dice —el bucle de `− descartado`
en `upgrade-report.js:79` y el `if (!changed.length)` en `:93`—, `reportUpgrade` no recibe `force`, y el
bloque de `= conservado` que imprime `instance.js` para los mismos archivos corre antes en la misma
corrida. O sea que cada archivo conservado se nombra dos veces y con veredictos opuestos.

## Tradeoffs

Ninguno de comportamiento: sólo cambia lo que se imprime. El costo es que `upgrade` sin `--force` pasa a
repetir los `= conservado` que ya salieron en la fase previa. Es duplicación, y es preferible a una
afirmación falsa — o se imprime una vez sola, decidiendo cuál de las dos fases informa.

## Prioridad

**Alta.** No por lo que rompe —no rompe nada— sino por lo que impide ver. Quien lee la salida de un
comando que acaba de tocarle el repositorio recibe diecinueve afirmaciones falsas de pérdida y, entre
ellas, una verdadera. La reacción razonable ante un bloque así es ir a verificar los diecinueve, y en esa
búsqueda la línea que importa pasa desapercibida. Fue exactamente lo que ocurrió.

## Contexto de descubrimiento

Actualizando `roax-ops` de 0.66.0 a 0.67.0 el 2026-09-07. La salida decía `= conservado` para los
diecinueve en su primera mitad y `− descartado tu cambio en` para los mismos diecinueve en la segunda, lo
que obligó a comprobarlos con `cmp` uno por uno —estaban todos intactos—. En esa pasada apareció el
`− retirado automatization/workflows`, que sí se había ejecutado y se llevó un `autobuild.js` de 99 KB.
Se recuperó de un snapshot previo. Sin esa contradicción en la salida el retiro se habría visto de
entrada; con ella, se encontró diffeando y no leyendo.

## Cierre

**Resuelto en 0.68.0.** El recorrido de lo que enumeró:

- **El informe recibe lo que pasó en vez de deducirlo — hecho, y con el hecho y no con la bandera.**
  `reportUpgrade` ya no ve `changed`: recibe `descartados` —vacío salvo con `--force`—, `conservados` y
  `pendientes`. Deducir de una condición fue lo que dejó la afirmación viva cuando la condición dejó de
  valer; pasarle la bandera habría dejado la misma deducción un nivel más abajo.
- **La línea de tranquilidad — corregida.** «planning, organization y todo lo propio quedaron intactos»
  sale cuando no se descartó nada, que incluye la corrida que conservó veinte archivos. Antes se
  suprimía justo ahí.
- **La duplicación que el Tradeoffs anticipaba — resuelta eligiendo cuál fase informa.** Los `= conservado`
  por archivo salen una sola vez, en la fase que además trae el consejo; el informe cierra con el conteo.
- **El glifo compartido entre retiro y descarte — no se separa**, y la razón está en el cierre del
  [047](047-upgrade-borra-el-directorio-retirado-con-los-archivos-propios-adentro.md).

**Cómo se escapó, que es lo que importa acá**: fue una regresión del arreglo del 044, y la prueba que se
escribió entonces comprobó que **apareciera** `= conservado` y nunca que **desapareciera** `− descartado`.
Las pruebas de este arreglo son de ausencia: que la línea vieja no esté sin `--force`, y que sí esté con
él. Y el cierre del 044 recorrió la enumeración del caso sin preguntar qué otra cosa dependía de la
invariante que estaba quitando —la premisa vivía como comentario en otro archivo—, que es una pregunta
distinta de recorrer la enumeración.

## Relacionados

- [047](047-upgrade-borra-el-directorio-retirado-con-los-archivos-propios-adentro.md) — la acción real que
  este bloque tapó. Son dos defectos distintos: aquél borra, éste esconde.
- [044](044-upgrade-no-tiene-resolucion-por-archivo.md) — el cambio de 0.67.0 que dejó obsoleta la premisa
  de estas líneas. Es una regresión introducida por ese arreglo: su cierre recorrió lo que el caso
  enumeraba y no preguntó qué otra cosa dependía de la invariante que estaba quitando. La prueba nueva
  comprobó que apareciera `= conservado` y nunca que desapareciera `− descartado`.
