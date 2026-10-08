---
caso: 320
titulo: una reparación del cierre que muere deja lo tocado sin commitear
estado: descartado
prioridad: baja
version-detectada: 0.103.5
---

# 320 — Si el agente que repara el cierre no contesta, la corrida frena sin decir qué alcanzó a tocar

**⚪ descartado** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: necesita dos cosas raras a la vez: un cierre en rojo y un agente que muere a mitad.

## Resumen

Cuando `check` sale en rojo al cerrar, un agente repara. Si ese agente no devuelve respuesta, la corrida para
con `agent-unavailable`. Lo que haya editado antes de morir queda en el árbol, sin commit y sin que el
mensaje lo nombre.

## Reproducción

No se reprodujo en una corrida: se leyó en el código. En 35 cierres reales hubo dos reparaciones y ninguna
murió.

## Causa raíz

`automatization/workflows/autobuild.js`, fase `Closing`: los dos `halt('agent-unavailable')` no commitean ni
miran el árbol.

## Fix propuesto

- Antes de frenar, que el agente de oficina corra `git status` sobre planning y la parada diga qué quedó
  tocado.
- No commitearlo solo: una edición a medias no es un estado que valga la pena fijar.

## Por qué hacerlo

Para que la persona que llega a esa parada sepa que hay algo suelto.

## Riesgos y regresiones

- **Es código en un camino que no se puede provocar en real**: no hay forma de matar un agente a mitad de una
  edición en un banco. Quedaría probado sólo en el arnés, que es lo que esta semana enseñó a no dar por bueno.
- Agrega una llamada a una parada que ya es de error.

## Cierre

**Descartado.** Lo decidió el dueño el 2026-10-07, con la recomendación de no hacerlo.

- **Se decidió que no**, porque necesita dos cosas raras a la vez —un cierre en rojo y un agente que muere a mitad— y el arreglo sería código en un camino que no se puede provocar en una corrida real. El guard de planning al cerrar el turno ya muestra un árbol sucio.
- **Cuándo reabrirlo**: si llega a verse fallar una vez.
- **Qué se corrió**: nada nuevo: se leyó el código de la fase `Closing`. En 35 cierres reales hubo dos reparaciones y ninguna murió.

## Relacionados

- 310.
