---
caso: 217
titulo: dos líneas de trabajo toman el mismo número de épica
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 217 — «El próximo NNN libre» se calcula sobre un árbol que no ve la otra línea

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: `check` lo detecta al traer la otra línea, así que no pasa en silencio. Lo que cuesta es
renumerar una épica que ya citan sus tareas (`(epic: NNN)`). Sube a media si una instancia con varias líneas lo
sufre más de una vez por mes.

## Resumen

`flow` escribe la épica «tomando el próximo NNN libre» de su árbol. Dos líneas en paralelo que crean una épica el
mismo día toman el mismo número, porque ninguna ve la de la otra hasta traerla. En `roax-ops` dos sesiones tomaron
la 055 el mismo día (caso 212).

## Reproducción

Instancia creada con `ops init`, dos épicas `epic-001-pagos.md` y `epic-001-envios.md` —lo que deja el merge de
dos líneas que tomaron el mismo número—, y `ops check planning`.

## Síntoma

```
✗ roadmap/epic-001-pagos.md: número de épica duplicado 001
```

Los nombres de archivo distintos hacen que git no choque: el duplicado entra en el merge y lo ve recién `check`.

## Causa raíz

`automatization/workflows/flow.js:505` — el prompt que escribe la épica pide «el próximo NNN libre» del árbol.

## Fix propuesto

Dos salidas, a decidir: un prefijo por línea en el número, o asignar el número definitivo al mergear a `main`
y trabajar antes con el slug. Es la misma carrera que `docs/issues/README.md` nombra para los casos (el 164).

## Tradeoffs

- Cualquiera de las dos cambia cómo se cita una épica, que hoy es por número.

## Contexto de descubrimiento

Partido del caso 212 al mejorarlo, el 2026-10-01.

## Relacionados

- 212, 216 — la misma situación: varias líneas sobre archivos compartidos.

## Cierre

Resuelto en 0.100.0 con una tercera salida que el caso no listaba. Manuel la eligió el 2026-10-01: se
mantiene el número y el choque se arregla con un comando.

- **Reproducción, antes de tocar nada:** en un banco `suelto`, con `epic-001-pagos.md`, `epic-001-envios.md` y
  una tarea de cada una en la cola, `check` salió 1 con `✗ roadmap/epic-001-pagos.md: número de épica
  duplicado 001`. El mensaje nombraba una sola de las dos —la que el orden alfabético dejaba segunda— y no
  decía cómo salir. La cita `automatization/workflows/flow.js:505` coincidía.
- **«Dos salidas, a decidir»** — se decidió que ninguna de las dos.
  - El prefijo por línea rompía el contrato `epic-NNN`, que leen 11 expresiones en 4 archivos del motor y
    las citas que ya escribió cada empresa. Además no cubría el caso real: en `roax-ops` fueron dos sesiones,
    no dos líneas de `ops line`.
  - Asignar el número al mergear pedía citar por slug hasta llegar a `main` y un paso automático que
    escribiera en la rama viva. Era demasiado para un caso de prioridad baja que nunca pasó en silencio.
- **Lo construido:** `ops renumber-epic <planning> <epic-NNN-slug> <NNN>` (`engine/planning/renumber.js`).
  - Decide antes de escribir y se niega sin tocar nada ante un número ocupado, un número mal formado, una
    épica que no existe o una que ya tiene ese número.
  - Mueve el archivo o la carpeta y cambia el frontmatter y el encabezado.
  - Reescribe el `(epic: NNN)` sólo de las tareas cuyas historias son de esa épica. Con el número repetido,
    las de la otra citan lo mismo y no se tocan.
  - Reescribe también las rutas `epic-NNN-slug` que la citan.
- **El mensaje de `check`** nombra las dos épicas y el comando, con el número libre siguiente, y dice cuál se
  mueve: la que todavía no llegó a la rama principal. Es la regla de `docs/issues/README.md` para el 164.
- **Tradeoff: «cualquiera de las dos cambia cómo se cita una épica»** — no aplica: la elegida no cambia nada
  de cómo se cita.
- **La causa raíz, el prompt de `flow` que toma «el próximo NNN libre»** — se deja como está. Ningún árbol
  puede ver la épica que la otra línea todavía no mergeó, así que mirar `origin` sólo achicaría la ventana.
  Lo que se arregló es lo caro, que era la salida.

Lo que el caso no preveía:

- **Una épica cerrada deja el roadmap** —el molde la archiva en `done/`— y su número no estaba en ninguna
  cuenta. El comando y el número que sugiere `check` cuentan también el `(epic: NNN)` de las tareas cerradas,
  y se niegan a reutilizarlo.
- **El molde no decía nada de la numeración.** `roadmap/README.md` tiene ahora una sección «Número» con la
  regla y el comando.

Prueba real:

- **En el mismo banco de la reproducción**, `renumber-epic planning epic-001-envios.md 002` salió 0:
  - Imprimió `✓ roadmap/epic-001-envios.md → roadmap/epic-002-envios.md` y reescribió `backlog/envios.md`.
  - La épica quedó con `epic: 002` y `# Épica 002`.
  - La tarea `cotizar-envio` pasó a `(epic: 002)` y la ruta citada a `epic-002-envios.md`.
  - `cobrar-tarjeta` siguió en `(epic: 001)`.
  - `check` salió 0: `✓ planning válido: 2 épica(s), 2 tarea(s) en cola`.
  - Pedirle volver a la 001 salió 1: `el número 001 ya lo tiene roadmap/epic-001-pagos.md: no se movió nada`.
- **Seis mutaciones en una copia, cada una en rojo por `test/planning/renumber-epic.test.js`:**
  - Reescribir las tareas de las dos épicas.
  - No reescribir las rutas citadas.
  - No comprobar el número ocupado.
  - No cambiar el encabezado.
  - Renombrar sin reescribir nada.
  - Que `check` no nombre la otra épica.
