---
caso: 454
titulo: Desde la sesión de una línea, un `git` que corre en el árbol de la línea con `--git-dir` (o `GIT_DIR`) apuntando al checkout principal le cambia a la sesión principal su stash, su índice o su rama sin que line-scope lo frene, porque gitTargets ignora el repositorio y sólo mira la carpeta
estado: abierto
prioridad: media
version-detectada: 0.116.0
---

# 454 — Un `git` con `--git-dir` de otro checkout escapa al límite de la línea

**🔴 abierto** · detectado en 0.116.0 · prioridad **media**: un agente de línea que apunta un `git` al repositorio del
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
