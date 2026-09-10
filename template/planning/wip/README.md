# El plan en vuelo

Un archivo por runner: `wip/<runner>.md` es el plan de quien lo escribió, y **no viaja por git**. Existe
para recuperar esa sesión si se corta, y nadie más puede retomarla — el árbol de trabajo es otro.

```markdown
---
task: slug
hito: "Hito slug — Título"
epic: 001
phase: Build
started: AAAA-MM-DD
service: ruta
acceptance: "criterio observable"
lane: full
---

## Plan aprobado
1. [ ] Paso verificable

## Decisiones tomadas
- (ninguna)

## Bloqueos
- (ninguno)
```

`lane:` viaja acá por la misma razón por la que existe en DONE: la línea del BACKLOG se borra al
cerrar, y una corrida que se reanuda arma la tarea desde este archivo. Sin el campo, el cierre de una
corrida reanudada escribe `sin clasificar` sobre una tarea que sí tenía carril.

Sin archivo, el runner está en IDLE: un clon nuevo no trae ninguno y eso no es un error.

## Por qué uno por runner y no uno solo

Con `mode: sidecar` hay un solo `planning/` por máquina, así que un archivo compartido lo escriben todos
los agentes que corren ahí: el segundo pisa el plan del primero, y `ops context` le entrega la tarea que
el primero está construyendo — con el plan ajeno adentro y diciéndole que está libre.

El nombre sale del id del runner, aplanado para poder ser un nombre de archivo. Queda largo y legible a
propósito: sirve para ver de quién es cada plan cuando algo quedó a medias.

## Qué mira cada comando

`ops context` honra **sólo el tuyo**, que es el único que te corresponde continuar, y `ops check` los
recorre todos — que cada plan apunte a una tarea que existe es una pregunta sobre la instancia, no sobre
quien pregunta.

## Volver al día siguiente

El plan sigue acá, el reclamo en `../claims/` y el árbol de trabajo donde lo dejaste. Lo único que hay
que reponer es el id: exportá el mismo `CAUCE_RUNNER` —`ops worktree` lo imprime— y `ops context` te
devuelve tu tarea donde la dejaste. Con otro id, tu propio reclamo se ve ajeno, y `ops claim` te lo dice
en vez de decidir por vos.
