# Trabajo en equipo

> Camino recomendado. Adaptar en `project.md` y registrar excepciones durables mediante ADR.

Una instancia la comparte un equipo, y lo que comparte es de tres clases distintas. Casi todos los
choques entre dos personas —o entre dos agentes— salen de tratarlas igual.

## Los tres anillos

| Anillo | Qué vive ahí | Escritores | Frecuencia |
|---|---|---|---|
| **Compartido** | `roadmap/`, `BACKLOG.md`, `INBOX.md` e `inbox/`, `HUMAN_ACTIONS.md`, `done/`, reglas y ADR | cualquiera, en actos humanos | baja |
| **Coordinación** | `claims/`, un archivo por tarea tomada | uno por tarea | dos veces por tarea |
| **Local** | `wip/<runner>.md`, `.verify-log`, `.push-log`, el árbol de trabajo | vos | continua |

La regla que los separa: **un archivo con más de un escritor tiene que cambiar poco; uno que cambia mucho
tiene que tener un solo escritor.** Cuando uno viola las dos a la vez, el equipo se pisa en cada commit.

De ahí sale el corolario que ahorra la mayor parte de las conversaciones: **no hace falta que cada persona
sepa qué está haciendo la otra.** Hacen falta dos cosas y sólo dos — qué está tomado, para no tomarlo dos
veces, y qué terminó, porque es evidencia y destraba lo que dependía de eso. Todo lo del medio —el plan,
los pasos, las decisiones en vuelo— no le sirve a nadie más y es justo lo que más cambia.

## Un árbol de trabajo por persona o por agente

Dos agentes en el mismo directorio comparten índice de git y archivos: uno stagea lo del otro, uno
commitea trabajo ajeno, y los errores no se parecen a la causa — un archivo trackeado que «no existe»
suele ser la otra sesión y no tu cambio. No es un problema de este toolkit sino del filesystem, y la
respuesta es un árbol por cada uno:

```bash
git worktree add ../repo-dashboard  feat/dashboard-filtros
git worktree add ../repo-exportar   feat/boton-exportar
```

Mismo `.git`, índices separados, archivos separados. Es la **precondición** para correr dos agentes a la
vez: sin esto, nada de lo demás de esta guía alcanza.

Cada árbol necesita además sus propios recursos —puertos, contenedores, base—. Dos agentes levantando el
mismo entorno de desarrollo en el mismo puerto fallan mucho antes que cualquier archivo de planning.

La rama por tarea y su ciclo viven en `branches.md`; acá se agrega que el árbol también se separa.

## Tomar una tarea sin pisarse

Tomar es un acto y tiene comando:

```bash
node tools/ops.js claim planning dashboard-filtros
node tools/ops.js release planning dashboard-filtros
```

`ops context` no ofrece una tarea con reclamo ajeno y nombra quién la tiene, así que dos runners
preguntando a la vez ya no reciben la misma. Y devuelve antes lo que vos reclamaste que lo que está
libre: es lo que dijiste que ibas a hacer. El contrato completo está en `../claims/README.md`.

Lo que el comando **no** hace, y hay que saberlo: un reclamo sin empujar no reserva nada, porque el otro
runner lee lo que hay en su copia. Entre `claim` y el push hay una ventana, y es de minutos sólo si se
commitea el reclamo enseguida.

**Lo que sigue a una tarea en vuelo no se le ofrece a nadie más.** Una tarea puede declarar
`(depende: slug)`, y mientras eso no esté en DONE no se ofrece ni se puede tomar: el trabajo que sigue es
de quien tiene la cabeza, y dárselo a otro produce dos ramas que se pisan al integrar. `context` lo dice
con una línea `WAIT` que nombra la dependencia y quién la tiene, para que la cola trabada no se lea como
una cola vacía. `check` rechaza una dependencia que no existe y nombra el ciclo entero cuando lo hay.

Dos cosas que el mecanismo no reemplaza:

- **Mirar el `service:`.** Es el dominio de colisión y ya está declarado en cada tarea: dos tareas de
  servicios distintos no se pueden pisar en el código, dos del mismo pueden. `ops check` avisa cuando hay
  dos reclamos sobre el mismo servicio, y avisa nada más — frenar serializaría a un equipo entero sobre
  un servicio, que es peor que la colisión que evita.
- **Repartir por hito.** Cada persona toma de un `## Hito` distinto, y `ops context planning --hito <slug>`
  acota la cola a ése. Dos personas en hitos distintos casi nunca dependen entre sí ni tocan los mismos
  archivos, así que los dos avisos de arriba casi no aparecen.

## Varios agentes en una misma máquina

Una tarea larga deja horas muertas, y ese hueco alcanza para poner otro agente a trabajar. Cuatro cosas
lo hacen posible, y ninguna pide clonar el repositorio dos veces.

**Un clon, varios árboles de trabajo.** `git worktree` no clona: comparte el mismo `.git`, el mismo
historial y los mismos objetos, y sólo materializa un segundo directorio de archivos. Cada árbol queda
fijado a su rama, así que **nadie hace `checkout` nunca** — que es lo que pisaría el trabajo del otro.

```bash
node tools/ops.js worktree planning dashboard-filtros
```

Resuelve en qué repositorio vive el `service:` de la tarea, crea la rama `task/<slug>` y el árbol al
lado, y devuelve la ruta con el `export CAUCE_RUNNER` ya escrito. Correrlo dos veces devuelve el árbol que
ya existe en vez de crear otro.

**La instancia, una sola y compartida.** Si `ops/` vive dentro del repositorio (`mode: embedded`), cada
árbol se lleva su propia copia de `planning/` — o ninguna, si todavía no se commiteó— y los reclamos de un
agente no los ve el otro hasta mergear: justo la coordinación que en una máquina tendría que ser
instantánea. Con `mode: sidecar` la instancia es una, al lado de los repos, y los reclamos se ven al
momento y sin git de por medio.

`ops worktree` lo avisa cuando prepara un árbol sobre una instancia embebida. No lo frena: un árbol por
rama con un solo agente es un uso legítimo, y lo que se rompe es la coordinación entre varios.

**Una línea de trabajo, para lo que la principal no toma.** El trabajo de siempre es el principal: una sesión,
la carpeta de siempre, los checkouts de siempre. Una línea existe sólo para que **otra** sesión tome, a la vez,
trabajo que la principal no toma —un frente aparte, como pagos mientras vos seguís con lo tuyo—. Quien trabaja
concentrado en lo suyo no tiene líneas, y nada de esto le aparece.

Una línea es un **frente de trabajo**: un nombre, los hitos que lleva —los que dicen `line: <nombre>`— y los
repositorios del producto donde vive ese trabajo. El frente se decide antes que el repositorio, así que una línea
puede nacer sin ninguno —`node tools/ops.js line . pagos`—: queda declarada, sin nada en disco, y su sesión ya puede
escribir sus hitos y planificarlos. El repositorio de la primera tarea que pide su árbol —`ops worktree --line`, que
es lo que corre `/autobuild`— se suma a la línea en ese momento, con su árbol, y la salida lo dice. Si ya se sabe,
se nombra al armarla:

```bash
node tools/ops.js line . pagos backend-pagos
```

Declara la línea en `ops.config.json` —`"lines": { "pagos": ["backend-pagos"] }`, que se commitea— y arma,
dentro de la carpeta de sesión, un worktree de cada repositorio en `lines/pagos/<repo>/`, en la rama
`line/pagos`. La rama sale de la rama viva del repositorio, no de donde esté parado su checkout. En disco la línea
aparece como un árbol por repositorio porque eso es lo que la aísla: la principal sigue en `backend-pagos/` y la
línea trabaja en `lines/pagos/backend-pagos/`, cada una en su rama. Que el frente viva en un repositorio que la
principal también trabaja es lo normal, no un caso aparte. La sesión de la línea escribe sólo en sus árboles y en
la instancia: los guards de límites frenan lo demás de la carpeta de sesión —el checkout de la principal, el árbol de
otra línea, un repositorio que la línea no trabaja—, también lo que un `git` cambiaría ahí —su rama, su árbol, su
stash—, y dicen dónde va, salvo lo que la persona nombre o confirme en el chat. En la carpeta de la línea está
sólo lo que trabaja; si un repositorio nombra a otro por ruta relativa —un `../shared-lib`—, ése también se suma a
la línea, con su árbol. Cada árbol es un checkout aparte, con sus propias dependencias y sus propias pruebas: se instalan
adentro. Aparte son los archivos, no lo que el repositorio nombra fuera de git. Docker Compose toma el nombre del
proyecto de la carpeta, y el árbol se llama como el repositorio —para que `../` resuelva igual—, así que desde
`lines/pagos/backend-pagos/` un `docker compose up` es el mismo proyecto que desde `backend-pagos/`: los mismos
volúmenes, aunque no tengan nombre, y los mismos contenedores. Lo que el compose fija a mano —un volumen con `name:`,
un `container_name`, una IP, un puerto— choca además con cualquier nombre de proyecto. Las dos cosas se separan del
lado del producto: `COMPOSE_PROJECT_NAME` en el `.env` del árbol para lo primero, y el nombre de la línea en lo fijo
para lo segundo. Cauce no reescribe el compose.

```
acme/                         la carpeta de sesión: una sola, con un solo CLAUDE.md y un solo .claude/
├── acme-ops/                 la instancia, una sola: un planning, un staging
├── backend-pagos/            checkout principal: ahí sigue la principal
├── shared-lib/
└── lines/
    └── pagos/
        └── backend-pagos/    worktree en line/pagos: lo único de la línea
```

La sesión de la línea se abre **en la misma carpeta** que la principal, con las mismas reglas, los mismos
permisos y la misma instancia, y dice qué línea lleva: `/autobuild pagos`, o `--line pagos` en `context`, `claim`
y `release`. Sin argumento la sesión es la principal: ve los hitos sin `line:` y nunca toma uno de una línea, así
que olvidarlo no pisa a nadie. Eso mismo es lo que los guards leen para saber qué línea lleva la sesión —el
`/autobuild`, el `--line` de `claim` o de `worktree`—: no hace falta exportar nada. Con la línea, cada tarea se construye y se verifica en el árbol de la línea y se
commitea en su rama, que junta las tareas de la línea y se lleva a un PR entera. El id del runner de la sesión
lleva la línea, así que las dos sesiones tienen cada una su WIP y sus reclamos aunque corran `ops` desde la misma
instancia.

Qué trabajo es de cada línea se declara en el hito: `line: pagos` en el frontmatter de su `backlog/<hito>.md`. La
sesión de `pagos` sólo ve esos hitos y la principal sólo los que no son de ninguna. `ops context` muestra la línea
en la línea `LINE`, con los hitos que no te ofrece.

**Dos líneas pueden trabajar el mismo repositorio**, cada una en su rama: no se pisan, porque git no deja la misma
rama en dos árboles. Lo que no se aísla es el merge, así que `ops line` lo avisa al armarla y `ops lines` muestra
qué archivos cambiaron las dos.

El checkpoint entre hitos también es por línea. Cuando una línea termina un hito y el proyecto pide revisión
humana, queda en `checkpoints/<hito>.md` con su `line:`, y frena a esa línea y a ninguna otra: quien trabaja
en `admin` sigue mientras `auth` espera que la revisen. Para detener todo a propósito está `AWAITING_REVIEW.md`,
que frena a todas. `checkpoints/README.md` tiene el detalle.

**Qué está haciendo cada línea** lo dice `node tools/ops.js lines .`: un bloque por línea con sus árboles, cuánto
los separa de la rama viva, lo que tienen sin commitear, su cola, sus reclamos, lo que tiene en vuelo y los
checkpoints que la frenan. Y qué hito es de qué línea lo propone `flow` en la sección `## Hitos` de la épica, entre
las líneas que ese mismo comando le muestra; quien promueve lo confirma o lo cambia, y `promote` lo escribe.

**Retirarla** es `node tools/ops.js lines join . <nombre>`, cuando su rama ya llegó por PR a la rama viva de cada
repositorio. En seco dice qué repositorio falta y qué hitos de la línea quedan sin terminar; con `--apply` saca
los árboles, las ramas y los enlaces, y la quita de `ops.config.json`. Se niega si algo no llegó o tiene cambios
sin commitear.

**Las líneas de antes de 0.111.0** eran un worktree de la instancia en `line/<nombre>`, con su propia carpeta de
sesión al lado, y su planning vivía en esa rama. Siguen andando —la línea sale de la rama de su árbol— hasta la
1.0.0. `node tools/ops.js lines migrate . <nombre> <repo>...` la pasa a la disposición nueva: trae su planning a la
instancia, retira el worktree y su rama, y arma la línea nueva. Se niega con reclamos en vuelo, que llevan el id
del árbol que se va. La carpeta de al lado no se borra sola: puede tener algo que alguien copió a mano. Para una de
éstas, `lines join` sigue juntando la rama de planning como antes: en seco dice qué archivos chocan y qué hacer
con cada uno, y con `--apply` mergea y corre `check`.

Al juntar el planning de dos ramas, casi nada de lo que cada una escribió choca: la cola, el INBOX, la evidencia,
los reclamos, los checkpoints y las acciones humanas son un archivo por unidad. Quedan dos archivos que las dos
pueden escribir. `LESSONS.md`: si las dos ramas anotaron una lección, su tabla choca al juntarse, y se
resuelve a mano quedándose con las filas de las dos. Ahí el conflicto es correcto, porque una corrida puede
actualizar una fila que ya estaba. Y `HUMAN_ACTIONS.md`, la tabla anterior de acciones humanas, si alguien le
sigue agregando filas a mano: los recorridos ya no la escriben —ver «Lo que git tiene que saber», más abajo—.

**Un id por agente.** Sin eso los dos resuelven la misma identidad de git y el segundo toma por propia la
tarea del primero. Al abrir una sesión, `ops runners planning` dice qué runners tienen trabajo abierto;
el agente pregunta cuál se retoma o si arranca uno nuevo, y **exporta el id él mismo**. A una persona no
se le pide que escriba una variable de entorno. El contrato está en `../claims/README.md`.

**Recursos propios.** Puertos, contenedores y base por agente. Dos sesiones levantando el mismo entorno
en el mismo puerto fallan antes que cualquier archivo de planning.

Sirve igual para dos agentes de la misma herramienta o de herramientas distintas: la reserva es del CLI,
no del runner que la invoca.

## Pasar una tarea a otra persona

El plan es local, así que no viaja: quien recibe la tarea ve el reclamo y no cómo venía pensada. Eso está
bien casi siempre —nadie necesita el plan de otro— y falla justo cuando hace falta.

Por eso el traspaso es un acto y tiene tres pasos: quien deja **publica su plan** donde el otro lo lea —una
nota en la tarea, un mensaje, lo que el equipo use—, suelta el reclamo, y quien toma lo reclama. El costo
de compartir el plan se paga entonces, que es cuando sirve.

Lo que no hay que hacer es empujar tu `wip/<runner>.md`: sería devolver a git el archivo que más cambia,
todos los días, para resolver algo que pasa una vez cada tanto.

## Una sesión construye y otra revisa

Una tarea se puede repartir entre quien la construye y quien la juzga: un programador —de cualquier runner— y un
revisor que no fue quien la escribió. El traspaso es por los archivos de planning, y no hace falta nada más que esto:

- **Quien construye** reclama, escribe su plan en el WIP, construye y commitea, y ahí se detiene: deja el WIP en
  `phase: Review`, con los pasos tachados, y no escribe en `done/` ni saca la tarea de la cola.
- **Quien revisa** toma la tarea por ese estado. Juzga con lo que está en disco —la aceptación, el WIP, el diff de la
  rama y la mutación que la aceptación declara, corrida en una copia—, no con el informe de quien construyó. Si aprueba,
  hace el cierre entero: `done/<tarea>.md`, la tarea fuera de la cola, el WIP limpio y `ops release` del reclamo, que
  suelta aunque lo haya tomado otro porque la tarea ya está en DONE. Si no aprueba, anota los hallazgos en
  `## Bloqueos` del WIP y lo devuelve a `phase: Build`, sin soltar el reclamo: la tarea sigue siendo de quien la
  construye, que la retoma desde los hallazgos.

Dentro de una línea los dos tienen el mismo id —el de la instancia con la línea, desde cualquier carpeta—, así que el
revisor ve el WIP del programador como propio y lo continúa: no hay que pasarle nada. La contracara es que ese WIP es
el de los dos, así que **no trabajan la misma línea a la vez**: el revisor entra cuando el programador dejó
`phase: Review`, y el programador vuelve cuando el revisor la devolvió. Si hace falta que trabajen en paralelo, cada
uno declara su propio id con `CAUCE_RUNNER`, y entonces el revisor lee el plan del otro con `ops runners`.

**Un rol que lanza otro agente se lanza con `CAUCE_DELEGATED=1`.** Cauce no frena lo que la persona pide en el chat, y el
pedido con que un coordinador lanza a un programador —`claude -p "…"`, `codex exec "…"`, `gemini -p "…"`— le llega al runner
como si fuera de ella. Sin la variable, esa sesión entera queda sin `plan-first` ni la gobernanza. Con ella, ningún mensaje de
la sesión cuenta como de la persona, y lo que el guard frena se aprueba por archivo. El comando del recorrido
(`/autobuild <línea>`) no necesita la variable: un comando de Cauce nunca contó como pedido de la persona.

### Qué runner puede tomar qué rol

Cualquiera de los cuatro que Cauce soporta puede ser líder —escribe la aceptación—, programador o revisor, con los guards
de Cauce corriendo y el traspaso de arriba. Se midió con sesiones reales, cada rol con un pedido que sólo nombraba el rol
(Claude 2.1, agy 1.4, Gemini 0.63 y Codex 0.162, en octubre de 2026). Lo que cambia entre ellos es qué hay que darle al
runner para que el rol ande, y eso es configuración del runner, no de Cauce:

| Runner | Líder | Programador | Revisor | Lo que el runner necesita |
|---|---|---|---|---|
| Claude | ✓ | ✓ | ✓ | Nada. Es el único donde `/autobuild` es un recorrido con fases; en los otros es un skill que el agente sigue. |
| Antigravity (`agy`) | ✓ | ✓ | ✓ | Nada. No tiene hook de mensaje, así que lo que se le pide nunca exime de un guard. |
| Codex | ✓ | ✓ | ✓ | Para commitear en el árbol de una línea, `-s danger-full-access`: con `workspace-write` su sandbox deja el `.git` de sólo lectura, también con el `.git` en `writable_roots`. Ahí lo contienen los guards de Cauce. La otra salida es que commitee otro rol. |
| Gemini | ✓ | ✓ | ✓ | Que la persona le permita la terminal en `~/.gemini/policies/` (`toolName = "run_shell_command"`, `decision = "allow"`): sin interfaz, lo que pediría confirmación se niega, y la carpeta de políticas del proyecto todavía no la lee. Y que confíe en la carpeta —en su lista de carpetas de confianza o con `GEMINI_CLI_TRUST_WORKSPACE=true`—: con `--skip-trust` corre sin la configuración del proyecto, que es donde están los hooks, y ningún guard de Cauce corre. |

Un runner que no está en la tabla necesita su adaptador antes de tomar cualquier rol: cómo se registran sus hooks, cómo se
llaman sus herramientas de leer, escribir y correr comandos, y dónde lee sus reglas. Con el nombre de una herramienta mal
alcanza para que un guard deje de correr sin que nada lo diga. Por eso, para Antigravity, que se actualiza solo,
`automation doctor` avisa cuando su versión no es la que se midió.

## Cuando el equipo crece o se achica

**No se escala por archivo: se escala por instancia.** Los umbrales no son leyes; son el momento de mirar.

| Tamaño | Qué alcanza | Qué se rompe primero |
|---|---|---|
| 1 | todo tal cual | nada |
| 2 a 8 | un `planning/`, un árbol por persona, reparto por hito | sacar la tarea de `BACKLOG.md` al cerrarla, que es lo único que dos personas se disputan |
| 8 a 20 | lo mismo, con la cola acotada por hito (`--hito`) | el `BACKLOG` se vuelve **ilegible** antes que contencioso: nadie lee sesenta tareas para elegir la suya, y acotar por hito ayuda sólo si los hitos están bien cortados |
| 20+ | una instancia por equipo o por dominio | la coordinación pasa a ser entre instancias, que es `multi-repo.md` |

Achicarse parece más fácil y tiene una trampa: **lo que tomó quien se fue no se libera solo.** `ops check`
avisa a los tres días sin que la rama de la tarea se mueva —una tarea larga que avanza no se apura—, pero
soltarlo es borrar el archivo de `claims/` a mano — `ops release` se niega a
hacerlo por vos—. Al bajar de tamaño se recorren esos reclamos igual que las filas de `HUMAN_ACTIONS.md`
que esperaban a esa persona.

## Dónde va cada cosa que el equipo se dice

| Lo que pasó | Dónde va | Por qué ahí |
|---|---|---|
| Una decisión que cambia cómo se construye | `adr/` | se consulta dentro de un año |
| Una norma que hay que cumplir siempre | `business-rules/` o `rules/` | la lee un agente en cada tarea |
| Algo que sólo puede hacer una persona | `human/`, una acción por archivo | frena su tarea hasta que se resuelva |
| Una idea, una deuda, una lección | `inbox/<sección>/`, una por archivo | espera promoción humana |
| Lo que una tarea entregó, con su evidencia | `done/<slug>.md` | es lo que se audita |
| Qué tarea estoy haciendo | `claims/` | para que nadie la tome dos veces |
| «Salgo a almorzar», «está lento el CI» | el canal del equipo | no es durable y no se audita |

La última fila pesa tanto como las otras: meter conversación en el repositorio lo vuelve ilegible, y sacar
decisiones del repositorio las pierde.

## Lo que git tiene que saber

Las acciones humanas nuevas van en `human/`, un archivo por cada una, y ahí no hay nada que git tenga que
saber. Lo que sigue vale para `HUMAN_ACTIONS.md`, la tabla que una instancia anterior ya tiene con filas.

`.gitattributes` declara que `HUMAN_ACTIONS.md` y su histórico se concatenan en vez de conflictuar cuando
dos personas registran un bloqueo el mismo día. Llega con la instancia y sus bordes están escritos ahí
adentro. La evidencia de una tarea no lo necesita: vive en su propio archivo y nadie escribe el de nadie.

Hay un caso en que la regla no está: cuando la instancia vive dentro de un repositorio que ya tenía su propio
`.gitattributes`, `init` conserva el del repositorio. Ahí dos líneas que registren un bloqueo chocan al
juntarse. `ops check` lo avisa cuando hay líneas en uso, y la salida es agregar una línea al `.gitattributes`
de la raíz del repositorio —el aviso la trae con la ruta que corresponde—:

    planning/HUMAN_ACTIONS.md merge=union

Para comprobarlo: `git check-attr merge planning/HUMAN_ACTIONS.md` tiene que contestar `merge: union`.

La unión tiene un costo que conviene conocer. Concatena, no decide: si una línea resuelve una fila mientras
otra registra la suya, al juntarse quedan las dos versiones de la fila resuelta, y la que dice `pendiente`
vuelve a bloquear su tarea. No hay conflicto que lo avise. `ops check` lo rechaza —«volvió a pendiente al
juntar dos ramas»— y la salida es borrar la versión que no corresponde. Es la razón por la que las filas
nuevas ya no se escriben en esa tabla.
