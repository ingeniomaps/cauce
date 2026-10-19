---
caso: 394
titulo: Una línea de trabajo no necesita carpeta de sesión propia, y tenerla le quita la gobernanza de la carpeta donde se trabaja
estado: resuelto
resuelto-en: 0.111.0
prioridad: alta
version-detectada: 0.110.0
---

# 394 — `ops line` arma una carpeta de sesión hermana para cada línea: la sesión que ya estaba abierta queda afuera, y la carpeta nueva nace sin las reglas, los permisos ni lo local de la original

**🟢 resuelto en 0.111.0** · detectado en 0.110.0 · prioridad **alta**. Es un caso de diseño. La carpeta hermana se inventó para
que los guards de cada línea fueran los de su árbol (caso 218), y desde entonces cada cosa que vive en la carpeta de
sesión hay que replicarla o enlazarla. Cada una que falta es un caso nuevo, y las que faltan hoy son las que hacen la
gobernanza: las instrucciones del proyecto y los permisos. Trabajar con una línea quedó peor que trabajar sin ella.

## Resumen

Una línea existe para que un trabajo tenga sus ramas, sus commits y sus pruebas sin depender de otro. Hoy `ops line`
le da un worktree **de la instancia** y una **carpeta de sesión propia**, `<carpeta>-<nombre>/`, con su
`.claude/`, su `CLAUDE.md`, su motor enlazado y los repos del producto enlazados a los originales (`engine/cli/lines.js:3-8`, `:42-50`).

En la práctica pasa esto: la sesión está abierta en la carpeta donde se programa, `ops line` arma la línea al lado y
termina con «Abrí la sesión de esta línea en …». Si la sesión sigue donde estaba, escribir en la línea es escribir
fuera de su proyecto, y Claude Code pide aprobación archivo por archivo. Si se abre una sesión en la carpeta nueva,
esa sesión corre sin las reglas del proyecto, porque su `CLAUDE.md` nace con el bloque de Cauce solo. En los dos
casos se pierde la gobernanza.

## Por qué existe la carpeta hermana

Lo dice el caso 218, y se comprobó sobre un banco el 2026-10-19:

- Los hooks de `.claude/settings.json` apuntan a una ruta fija:
  `"command": "$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-shell.sh"`.
- `run-hook.sh` saca el `OPS_ROOT` de su propia ubicación (`ops_root=$(cd "$hook_dir/../.." && pwd)`). De ahí lee el
  guard qué `ops.config.json`, qué `planning/` y qué `.ops-approval` aplicar.
- Los recorridos se renderizan con ese mismo prefijo: en la carpeta de una línea recién armada, 53 archivos de
  `.claude/` (`skills`, `workflows`, `agents`) nombran `ops/`.

O sea que una carpeta de sesión queda atada a un solo árbol. Lo que **no** cambia entre líneas es el código de los
guards: `run-hook.sh` ejecuta `node_modules/@ingeniomaps/cauce/engine/hooks/run.js`, que es el paquete instalado y el
mismo para todas (`lines.js:10-11`). Lo que la carpeta duplicada protege es la configuración y el planning del árbol,
nada más.

## Síntoma

Medido el 2026-10-19 en una instancia real con `@ingeniomaps/cauce` 0.110.0. Los nombres son ficticios: la carpeta
de sesión `acme/`, sin git, con la instancia `acme/acme-ops/` y un repo por servicio, y las líneas `auth` y `admin`
armadas ese mismo día.

```
$ node tools/ops.js line . pagos
✓ …/acme-pagos/acme-ops  (line/pagos)
  enlazados al original: ../AGENTS.md, …, ../backend-pagos, …
  runners: claude, gemini
Abrí la sesión de esta línea en …/acme-pagos: ahí está su configuración, apuntando a su árbol.
```

La sesión siguió en `acme/` y su primera tanda de escrituras en `acme-pagos/acme-ops/planning/` pidió aprobación
archivo por archivo. Además:

```
acme/CLAUDE.md            12454 bytes   (reglas del proyecto + bloque de Cauce)
acme-pagos/CLAUDE.md       4200 bytes   (sólo el bloque de Cauce, recién creado por `ops line`)

acme/.claude/settings.local.json        additionalDirectories: [acme-auth, acme-admin]   ← sin la nueva
acme-auth/.claude/settings.local.json   additionalDirectories: [acme, acme-admin]        ← sin la nueva
acme-pagos/.claude/                     settings.json, sin settings.local.json
```

Las tres líneas se arreglaron a mano: se copió el `CLAUDE.md` de la carpeta original (y después hubo que restaurar
`.cauce/manifest.json`, que había registrado como de Cauce el archivo recién instalado), se escribió
`additionalDirectories` en cada carpeta y quedó anotado como paso manual en una ADR de la instancia. Con la tercera
línea el paso escrito no alcanzó.

Reproducido sobre un banco el 2026-10-19 con `main` en `65a002af`: carpeta `sess/` con un `CLAUDE.md` propio («PR al
fork. Commits en inglés.»), instancia `sess/ops` con la raíz `..`, runner `claude` instalado y `ops line . pagos`.

```
$ wc -c sess-pagos/CLAUDE.md
2531 sess-pagos/CLAUDE.md
$ grep -c "PR al fork" sess-pagos/CLAUDE.md
0
$ grep -rn additionalDirectories engine
(nada)
```

## Causa raíz

- **Instrucciones.** `lines.js:138-139` instala cada runner en la carpeta de la línea antes de enlazar lo de la
  original. La instalación crea el archivo compartido con `mergeInstruction` (`engine/automation/config.js:183-188`,
  llamada desde `engine/automation/index.js:410`), sólo con el bloque. Después `linkIfMissing` (`lines.js:53-58`,
  usado en `:165`) lo saltea porque ya existe. El orden es a propósito (caso 263, para no pisar lo que escribe la
  instalación).
- **Permisos.** Nada de Cauce escribe `permissions.additionalDirectories`, ni en la línea ni en sus hermanas.
- **La salida.** Termina en «ahí está su configuración», que se lee como lista para usar.

Las dos primeras son la misma causa: todo lo que vive en la carpeta de sesión y no es de Cauce no tiene quién lo
lleve a la carpeta nueva. Es la misma familia de casos que ya se pagó: 263, 273, 352, 357, 358, 363 y 364 nacieron de
replicar o enlazar en la carpeta de la línea algo que vivía en la original.

## Corrección a lo que se anotó primero

La primera versión de este caso decía que la línea hereda el `CAUCE_RUNNER` de la instancia y que las dos se toman
las mismas tareas. **No es así.** La instalación deja `env` vacío en el `settings.json` de las dos carpetas
(verificado en el banco), y sin la variable `runner()` (`engine/planning/claims.js:53-57`) deduce el id del árbol:
corrido sin `CAUCE_RUNNER` desde `sess`, `sess/ops`, `sess-pagos` y `sess-pagos/ops`, devolvió cuatro ids distintos.
Lo que se vio en la instancia tuvo que venir de un `CAUCE_RUNNER` escrito a mano, y no es parte de este caso.

## Diseño decidido

Decidido con el dueño el 2026-10-19. **Una línea es un nombre y los repos del producto que trabaja**, no una copia de
la instancia. Hoy la línea aísla lo que no hace falta —la instancia, con su planning y su configuración— y comparte por
enlace lo que sí: el checkout del producto. El 274 lo encontró y lo resolvió con un árbol por tarea; descartó «un árbol
del producto por línea» porque multiplicaba dependencias instaladas. Ése es el costo que acá se acepta, porque es lo
que permite que cada línea pruebe lo suyo.

```
acme/                                ← la carpeta de sesión: ahí se abre siempre, ahí vive la gobernanza
├── CLAUDE.md                        ← uno solo
├── .claude/                         ← uno solo: guards, permisos, recorridos
├── acme-ops/                        ← la instancia, una sola
│   ├── ops.config.json              ← "lines": { "pagos": ["backend-pagos"], "auth": ["backend-auth", "backend-pagos"] }
│   ├── planning/                    ← un solo planning; cada hito dice `line: pagos|auth`
│   └── integrations/*/staging/      ← un solo staging
├── backend-pagos/                   ← checkouts principales: ahí sigue el trabajo que no es de una línea
├── backend-auth/
├── shared-lib/                      ← no es de ninguna línea: se lee desde acá
└── lines/
    ├── pagos/
    │   ├── backend-pagos/           ← worktree: rama line/pagos, sus deps, sus pruebas
    │   ├── backend-auth -> ../../backend-auth
    │   └── shared-lib  -> ../../shared-lib
    └── auth/
        ├── backend-auth/            ← rama line/auth
        ├── backend-pagos/           ← el mismo repo que pagos, en otra rama: se permite y se avisa
        └── shared-lib  -> ../../shared-lib
```

Lo que fija:

- **El trabajo principal es el de siempre, y las líneas son opcionales.** Una línea existe sólo para tomar trabajo
  que el principal no toma, en otra sesión. Quien trabaja concentrado en lo suyo no tiene líneas, y para él nada de
  esto aparece: ni `lines/`, ni `--line`, ni `lines` en `ops.config.json`. Una instancia sin líneas declaradas se
  comporta exactamente como hoy.
- **`lines/<línea>/<repo>/`** dentro de la carpeta de sesión. Ninguna carpeta nueva lleva `.claude/` ni `CLAUDE.md`:
  la sesión es la de siempre, con sus reglas y sus permisos, y la salida de `ops line` no manda a abrir otra.
- **Los repos que no son de la línea se enlazan** en su carpeta, sólo como enlaces y sin configuración, para que un
  `../shared-lib` escrito en un repo resuelva igual que desde la carpeta de sesión.
- **La pertenencia se declara** en `ops.config.json`, commiteada, y no se deduce de que el worktree exista (R28).
- **Dos líneas pueden trabajar el mismo repo**, cada una en su rama. git no deja la misma rama en dos worktrees: con
  git 2.43.0, un tercer worktree sobre `line/pagos` falló con `fatal: 'line/pagos' is already used by worktree at …`.
  Lo que no aísla es el merge, así que `ops line` avisa y `ops lines` muestra qué archivos cambiaron las dos ramas.
- **La sesión dice su línea con un argumento**: `/autobuild pagos`, `ops context <planning> --line pagos`. Hoy sale
  de la rama del árbol de la instancia (`currentLine`, usado en `engine/cli/planning.js:184` y
  `engine/cli/claims.js:24`), y con una sola instancia ese dato no existe. **Sin argumento, la sesión es la
  principal**: ve los hitos sin `line:` y trabaja en los checkouts de siempre. Es lo que permite seguir trabajando
  normal mientras otra sesión, en la misma carpeta, lleva una línea. Olvidar el argumento no pisa a nadie: la sesión
  nunca toma un hito de una línea, así que en el peor caso hace trabajo de la principal.
- **Una sola instancia**: la ruta fija de los hooks apunta bien, no hay dos configuraciones y el 218 no tiene cómo
  volver. El staging de las integraciones es uno, así que el problema de que no viajara al worktree desaparece.
- **El planning lo commitean varias sesiones en el mismo checkout**, cada una con sus rutas: `git commit -- <rutas>`
  deja afuera lo que otra stageó. Verificado con git 2.43.0: con `de-a.md` y `de-b.md` stageados,
  `git commit -m "sesion A" -- de-a.md` commiteó sólo `de-a.md` y `de-b.md` siguió en el índice. Dos commits en el
  mismo instante chocan en `index.lock`; el segundo falla y se reintenta.
- **Instancia embebida**: el worktree del repo trae una segunda instancia adentro y vuelve el planning duplicado. Hasta
  tener respuesta para esa disposición, `ops line` se niega ahí y lo dice.

## Partición

Son más de cinco resultados con vidas distintas (R17), así que se construye por piezas, en este orden, y el caso se
cierra cuando están todas. Cada una con su prueba vista en rojo y la mutación que la cuida:

1. **`ops line` arma la línea nueva.** `ops line <ops-root> <línea> <repo>...` escribe la pertenencia, crea cada
   `lines/<línea>/<repo>/` desde la rama viva de ese repo (`startPoint`, caso 395), enlaza los repos que no son suyos
   y no crea `.claude/` ni `CLAUDE.md`. Se niega en embebido. Mutación: devolverle la instalación del runner y ver
   aparecer el `.claude/` que la aserción de ausencia prohíbe.
2. **La sesión elige su línea por argumento.** `context`, `claim` y `/autobuild` toman `--line`; sin él son la
   principal y no ven ningún hito con `line:`. Mutación: ignorar `--line` y ver a la sesión de `pagos` tomar un hito
   sin línea, o a la principal tomar uno de `pagos`.
3. **Las fases trabajan en el worktree de la línea.** Una tarea de un hito con `line: pagos` y servicio
   `backend-pagos` se construye y se verifica en `lines/pagos/backend-pagos/`, también la puerta (276). Mutación:
   devolver la ruta del checkout principal y ver la puerta medir el código sin la tarea.
4. **El solape se ve.** `ops line` avisa cuando el repo ya es de otra línea, y `ops lines` muestra los archivos que
   cambiaron las dos ramas. Mutación: quitar el aviso y ver pasar dos líneas sobre el mismo repo en silencio.
5. **Cerrar y migrar.** `ops lines join <línea>` retira los worktrees de una línea mergeada y libera la pertenencia; y
   las líneas armadas con la carpeta hermana se pasan a la disposición nueva sin perder lo commiteado en
   `line/<nombre>`.

**Y una condición que cruza las cinco**: sobre una instancia sin líneas declaradas, `context`, `claim`, `check` y
`/autobuild` dan la misma salida antes y después del cambio, lado a lado sobre el mismo caso (R9: cambiar cómo se hace
algo es una quita aunque el resultado «sea lo mismo»).

Lo que se quita en el camino lleva su aserción de ausencia (R9): la carpeta `<carpeta>-<nombre>/`, el enlazado de
raíces de `lines.js:118-122` y `:159-169`, y la lectura de la línea desde la rama de la instancia.

## Tradeoffs

- **Se revierte la decisión del 274** de no tener un árbol del producto por línea: una instalación de dependencias
  por línea y por repo.
- **El planning de cada línea deja de tener rama propia.** Lo que una línea planifica entra directo al de todos.
- El checkout principal y el worktree de una línea son el mismo servicio: si los dos levantan su servidor de
  desarrollo, compiten por los puertos.

Cierra con este caso lo que hoy son síntomas de la carpeta hermana —las instrucciones que no llegan, los permisos
entre carpetas, la salida que manda a otra sesión, el staging que no viaja— sin parchearlos por separado: sembrar
`CLAUDE.md` y escribir `additionalDirectories` en cada línea es otra cosa más que replicar.

## Relacionados

- 218 — por qué nació la carpeta hermana.
- 263, 273, 352, 357, 358, 363, 364 — lo que costó replicarla.
- 239 — la línea que acota la cola, que hoy sale de la rama.
- 274, 276 — el checkout del producto compartido entre líneas, que este diseño separa.
- 222 — por qué el staging no se comparte entre personas; con una sola instancia la pregunta no aparece.
- 395 — de qué commit sale la rama de la línea, resuelto con `startPoint`, que la pieza 1 reusa.

## Cierre

**Resuelto en 0.111.0.** Una línea es un nombre y los repositorios que trabaja, declarados en `ops.config.json`, con
un worktree de cada uno en `lines/<línea>/<repo>/` dentro de la carpeta de sesión. La sesión dice cuál lleva con
`--line`; sin argumento es la principal. La lectura de las líneas declaradas vive en `engine/core/line-trees.js`, que
usan el CLI y los guards.

### El recorrido de lo que este caso enumeró

**Diseño decidido.**

- **El trabajo principal es el de siempre y las líneas son opcionales — se hizo, y se midió.** Ver la condición que
  cruza las cinco piezas, abajo.
- **`lines/<línea>/<repo>/`, sin `.claude/` ni `CLAUDE.md`, y la salida no manda a abrir otra sesión — se hizo.**
  `ops line` ya no instala runners ni enlaza el motor; la salida dice que la línea se lleva desde la misma sesión.
- **Los repositorios que no son de la línea se enlazan — se hizo**, en cada nivel que lleva a un repositorio propio.
  Quedan afuera los archivos sueltos y lo oculto (la configuración de la sesión), `lines/` y la instancia.
- **La pertenencia se declara en `ops.config.json` — se hizo.** `check` valida la forma (`validateLines`) y el
  esquema la describe. Un árbol en disco sin declarar no abre nada: ni para los guards ni para `--line`.
- **Dos líneas sobre el mismo repositorio, se permite y se avisa — se hizo.** Es la pieza 4.
- **La sesión dice su línea con un argumento — se hizo.** `--line` en `context`, `claim`, `release` y `worktree`, y
  en `/autobuild` como `pagos`, `--line pagos` o `{ line }`.
- **Una sola instancia — se hizo.** `ops line` no crea worktrees de la instancia; el staging y el planning son los
  de la instancia.
- **El planning lo commitean varias sesiones en el mismo checkout — se dejó como estaba.** El hecho que lo sostiene
  (`git commit -- <rutas>`) se verificó al escribir el caso, y no hay código que lo cambie.
- **Instancia embebida, `ops line` se niega — se hizo.** Se niega todo lo que no es sidecar, nombrando el modo.

**Partición.**

1. **`ops line` arma la línea nueva — se hizo.** Reusa `startPoint` (movido a `engine/planning/lines.js`, que lo usa
   también `ops lines`), se niega en embebido, y la aserción de ausencia de `.claude/` está en la primera prueba de
   `test/wiring/lines.test.js`.
2. **La sesión elige su línea por argumento — se hizo distinto en un punto.** El caso no preveía el id del runner:
   ver «Lo que el caso no preveía».
3. **Las fases trabajan en el worktree de la línea, también la puerta — se hizo.** `ops worktree --line` entrega el
   árbol de la línea en la misma forma que el de una tarea, más `line`; el recorrido construye, verifica (la puerta
   ya cambiaba la ruta por la del árbol desde el 276) y commitea ahí, en la rama de la línea, sin renombrarla ni
   retirar el árbol.
4. **El solape se ve — se hizo.** `ops line` avisa cuando el repositorio ya es de otra línea; `ops lines` muestra
   cada línea declarada y los archivos que cambiaron dos o más ramas sobre el mismo repositorio.
5. **Cerrar y migrar — se hizo.** `ops lines join <línea>` retira una línea cuya rama llegó a la viva de cada
   repositorio; `ops lines migrate <línea> <repo>...` pasa una de antes. La migración no borra la carpeta de al lado:
   puede tener lo que alguien copió a mano (R23), y la salida dice dónde quedó.

**La condición que cruza las cinco — se hizo y se midió.** Ver «Qué se corrió».

**Lo que se quita, con su aserción de ausencia.**

- **La carpeta `<carpeta>-<nombre>/` — se quitó.** La primera prueba afirma que no existe, que la línea no trae
  `.claude`, `CLAUDE.md`, `ops` ni `node_modules`, y que la salida no dice «Abrí la sesión» ni `runners:`.
- **El enlazado de raíces — se quitó**, junto con la instalación de runners y el enlace al motor. Las pruebas que lo
  medían (casos 263, 275, 352/358 dentro de `ops line`, 363) se retiraron con él; las que medían la instalación y no
  la línea pasaron a `test/wiring/install-shared-folder.test.js` sin cambiar lo que miden. La opción `ownFolder` de
  `automation install`, que sólo pasaba `ops line`, se borró.
- **La lectura de la línea desde la rama de la instancia — se hizo distinto: se deprecó.** Hay líneas armadas así en
  uso (R9: lo que está en uso no se corta). Sigue andando para esas líneas, `context` lo avisa con
  `lineWarning`, el reemplazo es `--line` con `ops lines migrate`, y la condición para borrarla es la 1.0.0. Lo
  dicen el comentario de `currentLine`, el aviso y el CHANGELOG.

**Tradeoffs.** Los tres se aceptan como estaban escritos. El de los puertos no tiene código: lo dice la guía, en
«Recursos propios».

### Lo que el caso no preveía

- **El id del runner.** Con una sola instancia, la sesión principal y la de una línea corren `ops` desde el mismo
  árbol, y sin `CAUCE_RUNNER` deducían el mismo id: compartían el WIP, y la segunda no podía reclamar mientras la
  primera tuviera una tarea. `--line` le da a la línea su id —el de la instancia con `#line/<línea>`—, y plan-first
  lo busca por la ruta de lo que se escribe, porque el guard no recibe el argumento. Una línea de antes conserva el
  suyo, para no dejar sin dueño sus reclamos.
- **`/autobuild pagos` choca con el pedido de quien lanza.** Una palabra sola era un pedido («sigue»), y leída como
  línea habría cambiado el recorrido en una instancia sin líneas. El nombre solo es una línea sólo si está declarada,
  y eso lo dice `ops contract`, que trae `lines` únicamente cuando hay.
- **Los guards de límites no abrían el árbol de la línea** con raíces declaradas por repositorio: la carpeta de sesión
  no es una raíz. `lineTrees` lo abre, con la misma comprobación de registro que un árbol de tarea.
- **`promote` deducía las líneas existentes de las ramas**, y `flow` las leía de los árboles de `ops lines`. Los dos
  ahora suman las declaradas.

### Qué se corrió

- **Las pruebas nuevas**, en `test/wiring/lines.test.js`, `test/planning/lines.test.js`,
  `test/planning/worktree.test.js`, `test/hooks/line-trees.test.js`, `test/workflows/autobuild-line.test.js`,
  `test/planning/contract.test.js` y `test/instance/core.test.js`. Una encontró un defecto propio antes de
  pasar: `held.map(heldWhy)` pasaba el índice como segundo argumento y la primera razón salía sin el repositorio.
- **Veintiuna mutaciones, las veintiuna en rojo**, cada una sobre una copia del árbol y con la prueba que la
  cuida, verde antes de mutar:
  - **Pieza 1.** Crear `.claude/` en la carpeta de la línea; quitar el punto de partida de `startPoint`; aceptar una
    instancia que no es sidecar.
  - **Pieza 2.** Ignorar `--line` en `context` y en `claim`; dejar el id del runner sin la línea; no pasar
    `--line` desde `/autobuild`; tomar por línea cualquier palabra suelta sin mirar el contrato.
  - **Pieza 3.** Entregar el checkout principal como lugar de trabajo en `ops worktree --line`; commitear en el
    árbol de la línea como en el de una tarea; sacar los árboles de línea de lo escribible; no buscar el plan de la
    línea en plan-first.
  - **Pieza 4.** Quitar el aviso del solape; vaciar la lista de archivos tocados por las dos.
  - **Pieza 5.** Dar por llegada una rama que no llegó; migrar con reclamos en vuelo; migrar sin traer el planning.
  - **Lo demás.** `promote` sin las declaradas; `contract` sin `lines`; `check` sin `validateLines`; `context`
    sin el aviso de la línea de antes.
- **La condición que cruza las cinco, lado a lado.** Sobre la misma instancia sin líneas, armada en la misma ruta y
  sin `CAUCE_RUNNER`, el motor de `main` (`65a002af`) y el de esta rama dieron salida idéntica byte a byte en
  catorce corridas: `context` en texto y en JSON (antes y después de reclamar), `claim` dos veces, `release`,
  `check` en texto y en JSON, `contract --json`, `lines` en texto y en JSON, y los prompts, las fases y el resultado
  del recorrido de `autobuild` en el arnés sin argumentos, con `sigue` y con `--max 1 sólo esta`.
- **Sobre un banco, a mano**: una carpeta `acme/` con la instancia y dos repositorios en ramas de trabajo. `ops line`
  armó `lines/pagos/backend-pagos` desde `main` con el aviso de la rama; una segunda línea sobre el mismo repositorio
  avisó el solape, y `ops lines` nombró `a.js` como tocado por las dos. `lines join` se negó con
  `line/pagos no llegó a main` y, mergeada, retiró árboles, rama y declaración sin tocar los repositorios enlazados.
  Una línea armada con el motor de `main` se migró: su commit de planning llegó a `main` de la instancia, el worktree
  y la rama de antes se fueron, y quedó `lines/pagos/backend-pagos`. Después, sin `CAUCE_RUNNER`, la principal
  recibió `t-main` con su WIP y la sesión `--line pagos` recibió `t-pago` con `…-line-pagos.md`; las dos reclamaron a
  la vez, cada una se negó a tomar lo de la otra, y `--line nope` salió con 2 y «no está declarada».
- **`npm run ci`**: 1486 pruebas, 0 fallas, y los pisos de cobertura en su lugar. El archivo nuevo entró con
  su piso medido y el de `engine/cli/lines.js` subió de 56 a 86 en ramas. Bajaron a lo medido `lines-join.js`
  (líneas 98→94, ramas 50→44: lo que no se cubre son las salidas por un `git` que falla) y `planning/lines.js`
  (ramas 95→94, funciones 100→98). Los cuatro pisos de archivos ajenos que `coverage:update` movió se dejaron como
  estaban.
