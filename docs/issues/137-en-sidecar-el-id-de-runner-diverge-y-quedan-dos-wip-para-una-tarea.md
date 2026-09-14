---
caso: 137
titulo: En sidecar el id de runner se resuelve distinto según quién pregunte, y una sola tarea termina con dos archivos de WIP
estado: resuelto
resuelto-en: 0.89.0
prioridad: media
version-detectada: 0.87.0
---

# 137 — `claim` y `context` no coinciden en quién sos, y el plan queda en un WIP que tu sesión no mira

**🟢 resuelto en 0.89.0** · detectado en 0.87.0 · prioridad **media** — el trabajo es recuperable, pero
`ops context` le dice a quien lo escribió que la tarea es de otro

## Resumen

En una instancia **sidecar**, el id de runner sale de dónde está parado quien invoca, y hay dos lugares
que lo resuelven distinto:

- `ops claim` guardó `runner: /home/manuel/Code/venotal` —la raíz del workspace— y el recorrido derivó de
  ahí el nombre del WIP: `planning/wip/home-manuel-code-venotal.md`.
- `ops context`, invocado desde `venotal-ops/`, resuelve `home-manuel-code-venotal-venotal-ops` y honra
  **sólo ese** archivo, que estaba en `IDLE`.

Resultado: la misma tarea, en la misma máquina y la misma persona, dejó **dos archivos en `planning/wip/`**
y la sesión que quiso retomarla vio `WIP idle` y `TAKEN … (vos, desde otro runner)`.

El diseño de `wip/<runner>.md` es correcto y su README lo explica bien —un plan por runner, porque en
sidecar todos comparten `planning/`—. Lo que falla es que **el id no es estable para el mismo actor**.

## Reproducción

Instancia sidecar real, 0.87.0, runner Claude Code. Workspace en `/home/manuel/Code/venotal`, instancia en
`venotal-ops/`.

1. Lanzar el recorrido `autobuild`. Su fase Claim corre `ops claim` y escribe
   `claims/retirar-guias-mcp-obsoletas.md` con `runner: /home/manuel/Code/venotal`.
2. La fase WIP deriva el nombre del archivo de ese campo y escribe `wip/home-manuel-code-venotal.md` con
   el plan, `phase: Build` y el paso tildado.
3. Desde `venotal-ops/`, correr `node tools/ops.js context planning`.

Devuelve:

```
WIP    idle
TAKEN  retirar-guias-mcp-obsoletas (malpisa1@gmail.com — vos, desde otro runner)
```

Y `ls planning/wip/` muestra los dos:

```
home-manuel-code-venotal.md              ← el plan real, phase: Build
home-manuel-code-venotal-venotal-ops.md  ← status: IDLE
```

## Síntoma

El gate 2 del protocolo dice «si tu WIP está activo, la tarea es ésa». Con el id divergente ese gate no
dispara: la sesión arranca creyendo que no tiene nada en vuelo, y el plan escrito —con qué pasos están
hechos— queda invisible para ella. Es exactamente el caso que el WIP existe para evitar.

Y no hay señal de que algo esté mal: los dos archivos son válidos, `check` queda en verde, y el aviso
`TAKEN … vos, desde otro runner` se lee como información y no como defecto.

## Causa raíz

No verificada en el motor; lo que sí está medido es el comportamiento observable de arriba. La hipótesis
es que el id se deriva de la raíz git del directorio desde el que corre el comando
(`engine/planning/claims.js` lo hacía así según el caso 118), y en sidecar hay dos raíces plausibles —el
workspace y la instancia— según desde dónde se invoque.

## Fix propuesto

1. **Que el id sea uno por sesión y no por invocación.** Si el recorrido ya tiene un reclamo, el WIP debe
   derivarse del mismo id que ese reclamo guardó, y `context` debe honrar el WIP del runner que tiene el
   reclamo de la tarea que está por ofrecer.
2. **Que `context` avise cuando existe un WIP de otro id apuntando a una tarea tuya.** Hoy dice «de otro
   runner» sin decir que hay un plan escrito y dónde. Nombrar el archivo cuesta una línea y ahorra la
   sesión entera.
3. Alternativa más barata y suficiente: que `ops claim` imprima el `export CAUCE_RUNNER` que corresponde,
   como ya hace `ops worktree`.

## Tradeoffs

Unificar el id toca la misma pieza de la que dependen reclamos y WIP, así que hay que mirar los dos
juntos — es el mismo tradeoff que anotaba el caso 118 y que allá quedó descartado por otra razón.

## Contexto de descubrimiento

Corrida real del recorrido `autobuild` sobre una tarea `express` el 2026-09-14, instancia sidecar 0.87.0.
El recorrido paró en Verify y, al ir a retomar, la sesión no encontró su propio plan.

## Relacionados

- **118** — descartó que el chat se guardara por runner, pero dejó dicho que los reclamos sí. Esto es esa
  mitad, y en sidecar.
- **138**, **139** — la misma familia: supuestos sobre desde dónde se invoca, en modo sidecar.

## Cierre

**🟢 resuelto en 0.89.0** · `engine/planning/state.js`, `engine/cli/planning.js`, `engine/cli/claims.js`,
`test/planning/claims.test.js`, `test/repo/repo.test.js`

Se tomaron las opciones **2 y 3**, y la **1 se decidió que no**. El id sigue sin ser estable —no puede
serlo— y lo que cambia es que las dos veces que eso importa dejó de ser mudo: `claim` dice con qué id
volver, y `context` nombra el plan que quedó bajo el otro id.

### Contra lo que el caso enumeró

- **Causa raíz «no verificada en el motor»** — verificada, y precisada. `runner()`
  (`engine/planning/claims.js:53-57`) devuelve `CAUCE_RUNNER` y, sin ella, `git rev-parse --show-toplevel`
  del cwd. La hipótesis del caso era correcta. **Le faltaba la condición que la hace aparecer**: la
  instancia sidecar tiene que ser **su propio repositorio git**. Un banco sidecar sin eso devuelve el mismo
  id desde los dos lados y el defecto no ocurre; recién con `git init` adentro de `w-ops/` se reprodujo.
- **Opción 1, que el id sea uno por sesión y `context` honre el WIP del runner que tiene el reclamo** — se
  decidió que **no**, y es la decisión de fondo del caso. Para saber cuál reclamo es «mío» desde otro id
  habría que compararlo por **dueño**, y el dueño es lo que comparten todos los agentes de una máquina:
  `claims.js:43-46` explica que por eso la unidad es el árbol y no la identidad de git. Adoptarla volvería
  a fusionar justo lo que `wip/<runner>.md` existe para separar, y el defecto que reaparecería —dos agentes
  leyéndose el plan— es peor que éste, porque se pisan el trabajo en vez de no encontrarlo.
- **Opción 2, que `context` avise cuando hay un WIP de otro id apuntando a una tarea tuya** — construida.
  `currentTask` lleva en cada fila de `taken` el id crudo del reclamo y el archivo del plan que ese id dejó,
  y `context` imprime una línea `PLAN` cuando la fila es tuya y hay plan. El caso pedía «nombrar el archivo
  cuesta una línea»: además va el id, que es lo que hace falta para volver.
- **Opción 3, que `ops claim` imprima el `export CAUCE_RUNNER`** — construida, y resultó **no ser una
  alternativa sino la otra mitad**. El README de `template/planning/wip/` ya decía que para volver al día
  siguiente se exporta el mismo id «—`ops worktree` lo imprime—», y en sidecar no se crea ningún worktree:
  el único comando que lo decía nunca corre. La opción 3 cierra un lazo que la documentación daba por
  cerrado.
- **Tradeoff «unificar el id toca la misma pieza de la que dependen reclamos y WIP»** — se respetó no
  tocándola: `runner()` y `wipName()` quedaron igual. Lo que se agregó es qué se informa, no cómo se deriva.

### Lo que el caso no preveía

- **El motor ya había previsto sidecar, en el sentido contrario.** El comentario de `claims.js:48-52`
  describe la falla de que el id salga **igual para todos** y afirma que no queda en silencio, porque
  `claim` se niega a dar una segunda tarea. La del 137 es la inversa —ids distintos para el mismo actor— y
  ésa sí quedaba muda: los dos archivos son válidos, `check` queda verde y nada falla.
- **Tres archivos cruzaron las 500 líneas** por este cambio y el 138, estando en 495, 499 y 491. R7 pide
  decidir: `test/wiring/runners.test.js` entró en `JUSTIFIED` con el mismo criterio que sus hermanos —suma
  un caso por runner y todos comparten el montaje—, y `engine/cli/planning.js` y
  `engine/automation/index.js` entraron en `PENDING_SPLIT` con su partición nombrada. Partirlos acá habría
  sido la cola de otro cambio.
- **Una mutación mía no se aplicó y el script lo dijo.** El primer intento buscaba `: ""` donde el código
  dice `: ''`, así que no mutó nada; sin el aborto explícito habría leído «ninguna prueba cayó» como que la
  aserción no servía, cuando lo que no servía era la mutación.

### Qué se corrió

- **Reproducción real**, en banco sidecar desechable con dos raíces git. Antes: `claim` desde el workspace
  guarda `runner: …/workspace`, `context` desde ahí da `TASK demo-tarea` / `WIP Build · 1✓/1○`, y `context`
  desde `w-ops/` da `TASK (sin tarea disponible)` / `TAKEN demo-tarea (… — vos, desde otro runner)`, con los
  dos archivos conviviendo en `wip/`. Después: la misma invocación agrega
  `PLAN demo-tarea: su plan está en wip/<id>.md — retomalo con \`export CAUCE_RUNNER=…\``, y `claim` imprime
  `export CAUCE_RUNNER=…/w-ops`.
- **Rojo previo**: 4 pruebas en rojo antes del arreglo, dos de ellas preexistentes que ya montaban esta
  situación sin mirarla (`claims.test.js:87` y `:459`).
- **Mutaciones**, en copia por `tar` con verde de control 39/39: quitar el plan de `taken` mata «el plan de
  otro runner no se lee como propio» y nada más; quitar el id crudo mata ésa y además «lo reclamado por otro
  no se ofrece»; quitar la línea del `export` mata «claim deja escrito el id con el que se vuelve».
- **Pasada de comentarios R11 a 0.22**: los 10 párrafos nuevos entraron a la comparación y ninguno superó el
  umbral; los pares que aparecen sobre estos archivos son preexistentes y ajenos al cambio.
- **Verde**: `npm run ci` en 0 y **817 pruebas** (815 antes).
