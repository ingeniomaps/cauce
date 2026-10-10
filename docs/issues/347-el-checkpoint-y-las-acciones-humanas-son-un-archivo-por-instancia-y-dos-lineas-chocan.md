---
caso: 347
titulo: El checkpoint y las acciones humanas son un archivo por instancia y dos líneas chocan
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 347 — `AWAITING_REVIEW.md` y `HUMAN_ACTIONS.md` son un archivo por instancia: dos líneas de trabajo chocan al juntarse, y el checkpoint pendiente de una frena a la otra

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no se pierde trabajo, pero es lo que queda sin resolver de trabajar con dos líneas
después del 212 y el 216. En la instancia que lo reporta es uno de los dos motivos por los que la segunda
línea todavía no corre `autobuild`. Sube a alta el día que una línea quede frenada por el checkpoint de otra
sin que nadie entienda por qué: el mensaje de la parada no dice de qué hito ni de qué línea es.

Este caso junta dos reportes del mismo día, uno por archivo. Son el mismo defecto —un archivo de estado
único que dos líneas escriben a la vez— con la misma salida propuesta y las mismas decisiones pendientes,
así que se resuelven juntos. El de la tabla de acciones humanas se había numerado 348 y no llegó a
publicarse. Lo que sí es distinto, y por eso va primero, es el freno: sólo el checkpoint para a una línea
por lo que escribió otra.

## Resumen

Son los dos archivos de estado que quedaron de a uno por instancia cuando el 212 partió la cola y el 216
el INBOX. Los dos los escribe `autobuild` solo, no una persona.

**El checkpoint frena a quien no le toca.** Al terminar un hito, `autobuild` escribe
`planning/AWAITING_REVIEW.md` con `status: pendiente`, y la corrida siguiente no arranca hasta que diga
`resuelta`. El archivo no sabe de líneas, de runners ni de hitos más que por lo que dice su texto, y viaja
con la rama común: una línea queda frenada por el checkpoint de otra aunque su propio hito esté revisado,
porque la puerta sólo mira `status`.

**Los dos chocan al juntar las ramas.**

1. Cada línea reescribe `AWAITING_REVIEW.md` entero en su rama, así que juntarlas choca siempre. Quien
   resuelve el choque elige uno de los dos, y el que pierde sale de la historia de la rama común —el molde
   dice que el archivo no se borra porque es el registro de qué se revisó—.
2. Cada parada que espera a una persona agrega una fila a `planning/HUMAN_ACTIONS.md` y la commitea. Las
   filas nuevas entran en el mismo lugar de la tabla, así que dos líneas que frenan antes de juntarse tocan
   las mismas líneas del archivo. Acá el choque se resuelve quedándose con las dos filas y no se pierde
   nada.

## Reproducción

El checkpoint:

```bash
mkdir dos && cd dos && git init -q -b main && mkdir planning
F=planning/AWAITING_REVIEW.md; G="git -c user.name=t -c user.email=t@t"
printf -- '---\nstatus: resuelta\nhito: base\n---\n' > $F && git add $F && $G commit -qm base
git checkout -q -b line/auth
printf -- '---\nstatus: resuelta\nhito: auth-uno\n---\n\n# Checkpoint: hito auth-uno\n' > $F && $G commit -qam auth
git checkout -q main && git checkout -q -b line/admin
printf -- '---\nstatus: pendiente\nhito: admin-uno\n---\n\n# Checkpoint: hito admin-uno\n' > $F && $G commit -qam admin
git checkout -q line/auth && git merge line/admin
git checkout -q --theirs $F
node -e "console.log(require('<cauce>/engine/planning/parser.js').checkpointHolds('$PWD/planning'))"
```

La tabla de acciones humanas:

```bash
mkdir tabla && cd tabla && git init -q -b main && mkdir planning
F=planning/HUMAN_ACTIONS.md; G="git -c user.name=t -c user.email=t@t"
printf '# Acciones humanas\n\n| Tarea | Estado | Origen | Descripción |\n| :--- | :---: | :---: | :--- |\n' > $F
printf '| vieja | resuelta 2026-01-01 | x | y |\n' >> $F && git add $F && $G commit -qm base
git checkout -q -b line/auth
sed -i '4a | tarea-de-auth | pendiente | autobuild | decidir A |' $F && $G commit -qam auth
git checkout -q main && git checkout -q -b line/admin
sed -i '4a | tarea-de-admin | pendiente | autobuild | decidir B |' $F && $G commit -qam admin
git checkout -q line/auth && git merge line/admin
```

## Síntoma

```
Auto-fusionando planning/AWAITING_REVIEW.md
CONFLICTO (contenido): Conflicto de fusión en planning/AWAITING_REVIEW.md
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
true
```

El `true` es la línea `auth`, con su hito ya resuelto, frenada por el checkpoint de `admin`.

```
CONFLICTO (contenido): Conflicto de fusión en planning/HUMAN_ACTIONS.md
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
```

Las dos corridas el 2026-10-09 sobre el motor de 0.105.0, y repetidas ese día al revisar el caso con la
misma salida.

## Causa raíz

El checkpoint:

- `automatization/workflows/autobuild.js:44` — `GATE` es una ruta fija, `planning/AWAITING_REVIEW.md`.
- `automatization/workflows/autobuild.js:2017-2018` — el cierre del hito pide crear ese archivo, sin nombre
  que dependa del hito ni del runner.
- `engine/planning/parser.js:407-411` — `checkpointHolds(dir)` lee ese único archivo y devuelve si su
  `status` no es `resuelta`. No compara el `hito:` del frontmatter con nada.
- `engine/cli/planning.js:195` — `context` contesta `blocked: 'awaiting-review'` para cualquier runner, y
  `automatization/workflows/autobuild.js:806-807` para con «tiene un checkpoint humano sin resolver», sin
  decir cuál.

La tabla:

- `engine/planning/parser.js:339-340` — `readHumanActions(dir)` lee un solo archivo, `HUMAN_ACTIONS.md`.
- `automatization/workflows/autobuild.js:718-732` — `registerHuman` le pide a un agente que registre la
  fila en ese archivo, y `commitBlocked` (`:738`) la commitea al frenar.

## Fix propuesto

Es una propuesta, en tres pasos que se pueden entregar por separado. El primero no cambia dónde vive nada.

1. **Que el checkpoint frene sólo a quien le toca.** `checkpointHolds` compara el `hito:` del frontmatter
   con los hitos de quien pregunta, y la parada nombra el archivo y el hito que la frena. No evita el
   choque al juntar, pero sí que una línea quede frenada por un checkpoint ajeno. El de otra línea se
   muestra en `tree` y no frena.
2. **Un checkpoint por hito**, en `planning/checkpoints/<hito>.md`. `AWAITING_REVIEW.md` se sigue leyendo
   primero, como `BACKLOG.md`, para no romper a quien ya lo tiene.
3. **Una fila por archivo**, en `planning/human/<tarea>.md`, con `HUMAN_ACTIONS.md` leído primero y un
   comando que imprima la tabla entera, como `ops inbox`. El nombre del archivo pasa a ser la clave con la
   que el motor bloquea, que hoy es la primera columna (ver 349).

## Tradeoffs

- Hoy un checkpoint pendiente frena a toda la instancia, y puede haber quien cuente con eso: una persona
  que quiere que nada avance hasta revisar. Con el fix, una línea sigue mientras la otra espera. Si eso se
  quiere conservar, hace falta decirlo en la configuración.
- Un archivo por unidad deja checkpoints y filas resueltos acumulándose: son evidencia y no se borran, así
  que hay que decidir cuándo se archivan. Es una decisión, no dos.
- La tabla es lo que una persona abre para ver qué le toca. Partida, deja de leerse de un vistazo sin el
  comando; en un sitio de código tampoco se ve junta.
- Las filas que bloquean una épica, un recorrido o toda la cola (`—`) no tienen una tarea para nombrar el
  archivo.
- No está medido cuántas instancias trabajan con más de una línea.

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente de 0.105.0 y coinciden; las dos reproducciones se corrieron de nuevo.
Lo que el enunciado no decía:

- **El paso 1, como está escrito, compara un campo que no existe.** El pedido que crea el checkpoint
  —`automatization/workflows/autobuild.js`, `human-checkpoint`— sólo exige `status: pendiente` en el
  frontmatter: el `hito:` de la reproducción lo puso el reporte. Y aunque estuviera, no alcanza. `context`
  separa los hitos de la línea de los ajenos —`lined.milestones` y `lined.hidden`,
  `engine/cli/planning.js:179-181`—, pero sobre los hitos **de la cola**, y el del checkpoint acaba de salir
  de ahí: `autobuild` borra `backlog/<hito>.md` al cerrar su última tarea. No queda de dónde leer de qué
  línea era.
- **Lo que sí alcanza es que el checkpoint diga qué línea lo escribió.** El recorrido lo sabe —`context`
  devuelve `line`—, así que el frontmatter puede llevar `line: <nombre>` y la puerta frenar sólo a esa
  línea. Un archivo sin ese campo —toda instancia sin líneas, y todo checkpoint anterior— frena a todos,
  como hoy.
- **Y eso es una decisión de producto, no un arreglo.** Hoy un checkpoint pendiente detiene la instancia
  entera. Con el campo, la línea `admin` sigue mientras `auth` espera revisión. Se pregunta antes de
  construir.
- **Ni el 212 ni el 216 nombran estos dos archivos.** No hay una decisión anterior de dejarlos afuera: no
  se miraron.
- **Sólo el freno se vivió.** Los dos choques se reprodujeron en un repositorio de prueba antes de abrir la
  segunda línea; lo que la instancia sí vio fue el checkpoint ajeno en su copia. Por eso el paso 1 va
  primero y los pasos 2 y 3 esperan la decisión sobre el archivado.

## Cierre

**Resuelto en 0.106.0.** El checkpoint pasó a ser un archivo por hito, `planning/checkpoints/<hito>.md`, que
dice qué línea lo escribió y frena sólo a ésa. La tabla de acciones humanas no se partió en este caso, y esa
mitad quedó mal cerrada: ver «Corrección del 2026-10-09», al final de este cierre.

**Valor**: dos líneas, o dos personas, dejan de frenarse entre sí por el hito de la otra; y un checkpoint
deja de poder abrirse solo al juntar ramas. **Riesgo que se tomó**: cambia a quién frena un checkpoint en
una instancia con líneas. Sin líneas no cambia nada, y el freno de toda la instancia sigue existiendo, ahora
como un acto deliberado. La revisión lo había dejado como decisión pendiente; el dueño la tomó el
2026-10-09: que un hito de una línea detenga a otra, o a otra persona, es el defecto y no una garantía.

### Lo que este caso encontró y no preveía

Se midió con dos líneas reales, armadas con `ops line` sobre una instancia de prueba, antes de tocar el motor.
Tres cosas no estaban en el enunciado, y la primera es más grave que las que sí:

- **Juntar las ramas resolvía el checkpoint ajeno, sin conflicto.** El reporte esperaba un choque. Lo que pasó
  fue peor: la segunda línea reescribió el archivo que había traído de la primera, la primera cambió su
  `status` a `resuelta`, y git fusionó las dos ediciones en silencio. Quedó esto, que nadie escribió:

  ```
  ---
  status: resuelta
  ---

  # Checkpoint: hito admin-uno
  ```

  El hito de `admin` figuraba revisado y su línea siguió de largo.
- **La tabla de acciones humanas no choca en una instancia.** La reproducción del reporte se hizo en un
  repositorio vacío. El molde entrega desde hace tiempo un `.gitattributes` con `merge=union` para
  `HUMAN_ACTIONS.md`, y con él la fusión de las dos líneas salió limpia, con las dos filas. Donde sí choca
  es donde esa regla no está: una instancia dentro de un repositorio que ya tenía su `.gitattributes`.
- **El freno ajeno llega al traer la rama, no antes.** Cada línea commitea su planning en su rama, así que
  `admin` no veía el checkpoint de `auth` hasta juntarse. Después sí: `blocked: awaiting-review`, sin tarea.

### El recorrido de lo que este caso enumeró

- **Paso 1, que el checkpoint frene sólo a quien le toca — se hizo distinto.** No compara hitos, porque el
  del checkpoint ya salió de la cola: el archivo lleva `line:` y la puerta lo compara con la línea de quien
  pregunta. `line:` vacío es el árbol principal; sin el campo, frena a todos. `ops context` devuelve cuál
  frena y la parada de `autobuild` lo nombra.
- **Paso 2, un checkpoint por hito — se hizo**, como lo pedía el reporte. `AWAITING_REVIEW.md` se sigue
  leyendo y frena a todas las líneas.
- **Paso 3, una fila por archivo en `planning/human/` — le tocaba, y salió como caso propio: el
  [351](./351-la-fusion-por-union-devuelve-a-pendiente-una-fila-de-acciones-humanas-ya-resuelta.md).** Acá
  se había decidido que no, con una medición incompleta. Lo que sí se hizo y sigue valiendo: `check` avisa,
  con líneas en uso, cuando `HUMAN_ACTIONS.md` no tiene `merge=union`, y trae la línea a agregar.
- **«El de otra línea se muestra en `tree` y no frena» — se hizo**: `ops tree` lista todos los pendientes.
- **«La parada nombra el archivo y el hito» — se hizo.**
- **Tradeoff «puede haber quien cuente con que un checkpoint frena a toda la instancia» — se conserva como
  acto deliberado.** `AWAITING_REVIEW.md` con `status: pendiente` frena a todas las líneas. Lo que deja de
  pasar es que lo haga, sin que nadie lo pida, el hito de una sola. Y con líneas ese freno nunca fue
  confiable: llegaba o no según cuándo se traía la rama.
- **Tradeoff «los archivos resueltos se acumulan» — se acepta.** Es un archivo chico por hito y es el
  registro de qué se revisó, que antes sólo quedaba en la historia de git. No se construyó un archivado:
  se hace cuando una instancia lo pida.
- **Tradeoff «la tabla partida deja de leerse de un vistazo» y «las filas sin tarea no tienen nombre de
  archivo» — no aplican**: la tabla no se partió.
- **Tradeoff «no está medido cuántas instancias trabajan con más de una línea» — sigue sin medir.**
- **Lo que la revisión del 2026-10-09 decía sobre «sólo el freno se vivió» — queda corregido por la
  medición**: el freno existe, pero el defecto mayor era el que nadie había visto.

### Lo que encontró la revisión independiente

Un subagente revisó el diff sin partir de que estaba bien, con instancias de prueba y 21 mutaciones en una
copia. Dos hallazgos impedían entregar, y los dos se corrigieron con su prueba y su mutación en rojo:

- **Un `line:` mal escrito no frenaba a nadie.** Se comparaba tal cual, así que `"admin"` entre comillas,
  `Admin` o `admin # nota` dejaban el checkpoint pendiente y la corrida siguiente arrancaba. Con el archivo
  único eso no podía pasar, porque frenaba sin depender de ningún valor. Ahora las comillas se quitan y lo
  que no es un nombre de línea frena a todas. Y el recorrido relee `context` después de escribir el
  checkpoint: si no frena, lo manda a corregir una vez, y si sigue sin frenar el resultado de la corrida lo
  dice. Lo que queda afuera es el nombre bien formado de una línea que no existe —`admn`—: escrito a mano,
  no frena a nadie y `check` no lo ve; escrito por el recorrido, lo atrapa la relectura.
- **La guía afirmaba algo falso.** Decía que `HUMAN_ACTIONS.md` era el único archivo que dos líneas
  escriben. `LESSONS.md` también, y sin unión: comprobado, dos líneas que anotan una lección chocan al
  juntarse. La guía lo dice ahora, con cómo se resuelve; no se le dio unión porque una corrida puede
  actualizar una fila que ya estaba, y ahí el conflicto es la respuesta correcta.

Y bordes que se corrigieron o se dejaron dichos:

- **Un `status: resuelta` en el cuerpo abría el checkpoint** —el propio pedido manda a explicar cómo se
  destraba—. En `checkpoints/` el estado se lee sólo del frontmatter. `AWAITING_REVIEW.md` se lee como
  siempre, con la misma expresión de 0.105.0, para que ninguna instancia cambie al actualizar.
- **La prosa de los runners seguía describiendo el archivo único.** Se actualizó en el skill de `autobuild`
  y en las instrucciones de los cuatro adaptadores, que es lo que lee un runner sin workflow.
- **La línea es la rama**, y eso queda como límite: en la carpeta de una línea, cambiar de rama o quedar con
  HEAD suelto deja de ver su checkpoint como propio. Ya pasaba con el reparto de hitos; el README lo dice.
- Tres mutaciones sobrevivían por falta de caso —`check` sobre el archivo de siempre, `resuelta` como
  subcadena y el estado fuera del frontmatter—. Cada una tiene ahora su prueba.

### Qué se corrió

Línea de base, con el motor de 0.105.0 y dos líneas reales:

```
auth cierra su hito            auth: blocked="awaiting-review"   admin: blocked=""
admin trae la rama de auth     admin: blocked="awaiting-review" tarea=null
las dos registran una fila     Merge made by the 'ort' strategy.   filas: 2
se juntan con los dos cerrados status: resuelta  sobre  «# Checkpoint: hito admin-uno»
```

El mismo recorrido con el cambio:

```
auth cierra su hito            auth: blocked="awaiting-review" checkpoint="checkpoints/auth-uno.md"
admin trae la rama de auth     admin: blocked="" tarea=tarea-admin
                               tree: CHECKPOINT  checkpoints/auth-uno.md · línea auth
se juntan en los dos sentidos  checkpoints/admin-uno.md:status: pendiente
                               checkpoints/auth-uno.md:status: resuelta
                               admin: blocked="awaiting-review" checkpoint="checkpoints/admin-uno.md"
freno global desde el árbol    auth: blocked="awaiting-review" checkpoint="AWAITING_REVIEW.md"
```

- **Corrida real del pedido que escribe el checkpoint**, con `claude -p`: tres veces dentro de la línea
  `admin` y dos en el árbol principal. Las cinco escribieron `checkpoints/<hito>.md` con los tres campos
  —`line: admin` en la línea, `line:` sin valor afuera—; `ops check` pasó y `context` frenó a quien
  correspondía.
- **Corrida real de la corrección**, sobre un checkpoint con `line: "Admin (línea de ana)"`: antes de
  corregir frenaba a las dos líneas —visto desde `admin` y desde `auth`—, que es el cerrado por defecto;
  después quedó `line: admin` y `check` en verde. Seis corridas en total, USD 1,43. Lo que no tienen del
  recorrido real: son pasos sueltos, no un `autobuild` entero.
- `test/planning/checkpoints.test.js` repite la secuencia con ramas `line/<nombre>` de verdad y las fusiona.
- Diecisiete mutaciones, cada una en rojo. Nueve antes de la revisión: frenar a cualquier línea, no frenar
  sin `line:`, abrir sin `status`, no leer `AWAITING_REVIEW.md`, no exigir el nombre, no avisar de la unión,
  avisar sin líneas, el recorrido sin la línea, y la parada sin el nombre. Y ocho sobre lo que la revisión
  hizo corregir: la línea inválida comparada tal cual, las comillas sin quitar, el estado del cuerpo, la
  subcadena, `check` sobre el archivo de siempre, no releer, no avisar, y la línea sin sanear.
- Una prueba nueva del recorrido mostró un defecto antes de salir: la línea se leía del último contexto, que
  con el hito ya terminado puede venir sin ella, y el checkpoint salía como del árbol principal. Se toma
  una sola vez, al arrancar.

### Corrección del 2026-10-09

Este cierre decía que la tabla de acciones humanas no hacía falta partirla, porque «ya fusiona sin choque
donde la regla está». La medición que lo sostenía probaba un solo caso: dos líneas que **agregan** una fila
cada una. No probaba el otro, que es el uso normal: una línea **resuelve** una fila mientras la otra agrega
la suya. Medido después, con las mismas dos líneas reales, la unión deja la fila resuelta y también su
versión pendiente, y la tarea vuelve a quedar bloqueada sin que nada lo diga.

El reporte original pedía partir la tabla y tenía razón; la objeción se apoyaba en la mitad de una prueba.
Queda abierto como 351, con `check` rechazando desde ya la fila revivida.

### Corrida real de punta a punta (2026-10-09)

Después de cerrar los casos de esta versión se corrió `/autobuild` de verdad, con el runner instalado y el
motor de la rama, sobre una instancia de prueba con dos líneas armadas con `ops line`. En `admin`, una tarea
con una condición de código, una de documento y una de comentario, de Triage a Done y al checkpoint del
hito: 12 minutos y cerca de un millón de tokens. En `auth`, una tarea cuya aceptación pedía una decisión que
nadie había tomado: paró en Ready a los 3 minutos. Se leyeron el diario de cada corrida y lo que quedó en
disco.

De este caso: al terminar el hito, el recorrido escribió y commiteó `checkpoints/admin-uno.md` con
`status: pendiente`, `hito: admin-uno` y `line: admin`; la relectura devolvió `awaiting-review` con ese
archivo, sin necesitar la corrección. Después las dos líneas se trajeron la rama una a la otra: `auth` no
quedó frenada por el checkpoint de `admin` —lo ve en `ops tree`— y `admin` siguió frenada por el suyo.

Y sobre lo que ya había: el motor de `main` y el de la rama se corrieron sobre copias de tres instancias
reales —`check`, `context`, `tree` y `contract`—. Los mismos errores, los mismos avisos y los mismos códigos
de salida en las tres; lo único distinto es el campo nuevo `checkpoint`.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Tres hallazgos:

- **Un checkpoint guardado con fin de línea de Windows, o con un BOM, no se leía**: resuelto en el editor
  seguía frenando, y `check` decía que le faltaba `status`. Ahora se lee igual. Rojo previo con el archivo
  guardado así.
- **La relectura del checkpoint recién escrito miraba que la línea estuviera frenada, no por cuál.** Con
  otro pendiente —el archivo de siempre, el de otro hito— daba por bueno uno propio que no frenaba. Ahora
  `context` devuelve `checkpoints`, todos los que frenan, y el recorrido busca el suyo ahí. Corrido de verdad
  sobre un banco con los dos pendientes: `checkpoint` nombra `AWAITING_REVIEW.md` y `checkpoints` trae
  también `checkpoints/H1.md`, y el agente los copió tal cual (USD 0,16). Dos mutaciones en rojo.
- **El aviso de `merge=union` salía con la tabla vacía**, pidiendo editar el `.gitattributes` por un archivo
  que desde el 351 ningún recorrido escribe. Ahora sale sólo si la tabla tiene filas. Mutación en rojo.

`check` y `context` con el motor anterior y con éste, sobre tres instancias reales en sólo lectura: los mismos
errores y avisos, y de diferencia sólo el campo nuevo.

### Corrida entera en una línea, con el motor de la rama (2026-10-09)

Un `/autobuild` de Triage a Done y al checkpoint del hito, en la línea `auth` de un banco con la instancia y
el producto al lado. Es la que faltaba para la relectura del checkpoint, que hasta acá sólo se había corrido
como pedido suelto.

```
… > Commit > Done > Closing|closing > Closing|human-checkpoint > Closing|checkpoint-held
checkpoint-held  → readOk: true · blocked: awaiting-review · checkpoints: ["checkpoints/auth-uno.md"]

planning/checkpoints/auth-uno.md   status: pendiente · hito: auth-uno · line: auth
context en la línea auth           blocked: awaiting-review · checkpoint: checkpoints/auth-uno.md
context en el árbol principal      blocked: (nada)
```

La relectura encontró su propio archivo en la lista y no hizo falta corregir nada. `check` pasa, y
`ops evidence` encuentra la prueba nueva «en el commit …, no en disco», que es el 353 andando.

**No llegó ahí de una**: la primera vuelta frenó en Build porque el árbol de la tarea queda fuera de las
raíces cuando la raíz es el repositorio. Es anterior a esta rama y salió como el caso
[360](./360-en-una-linea-el-arbol-de-la-tarea-queda-fuera-de-las-raices-cuando-la-raiz-es-el-repositorio.md);
la corrida siguió después de declarar esa ruta a mano en el banco, como haría la persona.

### Lo que encontró la segunda revisión del conjunto (2026-10-09)

Un hallazgo, y **se decidió que no**: el aviso de `merge=union` calla mientras la tabla no tiene filas, así
que habla recién cuando el choque ya pudo pasar. Es cierto, y es lo que la primera revisión pidió: desde el
351 ningún recorrido escribe la tabla, y desde el 359 tampoco lo indica ningún contrato —medido: los cargos
escriben en `planning/human/`—. Con la tabla vacía el aviso pedía editar un archivo por otro que no se usa.

## Contexto de descubrimiento

Instancia `acme-ops`, con dos líneas (`auth` y `admin`), cada una en su rama y su copia de trabajo. El
2026-10-09 la copia de `admin` seguía mostrando en `planning/AWAITING_REVIEW.md` un checkpoint de `auth` del
2026-09-30, porque el archivo viaja con la rama común. Los choques todavía no se vivieron ahí —la línea
`admin` no cerró ningún hito con `autobuild`—. En la tabla, la fila de la última parada entró como primera
de la sección de bloqueos activos, que es donde entraría también la de la otra línea.

## Relacionados

- [212](./212-los-archivos-de-estado-compartidos-chocan-entre-lineas-de-trabajo-en-paralelo.md) — partió la
  cola por hito; el checkpoint y la tabla quedaron afuera.
- [216](./216-el-inbox-choca-entre-lineas-de-trabajo-en-paralelo.md) — la misma forma para el INBOX.
- [349](./349-la-fila-que-escribe-una-parada-puede-no-bloquear-nada-y-la-comprobacion-dice-que-si.md) — la
  clave de la fila. Va antes que el paso 3: se arregla sin mover la tabla.
