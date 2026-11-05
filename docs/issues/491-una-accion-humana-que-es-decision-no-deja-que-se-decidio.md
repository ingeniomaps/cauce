---
caso: 491
titulo: Una acción humana que es una decisión se resuelve sin dejar escrito qué se decidió
estado: descartado
prioridad: baja
version-detectada: 0.119.0
---

# 491 — Una acción humana que es una decisión se resuelve sin dejar escrito qué se decidió

**⚪ descartado** · detectado en 0.119.0 · prioridad **baja**: medido el 2026-11-05, no se reproduce en cuatro instancias reales.

## Resumen

Una fila de `planning/human/` sirve para cosas de dos clases. Las de hacer, como una credencial, una cuenta o un permiso, se cierran con `resuelta` y alcanza. Las de decidir, como una regla de negocio o un alcance, también se cierran con `resuelta`, y nada exige escribir qué se decidió, quién lo decidió ni por qué. La tarea que se desbloquea vuelve a la cola y quien la toma tiene que encontrar la respuesta en otro lado o suponerla.

## Reproducción

**No se reproduce.** Medido el 2026-11-05 sobre las filas `status: resuelta` de `planning/human/` y `planning/human/done/` de las cuatro instancias de esta máquina que tienen filas (una quinta no tiene ninguna):

| | Filas |
|---|---|
| Resueltas | 66 |
| Con forma de decisión (grep: «decid», «¿», «elegir», «aprobar», «validar») | 50 |
| De esas, con marca de respuesta en la propia fila según el grep («Decidido por la persona…», «(a), cuentan igual», «Resuelta: …») | 45 |
| Sin marca de respuesta, leídas enteras | 5 |
| — con la respuesta en la fila (falso negativo del grep: una rotación de credencial) | 1 |
| — sin respuesta en la fila, con un destino nombrado («se desbloquea cuando queda escrito en `<archivo>`») donde la respuesta está | 4 |
| Decisiones sin respuesta en ningún lado | 0 de las 5 leídas |

Las cuatro del segundo grupo se abrieron una por una: el monto y el modelo están en el documento de empresa de su instancia, `allowPush` está en su `ops.config.json` y en las excepciones de su `workspace.md`, y la tarea que había que partir está en `done/`. **Lo que no se leyó:** las 45 con marca de respuesta se clasificaron por grep, no una por una. Un grep así puede contar como respuesta una fila que sólo cita la palabra. La muestra que se leyó (unas 30, por su principio y su final) no mostró ninguna así.

Lo que sostiene el resultado es una convención que el molde ya trae: la fila dice dónde tiene que quedar escrita la respuesta, con «se desbloquea cuando …», como en el ejemplo del molde (`template/planning/human/README.md:15`).

La reproducción que se había propuesto, que ya no hace falta:

1. En un banco `tarea`, crear una fila con `origin: Ready` que pregunte una decisión.
2. Marcarla `resuelta` sin escribir la respuesta, que es lo que el molde permite.
3. Correr la tarea y ver si el runner para a preguntar o sigue suponiendo.

## Causa raíz

- `template/planning/human/README.md:20-23`: `status` admite `pendiente` o `resuelta` con fecha, y se resuelve cambiando sólo ese campo.
- `engine/planning/human-actions.js:47`: `resolved` es `status === 'resuelta'`. El motor no lee nada más.
- Las reglas de negocio ya tienen su versión de esto: `template/planning/business-rules/000-template.md` pide «Confirmada por» y «Pregunta abierta (decide: quién)», y `engine/planning/business-rules.js` lo hace cumplir. Las acciones humanas no tienen nada equivalente.

## Fix propuesto

1. Un campo opcional `decide:` en el frontmatter, con quién decide o `sin asignar`.
2. Cuando la fila tiene `decide:`, resolverla exige una línea `decision:` con qué se decidió. `check` avisa si una fila resuelta con `decide:` no la trae.
3. El runner, al tomar la tarea desbloqueada, lee la `decision:` de su fila.

Las filas sin `decide:` (credenciales, cuentas) siguen como hoy.

## Tradeoffs

- **Cambia el molde y `check`**, así que baja a todas las instancias. Las filas viejas no traen `decide:` y no cambian de comportamiento.
- **Lo escribe el runner**, que es quien crea la fila. Hay que decidir si el runner pone `decide:` siempre que la acción sea decidir. Si lo pone de más, molesta; si no lo pone, el caso no cambia nada.
- **Respuesta parcial:** la fuente ajena tiene ese estado. Acá se propone no agregarlo: una parcial deja la fila `pendiente`, con lo avanzado escrito en el cuerpo.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Su catálogo de reglas da a las preguntas un ciclo de vida: abierta, respuesta parcial, respondida, cerrada con motivo y fundamento, y reabierta conservando el cierre anterior. Responder no cierra, y quien trae la respuesta no es por eso autoridad.

## Relacionados

- R13 (`conduct.md:40-46`): leer la respuesta escrita o escalarla.
- Caso 213: «Confirmada por» en las reglas de negocio.

## Cierre

Descartado el 2026-11-05 por decisión de la persona, sobre la medición de «Reproducción».

- **Campo `decide:` y línea `decision:` (Fix 1 y 2):** no. De 50 filas con forma de decisión, ninguna de las 5 leídas enteras quedó sin respuesta, y 45 traen marca de respuesta en la propia fila. La convención de nombrar el destino («se desbloquea cuando queda escrito en…») ya resuelve lo que el campo pedía.
- **Que el runner lea la decisión al retomar (Fix 3):** no. Sin filas sin respuesta, no hay qué leer que hoy falte.
- **Respuesta parcial (Tradeoffs):** no se agrega, por la misma razón.
- **La reproducción con banco:** no se corrió. La medición en instancias reales contesta la misma pregunta con más casos.

Se reabre si una instancia muestra una tarea desbloqueada que supuso una decisión porque su fila no decía dónde estaba la respuesta.

**Sin probar:** las 45 filas clasificadas por grep no se leyeron una por una.
