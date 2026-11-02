---
caso: 463
titulo: Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse
estado: aplazado
reabrir-si: una instancia cuenta una tarea reconstruida porque se cerró con otro slug
prioridad: baja
version-detectada: 0.117.2
---

# 463 — Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse

**⏸ aplazado** · detectado en 0.117.2 · prioridad **baja**: R25 lo describe y nada lo comprueba, pero sólo se paga
cerrando a mano con otro nombre, y no hay ningún incidente registrado. Se aplazó el 2026-10-31; lo reabre lo que dice
`reabrir-si`.

## Resumen

R25 dice que con el nombre cambiado «la puerta pasa en verde», y es literal: una entrada de `done/` con un slug que nadie
reclamó ni está en la cola no produce nada en `ops check`, y la tarea original se sigue ofreciendo.

## Reproducción

```bash
B=$(node engine/cli/ops.js bench tarea --force)
cd "$B" && export CAUCE_RUNNER="$PWD"
cat > planning/done/renombrada.md <<'E'
- [x] **renombrada** — Otra cosa
  acept: conducta observable
  fecha: 2026-10-31
  done: se construyó y `make test` salió 0
  qa: observado por el camino real
  tests: A → make test
  commit: abc1234 feat: renombrada
E
node <cauce>/engine/cli/ops.js check planning
node <cauce>/engine/cli/ops.js release planning tarea-medida
node <cauce>/engine/cli/ops.js context planning --json
```

## Síntoma

Salida real, 0.117.2, 2026-10-31. `check` sale 0 y sus avisos hablan del formato de la entrada, no de su origen:

```
⚠ done/renombrada.md renombrada: el commit abc1234 no está en su repositorio; …
✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 1 terminada(s)
✓ tarea-medida soltada; volvió a la cola
```

Y `context` sigue entregando `{"task":{"slug":"tarea-medida",…`.

## Causa raíz

`validateState` (`engine/planning/contracts.js:130-137`) arma el conjunto de slugs de la cola y sólo reporta los duplicados
de DONE. `warnings` (`engine/planning/claims.js:133-137`) cruza en el otro sentido: un reclamo cuyo slug ya está en DONE.
Y R25 (`template/planning/rules/system/process.md:89`) describe el efecto sin nombrar qué lo comprueba.

**Lo que hace difícil comprobarlo:** una entrada de DONE cuyo slug no está en la cola es el estado normal de toda tarea
cerrada, porque estar en las dos es un error (`engine/planning/contracts.js:225`). Y el reclamo se suelta. Mirando el
estado no queda nada que distinga «salió de la cola» de «nunca estuvo».

## Fix propuesto

Esta revisión descarta lo que el caso proponía antes, que `check` avisara de una entrada que no pasó por un reclamo ni
por la cola: con el estado solo no se puede saber, por lo de arriba. Quedan dos formas, y ninguna se probó:

1. **Sellar el origen**: `ops claim` deja un rastro que la entrada de DONE cita. Pide un campo más, y sólo cubre lo que
   pasó por un reclamo.
2. **Mirar la historia**: `check` compara con `git log` si el commit que agregó la entrada sacó su slug de la cola. No
   escribe nada, pero `check` pasa a depender de la historia, y falla con un clon superficial.

**Decidido el 2026-10-31: se aplaza.** Ninguna de las dos formas se paga con el daño medido hasta hoy.

## Tradeoffs

- Las bitácoras viejas no tienen rastro, así que cualquiera de las dos rige desde una fecha.
- El alias de R25 (`antes: <slug>`) es para que lo lea una persona: `engine/planning/` no lo interpreta (`grep -rn
  "antes:" engine/planning` sólo da un comentario de `parser.js:46`). Si un aviso lo acepta como salida, hay que enseñarle
  al parser a leerlo.
- `automatization/workflows/autobuild.js:43` arma la ruta de `done/` con el slug de la tarea, así que el recorrido no
  parece exponerlo. Eso se leyó en el fuente y no se corrió un autobuild para confirmarlo.

## Contexto de descubrimiento

Una entrada de deuda de una instancia, revisada entre releases. Allí los slugs se cierran por reclamo y no se vio el
defecto: la medición es de la comprobación ausente, no de un incidente.

## Relacionados

Caso 376 y caso 385: partir una tarea en Decompose, resueltos; no cubren el cierre con otro slug.
