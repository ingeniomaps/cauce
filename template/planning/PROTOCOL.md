# Protocolo agnóstico de ejecución

Es la fuente de verdad del proceso para cualquier runner. Ninguna herramienta concreta puede relajar estas
invariantes.

## Contratos

- Épica: frontmatter `epic/title/status/service`; criterios `**CN**`; historias con slug, `(→ CN)` y
  `(service: ruta)`.
- Hito: `## Hito slug — Título`.
- Tarea: `- [ ] **slug** [express|directo|lite|full] — descripción. _Aceptación: observable._ (service: ruta) (cast: quien-entrega → quien-revisa, otro)`;
  puede heredar aceptación usando `(→ CN) (epic: NNN)`. Lane y cast son opcionales: sin ellos la tarea
  está sin clasificar, que es un estado y no un error.
- DONE: entrada `[x]` con `acept:`, `done:`, `qa:`, `tests:` y `commit:`. `tests:` enlaza cada criterio
  mediante `CN → prueba`; usa `A → prueba` cuando no hay épica o `n/a — razón` si no existe una
  superficie ejecutable. `decisions:` es opcional y, si aparece, cita `[fuente: ...]` o
  `[supuesto: ...]`.
- Acción humana: fila `| tarea | estado | origen | acción y condición de desbloqueo |`, con el estado
  en el vocabulario cerrado `pendiente | resuelta` —la fecha puede ir detrás—. Mientras la fila no
  esté resuelta, su tarea no se toma; un estado fuera del vocabulario es un error de `check` y no un
  bloqueo silencioso.
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
3. Classify: si la tarea no declara lane y cast, decidirlos y escribirlos en su línea.
4. Ready: exigir aceptación concreta y decisiones resueltas.
5. Decompose: dividir trabajo mayor a `maxTaskHours`.
6. Plan y Critique: entender contexto, escribir plan y atacarlo una vez.
7. WIP: persistir el plan aprobado antes del primer cambio.
8. Build: alcance exacto, progreso tildado, RED/GREEN/VERIFY aplicable.
9. Review: calidad y seguridad según la superficie modificada.
10. Verify: ejecutar los gates declarados por el servicio y registrar exit codes.
11. QA: probar la aceptación por el camino que usa un consumidor real.
12. Commit: stage explícito y un commit verificable por tarea.
13. Done: mover la tarea, registrar evidencia, limpiar WIP y cerrar/archivar la épica si corresponde.
14. Cierre: check verde, deuda residual al INBOX y checkpoint entre hitos.

## Lanes

El lane dice cuánta ceremonia merece la tarea y el cast quiénes la miran. Son una sola decisión —la
clasificación—, se toma al escribir la tarea y viaja en su línea, así que se decide una vez y no una
vez por corrida. La tarea que llega sin ella se clasifica antes de ejecutarse.

- `express`: la aceptación nombra un valor literal y el resultado no lo mira nadie —un typo, un umbral
  interno, un renombre—; WIP, Build, Verify, Commit y Done.
- `directo`: igual de mecánico, pero cambia una superficie que alguien ve; agrega el review del cargo
  que nombra el cast.
- `lite`: comportamiento nuevo dentro de un servicio con superficie conocida; agrega Ready, Plan y QA.
- `full` o sin tag: cruza contratos entre servicios, datos, autenticación o permisos, o la aceptación
  tiene un borde sin decidir; todas las fases.

El lane reduce ceremonia, nunca seguridad, aceptación ni evidencia: Verify y el WIP corren en los
cuatro. Lo que decide el carril es la superficie del cambio y no su tamaño en líneas — un `if` en el
chequeo de permisos es `full`, y un componente entero de presentación puede ser `directo`.

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
