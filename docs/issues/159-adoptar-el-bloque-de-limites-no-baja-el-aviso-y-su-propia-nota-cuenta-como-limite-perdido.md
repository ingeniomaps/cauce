---
caso: 159
titulo: El camino declarado que 0.92.0 agregó para escribir límites no baja el aviso del camino adivinado, y la nota que explica el bloque nuevo cuenta como un límite más que se pierde
estado: resuelto
resuelto-en: 0.93.0
prioridad: media
version-detectada: 0.92.0
---

# 159 — Adoptar `### Límites` no baja el aviso, y su propia nota cuenta como límite perdido

**🟢 resuelto en 0.93.0** · detectado en 0.92.0 · prioridad **media** — quien adopta el camino que el 157 agregó
sigue viendo el mismo aviso con el mismo número de párrafos, y al explicar por qué adoptó el bloque
nuevo el aviso sube en uno

## Resumen

El caso 157 agregó en 0.92.0 un **camino declarado** para escribir límites del proyecto: un bloque
`### Límites` con viñetas, para no tener que imitar la gramática `^(El runner|Debe|Nunca)`. La decisión
explícita fue que los dos caminos convivan, y el propio comentario del motor lo dice:

> Los dos caminos conviven a propósito. Quitar `ENUNCIA` al agregar la marca dejaría de contar lo ya
> escrito en instancias vivas —que es la decisión que el caso pedía tomar sobre lo existente—, y así no
> hay nada que migrar: lo viejo sigue entrando, lo nuevo entra mejor, y lo que no entra por ninguno lo
> reporta `warnings`.

El problema es la última cláusula. `warnings()` descuenta un párrafo sólo si coincide **textualmente**
con una viñeta declarada (`declaredHere.has(one)`), y una viñeta nunca es igual al párrafo de prosa que
la motivó: la viñeta es el límite, el párrafo es la razón. Así que después de adoptar el camino nuevo:

- los límites **sí** llegan a los agentes (eso funciona),
- el aviso sigue listando exactamente los mismos párrafos, con el mismo número,
- y la nota que uno escribe para explicar el bloque nuevo **suma uno más**.

Para quien lee el aviso, adoptar la solución del 157 no cambió nada.

## Reproducción

En una instancia con prosa propia bajo `## Excepciones de autonomía` (acá: 14 párrafos que razonan sobre
precedencia de reglas, `runner.allowPush` y los tres archivos de `core_front` que nunca se commitean):

1. `node tools/ops.js contract .` → `límites 4` y el aviso lista **14 párrafo(s)**.
2. Agregar al final de esa sección un bloque `### Límites` con 21 viñetas que enuncian esos mismos
   límites en la gramática que el contrato lee.
3. `node tools/ops.js contract .` → `límites 25`. Los límites ahora llegan.
4. `make check` → el aviso sigue, y ahora dice **15 párrafo(s)**: entró la frase que explica el bloque
   («Lo de arriba es la razón, para una persona. Esto es lo que viaja en el preámbulo…»).
5. Mover esa frase a un comentario HTML la saca del conteo (`withoutComments` la filtra) y el aviso
   vuelve a 14 — el mismo número que antes de adoptar nada.

## Síntoma

```
✓ límites    25 · contratos 4122 caracteres
⚠ organization/workspace.md: 15 párrafo(s) de "## Excepciones de autonomía" no llegan a los agentes
  porque no arrancan con «El runner», «Debe» o «Nunca»: "**Antes de planificar, construir, revisar o
  hacer QA**, todo…", … , "Lo de arriba es la razón, para una persona. Esto es lo que v…"
```

25 límites llegando y 15 párrafos «perdidos» a la vez. Las dos cifras son ciertas y se contradicen para
quien las lee.

## Causa raíz

`engine/cli/contract.js`:

- `paragraphs()` parte la sección en bloques separados por línea vacía y no distingue un límite de su
  explicación: todo bloque que el molde no trae es candidato a «perdido».
- `warnings()` filtra con `!fromTemplate.has(one) && !ENUNCIA.test(one) && !declaredHere.has(one)`. La
  tercera condición compara el párrafo completo contra el texto exacto de cada viñeta de `### Límites`,
  y eso sólo coincide si alguien duplica la viñeta como párrafo — que es justo lo que el camino nuevo
  viene a evitar.
- Nada distingue la prosa **del bloque nuevo** de la prosa que quedó afuera: un encabezado explicativo
  dentro de `### Límites` se cuenta como si fuera un límite no declarado.

## Fix propuesto

Dos cambios chicos, cualquiera de los dos alcanza para que el aviso deje de contradecir al contrato:

```diff
 function warnings(root) {
+  // La prosa que vive dentro de un bloque `### Límites` ya está en el camino declarado: explica las
+  // viñetas, no compite con ellas.
+  const mineOutsideMarked = stripMarkedBlocks(mine)
   const lost = paragraphs(P.withoutComments(mine))
-    .filter((one) => !fromTemplate.has(one) && !ENUNCIA.test(one) && !declaredHere.has(one))
+    .filter((one) => !fromTemplate.has(one) && !ENUNCIA.test(one) && !declaredHere.has(one))
```

y, sobre todo, cambiar **qué mide el aviso**: hoy mide «párrafos que no enuncian», y lo que importa es
«límites que el proyecto escribió y no llegan». Si la sección tiene un bloque `### Límites` no vacío, el
aviso debería bajar a informativo — «hay N párrafos de prosa que no viajan; si alguno es un límite,
sumalo a `### Límites`» — en vez de repetir la misma lista con el mismo tono.

La alternativa barata, si no se quiere tocar la semántica: al detectar un `### Límites` no vacío, omitir
del conteo los párrafos que estén **dentro** de ese bloque. Eso arregla el punto 4 de la reproducción
(que es el que sorprende) aunque deje el resto.

## Tradeoffs

Bajar el aviso a informativo cuando hay bloque declarado tiene un costo real: una instancia que declara
dos límites y deja ocho en prosa vería un aviso más suave del que merece. El 157 eligió el tono fuerte
justamente porque «el caro es encontrar dos de tres». La contra es la de este caso: un tono que no cambia
cuando el proyecto hace lo correcto enseña a ignorarlo, y un aviso que se ignora no encuentra nada.

No proponemos tocar `ENUNCIA` ni la convivencia de los dos caminos: eso lo decidió el 157 y sigue bien.

## Prioridad

Media. No pierde ningún límite —los 25 llegan— y no bloquea nada: `make check` termina en verde con el
aviso. Lo que rompe es la señal, que es el activo del 157.

## Contexto de descubrimiento

2026-09-15, upgrade de la instancia ROAX (`roax-ops`) de Cauce **0.81.0 a 0.92.0**, hecho justamente para
resolver la fricción de los casos 116/126/127 — que funcionó: la autorización del chat ahora se hereda.

Al cerrar los avisos que quedaron después del upgrade se intentó adoptar `### Límites` tal como el 157 lo
recomienda, y ahí apareció esto. El archivo real es
`roax-ops/organization/workspace.md` (283 líneas), con 14 párrafos de prosa que explican precedencia de
reglas, `runner.allowPush` y los tres archivos de `dropi/core_front` que nunca se commitean.

De paso, dos cosas del mismo upgrade que **no** son caso porque ya están escritas o funcionaron bien:

- `npm i` dejó el pin en `^0.92.0` y hubo que volverlo a exacto a mano (es el caso **006**).
- `make links` falla si los guards nuevos del paquete no están documentados en METHODOLOGY §6, y
  METHODOLOGY estaba **congelada por edición local**, así que `upgrade` no pudo traer esa documentación:
  hay que escribirla a mano para poder reinstalar el runner. Vale como caso aparte si se confirma que no
  lo cubre el 044; acá se resolvió documentando `guard-ops-config.sh` y `guard-ops-config-shell.sh`.

## Relacionados

- **157** — el que agregó `### Límites`; este caso es una arista de su arreglo.
- **141** — las reglas del proyecto se inyectan enteras en cada agente: el preámbulo con 25 límites paga
  tamaño en cada subagente, y por eso las viñetas se escribieron cortas.
- **133** — el aviso de rastros disparando sobre el molde del toolkit: el mismo patrón de un aviso que
  cuenta lo que no debería.

## Cierre

**Resuelto en 0.93.0.** Correr el caso antes de arreglarlo cambió tres cosas de lo que él mismo decía,
y una de ellas habría roto el arreglo.

- **La reproducción — hecha, y devuelve otro número.** El caso decía que el aviso «sube en uno». Sobre un
  banco `suelto` con cuatro párrafos de prosa propia: `check` avisaba **4 párrafos**; al agregar
  `### Límites` con cuatro viñetas y una frase que las presenta, `contract` pasó de `límites 3` a
  `límites 7` —los límites sí llegan— y el aviso subió a **6**, no a 5. Los dos de más son la frase que
  presenta el bloque y **la lista entera de viñetas**, contada como un solo párrafo.

- **La causa raíz — se hizo distinta.** El caso la ponía en la tercera condición del filtro: «compara el
  párrafo completo contra el texto exacto de cada viñeta … sólo coincide si alguien duplica la viñeta
  como párrafo». Es casi eso, y el «casi» es lo que importa: `paragraphs()` saca el `- ` y **une las
  viñetas seguidas en un párrafo solo**, así que la lista declarada no puede ser igual a ninguna entrada
  de `declared()` ni aunque alguien la duplicara. Por eso el arreglo descuenta por línea y no por
  párrafo. Contrastado contra `engine/cli/contract.js`: las tres citas del caso —`paragraphs()`,
  `warnings()` y su tercera condición— existen y están donde dice.

- **El fix propuesto — se hizo distinto, y por qué es el hallazgo del caso.** Proponía, como alternativa
  barata, «omitir del conteo los párrafos que estén **dentro** de ese bloque». Medido sobre el banco, el
  primer bloque `### Límites` —el del molde— **se extiende hasta el próximo encabezado**, que es el que
  escribe la persona al final del archivo: los cuatro párrafos de prosa que el aviso existe para
  encontrar caían adentro. Descontar el bloque entero los habría silenciado a todos. Lo que se descuenta
  es lo que de verdad pertenece al bloque: sus viñetas, y la prosa que va **entre el encabezado y la
  primera viñeta**. La prosa posterior no se reclama.
  El diff que el caso trae tampoco se aplicó: define `mineOutsideMarked` y después no lo usa.

- **«Cambiar qué mide el aviso» — hecho, pero no como lo pedía.** El caso proponía bajarlo a informativo
  cuando hay bloque declarado, y él mismo escribió la contra: una instancia que declara dos límites y
  deja ocho en prosa vería un aviso más suave del que merece. Se eligió la otra mitad de lo que pedía
  —que la señal sirva— sin tocar el tono: el aviso ahora nombra el camino declarado en vez de mandar a
  imitar la gramática. Quien lo lee obtiene la acción concreta y el aviso no se ablanda.

- **«No tocar `ENUNCIA` ni la convivencia de los dos caminos» — respetado.** Ninguno de los dos se tocó;
  `limits()` sigue sumando lo declarado y lo que enuncia.

- **El aviso sigue contando los cuatro párrafos de prosa después de declarar, y es correcto.** Su
  contenido ahora llega por las viñetas, pero los párrafos siguen sin llegar, y nada puede saber que el
  párrafo 3 se corresponde con la viñeta 7. Lo que se arregló es que adoptar el camino declarado ya no
  **suba** el número, que era la sorpresa; bajarlo exigiría la correspondencia, que no existe.

- **La línea de `make links` y METHODOLOGY que el caso dejó en «Contexto de descubrimiento» — se
  comprobó contra el 044 y no es caso nuevo.** `make links` no existe en Cauce: es un target del propio
  `roax-ops` (su `Makefile:60`) y lo que corre es `node tools/ops.js automation install`. Y nada en el
  motor valida guards contra METHODOLOGY —`grep METHODOLOGY engine/` devuelve tres usos, ninguno es esa
  validación—, así que esa comprobación es del proyecto. Del lado de Cauce lo que hay es lo que el 044
  resolvió y documentó: un archivo sin contraparte propia queda congelado con la versión del proyecto,
  `upgrade` lo nombra y `check` lo cuenta en cada corrida.

- **El pin de `^0.92.0` — el propio caso ya lo mandaba al 006**, que está resuelto. No se abrió nada.

### Qué se corrió

- **Rojo previo.** La prueba nueva de `test/planning/contract.test.js` falla antes del arreglo con
  `una viñeta declarada no es un límite perdido: true !== false`.
- **Tres mutaciones**, en un worktree desechable que arrancó en verde 14/14. Cortar el intro al final
  del bloque en vez de en la primera viñeta —que es el arreglo con la trampa adentro—: **2 rojos**.
  Descontar por párrafo en lugar de por línea —el defecto de vuelta—: **1 rojo**. Devolver al aviso el
  texto viejo: **1 rojo**. Restaurado, 14/14.
- **Corrida real sobre el banco**, el mismo del paso 2: el aviso baja de **6 a 4** con `límites 7`
  intactos, y su texto pasa a decir «El que sea un límite va como viñeta bajo `### Límites`».
- **`npm run ci` exit 0**, 875 pruebas, 0 fallos, 73 archivos en su piso de cobertura.
