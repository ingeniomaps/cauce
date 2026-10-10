---
caso: 349
titulo: La fila que escribe una parada puede no bloquear nada y la comprobación dice que sí
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 349 — Una parada escribe en `HUMAN_ACTIONS.md` una fila cuya primera columna no es el slug solo: `check` la rechaza, no bloquea nada, y la comprobación del recorrido contesta que quedó pendiente

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: la corrida deja commiteado un estado que el propio `check` rechaza, y la fila que debía
frenar la tarea no la frena, así que la corrida siguiente la vuelve a ofrecer.

## Resumen

Cuando Ready dice que una tarea no está lista, el recorrido registra una fila y después comprueba que haya
quedado pendiente. En una corrida real la fila salió con la tarea, la épica y la decisión juntas en la
primera columna. Tres piezas del motor dijeron tres cosas distintas sobre esa misma fila:

1. `readHumanActions` la leyó con `task` igual al texto entero de la columna, no al slug.
2. `check` la rechazó: «nombra a … y no bloquea nada, porque el motor bloquea por la primera columna exacta».
3. La comprobación `human-row` contestó `{"readOk": true, "pending": true}`, así que la parada no avisó nada.

## Reproducción

No se reprodujo desde un directorio vacío: la fila la escribe un modelo. Con un `HUMAN_ACTIONS.md` cuya
primera fila sea la de abajo, las dos primeras piezas se reproducen sin modelo:

```bash
node -e "console.log(require('<cauce>/engine/planning/parser.js').readHumanActions('planning')[0].task)"
node tools/ops.js check planning
```

## Síntoma

La fila, tal como la commiteó la corrida (recortada):

```
| `instalar-el-design-system-y-su-css` (épica 024, `frontend-auth`) — **Decidir cómo carga `frontend-auth`
el CSS del sistema, dado que el `index.css` de `@acme/design-system@0.1.1` sale roto al publicarse** |
pendiente | Revisión de lista para construir (autobuild), 2026-10-08 | …
```

Lo que devolvió la comprobación, leído del registro del agente `human-row`:

```
{"readOk": true, "pending": true}
```

Y `check`, en la sesión siguiente:

```
✗ HUMAN_ACTIONS: la fila "`instalar-el-design-system-y-su-css` (épica 024, `frontend-auth`) — **Decidir cómo
carga …**" nombra a instalar-el-design-system-y-su-css y no bloquea nada, porque el motor bloquea por la
primera columna exacta. Dejá "instalar-el-design-system-y-su-css" sola ahí y contá el resto en la acción
```

## Causa raíz

- `automatization/workflows/autobuild.js:1132-1134` — el pedido es «Registrá `<tarea>` en `HUMAN_ACTIONS.md`
  con el motivo y una acción humana exacta». No dice que la primera columna lleva el slug solo. Quien escribe
  imita las filas que ya hay, y en una instancia con filas viejas de título largo, copia esa forma.
- `automatization/workflows/autobuild.js:723-727` — la comprobación le pide a un agente que mire el JSON de
  `context` y ponga `pending` en `true` «sólo si humanActions trae una fila cuya task sea `<slug>`». Es una
  igualdad, y la juzga un modelo: ante una `task` que contiene el slug, contestó que sí.
- `engine/planning/contracts.js:442-457` — `check` sí hace la comparación exacta, pero corre después.

## Fix propuesto

Es una propuesta.

1. Que el pedido de `registerHuman` diga la forma: primera columna, el slug solo; el resto, en la acción.
2. Que la comprobación no la juzgue un modelo: que el comando devuelva la respuesta —por ejemplo
   `ops context --blocks <slug>` con código de salida— y el agente sólo la transcriba.
3. Si la fila no bloquea, que la parada lo diga y no la commitee en esa forma.

## Tradeoffs

- La forma 2 agrega una bandera al CLI por una sola comprobación.
- Con la forma 1 sola, la fila depende otra vez de que un modelo siga una instrucción; por eso van juntas.

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente de 0.105.0 y coinciden. La primera pieza se corrió con una fila de
la misma forma, y devolvió además algo que el enunciado no decía:

```
{"task":"`mi-tarea` (épica 024, `front`) — **Decidir algo**","state":"pendiente", … ,"valid":true,"resolved":false}
```

- **La fila sale `valid: true`.** Para el lector de la tabla es una fila bien formada y pendiente; por eso
  aparece en `humanActions` de `context` como cualquier otra, y es lo que el agente de `human-row` tenía
  delante cuando contestó que sí. Lo único que la distingue de una fila que bloquea es la igualdad con el
  slug, que es justo lo que se le pidió juzgar a un modelo.

## Cierre

**Resuelto en 0.106.0.** La igualdad entre la fila y la tarea dejó de juzgarla un modelo: el agente que relee
transcribe la primera columna de cada fila pendiente y la comparación la hace el recorrido. Si una celda
menciona a la tarea sin ser su slug, se manda a corregir una vez y se relee; si sigue igual, la parada lo
dice con la celda que quedó.

**Valor**: una parada que no bloquea vuelve a ofrecer la tarea en la corrida siguiente, y deja commiteado un
estado que `check` rechaza. **Riesgo que se tomó**: cambiar quién compara es una quita —R9—, así que la
conducta anterior (avisar cuando la fila quedó resuelta, callar cuando quedó bien) se comparó caso por caso
en las pruebas que ya había, y la corrección nueva escribe en `HUMAN_ACTIONS.md` una segunda vez.

### El recorrido de lo que este caso enumeró

- **Fix 1, que el pedido diga la forma — se hizo**: «En la primera columna va `<slug>` solo, sin formato ni
  nada más». Va sólo en las paradas que registran la propia tarea; las filas de decisiones abiertas, que no
  la nombran a propósito, quedan como estaban.
- **Fix 2, que la comprobación no la juzgue un modelo — se hizo distinto.** No hizo falta la bandera
  `--blocks` en el CLI: `context --json` ya trae las filas, el agente copia el campo `task` de cada una
  «entero y tal cual» y la igualdad es un `includes` en el recorrido. El esquema pasó de `pending` a `tasks`.
- **Fix 3, que la parada lo diga y no la commitee en esa forma — se hizo distinto.** Lo dice, y antes intenta
  corregirla una vez. Se commitea igual: no commitear dejaba la instancia sucia, que es el caso 279.
- **Tradeoff «una bandera por una sola comprobación» — no se paga**: no hay bandera.
- **Tradeoff «con la forma 1 sola depende de un modelo» — van juntas**, y la que sostiene es la 2.
- **Causa raíz, «`check` corre después» — sigue así**; ahora el recorrido llega a la misma conclusión antes.
- **Lo que el caso no preveía**: la búsqueda de «la celda que menciona al slug» tiene que mirar el slug
  entero. Sin eso, la fila de `T-10` se tomaba por una fila mal escrita de `T-1` y se mandaba a reescribir.

### Lo que encontró la revisión independiente

Un subagente revisó el diff sin partir de que estaba bien, con sondas sobre el arnés. De este caso, dos cosas, las
dos corregidas con su prueba y su mutación en rojo:

- **La corrección alcanzaba filas ajenas.** Buscaba el slug delimitado por caracteres que no fueran de slug,
  y un slug admite casi cualquiera: con la tarea `T-1`, la fila de `T-1.1` se mandaba a reescribir, y
  también una fila vieja que nombrara a `T-1` en el medio. Ahora sólo se corrige la celda que **empieza**
  por el slug —envuelto en formato o seguido del motivo—, que es la forma de la corrida real.
- **Si la relectura después de corregir no se podía leer, la parada afirmaba que la fila no bloqueaba.**
  Ahora dice que no se pudo comprobar, igual que la primera lectura.

### Qué se corrió

Un banco con una tarea en cola y dos filas viejas de título largo en la tabla, y los pedidos tal como los
arma el recorrido, antes y después, corridos con `claude -p` sobre el motor congelado. Dieciocho corridas,
USD 2,94. Seis no cuentan: el arnés rendía la raíz como `.` y el pedido salía «desde ..»; se repitieron con
la ruta real, y son las de abajo.

```
relectura, pedido viejo, 3 corridas   {"pending": true, "readOk": true}   ← la fila no bloqueaba
relectura, pedido nuevo, 3 corridas   {"tasks": ["`tarea-medida` (hito medicion, `app`) — **Decidir …**"], "readOk": true}
corrección, 2 corridas                task = "tarea-medida" | bloquea: true   ·   ✓ planning válido
```

El pedido viejo reprodujo el defecto las tres veces, y en una el agente lo vio y contestó igual que sí: «El
campo `task` de esa fila no es el slug…». Con el nuevo, la celda llegó entera las tres y la comparación del
recorrido da que no bloquea. Después de la corrección, `ops check` pasa y la primera columna es el slug.

**Lo que no se pudo reproducir**: la escritura mal formada. Con el pedido viejo, y con las filas viejas a la
vista, el agente escribió el slug solo las tres veces; con el nuevo, también. O sea que el fix 1 no tiene
medición a favor ni en contra, y lo que cierra el caso es el fix 2.

- Rojo y mutaciones en `test/workflows/autobuild-human-row.test.js`, cinco, cada una con su prueba en rojo:
  contención en vez de igualdad, sin el borde del slug, sin la forma en el pedido, sin releer después de
  corregir, y sin la corrección.
- Regresión: `autobuild-review.test.js` sigue fijando que una fila resuelta o ilegible se avisa.

### Corrida real de punta a punta (2026-10-09)

Después de cerrar los casos de esta versión se corrió `/autobuild` de verdad, con el runner instalado y el
motor de la rama, sobre una instancia de prueba con dos líneas armadas con `ops line`. En `admin`, una tarea
con una condición de código, una de documento y una de comentario, de Triage a Done y al checkpoint del
hito: 12 minutos y cerca de un millón de tokens. En `auth`, una tarea cuya aceptación pedía una decisión que
nadie había tomado: paró en Ready a los 3 minutos. Se leyeron el diario de cada corrida y lo que quedó en
disco.

De este caso: en `auth`, la parada de Ready dejó la acción con `task: limite-por-cliente` solo, la
relectura devolvió `{"readOk":true,"tasks":["limite-por-cliente"]}` y el recorrido la dio por buena con su
propia comparación; soltó el reclamo, commiteó la parada y `ops context` quedó en `blocked-on-human`.

## Contexto de descubrimiento

Instancia `acme-ops`, corrida del 2026-10-08 que paró con `not-ready` en `instalar-el-design-system-y-su-css`.
La parada era correcta. El `check` en rojo apareció en el guard de cierre de la sesión que la lanzó, y hubo
que corregir la fila a mano y commitear de nuevo. El agente que la escribió corrió el chequeo propio de la
instancia, que salió en 0, y no `ops check`.

## Relacionados

- [175](./175-una-fila-de-acciones-humanas-que-no-nombra-su-tarea-no-bloquea-nada.md) — la regla de `check`
  que este caso ve incumplida por el propio recorrido.
- [310](./310-el-cierre-le-cree-a-un-agente-lo-que-check-ya-dice.md) — la misma clase: un agente contesta lo
  que un comando ya sabe.
- [347](./347-el-checkpoint-y-las-acciones-humanas-son-un-archivo-por-instancia-y-dos-lineas-chocan.md)
  — si la fila fuera un archivo con el slug por nombre, esta clave no dependería de una columna. Este caso
  va antes y no lo espera: se arregla sin mover la tabla.
