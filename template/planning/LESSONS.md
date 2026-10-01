# Lecciones de lo que se corrige

Lo que la revisión de `autobuild` mandó a corregir queda en `done/`, con la regla que lo sostenía. Cuando
la misma regla se corrige en dos tareas o más, el cierre de la corrida la anota como lección en
`inbox/lecciones/`, sin promover, y deja acá su fila. `node tools/ops.js lessons planning` muestra lo mismo sin
esperar una corrida.

Una regla que se corrige una y otra vez existe y no se está cumpliendo de antemano: puede faltarle un
ejemplo, claridad o visibilidad. Si es clara y la revisión la hizo cumplir, el sistema funcionó, y la
lección se rechaza.

El estado lo cambia una persona, nunca el runner:

- `propuesta` — la anotó el cierre; no se vuelve a proponer.
- `aplicada` — se reforzó la regla.
- `rechazada` — se decidió que no hacía falta. Sólo vuelve a proponerse si aparece una tarea nueva que no
  estaba en la fila.

Las correcciones de criterio —las que no citan una regla— no se agrupan solas: el comando las lista para
que alguien vea si se repiten y merecen una regla nueva.

## Registro

| Regla | Estado | Tareas | Fecha |
|---|---|---|---|
