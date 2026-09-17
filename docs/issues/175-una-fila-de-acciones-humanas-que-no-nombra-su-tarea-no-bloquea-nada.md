---
caso: 175
titulo: Una fila de `HUMAN_ACTIONS.md` cuya primera celda no es exactamente el slug no bloquea nada, y nada lo dice
estado: resuelto
resuelto-en: 0.97.0
prioridad: alta
version-detectada: 0.96.0
---

# 175 — La fila se escribe, `context` la muestra, y la tarea se sigue ofreciendo

**🟢 resuelto en 0.97.0** · detectado en 0.96.0 · prioridad **alta** — `check` rechaza la fila que
nombra a su tarea sin ser su slug, que es la mitad que el propio caso llama «la que importa»

## Resumen

`pendingHumanActions` devuelve `row.task` y `select` arma su conjunto de bloqueados con eso
(`engine/planning/state.js:26-28` y `:61`). `row.task` es `cells[0]` verbatim
(`engine/planning/parser.js:350`), así que el bloqueo existe sólo si la primera celda es **exactamente**
el slug de la tarea.

Cualquier otra forma de escribirla —y la que sale natural es `**slug: de qué se trata**`, porque una
tabla de acciones humanas la lee una persona— produce una fila que:

- se escribe sin error,
- aparece en la salida de `ops context` bajo `HUMAN`, así que parece registrada,
- no entra en `blocked`, así que **la tarea se sigue ofreciendo como la próxima**,
- y no la reporta `check`, porque nadie compara la primera celda contra la cola ni contra DONE.

El protocolo dice «mientras la fila no esté resuelta, su tarea no se toma». Con la celda mal escrita eso
no pasa y no hay señal de que no esté pasando.

## Reproducción

1. Una tarea `T-1` en la cola.
2. En `HUMAN_ACTIONS.md`, una fila `| **T-1: falta la credencial** | pendiente | T-1 2026-09-16 | … |`.
3. `ops context planning` → `TASK T-1`, con su propia fila listada más abajo como `HUMAN`.
4. `ops check planning` → verde.

Con `| T-1 | pendiente | … |`, la misma cola ofrece la tarea siguiente.

## Síntoma

Medido en la instancia de venotal el 2026-09-16, con 0.96.0. El recorrido paró en Ready con
`not-ready` y su fase de registro escribió cinco filas, una por decisión. Todas con la forma
`**integraciones-status-y-conteo: para qué es el «conteo …»**`.

Después de escribirlas, `ops context planning` seguía contestando:

```
TASK   integraciones-status-y-conteo [full]  service: platform  hito: plataforma-en-su-dominio
CLAIM  tuya desde el reclamo (malpisa1@gmail.com)
```

O sea que la corrida siguiente habría vuelto a elegir la misma tarea y a pagar Ready para llegar al
mismo `not-ready`: **537.412 tokens y cinco agentes**, que es lo que costó la primera vez. Corrigiendo
las cinco celdas a `integraciones-status-y-conteo`, la cola pasó a ofrecer la tarea siguiente.

En el mismo archivo había **seis filas pendientes más** con la misma forma, todas de tareas que esperan
una credencial o un token del operador. Ninguna bloqueaba nada desde que se escribió.

## Causa raíz

- **`engine/planning/parser.js:350`**: `task: cells[0]`. La celda viaja tal cual, con sus asteriscos y
  con lo que venga después de los dos puntos.
- **`engine/planning/state.js:26-28`**: `pendingHumanActions` mapea `row.task` sin normalizar.
- **`engine/planning/state.js:61`**: `pending` filtra `!blocked.has(task.slug)`, comparación exacta
  contra el slug del BACKLOG.

Ninguna de las tres está mal por su cuenta; lo que falta es que alguien note que una fila no
corresponde a ninguna tarea. El contrato del protocolo es claro —la primera celda es la tarea— y
justamente por eso el error no se ve: el archivo se lee perfecto, porque lo que dice es cierto.

## Fix propuesto

Dos mitades, y la segunda es la que importa.

**Normalizar al leer**, para que la forma que sale natural funcione:

```js
// La primera celda la escribe una persona y la lee una persona, así que llega como
// `**slug: de qué se trata**`. El bloqueo compara contra el slug del BACKLOG, así que lo que se
// guarda es el slug y no la celda.
const slugOf = (cell) => String(cell).replace(/\*/g, '').trim().split(':')[0].trim()
```

**Y avisar desde `check` cuando una fila no corresponde a ninguna tarea**, que es la mitad sin la cual
esto vuelve con otra cara: un slug mal tipeado, una tarea renombrada, una fila de una tarea que ya
cerró. Es exactamente lo que R15 llama una ausencia sin rastro, y el aviso es una comparación contra
dos conjuntos que `check` ya tiene en la mano.

Normalizar sin avisar deja pasar el caso que más va a doler, porque el que escribe cree que registró.

## Tradeoffs

Cortar en el primer `:` rompería una fila cuya tarea tuviera dos puntos en el slug, y no puede: un slug
es `[a-z0-9-]+`. Lo que sí cambia es que filas que hoy no bloquean empiecen a bloquear, y eso es el
arreglo, no un efecto: son tareas que esperan a una persona. Conviene que la entrada del CHANGELOG lo
diga, porque la primera corrida después de actualizar puede ofrecer otra tarea que la de ayer.

## Prioridad

**Alta.** No es un aviso que falta: es el mecanismo central del gate humano, que no corre. Y su costo se
paga en la moneda más cara —una corrida entera que vuelve a elegir lo que ya estaba bloqueado—, sin
ninguna señal de que eso está pasando. En la instancia donde apareció, once filas pendientes bloqueaban
cero tareas.

## Contexto de descubrimiento

Corrida `wf_e07f1482-56c`, venotal (sidecar), 2026-09-16, Cauce 0.96.0. Ready paró bien y la parada fue
útil: tres decisiones del operador y cuatro condiciones de aceptación que darían verde estando mal. El
defecto apareció al comprobar, después de la parada, si la cola había dejado de ofrecer la tarea — y no.

**Consultado para escribir esto**: `engine/planning/parser.js` (líneas 342-356) y
`engine/planning/state.js` (líneas 24-30 y 52-75) del paquete `@ingeniomaps/cauce@0.96.0` instalado en
`venotal-ops/node_modules`; `planning/PROTOCOL.md` de la instancia, sección Contratos, fila «Acción
humana»; y la salida de `ops context planning` y `ops check planning` antes y después de corregir las
cinco celdas.

## Relacionados

- **042** y **043** — los otros dos defectos de esta misma tabla: cómo se parte por el pipe y cómo se
  saltea su cabecera.
- **157** y **168** — la misma forma de fallar en otra superficie: algo que el proyecto escribió no llega
  al mecanismo, la salida se lee igual de completa y nada lo dice.

## Cierre

**Resuelto en 0.97.0.** El caso estaba bien diagnosticado y se reprodujo antes de tocar nada, sobre un
banco desechable: la fila `| **tarea-medida: falta la credencial** | pendiente | … |` escrita, `ops context`
ofreciendo la tarea igual, y `ops check` en verde. Después del arreglo, sobre la misma fila, `check` sale
con **exit 1** nombrando la fila y el slug al que apuntaba.

Recorriendo lo que el caso enumeró:

- **«Avisar desde `check` cuando una fila no corresponde a ninguna tarea» → se hizo, acotado.** Lo que
  `check` rechaza es la fila que **menciona** una tarea de la cola sin ser su slug, que es la forma que el
  caso midió once veces. No rechaza una celda que no nombra nada, y no puede: el molde manda escribir ahí
  la épica, el recorrido o `—` cuando el bloqueo existe antes que la tarea, así que «no corresponde a
  ninguna tarea» es una forma legítima y no un error.
- **«Normalizar al leer» → se decidió que no, y la razón es del propio caso.** Él mismo escribe que
  «normalizar sin avisar deja pasar el caso que más va a doler», y las dos mitades juntas se estorban: con
  la celda normalizada, `check` deja de poder distinguir una referencia a una tarea de una celda libre
  deliberada, y el aviso —la mitad que el caso llama la que importa— se vuelve imposible de escribir con
  precisión. Con el rechazo puesto, la forma natural se corrige en el momento en que se escribe, que es
  antes de que cueste una corrida. La celda sigue siendo la clave, exacta.
- **«Filas que hoy no bloquean empiecen a bloquear; conviene que el CHANGELOG lo diga» → cambió de
  sentido con la decisión de arriba.** Nada empieza a bloquear solo: lo que pasa es que `check` empieza a
  rechazar, y la entrada de 0.97.0 lo dice con esas palabras —qué rechaza y cómo se corrige—.

Y lo que apareció y el caso no preveía:

- **La otra cara del mismo acoplamiento.** El 175 es la fila que **no** bloquea porque la celda no es
  exactamente el slug. En una corrida real de `autobuild` sobre un banco apareció la inversa: la fase que
  registra las decisiones que un build deja abiertas escribió una fila cuya primera celda **era** el slug
  de la tarea en construcción, y la bloqueó — registrando «esto no impide entregar» y produciendo el
  bloqueo igual. No se ve mientras la corrida vive, porque el WIP activo manda sobre la acción humana;
  aparece cuando el WIP cierra. **Se arregló en el mismo cambio**, en el prompt de esa fase: la primera
  columna nombra la épica, el hito o el recorrido, nunca la tarea. La atrapó la fase Review de la propia
  corrida, tres fases después de escribirse.

### Límite declarado

Un slug mal tipeado —`tarea-medda`— o el de una tarea renombrada siguen sin detectarse, y no es un olvido:
desde el archivo son indistinguibles de un recorrido propio nombrado en esa celda, que el molde permite.
Cerrar eso pediría decidir que la primera columna es vocabulario cerrado, que es otra decisión y cambia el
contrato que el molde documenta.

### Qué se corrió

- **La reproducción del caso**, antes y después, sobre un banco `ops bench tarea`: antes `check` exit 0 con
  la tarea ofrecida; después `check` exit 1 con el mensaje que nombra la fila y el slug.
- **Las dos formas legítimas siguen pasando**, comprobadas en el mismo banco: el slug exacto —que además
  hace que `context` imprima `BLOCKED blocked-on-human`— y `hito medicion`, los dos exit 0.
- **Rojo previo** en las dos pruebas nuevas, y **mutación en las dos direcciones**: apagando la búsqueda,
  la fila que casi nombra deja de marcarse; quitando la exención del slug exacto, se marca la fila que sí
  bloquea. Las dos en rojo.
- `npm run ci` exit 0: **917 pruebas**, 0 en rojo, 0 salteadas.

### De dónde salió

Lo registró otra sesión midiendo una instancia real. Se cerró desde el banco desechable de una prueba de
punta a punta del recorrido, que además encontró su reverso.
