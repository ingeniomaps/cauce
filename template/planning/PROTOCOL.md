# Protocolo agnóstico de ejecución

Es la fuente de verdad del proceso para cualquier runner. Ninguna herramienta concreta puede relajar estas
invariantes.

## Contratos

- Épica: frontmatter `epic/title/status/service`; criterios `**CN**`; historias con slug, `(→ CN)` y
  `(service: ruta)`.
- Hito: `## Hito slug — Título`.
- Tarea: `- [ ] **slug** [directo|lite|full] — descripción. _Aceptación: observable._ (service: ruta)`;
  puede heredar aceptación usando `(→ CN) (epic: NNN)`.
- DONE: entrada `[x]` con `acept:`, `done:`, `qa:`, `tests:` y `commit:`. `tests:` enlaza cada criterio
  mediante `CN → prueba`; usa `A → prueba` cuando no hay épica o `n/a — razón` si no existe una
  superficie ejecutable. `decisions:` es opcional y, si aparece, cita `[fuente: ...]` o
  `[supuesto: ...]`.
- WIP activo: frontmatter y checklist; inactivo: `status: IDLE`.

## Gates de arranque

1. Si existe `AWAITING_REVIEW.md`, parar y mostrar la acción que contiene.
2. Si WIP está activo y puede pertenecer a otro runner, parar: es el mutex.
3. Si WIP está activo tras una interrupción confirmada, verificar los pasos `[x]` en disco y continuar
   desde el primer `[ ]`; no replanear.
4. Si WIP apunta a una tarea ya en DONE y fuera de BACKLOG, reparar el cierre dejando WIP en IDLE.

## Máquina por tarea

1. Triage: inspeccionar estado y cambios existentes.
2. Pick: primera tarea no bloqueada del primer hito.
3. Ready: exigir aceptación concreta y decisiones resueltas.
4. Decompose: dividir trabajo mayor a `maxTaskHours`.
5. Plan y Critique: entender contexto, escribir plan y atacarlo una vez.
6. WIP: persistir el plan aprobado antes del primer cambio.
7. Build: alcance exacto, progreso tildado, RED/GREEN/VERIFY aplicable.
8. Review: calidad y seguridad según la superficie modificada.
9. Verify: ejecutar los gates declarados por el servicio y registrar exit codes.
10. QA: probar la aceptación por el camino que usa un consumidor real.
11. Commit: stage explícito y un commit verificable por tarea.
12. Done: mover la tarea, registrar evidencia, limpiar WIP y cerrar/archivar la épica si corresponde.
13. Cierre: check verde, deuda residual al INBOX y checkpoint entre hitos.

## Lanes

- `directo`: cambio mecánico; Build, Verify, Commit y Done.
- `lite`: omite descomposición y crítica; mantiene review y evidencia.
- `full` o sin tag: todas las fases.

El lane reduce ceremonia, nunca seguridad, aceptación ni evidencia.

## Invariantes

1. Una tarea tiene un dueño de estado: roadmap → BACKLOG → overlay WIP → DONE.
2. Un solo runner a la vez; WIP activo es mutex.
3. INBOX nunca se ejecuta automáticamente.
4. No declarar éxito sin comandos, resultados y exit codes reales.
5. No inventar credenciales ni decisiones; registrar HUMAN_ACTIONS.
6. No ampliar alcance; lo adyacente vuelve al INBOX.
7. No reescribir este proceso dentro de una tarea de producto.
8. No push, amend, force, deploy o escritura externa sin autorización explícita.
9. Todo gate manual dice qué pasó, qué debe hacer la persona y cómo continuar.
10. El repositorio de código, no planning, es dueño del commit de producto.
