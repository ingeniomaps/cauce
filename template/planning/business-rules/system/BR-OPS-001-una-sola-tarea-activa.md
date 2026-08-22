# Una sola tarea activa

> **Dominio:** planning | **Estado:** vigente | **Actualizado:** 2026-08-14

WIP protege la exclusión mutua y permite recuperar una ejecución interrumpida.
[fuente: ../../adr/system/OPS-001-planificacion-como-fuente-de-verdad.md]

Elabora el invariante 2 de `../../PROTOCOL.md`, que lo enuncia en una línea: acá viven sus bordes
y su evidencia. Cambiar una sin la otra las separa.

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-001 | WIP es mutex | Si WIP está activo, ningún runner toma otra tarea hasta continuarlo o resolverlo. |

## Por qué existe cada regla

- **BR-OPS-001:** evita dos ejecuciones concurrentes, estado contradictorio y pérdida del plan recuperable.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| Sesión interrumpida | Se verifican pasos persistidos y se continúa la misma tarea. |
| Tarea ya cerrada | Se repara el cierre y WIP vuelve a `IDLE`; no se ejecuta otra vez. |
| Dueño incierto | Se detiene y solicita revisión; no se asume abandono. |

## Evidencia

- `ops check` rechaza un WIP cuya tarea no existe en BACKLOG ni DONE.
- El guard de planning bloquea cambios incompatibles con un WIP activo.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-08-14 | Creación | OPS-001 y `PROTOCOL.md`. |
