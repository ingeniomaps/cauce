---
caso: 212
titulo: los archivos de estado compartidos chocan entre líneas de trabajo en paralelo
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 212 — `BACKLOG.md`, `INBOX.md` y los índices son un archivo por instancia, y dos líneas de trabajo chocan ahí

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no pierde trabajo, porque git frena y pide resolver a mano. Pero se repite cada vez que una línea
trae `main`, cuesta una resolución manual sobre el archivo que gobierna la cola, y una resolución equivocada
deja una tarea viva en dos lugares o resucita un hito que el otro lado ya había cerrado.

## Resumen

Cuando una instancia trabaja con varias líneas en paralelo (una rama de larga vida por persona o por línea, cada
una en su sesión), todas escriben los mismos archivos de estado: promover un hito agrega un bloque arriba de
`BACKLOG.md`, cerrar cada tarea borra su línea, el INBOX suma entradas bajo la sección de su servicio y el índice
de épicas suma una fila al final. Son ediciones en la misma zona del mismo archivo, así que cada vez que una línea
trae `main` choca.

Lo que ya está partido por unidad no choca nunca: un `done/<slug>.md` por tarea y un `epic-NNN-*.md` por épica. Es
la prueba de que partir resuelve el problema.

## Reproducción

Sin Cauce, con la forma que tiene el BACKLOG (verificado el 2026-10-01 con git 2.43.0):

```bash
D=$(mktemp -d); cd "$D"; git init -q -b main; git config user.email t@t; git config user.name t
mkdir planning; printf '# BACKLOG\n\n> Solo contiene lo que FALTA.\n\n' > planning/BACKLOG.md
git add planning/BACKLOG.md; git commit -qm base
git switch -qc work/a
printf '# BACKLOG\n\n> Solo contiene lo que FALTA.\n\n## Hito a-uno — Lo de la línea A\n\n- [ ] **tarea-a** [lite] — Algo. (epic: 001)\n' > planning/BACKLOG.md
git add planning/BACKLOG.md; git commit -qm "promote A"
git switch -q main; git switch -qc work/b
printf '# BACKLOG\n\n> Solo contiene lo que FALTA.\n\n## Hito b-uno — Lo de la línea B\n\n- [ ] **tarea-b** [lite] — Otra. (epic: 002)\n' > planning/BACKLOG.md
git add planning/BACKLOG.md; git commit -qm "promote B"
git switch -q main; git merge -q --no-edit work/a
git switch -q work/b; git merge --no-edit main
```

## Síntoma

```
CONFLICTO (contenido): Conflicto de fusión en planning/BACKLOG.md
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
```

En una instancia real (`acme-ops`, Cauce 0.99.2), el repo existe desde el 2026-09-28. Al 2026-10-01 tiene 73
merges, 6 PR de dos líneas de trabajo (`work/manuel-admin`, `work/manuel-auth`) y 40 de sistema. Reproduciendo
cada merge con `git merge-tree --write-tree`, **4 dieron conflicto, todos al traer `main` a una rama de línea**:

| Archivo | Veces en conflicto |
|---|---|
| `planning/BACKLOG.md` | **3** (`64dbf4f`, `ca823da`, `903d4c6`) |
| `planning/roadmap/README.md` | 1 |
| `planning/INBOX.md` | 1 |
| `automatization/settings.json` | 1 (con PR de sistema, no entre líneas) |
| `planning/roadmap/iniciativas/<slug>.md` | 1 |

Los archivos que tocan las dos líneas, contando los PR que cada una llevó a `main`:

| Archivo | PR de admin | PR de auth |
|---|---|---|
| `planning/BACKLOG.md` | 2 | 2 |
| `planning/INBOX.md` | 2 | 2 |
| `planning/roadmap/README.md` | 2 | 2 |

Límite de la medición: sólo ve los conflictos que quedaron en un commit de merge; uno resuelto con un rebase o
abortado no aparece.

## Causa raíz

El motor da por hecho un archivo por instancia:

- `engine/planning/parser.js:239` — `readBacklog` lee un solo `BACKLOG.md`.
- `engine/planning/structure.js:46` — «El BACKLOG es la única cola»; `validateBacklogStructure` (`:50`) lee ese mismo
  archivo.
- `engine/cli/io.js:69` — un planning se reconoce porque existe `BACKLOG.md`.
- `engine/planning/parser.js:456` — `inboxSections` lee un solo `INBOX.md`.

El índice de épicas con fila manual no es del motor: lo exige el `check.js` de la instancia
(`acme-ops/planning/check.js:245`, «falta la fila de la épica … agregala a mano»). Se nombra acá porque choca por el
mismo mecanismo, y porque una instancia lo copia del molde.

## Fix propuesto

Es una propuesta, no una decisión. La idea es la misma que ya funciona con `done/` y `roadmap/`: **un archivo por
unidad que una sola línea escribe**.

1. **Cola partida por línea.** `planning/backlog/<línea>.md`, uno por línea de trabajo, además de `BACKLOG.md` o en
   su lugar. `readBacklog` y `validateBacklogStructure` leen el directorio y concatenan, y el orden entre líneas sale
   de un campo explícito (prioridad del hito) en vez de la posición en el archivo. Si la instancia declara dueños
   (`owner: <persona>/<línea>`, como `acme-ops`), la línea sale de ahí.
2. **INBOX por entrada.** `planning/inbox/<servicio>/<slug>.md`, y el `INBOX.md` pasa a vista derivada. Agregar y
   quitar una entrada deja de tocar un archivo que todos editan.
3. **Índices derivados, nunca a mano.** El índice de épicas se genera con `check --fix` desde el frontmatter, con el
   título incluido, y lleva `merge=union` en el `.gitattributes` del molde. Una fila que sólo se agrega puede
   unirse sin riesgo; la vista se regenera igual.
4. **Números sin carrera.** Las épicas toman «el próximo NNN» (`automatization/workflows/flow.js:505`) leyendo un árbol
   que la otra línea todavía no trajo: en `acme-ops` dos sesiones tomaron la 055 el mismo día. Es el mismo problema
   que `docs/issues/README.md` nombra para los casos (el 164). Opciones: un prefijo por línea, o asignar el número
   al mergear a `main`.

**Lo que no sirve**: `merge=union` para el BACKLOG. Une las líneas de los dos lados, así que una tarea que un lado
cerró y el otro no tocó vuelve a aparecer sin que nada falle. En `903d4c6` habría resucitado tres hitos vacíos que
`main` ya había quitado.

**Alcance, al mejorar el caso (2026-10-01).** Corriéndolo salieron cuatro cosas distintas, y este caso queda con
la central —el BACKLOG, 3 de los 4 conflictos medidos—. El resto sale como caso propio:

- **INBOX por entrada** (punto 2) → caso 216: mismo mecanismo, otra vida —entradas sueltas, sin orden de cola—.
- **Números de épica sin carrera** (punto 4) → caso 217: es otro defecto, aunque aparezca en la misma situación.
- **Hooks enlazados al árbol de la otra línea** (el problema vecino de «Contexto») → caso 218, para verificarlo.
- **Índice de épicas a mano** (punto 3) → no es de Cauce: el `roadmap/README.md` del molde no tiene ninguna tabla
  (`grep -c "|"` da 0) y «agregala a mano» no aparece en el motor. Lo que el caso afirmaba —que una instancia lo
  copia del molde— no se sostiene; es de la propia instancia.

Se verificó además la advertencia sobre `merge=union`: con un hito cerrado en `main` y otro promovido en la línea,
el merge sale limpio y deja `## Hito x — Viejo` vacío pegado al hito nuevo. Rompe en silencio, como decía.

**Decidido con Manuel**: un archivo **por hito** —`backlog/<slug>.md`, con `order` en el frontmatter—, y no por
línea de trabajo, que obligaría al motor a conocer qué es una «línea» y dejaría chocando a dos personas en la
misma. `BACKLOG.md` sigue leyéndose primero, así que ninguna instancia tiene que migrar para seguir andando;
`ops split-backlog` hace la migración cuando la quiera.

## Tradeoffs

- La cola deja de verse entera en un archivo. `cauce tree` tiene que mostrarla unida, o se pierde la vista de un
  vistazo.
- El orden entre líneas se vuelve explícito: hoy lo decide la posición en el archivo, y partirlo obliga a declararlo.
- Las instancias que ya existen necesitan una migración (`upgrade`) de `BACKLOG.md` a `backlog/`.

## Contexto de descubrimiento

`acme-ops`, Cauce 0.99.2, 2026-10-01. Dos sesiones en paralelo, una por línea (`manuel/admin` y `manuel/auth`), cada
una con su rama `work/<persona>-<línea>` y PR a `main`. Al traer `main` a `work/manuel-admin` para ponerla al día,
chocaron `BACKLOG.md` y `roadmap/README.md`; ya había pasado dos veces en la rama de auth. La persona que opera la
instancia preguntó qué archivos chocaban más, y la medición de arriba salió de reproducir los 73 merges.

Un problema vecino que no es de git y conviene tener a la vista: en esa instancia los hooks de `.claude/` apuntan
por enlace al árbol principal del repo ops, que estaba en la rama de la otra sesión. Un guard mergeado a `main` no
regía para esta sesión hasta que la otra trajera `main`.

## Relacionados

- `docs/issues/README.md` → «Cómo se nombra»: la colisión de números entre sesiones (el 164), la misma carrera del
  punto 4.

## Cierre

Recorrido contra el caso entero:

- **Fix 1, cola partida** → se hizo por hito, no por línea (decisión arriba). `engine/planning/backlog.js` lee
  `BACKLOG.md` y `backlog/*.md` por `order`; cada tarea sabe en qué archivo vive y `context` lo entrega.
  `check` exige un hito por archivo, con su nombre y su `order`, y ningún hito en dos archivos. `autobuild`
  clasifica y protege la cola entera, y parte y cierra en el archivo de la tarea, borrándolo si queda vacío.
- **Fix 2, INBOX** → caso propio, 216.
- **Fix 3, índices** → no es de Cauce (arriba).
- **Fix 4, números** → caso propio, 217.
- **Lo que no sirve, `merge=union`** → verificado: rompe en silencio.
- **Tradeoff, la cola no se ve entera** → resuelto sin hacer nada: `tree` y `context` leen la unión.
- **Tradeoff, orden explícito** → es el `order`, y `check` lo exige en cada archivo partido.
- **Tradeoff, migración** → `ops split-backlog`, opcional; no pisa nada si un archivo de hito ya existe.
- **Lo que el caso no preveía:** `parser.js` cruzó las 500 líneas; la cola salió a su propio módulo.
- **Lo que encontró la revisión del conjunto, antes del PR:** `split-backlog` sacaba del comentario el hito de
  ejemplo que trae el `BACKLOG.md` del molde y dejaba sus cuatro tareas de ejemplo en cola; y un hito repetido
  hacía que el segundo pisara al primero y sus tareas no quedaran en ningún lado. Lo comentado ahora se queda
  donde está, y un hito repetido hace que el comando se niegue sin escribir. Comprobado en real: `split-backlog`
  sobre una instancia recién creada con `init` contesta «no tiene hitos que partir» y la cola sigue vacía; y con
  sus mutaciones vistas en rojo.

**Probado corriendo.**
- La reproducción del caso, con git 2.43.0: el mismo `CONFLICTO (contenido)` en `BACKLOG.md`. Y la misma
  situación con la cola partida, en `test/planning/backlog-split.test.js`: dos líneas promueven cada una su hito y
  una trae a la otra **sin conflicto**, con git real.
- Mutaciones vistas en rojo: leer sólo `BACKLOG.md`, ordenar por nombre —sobrevivió primero porque los nombres de
  la prueba ordenaban igual que `order`; se cambiaron—, tareas sin archivo, hito repetido aceptado, varios hitos
  por archivo, `order` opcional, `split-backlog` que pisa, `context` sin archivo y Done sobre `BACKLOG.md`.
- **Real**, en un banco fuera del árbol: `ops split-backlog` pasó dos hitos a sus archivos y `check` pasó.
  El paso de Classify con su prompt textual (`claude -p`, USD 0,38) escribió el carril y el reparto dentro de
  `backlog/alta.md` sin tocar `BACKLOG.md`; el de Done (USD 0,38) sacó la tarea de `backlog/viejo.md` y borró el
  archivo, y `tree` mostró la cola sin ese hito.
