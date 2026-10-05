---
caso: 256
titulo: una mutación declarada y no corrida termina en una fila
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 256 — La mutación que Build o Review declaran sin haberla corrido va a `HUMAN_ACTIONS.md` en vez de correrse

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: fueron 3 de las 20 filas de globex. Con el 250 arreglado dejan de pedirle algo a una persona, pero la
mutación sigue sin correrse.

## Resumen

Era el punto 2 del fix del 250, y se separó porque pide una decisión que el resto de ese caso no
necesita. Cuando Build o Review escriben «hipótesis, no comprobada: romper X pondría rojo Y», eso es
trabajo que un agente puede hacer en una copia. Hoy termina como pregunta a una persona, que la cierra
pidiendo que se corra.

## Reproducción

Sin arnés. En `globex-ops`, rama `chore/cierre-parser-y-routing`, `planning/HUMAN_ACTIONS.md` tiene las
tres filas; dos se leen así:

```
Decidir si el caso de presencia del test del logger del `api` (`req.id`, método y URL siguen saliendo) necesita su propia mutación vista en rojo.
Decidir si los casos `it.each(['human','system'])` del e2e necesitan su rojo registrado. Reportado por el build: no se vieron en rojo en esa corrida
```

## Síntoma

El de arriba. Según el 250, las tres se cerraron corriendo la mutación, y en una el revisor ya la había
corrido en una copia y la fila quedó abierta igual. Eso último no se contrastó acá.

## Causa raíz

La de 250: para Build, lo que nota y no arregla es `open`, y `open` es una fila. No hay camino por el que
una hipótesis llegue a QA como caso a correr.

## Fix propuesto

Que lo marcado como mutación sin correr entre a QA como caso, se corra en su copia y el resultado vaya a
`qa:`. Pide decidir antes cuánto puede crecer QA por tarea: un tope de mutaciones por corrida, y a dónde
va lo que pasa del tope.

## Tradeoffs

- QA cuesta más por tarea. No está medido cuánto: depende de cuántas declare cada Build.
- Una mutación mal descrita no se puede correr, y QA tiene que poder decirlo sin frenar la entrega.

## Contexto de descubrimiento

Al ordenar los casos el 2026-10-05, separado del 250.

## Relacionados

- 250 — el recorrido registra como acción humana toda observación que no corrige.
