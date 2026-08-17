# Historial de cambios aprobados

Registrar únicamente cambios aprobados, con fecha, evidencia, evaluación y responsable.

| Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |
|---|---|---|---|---|
| 2026-08-17 | `learning/proposals/2026-08.md` (nace de `learning/reports/2026-08-17.md` y de `evaluations/results/2026-08-17.md`, caso 04) | Aprobada | Manuel Pinzon | Aditivo en tres archivos: dos viñetas en `SKILL.md` § Reglas —qué preserva una operación de esquema depende del motor y su versión, y una copia previa al borrado es una foto, no una reversión, con el roll-forward en la misma pieza que la conclusión de que revertir dejó de ser seguro—; la sección «Qué preserva cada operación de esquema» en `references/operating-model.md`; y la conducta prohibida `unscoped_schema_operation_or_data_copy_presented_as_safeguard` con su caso `07-schema-safeguard-scope.md`. Ninguna línea vigente reescrita. Una desviación, registrada en la propuesta: el caso nuevo nombra PostgreSQL 16, motor que la propuesta dejaba sin fijar. Origen: el caso 04 reprobó dos veces proponiendo el rename como ensayo que delata consumidores rezagados —propiedad que depende del motor y que en el declarado se invierte— mientras marcaba como hipótesis el costo y la reversibilidad del mismo rename. No es falta de registro: es registro aplicado al costo y no a la propiedad que sostiene el paso. |
