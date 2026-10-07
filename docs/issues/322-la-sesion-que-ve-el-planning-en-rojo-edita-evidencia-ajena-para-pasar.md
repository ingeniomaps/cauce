---
caso: 322
titulo: la sesión que ve el planning en rojo edita evidencia ajena para pasar
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 322 — Al frenarla el guard de planning, la sesión «arregló» la entrada de otra tarea y le sacó contenido

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: no es el recorrido, es la sesión; pero el mensaje que la empuja a hacerlo es nuestro.

## Resumen

Al cerrar un turno, el guard de planning corre `check` y, si sale en rojo, frena con su salida. La sesión lo
lee como algo a resolver ya. En tres corridas en banco editó por su cuenta la entrada de `done/` de otra
tarea.

## Reproducción

Banco con una entrada de una tarea anterior con la traza de `tests` mal formada. La sesión principal, mientras
esperaba al recorrido:

```
sed -i "s|^  tests: A (devuelve 1) → |  tests: A → |" planning/done/tarea-vieja.md
```

Sacó «(devuelve 1)», que era la condición que la traza cubría. `check` quedó en verde. El agente del cierre,
ante el mismo error, la había movido al final sin perderla.

## Causa raíz

`engine/hooks/run.js:44`: «Planning o integraciones quedaron desalineados:» y la salida de `check`. No dice
qué se puede tocar y qué no. Lo que el recorrido le dice a su agente de reparación —sólo estado derivado,
nunca reescribir evidencia— la sesión no lo recibe.

## Fix propuesto

- Que el mensaje del guard diga lo mismo que el prompt de reparación: qué es reparable y que la evidencia de
  una tarea cerrada no se edita para pasar.
- Que nombre la salida para lo que no es reparable: dejarlo anotado para una persona.

## Por qué hacerlo

Es la única palanca que Cauce tiene sobre la sesión principal: el texto con que la frena.

## Riesgos y regresiones

- **Un mensaje no obliga.** Puede no cambiar nada, y no hay forma de garantizarlo.
- **Un mensaje más largo en cada freno** de ese guard.
- **Regresión**: ninguna en el comportamiento del guard; sólo cambia el texto.

## Qué habría que probar

- Sesión real con el planning en rojo por una entrada ajena, antes y después: qué hace.
- Con un error que no es reparable: que no invente.

## Recomendación

**Hacerlo.** Cuesta un párrafo y es medible en una sesión real. Si no cambia la conducta, se dice y se deja.

## Relacionados

- 310.
