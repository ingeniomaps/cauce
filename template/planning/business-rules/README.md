# Reglas de negocio durables

Este registro contiene invariantes observables que sobreviven a una tarea o épica. No es otra cola de trabajo,
una copia de `PROTOCOL.md` ni un lugar para justificar decisiones arquitectónicas.

## Cuándo crear una regla

Crear una regla cuando al menos una condición se cumpla:

- varias épicas, servicios o integraciones consumen el mismo comportamiento;
- debe seguir vigente después de cerrar la iniciativa que la introdujo;
- protege autorización, dinero, datos externos o recuperación operativa;
- varios criterios de aceptación necesitan citar el mismo resultado.

Lo específico de una épica permanece en `roadmap/`. El porqué de una estructura durable vive en `adr/`. El
orden de ejecución y las transiciones pertenecen a `PROTOCOL.md`.

## Namespaces

- `system/BR-OPS-NNN-*`: reglas heredadas del sistema; no se renumeran.
- `<dominio>/<tema>.md`: reglas propias del proyecto.
- `000-template.md`: molde, no una regla vigente.

Los IDs son globalmente únicos y no se reutilizan. `ops check` valida duplicados y secciones obligatorias.
Épicas, ADR y planes pueden citar una regla como `[fuente: BR-OPS-001]`.

## Reglas del sistema

- [BR-OPS-001](system/BR-OPS-001-una-sola-tarea-activa.md): WIP activo funciona como mutex.
- [BR-OPS-002](system/BR-OPS-002-propuestas-no-se-autopromueven.md): una propuesta no se aprueba sola.
- [BR-OPS-003](system/BR-OPS-003-conflictos-bloquean-promocion.md): un conflicto impide promover.
- [BR-OPS-004](system/BR-OPS-004-done-requiere-evidencia.md): DONE exige evidencia verificable.
