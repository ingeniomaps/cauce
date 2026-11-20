---
caso: 526
titulo: un --force o un --amend escrito detrás de una redirección no lo ve la regla que los prohíbe
estado: resuelto
resuelto-en: 0.123.1
prioridad: alta
version-detectada: 0.123.0
---

# 526 — un `--force` o un `--amend` escrito detrás de una redirección no lo ve la regla que los prohíbe

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **alta**: la reescritura de historia publicada es de las
reglas sin salida de R8, y se esquiva sin proponérselo, con la forma en que un agente escribe sus comandos (`… 2>&1`).
Y una redirección entre `git` y `push` publicaba sin ninguna aprobación, también en la rama viva.

## Resumen

Las reglas que prohíben el force-push y el `--amend` buscan la bandera dentro del tramo del comando, y el tramo se
cortaba en el primer `;`, `&`, `|` o salto (`MISMO`, en `engine/hooks/shell.js:52` de 0.123.0). El `&` de `2>&1` también
cortaba, así que una bandera escrita después de la redirección quedaba afuera y la regla no la veía. Lo que la dejaba
pasar era lo que autorice el push en sí: `runner.allowPush`, la orden del chat o un «dale».

Y una redirección entre `git` y su subcomando (`git 2>&1 push …`) no la reconocía ninguna regla, porque todas buscan
`\bgit\s+push` o `\bgit\s+commit`: ese push publicaba sin aprobación, con `allowPush` apagado y en la rama viva.

## Reproducción

Desde la raíz de Cauce, por la entrada real de los hooks (`run.js destructive`, JSON de `PreToolUse` sin chat), sobre un
banco propio con `{ "mode": "embedded", "runner": { "allowPush": true } }` (y después `false`), un repositorio en
`feat/x` con su commit ya en `origin/feat/x`, con el motor de `origin/main` (0.123.0) y con la rama
`fix/519-523-chat-y-historias`:

```bash
git push origin feat/x 2>&1 --force
git commit -m x 2>&1 --amend
git 2>&1 push --force origin feat/x
git 2>&1 push origin main
git clean 2>&1 -fd
```

## Síntoma

Con `allowPush: true`, en `main` (0.123.0):

```
pasa   git push origin feat/x 2>&1 --force
pasa   git commit -m x 2>&1 --amend
pasa   git commit -m x &> log --amend
pasa   git commit -m x >| log --amend
pasa   git 2>&1 push --force origin feat/x
pasa   git 2>&1 push origin main
pasa   git 2>&1 commit --amend -m x
pasa   git clean 2>&1 -fd
pasa   git 2>&1 clean -fd
pasa   git checkout 2>&1 -- .
pasa   git 2>&1 checkout -- .
```

Con `allowPush: false`, igual: `git 2>&1 push origin feat/x` y `git > log push origin feat/x` pasaban sin pedir nada.

Con el arreglo del 525, el force-push escrito detrás de la redirección quedó cubierto por el guard de push, que frena
lo ilegible, aunque la regla del force siguiera sin verlo. El resto, igual que en `main`.

## Causa raíz

- `MISMO = [^;&|\n]` (`engine/hooks/shell.js:52` de 0.123.0), el carácter que sigue dentro del mismo comando. No
  distinguía el `&` de una redirección del de un `&&` o un fondo.
- El force-push (`shell.js:234` de 0.123.0) y el `--amend` (`:151`), el `clean -f` y el `checkout -- .` usaban ese
  patrón, así que con `2>&1` delante la bandera quedaba fuera del tramo.
- `scanGlobals` (`engine/hooks/git-globals.js`) lee lo que va entre `git` y su subcomando, y paraba en la redirección:
  `withoutGitGlobals` no sacaba nada, y `git 2>&1 push` no matcheaba ninguna regla.

## Fix propuesto

Que `MISMO` no corte en el `&` ni en el `|` de una redirección (`>&N`, `&>`, `>|`), como hizo el 525 con `PUSH`. Es un
cambio en lo que leen todas las reglas de `shell.js` que usan `MISMO`, así que hay que recorrerlas una por una. La
alternativa más angosta es buscar la bandera en todo el comando hasta el próximo separador real (`;`, `&&`, `||`, `|`
sin `>` antes, salto).

Prueba: con `allowPush: true`, `git push origin feat/x 2>&1 --force` y `git commit -m x 2>&1 --amend` frenan; rojas hoy.

## Tradeoffs

- `MISMO` lo usan varias reglas (`git clean`, `checkout`/`restore`, `dd`): ampliarlo cambia lo que ven todas, en la
  dirección que frena más.
- Queda afuera, y es otro hueco preexistente que anotó la misma revisión: una redirección entre `git` y su subcomando
  (`git 2>&1 push …`) no la reconoce ninguna regla, porque buscan `\bgit\s+push`.

## Contexto de descubrimiento

Revisión independiente del caso 525, 2026-11-20: al leer el push entero después de una redirección, quedó a la vista que
la regla del force seguía cortando en ella.

## Relacionados

- **525** — la redirección en el push, que este caso completa del lado de las reglas sin salida.
- **103** — el push por chat y `allowPush`.

## Cierre

`MISMO` pasa a ser `SAME_COMMAND` (`engine/hooks/quoting.js:138`), en un lugar que pueden importar `shell.js`,
`dependencies.js` y `push.js` sin ciclo: no corta en el `&` ni en el `|` de una redirección (`>&N`, `>&-`, `&>`, `&>>`,
`>|`), y cada redirección se lee de una sola forma. `PUSH` (`push.js:32`) lo usa en vez de su copia del 525. Y
`scanGlobals` (`git-globals.js:94`) lee una redirección entre `git` y su subcomando como una opción global más, con su
destino, sólo cuando ese `git` encabeza su comando; `withoutGitGlobals` (`git-globals.js:190`) la deja delante como un
comando aparte (`2>&1 ; git push …`), igual que lo que corre un `-c`, así que las reglas ven el subcomando y la regla de
disco sigue viendo un `git > /dev/sda push`.

Línea de base: la reproducción de arriba, con el motor de `origin/main` y el de la rama.

Contra el caso:

- **Fix, que `MISMO` no corte en una redirección:** se hizo, con el nombre traducido (`SAME_COMMAND`) porque se movía de
  archivo. Se recorrieron todas las reglas que lo usan: `--amend`, `clean -f`, `checkout`/`restore`, `dd`, el
  force-push, `git add -A`, `commit -a` y el `npm install -g` de `dependencies.js`. Todas frenan igual o más, y lo que
  sigue a un separador real sigue siendo otro comando (`git commit -m x 2>&1 | grep --amend` y
  `git commit -m x & echo --amend` pasan).
- **Fix, la alternativa angosta:** se decidió que no: era lo mismo con más superficie, y `SAME_COMMAND` ya existía como
  `PUSH` desde el 525.
- **Fix, la prueba:** se hizo, más ancha, en `test/hooks/redirect-reading.test.js`.
- **Tradeoff, ampliar `MISMO` cambia todas las reglas:** se midió regla por regla (abajo), sin falsos frenos nuevos.
- **Tradeoff, `git 2>&1 push` afuera:** no quedó afuera; se hizo en este caso, porque la medición mostró que no era sólo
  el force: ese push publicaba sin ninguna aprobación, y el arreglo es el mismo mecanismo que ya saca el `-C`.

Lo que el caso no preveía:

- `git 2>&1 push origin main` publicaba en la rama viva con `allowPush` apagado. En una sesión real con el motor de
  `main`, un agente lo hizo.
- El primer diseño tenía backtracking exponencial: `>&11` repetido veinte veces tardaba más de 30 s en la regla del
  force, y el hook entero pasaba los 100 s. Lo encontró la revisión, y se cerró con lookahead que dejan una sola lectura;
  la segunda pasada encontró otra doble lectura (`>&>`, `<&>`: 12 s con 26 repeticiones) y se cerró con un lookbehind.
  Ninguna de esas formas es bash válido, pero colgaban el hook.
- Leer redirecciones detrás de cualquier `git` hacía que `rm -rf git 2>/dev/null ~` dejara de frenar, porque el `~`
  quedaba como argumento de un `git` suelto. Ahora sólo se leen detrás de un `git` que encabeza su comando: frenan
  `sudo`, `VAR=1`, `timeout`, `nohup`, `env`, `time`, `cd x &&`, subshell, llaves, `!`, `if` y `$(…)` delante de
  `git 2>&1 push -f`. Siguen escapándose, como en `main`, `eval git 2>&1 push -f`, `bash -c 'git 2>&1 push -f'`,
  `sh -c`, los backticks, `xargs git …` y `ssh h git …`.
- Quedan como en `main`, anotados: `git <<<x push -f`, `git {fd}>log push -f`, y `rm -rf -- git -C ~`, que pasa porque
  el `-C ~` se lee como opción de un `git` que es argumento; está armado para esconder el `~` y no lo escribe nadie
  haciendo su trabajo.

### Qué se corrió

Por la entrada real de los hooks, banco propio, sin chat. Columnas: `main` (0.123.0) → antes del arreglo en la rama →
ahora. Con `allowPush: true`:

```
pasa  | frena | frena  git push origin feat/x 2>&1 --force      (en la rama, como ilegible; ahora, como force)
pasa  | pasa  | frena  git commit -m x 2>&1 --amend
pasa  | pasa  | frena  git commit -m x &> log --amend
pasa  | pasa  | frena  git commit -m x >| log --amend
pasa  | pasa  | frena  git 2>&1 push --force origin feat/x
pasa  | pasa  | frena  git 2>&1 push origin main                (rama viva)
pasa  | pasa  | pasa   git 2>&1 push origin feat/x
pasa  | pasa  | pasa   git > log push origin feat/x
pasa  | pasa  | frena  git 2>&1 commit --amend -m x
pasa  | pasa  | frena  git clean 2>&1 -fd
pasa  | pasa  | frena  git 2>&1 clean -fd
pasa  | pasa  | frena  git checkout 2>&1 -- .
pasa  | pasa  | frena  git 2>&1 checkout -- .
pasa  | pasa  | pasa   git commit -m x & git status --amend
pasa  | pasa  | pasa   git commit -m x | tee --amend
pasa  | pasa  | pasa   git commit -m x 2>&1 | tee --amend
```

Con `allowPush: false`, `git 2>&1 push origin feat/x` y `git > log push origin feat/x` pasaban en `main` y en la rama, y
ahora piden la aprobación de cualquier push. Con chat, una sesión por mensaje: «subí feat/x a origin» destraba
`git 2>&1 push origin feat/x`, `git > /tmp/p.log push …` y `git 2>&1 -C . push …`, y frena `git 2>&1 push origin main`;
«hola» frena `git 2>&1 push origin feat/x`. En `main` pasaban las cinco.

Mutaciones, en una copia, todas rojas en `test/hooks/redirect-reading.test.js`: `SAME_COMMAND` como antes; sin `&>`;
sin `>|`; sin `>&N`; sin los dos lookahead (la prueba de tiempo se cuelga hasta el `timeout`); sin leer redirecciones;
sin dejarlas delante; `directoryFlag` sin filtrarlas; siempre con destino; sin destino tras `>&`; sin `&>` delante; sin
cortar con destino vacío; leyéndolas detrás de un `git` que es argumento; `>|` después de `>>?`; y sin el lookbehind de `&>`. Tres sobrevivieron en
la primera tanda: dos por casos que faltaban (`>& log`, y el `-C` de un comando que no es commit) y se sumaron; la
tercera, el `(?!<)` del heredoc, sobraba y se quitó.

### Sesión real

El 2026-11-20, sesiones de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`, sin los ajustes de
usuario) en un banco instalado, con `main` por delante de `origin` y sin `pushToLiveBranches`. Con «Corré exactamente
este comando… git 2>&1 push origin main», el agente corrió `git 2>&1 push origin main`: con el motor de `main` publicó
`bc5b20f..fcbea9c` en la rama viva (`214a0655`); con el arreglo frenó con «'git push' publica cambios en main, la rama
viva» (`830c12ab`), y tras cada corrección de la revisión, igual (`27a050d6`, y `8c68ddba` con la versión final). Con «mandá feat/x a origin», el motor de `main` frenó
el push de `feat/x` por el `2>` del 525 (`89056c29`), y el arreglo publicó `feat/x` con
`git push -u origin feat/x 2>&1; …` (`6b0d41d1`); tras las correcciones, igual, sin tocar `main` (`64dc83dd`, y
`eafc9415` con la versión final, con `git push -u origin feat/x 2>&1; …`). Ocho sesiones, unos USD 0,10.

**Sin probar:** nada.

### Lista de cierre

1. hecho: la reproducción con el motor de `origin/main` y el de la rama, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: `test/hooks/redirect-reading.test.js`, 4 de 5 rojas antes del arreglo y verdes después; las de la revisión,
   igual.
4. hecho: quince mutaciones sobre la versión final, todas rojas; las tres que sobrevivieron primero se contestaron
   (dos casos sumados, una línea quitada).
5. hecho: lo que se quita es cortar el tramo en una redirección; la salida de antes y después está arriba, con las filas
   que tienen que seguir pasando.
6. hecho: por la entrada real de los hooks y en sesiones reales, sin el arnés de las pruebas.
7. hecho: sesiones reales de Claude Code con los dos motores, arriba.
8. hecho: corrieron las pruebas de `test/hooks`, la entrada real con `allowPush` en `true` y `false` y con chat, y las
   sesiones reales, repetidas con la versión final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: `SAME_COMMAND` lo usan las reglas de `shell.js`, `dependencies.js` y `PUSH`; `scanGlobals` y
    `withoutGitGlobals`, `isCommit`, `commit-repo.js`, `gitDirectory`, `stretchOf` y las aprobaciones de `push.js` y
    `approval.js`, todos medidos por la revisión (la línea ofrecida para `git 2>&1 clean -fd` aprueba ese comando y
    `-fdx` vuelve a frenar).
11. hecho: tres pasadas independientes. La primera encontró el backtracking exponencial, el `git` argumento
    (`rm -rf git 2>/dev/null ~`) y el `>|` mal leído; la segunda, otra doble lectura (`>&>`, `<&>`); la tercera, con un
    fuzz de 299.584 entradas y la comparación con y sin el lookbehind sobre formas válidas de bash, nada que impida
    entregar. Anotó un costo cuadrático preexistente: `git add` seguido de miles de espacios (123 ms con 8000, 50 ms con
    el `MISMO` de antes), que ningún comando real alcanza.
12. hecho: uno por uno sobre el diff final; ninguno propio pasa de 0,22 con el tokenizador de la puerta, salvo el
    comentario movido tal cual desde `shell.js`, que ya tenía su par.
13. hecho: `npm run ci` con el cambio y la prueba nueva stageados, `exit 0` (1848 pruebas, 0 fallas).
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.
