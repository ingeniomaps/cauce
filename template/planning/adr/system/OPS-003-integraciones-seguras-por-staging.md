# OPS-003 — Procesar integraciones externas mediante staging seguro

**Estado:** Aceptado
**Fecha:** 2026-08-14

> Decide el límite de seguridad común; cada proveedor conserva su autenticación y normalización.

## Contexto

Un proveedor externo puede cambiar mientras existe curación local. Escribir directamente desde un agente
mezcla datos remotos, intención y autorización, y hace difícil detectar conflictos o recuperar una decisión.

## Decisión

**Toda integración es de solo lectura por defecto y pasa por staging tipado.** El motor conserva snapshot,
base reconciliada y borrador local; deriva cambios entrantes, salientes y conflictos. Los snapshots son
inmutables para el usuario. `writeback-plan` calcula intención, pero no ejecuta escrituras remotas.

## Alternativas consideradas

- **Editar el proveedor durante la sincronización:** combina lectura y mutación sin checkpoint revisable.
- **Usar un único archivo mutable:** pierde la base necesaria para comparar cambios de tres vías.

## Consecuencias

**Ganamos:** reconciliación explícita, limpieza segura y adaptación de nuevos proveedores sin duplicar el ciclo.

**Costos que aceptamos:** el staging ocupa espacio y una escritura futura necesitará otro contrato, pruebas y
autorización humana explícita.

## Estado de implementación

Implementado para Jira con sincronización, propuestas, promoción local y plan de escritura sin ejecutor remoto.
