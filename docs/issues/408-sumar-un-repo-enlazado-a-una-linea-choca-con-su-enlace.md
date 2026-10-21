---
caso: 408
titulo: sumar a una línea un repositorio que ya estaba enlazado como hermano falla, porque su enlace ocupa el lugar del árbol
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 408 — `ops line . <línea> <repo>` sobre una línea que ya enlazó ese repositorio dice «ya existe y no es un worktree»: el enlace que puso la propia línea le cierra el paso

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Una línea crece así: se arma con un repositorio y después
se le suma otro. El segundo casi siempre ya está enlazado, porque `ops line` enlaza en la carpeta de la línea todo
repositorio que no trabaja. O sea que el camino normal para sumar un repositorio falla.

## Resumen

`ops line` arma un worktree por cada repositorio de la línea y enlaza los demás en `lines/<línea>/`, para que un
`../otro` resuelva igual que desde la carpeta de sesión. Al pedir después la misma línea con uno de esos repositorios,
`plant` encuentra en `lines/<línea>/<repo>` el enlace que dejó la vez anterior y se niega. Hasta borrar el enlace a mano,
la línea no se puede ampliar.

## Reproducción

El 2026-10-20, sobre `ops bench sidecar` con un segundo repositorio del producto (`api`) al lado de `app`:

```
$ node engine/cli/ops.js line ops dos app
✓ …/sidecar/lines/dos/app  (line/dos)
  enlazados: api
$ ls -la lines/dos/ | grep api
lrwxrwxrwx … api -> …/sidecar/api
$ node engine/cli/ops.js line ops dos api
…/sidecar/lines/dos/api ya existe y no es un worktree de api. Quedaron armados …/sidecar/lines/dos/app; repetir los reusa.
exit=1
```

Lo mismo con el motor de `main` (0.111.0), sobre otra línea: exit 1 con el mismo mensaje. `ops.config.json` queda con
la línea sin el repositorio nuevo, porque la declaración se escribe al final.

## Causa raíz

`engine/cli/lines.js:88` (`plant`) devuelve el error cuando la ruta del árbol existe y no está registrada como worktree,
sin distinguir el enlace que la propia línea creó en `linkSiblings` (`:43`, el enlace en `:56`).

## Fix propuesto

En `plant`, si la ruta del árbol es un enlace simbólico cuyo destino real es el repositorio que se pide —el que
`linkSiblings` habría puesto—, sacar el enlace y armar el worktree en su lugar. Cualquier otra cosa en esa ruta sigue
negándose como hoy: una carpeta real, un enlace a otro lado.

Decidir y destruir se separan (R23): la comprobación de que el enlace es el de la línea va aparte y sin borrar, y lo
único que se saca es un enlace, nunca lo que apunta.

La aceptación pide la mutación: con la comprobación del destino quitada —sacar cualquier enlace—, la prueba que pone
en esa ruta un enlace a otro repositorio tiene que ver que se lo sacó y fallar; y con la salida quitada, la prueba que
suma un repositorio enlazado vuelve a fallar con «ya existe».

## Tradeoffs

- Una línea que alguien enlazó a mano a propósito con ese nombre pierde el enlace; como apunta al mismo repositorio que
  ahora se trabaja, es lo que se pidió.

## Contexto de descubrimiento

Al escribir la prueba del aviso de compose del caso 399, que sumaba un repositorio a una línea ya armada.

## Relacionados

- 394 — la disposición de `lines/<línea>/` y los enlaces de los hermanos.
- 399 — la prueba donde apareció.

## Cierre

**Resuelto en 0.112.0.** `plant` (`engine/cli/lines.js`) reemplaza por el árbol el enlace que la propia línea puso: si en la
ruta del árbol hay un enlace simbólico cuyo destino real es el repositorio que se pide, se saca el enlace (`fs.unlinkSync`, que
no toca lo que apunta) y se arma el worktree. Cualquier otra cosa en esa ruta se sigue negando como antes.

El enunciado, ítem por ítem:

- **Reemplazar el enlace al mismo repositorio, y negar lo demás**: hecho.
- **Decidir y destruir separados (R23)**: `ownLink` sólo decide y no borra; lo único que se borra es un enlace, nunca su
  destino. La prueba lo comprueba: el repositorio al que apuntaba sigue con su `a.js`.
- **Las dos mutaciones del caso**: abajo.
- **Tradeoff, un enlace hecho a mano con ese nombre**: se pierde el enlace, como decía el caso; apunta al mismo repositorio que
  ahora se trabaja.

**Lo que se corrió para saber que funciona.**

- `test/wiring/lines.test.js`, «sumar a una línea un repositorio que ella misma enlazó reemplaza el enlace por su árbol»: el
  enlace se vuelve worktree en `line/w`, el repositorio original queda intacto y la línea declara los dos; un enlace a otro
  lado y una carpeta real se siguen negando, y el enlace ajeno queda donde estaba. Roja antes del cambio, con el error del
  caso.
- Mutaciones en una copia fuera del árbol, las dos en rojo: sin el reemplazo; aceptando cualquier enlace (sacó el que apuntaba
  a otro lado).
- **Real**, la reproducción del caso por la CLI sobre `ops bench sidecar` con un segundo repositorio (`api`) al lado de `app`:
  - con el motor de `main`: `ops line ops lmain app` enlaza `api`, y `ops line ops lmain api` sale 1 con «…lines/lmain/api ya
    existe y no es un worktree de api»;
  - con el de la rama: `ops line ops lrama api` sale 0, imprime `✓ …/lines/lrama/api  (line/lrama)`, `lines/lrama/api` ya no es
    un enlace y está en `line/lrama`, y `api/a.js` sigue en su lugar.

**Lo que encontró la revisión del conjunto**, antes del PR, y se arregló acá:

- **Si `git worktree add` fallaba después de sacar el enlace, la línea se quedaba sin él**, y los `../<repo>` de los otros
  repositorios dejaban de resolver. Ahora el enlace vuelve. Entre el árbol y el enlace se sacan sólo las carpetas vacías
  (`rmdirSync`): un checkout a medias no se borra (R23), y si por eso el enlace no se puede reponer, el error lo dice.
- **Un repositorio anidado seguía chocando un nivel más arriba.** `linkSiblings` enlaza la carpeta entera (`grupo/`) cuando
  ningún repositorio de adentro es de la línea, y sumar después `grupo/web` daba otra vez «ya existe». `ownLink` pasó a ser
  `linkOnTheWay`, que busca el enlace propio en cualquier nivel del camino; el nivel lo rearma `linkSiblings` con sus
  hermanos, y si el árbol falla es el enlace de ese nivel el que vuelve.

Probado así: la prueba de este caso suma la falla con la rama ocupada (el enlace vuelve), y «sumar un repositorio anidado
reemplaza el enlace de la carpeta que lo contiene» cubre el anidado y su falla. Mutaciones en rojo: sin reponer el enlace,
cortando el recorrido de carpetas vacías en el primer `ENOENT` y buscando sólo el enlace del propio repositorio. La primera
versión del recorrido tenía justo ese corte, y la prueba la puso en rojo antes de entregar. Real, por la CLI sobre la
instancia instalada: con `line/w` ocupada en `api`, `ops line ops w api` sale 1 y `lines/w/api` vuelve a ser el enlace;
con la rama libre, el árbol se arma.

**Lo que encontró la tercera revisión y la prueba real**, y se arregló acá:

- **Git puede dejar el árbol armado y salir con error.** Un `post-checkout` que falla le pasa su código a `git worktree add`.
  Medido por la CLI en una instancia instalada: el árbol quedó registrado, con su checkout completo, y el mensaje decía que el
  enlace no se pudo reponer y mandaba a borrarlo. Borrarlo a mano deja el registro colgado. Ahora, si el árbol quedó
  registrado no se toca, y el mensaje dice que está armado y que repetir lo reusa. Repetirlo lo reusa y declara la línea.
- **Si algo lanzaba entre sacar el enlace y `worktree add`** (un `mkdirSync`), el enlace no volvía. Ahora vuelve. Esto
  no tiene prueba: no hay cómo hacer fallar ahí el `mkdirSync` sin montar un permiso raro.
- **Un enlace roto en la ruta del árbol** no lo veía `existsSync`, y el error era el de git, opaco. Ahora se mira con
  `lstat`, y dice «ya existe y no es un worktree».

Probado así: la prueba de este caso suma el enlace roto y el `post-checkout` que falla. Mutaciones en rojo: sin mirar si el
árbol quedó registrado («El árbol quedó armado…») y con `existsSync`. Real, por la CLI sobre una instancia instalada desde el
tarball, con `grupo/cli` y un `post-checkout` que sale 1: «El árbol quedó armado en …/lines/w/grupo/cli: repetí el comando
para reusarlo», el árbol en `line/w`, y al repetir sale 0 y la línea declara `grupo/cli`. Y el repositorio anidado, por la
misma CLI: con la rama ocupada el enlace `grupo` vuelve; con la rama libre, `grupo/` pasa a carpeta con `web` en `line/w` y
`api` y `docs` enlazados.
