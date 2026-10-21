---
caso: 398
titulo: el árbol de una línea nace con core.hooksPath apuntando a una carpeta que no tiene, y git commitea sin hooks sin avisar
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 398 — En un repositorio con husky, el árbol que arma `ops line` hereda `core.hooksPath=.husky/_` pero no trae `.husky/_`: los commits de la línea salen sin hooks y nada lo dice

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Lo que el repositorio frena en el pre-commit o en el
commit-msg —lint, formato del mensaje, secretos— pasa sin control en la línea, y el commit sale igual que uno bueno.

## Resumen

`core.hooksPath` vive en la configuración del repositorio, que comparten todos sus worktrees. husky lo pone en
`.husky/_`, una ruta relativa, y esa carpeta la genera husky al instalar (`prepare`) y git la ignora. El árbol nuevo
de la línea es un checkout limpio: tiene `.husky/` versionado pero no `.husky/_`. Con `hooksPath` apuntando a una
carpeta que no existe, git no corre ningún hook y no avisa.

El mensaje de `ops line` dice que las dependencias se instalan adentro (`engine/cli/lines.js:195`), y en un host con
git esa instalación regenera `.husky/_`. Pero entre `ops line` y la instalación no hay hooks, y si la instalación
corre en un contenedor sin git, husky no la genera nunca.

## Reproducción

En una instancia real, el 2026-10-19, con el motor 0.111.0, sobre dos repositorios con husky (`frontend-auth`,
`admin`):

```bash
node tools/ops.js line . auth frontend-auth
git -C lines/auth/frontend-auth config core.hooksPath      # .husky/_
test -d lines/auth/frontend-auth/.husky/_ || echo falta    # falta
test -d frontend-auth/.husky/_ && echo "el original la tiene"
```

## Síntoma

```
lines/auth/frontend-auth hooksPath=.husky/_ existe=no | original=sí
lines/admin/admin hooksPath=.husky/_ existe=no | original=sí
```

Después de `npm ci` dentro del contenedor del servicio, husky imprimió `git command not found` y `.husky/_` siguió
faltando. Se resolvió copiando `.husky/_` desde el checkout original.

Medido aparte el 2026-10-19 con git 2.43.0: un `pre-commit` en `.husky/_` que sale con 1 frena el commit en el
checkout principal (`HOOK-CORRIO`, exit 1); en un `git worktree add` del mismo repo, sin `.husky/_`, el commit sale
con exit 0 y git no imprime nada.

## Causa raíz

`engine/cli/lines.js` arma el árbol con `git worktree add` y no mira la configuración de hooks del repositorio. Lo que
git no versiona y el repositorio necesita para sus hooks no llega, y el aviso de la salida habla de dependencias, no
de hooks.

## Fix propuesto

Después de armar cada árbol, si `git config core.hooksPath` es una ruta relativa y no existe dentro del árbol,
avisarlo: «`<repo>`: `core.hooksPath` apunta a `<ruta>`, que este árbol no tiene; hasta generarla los commits salen
sin hooks». No copiarla: lo que hay adentro lo decide la herramienta del repositorio.

La aceptación pide la mutación: con la comprobación quitada, la prueba que arma una línea sobre un repositorio con
`core.hooksPath=.husky/_` versionado sin `_` no encuentra el aviso y falla.

## Tradeoffs

- Un repositorio sin hooks no ve nada; uno con `hooksPath` absoluto tampoco, porque la ruta existe.
- `ops lines` podría repetir el aviso mientras falte, para que no se pierda en la salida de `ops line`.

## Contexto de descubrimiento

Al preparar los árboles de tres líneas recién migradas para construir en ellos.

## Relacionados

- 218 — habla de los hooks de Claude Code de una línea, no de los hooks de git del repositorio.
- 399 — otra cosa que el checkout aparte comparte con el original sin que se vea.

## Cierre

**Resuelto en 0.112.0.** `plant` (`engine/cli/lines.js`) mira, después de armar o reusar cada árbol, `git config
--path core.hooksPath` desde el árbol. Si es relativa y la carpeta no existe dentro del árbol, suma el aviso: «`<repo>`:
core.hooksPath apunta a `<ruta>`, que este árbol no tiene; hasta que la instalación del repositorio la genere, git
commitea sin hooks y no lo dice.». No copia nada. `ops lines migrate` arma con `assemble`, así que avisa igual.

El enunciado, ítem por ítem:

- **Avisar cuando la ruta relativa no existe en el árbol, sin copiarla**: se hizo así.
- **La mutación**: dos, abajo.
- **Tradeoff, un repositorio sin hooks o con `hooksPath` absoluto no ve nada**: así quedó, y la prueba lo fija. Una
  ruta absoluta que no exista tampoco avisa, porque eso falla igual en el checkout principal y no es de la línea.
- **Tradeoff, que `ops lines` repita el aviso mientras falte**: se hizo distinto. Se repite cada vez que se vuelve a
  pedir `ops line <ops-root> <línea>`, que reusa los árboles y es barato, y deja de decirse cuando la carpeta
  aparece. `ops lines` no lo lleva: es el estado que se lee a menudo, y una línea de git config por árbol y por
  lectura no compra nada que el aviso al armar no diga.

**Lo que se corrió para saber que funciona.**

- `test/wiring/lines.test.js`, «el árbol de una línea avisa cuando su core.hooksPath apunta a una carpeta que no
  tiene»: avisa al armar, no la copia, repite al volver a pedirla, calla cuando la carpeta aparece, y calla con una
  ruta absoluta que existe o sin `hooksPath`. Roja antes del cambio (`actual: ''`).
- Mutaciones en una copia fuera del árbol: sin el aviso, roja; mirando la carpeta del checkout original en vez de la
  del árbol, roja.
- Real, en `ops bench sidecar` con husky 9 instalado de verdad en el repositorio del producto (`npm install -D
  husky@9`, `npx husky`) y un `.husky/pre-commit` que sale 1:
  - en el checkout original el commit frena: `HUSKY-PRE-COMMIT-CORRIO`, `husky - pre-commit script failed (code 1)`,
    exit 1;
  - `ops line` con el motor de `main` no dice nada de hooks (0 líneas); con el de la rama imprime el aviso;
  - en el árbol, sin `.husky/_`, el commit sale con exit 0 y git no imprime nada: el defecto del caso;
  - después de `npm ci` dentro del árbol, el mismo commit frena con exit 1, y `ops line ops nueva` ya no avisa.
