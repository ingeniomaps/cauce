---
caso: 278
titulo: un plan frenado en la primera crítica se registra como dos rechazos
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 278 — Una crítica que frena el plan por una decisión que falta deja una fila que dice «nadie pudo escribir un plan» y manda a partir la tarea

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: la fila es lo único que lee la persona que destraba, y le pide lo que no era. Además bloquea la tarea dos veces.

## Resumen

`autobuild` registra con el mismo texto dos paradas distintas: el plan que sigue rechazado tras la corrección
—dos planes, dos críticas— y el veredicto `bloqueado` de la primera crítica —un plan, una crítica—. El texto
es el del primer caso. La crítica no tiene otra salida que `bloqueado` para decir «acá falta una decisión».

## Reproducción

Banco sidecar, tarea `full`, sesión real lanzada con «/autobuild el plan no tiene que incluir pruebas: las
escribo yo después, a mano». El plan incluyó las pruebas igual y la crítica devolvió `bloqueado`: «falta una
decisión de la persona y el plan la toma solo».

## Síntoma

Dos filas `pendiente` para la misma tarea en `HUMAN_ACTIONS.md`. La primera pide la decisión. La segunda:

```
| alta-normaliza-email | pendiente | Plan | Nadie pudo escribir un plan que sobreviva a la crítica (R17,
tercera barra). Revisar si la unidad son dos resultados con vidas distintas —el cambio en `src/alta.js` y
las pruebas que lo cubren— y partirla, o dejarla entera con la razón escrita …
```

Hubo un plan y una crítica, y la unidad no tenía nada que partir.

## Causa raíz

`automatization/workflows/autobuild.js`, `planRejected`: un solo pedido para `plan-blocked` y para
`plan-rejected`. La primera fila la había escrito la propia crítica; el pedido no decía qué hacer si ya
había una.

## Fix propuesto

Que `plan-blocked` registre lo que pasó: la crítica frenó por algo que corregir el plan no resuelve, con el
motivo, y la acción es resolver ese motivo. Una sola fila.

Vale la pena mirar si la crítica debería tener una salida propia para una decisión, como la tiene Review.

## Tradeoffs

- La fila de `plan-blocked` ya no afirma cuál es el problema: ofrece las dos lecturas —una decisión, o una
  unidad que son dos— y deja el motivo de la crítica como dato.

## Contexto de descubrimiento

Buscando provocar el camino de la segunda crítica del 248.

## Relacionados

- 081 — un plan rechazado no se reintenta: se registra.
- 248 — la segunda crítica `con-condiciones`.
- 252 — lo que se pide al lanzar llega a las fases.

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** `plan-rejected` conserva su texto: ahí sí hubo dos planes.
- **«Vale la pena mirar si la crítica debería tener una salida propia» — se miró y se decidió que no.** Con
  el veredicto `bloqueado` y el motivo en la fila, la decisión ya llega a una persona con su pregunta. Un
  campo más en el esquema compraría lo mismo.
- **Tradeoff — se paga.**

### Lo que el caso no preveía

- La misma corrida mostró que una parada deja la instancia sin commitear. Salió como caso propio: 279.
- El mismo pedido, repetido en otra tarea, no frenó: el plan incluyó las pruebas, la crítica lo aprobó con
  condiciones y la corrida cerró. Que la crítica frene por un pedido que contradice las reglas no es
  determinista.

### Qué se corrió

- **Una corrida real con el veredicto `bloqueado` inyectado después de la crítica real**, sobre el motor
  arreglado. Quedó una sola fila nueva —de 8 pendientes a 9—, en la fase `Critique`, que pide definir la
  decisión y no nombra planes rechazados ni partir la tarea.
- **Dos mutaciones en rojo**, en una copia: el texto de siempre para las dos paradas, y el nuevo para las dos.
- **La puerta entera**, `npm run ci`.
