---
caso: 403
titulo: con pnpm, un cambio de version en package.json sigue frenando por el lockfile aunque la medición lo da por inerte
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 403 — `INERT_KEYS` es una sola lista para npm y pnpm: `version` mueve el lock de npm pero no el de pnpm, y quedó afuera para los dos

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Cada release de un paquete con pnpm —que es un cambio de
`version`— pide la aprobación de una persona, aunque su lock no cambie.

## Resumen

Desde el caso 181 el guard deja commitear un `package.json` sin su lockfile cuando sólo cambian claves que no mueven
el lock. La lista es única. Su comentario dice que con npm `name`, `version`, `license`, `engines` y otras sí mueven
el lock, y que con pnpm «todas éstas son inertes también». Como la lista es la misma para los dos, `version` quedó
afuera, y con pnpm el cambio de versión frena igual.

## Reproducción

En una instancia real, al publicar un paquete con `pnpm-lock.yaml`, el guard frenó tres veces el cambio de versión
en una sesión (`[<instancia>][guard-lockfile-mira-el-diff-no-las-dependencias]` en su INBOX).

Medido el 2026-10-19 con el motor del repositorio en 0.111.0: un repo con `package.json` y un lock, `git add
package.json` con una sola clave cambiada y `execute('dependencies', …)` sobre `git commit`:

```
pnpm-lock.yaml version      FRENA → .: cambió package.json sin actualizar su lockfile.
pnpm-lock.yaml description  PASA
package-lock.json version   FRENA → .: cambió package.json sin actualizar su lockfile.
package-lock.json description PASA
```

La última fila con npm es la correcta y tiene que seguir así.

## Causa raíz

`engine/hooks/shell.js:220-223` (`INERT_KEYS`) no tiene `version`; `:228-229` (`lockUnaffected`) usa esa lista
para cualquier lock de `MEASURED_LOCKS`. La medición de pnpm está en el comentario de `:215-219`.

## Fix propuesto

Una lista por gestor medido: la de npm como hoy, y la de pnpm con además lo que el comentario mide como inerte ahí
(`name`, `version`, `license`, `engines`, `bin`, `funding`, `workspaces`, `os`, `cpu`). `lockUnaffected` elige la
lista según el lock presente.

La aceptación pide la mutación: con `version` quitado de la lista de pnpm, la prueba que cambia sólo `version` en un
repo con `pnpm-lock.yaml` vuelve a frenar y falla; y la misma prueba con `package-lock.json` tiene que seguir
frenando.

## Tradeoffs

- Dos listas cuestan mantener dos mediciones; la de pnpm ya está hecha (pnpm 10.30.2).

## Contexto de descubrimiento

Revisión mensual del INBOX de una instancia real, el 2026-10-19.

## Relacionados

- 181 y 375 — las mediciones de npm y pnpm que dieron la lista.

## Cierre

**Resuelto en 0.112.0.** `INERT_KEYS` pasa a ser una lista por lock (`engine/hooks/shell.js`): la de npm igual que
antes, y la de pnpm con además `name`, `version`, `license`, `engines`, `bin`, `funding`, `workspaces`, `os` y `cpu`.
`lockUnaffected` elige la del lock presente, y `MEASURED_LOCKS` sale de las claves de ese mapa, para que un gestor
nuevo no pueda estar en una lista y no en la otra.

El enunciado, ítem por ítem:

- **Una lista por gestor medido**: se hizo así.
- **Las nueve claves de pnpm**: se agregaron las nueve. Las otras que el 375 midió inertes con pnpm
  (`packageManager`, `pnpm.onlyBuiltDependencies`, `peerDependenciesMeta`, `overrides`) se decidió no sumarlas: el
  caso no las pedía, y `pnpm` es una sola clave de primer nivel donde también vive `pnpm.overrides`, que sí mueve.
  Los scripts de instalación siguen frenando con pnpm, como dice el comentario.
- **La mutación de `version` en la lista de pnpm, y que npm siga frenando**: las dos, abajo.
- **Tradeoff de mantener dos mediciones**: la de pnpm ya estaba; no se midió nada nuevo de npm.

Lo que el caso no preveía y se miró: el 375 midió un paquete solo, y en un workspace `name` y `version` de un paquete
del que otro depende podrían importar. Medido con pnpm 10.30.2 en un workspace de dos paquetes, `b` dependiendo de
`a` con `workspace:^1.0.0`: subir `a` a 1.0.1 o a 2.0.0, o renombrarlo, deja el lock igual y `pnpm install
--frozen-lockfile --offline` sale 0; agregar una dependencia a `b`, el control, sale 1 con `ERR_PNPM_OUTDATED_LOCKFILE`.

**Lo que se corrió para saber que funciona.**

- `test/hooks/commit.test.js`: con pnpm pasan `version`, `name`, `engines`, y `bin` con `license`; frenan una
  dependencia, la versión junto con una dependencia, `pnpm.overrides` y `resolutions`. La prueba se vio roja antes
  del cambio: `Got unwanted exception: la versión`.
- Mutaciones en una copia fuera del árbol: sin `version` en la lista de pnpm, roja (`Got unwanted exception: la
  versión`); con npm leyendo la lista de pnpm, roja (`Missing expected exception`, la versión con npm dejó de
  frenar).
- El guard real, `engine/hooks/run.js dependencies` con el payload del runner, sobre un repositorio en `/var/tmp`
  con `pnpm-lock.yaml` generado por pnpm y `pnpm version patch --no-git-tag-version` stageado: el motor de `main`
  sale 2 con «cambió package.json sin actualizar su lockfile», el de la rama sale 0. Agregar `ms@2.1.3` sin lock
  frena con los dos. Sobre ese mismo repositorio, `pnpm install --frozen-lockfile` después del bump sale 0: lo que se
  deja pasar no deja un lock viejo.
