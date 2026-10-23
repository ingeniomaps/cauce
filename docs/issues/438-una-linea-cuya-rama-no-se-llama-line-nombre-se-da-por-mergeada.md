---
caso: 438
titulo: una línea cuyo árbol no está en la rama line/<nombre> se lista con una rama que no tiene y se retira como mergeada
estado: resuelto
resuelto-en: 0.115.0
prioridad: media
version-detectada: 0.114.0
---

# 438 — Una línea cuyo árbol no está en `line/<nombre>` se lista con una rama falsa y se retira como mergeada

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **media**.

## Resumen

El motor da por hecho que el árbol de una línea está en la rama `line/<línea>`, y nunca mira en qué rama está de
verdad. Si el árbol pasó a otra rama —alguien hizo `git switch` adentro, o renombró la rama—, falla en tres lugares,
los tres comprobados en un banco:

1. **El retiro da por mergeado trabajo que no lo está.** `ops lines join <ops-root> <línea>` (que, con una línea
   declarada, la retira) busca `line/<línea>`: si no existe, la trata como «sin rama no hay nada que perder»; si
   existe, mira sólo ésa. En los dos casos dice `llegó a master` con un commit sin mergear en la rama del árbol, y
   `--apply` quita el árbol y la declaración. **El commit no se pierde de git** —la rama real no se borra, porque
   `branch -D` apunta a `line/<línea>`—, pero queda en una rama que nadie sigue, y la línea figura retirada.
2. **`ops lines` lista una rama que el árbol no tiene**: `(line/payments)` con el árbol en otra.
3. **El mensaje culpa a otra cosa.** Si `line/<línea>` no existe, `rev-list` falla y la línea sale con
   «sin rama viva contra qué contar», cuando la rama viva está y lo que falta es la de la línea. Y como no cuenta,
   la detección de solapes entre líneas sobre el mismo repositorio se queda sin los archivos de ésta, sin avisar.

## Reproducción

Desde el repositorio de Cauce:

```bash
B=$(node engine/cli/ops.js bench sidecar --force) && cd "$B"
node tools/ops.js line . payments app
T=../lines/payments/app
git -C "$T" switch -c line/manuel-payments
git -C "$T" -c user.email=a@b -c user.name=b commit --allow-empty -m wip
node tools/ops.js lines join . payments                # A: line/payments sigue existiendo
git -C ../app branch -D line/payments                  # B: como si se la hubiera renombrado
node tools/ops.js lines .
node tools/ops.js lines join . payments
node tools/ops.js lines join . payments --apply        # sólo en el banco
git -C ../app worktree list; git -C ../app branch; git -C ../app log --oneline master..line/manuel-payments
```

## Síntoma

Corrido el 2026-10-23 sobre 0.114.0 en el banco `sidecar`, con la rama del árbol llamada `line/manuel-payments` y
un commit `dc743d7 wip` sin mergear:

```
--- A: line/payments sigue (contenida en master)
RETIRAR la línea payments  (1 repositorio(s))
  app  llegó a master
--- B: line/payments no existe
payments  (línea declarada)
  app  …/sidecar/lines/payments/app  (line/payments)  sin rama viva contra qué contar
RETIRAR la línea payments  (1 repositorio(s))
  app  llegó a master
--- B con --apply (exit 0)
✓ retirada: sin árboles, sin line/payments y fuera de ops.config.json, que hay que commitear
$ git -C ../app worktree list
…/sidecar/app  5917ce7 [master]
$ git -C ../app branch
  line/manuel-payments
* master
```

`ops.config.json` quedó sin `lines`, y `dc743d7` sigue sólo en `line/manuel-payments`.

## Causa raíz

El nombre de la rama se deduce del de la línea en cuatro lugares, y en ninguno se lee la del árbol:

- `engine/core/line-trees.js:21`: `const BRANCH = 'line/'`, y el comentario de `:5-7` fija que cada árbol está «en
  la rama `line/<línea>`».
- `engine/cli/lines-join.js:133-138` (`retire`): `branch = line/<nombre>`, `has = branchExists(source, branch)` y
  `merged = !has || …`. Sin la rama, `merged` sale `true`; con ella, mira esa rama y no la del árbol.
- `engine/planning/lines.js:245` (`declaredStatus`): la misma rama deducida, que `ops lines` imprime y que
  `measure()` (`:216-219`) usa para contar y para los solapes. Si `rev-list` falla, devuelve `ahead: null`, y
  `engine/cli/lines.js:288` lo imprime como «sin rama viva contra qué contar».
- `engine/cli/lines.js:79` (`plant`): el árbol nuevo se crea en `line/<nombre>`. Éste está bien: es donde nace.

## Fix propuesto

El nombre `line/<línea>` se queda como está: es el identificador local de la línea en el motor. Lo que cambia es que
el motor **compruebe** que el árbol sigue ahí en vez de suponerlo:

- **`retire`**: si el árbol existe, se lee su rama (`git -C <árbol> symbolic-ref --short -q HEAD`). Si no es
  `line/<línea>` —otra rama o HEAD separado—, se niega, nombrando el árbol y la rama en la que está, y diciendo cómo
  volver (`git -C <árbol> switch line/<línea>`). Sin árbol, lo de hoy: se mira `line/<línea>`.
- **`declaredStatus` / `ops lines`**: se lee la misma rama; si no coincide, el listado muestra la real y lo marca
  (`en line/manuel-payments, no en line/payments`), y no cuenta contra una rama que no es la de la línea.
- **`measure()`**: cuando lo que no existe es la rama de la línea, el mensaje lo dice, en vez de culpar a la rama
  viva.

**Pruebas y mutación.** En `test/planning/lines.test.js` / `test/wiring/lines.test.js`: con el árbol en otra rama y un
commit sin mergear, `retire` en seco no dice `llegó a` y `--apply` se niega dejando árbol y declaración en pie; y
`ops lines` muestra la rama real. Mutación: volver a `merged = !has || …` sin leer la rama del árbol, y ver en rojo
la prueba del `--apply`.

## No adoptar una rama por persona en el motor

La instancia donde apareció pasó sus ramas de línea a `line/<persona>-<línea>`, para que dos personas en la misma
línea no compartan rama en el remoto. Se evaluó llevar esa convención al motor (una clave `"branch"` por línea, o
leer la rama del árbol y adoptarla) y **se decide que no**, por tres razones:

- **El motor no empuja nunca.** `git grep -n "git push" -- automatization/workflows engine/cli engine/core` no
  devuelve nada, y `lines-join.js:6` lo dice: «Nunca empuja». El nombre en el remoto es una convención del equipo, y
  se resuelve donde se empuja, no en el motor.
- **Git ya lo resuelve, sin tocar nada de Cauce.** Comprobado con git 2.43.0 en un repositorio de prueba, con
  `line/payments` local en un worktree:
  - `git push origin line/payments:line/manuel-payments` → `* [new branch] line/payments -> line/manuel-payments`.
  - Para que `git push` a secas lo haga: `git branch -u origin/line/manuel-payments`, y
    `git config extensions.worktreeConfig true` + `git config --worktree push.default upstream` en el árbol de la
    línea → `line/payments -> line/manuel-payments`, y el checkout principal sigue sin `push.default`. Con el default
    (`simple`), el mismo `git push` se niega: «The upstream branch of your current branch does not match the name of
    your current branch».
  - El guard de push lee el destino del refspec (`engine/hooks/push.js:88`, `split(':').pop()`), así que lo juzga
    por `line/manuel-payments`.
- **Hacerlo configurable cuesta en cada lugar que deduce la rama**: los cuatro de «Causa raíz», más `isLine`
  (`engine/core/task-trees.js:91`) y la línea leída de la rama (`engine/planning/lines.js:30`). Es superficie nueva
  para algo que a la mayoría de las empresas no les pasa —trabajar la misma línea desde dos máquinas a la vez— y que
  a la que le pasa le alcanza con git.

Lo que sí es de todas las empresas es el defecto de este caso: un árbol que no está donde el motor cree, por la razón
que sea, no puede retirarse como mergeado.

## Tradeoffs

- Leer la rama cuesta un `git` más por árbol en `ops lines` y en el retiro. Es local y barato.
- Una instancia que ya renombró sus ramas locales queda, después del arreglo, con el retiro frenado hasta que vuelva
  a `line/<línea>` (y empuje con el mapeo de arriba). Es lo correcto: hoy ese retiro da un resultado falso.
- HEAD separado —un rebase en curso— también frena el retiro. Es lo mismo que hoy pasa con cambios sin commitear.

## Contexto de descubrimiento

En la instancia de una empresa (Acme), con Cauce 0.114.0, al pasar sus ramas de línea a `line/<persona>-<línea>`
(decisión de quien aprueba, 2026-10-23). Al revisar si el renombre rompía algo del motor, `ops lines` mostró la rama
vieja:

```
payments  (línea declarada)
  backend-payments  …/lines/payments/backend-payments  (line/payments)  sin rama viva contra qué contar
```

Revisado el 2026-10-23 contra el fuente y corrido en un banco. La versión original nombraba un comando que no existe
(`ops lines retire`: el retiro es `ops lines join` sobre una línea declarada, `lines-join.js:42`), su reproducción con
`switch -c` no daba el síntoma que pegaba —deja viva `line/<línea>`—, y daba el retiro por deducido; el banco lo midió
y mostró además que el commit no se pierde. El tercer lugar (`declaredStatus` y el mensaje de `measure()`) salió de
esa revisión.

## Relacionados

- Caso 394: las líneas declaradas, sus árboles y el retiro.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («arranca con el arreglo»), en la misma versión que el 437 y
por la misma razón: ver su cierre.

**Se hizo distinto del «Fix propuesto», y lo cambió la revisión del diff.** La primera versión comparaba la rama del
árbol con `line/<línea>` y se negaba si no coincidían. `/code-review high` sobre la rama mostró que el nombre era la
pregunta equivocada: lo que hay que saber es si **lo que tiene el árbol** llegó a la rama viva. `treeAt`
(`engine/planning/lines.js`) devuelve la rama y el commit del árbol —o `null` si la carpeta no es un árbol por sí
misma—, y lo usan el retiro (`engine/cli/lines-join.js`), `ops lines` y su detección de solapes
(`declaredStatus`), y `ops line` al reusar un árbol (`engine/cli/lines.js`).

El caso, sección por sección:

- **Resumen 1, el retiro.** Se niega mientras el commit del árbol no esté en la rama viva, en la rama que esté y
  también en HEAD separado, dejando árbol, ramas y declaración en pie. Si ya llegó, retira, y como sólo borra
  `line/<línea>`, nombra la rama que queda.
- **Resumen 2, el listado.** Muestra la rama real y cuenta lo que tiene el árbol:
  `(line/payments)  el árbol está en line/manuel-payments, no en line/payments  +1 / -0`.
- **Resumen 3, el mensaje que culpa a la rama viva, y los solapes.** Se fue: se cuenta desde el commit del árbol, que
  existe siempre, así que el «sin rama viva» sale sólo cuando de verdad no hay rama viva. Los solapes ven los archivos
  de un árbol que está en otra rama. `measure()` no se tocó.
- **Fix propuesto, «sin árbol, lo de hoy»**: se hizo así; sin árbol se mira `line/<línea>`.
- **Fix propuesto, el mensaje del retiro.** Ya no manda a volver el árbol a su rama: el `switch` sobraba, y con
  `line/<línea>` viva era una trampa —volver a ella dejaba el trabajo en la otra, y el retiro lo daba por llegado—.
  Dice en qué rama está el árbol y que no llegó.
- **Rama por persona**: no se adoptó, con la razón en su sección. Con el retiro mirando el commit, una instancia que
  ya renombró sus ramas locales tampoco queda frenada: retira cuando el trabajo llegó.
- **Tradeoffs**: un `git` más por árbol, aceptado. El de «las instancias con ramas renombradas quedan frenadas» ya no
  vale, por lo de arriba. HEAD separado con trabajo sin mergear frena: probado.
- La línea de `--apply` que agrega «`git fetch` primero» se dejó: con el retiro mirando la rama viva, ahora sí es la
  salida cuando el trabajo se mergeó en el remoto.

**Revisión del conjunto.** `/code-review high` encontró siete hallazgos; cinco son de este caso:

1. **Una carpeta que perdió su `.git` se leía como el repositorio que la contiene**, y el retiro mandaba a crear
   ramas ahí. Reproducido: con la carpeta de sesión versionada en la rama `sesion`, el retiro decía «el árbol … está
   en sesion». Ahora `treeAt` exige que la carpeta sea la raíz de su árbol y, si no, el retiro se niega con
   «no es un árbol de git» y el listado lo dice.
2. **El retiro sólo comparaba el nombre, y su consejo podía dejar trabajo atrás.** Es lo que cambió el diseño, arriba.
   En su forma literal —alguien vuelve el árbol a `line/<línea>` y deja otra rama suya sin mergear— no tiene arreglo
   en el motor: esa rama ya no es de ningún árbol de la línea, y el retiro no tiene cómo saber que existe. Se decidió
   que no.
3. **`measure()` contaba la rama de la línea y el solape perdía archivos.** Reproducido (`files: []`); ahora cuenta el
   commit del árbol.
4. **`ops line` reusaba un árbol movido sin decir nada.** Reproducido (sin aviso); ahora avisa.
5. **La rama a la que se fue el árbol sobrevive al retiro sin que nadie la nombre.** Ahora se nombra.

**Lo que se corrió para saber que funciona.**

- `test/wiring/line-branch.test.js`, ocho pruebas: el retiro con `line/pagos` viva y sin ella, HEAD separado, la rama
  renombrada que ya llegó, el listado, el solape, el aviso al reusar y la carpeta sin `.git` dentro de un repositorio.
  Antes de los arreglos de la revisión, 0/8, cada una por su hallazgo; con ellos, 8/8. Las suites de líneas,
  48/48.
- Mutaciones, en una copia del árbol: `treeAt` sin comprobar la raíz → 1 en rojo; el retiro sin mirar el commit del
  árbol → 4; contar la rama de la línea → 2; sin aviso al reusar → 1; sin nombrar la rama que queda → 1.
- La reproducción del caso, en el banco `sidecar`, con el renombre: `ops lines` dice `el árbol está en
  line/manuel-payments, no en line/payments  +1 / -0`; `--apply` sale en 1 con «está en line/manuel-payments, que no
  llegó a master». Mergeada esa rama en `master`, `--apply` sale en 0 con «llegó a master» y «queda
  line/manuel-payments en app: no es de la línea, y el retiro no la borra»; `git worktree list` queda sólo con
  `master`, la rama sigue, y `ops.config.json` sin `lines`.
- `npm run ci`: exit 0, 1586/1586, con la cobertura en su piso.

**Segunda revisión**, acotada a lo que arregló la primera: diez hallazgos, ocho de este caso. Cada uno se reprodujo
con una prueba en rojo antes de arreglarlo.

1. **Con la carpeta del árbol borrada, el retiro volvía a mirar sólo `line/<línea>`** —y el mensaje para una carpeta
   ilegible mandaba a borrarla—. Reproducido: salió en 0 con trabajo sin mergear. `registeredAt` lee el HEAD que git
   sigue teniendo registrado, y el retiro limpia ese registro al aplicar.
2. **El solape perdía lo que la rama de la línea tiene sin mergear** cuando el árbol se iba a otra rama. Reproducido
   (`files: []`); ahora suma los archivos de las dos.
3. **`ops line` reusaba sin avisar una carpeta que ya no es un árbol.** Ahora avisa, con el mismo texto que el retiro y
   el listado.
4. **El rechazo decía el problema y no qué hacer (R13).** Ahora: «mergeá <rama> a <viva> —por PR, como cualquier
   rama— y volvé a retirarla».
5. **Un árbol sin commits daba un commit vacío.** Reproducido con `switch --orphan`: el retiro **salió en 0**. Ahora
   `treeAt` devuelve `null` y el retiro se niega.
6. **Dos comprobaciones de «esta carpeta es su raíz» que podían divergir.** `ownRoot` es la única, y la usan `treeAt`
   e `ignoreLines`.
7. **El mismo `merge-base` dos veces** con el árbol en su rama: ya no.
8. **Tres llamadas a git por árbol en `treeAt`.** Es una sola, `rev-parse --show-toplevel HEAD --symbolic-full-name
   HEAD`, comprobada con git 2.43.0: en una rama devuelve raíz, commit y `refs/heads/…`; con HEAD separado, `HEAD`; sin
   commits sale en 128.

Mutaciones de la segunda tanda, en una copia del árbol, una prueba en rojo cada una: el retiro sin leer el registro,
el registro sin limpiar, el solape sin la rama de la línea, `ops line` sin el aviso, `treeAt` aceptando un árbol sin
commit, el rechazo sin la acción. La puerta encontró además dos cosas propias: una prueba que borraba recursivamente
sin `discard` (R23), y la cobertura de ramas de `engine/planning/lines.js` bajo su piso, porque las pruebas del CLI
corren en otro proceso; una prueba en el mismo proceso de `treeAt` y `registeredAt` la dejó en 134 de 140.

**Tercera revisión**, acotada a lo que arregló la segunda: ocho hallazgos, cinco sobre el camino nuevo del árbol
borrado. Cada uno se reprodujo en rojo antes de arreglarlo, salvo el que se dice.

1. **`ops line` sacaba del registro el árbol borrado y lo rearmaba en `line/<línea>`**, y `ops lines` y el texto de un
   árbol ilegible mandaban a correrlo: el retiro dejaba de ver el trabajo que el registro guardaba. Reproducido (salió
   en 0). Ahora se niega si el registro estaba en otra rama o en un commit suelto que no llegó, nombrándolo y diciendo
   cómo guardarlo o sacar el registro a mano.
2. **La limpieza del registro no miraba si git la rechazaba** —un árbol bloqueado con `git worktree lock`—, y el
   retiro sacaba la declaración igual. Reproducido; ahora falla como el camino con carpeta.
3. **Con la carpeta de la línea entera borrada detrás de un enlace, el registro no se encontraba.** No se reprodujo:
   la prueba pasó sin arreglo, porque el retiro resuelve la raíz con `real()` (`lines-join.js:42`) antes de armar la
   ruta. No se tocó, y la prueba no quedó: nunca se vio en rojo.
4. **Un árbol sin commits borrado figuraba con `HEAD 0000…`** y el retiro mandaba a mergear una rama vacía.
   Reproducido; ahora no tiene nada que perder y se retira.
5. **«mergeá ese commit» no decía cuál**, y con la carpeta borrada no había dónde mirarlo. Reproducido; ahora nombra
   los doce primeros caracteres.
6. **Un `measure` más por árbol movido.** Se decidió que no: si la rama de la línea no existe, `measure` corta en su
   primera llamada (`rev-list` falla), así que el costo es una llamada, no dos.
7. **Dos lectores del registro de git que comparaban rutas distinto.** `registered()` de `ops line` usa ahora
   `registeredAt`.
8. **Dos copias de `real()`.** Queda la de `engine/planning/lines.js`.

Mutaciones, en una copia del árbol, una prueba en rojo cada una: `ops line` rearmando sin mirar el registro, la
limpieza del registro sin comprobar, el HEAD en ceros como commit, y el rechazo sin nombrar el commit.

**Cuarta revisión**, acotada a lo que arregló la tercera: diez hallazgos. Ya no aparecieron retiros falsos: casi todos
eran mensajes que mandaban a algo que no funciona sobre el camino del árbol borrado.

1. **`ops line` no comprobaba si git soltaba el registro de un árbol bloqueado.** Reproducido, y peor de lo dicho: no
   reportaba éxito, se caía con `Cannot read properties of undefined (reading 'trim')`. Ahora falla con el error de
   git.
2. **«guardalo con `git branch`» no destrababa**: el registro sigue en el commit suelto. Ahora pide guardarlo en una
   rama y mergearla.
3. **`ops lines` mandaba a rearmar un árbol borrado que `ops line` se niega a rearmar.** Ahora dice en qué estaba y
   que se mergee antes.
4. **El texto de un árbol ilegible decía «si su trabajo ya está en otra rama, borrá la carpeta»**, que después
   `ops line` frena. Ahora dice «si lo que tenía ya llegó a la rama viva».
5. **Los comandos sugeridos no citaban las rutas, y `--force` no saca un árbol bloqueado.** Ahora van con
   `shellWord` y `-f -f`, comprobado con git 2.43.0: `-f` sale en 128 («usa 'remove -f -f'») y `-f -f` en 0.
6. **Un árbol sin commits retirado nombraba la rama `vacia` como si quedara**, y no existe. Reproducido; ahora sólo se
   nombra una rama que tiene ref.
7. **Sin rama viva, `ops line` mandaba a mergear a una rama que no hay.** Reproducido; ahora lo dice y ofrece sacar el
   registro.
8. **`registered` cambió de tipo en el `--json` del retiro.** Se decidió que no: el campo no existe en `main`, lo
   agregó esta misma rama, así que no hay consumidor que lo lea.
9. **`reached` copiado entre el retiro y `ops line`.** Es uno, `reachedLive`. El reexporte de `real` desde
   `engine/cli/lines.js` se queda: lo usa también `engine/cli/worktree.js`, que no es de este caso (R6).
10. **Un `measure` duplicado para un árbol sin commits.** Ya no.

Mutaciones, en una copia del árbol, una prueba en rojo cada una: `ops line` sin comprobar la limpieza del registro, el
consejo viejo para el commit suelto, sin rama viva mandando a mergear, `ops lines` mandando a rearmar siempre, y
nombrar una rama sin ref.
