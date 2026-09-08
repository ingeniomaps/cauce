# Evidencia de lo terminado

Un archivo por tarea cerrada, con el slug de la tarea como nombre: `alta-de-cliente.md` es lo que esa
tarea entregó y con qué se comprueba.

```markdown
- [x] **alta-de-cliente** (epic: 001) — Alta de cliente
  acept: el alta rechaza un duplicado
  fecha: 2026-09-08
  done: cambios y comandos de verificación con exit codes
  qa: comportamiento observado por el camino real
  tests: C1 → nombre de prueba o comando; C2 → nombre de prueba o comando
  decisions: decisión no obvia [fuente: ruta/archivo] o [supuesto: motivo verificable]
  commit: abc1234 feat(scope): subject (repo@branch)
```

El contrato completo de esos campos está en `../PROTOCOL.md`; acá va por qué el archivo es uno por tarea.

## Por qué uno por tarea

Cerrar es lo que más se hace, y mientras la evidencia se acumulaba en un archivo compartido, cerrar era
agregarle una entrada a algo que otro también estaba tocando. Con un archivo por tarea, **dos personas
—o dos agentes— que cierran a la vez escriben archivos distintos**: no hay conflicto que resolver ni
regla de merge que aplicar.

El nombre del archivo es una conveniencia; lo que identifica la tarea es el slug de la viñeta. Renombrar
el archivo no cambia de qué tarea habla, y cerrar dos veces la misma sigue siendo un error que `check`
rechaza, ahora entre archivos.

## Por qué la fecha

Mientras las entradas vivían en un archivo, «la última» era la última del archivo. Con archivos sueltos
el orden lo daría el listado del directorio, que es alfabético: la respuesta equivocada se leería igual
de bien que la correcta. Por eso `fecha:` es la del cierre y es obligatoria — y por eso `ops evidence`
sin `--task` puede contestar por la más reciente.

## Qué más vive acá

`human-actions.md`, con las filas resueltas que `ops archive human-actions` mueve desde
`../HUMAN_ACTIONS.md`. Es una tabla y no una entrada, así que el lector no la confunde con una tarea —
igual que a este README—.
