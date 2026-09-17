---
caso: 176
titulo: Una parada que registra acción humana deja el reclamo puesto sobre una tarea que acaba de bloquearse, y la corrida siguiente muere en `claim-stuck`
estado: resuelto
resuelto-en: 0.97.0
prioridad: alta
version-detectada: 0.96.0
---

# 176 — La parada se registra bien, y con eso se bloquea a sí misma la corrida siguiente

**🟢 resuelto en 0.97.0** · detectado en 0.96.0 · prioridad **alta** — las dos paradas que bloquean
una tarea antes de construirla sueltan lo que reclamaron

## Resumen

Es el mismo hueco que el caso 163 cerró para Decompose, por la otra puerta. La secuencia:

1. El recorrido reclama la tarea.
2. Para —`not-ready`, `plan-rejected`— y su fase de registro escribe una fila en `HUMAN_ACTIONS.md`
   cuya primera celda es el slug de esa tarea. Eso está bien: es lo que el protocolo pide, y desde
   0.97.0 `check` además exige que la celda sea el slug exacto.
3. **El reclamo se queda puesto.** La tarea, en cambio, pasa a estar bloqueada: la fila pendiente la
   saca de `pending` (`engine/planning/state.js:60-61`).
4. La corrida siguiente pide trabajo, `context` le ofrece **otra** tarea —la bloqueada ya no se
   ofrece— y `claim` la rechaza, porque este runner ya tiene una: `engine/cli/claims.js:42-43`.
5. Para con `claim-stuck` y la salida queda para una persona.

La corrida que para deja, sin quererlo, un estado que se bloquea a sí mismo: **el reclamo apunta a una
tarea que el propio registro acaba de sacar de la cola**. Y el mensaje del rechazo manda a exportar
`CAUCE_RUNNER`, que acá es una pista falsa: no hay dos agentes.

## Reproducción

1. Tarea `T-1` a la cabeza de la cola, sin filas humanas.
2. Correr `autobuild`. Claim reserva `T-1`.
3. Que pare en Ready o en Critique, de modo que se registre la fila de `T-1`.
4. Volver a correr `autobuild` sin tocar nada.

La segunda corrida no reintenta `T-1` —está bloqueada, y hace bien— y muere reclamando `T-2`.

## Síntoma

Verbatim, corrida `wf_30b2d949-649` del 2026-09-17:

```
este runner ya tiene integraciones-desconectar-conserva-fila. Cerrala o soltala primero; y si sos
otro agente en la misma máquina, exportá CAUCE_RUNNER con un valor propio.
```

Y el agente de Claim contestó exactamente lo que corresponde: *«soltarlo abandonaría trabajo que puede
estar a medias, y arrancar otro id deja ese reclamo huérfano — las dos son decisiones del orquestador o
de la persona, no mías»*. O sea que la fase razona bien y el estado que la traba lo produjo la corrida
anterior.

## Causa raíz

Tres piezas, ninguna equivocada por su cuenta, y es la misma forma del 163:

- **La fase que registra la acción humana no toca el reclamo.** En `automatization/workflows/autobuild.js`
  el único `release` del recorrido es el de la rama que parte una tarea —el que entró con el 163— y el
  que la fase Done le dicta a su agente. Las paradas que registran fila salen por `stop(...)` sin pasar
  por ninguno.
- **`engine/planning/state.js:60-61`**: una fila pendiente saca la tarea de `pending`, así que la
  reclamada deja de ofrecerse.
- **`engine/cli/claims.js:42-43`**: `claim` se niega a dar una segunda tarea al runner que ya tiene una.
  Está bien y es lo que evita que un id compartido construya dos cosas a la vez.

Lo que falta es una decisión sobre qué significa un reclamo cuando su tarea está bloqueada.

## Fix propuesto

Dos caminos, y la diferencia no es de estilo:

**(a) Soltar el reclamo cuando la parada bloquea la tarea.** Después de registrar la fila, el recorrido
suelta lo que reclamó: la tarea queda bloqueada y sin reservar, que es el estado honesto —nadie la está
haciendo, y no puede tomarse hasta que una persona conteste—. Es lo que hizo el 163 para la partición, y
vale para las paradas que **no** dejan trabajo en disco: `not-ready` y `plan-rejected` paran antes de
Build.

**(b) Que `claim` distinga «ya tengo una tarea» de «ya tengo una tarea bloqueada».** Un runner cuya
única tarea está bloqueada no está trabajando en nada, así que darle la siguiente no rompe BR-OPS-001 —
lo que la regla evita es construir dos cosas a la vez—. Más invasivo y afecta a todo el que use el
motor.

Recomiendo **(a)**, por el mismo argumento con que el 163 se resolvió del lado del recorrido: el estado
lo creó la corrida, y la corrida es quien sabe por qué paró. Y una precisión que el 163 ganó en su
cierre: el release **no** es determinista en el recorrido —no hay primitiva para correr un comando: `read`, `run` y
`write` son los tres un `agent(...)` (`automatization/workflows/autobuild.js:476-478` en 0.96.0), así que
cuesta un agente—, pero es un agente contra una corrida entera.

Lo que **no** hay que hacer es soltar el reclamo en una parada que dejó trabajo a medias en disco
—`verify-regression`, `qa-failed`, `commit-failed`—: ahí el WIP existe, es resumible, y el reclamo es lo
que dice de quién es ese trabajo.

## Tradeoffs

Con (a), la tarea queda sin reservar mientras espera a una persona, así que otro runner podría
reclamarla si alguien resuelve la fila mientras tanto. Eso es correcto: la fila resuelta es la señal de
que se puede volver a tomar, y quien la tome empieza de cero porque no había WIP.

## Prioridad

**Alta.** No es un caso de borde: pasa en **toda** parada anterior a Build que registre acción humana,
que son las dos más frecuentes cuando una tarea todavía se está definiendo. Y el costo es una corrida
entera por vez, en la fase más temprana, sin ninguna señal previa de que va a pasar.

## Contexto de descubrimiento

Una sola tarea de venotal —`integraciones-status-y-conteo`, después partida— consumió seis corridas y
unos 4,2 M de tokens sin commitear una línea. Dos de esas seis fueron exactamente este defecto:

| Corrida | Parada | Tokens | Qué la trabó |
|---|---|---|---|
| `wf_16a04e19-e4f` | `claim-stuck` | 369k | reclamo sobre la tarea que una fila pendiente bloqueaba |
| `wf_30b2d949-649` | `claim-stuck` | 368k | ídem, tras `plan-rejected` |

Las otras cuatro paradas fueron útiles: encontraron una reactivación silenciosa de credenciales, un
borrado obligatorio que no se cumplía, la partición en tres y la forma de la evidencia. Estas dos no
encontraron nada.

**Consultado para escribir esto**: `engine/planning/state.js` (líneas 24-30 y 52-75),
`engine/cli/claims.js` (líneas 38-45) y `automatization/workflows/autobuild.js` (las llamadas a `release`
y las salidas por `stop`) del paquete `@ingeniomaps/cauce@0.96.0` instalado en `venotal-ops/node_modules`;
la salida de `ops context planning --json` con la tarea bloqueada y reclamada; y los resultados de las
seis corridas.

## Relacionados

- **163** (resuelto en 0.95.0) — el mismo hueco para la partición. Este caso es su hermano: ahí el
  reclamo quedaba sobre una tarea borrada; acá, sobre una que se bloqueó.
- **175** (resuelto en 0.97.0) — la fila que no nombra su tarea. Es el defecto anterior en la misma
  cadena: arreglado él, las filas ahora **sí** bloquean, y eso es lo que destapa a éste.

## Cierre

**Resuelto en 0.97.0, por el camino (a) que el caso recomienda.** El diagnóstico se contrastó contra el
fuente antes de tocar nada: `engine/cli/claims.js:38-42` rechaza el reclamo con el mensaje que el caso
cita, y las dos paradas viven dentro de `if (!planning.wipActive)`, así que efectivamente ninguna deja
trabajo en disco.

Recorriendo lo que enumeró:

- **«Soltar el reclamo cuando la parada bloquea la tarea» → se hizo, en las dos.** `not-ready` y las dos
  puertas de `planRejected` —`plan-rejected` y `plan-blocked`— sueltan después de registrar la fila.
- **«Lo que no hay que hacer es soltarlo en una parada que dejó trabajo a medias» → se respetó, y se
  fijó con una prueba.** La misma prueba mide las dos mitades, porque cualquiera sola deja pasar la otra:
  sin la primera el reclamo queda sobre una tarea intomable; sin la segunda, soltar siempre abandonaría
  el WIP resumible.
- **«El release cuesta un agente» → confirmado y aceptado.** El recorrido no tiene con qué correr un
  comando: `read`, `run` y `write` son los tres `agent(...)`. Es un agente contra una corrida entera; el
  caso mide dos corridas de 369k y 368k tokens perdidas por esto.
- **«(b) que `claim` distinga "ya tengo una tarea" de "ya tengo una bloqueada"» → se decidió que no**, por
  la razón que el propio caso da: es más invasivo y afecta a todo el que use el motor, mientras que el
  estado lo creó la corrida y la corrida es quien sabe por qué paró. Queda escrito acá por si alguna vez
  aparece un caso que (a) no cubra — uno donde el reclamo lo haya puesto **otra** corrida.

Y lo que apareció arreglándolo, que el caso no preveía:

- **Una puerta pidió clasificar la coincidencia nueva antes de aceptarla.** La consigna del release nombra
  `tools/ops.js release`, y `test/wiring/runners-contract.test.js` cuenta lo que el guard de rutas se
  saltea en los recorridos. Pasó de 53 a 54 y hubo que clasificarla: es la misma familia y la misma forma
  literal que las tres anteriores —un comando que el recorrido le dicta a un agente— y quedó escrito ahí.

### Qué se corrió

- **Rojo previo** en las dos mitades: `not-ready` y `plan-blocked` no soltaban nada.
- **Mutación en las dos direcciones, las dos en rojo**: quitarle el release a `not-ready`, y agregárselo a
  `verify-failed` —que es la parada de después de construir—.
- `npm run ci` exit 0: **923 pruebas**, 0 en rojo, 0 salteadas.

### De dónde salió

Lo registró otra sesión midiendo una instancia real, con dos corridas perdidas y sus números. Se cierra
desde este repositorio, y de paso corrige un análisis mío incompleto: midiendo la primera corrida de una
prueba de punta a punta concluí que el reclamo colgado no molestaba «porque `claim` es idempotente para
el mismo runner». Es cierto para **esa** tarea y falso para la siguiente, que es justo lo que este caso
mide.
