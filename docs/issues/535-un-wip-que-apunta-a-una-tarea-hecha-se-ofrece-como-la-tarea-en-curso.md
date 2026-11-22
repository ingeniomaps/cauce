---
caso: 535
titulo: un WIP que apunta a una tarea ya en done/ pasa `check` y `ops context` la ofrece como la tarea en curso
estado: abierto
prioridad: media
version-detectada: 0.123.1
---

# 535 — un WIP que apunta a una tarea ya en done/ pasa `check` y `ops context` la ofrece como la tarea en curso

**🔴 abierto** · detectado en 0.123.1 · prioridad **media**: el costo es una vuelta perdida o reconstruir lo hecho. No
hay incidente medido por este camino; el del 463, que llega al mismo lugar por otro, costó 594k tokens en una instancia.

## Resumen

Si una sesión se corta entre escribir `done/<slug>.md` y dejar el WIP en IDLE (paso 13 de Done), queda un WIP activo
que apunta a una tarea cerrada. `PROTOCOL.md:72` lo prevé en prosa: «Si WIP apunta a una tarea ya en DONE y fuera de
BACKLOG, reparar el cierre dejando WIP en IDLE». Pero `check` no lo avisa, y `ops context` presenta esa tarea como la
de la sesión y le sugiere `ops claim`, que después la rechaza.

## Reproducción

En un banco con `done/alta-de-cliente.md` escrito y la tarea fuera de la cola:

```bash
cat > planning/wip/banco.md <<'EOF'
---
task: alta-de-cliente
epic: 001
phase: Build
started: 2026-11-20
service: api
acceptance: "el alta rechaza un duplicado"
lane: lite
---

## Plan aprobado
1. [x] Validar duplicado
2. [ ] Correr la suite
EOF
node tools/ops.js check planning; echo "exit=$?"
CAUCE_RUNNER=banco node tools/ops.js context planning
CAUCE_RUNNER=banco node tools/ops.js claim planning alta-de-cliente; echo "exit=$?"
```

## Síntoma

```
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)
exit=0
TASK   alta-de-cliente [lite]  service: api
WIP    Build · 1✓/1○
CLAIM  libre — tomala con `ops claim <planning> alta-de-cliente`
…
alta-de-cliente no está en BACKLOG: sólo se toma trabajo ya promovido.
exit=2
```

`context` dice qué hacer y `claim` se niega a hacerlo. Es la misma contradicción que el comentario de
`engine/cli/planning.js:184-186` dice haber cerrado para los reclamos.

## Causa raíz

- `engine/planning/contracts.js:231-235`: el WIP sólo falla si su tarea no está **ni** en BACKLOG **ni** en DONE. Estar
  en DONE la da por buena.
- `engine/cli/planning.js:182`: `context` toma el WIP propio sin mirar si su tarea está en DONE. Tres líneas más abajo,
  `:187`, los reclamos sí se filtran (`!state.done.set.has(one.slug)`); el WIP quedó afuera de ese filtro.

## Fix propuesto

- `check`: aviso `wip/<runner>.md: <slug> ya está en done/; el cierre quedó a medias — dejá el WIP en status: IDLE`.
  Aviso y no error, porque el WIP no viaja por git y lo que se arregla es local.
- `context`: con el WIP apuntando a una tarea hecha, no ofrecerla. Decir que el cierre quedó a medias y que lo que
  sigue es el paso 4 de Triage, en vez de sugerir `claim`.

La reparación es escribir `status: IDLE` (R28: el estado lo dice el contenido), nunca borrar el archivo.

## Tradeoffs

- Que el WIP rancio se repare solo —que `context` lo deje en IDLE— sería más cómodo y es una escritura que nadie pidió
  sobre el estado de una sesión. Queda en avisar y decir qué hacer.
- `/autobuild` no lee el WIP por su lado: toma tarea y WIP de `ops context --json`
  (`automatization/workflows/autobuild.js:963-968`), y con este estado recibe
  `{"task":"alta-de-cliente","wip":{"phase":"Build","complete":1,"pending":1},"claimed":false}`. O sea que hoy la
  retomaría como reanudación (`autobuild.js:1434`, `resumedFromWip`) sobre una tarea cerrada. Arreglar `context` lo cubre,
  y la prueba de autobuild tiene que mirar que no la retome, no sólo que `context` cambie el texto.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que escribió su propio aviso en `check` («Triage la va a
retomar y reconstruir») después de cerrar tareas fuera del recorrido.

## Relacionados

- 463 (aplazado): cerrar una tarea con otro slug hace que la cola la vuelva a ofrecer; mismo costo por otro camino.
- 529: una épica `open` terminada que no pide cerrar; otra mitad de cierre que `check` no ve.
