# DONE requiere evidencia verificable

> **Dominio:** delivery | **Estado:** vigente | **Actualizado:** 2026-08-14

Cerrar una tarea es una afirmación sobre comportamiento observado, no una impresión del ejecutor.
[fuente: ../../adr/system/OPS-004-promocion-humana-y-evidencia-verificable.md]

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-004 | Cierre con evidencia | Una entrada en DONE registra aceptación, fecha, QA y commit verificables. |

## Por qué existe cada regla

- **BR-OPS-004:** evita declarar éxito con pruebas omitidas, resultados asumidos o cambios sin trazabilidad.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| No existe superficie testeable | Se documenta la verificación aplicable; no se inventa una prueba. |
| Verificación bloqueada | La tarea no pasa a DONE y el bloqueo queda visible. |
| Commit no aplica | La excepción debe estar autorizada y explicada; el campo no desaparece silenciosamente. |

## Evidencia

- `ops check` valida los campos estructurales de cada entrada en DONE.
- El guard de verificación ejecuta los gates disponibles antes de permitir un commit.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-08-14 | Creación | OPS-004 y `PROTOCOL.md`. |
