---
caso: 384
titulo: check no avisa una tarea de la cola sin «_Aceptación: …_», y autobuild la recibiría vacía
estado: resuelto
resuelto-en: 0.109.0
prioridad: baja
version-detectada: 0.106.0
---

# 384 — Una línea del backlog con la aceptación escrita en prosa, sin el rótulo, pasa `check` en verde y el parser la lee como aceptación vacía

**🟢 resuelto en 0.109.0** · detectado en 0.106.0 · prioridad **baja** — se vio antes de lanzar y no costó una corrida, pero
habría llegado a Ready una tarea sin aceptación con `check` en verde.

## Resumen

`engine/planning/parser.js:208` toma la aceptación sólo de `_Aceptación: …_`. Una tarea promovida como
`- [ ] **slug** [lite] — <texto con su «Rojo si:»> *(criterio C1)* …` tiene `acceptance: ''`. `planning check`
(con las reglas de la instancia) dio «alineado» con doce tareas así. El único aviso existe en
`engine/planning/recurring.js:91`, que es para tareas recurrentes.

## Reproducción

```
node -e "const P=require('@ingeniomaps/cauce/engine/planning/parser.js');
console.log(P.taskFromLine('- [ ] **x** [lite] — Hace algo. Rojo si: falla. *(criterio C1)* (service: s)').acceptance)"
```

Imprime una línea vacía. Con `_Aceptación: Hace algo. Rojo si: falla._` imprime el texto.

## Fix propuesto

`check` marca como error una tarea de la cola sin aceptación parseada, con el mismo mensaje que `recurring.js`.

## Contexto de descubrimiento

Al promover una épica a la cola, en la instancia `acme-ops`. Se notó leyendo el parser antes de lanzar `autobuild`.

## Cierre

**Resuelto en 0.109.0 como «no es defecto»**, con un arreglo menor que apareció al reproducirlo. Las anclas del caso
siguen en pie: `taskFromLine` está ahora en `engine/planning/parser.js:212` y el aviso de las recurrentes en
`engine/planning/recurring.js:91`. Lo que no se sostiene es la conclusión: la regla que el caso pedía existe en
`engine/planning/contracts.js:393` desde v0.2.0, así que en 0.106.0 ya estaba. Una tarea sin aceptación propia pasa
`check` sólo si cita un criterio de su épica, y ahí no llega vacía: hereda el texto del criterio.

**Lo que se corrió.** Sobre un banco `ops bench suelto`, el 2026-10-16:

- La línea literal del caso, sin `(epic: …)`, da error con `ops check planning`:
  `✗ BACKLOG x: falta aceptación explícita o criterio heredado`.
  El parser devuelve `{"acceptance":"","epic":"","criteria":["C1"]}`: lee el criterio, y sin épica no hay de dónde
  heredarlo.
- La misma línea con `(epic: 001)`, y una épica activa cuyo C1 dice «Cuando el campo llega vacío, el alta lo rechaza
  con un mensaje», da `✓ planning válido`. `ops context planning --json` entrega
  `"acceptance": "Cuando el campo llega vacío, el alta lo rechaza con un mensaje."`. Es la forma que `check` aceptó
  con doce tareas en la instancia, y es lo que Ready, Plan y Verify reciben.

**Lo que el caso no preveía.** La descripción de esa tarea llegaba como `Hace algo. Rojo si: falla. **`. El parser
reconoce a propósito el criterio en cursiva, `*(criterio C1)*` (`parser.js:97`), pero al recortar los marcadores de
la descripción sacaba el paréntesis y dejaba los asteriscos. Ahora se los lleva. La prueba está en
`test/planning/backlog.test.js`, «la línea de una tarea entrega su descripción, sin la aceptación ni los
marcadores»: falla antes del arreglo con `actual: 'Hace algo. Rojo si: falla. **'` y pasa después. El banco, vuelto a
leer, da `"description": "Hace algo. Rojo si: falla."`.

**Recorrido de lo que el caso enumeraba.**

- **`check` marca como error una tarea sin aceptación parseada — ya lo hacía**, con la excepción de diseño de la
  aceptación heredada de un criterio de la épica. Que el mensaje sea el mismo que el de `recurring.js` no hace falta:
  son dos reglas distintas, porque una recurrente no tiene épica de la que heredar.

