---
caso: 463
titulo: Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse
estado: abierto
prioridad: media
version-detectada: 0.117.2
---

# 463 — Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse

**🔴 abierto** · detectado en 0.117.2 · prioridad **media**: reabierto el 2026-11-21 porque se cumplió su `reabrir-si`.
Una instancia registró una corrida de 594k tokens que tomó de la cola una tarea ya construida y cerrada con otro slug.
Se aplazó el 2026-10-31 diciendo que no había incidente; el incidente ya existía y no se conocía.

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
  fecha: 2026-11-21
  done: se construyó y `make test` salió 0
  qa: observado por el camino real
  tests: A → make test
  commit: n/a — banco de medición
E
node <cauce>/engine/cli/ops.js check planning
node <cauce>/engine/cli/ops.js release planning tarea-medida
node <cauce>/engine/cli/ops.js context planning --json
```

## Síntoma

Salida real, 0.123.1, 2026-11-21. `check` sale 0 y sus avisos hablan del formato de la entrada, no de su origen:

```
⚠ planning/done: 1 entrada(s) sin lane:, así que no se puede comprobar sobre el registro que la ceremonia que recibieron fue la que su superficie pedía (OPS-006)
⚠ planning/done: 1 entrada(s) sin review:, que es la dimensión con la que OPS-006 dice que se mide si el carril elegido fue el correcto
✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 1 terminada(s)
exit=0
✓ tarea-medida soltada; volvió a la cola
{"task":"tarea-medida"}
```

En 0.117.2 (2026-10-31) daba lo mismo, con un aviso de commit inexistente en vez de los de `lane:` y `review:`.

## Causa raíz

`validateState` (`engine/planning/contracts.js:130-137`) arma el conjunto de slugs de la cola y sólo reporta los duplicados
de DONE. `warnings` (`engine/planning/claims.js:133-137`) cruza en el otro sentido: un reclamo cuyo slug ya está en DONE.
Y R25 (`template/planning/rules/system/process.md:89`) describe el efecto sin nombrar qué lo comprueba.

**Lo que hace difícil comprobarlo:** una entrada de DONE cuyo slug no está en la cola es el estado normal de toda tarea
cerrada, porque estar en las dos es un error (`engine/planning/contracts.js:225`). Y el reclamo se suelta. Mirando el
estado no queda nada que distinga «salió de la cola» de «nunca estuvo».

**Y el recorrido tampoco lo comprueba.** Done de `/autobuild` le pide al agente que escriba `done/<slug>.md` con el slug
de la tarea (`automatization/workflows/autobuild.js:2490`), pero después no mira que esa tarea haya quedado en `done/` y
fuera de la cola: el cierre corre `check` (`autobuild.js:2615-2620`), que pasa en verde por lo de arriba. El nombre del
archivo lo pone el pedido; el slug que cuenta es el de la viñeta, y ése lo escribe el agente.

## Fix propuesto

Esta revisión descartó el 2026-10-31 que `check` avisara de una entrada que no pasó por un reclamo ni por la cola: con
el estado solo no se puede saber. Hay cuatro formas. La 3 y la 4 son nuevas de esta reapertura:

1. **Sellar el origen**: `ops claim` deja un rastro que la entrada de DONE cita. Pide un campo más, y sólo cubre lo que
   pasó por un reclamo.
2. **Mirar la historia**: `check` compara con `git log` si el commit que agregó la entrada sacó su slug de la cola. No
   escribe nada, pero `check` pasa a depender de la historia, y falla con un clon superficial.
3. **Parecido de slugs** (lo que construyó la instancia): `check` avisa cuando un slug en cola se parece a uno en DONE
   del mismo servicio. Cuenta palabras compartidas (al menos dos y la mitad de las del más corto), toma como iguales las
   que comparten un prefijo de cinco letras y descarta las que el servicio repite en cinco o más slugs cerrados. Una
   marca `(no-dup: slug)` en la línea calla un par ya revisado. Es heurística y sólo avisa; la instancia la usa desde
   2026-10-30, y bajó de 3 avisos a 0 en su árbol después de descontar las palabras comunes.
4. **Comprobar el cierre donde ocurre**: el que cierra sabe qué tarea tomó. Done de autobuild —y el `ops done <tarea>`
   del paso 3 del plan— comprueba al terminar que `<slug>` quedó en `done/` y fuera de la cola, y frena si no. Es
   determinista y no adivina nada, pero cubre sólo los cierres que pasan por esas dos vías, no el manual.

**Recomendación**: la 4 primero, porque es exacta y cubre el camino del incidente (un cierre del recorrido). Si después
de eso aparece un cierre manual con otro nombre, la 3 como aviso. La 1 y la 2 cuestan más de lo que agregan sobre la 4.
**Decide la persona**: la 4 cambia lo que hace Done de autobuild.

## Tradeoffs

- Las bitácoras viejas no tienen rastro, así que la 1 y la 2 rigen desde una fecha.
- El alias de R25 (`antes: <slug>`) es para que lo lea una persona: `engine/planning/` no lo interpreta (`grep -rn
  "antes:" engine/planning` sólo da un comentario de `parser.js:46`). Si un aviso lo acepta como salida, hay que enseñarle
  al parser a leerlo.
- La 3 está calibrada en español: descarta artículos y preposiciones con una lista fija. Esa lista no decide un permiso,
  así que no choca con «un guard no decide con una lista de palabras permitidas», pero en un repo en otro idioma da
  más ruido.
- La 4 frena un cierre ya construido. Tiene que decir qué falta («`<slug>` sigue en la cola» o «no hay entrada con ese
  slug») para que la reparación sea mecánica, igual que el `closing-repair` que ya existe.

## Contexto de descubrimiento

Una entrada de deuda de una instancia, revisada entre releases. Allí los slugs se cierran por reclamo y no se vio el
defecto: la medición fue de la comprobación ausente, no de un incidente.

**Reapertura, 2026-11-21.** Auditoría de otra instancia sidecar real. Su historial de reglas cuenta el incidente del
2026-08-28: Decompose partió una tarea en cuatro subtareas y Done cerró dos con otros nombres. Una tercera se cerró
dentro de la revisión de otra tarea, sin entrada propia. Quedaron tres duplicadas en la cola, y la corrida siguiente
tomó una, gastó **594k tokens** en Triage, Pick, Ready y Decompose, y paró para reportar que ya estaba construida. El
incidente es anterior a los casos 376 (0.108.0) y 385 (0.109.0), que arreglaron cómo se escriben las partes al partir,
pero ninguno de los dos toca cómo se cierra una: la reproducción de arriba, sobre 0.123.1, lo confirma.

## Relacionados

- 376 y 385: partir una tarea en Decompose, resueltos; no cubren el cierre con otro slug.
- 535: un WIP que apunta a una tarea hecha se ofrece como la tarea en curso; mismo costo por otro camino.
- Paso 3 del plan de la auditoría (`ops done <tarea>`): es donde la forma 4 cubre los cierres fuera de autobuild.
