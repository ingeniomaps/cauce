# Checkpoints de hito

Un archivo por hito terminado que espera la revisión de una persona, con el slug del hito como nombre:
`checkpoints/alta-de-pedidos.md`. Lo escribe `autobuild` al cerrar el hito cuando el proyecto declara
`runner.humanCheckpointBetweenMilestones`, y mientras diga `pendiente` la corrida siguiente no arranca.

```markdown
---
status: pendiente
hito: alta-de-pedidos
line: admin
---

# Checkpoint: hito alta-de-pedidos
```

- **Se destraba cambiando `status` a `resuelta`**, no borrando el archivo: es el registro de qué se revisó.
- **`line` dice a quién frena.** El checkpoint de la línea `admin` frena a la sesión que lleva esa línea y a
  ninguna otra; `line:` sin valor es el de la principal. Un archivo que no trae el campo frena a todas.
- **El archivo se llama como su `hito`.** `check` lo exige, junto con el `status`.
- **Lo que el motor lee es el frontmatter.** Un `status: resuelta` escrito más abajo, en las instrucciones, no
  destraba nada. Y un `line` que no es un nombre de línea frena a todas: ante la duda, frena.
- **La línea la dice la sesión.** Una sesión está en la línea `admin` cuando la lleva —`/autobuild admin`,
  `--line admin`—. En una línea de antes de 0.111.0 la línea es la rama del árbol: si cambiás de rama ahí, deja
  de ver su checkpoint como propio.

`node tools/ops.js context planning` dice si algo te frena y nombra el archivo.

## Por qué un archivo por hito

Era un solo `AWAITING_REVIEW.md` para toda la instancia, y con dos líneas de trabajo fallaba de dos formas.
Una línea que traía la rama de la otra quedaba frenada por un hito que no era suyo. Y cuando las dos habían
cerrado un hito, git juntaba las dos ediciones del mismo archivo sin avisar: el `resuelta` de una quedaba
escrito sobre el checkpoint de la otra, que nadie había revisado.

Con un archivo por hito, dos líneas no escriben nunca el mismo, y juntar sus ramas no cambia el estado de
ninguno.

## Parar toda la instancia

`planning/AWAITING_REVIEW.md` se sigue leyendo y frena a todas las líneas mientras no diga `status: resuelta`.
Es el que tienen las instancias anteriores a esta carpeta, y es la forma de detener todo a propósito: se
escribe a mano, con `status: pendiente` y qué hay que revisar.
