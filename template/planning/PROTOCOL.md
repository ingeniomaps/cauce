# Protocolo agnóstico de ejecución

Es la fuente de verdad del proceso para cualquier runner. Ninguna herramienta concreta puede relajar estas
invariantes.

## Contratos

- Épica: frontmatter `epic/title/status/service`; criterios `**CN**`; historias con slug, `(→ CN)` y
  `(service: ruta)`; y, optativa, `## Hitos` con el reparto de esas historias al promover, cada hito con
  su `(line: nombre)` si es de una línea de trabajo.
- Hito: `## Hito slug — Título`. Vive en `BACKLOG.md` o, mejor, en su propio archivo `backlog/<slug>.md`, con
  `order: N` en el frontmatter y ese único hito adentro: dos líneas de trabajo en paralelo que escriben el
  mismo `BACKLOG.md` chocan cada vez que una trae a la otra, y partido por hito cada una escribe el suyo.
  `ops split-backlog planning` pasa los hitos de `BACKLOG.md` a sus archivos. La cola es la unión de los dos:
  primero `BACKLOG.md`, después `backlog/` por `order`.
- Tarea: `- [ ] **slug** [manual|express|directo|lite|full] — descripción. _Aceptación: observable._ (service: ruta) (cast: quien-entrega → quien-revisa, otro)`;
  puede heredar aceptación usando `(→ CN) (epic: NNN)` y declarar `(depende: slug, otro)`. Lane y cast son
  opcionales: sin ellos la tarea está sin clasificar, que es un estado y no un error. Una tarea con
  dependencias no se ofrece ni se toma hasta que todas estén en DONE.
  Una condición se comprueba en Verify, que corre antes que Commit y que Done: la que nombre el commit, el
  reclamo, `done/` o la evidencia registrada pide algo que todavía no existe cuando se la mira, y su lugar
  son los campos `tests:`, `qa:` y `commit:` de DONE, que ya lo exigen. `check` lo avisa sobre la cola. Si
  aun así corresponde dejarla ahí, se declara en la propia condición con `(fuera de verify: <razón>)` —la
  misma salida explícita que `(sin partir: …)` y que `n/a — razón`— y deja de avisarse. El recorrido la
  saca de lo que manda a Verify y a QA, y la lleva a Done para que quede cumplida en esos campos.
- DONE: un archivo por tarea cerrada, `done/<slug>.md`, con su entrada `[x]` y los campos `acept:`,
  `fecha:` en AAAA-MM-DD, `done:`, `qa:`, `tests:`, `commit:` y `lane:`. `lane:` repite el carril con el
  que la tarea corrió —`manual`, `express`, `directo`, `lite`, `full`— o `sin clasificar` si su línea no lo
  declaraba, y existe porque el carril decide qué fases corren y su línea del BACKLOG se borra al cerrar:
  sin él, si una tarea recibió la ceremonia que le tocaba sólo lo sabe quien estuvo en la sesión.
  `check` avisa cuántas entradas no lo traen y falla si trae un valor que no existe. `review:` dice qué
  pasó con la revisión —el veredicto y quién revisó— o `n/a — razón` cuando no corrió; es la dimensión con
  la que OPS-006 dice que se mide si el carril elegido fue el correcto, y `check` cruza los dos: un carril
  que convoca revisor con una revisión que no corrió es la ADR incumplida, escrita en el propio registro. La fecha es la del cierre, y es lo que
  ordena una evidencia que ya no depende de su posición dentro de un archivo. `tests:` enlaza cada criterio
  mediante `CN → prueba`; usa `A → prueba` cuando no hay épica o `n/a — razón` si no existe una
  superficie ejecutable. Una prueba que vive en un archivo va como `archivo › «nombre» — aclaración`,
  con el nombre tal como figura en el archivo: es la forma que `ops evidence` contrasta sin adivinar. Un `tests:` que sea todo `n/a` es un error de `check` si su `commit:` toca algún
  archivo que no sea un documento (`.md`, `.txt`, `.adoc`) o una imagen (`.png`, `.jpg`, `.jpeg`, `.gif`,
  `.svg`, `.webp`): lo demás se ejecuta y se prueba, también lo que no tiene extensión, como un `Makefile`.
  Rige para lo cerrado desde el 2026-09-24; lo anterior no se juzga con ella. `decisions:` es opcional y, si aparece, cita `[fuente: ...]` o
  `[supuesto: ...]`. `commit:` apunta a `<sha> <asunto>`, o a `n/a — razón` cuando la tarea no
  produce commit.
- Acción humana: fila `| tarea | estado | origen | acción y condición de desbloqueo |`, con el estado
  en el vocabulario cerrado `pendiente | resuelta` —la fecha puede ir detrás—. Mientras la fila no
  esté resuelta, su tarea no se toma; un estado fuera del vocabulario es un error de `check` y no un
  bloqueo silencioso.
- Recurrencia: fila `| qué | cada | desde | tarea y aceptación |` bajo `## Recurrencias`, con `cada` en
  el vocabulario cerrado `mensual | trimestral | semestral | anual` y la celda de tarea escrita como la
  cola de su línea de BACKLOG. Vencer no bloquea: cada vuelta se promueve con el período en el slug
  —`<qué>-AAAA-MM`— y esa promoción la escribe una persona. Postergar se registra bajo
  `## Postergaciones` con `- **qué** AAAA-MM-DD — razón`.
- Reclamo: `claims/<tarea>.md` con frontmatter `task/owner/runner/started/service`; el nombre del
  archivo es el slug que reserva, y por eso un `task` que diga otra cosa es un error. `owner` dice a
  quién preguntarle y `runner` decide de quién es: con varios agentes en una máquina la persona es
  la misma y el árbol de trabajo no.
- WIP activo: frontmatter y checklist en `wip/<runner>.md`; inactivo cuando el archivo no está. Es
  local y no viaja por git: existe para recuperar la sesión de quien lo escribió, y es uno por runner
  porque una instancia sidecar la comparten todos los agentes de esa máquina.

## Gates de arranque

1. Si un checkpoint te frena —el de tu línea en `checkpoints/`, o `AWAITING_REVIEW.md`, que frena a todas—,
   parar y mostrar la acción que contiene. `ops context` dice cuál es.
2. Si tu WIP está activo, la tarea es ésa: es el mutex del runner, y sólo se lee el propio.
3. Si WIP está activo tras una interrupción confirmada, verificar los pasos `[x]` en disco y continuar
   desde el primer `[ ]`; no replanear.
4. Si WIP apunta a una tarea ya en DONE y fuera de BACKLOG, reparar el cierre dejando WIP en IDLE.

## Máquina por tarea

1. Triage: inspeccionar estado y cambios existentes.
2. Pick: primera tarea no bloqueada ni reclamada por otro runner, recorriendo los hitos en orden;
   reclamarla antes de empezar y empujar ese reclamo, que sin empujar no reserva nada.
3. Classify: si la tarea no declara lane y cast, decidirlos y escribirlos en su línea.
4. Ready: exigir aceptación concreta y decisiones resueltas.
5. Decompose: dividir trabajo mayor a `maxTaskHours` o con más de cinco condiciones de aceptación.
6. Plan y Critique: entender contexto, escribir plan y atacarlo una vez.
7. WIP: persistir el plan aprobado antes del primer cambio.
8. Build: alcance exacto, progreso tildado, RED/GREEN/VERIFY aplicable.
9. Review: calidad y seguridad según la superficie modificada. Cada hallazgo nombra la regla que lo
   sostiene o se declara criterio, y dice si se comprobó: lo que no se comprobó se registra y no manda a
   corregir.
10. Verify: ejecutar los gates declarados por el servicio y registrar exit codes.
11. QA: probar la aceptación por el camino que usa un consumidor real, como dice `QA.md`.
12. Commit: stage explícito y commits verificables, uno por naturaleza del diff.
13. Done: sacar la tarea de la cola, escribir su evidencia en `done/<slug>.md`, limpiar WIP, soltar
    el reclamo y cerrar la épica si no le queda ninguna historia abierta. El estado de planning se
    commitea en la rama en la que está el repositorio de la instancia. Si ésa es una rama viva que no
    admite push, va a **una** rama de trabajo que se acumula, con un solo PR abierto: la que ya exista,
    y no una nueva por cada cambio de estado.
14. Cierre: check verde, deuda residual al INBOX y checkpoint entre hitos.

## Lanes

El lane dice cuánta ceremonia merece la tarea y el cast quiénes la miran. Son una sola decisión —la
clasificación—, se toma al escribir la tarea y viaja en su línea, así que se decide una vez y no una
vez por corrida. La tarea que llega sin ella se clasifica antes de ejecutarse.

- `manual`: la hace más barato la sesión que el recorrido —un solo servicio, la aceptación ya nombra el
  cambio y la mutación que lo prueba, ningún borde ni decisión de diseño por tomar, ninguna dependencia
  abierta, una hora de trabajo—. No es un carril del recorrido: `context` no se la ofrece a ningún runner y
  la nombra aparte, y si el clasificador la devuelve, la corrida suelta la reserva y sigue con la próxima.
  La sesión la cierra con la misma evidencia que cualquier otra —prueba en rojo, mutación, gate, commit y
  `done/` con `lane: manual`—, sin revisor. Nunca sobre una superficie de «Qué no se puede romper»: a toda la
  que el clasificador deje manual el recorrido se lo pregunta, y la que la toca pasa a `directo`; escrita a
  mano, ese piso lo cuida quien escribe la línea. Una tarea manual que el runner tiene reclamada o en su WIP frena la corrida
  con `manual-held`: la está haciendo la sesión, y la corrida no se la suelta.
- `express`: la aceptación nombra un valor literal y el resultado no lo mira nadie —un typo, un umbral
  interno, un renombre—; WIP, Build, Verify, Commit y Done. **Nunca sobre una superficie que
  `organization/company.md` declara en «Qué no se puede romper»**: ahí el recorrido la sube a `directo`,
  aunque la línea diga `express`, y lo que no puede determinar también lo sube.
- `directo`: igual de mecánico, pero cambia una superficie que alguien ve; agrega el review del cargo
  que nombra el cast.
- `lite`: comportamiento nuevo dentro de un servicio con superficie conocida; agrega Ready, Plan y QA.
- `full` o sin tag: cruza contratos entre servicios, datos, autenticación o permisos, o la aceptación
  tiene un borde sin decidir; todas las fases.

El lane reduce ceremonia, nunca seguridad, aceptación ni evidencia: Verify y el WIP corren en los
cuatro carriles del recorrido, y la tarea `manual` trae la misma evidencia hecha a mano. Lo que decide el carril es la superficie del cambio y no su tamaño en líneas — un `if` en el
chequeo de permisos es `full`, y un componente entero de presentación puede ser `directo`.

Escribir la línea es también contrastarla. Declara cuatro cosas —qué hace, en qué carril, quién entrega y
revisa, con qué se comprueba— y las cuatro salen de la misma mano en el mismo acto, así que nada las cruza
después. Releerlas no encuentra el hueco: una aceptación incompleta se lee perfecta, porque todo lo que
dice es cierto.

Antes de dar la tarea por escrita se recorre su descripción frase por frase y se contesta, por cada cosa
que promete, cuál condición de aceptación la comprueba; se lee el carril contra la superficie que toca y
no contra su tamaño; y se comprueba que el cast entregue a quien construye. Lo que quede sin condición se
agrega o se declara fuera de alcance en la línea.

Es el único momento en que las cuatro se pueden mirar juntas, y por eso la pasada vive acá y no en una
fase: después el carril ya decide cuáles corren, y la que revisaría es una de las que ese carril puede
saltar. Una tarea mal marcada `express` es justamente la que se salta la fase donde alguien lo notaría.

## Invariantes

1. Una tarea tiene un dueño de estado: roadmap → BACKLOG → overlay WIP → DONE.
2. Un runner lleva una tarea a la vez —WIP, que es local: `business-rules/system/BR-OPS-001`— y una
   tarea la lleva un runner —el reclamo, que es compartido: `business-rules/system/BR-OPS-005`—.
3. INBOX nunca se ejecuta automáticamente — `business-rules/system/BR-OPS-002`.
4. No declarar éxito sin comandos, resultados y exit codes reales — `business-rules/system/BR-OPS-004`.
5. No inventar credenciales ni decisiones; registrar una acción humana en `human/`.
6. No ampliar alcance; lo adyacente vuelve al INBOX.
7. No reescribir este proceso dentro de una tarea de producto.
8. No push, amend, force, deploy o escritura externa sin autorización explícita.
9. Todo gate manual dice qué pasó, qué debe hacer la persona y cómo continuar.
10. El repositorio de código, no planning, es dueño del commit de producto.

## Razones de parada

Toda parada se nombra con una de éstas, en cualquier runner. Van agrupadas por familia, que es el tramo donde
paró y lo primero que dice quién la destraba:

- **Arranque** — no se pudo leer el contrato, el estado o el adaptador: `adapter-stale` · `agent-unavailable` ·
  `contract-unavailable` · `context-unavailable` · `root-unreadable`
- **Cola** — hay trabajo y no se pudo tomar: `queue-unavailable` · `claim-stuck` · `manual-held` ·
  `manual-critical` · `worktree-failed`
- **Persona** — lo que sigue lo decide o lo aprueba alguien: `awaiting-review` · `blocked-on-human` ·
  `governance-approval-needed`
- **Preparación** — la tarea no está lista, o no se pudo reescribir o partir: `not-ready` · `refine-not-applied` ·
  `refine-unwritable` · `split-not-applied` · `split-left-dependents`
- **Plan** — ningún plan sobrevivió a la crítica, o no quedó escrito: `plan-rejected` · `plan-blocked` ·
  `critique-unbacked` · `wip-malformed` · `wip-not-persisted`
- **Construcción** — lo construido no se puede dar por bueno: `build-blocked` · `build-closed-task` ·
  `build-unproven` · `edge-unproven`
- **Revisión** — la revisión no aprobó, o aprobó sin respaldo: `review-blocked` · `review-failed` ·
  `review-unbacked` · `review-unverified`
- **Verificación** — un criterio sin prueba, una prueba que no corrió o un QA en rojo: `verify-failed` ·
  `verify-hollow` · `verify-untested` · `acceptance-ambiguous` · `qa-failed`
- **Cierre** — el trabajo está y no se pudo commitear o cerrar: `commit-failed` · `commit-needs-approval` ·
  `planning-check-failed` · `milestone-too-long`

Deprecadas: `review-unresolved` (usá `review-failed`), `verify-regression` y `verify-inconsistent` (usá
`verify-failed`) y `budget-low` (usá `milestone-too-long`). La lista las nombraba y ningún recorrido las emitía;
se borran en 1.0.0.

Y deja el estado consistente: la tarea sin marcar, el WIP activo si es resumible, y —si necesita a una
persona— la acción en `human/` o el checkpoint del hito ya escritos.

`ops context` emite las dos que puede determinar solo, `awaiting-review` y `blocked-on-human`; las
demás las nombra la fase que para, que es la única que sabe por qué.
