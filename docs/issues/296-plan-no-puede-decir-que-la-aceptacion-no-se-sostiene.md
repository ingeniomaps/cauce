---
caso: 296
titulo: Plan no puede decir que la aceptación no se sostiene
estado: descartado
prioridad: media
version-detectada: 0.103.3
---

# 296 — Cuando la aceptación afirma algo falso del código, Plan planifica igual y la parada sale mal nombrada

**⚪ descartado** · detectado en 0.103.3 · prioridad **media**.

**Prioridad media**: no rompe una entrega, la encarece. La premisa falsa sobre el propio código es la
primera causa de parada en la instancia más grande que se midió, y vive en la aceptación seis veces más
que en el plan.

## Resumen

R24 pide abrir cada premisa sobre el propio código antes de usarla. Plan es la primera fase que abre el
código, y su respuesta sólo admite un plan: no tiene cómo decir «la aceptación pide algo que el sistema
no hace». Entonces planifica alrededor, y lo ataja la crítica —que frena como `plan-rejected` y manda a
revisar si la unidad hay que partirla— o, en el carril `lite`, no lo ataja nadie hasta Build.

## Reproducción

Un banco `sidecar` copiado fuera del árbol, con el motor de 0.103.3 congelado por copia y el runner de
Claude instalado. El producto es un listado de pedidos: `src/store.js` proyecta `id, customer, total,
status` y `data/orders.json` no trae ninguna fecha de entrega. La cola tiene una sola tarea:

```markdown
- [ ] **fecha-de-entrega-en-el-listado** [lite] — El listado muestra cuándo se entregó cada pedido, con la
  fecha de entrega que `loadOrders` ya devuelve en `deliveredAt`; no se toca `src/store.js` ni
  `data/orders.json`. _Aceptación: `formatOrder` agrega al texto de un pedido entregado su `deliveredAt`
  como AAAA-MM-DD, y en uno sin entregar escribe «pendiente»._ (service: app)
  (cast: backend-engineer → tech-lead)
```

La premisa es falsa y la aceptación se puede cumplir al pie con una función pura que nunca recibe el dato.
Se lanzó `/autobuild` desde una sesión real, dos veces, rehaciendo el banco entero entre una y otra.

**Qué lo desmentía**, escrito antes de correr: que en dos de tres corridas el recorrido parara antes de
Build con una fila que mande a corregir la línea de la tarea.

## Síntoma

Lo que sigue es la medición que motivó el caso. La reproducción de arriba no lo confirmó: está en el Cierre.

Las 468 filas de acciones humanas de cuatro instancias con trabajo real —460 tareas cerradas entre las
cuatro—, clasificadas por causa raíz leyendo el texto de cada fila. 89 son paradas.

| Dónde estaba la premisa falsa sobre el propio código | Filas | De ellas, paradas |
|---|---|---|
| En la aceptación o la línea de la tarea | 23 (+2 dudosas) | 16 (+1) |
| En el plan | 4 (+1 dudosa) | 2 |

Por instancia, aceptación y plan:

| Instancia | Filas | Paradas | Aceptación | Plan |
|---|---|---|---|---|
| A | 24 | 2 | 0 | 0 |
| B | 70 | 19 | 1 | 1 (+1 dudosa) |
| C | 108 | 21 | 1 (+1 dudosa) | 2 |
| D | 266 | 47 | 21 (+1 dudosa) | 1 |

Lo que las filas dicen de cómo paró:

- En la instancia C hay cinco `plan-rejected`. Ninguna se resolvió partiendo la unidad, que es lo que su
  fila pide; al menos dos se resolvieron reescribiendo la línea de la tarea.
- En la instancia B un plan citó `archivo:25` como ancla y su estrategia de prueba prescribía leer esa
  línea; el texto estaba en la 24. Es el ancla copiada que R24 nombra.
- En la instancia D, las dos paradas posteriores a R24 se frenaron en Ready, que es el lugar barato. Las
  trece anteriores salen con origen «autobuild» sin fase.

**Límites de esta medición.** La clasificación sale del texto de la fila, no del código de cada instancia;
de las 32 positivas se contrastaron 7 contra su archivo y las 7 sostienen la categoría. Las poblaciones de
antes y después de R24 no son comparables —distintas épicas, distinta mezcla de filas—, así que la baja en
D no se usa como prueba. Y lo que la crítica atajó y la corrección del plan arregló no deja fila: ese costo
no se ve desde el disco.

## Causa raíz

- `automatization/workflows/autobuild.js:161` — el schema `PLAN` exige `approach`, `steps`, `files` y
  `testStrategy`. No hay campo para lo que el planificador comprobó ni salida para «no se puede planificar
  esto».
- `automatization/workflows/autobuild.js:1117` — el pedido a Plan dice «inspeccioná el código real» y
  «producí el plan más chico que satisfaga» la aceptación. No pide contrastar lo que la aceptación afirma.
- `automatization/workflows/autobuild.js:1042` — Ready revisa que la aceptación sea concreta, sin
  dependencias ni decisiones pendientes. No abre código: lo corre el cargo de producto.
- `automatization/workflows/autobuild.js:1130` — en `lite` no hay Critique, así que entre Plan y Build no
  mira nadie.
- `automatization/workflows/autobuild.js:1006` — la fila de `plan-rejected` dice que la acción humana es
  «revisar si la unidad son dos resultados con vidas distintas y partirla». Para una premisa falsa, la
  acción es corregir la línea.

Critique y Review ya enumeran en `consulted` lo que abrieron y frenan si viene vacío. Plan es la única de
las tres que no declara nada.

## Fix propuesto

Es una propuesta; la decide la reproducción.

1. `PLAN` gana `premises`: una lista de `{ claim, source, holds }` con cada cosa que la aceptación, la
   descripción o el contexto de la épica afirman o necesitan del código —que algo existe, dónde vive, qué
   hace, cuánto hay—. Obligatorio, y vacío es válido.
2. Una puerta después de Plan y antes de Critique: una premisa con `holds: false` y `source` no vacío para
   la corrida con `not-ready`. La fila dice qué afirmaba la tarea, qué hay en esa ruta y que la acción es
   corregir la línea; el reclamo se suelta.
3. Una premisa con `holds: false` sin `source` no frena. Viaja a Critique dentro del plan, que ya lo recibe
   entero, como algo a comprobar.
4. No se escribe en el WIP ni cuenta como rechazo de plan para R17.

Decidido con el dueño el 2026-10-06: se reusa `not-ready` en vez de agregar una razón de parada, y
`PROTOCOL.md` no se toca en este caso —los runners que operan leyendo el protocolo reciben el cambio
aparte, cuando el del recorrido esté medido en uso real—.

## Tradeoffs

- **Una parada falsa interrumpe a una persona.** Si el planificador marca falsa una premisa cierta, frena
  una tarea sana, y una puerta que frena de más se termina apagando (R26). Por eso exige la ruta abierta
  para frenar, y por eso el cierre necesita una tarea de control con todas las premisas ciertas.
- **Un campo que se llena por cumplir.** Vacío es válido y no hay puerta sobre la cantidad: lo que se mide
  es si en corridas reales trae algo.
- **`express` y `directo` no pasan por Plan**, así que quedan como están.
- **No evita que la premisa se escriba.** Las filas nombran dónde nace —«lo escribió la sesión al redactar
  la tarea, sin comprobar»—, y eso es anterior al recorrido. Este cambio la ataja antes; no la previene.

## Contexto de descubrimiento

Salió de comparar Cauce con otro toolkit del mismo dominio, cuyos planes abren con una sección de hechos
verificados sobre el código. La idea de traer esa sección se midió contra las instancias antes de
construirla, y la medición la desmintió en su forma original: una lista de premisas **del plan** atacaría
2 de 89 paradas. Lo que la medición mostró en su lugar es este caso.

## Relacionados

- **081** y **278** — qué deja escrito un plan que ninguna crítica aprueba, y cómo se nombra.
- **177** — la descripción de la tarea no llegaba a Plan; es la misma familia de «lo decidido no viaja».
- **295** — el costo de cada agente del recorrido: una parada que ocurre dos fases antes ahorra agentes.

## Cierre

**Descartado: el defecto no se reproduce.** El recorrido de 0.103.3 ya ataja la premisa falsa, en Ready,
que es dos fases antes de donde este caso proponía la puerta.

Las dos corridas, sobre el banco de la Reproducción:

| Corrida | Dónde paró | Duración | Qué tocó |
|---|---|---|---|
| 1 | Ready, `not-ready` | 2 min 10 s | Sólo la fila de `HUMAN_ACTIONS.md` |
| 2 | Ready, `not-ready` | 1 min 56 s | La fila, y su commit en `work/planning` |

La fila de la corrida 1, tal como quedó:

> La línea da por cierto que `loadOrders` ya devuelve `deliveredAt`, y no es así. Verificado el 2026-10-06
> sobre `app` en `bb0e4bf`: `app/src/store.js:10` proyecta sólo `id, customer, total, status`;
> `app/data/orders.json` no tiene ningún `deliveredAt` (sólo `createdAt`) […] Con `store.js` y
> `orders.json` fuera de alcance, `formatOrder` puede cumplir la aceptación al pie y el listado real
> mostraría «pendiente» en los tres pedidos, también en los dos entregados. Decidir de dónde sale la fecha
> de entrega […]

Ni código, ni cola, ni reclamo, ni WIP: `git status` del producto quedó limpio en las dos. La corrida 1
gastó 31 llamadas y 1,85 millones de tokens, 1,48 de ellos leídos de caché. La tercera no se corrió: con
dos de dos el criterio escrito ya estaba contestado, y repetir cuesta lo mismo sin agregar nada (R20).

### Por qué la medición decía otra cosa

No se contradicen. De las 16 paradas por una premisa falsa en la aceptación, 13 son de la instancia D y
anteriores a R24, que entró en 0.94.0 y desde entonces viaja en las reglas que carga cada agente. Las dos
de D posteriores a R24 pararon en Ready, igual que el banco. La sección Síntoma advertía que las dos
poblaciones no eran comparables; lo eran menos de lo que el caso supuso.

### El recorrido de lo que este caso enumeró

- **Fix 1, `premises` en el plan — no se hace.** Ready ya contrasta la premisa y deja la fila correcta.
  El campo sumaría un pedido a cada plan para atajar más tarde lo que hoy se ataja antes.
- **Fix 2, la puerta después de Plan — no se hace**, por lo mismo.
- **Fix 3 y 4 — sin objeto**: dependían de los dos anteriores.
- **Causa raíz «Ready no abre código» — falsa.** Su pedido no lo exige, y en las dos corridas lo abrió
  igual y citó la línea.
- **Causa raíz «en `lite` no hay Critique» — cierta y no llegó a importar**: la tarea era `lite` y paró
  antes.
- **Causa raíz «la fila de `plan-rejected` manda a partir» — cierta, y no se probó acá.** El banco nunca
  llegó a Critique. Queda como observación de la instancia C: cinco filas así, ninguna resuelta partiendo.
  No sale como caso propio porque no hay una reproducción que lo sostenga.
- **Tradeoffs — sin objeto**, salvo el último: la premisa se sigue escribiendo al redactar la tarea, que
  es anterior al recorrido.

### Lo que este cierre no prueba

Un solo banco, con una premisa **explícita** —la línea dice «ya devuelve»— sobre un producto de cuatro
archivos. No se midió una premisa implícita, donde la aceptación exige un dato sin afirmar que existe, ni
un servicio grande donde encontrarla cueste más de una lectura. Seis de las 23 filas eran de esa clase.
Si reaparece en una instancia con 0.103.3 o posterior, eso es un caso nuevo, con su fila como reproducción.

### Lo que apareció de paso

El informe final de la corrida 2 decía que la fila quedaba sin commitear y en el disco estaba commiteada
(`chore(planning): block …` en `work/planning`). Lo notó la sesión que la lanzó y lo dijo. No se
investigó.
