# Los conflictos bloquean la promoción

> **Dominio:** integrations | **Estado:** vigente | **Actualizado:** 2026-08-14

Una diferencia entre la base, el remoto y la curación local debe resolverse antes de convertirla en intención.
[fuente: ../../adr/system/OPS-003-integraciones-seguras-por-staging.md]

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-003 | Conflicto bloqueante | Si hay cambios remotos sin reconciliar o conflicto, el draft no se promueve. |

## Por qué existe cada regla

- **BR-OPS-003:** evita sobrescribir información remota o promover una interpretación basada en datos antiguos.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| Elemento ausente del remoto | No puede permanecer `ready`; se marca para revisión o limpieza segura. |
| Cambio solo remoto | El draft vuelve a `pending` hasta adoptar o reconciliar la nueva base. |
| Cambios en campos distintos | Se revisan todas las señales antes de promover. |

## Evidencia

- `integration check` rechaza drafts `ready` con cambios entrantes o conflictos.
- Las pruebas de integración cubren conflicto, `reset` y `reconcile`.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-08-14 | Creación | OPS-003. |
