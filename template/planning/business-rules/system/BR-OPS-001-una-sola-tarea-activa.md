# Una sola tarea activa

> **Dominio:** planning | **Estado:** vigente | **Actualizado:** 2026-09-07

WIP protege la exclusión mutua dentro de un runner y permite recuperar una ejecución interrumpida.
Que dos runners no tomen la misma tarea es otra cosa, y la sostiene `BR-OPS-005-una-tarea-un-runner.md`.
[fuente: ../../adr/system/OPS-001-planificacion-como-fuente-de-verdad.md]

Elabora el invariante 2 de `../../PROTOCOL.md`, que lo enuncia en una línea: acá viven sus bordes
y su evidencia. Cambiar una sin la otra las separa.

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-001 | WIP es mutex | Si WIP está activo, ese runner no toma otra tarea hasta continuarlo o resolverlo. |

## Por qué existe cada regla

- **BR-OPS-001:** evita dos ejecuciones concurrentes, estado contradictorio y pérdida del plan recuperable.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| Sesión interrumpida | Se verifican pasos persistidos y se continúa la misma tarea. |
| Tarea ya cerrada | Se repara el cierre y WIP vuelve a `IDLE`; no se ejecuta otra vez. |
| WIP ausente | Se lee como IDLE. El archivo es local y un clon nuevo no lo trae; eso no es un error. |
| Tarea de otro runner | No la ve: el WIP ajeno no viaja. Lo que la reserva es su reclamo (BR-OPS-005). |

## Evidencia

- `ops check` rechaza un WIP cuya tarea no existe en BACKLOG ni DONE.
- El guard de planning bloquea cambios incompatibles con un WIP activo.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-08-14 | Creación | OPS-001 y `PROTOCOL.md`. |
| 2026-09-07 | El mutex se acota al runner; el WIP pasa a ser local | Trabajo en equipo: `../../delivery/teamwork.md`. |
