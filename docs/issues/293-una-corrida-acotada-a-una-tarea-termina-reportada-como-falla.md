---
caso: 293
titulo: una corrida acotada a una tarea termina reportada como falla
estado: resuelto
resuelto-en: 0.103.3
prioridad: media
version-detectada: 0.103.2
---

# 293 — «Sólo esta tarea; al cerrarla, parar» cierra la tarea y sale con `claim-stuck`

**🟢 resuelto en 0.103.3** · detectado en 0.103.2 · prioridad **media**.

**Prioridad media**: el trabajo queda bien hecho y la corrida se lee como un error. Gasta tres agentes en
intentar la tarea siguiente y deja a la persona averiguando qué falló, cuando no falló nada.

## Resumen

`autobuild` construye el hito entero: al cerrar una tarea toma la que sigue. No tiene forma de saber que se
le pidió una sola. El pedido de quien lanza llega a las fases como texto, y el agente que iba a reclamar la
tarea siguiente lo leyó y se negó. Para el recorrido una negativa es un reclamo que falló sobre el mismo
slug, que es exactamente `claim-stuck`.

## Reproducción

Corrida real con 0.103.2, lanzada con:

```
/autobuild Sólo la tarea api-decision-con-resumen; al cerrarla, parar. Sin push ni PR.
```

## Síntoma

La tarea cerró con su commit y su estado de planning. Después el recorrido intentó la siguiente, el agente
del reclamo citó el pedido textual y no la tomó, y la corrida terminó en `claim-stuck`. La sesión lo reportó
así: «el script no sabe parar después de una tarea: intenta la siguiente, el agente se niega y sale con
claim-stuck. Gastó tres agentes en eso y el resultado se lee como error aunque todo salió bien».

## Causa raíz

`automatization/workflows/autobuild.js`: el único tope del bucle es `MAX_TASKS`, de 50. Y el esquema del
reclamo tiene dos salidas —`claimed` sí o no—, así que negarse a pedido de la persona no se distingue de un
comando que falló.

## Fix propuesto

- Un tope que el recorrido pueda contar sin interpretar el pedido.
- Que el reclamo pueda decir que no la tomó a pedido, y que eso termine la corrida como cuando se queda sin
  tareas.

## Tradeoffs

- El tope hay que escribirlo como bandera. Dicho con palabras lo sigue entendiendo sólo un agente, y por eso
  hacen falta las dos cosas.
- Un agente puede declinar un reclamo que no debía. La corrida termina antes y lo dice, que es un error
  barato: se relanza.

## Contexto de descubrimiento

La primera corrida real con 0.103.2.

## Relacionados

- 071 — `claim-stuck`: un reclamo que falla sobre el mismo slug no se repite.
- 252 — lo que se pide al lanzar llega a las fases.
- 292 — el pedido va en el mensaje que lanza la corrida.

## Cierre

**Resuelto en 0.103.3.**

### El recorrido de lo que este caso enumeró

- **El tope — se hizo.** `--max N` en el texto del pedido, o `max` cuando los argumentos son un objeto. La
  bandera se saca del pedido antes de mandarlo a las fases. Al llegar al tope el recorrido no reclama la
  siguiente: dice cuál era y cierra como siempre.
- **El reclamo que declina — se hizo.** Tiene una tercera salida, `declined`, y al recorrido le alcanza con
  ella: no lee el pedido, lo lee el agente.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **La forma de la corrida real, en el arnés**: con dos tareas en cola y el reclamo de la segunda declinado
  con la frase del pedido, la corrida termina con la primera cerrada y sin `stopped`. Antes de este cambio el
  esquema no tenía cómo decirlo.
- **El tope**, con las tres formas de pedirlo: cierra una, no llega a reclamar la segunda, y el pedido que
  ven las fases no trae la bandera.
- **Seis mutaciones en rojo**, en una copia.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una corrida real donde un agente decline el reclamo. La de `--max 1` se corrió
  después, abajo.

### Corrida real con `--max 1`, el 2026-10-06

Banco sidecar con dos tareas en cola, sesión real lanzada con `/autobuild --max 1 sin push ni PR`. Cerró la
primera, anotó «la corrida cerró las 1 tarea(s) que se le pidieron: sigue retirar-prueba-legada, sin
tomarla», no reclamó la segunda y terminó por la fase de cierre, sin `stopped`. Dieciocho agentes.

Esa corrida encontró un defecto de este mismo arreglo: al terminar por el tope escribía igual la compuerta
del hito, `AWAITING_REVIEW.md`, con «hito terminado» y una tarea suya todavía en cola, y la corrida
siguiente quedaba frenada hasta destrabarla a mano. Ahora la compuerta se escribe sólo cuando el hito
terminó; cortada por el tope o por un reclamo declinado, no. Tiene su prueba y su mutación en rojo.
