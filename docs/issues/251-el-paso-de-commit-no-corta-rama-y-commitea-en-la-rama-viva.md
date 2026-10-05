---
caso: 251
titulo: el paso de Commit no corta rama y commitea en la rama viva
estado: resuelto
resuelto-en: 0.101.0
prioridad: alta
version-detectada: 0.100.0
---

# 251 — El recorrido commitea donde esté parado el repo del servicio, y eso suele ser `main`

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: pasó en dos de las tres corridas de globex, en dos repos (la tercera no se comprobó), y
cada vez hubo que mover el commit a mano. El dueño ya había dicho varias veces que el flujo es rama y después PR a `main`; pedírselo al
recorrido en `args` no lo cambió.

## Resumen

Ninguna fase del recorrido corta una rama de trabajo. Build edita el árbol del repo del servicio en la rama
en la que esté, y Commit crea el commit ahí. Con el repo en `main` —el estado normal después de mergear el
PR anterior—, el commit queda en `main` local: sin PR, sin CI y con la rama adelantada del remoto. El guard
de push lo contiene (no llega al remoto), pero el trabajo queda en el lugar equivocado y la corrida
siguiente arranca sobre un `main` que no es el del remoto.

## Reproducción

Corrida real, no arnés. globex, sidecar, 0.100.0, `wf_259e41f0-42d` (2026-10-05), lanzada con estos
`args`: «Cada tarea se commitea en una rama propia cortada de origin/main del repo del servicio, nunca
sobre main local. Sin push ni PR.» Los repos `account` y `api` estaban en `main`, limpios y al día.

## Síntoma

Al terminar la corrida:

```
== account
## main...origin/main [adelante 1]
main 325a48b fix(auth): conservar atributos con '=' al reenviar cookies
== api
## main...origin/main [adelante 1]
main 6efefea fix(approvals): enrutar al dueño lo que registra su IA
```

El recorrido lo vio y no lo evitó. Build abrió una fila en `HUMAN_ACTIONS.md` —«Decidir desde qué rama se
commitea el cambio […] Se cierra al cortar una rama de trabajo antes del commit y commitear ahí, con `main`
sin commits nuevos»— y Commit commiteó en `main` igual. La entrada de DONE lo dejó escrito: «el commit
quedó en `main` de `account`, local y sin empujar, y la fila […] sigue `pendiente`».

El 2026-10-04 pasó lo mismo en `api` con el commit `0e5de6a`, que se movió a mano a la rama
`fix/log-sin-credenciales`. De la otra corrida de ese día no quedó registro de dónde commiteó.

## Causa raíz

En el recorrido instalado, 0.100.0 (líneas de la copia instalada de `autobuild.js`):

- `autobuild.js:1420-1426` — el prompt de Commit: «Encontrá el repositorio git dueño de `<service>`,
  inspeccioná status y diff, stageá por nombre los archivos de la tarea, creá un solo Conventional Commit
  […] Nunca amend ni push». No nombra rama.
- `autobuild.js:369-374` — el esquema `COMMIT` tiene un campo `branch`, pero nada lo exige ni lo compara
  contra la rama viva.
- `ops worktree <planning> <tarea>` existe y deja cada tarea en su árbol y su rama (`AGENTS.md`, «Con qué
  runner arrancás»), pero el recorrido no lo llama: `grep worktree` sobre la copia instalada no devuelve
  nada.
- Los `args` de la corrida no llegan a Build ni a Commit como instrucción: la frase sobre la rama no cambió
  nada en ninguna de las dos fases.

## Fix propuesto

La forma, no el diff:

1. **La rama se corta antes del primer cambio, en la fase WIP**, que es la que persiste el plan «antes del
   primer cambio»: `<type>/<slug>` desde la rama por defecto del remoto, o por `ops worktree`. La rama queda
   escrita en el WIP para que una corrida retomada vuelva a ella.
2. **Commit comprueba dónde está**: si la rama actual es la rama viva (`main`, `master`, la rama por
   defecto del remoto o lo que nombre `runner.pushToLiveBranches`), corta la rama ahí —`git switch -c` se
   lleva los cambios sin commitear— o para con `commit-failed`. Es el mismo criterio de rama viva que ya usa
   el guard de push.
3. **`COMMIT.branch` pasa a ser obligatorio** y el recorrido lo rechaza si es la rama viva, y lo escribe en
   `commit:` de DONE (`<sha> <asunto> (<servicio>@<rama>)`).
4. **Un guard de toolkit** que frene `git commit` sobre la rama viva, para el trabajo que no pasa por el
   recorrido. globex escribió el suyo (`guard-globex-branch.sh`, regla P26) mientras tanto.

## Tradeoffs

- Un proyecto que trabaja directo sobre `main` a propósito —un repo de una sola persona, sin PR— deja de
  poder hacerlo sin declararlo. Hace falta una llave (`runner.commitToLiveBranch`, apagada por defecto).
- Con una rama por tarea, dos tareas seguidas del mismo servicio ya no se apilan: la segunda se corta de
  `main` y no ve a la primera hasta que mergea. Si la segunda depende de la primera, hay que cortarla de la
  rama de la primera o esperar el merge. No está decidido cuál.
- `ops worktree` multiplica árboles y, en proyectos con dependencias instaladas por árbol, su costo.

## Validación del 2026-10-05

Contrastado contra el fuente de `0.100.0`, los repos de globex y el diario de la corrida.

**Lo que se sostiene.**

- Las citas coinciden con la copia instalada. En el fuente de este repo son `autobuild.js:1319-1325` (el
  prompt de Commit) y `:279-285` (`COMMIT`, con `branch` opcional).
- El diario de `wf_259e41f0-42d` trae los dos commits con `branch: "main"` devuelto por el propio agente
  de Commit: `325a48b` en `account` y `6efefea` en `api`. Hoy los dos repos están en `fix/…`, movidos a
  mano.
- Build lo vio y lo dijo: su primer hallazgo `open` en `account` es «La fase Commit tiene que cortar una
  rama de trabajo antes». Fue a una fila y Commit no lo recibió.
- `ops worktree` existe y el recorrido no lo nombra en ninguna fase.

**Reproducido en el arnés**, con un Commit que devuelve `branch: 'main'`:

```
251 · Commit devuelve branch=main → stopped: undefined · done: ["T-1"]
251 · el prompt de Commit nombra rama: false
251 · algún prompt pide cortar una rama: []
251 · la entrada de DONE recibe la rama: false
```

**Lo que mezcla.** «Los `args` no llegan a Build ni a Commit» es otro defecto y salió como caso 252:
`autobuild` no lee `args` en absoluto, así que no es que la frase sobre la rama no haya alcanzado, es que
ninguna instrucción dada ahí llega a nadie.

**Relacionados, ya leídos.** El 054 no comparte causa: es la concurrencia de `ci.yml`. El 108 sí aporta:
de ahí sale `liveBranches` (`engine/hooks/push.js:47`), que da `main`, `master` y la rama por defecto del
remoto, y es el criterio que el punto 2 del fix pide reusar.

**Decidido por el dueño el 2026-10-05**: «comitear a main solo se debe hacer a pedido sino debe generar
una rama en vez de que digas que necesita aprobacion». Eso contesta la primera de abajo —apagado por
defecto, y el pedido es la llave— y descarta que Commit pare a preguntar: corta la rama y sigue.

**Qué pedía decisión del dueño antes de construir.**

- **La llave y su default.** Con `commitToLiveBranch` apagada por defecto, toda instancia que hoy commitea
  en `main` a propósito cambia de conducta en su próximo `upgrade`.
- **Tareas seguidas del mismo servicio**: cortar la segunda de `main` o de la rama de la primera. El caso
  lo deja abierto y el punto 1 no se puede escribir sin eso.
- **`git switch -c` o `ops worktree`.** El primero mueve el árbol que ya está; el segundo deja un árbol
  por tarea y es lo que el toolkit recomienda con varios agentes. **Pero `ops worktree` hoy no encuentra
  el repositorio en una instancia que declara una raíz por repo** —initech lo hace así—: es el caso 254,
  y mientras siga abierto esta opción no sirve para todos.
- **El punto 4, un guard sobre `git commit` en la rama viva**, salió como caso 255: alcanza a trabajo que
  no pasa por el recorrido, incluido lo que una persona pide en el chat. Este caso se cierra con los
  puntos 1 a 3.

Y un límite del punto 3: `COMMIT.branch` lo declara el agente que commiteó. El recorrido puede rechazarlo
si nombra la rama viva; no puede comprobar que diga la verdad.

## Contexto de descubrimiento

globex, sidecar, 0.100.0, hito `seguridad-del-loop`. Es el camino principal: después de cada merge los
repos de servicio quedan en `main`, que es exactamente donde arranca la corrida siguiente.

## Relacionados

- **250** — el recorrido registra como acción humana toda observación. La fila «decidir desde qué rama se
  commitea» es una de las 20 que cuenta ese caso.
- **108** — `allowPush` hacia la rama viva. De ahí sale el criterio de rama viva que este fix reusa.
- **252** — `autobuild` no lee `args`. Es por qué pedir la rama al lanzar la corrida no cambió nada.
- **253** — a qué rama va el estado de planning: el mismo hueco del lado de la instancia.
- **254** — `ops worktree` no encuentra el repo cuando el servicio se llama como su raíz.
- **255** — el guard sobre el commit en la rama viva, que era el punto 4 de este fix.

## Cierre

**Resuelto en 0.101.0**, con la decisión del dueño del 2026-10-05: en la rama viva se commitea sólo a
pedido, y si no, el recorrido corta una rama sin preguntar.

El paso de Commit mira en qué rama está el repo del servicio. Si es viva corta `<tipo>/<slug>` con
`git switch -c` y commitea ahí; si ya está en otra, commitea en ésa. El pedido es
`runner.commitToLiveBranch: true`, opcional y apagado si falta. Un commit que igual quedó en la viva para
la corrida con `commit-failed` antes de escribir `done/`.

### El recorrido de lo que este caso enumeró

- **Fix 1, cortar la rama en la fase WIP y escribirla en el WIP — se hizo distinto.** Se corta en Commit:
  `git switch -c` se lleva el árbol sin commitear, así que alcanza con un lugar. No se escribe en el WIP
  porque una corrida retomada encuentra el repo ya parado en esa rama.
- **Fix 2, que Commit compruebe dónde está — se hizo**, cortando y no parando.
- **Fix 3, `COMMIT.branch` obligatorio y rechazado si es viva — se hizo distinto.** Quien commitea declara
  `live`, porque la rama por defecto del remoto no siempre es `main` y el recorrido no corre git. La rama
  llega a `done/` como `commit=<sha> (rama <rama>)`. Es una declaración del agente: el recorrido la
  rechaza si dice viva, no comprueba que diga la verdad.
- **Fix 4, el guard — salió como caso 255.**
- **Tradeoff de la llave — se hizo**, con el nombre que el caso proponía.
- **Tradeoff de dos tareas seguidas del mismo servicio — se decidió por la forma más chica, y es un
  supuesto de quien lo construyó, no del dueño.** Si el repo sigue en la rama de la primera, la segunda se
  commitea ahí, apilada; si volvió a `main`, corta la suya. No se vuelve a `main` solo.
- **Tradeoff de `ops worktree` — no se usa.** Hoy no resuelve el repo en toda instancia (caso 254).
- **Resumen, «la corrida siguiente arranca sobre un `main` que no es el del remoto» — se fue con lo
  anterior**: `main` no recibe el commit.
- **Síntoma, «Build abrió una fila y Commit commiteó igual» — la fila es del 250**, que sigue abierto.
- **«Los `args` no llegan» — salió como caso 252.**

### Qué se corrió

- **La reproducción, antes y después**, en el arnés. Antes: un Commit que devuelve `branch: 'main'` cerraba
  la tarea y ningún prompt nombraba rama. Después: el prompt pide `git switch -c <tipo>/T-1`, y un commit
  declarado en la viva para con `commit-failed` sin llegar a Done.
- **Nueve mutaciones, las nueve en rojo**, en una copia bajo el temporal de la sesión corrida antes en
  verde (238 pruebas). La que devuelve lo quitado —el commit en la viva dándose por bueno— pone en rojo «un
  commit que quedó en la rama viva no cierra la tarea». Las otras: el prompt sin pedir la rama, la parada y
  el prompt ignorando la llave, `done/` sin la rama, la validación aceptando cualquier valor, la clave
  vuelta obligatoria, y `contract` contestando siempre sí o siempre no.
- **Una sonda con un agente real y un repo de verdad**: un repositorio desechable parado en `main` con un
  cambio sin commitear, y el prompt literal de Commit. Comprobado después en el disco, no en lo que el
  agente dijo: `fc3f117` quedó en `feat/alta-exige-email` con su footer `Task:`, y `main` siguió en
  `6dd7cfc`.
- **La puerta entera**, `npm run ci`, exit 0. La primera pasada la frenó la cobertura de
  `engine/cli/contract.js`; faltaba la prueba de la salida sin `--json`.
- **Lo que no se corrió**: un `autobuild` de punta a punta, y un repo cuya rama por defecto del remoto no
  sea `main` ni `master` —la sonda no tenía remoto—.
