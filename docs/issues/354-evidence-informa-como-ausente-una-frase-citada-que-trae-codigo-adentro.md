---
caso: 354
titulo: evidence informa como ausente una frase citada que trae código adentro
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 354 — `ops evidence` dice «cita y no aparece» de una frase que está en el archivo, cuando la frase trae una palabra entre comillas invertidas o cuando el archivo tiene un `;` que la traza no pudo escribir

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: no cambia el veredicto de la traza —el archivo se encuentra igual— y no frena nada. Lo que
hace es agregar un aviso falso al lado de un `[encontrado]`: «cita y no aparece». Vale arreglarlo porque es
justo la forma que escribe `autobuild` para lo que se cumple en un documento o en un comentario, que desde
el 345 es una traza de todos los días, y un aviso que salta siempre enseña a no leer los demás.

## Resumen

Una traza puede citar entre comillas lo que encontró en el archivo, y `evidence` busca esa frase y dice al
lado si no aparece. Dos cosas hacían que una frase que sí estaba se informara como ausente:

1. **La frase se buscaba con sus tramos de código arrancados.** Antes de buscar las citas, el texto se
   quedaba sin todo lo que iba entre comillas invertidas. Una cita que traía una palabra así —«la marca
   `blocked` sin registrar»— se buscaba con un hueco en el medio, y con el hueco no está en ningún archivo.
2. **La frase no se comparaba como la traza la pudo escribir.** Un `;` separa trazas dentro de `tests:`, así
   que quien escribe la traza lo cambia por una coma. El archivo tiene el `;` y la traza la coma.

## Reproducción

Con un archivo que contenga las dos frases, y sus trazas:

```
docs/RIESGOS.md   | … | El handler rechaza por la marca `blocked` sin registrar quién la puso. |
src/handler.js    // El pedido marcado `blocked` se rechaza con 403 y sin cuerpo; el resto devuelve el suyo.

A → n/a — Se cumple en docs/RIESGOS.md línea 5: la Nota dice «El handler rechaza por la marca `blocked` sin registrar quién la puso.»
A → n/a — Se cumple en un comentario, src/handler.js línea 3: «El pedido marcado `blocked` se rechaza con 403 y sin cuerpo, el resto devuelve el suyo.»
```

## Síntoma

De una corrida real de `/autobuild`, sobre la entrada que la propia corrida escribió:

```
A → n/a …  [encontrado] — en el archivo: blocked; cita y no aparece: El handler rechaza por la marca   sin registrar ni verificar quién la puso. Auditar quién marcó queda fuera de alcance.
A → n/a …  [encontrado] — en el archivo: blocked; cita y no aparece: El pedido marcado   se rechaza con 403 y sin cuerpo, el resto devuelve el suyo.
```

Los tres espacios seguidos son el hueco donde iba `blocked`. Las dos frases están en el archivo.

## Causa raíz

- `engine/core/evidence.js`, `parts` — las citas se sacaban de `remaining.replace(/`[^`]*`/g, ' ')`. El
  reemplazo existe para que una comilla dentro de un tramo de código —`Expected: "80"`— no se tome por una
  cita, y se llevaba puesto el código que una cita traía adentro.
- `engine/core/evidence.js`, `contrastParts` — lo citado se comparaba con el texto del archivo tal cual. La
  equivalencia que ya existía para el nombre de una traza armada —espacios, `;` por coma— no se aplicaba a
  lo citado.

## Fix propuesto

1. Leer citas y tramos de código de izquierda a derecha, y que gane lo que abre primero: una comilla dentro
   de código sigue sin ser una cita, y una cita conserva el código que trae.
2. Comparar lo citado también con la equivalencia de una traza escrita: si no aparece al pie de la letra, se
   busca con los espacios juntados y el `;` como coma, de los dos lados.

## Valor

Saca un aviso falso de la forma de traza más común desde el 345. No destraba nada.

## Qué podría salir mal

1. **Que el veredicto de alguna traza cambie.** Las citas también deciden el veredicto cuando la traza no
   nombra ningún archivo. Una cita que antes se buscaba con hueco no se encontraba nunca, así que el único
   cambio posible es de `ausente` a `encontrado`, y sólo si la frase entera está.
2. **Que la comparación floja dé por buena una frase que no está.** Se aplica sólo al aviso «cita y no
   aparece», nunca al nombre de la prueba, que es lo que decide.
3. **Que una comilla dentro de código pase a contar como cita.** Es lo que el reemplazo cuidaba.

## Cierre

**Resuelto en 0.106.0** con las dos partes del fix.

### El recorrido de lo que este caso enumeró

- **Fix 1, citas y código de izquierda a derecha — se hizo.**
- **Fix 2, lo citado con la equivalencia de una traza escrita — se hizo**, sólo para el aviso.
- **Qué podría salir mal 1, un veredicto que cambia — medido, y no cambió ninguno.** Con el motor anterior y
  con éste sobre las entradas cerradas de tres instancias reales, en sólo lectura: 161 entradas y 152
  trazas, ningún veredicto distinto, ninguna cita extraída distinto y ningún aviso de más ni de menos. Dice
  también que la forma que este caso arregla todavía no aparece en esas instancias: es la de las corridas
  nuevas.
- **2, la comparación floja — acotada**: una frase inventada con código adentro sigue saliendo «cita y no
  aparece», y está probado.
- **3, la comilla dentro de código — probado**, con una prueba que al principio no lo distinguía.

### Qué se corrió

- **Sobre la corrida real del síntoma**, con el motor nuevo: las dos trazas dejan de avisar.

  ```
  A → n/a …  [encontrado] — en el archivo: El handler rechaza por la marca `blocked` sin registrar ni verificar quién la puso. Auditar quién marcó queda fuera de alcance., blocked
  A → n/a …  [encontrado] — en el archivo: El pedido marcado `blocked` se rechaza con 403 y sin cuerpo, el resto devuelve el suyo., blocked
  ```

- Rojo previo: la prueba nueva de `test/planning/ops-evidence.test.js`, con las dos frases de esa corrida,
  falló antes del cambio mostrando la cita con el hueco.
- Cuatro mutaciones, cada una en rojo: volver a arrancar el código antes de buscar las citas, comparar lo
  citado sólo al pie de la letra, no informar nunca una cita ausente, y contar como cita la comilla de
  adentro del código. Esta última sobrevivió la primera vez: la salida de ejemplo era `"80"`, de dos
  letras, y el motor ya descarta una cita tan corta. Se cambió el ejemplo y se puso en rojo.
- La comparación con el motor anterior de arriba.

No tuvo revisión independiente: es una regla de extracción y una de comparación, las dos con su mutación, y
la medición sobre las instancias reales cubre lo que una revisión iba a mirar.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Un hallazgo: **la comparación de lo citado con la equivalencia de una traza escrita sólo se
aplicaba cuando la traza nombraba un archivo.** Sin archivo, la misma frase con el `;` cambiado por coma
salía `ausente`. Ahora se compara igual en los dos caminos, y el nombre de la prueba se sigue buscando al pie
de la letra. Rojo previo, y una frase inventada sigue saliendo `ausente`. La medición sobre las tres
instancias reales se repitió con este cambio: 161 entradas y 152 trazas, ningún veredicto distinto. De paso,
el texto de cada archivo se normaliza una vez por corrida y no una por cada frase citada.

## Contexto de descubrimiento

Se vio al cerrar el 353, corriendo `evidence` sobre la corrida real que lo originó: con la prueba ya
encontrada, quedaban dos avisos al lado de dos trazas que decían la verdad.

## Relacionados

- [353](./353-en-una-linea-ops-evidence-da-por-ausente-la-prueba-que-quedo-en-la-rama-de-la-tarea.md) — donde
  apareció.
- [345](./345-una-condicion-que-se-cumple-en-un-documento-va-a-missing-test-si-el-diff-toca-codigo.md) — el
  que volvió común la traza `n/a` que cita un documento o un comentario.
- [330](./330-evidence-da-parcial-a-las-trazas-que-escribe-una-corrida-real.md) y
  [331](./331-la-traza-de-una-prueba-es-texto-libre-y-no-se-puede-contrastar.md) — de dónde salen la
  lectura de citas y la equivalencia de una traza armada.
