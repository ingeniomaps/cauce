---
caso: 350
titulo: edge-unproven frena cuando el borde nombra su salida y el rojo lleva un paréntesis en el medio
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 350 — `edge-unproven` frena una entrega probada cuando el borde nombra el archivo de salida de la prueba y el rojo lleva una anotación entre paréntesis en el medio del nombre

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: es la tercera forma de escribir el mismo nombre que frena esta puerta, después de las
dos del 306, y cada una cuesta la corrida. Sube a alta si aparece una cuarta: ahí lo que hay que cambiar es
que la puerta compare texto libre, no agregar otra excepción.

## Resumen

Build declara cada borde que encontró con la prueba que lo fija, y la puerta exige que esa prueba esté entre
los rojos declarados. Compara por tramos, separando el nombre por « — », « › » o « > ». En una corrida real
el borde y el rojo nombraban el mismo guión de comparación, y la puerta no encontró ningún tramo igual:

- el borde puso como segundo tramo el archivo donde quedó la salida de la mutación;
- el rojo llevaba una aclaración entre paréntesis pegada al primer tramo, y la puerta sólo quita el
  paréntesis del final del nombre.

El trabajo estaba hecho y probado. La corrida paró igual, antes de Review.

## Reproducción

Con las dos cadenas de la corrida y las funciones de `autobuild.js:1440-1449`:

```bash
node -e "
const core=(n)=>String(n||'').replace(/\s*\([^)]*\)\s*\$/,'').trim()
const bare=(p)=>p.replace(/^['\"\`«]+|['\"\`»]+\$/g,'').trim()
const parts=(n)=>core(n).split(/\s+(?:›|>|—)\s+|::/).map(bare).filter(Boolean)
console.log(parts('raw/compare.js — raw/CA4-mut-sin-restaurar-el-logo.txt'))
console.log(parts('raw/compare.js (antes vs después, 16 pares por el gateway) — alto del logo bajo el preflight'))"
```

## Síntoma

```
[ 'raw/compare.js', 'raw/CA4-mut-sin-restaurar-el-logo.txt' ]
[ 'raw/compare.js (antes vs después, 16 pares por el gateway)', 'alto del logo bajo el preflight' ]
```

Y la parada, tal como la devolvió el recorrido (recortada):

```
{"stopped":true,"reason":"edge-unproven","detail":"El preflight de Tailwind (…) descartaba el atributo
`height` del logo … — su campo \"test\" (raw/compare.js — raw/CA4-mut-sin-restaurar-el-logo.txt) no nombra
ninguno de los rojos declarados: … | raw/compare.js (antes vs después, 16 pares por el gateway) — alto del
logo bajo el preflight"}
```

## Causa raíz

- `automatization/workflows/autobuild.js:1440` — `core` quita una anotación entre paréntesis sólo si está al
  final del nombre. El comentario de arriba lo decide a propósito: «una que esté en el medio se conserva,
  porque ahí sí es parte del nombre».
- `:1442` y `:1446-1449` — `sameCase` pide que **todo** tramo del borde esté entre los del rojo. Un tramo de
  más en el borde —acá, el archivo de salida— alcanza para que no coincida.
- `:1452-1459` — con un solo borde sin coincidencia, la corrida para.

## Fix propuesto

Es una propuesta. Lo de fondo es que los dos nombres no sean texto libre:

1. Que Build declare cada rojo con un identificador corto, y que cada borde cite ese identificador en vez de
   volver a escribir el nombre. La puerta compara identificadores.

Más chico, si se sigue comparando nombres:

2. Quitar la anotación entre paréntesis de **cada tramo**, no sólo del final.
3. Aceptar la coincidencia cuando el primer tramo —el archivo de la prueba— es igual y el borde no nombra
   ningún caso que el rojo contradiga.

## Tradeoffs

- La forma 3 afloja la puerta: dos casos distintos del mismo archivo pasarían por el mismo. El comentario de
  `:1439` ya advierte que un falso verde acá es un borde que entra sin prueba.
- La forma 1 cambia el esquema que devuelve Build y lo que se le pide; toca el prompt y el contrato.
- La forma 2 deshace una decisión escrita: hay nombres donde el paréntesis del medio sí es parte del nombre.

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente de 0.105.0 y coinciden, y la reproducción se corrió de nuevo con la
misma salida. No se junta con el 306: aquél está resuelto y publicado, y éste es una forma que su arreglo
no cubre.

## Cierre

**Resuelto en 0.106.0** por la forma 1: Build le pone un id corto a cada rojo y el borde lo cita en `red`. La
puerta acepta la cita o, como hasta ahora, el nombre; las reglas del nombre no se tocaron.

**Valor**: es la tercera corrida perdida por esta puerta con el caso probado, 1,97 millones de tokens la
última. **Riesgo que se tomó**: que la cita dé verde de más. No lo da respecto de lo que había: el nombre
también lo escribe Build de los dos lados, así que la puerta sigue comprobando lo mismo —que el borde apunta
a un rojo declarado con su fallo— por un dato que no tiene dos formas de escribirse.

### El recorrido de lo que este caso enumeró

- **Forma 1, identificadores — se hizo.** `id` en cada rojo y `red` en cada borde, los dos opcionales: quien
  no los traiga sigue pasando o frenando por el nombre, igual que en 0.105.0.
- **Forma 2, quitar el paréntesis de cada tramo — se decidió que no.** Deshacía una decisión escrita, y sola
  no cerraba la reproducción de este caso: al borde le sobra además un tramo —el archivo de salida— que el
  rojo no tiene.
- **Forma 3, alcanzar con el archivo — se decidió que no**: afloja la puerta.
- **Tradeoff «la forma 1 toca el prompt y el contrato» — se paga**: dos frases en el pedido de Build y dos
  campos en su esquema. Rige al reinstalar el runner.
- **«Sube a alta si aparece una cuarta» — queda sin objeto**: la comparación de texto libre ya no es el
  camino principal.

### Lo que encontró la revisión independiente

Un subagente revisó el diff sin partir de que estaba bien, con sondas sobre el arnés. De este caso: **la cita
sola dejaba pasar un borde sin prueba propia.** Un borde con `red: r1` y sin `test` llegaba al final citando
el rojo principal de la tarea, cosa que por nombre nunca pasó. Corregido: citar no exime de nombrar la
prueba del borde. Con su caso entre los que tienen que frenar y su mutación en rojo.

### Qué se corrió

- Las dos cadenas de la corrida real, en el arnés: citadas por id, la tarea sigue; sin la cita, frenan con
  `edge-unproven` como antes, que es lo que muestra que el respaldo no se aflojó. Y cuatro que tienen que
  frenar: un id que ningún rojo tiene, sin id y sin cita, dos ids vacíos, y el id de un rojo sin fallo.
- Cuatro mutaciones, cada una en rojo: dos vacíos que coinciden, el id que no cuenta, cualquier id que
  alcanza, y el pedido sin el id.
- **Corrida real del pedido de Build**, dos veces, con `claude -p` sobre una tarea cuyo dato de ejemplo
  esconde una línea sin `qty`. Las dos declararon el borde y lo citaron:

  ```
  redFirst    [{"id":"r1","test":"test/total.test.js › suma las líneas del pedido de ejemplo"},
               {"id":"r2","test":"test/total.test.js › una línea sin qty cuenta como una unidad"}]
  discovered  [{"kind":"edge","red":"r2","test":"test/total.test.js › una línea sin qty cuenta como una unidad", …}]
  ```

  El 306 lo había intentado dos veces sin conseguir que Build declarara un borde; acá salió las dos. USD 0,66.
  Lo que la corrida no tiene del recorrido real: el esquema lo impone una instrucción al final del pedido.

### Corrida real de punta a punta (2026-10-09)

Después de cerrar los casos de esta versión se corrió `/autobuild` de verdad, con el runner instalado y el
motor de la rama, sobre una instancia de prueba con dos líneas armadas con `ops line`. En `admin`, una tarea
con una condición de código, una de documento y una de comentario, de Triage a Done y al checkpoint del
hito: 12 minutos y cerca de un millón de tokens. En `auth`, una tarea cuya aceptación pedía una decisión que
nadie había tomado: paró en Ready a los 3 minutos. Se leyeron el diario de cada corrida y lo que quedó en
disco.

De este caso: Build declaró su rojo con id —`{"id":"r1","test":"test/handler.test.js › «rechaza con 403 y
cuerpo nulo…»"}`— y lo que encontró lo anotó como notas, no como borde, así que la cita no llegó a ejercerse
en esta corrida: lo que la sostiene siguen siendo las dos corridas del pedido suelto.

## Contexto de descubrimiento

Instancia `acme-ops`, corrida del 2026-10-09 sobre una tarea de interfaz. La prueba del borde era un guión
que compara capturas antes y después, no un caso de una suite, así que no tenía un nombre de `it` que los dos
lados copiaran igual. Costó 1,97 millones de tokens según el recorrido, 13 agentes y 45 minutos; se retomó
anotando en el WIP cómo nombrar la prueba.

## Relacionados

- [306](./306-edge-unproven-frena-un-caso-probado-por-como-se-escribe-su-nombre.md) — las dos formas
  anteriores de lo mismo.
- [346](./346-verify-no-tiene-vuelta-de-correccion-propia.md) — otra parada de la misma tanda por algo que
  no era el trabajo.
