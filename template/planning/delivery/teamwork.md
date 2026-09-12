# Trabajo en equipo

> Camino recomendado. Adaptar en `project.md` y registrar excepciones durables mediante ADR.

Una instancia la comparte un equipo, y lo que comparte es de tres clases distintas. Casi todos los
choques entre dos personas —o entre dos agentes— salen de tratarlas igual.

## Los tres anillos

| Anillo | Qué vive ahí | Escritores | Frecuencia |
|---|---|---|---|
| **Compartido** | `roadmap/`, `BACKLOG.md`, `INBOX.md`, `HUMAN_ACTIONS.md`, `done/`, reglas y ADR | cualquiera, en actos humanos | baja |
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
| Algo que sólo puede hacer una persona | `HUMAN_ACTIONS.md` | frena su tarea hasta que se resuelva |
| Una idea, una deuda, una lección | `INBOX.md` | espera promoción humana |
| Lo que una tarea entregó, con su evidencia | `done/<slug>.md` | es lo que se audita |
| Qué tarea estoy haciendo | `claims/` | para que nadie la tome dos veces |
| «Salgo a almorzar», «está lento el CI» | el canal del equipo | no es durable y no se audita |

La última fila pesa tanto como las otras: meter conversación en el repositorio lo vuelve ilegible, y sacar
decisiones del repositorio las pierde.

## Lo que git tiene que saber

`.gitattributes` declara que `HUMAN_ACTIONS.md` y su histórico se concatenan en vez de conflictuar cuando
dos personas registran un bloqueo el mismo día. Llega con la instancia y sus bordes están escritos ahí
adentro. La evidencia de una tarea no lo necesita: vive en su propio archivo y nadie escribe el de nadie.
