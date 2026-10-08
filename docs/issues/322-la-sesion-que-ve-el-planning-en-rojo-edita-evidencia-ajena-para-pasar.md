---
caso: 322
titulo: la sesión que ve el planning en rojo edita evidencia ajena para pasar
estado: resuelto
resuelto-en: 0.103.6
prioridad: media
version-detectada: 0.103.5
---

# 322 — Al frenarla el guard de planning, la sesión «arregló» la entrada de otra tarea y le sacó contenido

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **media**.

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

## Cierre

**Resuelto en 0.103.6.**

### El recorrido de lo que este caso enumeró

- **Que el mensaje diga qué es reparable y que la evidencia no se edita para pasar — se hizo.** Con el mismo
  criterio con que el recorrido repara al cerrar: sólo lo que se deduce de otra cosa. Y una frase que aquel
  no trae y acá hizo falta: lo que no entra en el formato se mueve dentro de la entrada, no se borra.
- **Que nombre la salida para lo que no es reparable — se hizo**: decírselo a la persona, o anotarlo en
  `HUMAN_ACTIONS.md`, nombrado con su ruta entera porque en sidecar la sesión no está parada en la instancia.
- **«Un mensaje no obliga» — se midió**, abajo: esta vez cambió la conducta.
- **«Un mensaje más largo en cada freno» — se acotó.** Sale sólo cuando el rojo es de una entrada de `done/`.
  La primera versión lo agregaba a todo rojo de `check`, y la revisión mostró que en una configuración rota o
  un archivo que falta hablaba de una entrada que no había.
- **Sesión real con una entrada ajena en rojo, antes y después — se hizo.**
- **Con un error que no es reparable: que no invente — se hizo.**

### Lo que este caso encontró y no preveía

**La prueba que ya existía no probaba lo que decía.** Armaba una épica ilegible y esperaba el freno, pero la
instancia no tenía el motor instalado: frenaba por «no se encontró el motor». Ahora instala el motor y fija
los tres casos: motor ausente, épica rota y entrada de `done/` rota.

### Lo que queda como está, y dicho

- **El texto no dice el formato de la fila** de `HUMAN_ACTIONS.md`. En la sesión medida la fila salió bien
  formada: `check` siguió en rojo sólo por el error original.
- **Con la persona en el chat, la sesión anotó la fila igual**, además de decírselo. El texto dice «si no
  está»; no molesta y no lo perseguí.
- **Una épica ilegible por permisos** sale de `check` como error de formato. Es anterior y no lleva el consejo.

### Qué se corrió

- **La misma sesión de chat, en un banco con el planning en rojo por la entrada de otra tarea**, y la misma
  pregunta sobre otra cosa. Una sesión por celda; la de después se repitió con el texto final y dio igual.

  | Error | Antes | Después |
  |---|---|---|
  | La traza `A (devuelve 1) → …` | Borró «(devuelve 1)» | La movió al final de la línea, sin borrar nada |
  | Falta `commit:` | No inventó; preguntó | No inventó; lo dijo y dejó la fila para una persona |

- **El guard, como lo corre el runner**: sin motor, con una épica rota y con una entrada rota. Sólo la
  tercera lleva el consejo.
- **Cinco mutaciones en rojo, en una copia**: sin el consejo, siempre, nunca, con cualquier rojo, y la ruta
  relativa.
- **Una revisión independiente del diff**, y **la puerta entera**, `npm run ci`.
- **Lo que no se corrió**: la sesión que espera a un recorrido, que es donde se vio primero; y Codex o Gemini.
