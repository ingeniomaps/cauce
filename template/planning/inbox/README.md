# Entradas del INBOX, una por archivo

Lo que los recorridos anotan en el INBOX va acá, una entrada por archivo:
`inbox/<sección>/<nombre-de-la-entrada>.md`, con la entrada como única línea, igual que en `INBOX.md`:

```markdown
- **slug-del-item** — Qué es, y qué se decide o se resuelve con esto.
```

Las secciones son las de `INBOX.md`, en minúsculas: `deuda/`, `ideas/`, `propuestas/` y `lecciones/`.
`ops tree` y `check` cuentan las dos cosas juntas —`INBOX.md` primero, después estas carpetas—, así que
escribir a mano en `INBOX.md` sigue valiendo.

Por qué un archivo y no una línea más: dos líneas de trabajo en paralelo que anotan en la misma sección
de `INBOX.md` escriben la misma zona del mismo archivo, y al juntarlas git choca. Dos archivos distintos
no chocan nunca. El costo es que leer una sección pide abrir la carpeta; promover sigue siendo lo mismo:
una persona lo decide, y borra el archivo cuando ya se promovió o se descartó.

`check` avisa —nunca falla— si una carpeta no es una sección o si un archivo no se llama como su
entrada: los dos no se cuentan donde corresponde, y nada más lo diría.
