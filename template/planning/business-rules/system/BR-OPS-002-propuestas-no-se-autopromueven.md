# Las propuestas no se autopromueven

> **Dominio:** governance | **Estado:** vigente | **Actualizado:** 2026-08-14

Proponer genera una opción revisable; no concede autoridad para alterar prioridades o comprometer alcance.
[fuente: ../../adr/system/OPS-004-promocion-humana-y-evidencia-verificable.md]

Elabora el invariante 3 de `../../PROTOCOL.md`, que lo enuncia en una línea: acá viven sus bordes
y su evidencia. Cambiar una sin la otra las separa.

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-002 | Sin autopromoción | Una propuesta queda fuera de la cola hasta aprobación humana explícita. |

## Por qué existe cada regla

- **BR-OPS-002:** impide que el mismo actor que genera una idea amplíe el alcance autorizado.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| Evaluación verde | Demuestra calidad estructural, pero no equivale a aprobación. |
| Propuesta automática mensual | Puede abrir revisión; nunca modifica `SKILL.md` ni BACKLOG por sí misma. |
| Issue remoto listo | Requiere el comando explícito de promoción y superar sus validaciones. |

## Evidencia

- `learn --proposal` escribe bajo `learning/proposals/` y no modifica el agente.
- La sincronización de integraciones no incorpora elementos directamente en BACKLOG.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-08-14 | Creación | OPS-004 y `AGENTS.md`. |
