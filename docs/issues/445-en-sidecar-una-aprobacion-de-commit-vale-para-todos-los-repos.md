---
caso: 445
titulo: En sidecar, una aprobación de un gate de commit nombra la ruta relativa al repo y vale para el mismo archivo de todos los repos y de todas las líneas
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.115.1
---

# 445 — En sidecar, una aprobación de commit vale para todos los repos

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **media** — toda instancia sidecar con más de un repositorio **o con
una línea de trabajo**; el daño es silencioso y crece con las aprobaciones que se dejan puestas.

## Resumen

Los gates de commit —`dependencies`, `verify`, `governance`, `comments`— nombran lo que hay que aprobar con la ruta
del índice de git, relativa a la raíz del repositorio que commitea, y `.ops-approval` se compara como texto literal.
En una instancia sidecar, una línea como `package.json` no dice de qué checkout es: aprueba el `package.json` raíz de
**todos los repos** y de **todos los árboles de todas las líneas de trabajo**, que son checkouts aparte del mismo
repo. Lo contrario de lo que el motor promete en `engine/hooks/governance.js:57-59`: que «la aprobación vale para lo
que nombra y para nada más».

La forma que sí lo distinguiría no existe: ni la ruta relativa al workspace (`api/package.json`) ni la absoluta
aprueban el commit. Mientras tanto, las aprobaciones de lectura de credenciales (`secrets-read`) sí son absolutas, así
que el mismo archivo mezcla dos espacios de nombres sin que nada lo diga.

Y hay un segundo daño, de la misma familia: `.ops-approval` **no está ignorado** en una instancia —`template/gitignore`
no lo nombra—, así que se commitea con el `planning/` y las aprobaciones que una persona escribió en su máquina le
llegan a quien hace pull. Es el mismo cruce, entre personas en vez de entre repos.

## Reproducción

**Entre repos.** Un workspace con dos repos, `api` y `web`, cada uno con `package.json` y `pnpm-lock.yaml`
commiteados, y una instancia sidecar en `ops/` creada con
`node <cauce>/engine/cli/ops.js init ops --mode sidecar --runner claude --no-install`. En los dos repos se cambia
`package.json` sin tocar el lock y se stagea sólo ese archivo. Después se corre el guard como lo llama el runner,
desde cada repo:

```bash
printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m bump"},"cwd":"%s"}' "$WS/api" \
  | OPS_ROOT="$WS/ops" CLAUDE_PROJECT_DIR="$WS" node <cauce>/engine/hooks/run.js dependencies
```

con `ops/planning/.ops-approval` en cinco estados: vacío; `package.json` (desde `api` y desde `web`);
`api/package.json`; y la ruta absoluta de `api/package.json`.

**Entre líneas, con un solo repo.** Sobre el banco sidecar, con `package.json` y su lock commiteados en `app`:

```bash
node engine/cli/ops.js bench sidecar --force          # B = .cauce-eval/_medicion/sidecar
node engine/cli/ops.js line "$B/ops" x app            # árbol en $B/lines/x/app
```

En `app` y en `lines/x/app` se cambia `package.json` y se stagea sólo ese archivo; el guard se corre igual que arriba,
con `cwd` en cada árbol, `OPS_ROOT="$B/ops"` y `CLAUDE_PROJECT_DIR="$B"`.

**El archivo versionado.** En una instancia recién creada con `git init`:
`git check-ignore -v planning/.ops-approval` sale 1 (no lo ignora nada).

## Síntoma

Entre repos, medido con Cauce 0.115.1 el 2026-10-24 y repetido el 2026-10-25 con la misma salida:

```
== 1. sin aprobación, api
BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
Esto lo aprueba una persona: que pegue ella tal cual en ops/planning/.ops-approval estas líneas:
  package.json
→ exit 2
== 2. con la línea 'package.json', api
→ exit 0
== 3. con la misma línea, web
→ exit 0
== 4. con la línea 'api/package.json', api
BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
…  package.json
→ exit 2
== 5. con la ruta absoluta de api, api
BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
…  package.json
→ exit 2
```

Entre líneas, medido el 2026-10-25 con 0.115.1:

```
== vacío, línea x
BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
→ exit 2
== 'package.json' (pensada para la carpeta de sesión), carpeta de sesión
→ exit 0
== misma línea, línea x
→ exit 0
```

El paso 3 y el último son el defecto: la línea que la persona escribió para un checkout deja pasar el commit de otro.
El bloqueo tampoco dice de qué repo habla —`.:`—, así que quien aprueba no tiene cómo saber que está aprobando para
todos.

## Causa raíz

- `engine/hooks/approval.js:50-53` — `left` compara cada ruta contra un `Set` de las líneas del archivo, sin
  resolverla contra ninguna raíz.
- `engine/hooks/dependencies.js:88-89` — arma la ruta como `path.posix.join(parent, name)`, con `parent` relativo a la
  raíz del repo: `package.json` para el manifiesto raíz de cualquier repo.
- `engine/hooks/verify.js:218` y `engine/hooks/governance.js:53-60` — pasan `staged`, las rutas del índice, también
  relativas al repo. `comments.js:199` igual.
- `engine/cli/governed.js:52` y `:57` — el comando que `autobuild` usa para pedir la aprobación antes de construir
  calcula la misma forma relativa y la descuenta contra el mismo archivo.
- `engine/hooks/secrets-shell.js:150-152` — en cambio, resuelve a absoluta (`path.resolve(cwd, token)`): las dos
  clases de aprobación conviven en el mismo archivo con formas distintas.
- La mezcla de formas fue deliberada: el comentario de `HOW` (`engine/hooks/approval.js:95-99`, caso 089) dice que
  «cada guard coteja la ruta en la forma que tiene a mano» y lo resuelve imprimiendo la línea exacta. Eso arregló el
  pegado, no el alcance: la forma relativa sigue sin nombrar un checkout.
- `template/gitignore` ignora `.verify-log`, `.push-log` y `.grant-log`, cada uno con su razón, y no nombra
  `.ops-approval`; `engine/core/trails.js:12-13` tampoco lo lista entre los rastros locales. No hay ninguna decisión
  escrita que lo quiera versionado —buscado en el CHANGELOG, los ADR y los casos que lo citan—: es una omisión.

En una instancia embebida hay un solo checkout —las líneas de trabajo exigen sidecar, `engine/cli/lines.js:199`— y la
ruta relativa es única; el defecto aparece en sidecar con más de un repo o con una línea.

## Fix propuesto

**Decidido (2026-10-25): `.ops-approval` es local, y los gates de commit lo nombran con la ruta absoluta del
checkout que commitea.**

- Local, por lo mismo que `.grant-log`: una aprobación es de una persona, en su máquina, para una operación. Versionada,
  autoriza en el clon de otro lo que ésta aprobó para otra cosa. Lo que un equipo quiera compartir de forma permanente
  se declara en `ops.config.json`, con revisión.
- Absoluta, porque siendo local deja de tener costo y es la única forma que ya distingue checkout y repo; es además la
  de `secrets-read`, así que el archivo queda con una sola forma. Se descarta la relativa al workspace: no existe en
  embebido, y serían dos formas que explicar.

El camino, en este orden:

1. **Pruebas primero, en rojo.** Sidecar con dos repos y con una línea: una línea aprobada para un checkout no deja
   pasar el commit de otro, en los cuatro gates. Más la aserción de ausencia que pide R29, porque esto es una quita: la
   línea relativa `package.json` **deja de aprobar**, vista en rojo devolviendo la comparación vieja.
2. **Un solo lugar que arma la ruta**: un helper en `approval.js` que recibe el directorio del commit y las rutas del
   índice y devuelve `path.join(toplevel(dir), file)`. Lo usan `dependencies`, `verify`, `governance`, `comments` y
   `engine/cli/governed.js`; así ninguno puede quedar en la forma vieja sin que la prueba lo vea. Los mensajes de bloqueo
   pasan a nombrar el repo en vez de `.:`.
3. **`governed` resuelve contra el árbol donde se va a commitear** —ver Tradeoffs, primer punto—, y `autobuild` se lo
   pasa.
4. **Local**: la línea en `template/gitignore` con su razón, y `planning/.ops-approval` en `LOCAL` de
   `engine/core/trails.js`, que ya avisa en `check` del rastro que git no ignora.
5. **`check` nombra cada línea vieja**, con la forma nueva que le corresponde cuando se puede deducir, dentro de
   `warnings` de `approval.js`. «No es absoluta» no alcanza para reconocerla: el archivo también lleva ítems que no
   son rutas y no cambian —`push <remoto> <rama>`, el comando entero que aprueba `shell.js:175-177` o `workers.js:186`,
   `jira <issue> description` (`jira.js:23`), `declara <ruta>` (`ops-config.js:171`), `<verbo> <ruta>`
   (`boundary.js:72`)—, y avisar sobre ellos sería un falso positivo en cada corrida. Lo que se nombra es la línea que
   tiene forma de ruta relativa y no es ninguno de esos.
6. **CHANGELOG**: las dos cosas juntas —que el archivo pasa a ser local y que las líneas relativas dejan de aprobar—,
   con qué hacer en cada caso.
7. **Prueba real** en el banco sidecar con línea, repitiendo las dos reproducciones de arriba: los pasos 3 y el último
   tienen que salir en exit 2, y la absoluta en 0. Después la mutación del helper (volver a la ruta relativa) tiene que
   poner en rojo las pruebas del paso 1.

Partirlo no hace falta: el paso 4 sólo tiene sentido con el 2, porque una ruta absoluta en un archivo versionado deja
el home de la persona en la historia. Son una decisión con dos mitades, en un solo PR y en commits por naturaleza.

## Tradeoffs

Evaluado leyendo cada consumidor de `approval.js` el 2026-10-25. Lo que puede regresar:

- **`autobuild` pide aprobar una ruta que el commit no va a nombrar.** Antes de construir corre
  `ops governed` desde la carpeta de sesión (`automatization/workflows/autobuild.js:1592`) y registra la fila humana con
  lo que devuelve; el subagente commitea después dentro del árbol de la línea. Hoy coinciden por accidente, porque la
  forma relativa no distingue árboles. Con la absoluta, para un archivo de gobernanza que viva en un repo del producto,
  `governed` nombraría el de la carpeta de sesión y el guard frenaría el de la línea: la persona aprueba, reanuda, y la
  corrida vuelve a parar en `commit-needs-approval` (`:2285`) con otra ruta. No se cuelga —esa segunda parada trae la
  ruta correcta—, pero cuesta una vuelta humana. Los archivos de gobernanza de la instancia no cambian: la instancia no
  se replica en las líneas, así que su ruta es la misma desde los dos lados. Es el paso 3 del camino, y necesita su
  prueba.
- **Las aprobaciones permanentes en la forma vieja dejan de valer** al actualizar, también en embebido, donde no había
  defecto. Es el comportamiento correcto y se va a sentir como regresión: por eso el aviso de `check` (paso 5) y el
  CHANGELOG (paso 6).
- **Una instancia que ya commiteó `.ops-approval` no se arregla con la línea del `.gitignore`.** `upgrade` no toca ese
  archivo —es de la empresa, `engine/core/trails.js:34-37`—, y un archivo trackeado sigue trackeado aunque se lo
  ignore. Además `git check-ignore` no reporta los archivos trackeados, así que el aviso de `trails` diría «agregá la
  línea» y, agregada, seguiría versionado. El aviso tiene que distinguir los dos casos y dar `git rm --cached
  planning/.ops-approval` cuando corresponda. Lo de `check-ignore` con trackeados está **documentado** (man
  `git-check-ignore`, «By default, tracked files are not shown at all»), sin medir en esta corrida: medirlo es parte
  del paso 7.
- **La aprobación por chat no se ve afectada.** `engine/hooks/chat.js:111` compara contra la ruta y contra su basename,
  así que «commiteá el package.json» sigue nombrando un ítem absoluto. Y por esa misma razón el chat tiene un borde
  parecido —el basename no distingue repos—, pero ahí la concesión es por mensaje y no hereda en los gates de commit
  (`pendingNow`); no es este caso.
- **Los guards que ya usan rutas absolutas** —`test-evidence-shell`, `secrets-shell`, `plan-first` y `workspace-boundary`
  (`files.js:288`, `:316`)— no cambian. `self-approval` compara texto contra texto y no depende de la forma.
- **Queda el mismo cruce fuera de los gates de commit, con runners que escriben por patch.** `migrations`
  (`migrations.js:76`) y los guards de `generated` e `integrationSnapshot` (`files.js:96`, `:106`) aprueban la ruta tal
  como la trae la herramienta (`filesOf`, `input.js:128-137`). Un Write de Claude la trae absoluta; un `apply_patch` la
  trae relativa al `cwd`. Medido el 2026-10-25 con 0.115.1, dos repos y un payload de `apply_patch` (sin correr ningún
  runner): la línea `migrations/001_init.sql` aprobada para `api` deja pasar la reescritura de la misma migración en
  `web` (exit 0 / exit 0; sin aprobación, exit 2). Y el mismo archivo aprobado desde dos runners queda en dos formas.
  Se arregla con el mismo helper —`path.resolve(cwdOf(input), raw)` antes de cotejar— y entra en este caso: es la
  misma decisión, «una aprobación nombra un archivo de un checkout», sobre otros tres guards.
- **Un comando aprobado vale en cualquier checkout, y va en el caso 446.** `destructive` (`shell.js:175-177`) y
  `workers` (`workers.js:186`) aprueban el texto del comando, sin el `cwd` en que corre. Medido el 2026-10-25 con
  0.115.1: con la línea `git clean -fd` aprobada para `api`, el mismo comando en `web` pasa (exit 0 / exit 0; sin
  aprobación, exit 2). `shell.js:169-172` decide comando entero contra fragmento, no si el `cwd` cuenta: eso no lo
  decidió nadie. Va aparte por tres razones: no hay ruta que resolver y el arreglo cambia la forma del ítem —qué pega
  la persona y qué coteja el chat—, que es una decisión de producto; no es propio de sidecar, porque en embebido el
  mismo comando desde una subcarpeta tiene otro alcance (`shell.js:126-127`); y atarlo acá dejaría el cierre de este
  caso esperando esa decisión.
- **Pruebas que fijan la forma vieja** y hay que actualizar a propósito, no a ciegas: `test/hooks/commit.test.js`
  (`approve(...)` en `:166` y `:457`, y la línea `package.json` en `:497`), `test/planning/governed.test.js:42` y
  `test/wiring/verify-scope.test.js:106`. Cada una se cambia sabiendo qué afirmaba.
- **La prosa que describe el archivo**: `template/AGENTS.md:143-148` y los mensajes de `autobuild.js:1603`, `:1608` y
  `:2287` dicen «escribiéndolas en `.ops-approval`»; siguen siendo ciertos, pero conviene que digan que es local.
- Las rutas absolutas no viajan entre máquinas. Con el archivo local deja de importar, y eso es lo que hace que las
  dos mitades de la decisión vayan juntas.

## Contexto de descubrimiento

Una instancia sidecar de una empresa, con cuatro repos. Su `.ops-approval` tiene desde el 2026-10-13 la línea
permanente `package.json`, aprobada para sumar un script a un manifiesto sin tocar su lock. Revisándola salió que vale
también para el `package.json` del repo principal, donde una dependencia nueva sin `pnpm-lock.yaml` pasaría sin freno.
La persona preguntó por qué unas líneas eran absolutas y otras no, y la respuesta era que dependía del guard.

Al revisar el caso el 2026-10-25 salieron dos cosas que el enunciado no preveía: que el cruce también ocurre entre
líneas de trabajo con un solo repo, y que el tradeoff que daba por hecho que el archivo era local y estaba ignorado
era falso.

## Relacionados

- 097 — en sidecar, el bloqueo mandaba a aprobar en otro `planning/`. Misma familia: dónde y con qué forma se escribe
  una aprobación en sidecar.
- 089 — decidió que cada guard cotejara en la forma que tiene a mano e imprimiera la línea exacta; este caso cambia esa
  forma para los gates de commit.
- 394 — las líneas de trabajo como worktrees dentro de la carpeta de sesión, que es lo que multiplica los checkouts del
  mismo repo.
- 446 — el mismo cruce para los comandos aprobados, que no tienen ruta que resolver; comparte el archivo y el aviso
  de `check`.
- 128 — una línea nueva del `gitignore` no llega a una instancia que ya existe: por eso `trails.js` avisa, y ahí se suma `.ops-approval`.

## Cierre

**Resuelto en 0.116.0**, junto con el 446, con la decisión tomada el 2026-10-25: archivo local y rutas absolutas.

Revisado contra el fuente antes de arreglarlo, y corriéndolo: las citas `archivo:línea` se sostenían, y la
reproducción dio la misma salida que el caso el 2026-10-25. Correrlo encontró lo que el enunciado no preveía, y se
sumó al caso antes de construir: el cruce entre líneas de trabajo con un solo repo, el tradeoff falso de que el
archivo ya estaba ignorado, y el mismo cruce en `migrations` por parche.

El caso, sección por sección:

- **Resumen, el cruce entre repos y líneas.** Se hizo: `approval.js` tiene `inRepo`, que nombra una ruta del índice
  entera desde la raíz real de su repositorio, y la usan `dependencies`, `verify`, `governance` y `comments`; `ops
  governed` arma la misma forma. El bloqueo de `dependencies` nombra el repositorio en vez de `.:`.
- **Resumen, el archivo versionado.** Se hizo: la línea en `template/gitignore`, con su razón, y `.ops-approval` en
  `LOCAL` de `engine/core/trails.js`.
- **Fix, paso 1, pruebas en rojo.** `test/hooks/approval-scope.test.js`: tres de sus cuatro pruebas en rojo antes del
  arreglo; la cuarta, que un manifiesto que sólo cambia scripts sigue pasando, verde antes y después (ver abajo).
- **Fix, paso 2, un solo lugar.** Se hizo distinto: dos funciones y no una, porque hay dos formas de llegar —`inRepo`
  para la ruta del índice y `at` para la que trae una herramienta, relativa al cwd si viene por parche—.
- **Fix, paso 3, `governed` contra el árbol de la línea.** Se decidió que no hacía falta, y es el primer tradeoff.
- **Fix, paso 4, local.** Hecho; ver Resumen.
- **Fix, paso 5, `check` nombra las líneas viejas.** Se hizo distinto: las nombra, pero **no** propone la forma nueva.
  Deducirla es justo lo que no se puede: `package.json` no dice de qué repositorio era, y adivinar uno sería escribir
  la aprobación que nadie dio. El aviso manda a aprobar con la línea que dé el próximo bloqueo. Y no confunde los
  ítems que no son rutas: los reconoce porque llevan espacios.
- **Fix, paso 6, CHANGELOG.** En 0.116.0, con qué hacer al actualizar.
- **Fix, paso 7, prueba real y mutación.** Abajo.
- **Tradeoffs, `autobuild` pide aprobar una ruta que el commit no nombra.** No ocurre, y se comprobó leyendo
  `governedOf` (`engine/hooks/governance.js:30-33`): sólo gobierna lo que cuelga de la raíz ops, y la instancia no se
  replica en las líneas. Un archivo de un repositorio del producto nunca es gobernanza, así que no hay ruta de línea que
  `governed` pudiera nombrar mal. Además `autobuild` ya le pasa el árbol de la línea con `--service`
  (`automatization/workflows/autobuild.js:1362` y `:1592`).
- **Tradeoffs, las aprobaciones permanentes en la forma vieja.** Dejan de valer, y `check` las nombra.
- **Tradeoffs, una instancia que ya lo commiteó.** Se hizo: `trails.js` pregunta además `git ls-files`, y para lo
  versionado dice `git rm --cached` en vez de «agregá la línea». El mecanismo que lo pedía se midió con git 2.53.0: con
  el archivo trackeado y la regla puesta, `git check-ignore` sale 1; con `--no-index`, 0; sacado del índice, 0. Vale para
  los cuatro archivos locales, no sólo éste.
- **Tradeoffs, el chat.** Sin cambios: `mentions` compara también el basename, y `package.json` sigue nombrando el ítem.
  La suite de chat sigue en verde.
- **Tradeoffs, los guards que ya usaban rutas absolutas.** Eran menos de los que el caso decía: `plan-first`, `secrets`,
  `secrets-read`, `generated`, `integrationSnapshot`, `test-evidence` y `engineWrites` cotejaban la ruta **cruda** de la
  herramienta, absoluta sólo cuando la manda un Write. Todos pasan por `at` ahora, porque comparten el `approved` de
  `files.js`.
- **Tradeoffs, el cruce por parche.** Se hizo con el mismo `at`. `migrations` normaliza las barras antes de resolver,
  y el bloqueo ofrece esa misma forma: si ofreciera la cruda, una ruta con `\` daría otra línea.
- **Tradeoffs, un comando aprobado vale en cualquier checkout.** Salió como el caso 446 y se resolvió en la misma rama.
- **Tradeoffs, las pruebas que fijaban la forma vieja.** Se cambiaron sabiendo qué afirmaba cada una: `commit.test.js`,
  `governed.test.js`, `files.test.js`,
  `plan-first.test.js` y `approval.test.js`. Las de `governed` y `plan-first` suman además la aserción de que la línea
  relativa ya no aprueba. `verify-scope.test.js` no se tocó: escribe una línea relativa, pero lo que mide es que el
  archivo sin trackear no fuerce la copia, y ahí su contenido no cuenta.
- **Tradeoffs, la prosa.** `template/AGENTS.md` dice que la ruta va entera y que el archivo no se commitea; el comentario
  de `HOW` decía que cada guard cotejaba «en la forma que tiene a mano», y se corrigió. Los mensajes de `autobuild` que
  mandan a escribir en `.ops-approval` siguen siendo ciertos.

**Lo que el caso no preveía**: `dependencies` le pasaba a `lockUnaffected` las rutas que salían de la aprobación, y
con la forma absoluta el `git show` de esa función habría fallado y vuelto a frenar un cambio de scripts sin dependencias
(caso 181). Se separó: la aprobación coteja la absoluta y `lockUnaffected` recibe la del índice. Lo cuida la cuarta prueba
de `approval-scope.test.js`.

**Lo que se corrió para saber que funciona**, el 2026-10-25 y con el motor del fuente:

- La reproducción del caso, entre repos (`ops init --mode sidecar` con `api` y `web`): sin aprobación, exit 2 y el bloqueo
  nombra `…/api: cambió package.json` y la línea `…/api/package.json`; con `package.json`, exit 2 en `api` y en `web`;
  con la absoluta de `api`, exit 0 en `api` y exit 2 en `web`. Antes, los pasos 2 y 3 salían en exit 0.
- Entre líneas (`ops bench sidecar` y `ops line … x app`): aprobada la de la carpeta de sesión, exit 0 ahí y exit 2 en
  `lines/x/app`; sumada la del árbol de la línea, exit 0. Antes, exit 0 en las dos.
- Por parche, `migrations` con dos repos: relativa, exit 2; absoluta de `api`, exit 0 en `api` y exit 2 en `web`.
- El archivo local: en una instancia nueva `git check-ignore -v planning/.ops-approval` sale 0 por la línea 24 del
  `.gitignore`; y `check` con una línea `package.json` dice «1 línea(s) con una ruta relativa, que ya no aprueba nada».
- Cinco mutaciones en una copia del árbol, cada una en rojo: `inRepo` devolviendo la ruta relativa (3 pruebas), `at`
  devolviendo la cruda (2), `check` sin el aviso de líneas viejas (1), `trails` sin detectar lo versionado (1) y
  `.ops-approval` fuera de `LOCAL` (2). Restaurada, 41 de 41.
- `npm run ci` en verde, también después de las revisiones y las pruebas que se sumaron abajo: 1609 pruebas, cobertura en su piso.

**La revisión de código del diff entero**, con los dos casos juntos, trajo cuatro hallazgos de este caso:

- `check` contaba como ruta vieja cualquier línea de una palabra, y `workers` aprueba un runner sin cota justamente
  así —`vitest`—. Se hizo: una ruta relativa se reconoce además por una barra o un punto; lo cuida la prueba de
  `check`, que suma `vitest` como aprobación vigente, y devolver la heurística anterior la pone en rojo.
- El `rev-parse` que `inRepo` suma a cada commit. Se hizo: la raíz se pide al primer uso, y `governance` reusa la que ya
  calculaba.
- Que `governed` pidiera aprobar dos rutas, la de la carpeta de sesión y la del árbol de la línea. Se decidió que no
  ocurre, por lo mismo que el primer tradeoff: el árbol de una línea no cuelga de la raíz ops y nunca es gobernanza.
  Se simplificó la ruta que nombra, que era el destino mismo armado dos veces.
- Que la persona nombre un archivo por su nombre en el chat y el agente se escriba la aprobación de ese archivo en
  todos los repositorios. Se midió —exit 0 con las dos rutas enteras— y salió como el caso 447: es la vía del chat, no
  la del archivo, y arreglarlo pide decidir cómo compara `mentions`.

**Después de las revisiones se cerraron cuatro pruebas que faltaban**, cada una vista en rojo con su mutación:

- `comments` entre repositorios: la línea pegada en `api` lo destraba ahí y no en `web`. Volver a la ruta del índice la
  pone en rojo.
- Los guards de escritura con la ruta de un parche —`secrets`, `generated`, `integration-snapshot` y `engine`, que no
  tenía ninguna prueba de aprobación—: la línea vieja no aprueba, la pegada sí, y no en el otro repositorio.
- Un `upgrade` real desde 0.115.1. El motor de `main` se extrajo con `git archive`, sin red; con él se creó una
  instancia sidecar con `.ops-approval` commiteado y tres líneas viejas, y se actualizó con el de la rama. Antes del
  `upgrade`, un commit del manifiesto sin su lock pasaba (exit 0); después frena (exit 2) con la misma línea puesta, y
  `check` nombra las tres líneas viejas y el archivo versionado. **Encontró un hueco**: el aviso decía
  `git rm --cached -- planning/.ops-approval`, que en sidecar —sesión en el workspace— no resuelve. Ahora lleva
  `git -C <instancia>`; corrido tal cual desde el workspace sale 0 y el aviso se calla. La prueba de `trails` lo corre
  desde la carpeta de arriba de la instancia.

**Y en sesiones reales**, el 2026-10-25, en un banco sidecar instalado fuera del árbol (`automation install … claude`),
con `app` y `web` y el motor congelado como copia de la rama:

- **Una sesión de Claude Code** (`claude -p`, cuatro turnos, unos USD 3,5) siguió una tarea escrita en un archivo
  —sumar una dependencia en los dos repositorios sin tocar el lock y commitear—. La tarea va en un archivo porque, si
  el pedido nombrara el manifiesto, la orden del chat lo aprobaría. La sesión se frenó en `app`, dio la línea entera
  `…/app/package.json` y dijo sola que `web` necesitaba la suya; no escribió `.ops-approval`. Con la línea de `app`
  pegada commiteó `app` y `web` siguió frenado; con la de `web`, pasó.
- **`/autobuild` en una línea de trabajo** (`piloto` sobre `app`, tarea `lite` que suma una dependencia sin lock, unos
  USD 13 entre la parada y la reanudación). Paró en `commit-needs-approval` pidiendo
  `…/lines/piloto/app/package.json`, la ruta del árbol de la línea. Con el shim instalado, ni la ruta del checkout
  principal ni la relativa destraban ese commit (exit 2), y la del árbol sí (exit 0). Puesta esa línea, la reanudación
  commiteó en `line/piloto` y cerró la tarea en `done/`. Una corrida anterior no tomó la tarea porque el hito no estaba
  asignado a la línea; eso es del banco, no del motor.

