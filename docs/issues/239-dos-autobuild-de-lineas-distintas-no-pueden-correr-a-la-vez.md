---
caso: 239
titulo: dos autobuild de líneas distintas no pueden correr a la vez sobre la misma instancia
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 239 — Dos líneas de trabajo con su propio autobuild se pisan, aunque no compartan ni un archivo de producto

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta** — cada línea ve sólo sus hitos (`line:` en el
hito, línea por rama), y los reclamos se leen entre worktrees. La pieza 2 ya la resolvía `ops line` (caso 218).

**Prioridad alta**: no es un choque que git frene. El loop de una línea puede tomar y construir la tarea de la otra,
commitear el estado de su planning en la rama de la otra, o directamente no ver su cola. La salida que queda hoy es
correr un autobuild por vez, que convierte a dos personas —o dos sesiones de la misma persona— en una sola cola.

## Resumen

Una instancia con dos líneas de trabajo en paralelo (cada una con su dueño, su rama de planning y su sesión) no
puede tener un autobuild por línea. Las dos líneas trabajan sobre repositorios de producto distintos —en el caso que lo
originó, una toca sólo `backend-auth` y `frontend-auth` y la otra sólo `admin`—, así que el código no se cruza. Lo que
se cruza es la maquinaria:

1. **El autobuild tiene una sola instancia de planning, fija al instalar.** `automatization/shared/workflow-root.js:15`
   arma `ROOT = '{{OPS_ROOT}}'`, que el instalador rellena con una ruta absoluta. Todos los workflows (`autobuild`,
   `flow`, `fork-deliver`, `agent-*`, `integration-*`) leen y escriben el planning de ese árbol, y de ningún otro.
2. **Ese árbol está en la rama de una sola línea.** Cuando cada línea lleva su estado en su propia rama de planning
   —una rama de larga vida por línea, con un PR que se va sumando, que es la forma con la que la instancia evitó los
   choques del caso 212—, el árbol fijo está en la rama de una de ellas. El autobuild de la otra no ve su BACKLOG, y si
   corre, sus reclamos, bitácoras y cierres se commitean en la rama ajena.
3. **El Pick no conoce la línea.** `engine/planning/state.js:44-98` (`currentTask`) ofrece primero lo que el runner ya
   reclamó y, si no hay nada, la primera tarea libre y lista **de cualquier hito**. Un `owner:` en la épica o en la
   tarea no cambia lo que se ofrece. Los reclamos impiden que dos runners construyan *la misma* tarea a la vez; no
   impiden que el runner de una línea tome la tarea libre de la otra, que es lo que pasa en cuanto su propia cola se
   vacía.

Los árboles de trabajo por tarea en el repositorio de producto (`test/planning/worktree.test.js`) ya resuelven la otra
mitad: dos agentes no se pisan el código. Falta lo mismo para el planning.

## Reproducción

En la instancia del caso (Cauce 0.99.2), verificado el 2026-10-01 leyendo el código y el estado de los árboles:

1. Árbol principal de la instancia, `roax-ops/`, en la rama `work/manuel-auth`, con trabajo de esa línea sin
   commitear. Sus workflows instalados en `.claude/workflows/` traen `ROOT = '/home/…/servers/roax-ops'`
   (`autobuild.js:43`).
2. La segunda línea trabaja en un worktree, `.wt-roax-ops-manuel-admin/`, en `work/manuel-admin`. Ahí promueve su hito
   (`## Hito admin-pregunta-a-auth-por-la-sesion`, tareas con `(owner: manuel/admin)`).
3. Lanzar `/autobuild` desde la sesión de la segunda línea: lee `roax-ops/planning/BACKLOG.md` del árbol principal, que
   no tiene ese hito. La cola que ve es la de la otra línea.
4. Llevar el hito a `main` y que la primera línea traiga `main`: ahora las dos colas están en el mismo archivo. Con su
   propio hito terminado, el autobuild de la primera línea ofrece la tarea de la segunda —`currentTask` no mira el
   `owner`—, la reclama y la construye.

## Síntoma

- La persona que trabaja la segunda línea no puede usar el autobuild mientras la primera tenga una sesión abierta: la
  única forma segura es correr de a uno y cambiar de rama el árbol principal entre corrida y corrida.
- Si lo intenta igual, el error no se ve: la corrida termina en verde, con la tarea correcta construida por el runner
  equivocado, o con el estado de su línea commiteado en la rama de la otra.

## Causa raíz

Cauce modela **una** instancia de planning con **varios runners** que comparten una cola. La instancia del caso trabaja
con **varias líneas**, cada una con su cola y su rama de planning. Son dos cosas distintas y Cauce sólo tiene la
primera: la identidad que existe es el runner (`claims/<slug>.md`, `wip/<runner>.md`) y no la línea.

- `ROOT` es una constante por instalación, no por línea ni por proceso.
- `currentTask` filtra por runner (lo reclamado) y no por dueño o línea (lo asignado).
- Los commits de planning van a la rama que tenga el árbol en ese momento.

## Fix propuesto

Tres piezas, de la más chica a la más grande. Cada una sirve sola.

1. **La línea del runner filtra el Pick.** Una variable o un argumento del workflow (`CAUCE_LINE=manuel/admin`, o
   `/autobuild line=manuel/admin`) que `currentTask` use así: ofrece las tareas cuyo `owner` —propio o heredado de la
   épica— es esa línea, y las sin dueño sólo si se pide explícitamente. Sin línea declarada se comporta como hoy.

   ```diff
   -  return { task: claimed || pending.find((task) => !others.has(task.slug) && ready(task)) || null,
   +  const mineByLine = (task) => !line || task.owner === line || (allowUnowned && !task.owner)
   +  return { task: claimed || pending.find((task) => !others.has(task.slug) && ready(task) && mineByLine(task)) || null,
   ```

   Con esto, aunque las dos colas estén en el mismo archivo, ninguna línea toma la tarea de la otra.

2. **El planning se resuelve por proceso, no por instalación.** `workflow-root.js` toma `CAUCE_OPS_ROOT` (o el árbol de
   planning más cercano al directorio de trabajo) antes que la constante instalada. Así cada línea corre su autobuild
   sobre su propio worktree de planning, en su propia rama, y sus commits caen ahí.

3. **Los reclamos se ven entre worktrees del mismo repositorio de planning.** Si cada línea tiene su worktree,
   `claims/` deja de ser un directorio compartido. Guardarlos en un lugar común a los worktrees —por ejemplo bajo
   `git rev-parse --git-common-dir`— mantiene la promesa de ADR-002 («en una misma máquina coordina por el sistema de
   archivos») sin depender de que las dos líneas estén en el mismo árbol.

## Tradeoffs

- La pieza 1 sola no alcanza si cada línea lleva su rama de planning: el autobuild sigue leyendo el árbol fijo. Sí
  alcanza en una instancia que comparte una sola rama de planning.
- La pieza 2 hace que el mismo workflow escriba en árboles distintos según desde dónde se lance: hay que mostrar en el
  arranque qué planning y qué rama está usando, o el error del caso pasa a ser invisible de otra forma.
- La pieza 3 mueve estado fuera del árbol versionado; `ops claim` y `ops release` tienen que seguir siendo la única
  forma de escribirlo.

## Contexto de descubrimiento

Instancia `roax-ops` (Cauce 0.99.2), 2026-10-01. Dos sesiones en paralelo de la misma persona: la línea `manuel/auth`
corría su autobuild sobre el árbol principal mientras la línea `manuel/admin` quería lanzar el suyo para la épica 059,
que toca sólo el repo `admin`. Al revisar si se podía, se encontró que el autobuild de admin no veía su cola (piezas 1
y 2) y que, una vez en `main`, el loop de auth la habría tomado (pieza 3 del resumen). Quien trabaja las dos líneas lo
dijo así: «este problema de que pise al otro a pesar de que no trabajamos en lo mismo … estaría mal que en estos
momentos no podamos hacerlo».

## Relacionados

- Caso 212 — los archivos de estado compartidos chocan entre líneas: de ahí sale la rama de planning por línea, que es
  lo que el árbol fijo no contempla.
- ADR-002 de la instancia — coordinación multi-runner por el sistema de archivos.
- `test/planning/worktree.test.js` — los árboles de trabajo por tarea en el producto, la mitad que ya existe.

## Cierre

Resuelto el 2026-10-02 con las dos decisiones de Manuel: la línea de un hito se declara con `line:` en su
`backlog/<hito>.md` y la línea de un árbol sale de su rama `line/<nombre>`; los reclamos de los otros worktrees
se leen donde están, sin mudarlos.

**Lo que encontró contrastar el caso contra `main`.** Estaba escrito sobre 0.99.2, y tres de sus premisas ya no
valían o nunca valieron:

- **La pieza 2 ya estaba resuelta, y como el caso la proponía no se podía hacer.** El encabezado de
  `automatization/shared/workflow-root.js` dice que el runtime de workflows no expone `process`, así que
  `CAUCE_OPS_ROOT` no se puede leer ahí. Pero `ops line` (caso 218, mergeado el mismo día en que se escribió
  éste) instala los runners en la carpeta de cada línea. Medido en un banco: el autobuild del principal trae
  `ROOT = '…/emp239/ops'` y el de la línea `ROOT = '…/emp239-admin/ops'`.
- **`owner:` no existe en el formato de tareas de Cauce.** Era una convención de roax, y `engine/planning/backlog.js`
  no lo lee. El lugar donde declararlo ya existía desde el caso 212: el frontmatter del archivo de cada hito.
- **La pieza 3 era peor de lo que decía el caso.** El caso suponía que los reclamos impedían que dos runners
  construyeran la misma tarea. Entre worktrees no lo impedían: en el banco, el principal y la línea reclamaron
  los dos `auth-token`, y los dos `claim` salieron bien.

La reproducción del paso 4 del caso también se corrió antes del arreglo: desde la línea `admin`, `ops context`
ofrecía `auth-token`, la tarea de la otra línea.

**Lo que se corrió para saber que funciona.**

- **El banco con el motor arreglado.** Una empresa sidecar con dos repositorios, la línea creada con `ops line .
  admin`, `line: admin` declarado en su hito y mergeado en las dos direcciones, así que las dos colas estaban en
  los dos árboles:
  - El principal ofrece `auth-token` y dice `LINE (ninguna) — de otras líneas, no se ofrecen: admin-pregunta`.
  - La línea ofrece `admin-consulta` y dice `LINE admin — … no se ofrecen: auth-sesion`.
  - Cada una reclamó la suya. La línea pidiendo `auth-token` salió 1 con `auth-token no es de ninguna línea: se
    toma desde el árbol principal.`
  - Una segunda sesión del principal recibió `TAKEN auth-token`.
- **Mutaciones en una copia**, cada una en rojo por `test/planning/lines.test.js`:
  - sin el filtro por línea;
  - `claim` sin la línea;
  - sin los reclamos de otros árboles;
  - sin la excepción de lo propio;
  - `check` sin validar el nombre;
  - la línea sin leer la rama;
  - `context` sin los reclamos de otros árboles.
- **Lo que no se corrió:** un `/autobuild` entero en cada línea. Su Pick decide sólo con `ops context` y `ops
  claim`, corridos desde su `ROOT` (`automatization/workflows/autobuild.js`, `readContext` y la fase de
  reclamo), y esos dos comandos son los que se corrieron arriba. Una corrida entera construiría y revisaría las
  dos tareas, para medir lo mismo.

**Recorrido de lo que el caso enumeraba:**

- **Pieza 1, la línea filtra el Pick** — se hizo distinto: con `line:` en el hito y la línea leída de la rama, en
  vez de `CAUCE_LINE` o un argumento, porque un argumento olvidado reproduce el caso en silencio. Un hito sin
  línea es del árbol principal. `claim` contesta lo mismo que `context`, y lo que ya tenés no se esconde.
- **Pieza 2, el planning por proceso** — ya resuelta por `ops line`. Medido arriba.
- **Pieza 3, los reclamos entre worktrees** — se hizo distinto: no se mudan a `git-common-dir`. `context` y
  `claim` leen `planning/claims/` de cada worktree de la instancia (`git worktree list`), y los reclamos siguen
  siendo archivos versionados. `check` no los lee: un reclamo de otra rama nombra una tarea que en ésta puede no
  existir, y marcarlo como error sería falso.
- **Tradeoff: la pieza 1 sola no alcanza con una rama de planning por línea** — con `ops line` sí alcanza: cada
  línea lee su árbol, y el filtro decide qué toma de él.
- **Tradeoff: mostrar qué planning y qué rama usa** — `context` muestra la línea `LINE`, y en JSON los campos
  `line` y `otherLines`. Qué árbol usa lo fija el `ROOT` de cada carpeta, que escribe `ops line`.
- **Tradeoff: la pieza 3 mueve estado fuera del árbol** — no aplica: no se mueve nada.

**Lo que el caso no preveía.**

- Dos líneas en máquinas distintas siguen viendo sólo lo que ya se empujó. Es la misma ventana que
  `delivery/teamwork.md` ya describe para cualquier reclamo.
- Un árbol en una rama que no es `line/…` cuenta como principal. Dos de ésos ven la misma cola, y entre ellos
  protege la lectura de reclamos de la pieza 3: lo cubre una prueba con un worktree en `feat/otra`.
