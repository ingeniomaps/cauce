---
caso: 423
titulo: la sesión de una línea puede cambiar de rama o guardar en stash el checkout de la principal con git, y ningún guard lo frena
estado: resuelto
resuelto-en: 0.113.0
prioridad: media
version-detectada: 0.112.0
---

# 423 — Desde el árbol de su línea, un agente corre `git -C <sesión>/app switch -c tmp` o `git stash` sobre el checkout de la principal y pasa

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **media**. Sale de la revisión del caso 422, que cerró las
escrituras de archivos y deja afuera, a propósito, los comandos de git.

## Resumen

El caso 422 hace que la sesión de una línea escriba sólo en sus árboles y en la instancia (`engine/hooks/line-scope.js`).
Lo que mira son los destinos de una escritura: el archivo de un `Write`, y lo que un comando redirige, crea o borra
(`engine/hooks/shell.js:244` y `:267`). Un comando de git que opera **sobre** otro checkout no escribe en ningún destino
que ese guard vea, y cambia igual lo que la otra sesión tiene abierto: su rama, su árbol de trabajo, su stash.

`reset --hard` y `commit` ya los frenan otros guards (`destructive` y `live-commit`), por otras razones. `switch`,
`checkout -b` y `stash` no los frena ninguno.

## Reproducción

El 2026-10-21 sobre un banco `ops bench sidecar`, con la sesión como raíz (`workspaceRoots: [{ name: "main", path: ".." }]`)
y `ops line . piloto app`. La sesión dijo su línea con `/autobuild piloto` (grupo `prompt`) y los comandos corrieron como
subagente con el `cwd` en `lines/piloto/app`, por `node engine/hooks/run.js pre-shell`:

```
git -C <S>/app switch -c tmp                     0
git -C <S>/app stash                             0
cd <S>/app && git checkout -b otra               0
git -C ../../../app reset --hard                 2 BLOQUEADO: 'git reset --hard' destruye cambios locales.
git -C <S>/app commit -m x --allow-empty         2 BLOQUEADO: 'git commit' cae en master, la rama viva de app.
```

Los tres primeros cambian el checkout de la principal mientras la otra sesión trabaja en él.

## Qué haría falta

- En una sesión con línea, frenar un comando de git cuyo repositorio —el de `-C` o el del `cd`, como lo resuelve
  `gitDirectory` (`engine/hooks/input.js:304`)— está en la carpeta de sesión y fuera de los árboles de la línea y de la
  instancia. El mensaje nombra el árbol de la línea, como el del 422.
- Decidir qué comandos de git cuentan. Leer (`status`, `log`, `diff`, `show`) no cambia nada y frenarlo estorba al que
  sólo mira. Cambiar (`switch`, `checkout`, `stash`, `restore`, `merge`, `rebase`, `pull`, `clean`, `add`) sí. La
  decisión es si se escribe la lista de lo que cambia, o la de lo que sólo lee, cerrada por defecto (R27).
- Lo mismo para un `git` que corre dentro de un script, que hoy no se ve. Si no se cubre, se dice.

## Contexto de descubrimiento

La revisión del diff del 422 (`/code-review`, 2026-10-21) lo señaló, y medirlo dio la tabla de arriba.

## Relacionados

- 422 — la sesión de una línea escribe en el checkout de la principal.
- 414 — los guards de commit juzgan el árbol de una línea declarada.

## Cierre

**Resuelto en 0.113.0**, a pedido del dueño el 2026-10-21 («arregla el 423»). `shell-boundary` recorre los `git` del
comando con los tramos que ya tenía (`steps`, que sigue cada `cd`), y por cada uno `gitTargets`
(`engine/hooks/line-scope.js:134`) resuelve qué checkout cambia: el de `--work-tree`, o el de los `-C` sobre la carpeta del
tramo. Ese checkout se juzga como cualquier destino de escritura (`engine/hooks/shell.js:271`): en la carpeta de sesión,
fuera de los árboles de la línea y de la instancia, frena, con el mismo mensaje del 422, que nombra el árbol de la línea.

El enunciado, ítem por ítem:

- **Frenar el `git` cuyo repositorio está fuera de lo de la línea, nombrando el árbol**: se hizo, pero no con
  `gitDirectory`. Ése contesta una carpeta por comando —el primer `-C` o el primer `cd`—, y un comando con dos tramos
  quedaba juzgado por el primero; `steps` da la carpeta de cada tramo.
- **Decidir qué comandos de git cuentan**: cerrado por defecto (R27). Se declara lo que no cambia el checkout donde corre
  —`READS` y `READING`, `:114` y `:122`—, y todo lo demás cuenta como cambio. Algunos leen o escriben según lo que sigue,
  y se exime sólo la forma que lee: `stash list`, `branch` sin nombre o con una bandera que lista, `config --get`.
  `fetch` va con lo que lee: escribe en el `.git` que comparten los árboles, pero no la rama, el árbol, el índice ni el
  stash de la otra sesión.
- **Un `git` dentro de un script**: no se ve, y se dice. Lo mismo que con los destinos de escritura: el guard lee el
  comando, no lo que ejecuta.

**La tercera revisión del diff** encontró dos cosas más, y se arreglaron:

- Lecturas que contaban como cambio: `tag`, `reflog`, `ls-remote`, `symbolic-ref HEAD`, `config user.email`,
  `config --local --get x`, `remote --verbose`, y `branch --sort=…` o `--format=…`. Se sumaron a lo que lee, con la misma
  regla que `branch` para `tag`, y `config` lee con una sola clave o con una forma de leer, sin contar las banderas de
  alcance.
- La instancia estaba toda del lado de la línea, y es un solo checkout para las dos sesiones: un `git -C ops switch` o un
  `git -C ops stash` le cambiaba a la principal la rama de su planning o se le llevaba lo que tenía sin commitear. Ahí lo
  abierto es lo de siempre —la línea escribe su planning y lo commitea—, así que la excepción es al revés y se declara:
  `SHARED`, lo que mueve la rama, el árbol, el índice o el stash del checkout (`switch`, `checkout`, `stash`, `reset`,
  `rebase`, `merge`, `pull`, `restore`, `clean` y parecidos). `add` y `commit` pasan.

En las sesiones reales del 422 con Gemini, Antigravity y Codex, `git -C app switch -c tmp` se frenó en los tres con el
mensaje de la línea, y la rama `tmp` no existe en ninguno de los bancos.

**Lo que el caso no preveía.** La primera versión trataba `branch` como lectura sólo con banderas que listan, y la sesión
real lo encontró: el agente comprobó con `git -C app branch --list tmp` y se frenó, porque `tmp` es un patrón y no una
bandera. Ahora `branch` lee si no trae una bandera que cambie y, o no tiene argumentos, o trae una que lista. En la misma
sesión el agente señaló que el texto del bloqueo se contradice para un subagente; es de `AP.HOW`, compartido por diez
bloqueos, y salió como el caso 424.

**Lo que se corrió para saber que funciona.**

- `test/hooks/line-scope.test.js`, «la sesión de una línea no cambia con git el checkout de la principal, y leerlo pasa»:
  doce formas que frenan —`switch`, `stash`, `restore` por ruta relativa, `cd … && git checkout`, `--work-tree`, `-c`
  delante de `-C`, otro repositorio, `branch nueva`, `branch --list -D`, `worktree add`, `remote add`, `config` con valor— y
  quince que pasan —leer el checkout de la principal, `branch --list tmp`, y cambiar de rama en su árbol y en la
  instancia—, con la principal sin cambios.
- Después de la tercera revisión, la prueba suma lo que la instancia frena (`switch`, `stash`, `reset`) y deja (`add`,
  `commit`, `stash list`), y las lecturas que faltaban. Seis mutaciones más, en rojo: la instancia abierta a todo, `commit`
  como compartido, y que `tag`, `config <clave>` o `branch --sort` cuenten como cambio. Con los guards como proceso sobre
  el banco: `git -C ops switch -c x` y `git -C ops stash`, 2; `git -C ops add planning`, 0; `tag`, `config user.email` y
  `branch --sort=-committerdate` sobre `app`, 0.
- Mutaciones en una copia fuera del árbol, las diez en rojo: sin juzgar los `git`, sin `-C`, sin `--work-tree`, `-c` sin
  su valor, que leer cuente, que `stash list` cuente, que `switch` lea, que `stash` lea, que `branch --list` cuente y que
  `branch -D` lea.
- La tabla de la reproducción, con los guards como proceso sobre el banco: `switch -c tmp`, `stash` y `cd … && git
  checkout -b` pasan de 0 a 2; `reset --hard` y `commit` siguen en 2, por sus guards; `status` sobre `app` y `switch` en
  el árbol, 0; la sesión principal, 0.
- Dos sesiones reales de Claude Code (`claude -p`) sobre un banco instalado en `/var/tmp`, con un subagente que corría los
  comandos. La primera (USD 1,11) encontró lo de `branch --list`. En la segunda (USD 0,94): `switch -c piloto-propia` en el
  árbol pasó, `git -C …/app switch -c tmp` y `git -C …/app stash` se frenaron con «…/app va en el árbol de la línea:
  …/lines/piloto/app», y `branch --list tmp` pasó. Después, `app` seguía en `master`, sin rama `tmp` y con el stash vacío.
