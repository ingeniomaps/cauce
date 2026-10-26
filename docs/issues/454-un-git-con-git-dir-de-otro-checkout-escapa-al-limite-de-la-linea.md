---
caso: 454
titulo: Desde la sesión de una línea, un `git` que corre en el árbol de la línea con `--git-dir` (o `GIT_DIR`) apuntando al checkout principal le cambia a la sesión principal su stash, su índice o su rama sin que line-scope lo frene, porque gitTargets ignora el repositorio y sólo mira la carpeta
estado: resuelto
resuelto-en: 0.117.0
prioridad: media
version-detectada: 0.116.0
---

# 454 — Un `git` con `--git-dir` de otro checkout escapa al límite de la línea

**🟢 resuelto en 0.117.0** · detectado en 0.116.0 · prioridad **media**: un agente de línea que apunta un `git` al repositorio del
checkout principal con `--git-dir` o `GIT_DIR`, desde su propio árbol. No es la forma habitual de correr git, pero el
daño cae sobre la otra sesión y no avisa.

## Resumen

`line-scope` decide qué checkout cambia un `git` por la carpeta donde corre: la de `-C`, o la de `--work-tree`
(`gitTargets`, `engine/hooks/line-scope.js`). El repositorio que el comando usa no lo mira: `--git-dir` se saltea como
una bandera con valor, y `GIT_DIR` en el entorno no se lee. Con el árbol en el de la línea y el repositorio en el del
checkout principal, el guard ve un `git` dentro de la línea y lo deja pasar, y lo que cambia es la rama, el índice o el
stash de la sesión principal. Es el cambio que el caso 423 cerró.

## Reproducción

Banco sidecar (`node engine/cli/ops.js bench sidecar --force`), con la línea `piloto` sobre `app`. Una sesión que dijo
`/autobuild piloto` y después «implementá la tarea», en `bypassPermissions`, con el motor de `main` (`a6f33dec`) y el de
la rama del 453 (`5148d181`):

```bash
git -C <banco>/lines/piloto/app --git-dir=<banco>/app/.git --work-tree=. stash
GIT_DIR=<banco>/app/.git git -C <banco>/lines/piloto/app stash
git -C <banco>/app stash
```

## Síntoma

El guard, medido el 2026-10-25, igual con los dos motores:

```
exit 0  git -C <banco>/lines/piloto/app --git-dir=<banco>/app/.git --work-tree=. stash
exit 0  GIT_DIR=<banco>/app/.git git -C <banco>/lines/piloto/app stash
exit 2  git -C <banco>/app stash
```

Sobre la instancia no pasa con `--work-tree` apuntando a ella (`exit 2`), porque ahí el árbol sí se lee.

Lo que hace el primer comando, corrido en el banco con un archivo nuevo `linea.txt` en el árbol de la línea:

```
Directorio de trabajo y estado de índice WIP on master: 8fa3590 producto del banco guardados
--- main checkout stash:
stash@{0}: WIP on master: 8fa3590 producto del banco
--- línea tiene linea.txt: no
```

El cambio de la línea terminó en el stash del checkout principal, como «WIP on master», y desapareció del árbol de la
línea.

## Causa raíz

- `engine/hooks/line-scope.js:211` (`gitTargets`): `--git-dir` está en la lista de banderas que se saltean con su
  valor, sin usarlo.
- `gitTargets` recibe los tramos de `steps`, que no traen el entorno del comando, así que `GIT_DIR=…` no llega.

## Fix propuesto

Que un `git` con `--git-dir` o `GIT_DIR` se juzgue también por el checkout de ese repositorio: si el repositorio es el
de la instancia o el de un checkout principal de la línea (no un árbol de la línea), sale como `shared`, igual que si
corriera ahí. Hace falta resolver a qué checkout pertenece un `.git`, y decidir qué pasa con un `--git-dir` que no se
puede resolver (cerrado por defecto, R27).

## Contexto de descubrimiento

La segunda revisión de código del arreglo del 453, el 2026-10-25. No es una regresión de ese arreglo: el motor de `main`
da lo mismo.

## Relacionados

- 423: el límite que esto rodea.
- 453: la revisión donde apareció.

## Cierre

**Resuelto en 0.117.0.**

- **Que el `git` se juzgue también por el checkout de su repositorio.** Se hizo, en `gitTargets`
  (`engine/hooks/line-scope.js`). El repositorio o el índice que mueven `--git-dir`, `--work-tree`, `-c core.worktree`,
  `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` y `GIT_COMMON_DIR` se juzga por la carpeta que tiene el `.git`. El de un
  árbol de `git worktree` (`.git/worktrees/<n>`), por el árbol que nombra su `gitdir`, también si es relativo. Sin un
  repositorio movido, la carpeta donde corre sigue contando aunque el árbol esté en otro lado.
- **Resolver a qué checkout pertenece un `.git`.** Se hizo así, con `..` normalizado y `~` expandido, y las variables
  que el mismo comando asigna resueltas con el resolvedor de `shell-boundary`.
- **El `--git-dir` que no se puede resolver.** Se decidió cerrado por defecto (R27): una variable sin resolver, `$(…)`,
  un valor que viene de `read`, `+=` o `printf -v`, un `core.worktree` relativo, o configuración por `GIT_CONFIG_*` o
  `--config-env`. Todo eso frena como `unplaced`, corregible por el agente escribiendo la ruta entera. Va al revés que
  los borrados, que no juzgan lo que no resuelven (caso 365). Acá la forma es rara y la salida, barata.
- **`GIT_DIR` en el entorno.** `steps` (`engine/hooks/shell-changes.js`) lleva ahora el entorno de cada tramo: las
  asignaciones delante del comando, lo que se exporta o declara para los que siguen (también dentro de un grupo o
  después de `then`), con el alcance de cada subshell, y lo que `unset`, `env -u` y `env -i` sacan.

**Lo que no preveía**, encontrado por las tres pasadas de revisión de código:

- **Un prefijo con valor escondía el comando.** Con `sudo -u yo`, `env -u X`, `nice -n 5`, `timeout 10`,
  `xargs -n 1`, `exec -a x` o `time -f`, el valor era el verbo y nada se juzgaba. Valía también para un `rm` fuera de
  las raíces, medido con el motor de `main`. Se arregló en `steps` con `VALUED`, y `env -C` y `sudo -D` cambian la
  carpeta.
- **Un escaneo del texto, probado y retirado.** La primera versión buscaba `GIT_DIR=` en todo el comando, y frenaba un
  commit cuyo mensaje lo cita mientras dejaba pasar `read`. Lo reemplazó el entorno de `steps`.
- **Un `GIT_*` exportado y pasado a otro comando** (`GIT_DIR=… sh -c "git stash"`) se probó como `unplaced` y se
  retiró: frenaba lectores legítimos (`git status | head`) con un mensaje que no correspondía. Es la clase del comando
  escondido.
- **El comando escondido** —`sh -c`, `eval`, `env -S`, un envoltorio que no está en la lista como `stdbuf` o
  `sudo -T`— escapa a todos los guards que leen tramos, y ya pasaba en `main`. Salió como el caso 455, medido.
- **Una variable asignada sin `export`** cuenta como exportada para los `git` que siguen. Es la dirección segura: frena
  de más y nunca de menos.

La prueba:

- `test/hooks/line-scope.test.js`, prueba nueva desde el árbol de la línea. Frenan 28 formas, cada una en
  `git <sub> @ <checkout>` (una, sobre la instancia): las tres del síntoma, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `core.worktree`, una variable
  resuelta, `~`, `export` en un grupo, después de `then` y con `declare -x`, los siete prefijos con valor, `env -C`,
  `--chdir=`, `sudo -D`, una carpeta que no se sabe, el árbol de la línea con el repositorio del checkout, un `..` que
  sale del repositorio de la línea y un `gitdir` relativo. Frenan como `unplaced`, con «Esto lo corregís vos», `$(…)`,
  `+=`, `read`, un `--git-dir` relativo sin carpeta, `--config-env`, un `core.worktree` relativo y `GIT_CONFIG_COUNT`.
  Pasan 13: leer, el repositorio propio de la línea (también por su `.git/worktrees/<n>`), un commit que cita
  `GIT_DIR=`, un `printf` sin `-v`, la variable que muere con su subshell, `unset`, `env -u`, un prefijo que vale sólo
  para el comando de antes, y `git status | head` con el repositorio propio exportado. El mismo checkout por dos
  caminos se nombra una vez. Con el motor de `main` dio rojo.
- `test/hooks/removal-boundary.test.js`: `sudo -u`, `timeout`, `nice -n` y `env -C` delante de un `rm` fuera de las
  raíces frenan; con el `steps` de `main` dio rojo.
- En una copia, 26 mutaciones dieron rojo, una por cada pieza: el árbol de `worktree`, el `gitdir` relativo, resolver
  variables, `~`, quitar repetidos, `core.worktree`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`, el árbol movido sin la
  carpeta, `-C` entero sin carpeta, `env -u`, `timeout`, `xargs`, el alcance del subshell, `declare`, `unset`, `+=`,
  normalizar `..`, `env -C` y `sudo -D`, `--chdir=`, `--config-env`, `GIT_CONFIG_*`, el `core.worktree` relativo,
  `printf` sin `-v`, `GIT_WORK_TREE` y leer las asignaciones.
- `npm run ci`: 1623 de 1623.
- **Sesión real** de Claude Code 2.1.310, `claude -p` en `bypassPermissions`, en un banco instalado con el motor de la
  rama y la sesión atada por un `/autobuild piloto` real, con `linea.txt` sin commitear en el árbol de la línea. Los dos
  pasos de la reproducción —`git --git-dir=<banco>/app/.git --work-tree=. stash -u` y `GIT_DIR=<banco>/app/.git git
  stash -u`— frenaron con «`<banco>/app` es el checkout de la sesión principal, y `git stash` le cambia su rama…»,
  ofreciendo `git stash @ <banco>/app`. El stash del checkout principal siguió vacío y `linea.txt` siguió en el árbol.
  Con el motor de `main`, el primero lo había movido al stash de la principal (arriba).
