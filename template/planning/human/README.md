# Acciones humanas

Un archivo por cosa que sólo puede hacer una persona: una credencial, una cuenta, un permiso, una decisión
de negocio, un gasto. Lo escribe el runner cuando una tarea no puede seguir sin eso, y mientras diga
`pendiente` esa tarea no se toma.

```markdown
---
task: validar-stock
status: pendiente
origin: Ready
---

Crear la cuenta en el proveedor y dejar el token en `.env`. Se desbloquea cuando `ops check` pasa.
```

- **`task` es lo que el bloqueo detiene**, y es la clave con la que el motor bloquea: el slug de la tarea,
  solo. Cuando el bloqueo no es de una tarea —una épica, un recorrido, toda la cola— va eso, y no frena a
  ninguna tarea en particular: queda a la vista para que alguien lo resuelva.
- **`status` es `pendiente` o `resuelta`**, y detrás puede ir la fecha: `resuelta 2026-10-09`. Cualquier otra
  cosa —otra palabra, el campo escrito dos veces— deja la fila abierta, y `check` la rechaza.
- **Se resuelve cambiando `status`**, y commiteando ese cambio: `check` avisa de una fila que figura resuelta
  sin que ningún commit lo diga.
- **El nombre del archivo es libre y único**, termina en `.md` y va directo en esta carpeta: otra extensión
  o una subcarpeta no se leen, y `check` lo dice. Para una tarea, su slug; si esa tarea ya tuvo un bloqueo y
  su archivo sigue acá, el nuevo lleva `-2` y el anterior no se toca. Varias filas pueden hablar de la misma
  épica, cada una en su archivo.
- **Lo que el motor lee es el frontmatter**, sin sangría. Lo que diga el cuerpo —también un «status:
  resuelta» en las instrucciones— no cambia el estado.

```bash
node tools/ops.js human planning            # la tabla entera, pendientes primero
node tools/ops.js archive planning human-actions
```

`archive` mueve las resueltas a `human/done/`, enteras: dejan de listarse y siguen ahí para leerlas.

## Por qué un archivo por fila

Era una sola tabla, `HUMAN_ACTIONS.md`, que escribían todas las líneas de trabajo. Para que dos líneas que
registraban un bloqueo no chocaran al juntarse, git la fusiona por unión — y la unión concatena, no decide.
Cuando una línea resolvía una fila mientras la otra registraba la suya, al juntarse quedaban las dos
versiones de la fila resuelta, y la que decía `pendiente` volvía a bloquear su tarea. Sin conflicto y sin
aviso: una decisión tomada, deshecha por una fusión.

Con un archivo por fila, resolver es editar un archivo que la otra línea no toca. Y si dos personas editan
la misma fila, git lo marca: ahí el conflicto es la respuesta correcta.

## La tabla de antes

`HUMAN_ACTIONS.md` se sigue leyendo, y sus filas bloquean igual. No hace falta mudarlas: se resuelven donde
están y se archivan con el mismo comando. Lo nuevo va acá.
