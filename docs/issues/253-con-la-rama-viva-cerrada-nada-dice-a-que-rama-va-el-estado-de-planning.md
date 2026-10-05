---
caso: 253
titulo: con la rama viva cerrada nada dice a qué rama va el estado de planning
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 253 — Cauce deja cerrar `main` al push, pero no dice dónde se commitea entonces `planning/`

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada ni pierde trabajo, pero cada instancia inventa la respuesta por su
cuenta, y la que no la escribió termina con una rama y un PR por cada cambio de estado de la cola.

## Resumen

Con `main` fuera de `runner.pushToLiveBranches`, el estado de planning —reclamos, cola, `done/`, INBOX,
acciones humanas— ya no puede ir directo a `main` y tiene que entrar por rama y PR. Cauce no declara cuál
es esa rama ni que deba ser siempre la misma. El agente la elige cada vez, y lo natural leyendo «rama y
PR» es cortar una por cambio.

## Reproducción

Observada en `initech-ops` (sidecar, 0.100.0) el 2026-10-05, con `main` cerrado al push desde el
2026-10-02 por regla propia (P36: «el trabajo de cada repo va en una rama cortada de su `main` y entra por
un PR»):

1. Se cierra una tarea: `done/<slug>.md`, la línea fuera del backlog, la fila de `HUMAN_ACTIONS.md` y tres
   entradas de INBOX.
2. El agente corta `docs/reconexion-credencial-cierre`, commitea ahí y abre el PR #1 de `initech-ops`.
3. El mismo día corta otra rama para un cambio de guard que también tocaba una regla, y abre el PR #2.

## Síntoma

- Un PR por tarea cerrada: el operador mergea una vez por cada cambio de estado.
- El estado de la cola queda repartido entre ramas sin mergear. `check` corrido en la segunda rama contó
  12 tareas en cola y 89 terminadas, y en la primera 11 y 90: dos lecturas distintas del mismo planning
  en la misma máquina, según dónde estuviera parado el repo.
- El operador lo corrigió a mano: «todo lo que termina tocando planning genera su commit, pero sobre la
  rama de esta sesión, y ese trabajo se va acumulando».

## Causa raíz

Nada en el paquete nombra una rama para planning (leído en 0.100.0):

- `grep -rIn -i 'rama de trabajo'` sobre `template/AGENTS.md`, `template/planning/PROTOCOL.md` y
  `template/planning/rules/system/` no devuelve nada. La expresión aparece sólo en
  `engine/hooks/push.js:16` y `:110`, donde clasifica un push, no dónde se commitea.
- `engine/cli/claims.js:91` pide «commiteá y empujá claims/<slug>.md para que el equipo lo vea», sin decir
  a qué rama.
- `automatization/workflows/autobuild.js:1330` (fase Done) escribe el cierre en `planning/` y lo deja en
  la rama en la que esté parado el repo de la instancia.
- No existe ninguna clave de configuración para esto: `grep -rn 'workBranch\|planningBranch' engine
  template` no devuelve nada.

`acme-ops` lo resolvió por fuera, en un ADR propio (009, decisión 6): una rama `work/<persona>-<línea>`
con un solo PR abierto que se va sumando, y rama aparte sólo para guards, runner y CI.

## Fix propuesto

Tres piezas, de menor a mayor:

1. **Configuración**: una clave en `ops.config.json`, por ejemplo `planning.workBranch`, con la rama
   donde se acumula el estado. Sin la clave, el comportamiento de hoy.
2. **Que el motor la use**: `claim`, `release` y la fase Done commitean el estado en esa rama, y
   `context` avisa si el repo de la instancia está parado en otra.
3. **Un guard**: frenar el commit que toca `planning/` desde una rama que no sea la declarada, salvo
   rutas de gobernanza que la instancia marque como de PR aparte.

Y una línea en `PROTOCOL.md` → Done: el estado de planning va a la rama de trabajo de la instancia, que
tiene un solo PR abierto.

## Tradeoffs

- Una rama larga diverge de `main`: hace falta decir que se pone al día con merge y no con rebase, porque
  ya está publicada.
- Lo que sólo vive en la rama de trabajo no lo ve otra persona hasta el merge, incluido un reclamo.
  `acme-ops` lo vivió: una clave de Jira quedó en el PR de una línea y otra sesión creó la misma épica 35
  minutos después.
- En una instancia de una sola persona con `main` abierto al push, la clave no hace falta y no debería
  exigirse.

## Validación del 2026-10-05

Contrastado contra el fuente de `0.100.0`.

**Lo que se sostiene.** Las cuatro citas: «rama de trabajo» aparece sólo en `engine/hooks/push.js:16` y
`:110`; `engine/cli/claims.js:91` pide commitear y empujar el reclamo sin nombrar rama; la fase Done está
en `autobuild.js:1330` y su prompt no nombra rama; y no hay clave `workBranch` ni `planningBranch`. El
commit `7be7b1c` existe en `initech-ops`, rama `work/manuel`. El ADR 009 de `acme-ops` no se abrió: no se
encontró en esta máquina.

**Lo que el caso no nombra: `ops line`.** Desde 0.100.0 una línea de trabajo es un worktree del
repositorio de la instancia en la rama `line/<nombre>` (`engine/cli/lines.js`, caso 218), y `context` y
`claim` leen los reclamos de los otros árboles. O sea que para quien trabaja en una línea, la rama del
estado de planning **ya está declarada y ya es una sola**. Es casi la `work/<persona>-<línea>` de acme
con otro prefijo. Lo que queda sin respuesta es el árbol principal: una instancia con `main` cerrado y
sin líneas.

**Qué cambia en el fix.** `planning.workBranch` duplicaría lo que `ops line` ya resuelve. Las dos formas
que quedan, y elegir es del dueño:

1. **Con `main` cerrado, se trabaja en una línea.** Sin clave nueva: `context` avisa cuando el repo de la
   instancia está parado en una rama viva que no admite push, y dice `ops line`. La línea de PROTOCOL
   nombra eso.
2. **Una rama de trabajo para el árbol principal**, con la clave del fix de arriba, para quien no quiere
   un segundo árbol.

**Aclarado por el dueño el 2026-10-05**: se trabaja siempre sobre la carpeta que se tiene al frente, y una
rama o un segundo árbol se arman sólo cuando hacen falta o cuando dos sesiones se tocan. Eso descarta la
primera forma como respuesta general —una línea es un segundo árbol— y deja la segunda: una rama de
trabajo en la misma carpeta, con `ops line` reservado para dos sesiones a la vez.

El punto 3 del fix —un guard sobre el commit que toca `planning/`— es de la misma familia que el 255 y
conviene decidirlos juntos.

**No reproducido corriendo.** Lo que el caso describe es una ausencia; se comprobó leyendo. Los dos
conteos de `check` (12 y 89 contra 11 y 90) no se pudieron repetir: esas ramas ya no están.


Sesión de initech del 2026-10-05, al cerrar a mano la tarea que originó el caso 248. La regla quedó
escrita en la instancia como agregado a P36 (`initech-ops/planning/rules/commits-and-release.md`, rama
`work/manuel`, commit `7be7b1c`), tomada de `acme-ops/planning/adr/009-acme-ops-se-versiona-en-su-propio-repositorio.md`.

## Relacionados

- 251 — el paso de Commit no corta rama y commitea en la rama viva: el mismo hueco del lado del repo del
  servicio.
- 252 — autobuild no lee `args`: por eso pedirle la rama al lanzarlo tampoco lo resuelve.
- 248 — la corrida de la que salió este cierre a mano.
- 218 — las líneas de trabajo. `ops line` es la respuesta que ya existe para una parte de este caso.
- 255 — nada frena un commit en la rama viva fuera del recorrido.

## Cierre

**Resuelto en 0.101.0, con la pieza más chica: la regla escrita.** `PROTOCOL.md` → Done y `AGENTS.md`
dicen ahora dónde va el estado de planning cuando la rama viva no admite push: a una sola rama de trabajo
que se acumula, con un PR abierto, en la misma carpeta de la instancia.

### El recorrido de lo que este caso enumeró

- **Fix 1, una clave `planning.workBranch` — se decidió que no.** La regla no necesita saber el nombre de
  la rama: dice «la que ya exista». Una clave más es configuración que cada instancia tiene que mantener.
- **Fix 2, que `claim`, `release` y Done commiteen ahí y `context` avise — no se hizo.** Ninguno de los
  tres commitea hoy: escriben archivos y el commit lo hace quien cierra. Queda abierto si hace falta el
  aviso de `context`: lo activa la primera instancia que, con la regla ya escrita, vuelva a cortar una
  rama por cambio.
- **Fix 3, un guard sobre el commit que toca `planning/` — se decidió que no.** Es un freno más, y el
  criterio del dueño del 2026-10-05 es dejar sólo los importantes. Va junto con el 255.
- **«Una línea en `PROTOCOL.md` → Done» — se hizo.**
- **Las dos formas de la validación — se tomó la segunda**, por la aclaración del dueño: rama en la misma
  carpeta, y `ops line` sólo para dos sesiones a la vez.
- **Tradeoff «una rama larga diverge de `main`: merge y no rebase» — no se escribió.** Reescribir historia
  publicada ya lo frena R8; qué hacer para ponerla al día queda a criterio de quien la lleva.
- **Tradeoff «lo que vive en la rama de trabajo no lo ve otra persona hasta el merge» — sigue en pie.** Es
  el costo de cerrar `main`, y con dos sesiones la respuesta es `ops line`, que sí comparte reclamos.
- **Tradeoff «con `main` abierto no debería exigirse» — se cumple**: la regla rige sólo si la rama viva no
  admite push.
- **Síntoma, «dos lecturas distintas de `check` según la rama» — se va con una sola rama.** No se midió.

### Qué se corrió

- **Una sonda con un agente real y un repo de verdad.** Un repositorio de planning desechable parado en
  `main`, con una rama `work/estado` que ya traía un cierre anterior y con el cierre de una tarea sin
  commitear; el agente recibió el texto literal de la regla nueva y que `main` no admite push. Lo que la
  desmentía era que cortara una rama nueva. Comprobado en el disco: commiteó en `work/estado`, que quedó
  con sus dos cierres, `main` no se movió y no hay ninguna rama más.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: el caso sin ninguna rama de trabajo previa, y una corrida de `autobuild` cuya
  fase Done reciba la regla por su prompt —esa fase no commitea planning—.

