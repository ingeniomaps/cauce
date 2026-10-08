---
caso: 336
titulo: claim toma una tarea con acción humana pendiente
estado: resuelto
resuelto-en: 0.105.0
prioridad: media
version-detectada: 0.104.1
---

# 336 — `claim` toma una tarea con acción humana pendiente que `context` saltea

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **media**.

**Prioridad media**: la tarea queda reservada por un runner que no puede avanzarla, y el que la tomó ya no
puede tomar otra (BR-OPS-001). No se pierde trabajo; se pierde una vuelta.

## Resumen

`HUMAN_ACTIONS.md` dice que mientras una fila esté `pendiente` su tarea no se toma, y `context` lo cumple:
la lista como `SKIP … (acción humana abierta)` y ofrece la siguiente. `claim` no lo consulta: comprueba
líneas, reclamos en otros árboles, dependencias y runner ocupado, y reserva la tarea bloqueada. Es el
mismo desacuerdo entre `context` y `claim` que el caso 239 cerró para las líneas de trabajo.

## Reproducción

Instancia con `email-confirmacion` en la cola y esta fila en `planning/HUMAN_ACTIONS.md`:

```
| email-confirmacion | pendiente | Ready | Elegir proveedor de email y dejar la credencial en `.env`. |
```

```bash
cd ops
CAUCE_RUNNER=beta node tools/ops.js context planning | grep -E "SKIP|HUMAN"
CAUCE_RUNNER=beta node tools/ops.js claim planning email-confirmacion; echo "exit=$?"
CAUCE_RUNNER=beta node tools/ops.js claim planning limpiar-logs; echo "exit=$?"
```

## Síntoma

```
SKIP   email-confirmacion (acción humana abierta)
HUMAN  email-confirmacion: Elegir proveedor de email y dejar la credencial en `.env`. …
✓ email-confirmacion tomada por banco@cauce.local
  commiteá y empujá claims/email-confirmacion.md para que el equipo lo vea
exit=0
este runner ya tiene email-confirmacion. Cerrala o soltala primero; …
exit=1
```

## Causa raíz

`engine/cli/claims.js`, `claim`: las negativas son `LN.scope` (línea), `LN.claimsElsewhere`,
`task.depends` contra DONE y el runner ocupado. `ST.pendingHumanActions(root)` existe y lo usa
`engine/cli/planning.js` para `context`, pero `claim` no lo llama.

## Fix propuesto

En `claim`, antes de las dependencias: si `ST.pendingHumanActions(root)` tiene una fila cuya primera
columna es el slug, negarse con `REFUSED` y el texto de la fila —«<slug> espera una acción humana: <acción>.
Se toma cuando la fila esté resuelta»—. Una prueba en `claims.test.js` con la fila pendiente, y otra con la
fila `resuelta`, que debe dejar tomar.

## Tradeoffs

- Una fila cuya primera columna es `—` o una épica no nombra tarea y no bloquea; es lo que
  `HUMAN_ACTIONS.md` ya documenta y `context` ya hace.
- Alguien que quiera tomar la tarea igual para preparar lo que no depende de la acción humana pierde esa
  opción. La fila se puede resolver o la tarea partir; es lo que R17 pide de todos modos.

## Por qué hacerlo

El contrato lo dice en tres lugares —`HUMAN_ACTIONS.md`, PROTOCOL y el propio `context`— y el comando que
reserva lo ignora. Con dos agentes, el segundo ve la tarea tomada por el primero, que está esperando a una
persona, y ninguno de los dos avanza.

## Riesgos y regresiones

1. **Instancias con filas pendientes viejas sobre tareas que sí se están trabajando**: `claim` empieza a
   negarse donde antes pasaba. El mensaje nombra la fila y cómo destrabarla.

## Contexto de descubrimiento

Campaña del 2026-10-08, ciclo de coordinación con dos runners sobre la instancia de prueba. Confirmado en
el fuente antes de registrarlo.

## Relacionados

- 335, la misma forma en `check`: una validación que existe para una superficie y falta en la vecina.

## Cierre

Recorrido contra el caso entero:

- **Negarse en `claim` antes de las dependencias si hay fila pendiente con ese slug** — hecho, en
  `engine/cli/claims.js`, justo después de la negativa por dependencia y con el mismo `REFUSED`; el mensaje
  nombra la acción de la fila y cuándo se toma.
- **Una prueba con la fila pendiente y otra con la fila resuelta** — hecho en `test/planning/claims.test.js`,
  las dos en un solo caso: `context` saltea, `claim` se niega sin dejar `claims/<slug>.md`, y con la fila en
  `resuelta` la toma.
- **Tradeoff «una fila con `—` o una épica no bloquea»** — comprobado por construcción: se compara el slug
  exacto de la primera columna, que es lo que `context` ya hace, y una fila con `—` no coincide con ninguna
  tarea.
- **Tradeoff «quien quería tomarla igual pierde esa opción»** — aceptado; la fila se resuelve o la tarea se
  parte, como ya pedía el caso.
- **Riesgo «filas pendientes viejas sobre tareas en curso»** — el mensaje nombra la fila y dice qué la
  destraba; no hay otra mitigación y no hace falta.

Cómo se supo que funciona:

- Rojo previo: la prueba nueva falló antes del arreglo (`claim` salió 0 y dejó el reclamo); después, 15 de 15.
- Mutación: anular la negativa (`if (false && waiting)`) devuelve la suite a 14 de 15, con esta prueba en
  rojo; restaurado, 15 de 15.
- Corrida real sobre el banco de la campaña con el motor del fuente, con una fila pendiente para
  `crear-pedido`: `ops claim planning crear-pedido` responde «crear-pedido espera una acción humana:
  Decidir el esquema de ids. Se toma cuando la fila esté resuelta.», sale 1 y `claims/` no cambia. Antes
  del arreglo la misma instancia la tomaba con exit 0.

