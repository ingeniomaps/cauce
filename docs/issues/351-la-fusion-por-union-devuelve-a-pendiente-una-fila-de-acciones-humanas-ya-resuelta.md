---
caso: 351
titulo: La fusión por unión devuelve a pendiente una fila de acciones humanas ya resuelta
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 351 — Con dos líneas de trabajo, `merge=union` devuelve a `pendiente` una fila de `HUMAN_ACTIONS.md` que una persona ya resolvió, sin conflicto y sin que `check` lo diga

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no se pierde nada ni se abre nada —la fila revivida frena, no destraba—, pero deshace en
silencio una decisión que una persona tomó, y pasa en el uso normal de dos líneas: una resuelve un bloqueo
mientras la otra registra el suyo. Sube a alta si una instancia lo reporta dos veces: cada vez cuesta una
corrida que para sin motivo y una persona buscando por qué.

## Resumen

`HUMAN_ACTIONS.md` es una tabla que todas las líneas escriben. Para que dos líneas que registran una fila no
choquen, el molde le declara `merge=union` en `.gitattributes`. La unión concatena los dos lados de un
conflicto en vez de marcarlo, y no borra renglones. Cuando una línea **edita** una fila —la pasa de
`pendiente` a `resuelta`— y la otra agrega una fila al lado, las dos ediciones caen en el mismo bloque, y la
unión deja las dos versiones de la fila editada.

El motor lee la tabla fila por fila: la versión `pendiente` bloquea a la tarea igual que antes de que
alguien la resolviera.

Es la misma clase de defecto que el 347 encontró en el checkpoint: una fusión sin conflicto cambia el estado
de algo que decide una persona. Allá abría una revisión; acá cierra de nuevo un bloqueo ya resuelto.

## Reproducción

Con dos líneas reales —`ops line <instancia> auth` y `ops line <instancia> admin`— sobre una instancia con
el `.gitattributes` del molde:

```bash
# auth registra una fila, y admin la trae
#   | tarea-auth | pendiente | Ready | decidir tarea-auth |
git -C <admin> merge line/auth
# auth la resuelve; admin, sin saberlo, registra la suya al lado
#   auth:  | tarea-auth  | resuelta 2026-10-09 | Ready | decidir tarea-auth  |
#   admin: | tarea-admin | pendiente           | Ready | decidir tarea-admin |
git -C <auth> merge line/admin
node tools/ops.js context planning --json     # campo humanActions
```

## Síntoma

Corrido el 2026-10-09 con el motor de 0.105.0 y git 2.43.0:

```
git: Merge made by the 'ort' strategy.
| tarea-auth  | resuelta 2026-10-09 | Ready | decidir tarea-auth  |
| tarea-admin | pendiente           | Ready | decidir tarea-admin |
| tarea-auth  | pendiente           | Ready | decidir tarea-auth  |
pendientes: tarea-admin, tarea-auth | tarea=null
```

`ops check` no decía nada. La línea `auth` quedó sin tarea que ofrecer, bloqueada por la fila que su dueño
había resuelto.

## Causa raíz

- `template/.gitattributes` — `planning/HUMAN_ACTIONS.md merge=union`. Su comentario dice que vale para «un
  archivo que sólo crece por el final», y nombra un solo borde: archivar. Resolver una fila tampoco es
  crecer por el final, y es lo que se hace con cada fila.
- `engine/planning/parser.js`, `readHumanActions` — lee cada renglón de la tabla como una fila, sin relación
  entre ellas: dos renglones de la misma tarea son dos filas.
- `engine/planning/state.js`, `pendingHumanActions` — toda fila no resuelta bloquea.
- `automatization/workflows/autobuild.js`, `registerHuman` — cada parada agrega su fila a esa tabla, en el
  mismo lugar, que es lo que hace que la fila nueva caiga al lado de la editada.

## Fix propuesto

Dos pasos. El primero ya está hecho; el segundo es el que cierra el caso.

1. **Que se vea.** `check` rechaza la firma exacta de una fila revivida —la misma tarea, el mismo origen y
   la misma acción, una vez resuelta y otra pendiente— y dice qué hacer.
2. **Que no pase: una fila por archivo.** `planning/human/<clave>.md`, con el estado en el frontmatter y la
   acción en el cuerpo, que es la forma que ya tomaron la cola (212), el INBOX (216) y el checkpoint (347).
   Resolver es editar un archivo que la otra línea no toca, así que juntar no cambia el estado de ninguna
   fila; y dos líneas que editan la misma fila chocan de verdad, que ahí es la respuesta correcta.
   `HUMAN_ACTIONS.md` se sigue leyendo, para no romper a quien ya lo tiene.

Lo que el paso 2 toca: el lector de filas, las cuatro paradas de `autobuild` que registran una, la
corrección de la clave del 349, el aviso de filas resueltas sin commit, `ops archive human-actions`, el
molde y las instrucciones de los runners.

## Tradeoffs

- **La tabla es lo que una persona abre para ver qué le toca.** Partida, deja de leerse de un vistazo. Hace
  falta un comando que la imprima entera; `ops context` ya lista las pendientes.
- **Una fila no siempre es de una tarea.** El molde manda nombrar la épica, el recorrido o `—` cuando el
  bloqueo no es de una tarea, y `autobuild` escribe varias filas de decisiones abiertas para una misma
  épica. El nombre del archivo no puede ser la clave: tiene que ser único, y la clave va adentro.
- **Las filas resueltas se acumulan** como archivos hasta que se archivan. `ops archive human-actions` ya
  existe y habría que enseñarle la forma nueva.
- **Es un cambio de formato que baja a todas las empresas.** Quien resuelve filas a mano pasa a editar un
  archivo por fila en vez de una celda.
- No está medido cuántas instancias trabajan con más de una línea, ni cuántas veces pasó esto sin que nadie
  lo viera: hasta el paso 1 no dejaba rastro.

Dos decisiones que el paso 2 necesita antes de construirse, porque cambian lo que recibe cada empresa:
cómo se nombra el archivo de una fila que no es de una tarea, y con qué comando se ve la tabla entera.

## Cierre

**Resuelto en 0.106.0**, con los dos pasos. Las acciones humanas van una por archivo en `planning/human/`, y
`check` rechaza la fila revivida en la tabla de quien la siga usando.

**Valor**: una decisión que una persona tomó deja de deshacerse sola al juntar dos líneas, que pasaba en el
uso normal. **Riesgo que se tomó**: cambia dónde escriben los recorridos y cómo resuelve una persona —un
archivo por fila en vez de una celda—, y un archivo mal escrito puede no bloquear. Por eso el lector es
cerrado por defecto y `check` nombra cada archivo que no entiende.

Las dos decisiones que el caso dejaba abiertas las tomó el dueño el 2026-10-09: la clave de bloqueo va
adentro del archivo y el nombre es libre y único; y la tabla entera se ve con un comando nuevo.

### El recorrido de lo que este caso enumeró

- **Paso 1, que se vea — se hizo.** `check` rechaza la misma tarea, origen y acción resuelta y pendiente a
  la vez. Vale para la tabla, que se sigue leyendo.
- **Paso 2, una fila por archivo — se hizo.** `human/<nombre>.md` con `task`, `status` y `origin`. Lo leen
  la selección de tarea, `claim`, `context` y `check`, junto con la tabla.
- **«Las cuatro paradas de `autobuild`» — se hizo, y fueron más.** También las decisiones abiertas de Build,
  y `flow` y `onboard`, que la revisión encontró escribiendo todavía la tabla. La forma se dicta desde un
  solo lugar, `automatization/shared/human.js`.
- **«La corrección de la clave del 349» — se hizo**: habla de `task` y no de la primera columna.
- **«El aviso de filas resueltas sin commit» — se hizo** para los archivos, y avisa también el que nace
  resuelto sin haber estado nunca en un commit.
- **«`ops archive human-actions`» — se hizo distinto.** No pasa el archivo a un renglón de tabla: lo mueve
  entero a `human/done/`. La primera versión lo aplanaba y lo borraba, y la revisión mostró lo que perdía.
- **«El molde y las instrucciones de los runners» — se hizo**: README de `human/`, la guía de equipo, la
  sección de autonomía, el protocolo, la tabla anterior y la prosa de `flow` y `onboard`.
- **Tradeoff «la tabla deja de leerse de un vistazo» — se paga con `ops human`**, que la imprime entera de
  las dos fuentes, pendientes primero y diciendo dónde está cada fila.
- **Tradeoff «una fila no siempre es de una tarea» — resuelto por la decisión**: en las corridas reales las
  decisiones abiertas salieron con el hito como `task` y nombres propios, sin bloquear la tarea.
- **Tradeoff «las resueltas se acumulan» — se acepta**, y `archive` las saca de la vista.
- **Tradeoff «es un cambio de formato que baja a todas las empresas» — se paga, sin migración**: la tabla
  que ya tienen vale igual. Lo que no les llega es la nota en su `HUMAN_ACTIONS.md`, que es un archivo suyo:
  lo dicen el README de la carpeta y la guía de equipo, que sí se actualizan.
- **«No está medido cuántas instancias trabajan con más de una línea» — sigue sin medir.**

### Lo que encontró la revisión independiente

Un subagente revisó el diff con instancias de prueba y mutaciones en una copia. Tres hallazgos impedían
entregar, y los tres se corrigieron con prueba y mutación en rojo:

- **Lo que en `human/` no era un `.md` directo no bloqueaba y `check` callaba**: `t-uno.MD`, sin extensión,
  en una subcarpeta, o el README pisado. Ahora `check` rechaza toda entrada que no se lea como acción.
- **El pedido no decía qué va en `status`.** Con la tabla el vocabulario estaba en el encabezado. Ahora la
  forma dicta `status: pendiente` entero.
- **El nombre `<slug>.md` pisaba el bloqueo anterior de la misma tarea**, ya resuelto, y con él el registro
  de lo decidido. Ahora el segundo se llama `<slug>-2.md`; corrido de verdad, el anterior quedó intacto.

Y lo demás que encontró, corregido: un campo escrito dos veces —lo que deja un conflicto resuelto con los dos
lados— resolvía en silencio y ahora bloquea y se dice; los errores nombran el archivo; un fin de línea de
Windows ya no deja el frontmatter sin leer; `resuelta?` no resuelve; el aviso de credenciales sin dueño lee
también `human/`; y la parada por una cola que espera a una persona manda a `ops human` en vez de a una
carpeta que puede estar vacía.

Lo que queda dicho y no se cambió: la prosa de reglas y cargos sigue nombrando `HUMAN_ACTIONS.md` como el
lugar de las acciones humanas, que como concepto sigue siendo cierto; y `task` distingue mayúsculas, igual
que la primera columna de la tabla. Lo primero salió después como el caso 359, que lo resolvió.

### Qué se corrió

Línea de base, en el síntoma de arriba. El mismo recorrido con dos líneas reales y un archivo por acción:

```
auth resuelve la suya, admin registra la suya, y se juntan en los dos sentidos
  human/tarea-auth.md:status: resuelta 2026-10-09
  human/tarea-admin.md:status: pendiente
  pendientes: tarea-admin
  ✓ planning válido
```

- **Corridas reales de los pedidos**, con `claude -p` en la línea `admin`, cinco: dos escrituras de la
  acción de una tarea; una con un bloqueo anterior ya resuelto, que salió como `tarea-admin-2.md` sin tocar
  el primero; las decisiones abiertas de Build, dos archivos con el hito como clave; y las condiciones
  abiertas de `flow`, dos archivos. En las cinco `check` pasó y bloqueó lo que debía. USD 1,30. El pedido de
  `flow` se armó con su frase y la forma compartida, sin su preámbulo; los dos recorridos enteros están más
  abajo.
- **`ops archive` de verdad** sobre ese banco: movió las dos resueltas a `human/done/`, dejó las
  pendientes, y `check` siguió en verde.
- `test/planning/human-files.test.js` repite la secuencia con ramas reales y las fusiona.
- Veinte mutaciones, cada una en rojo: nueve sobre la primera versión y once sobre lo que la revisión hizo
  corregir.

### Corrida real de punta a punta (2026-10-09)

Después de cerrar los casos de esta versión se corrió `/autobuild` de verdad, con el runner instalado y el
motor de la rama, sobre una instancia de prueba con dos líneas armadas con `ops line`. En `admin`, una tarea
con una condición de código, una de documento y una de comentario, de Triage a Done y al checkpoint del
hito: 12 minutos y cerca de un millón de tokens. En `auth`, una tarea cuya aceptación pedía una decisión que
nadie había tomado: paró en Ready a los 3 minutos. Se leyeron el diario de cada corrida y lo que quedó en
disco.

De este caso: la parada de Ready escribió `human/limite-por-cliente.md` y la revisión de `admin` dejó dos
decisiones abiertas, cada una en su archivo y con el hito como `task`, sin bloquear la tarea. Ninguna de las
dos corridas tocó `HUMAN_ACTIONS.md`. Al juntar las líneas, las tres acciones quedaron pendientes y ninguna
cambió de estado.

Y se corrieron de verdad los otros dos recorridos, sobre una instancia recién creada. `/onboard` escribió
cinco acciones en `human/` —las dos credenciales del servicio, sus dos entornos y la autoridad de push—, y
`check` no acusó ninguna credencial sin dueño. `/flow`, con una intención que no pasó su primera etapa,
registró su bloqueo en `human/cripto-pagos-frame.md`. En los dos casos la tabla quedó como estaba.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Un hallazgo: **`check` rechazaba como acción mal escrita lo que empieza con punto** —`.DS_Store`,
`.gitkeep`—, y quedaba en rojo por un archivo que nadie escribió. Ahora no lo mira, igual que el resto del
motor. Rojo previo en la prueba de lo que no se lee como acción. El aviso de `merge=union`, que pasó a
depender de que la tabla tenga filas, está en el [347](./347-el-checkpoint-y-las-acciones-humanas-son-un-archivo-por-instancia-y-dos-lineas-chocan.md).

## Contexto de descubrimiento

Al cerrar el 347 se decidió no partir esta tabla, con una medición: dos líneas que agregan una fila cada una
fusionan sin choque. La medición era cierta y estaba incompleta — no probaba qué pasa cuando una de las dos
edita. El dueño preguntó si, con lo aprendido en el checkpoint, la recomendación seguía siendo la misma; se
midió ese caso antes de contestar, y no lo era.

## Relacionados

- [347](./347-el-checkpoint-y-las-acciones-humanas-son-un-archivo-por-instancia-y-dos-lineas-chocan.md) — el
  checkpoint, partido por hito; su cierre decía de esta tabla algo que este caso corrige.
- [349](./349-la-fila-que-escribe-una-parada-puede-no-bloquear-nada-y-la-comprobacion-dice-que-si.md) — la
  clave de la fila, que con un archivo por fila deja de depender de una columna.
- [212](./212-los-archivos-de-estado-compartidos-chocan-entre-lineas-de-trabajo-en-paralelo.md) y
  [216](./216-el-inbox-choca-entre-lineas-de-trabajo-en-paralelo.md) — la misma salida para la cola y el INBOX.
