---
caso: 432
titulo: ops release frena por el runner y nombra al dueño, así que con el mismo dueño y otro id dice que la tarea es de quien la está soltando
estado: resuelto
resuelto-en: 0.114.0
prioridad: baja
version-detectada: 0.113.3
---

# 432 — `ops release` dice «es de <vos>» cuando lo que no coincide es el runner

**🟢 resuelto en 0.114.0** · detectado en 0.113.3 · prioridad **baja**. El rechazo es correcto; lo que confunde es el mensaje, y
manda a borrar a mano lo que se resuelve volviendo al id con que se tomó.

## Resumen

`release` (`engine/cli/claims.js:122-124`) frena cuando `taken.runner !== from`, y el mensaje nombra a
`taken.owner`: «`<tarea>` es de `<owner>`. Si se abandonó, borrá `<archivo>` a mano.». Cuando el dueño es el mismo
—la misma persona desde otro id, que es lo habitual en una máquina—, la frase dice que la tarea es de quien la está
soltando, y la salida que da es borrar el archivo. `claim`, en la misma situación (`:89-94`), distingue «la tenés vos
desde el runner X» y nombra el id.

## Reproducción

Banco `sidecar` (`node engine/cli/ops.js bench sidecar --force`), desde la instancia:

```bash
CAUCE_RUNNER=uno node tools/ops.js claim planning tarea-medida
CAUCE_RUNNER=dos node tools/ops.js release planning tarea-medida; echo "exit=$?"
```

## Síntoma

La reproducción de arriba, corrida en el banco:

```
✓ tarea-medida tomada por banco@cauce.local
tarea-medida es de banco@cauce.local. Si se abandonó, borrá claims/tarea-medida.md a mano.
exit=1
```

`banco@cauce.local` es el dueño de la sesión que corre `release`.

## Causa raíz

`engine/cli/claims.js:123`: el mensaje se armó para el dueño ajeno, y la condición compara runners.

## Fix propuesto

Con `taken.owner === me`, el mismo texto que `claim`: que la tomó desde el runner `<id>` y que se suelta con ese id
(`CAUCE_RUNNER=<id>`), y recién si nadie la retoma, borrar el archivo.

## Tradeoffs

- Ninguno de conducta: sólo cambia el texto del rechazo.

## Contexto de descubrimiento

Cierre del caso 429, 2026-10-21: midiendo qué ve una sesión de línea con un reclamo hecho antes de que su id llevara
la línea.

## Relacionados

- 429 (la migración de 0.114.0 deja reclamos con el id viejo, que es donde esto se ve).

## Cierre

**Resuelto en 0.114.0**, la versión todavía abierta del 429, a pedido del dueño el 2026-10-21 («vamos a terminar
todos los casos»).

`release` (`engine/cli/claims.js:122-142`) distingue ahora tres situaciones cuando el dueño es el mismo y el id no:

- **Otra sesión de la misma**: dice desde qué runner se tomó e imprime el comando que la suelta con ese id. Va **sin**
  `--line`, porque desde 0.114.0 la línea se le agrega a un `CAUCE_RUNNER` sin marca (caso 429).
- **La sesión de otra línea, o la principal**: la manda a soltarse desde ella (`con --line <línea>` o `sin --line`), y
  no le da su id.
- **Un id sin marca sobre una tarea de la línea**, que es lo que dejó un `CAUCE_RUNNER` fijado antes de 0.114.0: se
  trata como de esa línea y recibe el comando con su id, que es la salida de la migración del 429.

El caso, sección por sección:

- **Resumen.** El texto engañoso se fue para el mismo dueño. El de un dueño ajeno quedó como estaba, y ahora una
  aserción lo fija.
- **Fix propuesto**: se hizo distinto en dos cosas. No ofrece borrar a mano: con el comando impreso no hace falta, y
  borrar es la salida de cuando el dueño es otro. Y no ofrece el id cuando la tarea es de otra sesión.
- **Tradeoffs.** Decía «ninguno de conducta», y había uno. La primera versión del arreglo imprimía el id para
  cualquier reclamo propio. `npm run ci` lo atrapó en `test/planning/lines.test.js` («la sesión dice su línea con
  --line…»): ahí la principal, al pedir soltar la tarea de una línea, recibía el comando con el id de la línea, y eso
  salta la separación que las líneas existen para sostener. De ahí salieron las otras dos ramas. El rechazo sigue
  saliendo en 1 en todas.
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- Las aserciones nuevas, vistas en rojo antes del arreglo. En `test/planning/claims.test.js` («tu propio reclamo desde
  otro runner se reconoce…»): `actual: 'dashboard es de ana@acme.com. Si se abandonó, borrá claims/dashboard.md a
  mano.'`. En `test/planning/lines.test.js` (misma prueba de arriba): la de la principal y la de la línea pidiendo lo
  de la otra, y la migración, que corre el comando que imprime el mensaje y suelta.
- Cuatro mutaciones en una copia fuera del árbol, con la copia en verde antes:
  - sin la rama del mismo dueño, rojo en `claims.test.js:339` y `lines.test.js:383`;
  - con todo tomado como del mismo dueño, rojo en `claims.test.js:69`;
  - sin mandar a la otra sesión, rojo en `lines.test.js:383`;
  - con el id sin marca tomado como de la principal, rojo en `lines.test.js:400`.
- En `ops bench sidecar`, los cuatro caminos:
  - mismo dueño desde otro id: el mensaje imprime `CAUCE_RUNNER=uno node tools/ops.js release planning tarea-medida`
    con `exit=1`, y ese comando suelta con `exit=0`;
  - la línea pidiendo la de la principal: «la tomó la sesión principal: se suelta desde ella, sin --line.»;
  - la principal pidiendo la de la línea: «la tomó la sesión de la línea pagos: se suelta desde ella, con --line
    pagos.», y con `--line pagos` suelta;
  - la migración: un reclamo `runner: acme` sobre `t-pagos` recibe `CAUCE_RUNNER=acme …`, que suelta.

**Lo que encontró la revisión del conjunto** (`/code-review high` sobre la rama). El comando que imprime el rechazo
ponía el id sin comillas, y un id es una ruta por default: con un espacio, pegarlo corría otro comando. Lo mismo
tenían, desde antes de este caso, los otros tres `export CAUCE_RUNNER=…` que imprime el CLI (`claim`, `worktree`,
`runners`) y el del banco. Los cinco citan ahora con `shellWord` (`engine/cli/io.js`). La prueba toma un reclamo
desde `/w/mis repos`, saca del rechazo `CAUCE_RUNNER='/w/mis repos'`, lo pega en `bash -c` con el `release` y
comprueba que suelta; sin citar, se pone roja, en una copia.

**La segunda pasada de revisión** encontró que la raíz del planning, que también va en esos comandos (`release`,
`claim` de `worktree`, `ops runners`), seguía sin citar. Ahora sale citada, y `shellWord` vive en `engine/core/files.js`
para que también lo use `sessionLine`. La prueba arma una instancia bajo una carpeta con un espacio, pega el comando
impreso **entero** en `bash -c` desde donde se corrió y comprueba que suelta. Sin citar la raíz, se pone roja, en una
copia.

**La revisión de la rama entera** encontró un borde en la rama nueva de `release`. Sin identidad de git, los dos
dueños son la cadena vacía, y la comparación daba «la tenés vos… soltala con su id» sobre el reclamo de otra sesión.
`context` decía «vos, desde otro runner» por lo mismo. Pasa con un reclamo escrito a mano y una sesión sin
`user.email`, porque `claim` no toma nada sin identidad. Ahora un dueño vacío no es nadie, en los dos comandos. Lo
prueba «sin identidad, un reclamo sin dueño no se toma por propio» (`test/planning/claims.test.js`), y cada una de las
dos comparaciones se pone roja con su mutación, en una copia.
