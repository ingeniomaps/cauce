---
caso: 544
titulo: una línea no tiene dónde declarar qué arma y qué desarma de su entorno, y retirarla deja contenedores, volúmenes y bases
estado: abierto
prioridad: baja
version-detectada: 0.124.0
---

# 544 — una línea no tiene dónde declarar qué arma y qué desarma de su entorno, y retirarla deja contenedores, volúmenes y bases

**🔴 abierto** · detectado en 0.124.0 · prioridad **baja**: el costo es disco, memoria y una base de desarrollo que una
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
