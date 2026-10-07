---
caso: 310
titulo: el cierre le cree a un agente lo que check ya dice
estado: resuelto
resuelto-en: 0.103.6
prioridad: baja
version-detectada: 0.103.5
---

# 310 — Si el planning quedó válido lo contesta un agente completo, y lo que `check` avisa se tira

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: no falla nada. Es un paso que cuesta un agente entero para copiar la salida de un comando,
que decide con lo que ese agente cuenta, y que descarta información.

## Resumen

Al terminar una corrida, el recorrido corre `ops check` para saber si el planning quedó válido. Lo hace un
agente que carga todas las instrucciones del proyecto, porque si sale en rojo tiene que reparar estado
derivado, y eso es juzgar. En verde no juzga nada.

## Reproducción

Los 31 cierres de las corridas reales de la semana: 27 en bancos y 4 en una instancia real.

## Síntoma

- **Los 31 terminaron en verde. En 30 el agente corrió sus comandos y copió la salida.** En la instancia real
  fue siempre un solo comando.
- **Cuesta un agente completo**: 72.605 tokens escritos a caché en promedio en los bancos y 98.382 en la
  instancia.
- **El recorrido decide con lo que el agente dice.** Lee `passed` de su respuesta, no el resultado de `check`.
- **Los avisos se pierden.** Varias veces el agente comentó avisos que no hacen fallar a `check` —una
  aprobación que quedó sin borrar—. El recorrido descarta ese texto cuando el cierre pasa.
- **La única reparación quedó suelta.** El cierre corre después del commit de planning, así que el archivo
  reparado quedó sin commitear y lo commiteó a mano quien lo encontró.

## Causa raíz

`automatization/workflows/autobuild.js`, fase `Closing`: un solo agente, con el preámbulo de quien escribe
planning, para correr `check` y `lessons`. Su respuesta trae `passed` y `details`; `details` sólo se usa si
`passed` es falso.

`ops check --json` ya devuelve `ok`, `errors` y `warnings`.

## Fix propuesto

- Que `check` y `lessons` los corra el agente de oficina, copiando la salida del comando.
- Que el agente que carga las reglas entre sólo cuando `check` sale en rojo, con los errores a la vista.
- Que lo reparado se commitee.
- Que los avisos lleguen al registro de la corrida.

## Tradeoffs

- **El camino en rojo corre muy poco**: una vez en 31. Un camino que casi no corre se pudre sin que nadie lo
  note, así que hay que poder provocarlo.
- **Se pierde lo que el agente completo notaba de pasada.** Una vez notó que la fecha de una entrada estaba
  en UTC, y de ahí salió el caso 303. Sólo se vio porque alguien leyó el transcripto: el recorrido no lo
  entregaba.
- **El ahorro es chico**: un agente por corrida que termina. Una corrida que frena antes no llega al cierre.

## Qué podría salir mal

Escrito antes de construir, y contestado en el cierre:

1. El agente de oficina copia mal la salida de `check`.
2. El camino en rojo deja de funcionar y nadie se entera.
3. La reparación arregla de más: inventa evidencia para que `check` pase.
4. Las reglas de la empresa dejan de aplicarse a lo que el cierre escribe.
5. Los avisos de una instancia con muchos avisos fijos tapan el resto del registro.
6. Un cierre que no se puede reparar no deja rastro para una persona.

## Contexto de descubrimiento

Midiendo qué cuesta cada paso de una corrida, para ver si convenía juntar fases. La conclusión general fue
que no: la separación es lo que da el rigor. Éste es el único paso donde separar más no quita ninguna mirada.

## Relacionados

- 295 — lo que corre un comando va al agente de oficina.
- 301 y 302 — lo que redacta carga las reglas del proyecto.
- 214 — las lecciones que trae el cierre.

## Cierre

**Resuelto en 0.103.6.**

### El recorrido de lo que este caso enumeró

- **`check` y `lessons` con el agente de oficina — se hizo.** Corre `check --json` y copia `ok`, `errors` y
  `warnings`. El recorrido decide con `ok`.
- **El agente con reglas sólo en rojo — se hizo.** Recibe los errores textuales y repara. Si quedó en verde
  lo dice otra lectura del comando, hecha por quien no reparó.
- **Lo reparado se commitea — se hizo**, con `chore(planning): repair closing state`, si el proyecto commitea
  por tarea. Si no, el registro dice qué quedó tocado.
- **Los avisos al registro — se hizo**, textuales y con tope: lo que no entra queda contado.
- **Tradeoffs.** El primero se cubrió provocando el rojo en corridas reales. El segundo se paga. El tercero
  también: no se midió una corrida entera antes y después por el ahorro, que no era el motivo.

### Qué pasó con cada cosa que podía salir mal

1. **Copiar mal — no ocurrió**, en las corridas reales. Lo que decide es un solo campo, y el arnés lo fija.
2. **El rojo que se pudre — cubierto.** Se puede provocar: una entrada de una tarea anterior sembrada antes
   de lanzar. Queda en el arnés con veintiocho mutaciones.
3. **Arreglar de más — no ocurrió en el cierre.** Con una entrada sin commit, el agente que repara no lo
   inventó y dejó la entrada como estaba. Ocurrió en otro lado: abajo.
4. **Las reglas de la empresa — no aplica al verde**, donde no se escribe nada. La reparación y su commit los
   hacen agentes que las cargan.
5. **Los avisos que tapan — acotado**, con el tope del INBOX.
6. **El cierre sin rastro — era cierto, y era de antes.** Abajo.

### Lo que este caso encontró y no preveía

**Un cierre que no se puede reparar no dejaba nada en disco.** La corrida paraba con
`planning-check-failed`, y si la sesión se cerraba, el planning seguía en rojo sin que nada dijera por qué.
Lo dijo la propia sesión de la primera corrida: «la corrida no registró esto en HUMAN_ACTIONS.md». Ahora deja
una fila pendiente, commiteada, con `autobuild` en la primera columna: con el nombre del hito, `check` la
rechaza cuando ese nombre contiene el de una tarea en cola.

**La primera versión repetía lo que el caso objeta.** Después de reparar, que `check` había quedado en verde
lo decía el mismo agente que reparó. Lo marcó una revisión independiente del diff, junto con seis mutaciones
que sobrevivían: las lecciones perdidas al reparar, la parada commiteada dos veces, la fila que aceptaba el
nombre de una tarea, el proyecto que no commitea por tarea, y dos respaldos sin prueba. Las seis tienen hoy
su caso.

**Una sesión que ve el planning en rojo lo arregla sola.** En tres corridas, la entrada sembrada apareció
reparada antes de llegar al cierre. No fue el recorrido: fue la sesión principal, mientras esperaba, con un
`sed` que además le sacó una condición a la traza. Es conducta de la sesión y no de `autobuild`; para medir
el camino de reparación hubo que pedirle que no tocara nada. Queda dicho porque explica por qué en una
instancia real ese camino corre tan poco, y porque quien cierra una tarea ahora tiene escrito que la
entrada de otra no se toca.

### Qué se corrió

Corridas reales en bancos sidecar con el motor de esta rama, la misma tarea en todas, con una entrada de
«una tarea anterior» sembrada antes de lanzar:

| Qué se sembró | Cómo terminó | El cierre |
|---|---|---|
| Entrada bien y una aprobación sin borrar | Cerró la tarea | Oficina, 2 llamadas, 3.163 tokens. Registró el aviso, textual |
| Trazas de `tests` mal formadas | Cerró la tarea | Oficina vio el rojo; el agente con reglas corrigió el formato sin perder la condición de la traza; oficina volvió a leer y dio verde; se commiteó como `repair closing state`. `check` válido, árbol limpio |
| Entrada sin `commit:` | `planning-check-failed` | Oficina vio el rojo, el agente con reglas no inventó el commit, oficina volvió a leer el rojo. Fila pendiente a nombre de `autobuild` y un solo commit, `record a closing check left red`. Árbol limpio |

- **El verde, antes y después.** Antes: un agente completo, 72.605 tokens escritos a caché en promedio en 27
  cierres. Después: 3.163. El resultado de la corrida tiene la misma forma, con una línea más en el registro.
- **Veintiocho mutaciones en rojo, en una copia**, sobre el cierre corregido: el rojo dado por verde, quién
  corre cada paso, el veredicto dado por quien reparó, las lecciones de antes de reparar, la fila y su primera
  columna, la parada commiteada cero o dos veces, lo reparado sin commitear, los avisos sin tope.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un cierre con lecciones. No apareció ninguna en ningún cierre real; ese camino
  sigue probado sólo en el arnés.
