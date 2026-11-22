---
caso: 544
titulo: una línea no tiene dónde declarar qué arma y qué desarma de su entorno, y retirarla deja contenedores, volúmenes y bases
estado: resuelto
resuelto-en: 0.124.0
prioridad: baja
version-detectada: 0.124.0
---

# 544 — una línea no tiene dónde declarar qué arma y qué desarma de su entorno, y retirarla deja contenedores, volúmenes y bases

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **baja**: el costo es disco, memoria y una base de desarrollo que una
migración de la línea puede tocar. Lo pagan los productos con un entorno local pesado. Una instancia real construyó
cuatro herramientas propias para armarlo y desarmarlo.

## Resumen

`ops line` arma los worktrees y `ops lines join … --apply` los retira. Lo que la línea levanta del lado del producto no
lo conoce nadie:

- el proyecto de compose que el aviso del 399 pide nombrar (`app-pagos`), con sus contenedores, red y volúmenes;
- una base propia, para que una migración y su `down`, un seed o una corrida de QA desde el árbol no toquen la de
  desarrollo;
- lo que un contenedor escribió como root dentro del árbol.

El retiro en seco ya separa decidir de hacer, como pide R23: dice qué pasaría, y `--apply` lo hace. Pero sólo habla de
git.

## Reproducción

Sin modelo, en el banco del caso 543, con la línea `pagos` armada sobre un producto con compose:

```
$ ops lines join . pagos
RETIRAR la línea pagos  (1 repositorio(s))
  app  llegó a master
Para hacerlo: ops lines join <ops-root> pagos --apply
```

Nada sobre `app-pagos` ni sobre lo que haya creado. Y `git worktree remove` se lleva el árbol con su `.env` ignorado
adentro, sale con 0 y no avisa (verificado con git 2.53).

El esquema de `ops.config.json` declara `lines` como repositorios por línea y nada más
(`engine/schemas/ops-config.schema.json:219-234`): no hay dónde decir qué armar ni qué desarmar.

## Síntoma

Cada línea retirada deja lo suyo levantado o en disco, y la siguiente con el mismo nombre lo hereda. Para la base, el
riesgo es el contrario: sin una propia, una migración que se prueba desde el árbol corre contra la de desarrollo.

## Causa raíz

Las líneas (casos 394 y 399) se pensaron del lado de git. Lo del producto se dejó al producto, sin un lugar donde el
producto lo enganche.

## Fix propuesto

Dos ganchos que el proyecto declara, y que Cauce corre en el árbol de cada repositorio de la línea. Lo que hacen es del
proyecto: copiar una base, levantar un compose, hacer `chown` de lo que quedó.

- **`lineSetup`**: un comando por repositorio que `ops line` corre al terminar de armar el árbol, con `CAUCE_LINE`,
  `CAUCE_REPO` y `CAUCE_TREE` en el entorno.
- **`lineTeardown`**, en dos pasos como el retiro:
  - en seco, `ops lines join <línea>` lo corre con `CAUCE_PLAN=1` e imprime lo que devuelve: qué se llevaría, una línea
    por cosa, sin hacer nada;
  - con `--apply` lo corre de verdad antes de quitar los worktrees, y si falla, no los quita.
- Un comando declarado corre como el proyecto lo escribió, sin shell intermedio que Cauce arme. Sale con su código, y
  Cauce lo dice.

## Decisión

**¿Cauce corre comandos que el proyecto declara al armar y retirar una línea?** Es una superficie nueva:
`ops.config.json` pasa a ser algo que ejecuta.

- **Sí, con los dos ganchos.** Cada instancia los declara si los necesita; sin ellos, nada cambia.
- **No.** Lo del producto queda en el producto, y Cauce sólo lo nombra: el retiro en seco avisa que, si el repositorio
  tiene compose, el proyecto `app-pagos` pudo quedar levantado.

**Decidido (Manuel, 2026-11-22, sobre esta recomendación): no por ahora, y el aviso sí.** Es barato y nombra el hueco. Los ganchos son el caso propio de una
instancia que los pida, y la única que los construyó lo hizo atado a su base y a su gestor de contenedores. Con una sola
instancia no hay forma de saber qué forma generaliza.

## Tradeoffs

- **Ejecutar lo que declara un archivo.** Un agente que escribe `lineSetup` en `ops.config.json` se da una ejecución
  propia. Hay que cuidarlo como el resto de lo que afloja un guard (`config-keys.js`, caso 498).
- **El aviso solo** no desarma nada: nombra lo que la persona tiene que mirar.
- **Medirlo** pide un producto con compose y Docker en el banco. El aviso se prueba sin eso.

## Contexto de descubrimiento

Paso 4 de la auditoría de una instancia (2026-11-22), ítem 13 del nivel 2. Lo que la instancia construyó:

- `line-db`: una base copiada de la de desarrollo por cada árbol;
- `line-clean`, con `plan` y `run`: contenedores, volúmenes y bases de la línea, y `chown` de lo que quedó como root;
- `line-swap`: baja los contenedores principales mientras corren los de la línea, por memoria;
- `review-env`.

Las cuatro están atadas a su Postgres, a su gateway y a su máquina. La memoria va con el ítem 16 (`machine-lock`) y no
entra acá.

## Relacionados

- 394 y 399: las líneas y el proyecto de compose de un árbol.
- 543: el `.env` del árbol.
- 498: lo que afloja un guard en `ops.config.json`.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, los ganchos `lineSetup` y `lineTeardown`** — se decidió que no, por ahora. Lo decidió Manuel el
  2026-11-22, con la razón del caso: con una sola instancia que los construyó, atados a su base y a su gestor de
  contenedores, no se sabe qué forma generaliza. Si otra instancia los pide, se abren como caso propio.
- **El aviso** — se hizo, en el retiro en seco de `ops lines join` (`leftNotes` en `engine/cli/lines-join.js` y
  `leftBehind` en `engine/cli/line-env.js`). Por cada repositorio de la línea:
  - si el compose del árbol corre con un proyecto propio, lo nombra y dice cómo bajarlo antes de retirar;
  - si es el mismo que el del checkout de siempre, lo dice y no aconseja bajarlo, porque bajaría lo que no es de la
    línea;
  - si no se sabe con qué proyecto corre, no aconseja nada. Pasa cuando el nombre sale de una variable, viene del
    `name:` del compose, que no se lee (caso 399), o no es uno que Compose acepte;
  - nombra los `.env*` del árbol que el retiro se lleva, y los respaldos de `lines/<línea>/.env-prev/`, que no borra;
  - después de `--apply` no repite lo que había que hacer antes, salvo los respaldos, que siguen en disco.
- **Tradeoffs: ejecutar lo que declara un archivo** — no aplica, porque no hay ganchos.
- **Tradeoffs: el aviso solo** — es lo que se hizo. Lo que más trabajo llevó fue no aconsejar bajar un proyecto
  ajeno: la revisión encontró cinco formas de que el aviso lo hiciera. La carpeta con `_` delante, el nombre entre
  comillas o con un comentario, el que sale de una variable, el `name:` del compose y un nombre que Compose rechaza.
  Todas quedan con su prueba, contrastadas con Docker Compose 2.29.2 y su documentación: docs.docker.com, «Specify a
  project name».
- **Tradeoffs: medirlo pide Docker** — el aviso se probó sin Docker. Que el proyecto lo separa `COMPOSE_PROJECT_NAME`
  lo verificó la revisión con `docker compose config`.

Lo que se corrió:

- Línea de base, en «Reproducción»: el retiro en seco hablaba sólo de git.
- Las pruebas del 544 en `test/wiring/line-env.test.js`, en rojo contra HEAD; el antes y el después del retiro en seco,
  en `repro-543-after.log`.
- 13 mutaciones en una copia, las 13 rojas y la copia sin mutar verde. Las que sobrevivieron en el camino sumaron su
  caso: el `.env` copiado a mano con el nombre del original.
- `npm run ci` con los archivos nuevos stageados: 1898 de 1898, exit 0.

**Sin probar:** un retiro con contenedores levantados de verdad, porque el banco no corre Docker; el aviso no los
baja, así que lo que se mide es el texto. Que el aviso acierte cuando el proyecto depende de un `name:` del compose: ahí
dice que no se sabe, a propósito. La última revisión dejó tres imprecisiones que no aconsejan bajar el proyecto del
checkout de siempre: un nombre con mayúsculas, que Compose rechaza, se toma en minúsculas como válido; un `name:` en
`compose.override.yaml` o en un archivo de `COMPOSE_FILE` no se ve; y un `COMPOSE_PROJECT_NAME` exportado en la shell
le gana al `.env` y no se puede leer desde acá.

### Lista de cierre

1. hecho: la reproducción de «Reproducción», con el retiro en seco de antes.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas del 544 en rojo contra HEAD y en verde después.
4. hecho: 13 mutaciones en una copia, las 13 rojas; las que sobrevivieron en el camino sumaron su caso.
5. no aplica: agrega un aviso y no quita nada del retiro.
6. hecho: banco sin modelo con la CLI real; se midió que el retiro en seco nombra el proyecto y los `.env*`, y que no aconseja bajar el del checkout de siempre.
7. no aplica: no depende de un modelo ni de un runner; Docker queda en «Sin probar».
8. hecho: las mutaciones, el banco y la puerta corrieron sobre la versión final.
9. hecho: los dos lados de cada comparación (original y árbol) en cada forma de nombrar el proyecto, y el retiro antes y después de `--apply`.
10. hecho: dependía la salida de `ops lines join`, que se probó en seco y aplicada; `teamwork.md` lo dice.
11. hecho: cuatro pasadas de revisión independiente sobre el 543 y el 544. Las tres primeras hallaron formas de aconsejar bajar un proyecto ajeno, arregladas; la última no halló nada que impida entregar.
12. hecho: pasada de comentarios sobre `leftBehind`, `leftNotes`, `projectOf` y el aviso de respaldos.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1898 de 1898, exit 0.
14. hecho: este cierre recorre el Fix propuesto, la Decisión y los Tradeoffs.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0, junto a la del 543.
